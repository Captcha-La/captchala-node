import { ConfigurationError } from './errors.js';
import { apiFailure, isSuccess, networkFailure, send, type FetchLike, type RawResponse, type TransportConfig } from './http.js';
import {
  IssueResult,
  ModerationResult,
  ValidateResult,
  type Binding,
  type BindingMatch,
  type CaptchaArgs,
} from './results.js';
import { VERSION } from './version.js';

const API_URL = 'https://verify.captcha.la';
/** Backup service that verifies `offline_` tokens issued during a service disruption. */
const BACKUP_URL = 'https://fallbackapiv1.captchala.com';
const VALIDATE_URL = `${API_URL}/v1/validate`;
const BACKUP_VALIDATE_URL = `${BACKUP_URL}/api/validate`;

export const PREFIX_MAIN = 'pt_';
export const PREFIX_OFFLINE = 'offline_';
export const PREFIX_CLIENT = 'client_';
export const PREFIX_CLIENT_WEB = 'co_';
export const PREFIX_DEGRADED = 'dg_';

/** `error` for a client-only token presented while the API is reachable. */
export const ERROR_CLIENT_ONLY_REJECTED = 'client_only_rejected_api_reachable';
/** `error` for a client-only token when `rejectClientOnly` is set. */
export const ERROR_CLIENT_ONLY_POLICY = 'client_only_rejected_by_policy';

const PROBE_TIMEOUT_MS = 2000;
const REACHABLE_TTL_MS = 30_000;
const UNREACHABLE_TTL_MS = 5_000;

/** End-user identity. All optional; see the API reference "End-user identity". */
export interface IdentityFields {
  /** Your internal user ID (max 128 bytes). Echoed back by validate as `uid`. */
  bindUid?: string;
  /** Login name the user typed. */
  bindAccount?: string;
  /** E-mail address. */
  bindEmail?: string;
  /** Phone number with country code, e.g. `+8613800138000`. */
  bindPhone?: string;
  /** `login`, `register`, `sms`, `payment` or `default`. */
  scene?: string;
}

export interface ValidateOptions extends IdentityFields {
  /** End-user IP from your inbound request. Optional but recommended: used for additional risk checks. */
  clientIp?: string | null;
  /** Check without consuming the token. Default false. */
  keepToken?: boolean;
  /** Reject a token issued for another action (`action_mismatch`). Exact, case-sensitive. */
  expectedAction?: string;
  /**
   * Hostname (web) or package / bundle id (native) you expect. A list or a
   * comma-separated string; `*.example.com` matches any subdomain.
   * Mismatch -> `hostname_mismatch`.
   */
  expectedHostname?: string | string[];
  signal?: AbortSignal;
}

export interface IssueOptions extends IdentityFields {
  /** Bind the token to the end user's IP. See the API reference note on private relays. */
  bindIp?: string;
  /** Lifetime in seconds (server default 300, max 900). */
  ttl?: number;
  /** How many pass flows the token may be used for (server default 10). */
  maxUses?: number;
  /** Bind the token to a device id. */
  bindDeviceId?: string;
  /** Bind the token to a browser fingerprint. */
  bindFingerprint?: string;
  signal?: AbortSignal;
}

export interface ModerationOptions {
  /** End-user identifier, used for rate limiting. */
  userId?: string;
  signal?: AbortSignal;
}

/** One item of a multi-modal moderation request (OpenAI-compatible). */
export type ModerationItem =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export const textItem = (text: string): ModerationItem => ({ type: 'text', text });
export const imageUrlItem = (url: string): ModerationItem => ({ type: 'image_url', image_url: { url } });

export interface ClientOptions {
  /** App Key from the dashboard. Defaults to `process.env.CAPTCHALA_APP_KEY`. */
  appKey?: string;
  /** App Secret from the dashboard. Server-side only. Defaults to `process.env.CAPTCHALA_APP_SECRET`. */
  appSecret?: string;
  /** Per-attempt timeout in milliseconds. Default 5000. */
  timeoutMs?: number;
  /** Retries after the first attempt. Default 2. Set 0 to disable. */
  maxRetries?: number;
  /** Base delay for exponential backoff in milliseconds. Default 200. */
  retryBackoffMs?: number;
  /**
   * Always reject client-only tokens (`client_` / `co_`), even during an
   * outage. Use for actions that should fail closed (login, payment).
   */
  rejectClientOnly?: boolean;
  /** Custom fetch implementation (tests, proxies). Defaults to the global fetch. */
  fetch?: FetchLike;
  /** Extra headers sent with every request. */
  headers?: Record<string, string>;
}

type ProbeEntry = { reachable: boolean; until: number };
const probeCache = new Map<string, ProbeEntry>();
const probeInFlight = new Map<string, Promise<boolean>>();

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function parseCaptchaArgs(v: unknown): CaptchaArgs | null {
  const a = obj(v);
  if (!a) return null;
  return {
    platform: str(a['platform']),
    userIp: str(a['user_ip']),
    referer: str(a['referer']),
    pkg: str(a['pkg']),
    solvedAt: num(a['solved_at']),
    riskScore: num(a['risk_score']),
  };
}

function parseBinding(v: unknown): Binding | null {
  const b = obj(v);
  if (!b) return null;
  return {
    uid: str(b['uid']),
    account: str(b['account']),
    email: str(b['email']),
    phone: str(b['phone']),
    scene: str(b['scene']),
  };
}

function parseBindingMatch(v: unknown): BindingMatch | null {
  const m = obj(v);
  if (!m) return null;
  const out: Record<string, boolean> = {};
  for (const [k, val] of Object.entries(m)) if (typeof val === 'boolean') out[k] = val;
  return out as BindingMatch;
}

function identityBody(o: IdentityFields, body: Record<string, unknown>): void {
  if (o.bindUid) body['bind_uid'] = o.bindUid;
  if (o.bindAccount) body['bind_account'] = o.bindAccount;
  if (o.bindEmail) body['bind_email'] = o.bindEmail;
  if (o.bindPhone) body['bind_phone'] = o.bindPhone;
  if (o.scene) body['scene'] = o.scene;
}

/** Whether the token is a device-minted client-only placeholder (`client_` or `co_`). */
export function isClientOnlyToken(token: string): boolean {
  return token.startsWith(PREFIX_CLIENT) || token.startsWith(PREFIX_CLIENT_WEB);
}

/** Clear the shared reachability cache. Intended for tests. */
export function resetReachabilityCache(): void {
  probeCache.clear();
  probeInFlight.clear();
}

/**
 * CaptchaLa server-side client.
 *
 * ```ts
 * const captchala = new CaptchaLaClient({ appKey, appSecret });
 * const result = await captchala.validate(token, { clientIp, expectedAction: 'login' });
 * if (!result.valid) return res.status(400).json({ error: result.error });
 * ```
 */
export class CaptchaLaClient {
  readonly appKey: string;
  readonly rejectClientOnly: boolean;
  readonly #appSecret: string;
  readonly #transport: TransportConfig;

  constructor(options: ClientOptions = {}) {
    const env = typeof process !== 'undefined' ? process.env : {};
    const appKey = options.appKey ?? env['CAPTCHALA_APP_KEY'] ?? '';
    const appSecret = options.appSecret ?? env['CAPTCHALA_APP_SECRET'] ?? '';
    if (!appKey) throw new ConfigurationError('appKey is required (or set CAPTCHALA_APP_KEY)');
    if (!appSecret) throw new ConfigurationError('appSecret is required (or set CAPTCHALA_APP_SECRET)');
    const fetchImpl = options.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (typeof fetchImpl !== 'function') {
      throw new ConfigurationError('no global fetch available; use Node.js 18+ or pass options.fetch');
    }
    this.appKey = appKey;
    this.#appSecret = appSecret;
    this.rejectClientOnly = options.rejectClientOnly ?? false;
    this.#transport = {
      fetch: fetchImpl,
      timeoutMs: options.timeoutMs ?? 5000,
      maxRetries: Math.max(0, options.maxRetries ?? 2),
      retryBackoffMs: Math.max(0, options.retryBackoffMs ?? 200),
      userAgent: `captchala-node/${VERSION}`,
      headers: { ...options.headers, 'X-App-Key': appKey, 'X-App-Secret': appSecret },
    };
  }


  /**
   * Validate a pass token from the client SDK. Never throws for verification,
   * API or network failures: check `result.valid` and `result.error`.
   */
  async validate(token: string, options: ValidateOptions = {}): Promise<ValidateResult> {
    if (typeof token !== 'string' || token === '') {
      return new ValidateResult({ valid: false, error: 'empty_token' });
    }
    if (isClientOnlyToken(token)) return this.#validateClientOnly();

    const offline = token.startsWith(PREFIX_OFFLINE);
    const url = offline ? BACKUP_VALIDATE_URL : VALIDATE_URL;
    const body: Record<string, unknown> = { pass_token: token, keep_token: options.keepToken ?? false };
    if (options.clientIp) body['client_ip'] = options.clientIp;
    if (options.expectedAction) body['expected_action'] = options.expectedAction;
    if (options.expectedHostname && options.expectedHostname.length > 0) {
      body['expected_hostname'] = options.expectedHostname;
    }
    identityBody(options, body);

    let r: RawResponse;
    try {
      r = await send(this.#transport, url, body, { retryAmbiguous: true, signal: options.signal });
    } catch (e) {
      const f = networkFailure(e);
      return new ValidateResult({ valid: false, offline, ...f });
    }

    const data = obj(r.json?.['data']);
    if (isSuccess(r) && data) {
      if (data['valid'] === true || (data['valid'] === undefined && data['ok'] === true)) {
        const action = str(data['action']);
        const test = data['test'] === true;
        // The API enforces expected_action; this re-check is defence in depth.
        // Test keys ignore expected_action by design, so they are skipped.
        if (options.expectedAction && !test && action !== null && action !== options.expectedAction) {
          return new ValidateResult({ valid: false, offline, error: 'action_mismatch', action, raw: data, httpStatus: r.status });
        }
        const labels = Array.isArray(data['risk_labels'])
          ? (data['risk_labels'] as unknown[]).filter((x): x is string => typeof x === 'string')
          : [];
        return new ValidateResult({
          valid: true,
          offline,
          challengeId: str(data['challenge_id']),
          action,
          uid: str(data['uid']),
          hostname: str(data['hostname']),
          challengeTs: str(data['challenge_ts']),
          riskLevel: str(data['risk_level']),
          riskLabels: labels,
          captchaArgs: parseCaptchaArgs(data['captcha_args']),
          userIp: parseCaptchaArgs(data['captcha_args'])?.userIp ?? str(data['user_ip']),
          binding: parseBinding(data['binding']),
          bindingMatch: parseBindingMatch(data['binding_match']),
          test,
          raw: data,
          httpStatus: r.status,
        });
      }
      if (data['degraded'] === true) {
        return new ValidateResult({
          valid: false,
          offline,
          degraded: true,
          degradedReason: str(data['reason']) || 'quota_exhausted',
          error: str(data['error']) ?? 'degraded',
          raw: data,
          httpStatus: r.status,
        });
      }
      return new ValidateResult({
        valid: false,
        offline,
        error: str(data['error']) || 'unknown_error',
        test: data['test'] === true,
        raw: data,
        httpStatus: r.status,
      });
    }

    const f = apiFailure(r);
    return new ValidateResult({ valid: false, offline, ...f, raw: data });
  }

  /**
   * Issue a one-time `sct_` server token for `action`. Hand it to the client
   * SDK as `serverToken`.
   */
  async issueServerToken(action: string, options: IssueOptions = {}): Promise<IssueResult> {
    if (typeof action !== 'string' || action === '') {
      return new IssueResult({ ok: false, error: 'invalid_action', message: 'action is required' });
    }
    const body: Record<string, unknown> = { action };
    if (options.bindIp) body['bind_ip'] = options.bindIp;
    if (options.ttl !== undefined && options.ttl > 0) body['ttl'] = options.ttl;
    if (options.maxUses !== undefined && options.maxUses > 0) body['max_uses'] = options.maxUses;
    if (options.bindDeviceId) body['bind_device_id'] = options.bindDeviceId;
    if (options.bindFingerprint) body['bind_fingerprint'] = options.bindFingerprint;
    identityBody(options, body);

    let r: RawResponse;
    try {
      r = await send(this.#transport, `${API_URL}/v1/server/challenge/issue`, body, {
        retryAmbiguous: true,
        signal: options.signal,
      });
    } catch (e) {
      return new IssueResult({ ok: false, ...networkFailure(e) });
    }
    const data = obj(r.json?.['data']);
    const token = data ? str(data['server_token']) : null;
    if (isSuccess(r) && token) {
      return new IssueResult({
        ok: true,
        token,
        expiresIn: num(data?.['expires_in']),
        issuedAt: num(data?.['issued_at']),
        httpStatus: r.status,
      });
    }
    return new IssueResult({ ok: false, ...apiFailure(r) });
  }

  /** Multi-modal content moderation (text and image URLs, OpenAI-compatible items). */
  async moderationCheck(input: ModerationItem[], options: ModerationOptions = {}): Promise<ModerationResult> {
    if (!Array.isArray(input) || input.length === 0) {
      return new ModerationResult({ ok: false, error: 'empty_input', message: 'input is required' });
    }
    return this.#moderate('/v1/moderation/check', { input }, options);
  }

  /** Plain-text moderation. */
  async moderationText(text: string, options: ModerationOptions = {}): Promise<ModerationResult> {
    if (typeof text !== 'string' || text === '') {
      return new ModerationResult({ ok: false, error: 'empty_text', message: 'text is required' });
    }
    return this.#moderate('/v1/moderation/text', { text }, options);
  }

  async #moderate(path: string, payload: Record<string, unknown>, options: ModerationOptions) {
    // The moderation endpoints read the credentials from the body.
    const body: Record<string, unknown> = { app_key: this.appKey, app_secret: this.#appSecret, ...payload };
    if (options.userId) body['user_id'] = options.userId;
    let r: RawResponse;
    try {
      // Not retried after a timeout: the content may already be processing.
      r = await send(this.#transport, `${API_URL}${path}`, body, { retryAmbiguous: false, signal: options.signal });
    } catch (e) {
      return new ModerationResult({ ok: false, ...networkFailure(e) });
    }
    const data = obj(r.json?.['data']);
    if (isSuccess(r)) {
      const d = data ?? {};
      const categories: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(obj(d['categories']) ?? {})) if (typeof v === 'boolean') categories[k] = v;
      const scores: Record<string, number> = {};
      for (const [k, v] of Object.entries(obj(d['category_scores']) ?? {})) if (typeof v === 'number') scores[k] = v;
      return new ModerationResult({
        ok: true,
        flagged: d['flagged'] === true,
        categories,
        categoryScores: scores,
        contentType: str(d['content_type']),
        raw: d,
        httpStatus: r.status,
      });
    }
    return new ModerationResult({ ok: false, ...apiFailure(r) });
  }

  /**
   * Client-only placeholders are minted on the device only when both the API
   * and the backup service were unreachable. They carry no signature, so they
   * are accepted only if this server cannot reach either endpoint either.
   */
  async #validateClientOnly(): Promise<ValidateResult> {
    const base = { valid: false, offline: true, clientOnly: true };
    if (this.rejectClientOnly) {
      return new ValidateResult({
        ...base,
        error: ERROR_CLIENT_ONLY_POLICY,
        warning: 'Client-only token rejected: client-only tokens are disabled for this client',
      });
    }
    if (await this.#probe(VALIDATE_URL)) {
      return new ValidateResult({
        ...base,
        error: ERROR_CLIENT_ONLY_REJECTED,
        warning: 'Client-only token rejected: main API is reachable',
      });
    }
    if (await this.#probe(BACKUP_VALIDATE_URL)) {
      return new ValidateResult({
        ...base,
        error: ERROR_CLIENT_ONLY_REJECTED,
        warning: 'Client-only token rejected: backup API is reachable',
      });
    }
    return new ValidateResult({
      ...base,
      valid: true,
      warning: 'Client-only token accepted: CaptchaLa API unreachable, token cannot be verified server-side',
    });
  }

  /**
   * Any HTTP response within the probe timeout means reachable. Cached and
   * single-flight per URL. Probes deliberately ignore the caller's AbortSignal:
   * an aborted probe must never be mistaken for an outage.
   */
  async #probe(url: string): Promise<boolean> {
    const hit = probeCache.get(url);
    if (hit && hit.until > Date.now()) return hit.reachable;
    const pending = probeInFlight.get(url);
    if (pending) return pending;
    const p = (async () => {
      let reachable: boolean;
      try {
        await send(this.#transport, url, { pass_token: '', keep_token: true }, {
          retryAmbiguous: false,
          maxRetries: 0,
          timeoutMs: PROBE_TIMEOUT_MS,
        });
        reachable = true;
      } catch {
        reachable = false;
      }
      probeCache.set(url, { reachable, until: Date.now() + (reachable ? REACHABLE_TTL_MS : UNREACHABLE_TTL_MS) });
      return reachable;
    })();
    probeInFlight.set(url, p);
    try {
      return await p;
    } finally {
      probeInFlight.delete(url);
    }
  }
}

export { CaptchaLaClient as Client };
