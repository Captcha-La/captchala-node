import {
  APIError,
  AuthenticationError,
  CaptchaLaError,
  InvalidResponseError,
  NetworkError,
  RateLimitError,
  TimeoutError,
} from './errors.js';

/** Minimal fetch signature the client needs. Any WHATWG-compatible fetch works. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Upper bound for a response body we are willing to read. */
const MAX_RESPONSE_BYTES = 1 << 20;

/** Error codes in the response body that mean "bad credentials". */
const AUTH_CODES = new Set([
  'invalid_app_key',
  'invalid_app_secret',
  'invalid_secret',
  'missing_app_key',
  'missing_app_secret',
  'missing_credentials',
  'invalid_credentials',
]);

/** Error codes in the response body that mean "slow down". */
const RATE_CODES = new Set(['rate_limited', 'rate_limit_exceeded', 'qps_exceeded', 'too_many_failures']);

/** Low-level error codes that mean the connection was never established. */
const CONNECT_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
]);

export interface TransportConfig {
  fetch: FetchLike;
  timeoutMs: number;
  maxRetries: number;
  retryBackoffMs: number;
  userAgent: string;
  headers: Record<string, string>;
}

export interface RawResponse {
  status: number;
  headers: Headers;
  /** Decoded JSON object, or null when the body was not a JSON object. */
  json: Record<string, unknown> | null;
}

export interface SendOptions {
  /** Retry after a timeout / reset / 504, where the request may have reached the API. */
  retryAmbiguous: boolean;
  signal?: AbortSignal;
  /** Override the configured timeout (used by reachability probes). */
  timeoutMs?: number;
  /** Override the configured retry count. */
  maxRetries?: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function backoff(cfg: TransportConfig, attempt: number, retryAfterSec: number | null): number {
  if (retryAfterSec !== null && retryAfterSec > 0) return Math.min(retryAfterSec * 1000, 5000);
  const base = Math.min(cfg.retryBackoffMs * 2 ** attempt, 2000);
  // +/-25% jitter so many workers do not retry in lockstep.
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

function errCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur && typeof cur === 'object'; i++) {
    const c = (cur as { code?: unknown }).code;
    if (typeof c === 'string') return c;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

async function readCapped(res: Response): Promise<string> {
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_RESPONSE_BYTES) return '';
  return new TextDecoder().decode(buf);
}

async function attempt(
  cfg: TransportConfig,
  url: string,
  body: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<RawResponse> {
  if (signal?.aborted) throw new NetworkError('request aborted', { aborted: true, cause: signal.reason });
  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, timeoutMs);
  const onAbort = () => ac.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await cfg.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': cfg.userAgent, ...cfg.headers },
      body,
      signal: ac.signal,
      redirect: 'error',
    });
    const text = await readCapped(res);
    let json: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) json = parsed as Record<string, unknown>;
    } catch {
      json = null;
    }
    return { status: res.status, headers: res.headers, json };
  } catch (e) {
    if (timedOut) throw new TimeoutError(`request timed out after ${timeoutMs} ms`, { cause: e });
    if (signal?.aborted) throw new NetworkError('request aborted', { aborted: true, cause: e });
    const code = errCode(e);
    throw new NetworkError(`request failed${code ? ` (${code})` : ''}`, {
      cause: e,
      connectFailed: code !== undefined && CONNECT_CODES.has(code),
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function retryAfterOf(r: RawResponse): number | null {
  const fromBody = r.json?.['retry_after'];
  if (typeof fromBody === 'number' && Number.isFinite(fromBody)) return fromBody;
  const h = r.headers.get('retry-after');
  if (h && /^\d+$/.test(h.trim())) return Number(h.trim());
  return null;
}

function shouldRetryStatus(r: RawResponse, retryAmbiguous: boolean): boolean {
  if (r.json?.['retryable'] === false) return false;
  if (r.json?.['error'] === 'service_online') return false;
  if (r.status === 502 || r.status === 503) return true;
  return r.status === 504 && retryAmbiguous;
}

/**
 * POST a JSON body with retries. Resolves with any HTTP response (callers
 * interpret the envelope) and throws NetworkError / TimeoutError when no
 * response could be obtained.
 *
 * Retried: connection failures and HTTP 502 / 503 always; timeouts, resets
 * and HTTP 504 only when `retryAmbiguous` is set. Rate-limit answers (429)
 * are never retried.
 */
export async function send(
  cfg: TransportConfig,
  url: string,
  payload: unknown,
  opts: SendOptions,
): Promise<RawResponse> {
  const body = JSON.stringify(payload);
  const timeoutMs = opts.timeoutMs ?? cfg.timeoutMs;
  const maxRetries = opts.maxRetries ?? cfg.maxRetries;
  for (let i = 0; ; i++) {
    let r: RawResponse;
    try {
      r = await attempt(cfg, url, body, timeoutMs, opts.signal);
    } catch (e) {
      const retryable =
        e instanceof NetworkError && !e.aborted && i < maxRetries && (e.connectFailed || opts.retryAmbiguous);
      if (!retryable) throw e;
      await sleep(backoff(cfg, i, null));
      continue;
    }
    if (i < maxRetries && shouldRetryStatus(r, opts.retryAmbiguous)) {
      await sleep(backoff(cfg, i, retryAfterOf(r)));
      continue;
    }
    return r;
  }
}

/** Fields shared by all failure results. */
export interface Failure {
  error: string;
  message: string | null;
  httpStatus: number | null;
  retryAfter: number | null;
  retryable: boolean | null;
  cause: CaptchaLaError;
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v !== '' ? v : typeof v === 'number' ? String(v) : null;

/** Turn a non-success response into a failure description with a typed cause. */
export function apiFailure(r: RawResponse): Failure {
  const httpStatus = r.status;
  const retryAfter = retryAfterOf(r);
  if (r.json === null) {
    const code = httpStatus >= 200 && httpStatus <= 299 ? 'invalid_response' : `http_${httpStatus}`;
    return {
      error: code,
      message: null,
      httpStatus,
      retryAfter,
      retryable: null,
      cause: new InvalidResponseError(code, 'response was not a JSON object', { httpStatus, retryAfter }),
    };
  }
  const data = r.json['data'];
  const dataObj = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const message = str(r.json['msg']) ?? str(r.json['message']);
  const code =
    str(dataObj['error']) ??
    str(r.json['error']) ??
    message ??
    (httpStatus >= 200 && httpStatus <= 299 ? 'unknown_error' : `http_${httpStatus}`);
  const retryable = typeof r.json['retryable'] === 'boolean' ? (r.json['retryable'] as boolean) : null;
  const details = { httpStatus, retryAfter, retryable, body: r.json };
  let cause: APIError;
  if (AUTH_CODES.has(code)) cause = new AuthenticationError(code, message ?? undefined, details);
  else if (httpStatus === 429 || RATE_CODES.has(code)) cause = new RateLimitError(code, message ?? undefined, details);
  else cause = new APIError(code, message ?? undefined, details);
  return { error: code, message, httpStatus, retryAfter, retryable, cause };
}

export function networkFailure(e: unknown): Failure {
  const cause =
    e instanceof CaptchaLaError ? e : new NetworkError(e instanceof Error ? e.message : String(e), { cause: e });
  return {
    error: 'request_failed',
    message: cause.message,
    httpStatus: null,
    retryAfter: null,
    retryable: null,
    cause,
  };
}

/** True when the envelope reports success on a 2xx status. */
export function isSuccess(r: RawResponse): boolean {
  return r.status >= 200 && r.status <= 299 && r.json !== null && r.json['code'] === 0;
}
