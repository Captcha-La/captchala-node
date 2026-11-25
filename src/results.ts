import { CaptchaLaError, ValidationFailedError } from './errors.js';

/**
 * Solve-time context echoed back by validate. Informational only: use it for
 * logging or your own risk scoring, never as the pass/fail decision.
 */
export interface CaptchaArgs {
  /** `web` / `android` / `ios` / `flutter` / `windows` / ... */
  platform: string | null;
  /** End-user IP recorded when the challenge was solved. */
  userIp: string | null;
  /** Page URL the challenge was solved on (web). */
  referer: string | null;
  /** App package / bundle id (native). */
  pkg: string | null;
  /** Solve completion time, unix seconds. */
  solvedAt: number | null;
  /** Solve-time risk score, 0-100 (higher = riskier). */
  riskScore: number | null;
}

/** Identity bound when the server token was issued (`null` for fields not bound). */
export interface Binding {
  uid: string | null;
  account: string | null;
  email: string | null;
  phone: string | null;
  scene: string | null;
}

/** Per-field comparison of the identity bound at issue vs. the one sent at validate. */
export type BindingMatch = Partial<Record<'uid' | 'account' | 'email' | 'phone' | 'scene', boolean>> &
  Record<string, boolean>;

/** Failure metadata shared by all results. */
interface FailureMeta {
  /** HTTP status of the final response, or null when no response was received. */
  httpStatus?: number | null;
  /** Seconds to wait before retrying, when the API said so. */
  retryAfter?: number | null;
  /** Whether the API marked the failure as retryable later. */
  retryable?: boolean | null;
  /** Typed error for transport / API failures (undefined for plain verification failures). */
  cause?: CaptchaLaError;
}

export interface ValidateResultInit extends FailureMeta {
  valid: boolean;
  error?: string | null;
  warning?: string | null;
  offline?: boolean;
  clientOnly?: boolean;
  degraded?: boolean;
  degradedReason?: string | null;
  challengeId?: string | null;
  action?: string | null;
  uid?: string | null;
  hostname?: string | null;
  challengeTs?: string | null;
  riskLevel?: string | null;
  riskLabels?: string[];
  captchaArgs?: CaptchaArgs | null;
  userIp?: string | null;
  binding?: Binding | null;
  bindingMatch?: BindingMatch | null;
  test?: boolean;
  raw?: Record<string, unknown> | null;
}

/** Result of `validate()`. `valid` is the only field to gate on. */
export class ValidateResult {
  /** Whether the token passed verification. */
  readonly valid: boolean;
  /** Error code when `valid` is false, e.g. `token_expired`, `action_mismatch`, `request_failed`. */
  readonly error: string | null;
  /** Warning, e.g. for client-only tokens. */
  readonly warning: string | null;
  /** True for tokens verified through the backup service (`offline_`) or client-only tokens. */
  readonly offline: boolean;
  /** True for device-minted client-only tokens (`client_` / `co_`), which cannot be verified server-side. */
  readonly clientOnly: boolean;
  /**
   * True for a `dg_` token issued while the app's quota is exhausted. `valid` is
   * always false for these; whether to let the request through is your decision.
   */
  readonly degraded: boolean;
  /** Degradation cause, e.g. `quota_exhausted`. */
  readonly degradedReason: string | null;
  readonly challengeId: string | null;
  /** Business action the token was issued for. */
  readonly action: string | null;
  /** User ID bound via `bindUid` when the server token was issued. */
  readonly uid: string | null;
  /** Hostname (web) or package / bundle id (native) where the challenge was solved. */
  readonly hostname: string | null;
  /** Solve time, ISO 8601 UTC. */
  readonly challengeTs: string | null;
  /** Solve-time risk level: `low` / `medium` / `high` / `critical`. Informational. */
  readonly riskLevel: string | null;
  /** Coarse risk categories observed for the session. Informational; new values may appear. */
  readonly riskLabels: string[];
  /** Solve-context echo. Informational. */
  readonly captchaArgs: CaptchaArgs | null;
  /** End-user IP recorded at solve time. Informational. */
  readonly userIp: string | null;
  /** Identity bound at issue, when the token was issued with one. */
  readonly binding: Binding | null;
  /** Issue vs. validate identity comparison, when both sides sent a field. */
  readonly bindingMatch: BindingMatch | null;
  /** True when the answer came from a public test key. Reject it in production. */
  readonly test: boolean;
  readonly httpStatus: number | null;
  readonly retryAfter: number | null;
  readonly retryable: boolean | null;
  readonly cause: CaptchaLaError | undefined;
  /** The raw `data` object of the response, for fields this SDK does not map yet. */
  readonly raw: Record<string, unknown> | null;

  constructor(init: ValidateResultInit) {
    this.valid = init.valid;
    this.error = init.error ?? null;
    this.warning = init.warning ?? null;
    this.offline = init.offline ?? false;
    this.clientOnly = init.clientOnly ?? false;
    this.degraded = init.degraded ?? false;
    this.degradedReason = init.degradedReason ?? null;
    this.challengeId = init.challengeId ?? null;
    this.action = init.action ?? null;
    this.uid = init.uid ?? null;
    this.hostname = init.hostname ?? null;
    this.challengeTs = init.challengeTs ?? null;
    this.riskLevel = init.riskLevel ?? null;
    this.riskLabels = init.riskLabels ?? [];
    this.captchaArgs = init.captchaArgs ?? null;
    this.userIp = init.userIp ?? init.captchaArgs?.userIp ?? null;
    this.binding = init.binding ?? null;
    this.bindingMatch = init.bindingMatch ?? null;
    this.test = init.test ?? false;
    this.httpStatus = init.httpStatus ?? null;
    this.retryAfter = init.retryAfter ?? null;
    this.retryable = init.retryable ?? null;
    this.cause = init.cause;
    this.raw = init.raw ?? null;
  }

  /**
   * True when the token was issued for a different identity than the one you
   * sent at validate (any `bindingMatch` field is false). A mismatch does not
   * make `valid` false on its own; reject it yourself if it matters.
   */
  get bindingMismatch(): boolean {
    return this.bindingMatch !== null && Object.values(this.bindingMatch).some((v) => v === false);
  }

  /** Throws `ValidationFailedError` unless `valid` is true. Returns `this` for chaining. */
  throwIfInvalid(): this {
    if (!this.valid) throw new ValidationFailedError(this);
    return this;
  }

  toJSON(): Record<string, unknown> {
    return {
      valid: this.valid,
      error: this.error,
      warning: this.warning,
      offline: this.offline,
      client_only: this.clientOnly,
      degraded: this.degraded,
      degraded_reason: this.degradedReason,
      challenge_id: this.challengeId,
      action: this.action,
      uid: this.uid,
      hostname: this.hostname,
      challenge_ts: this.challengeTs,
      risk_level: this.riskLevel,
      risk_labels: this.riskLabels,
      user_ip: this.userIp,
      captcha_args: this.captchaArgs,
      binding: this.binding,
      binding_match: this.bindingMatch,
      test: this.test,
    };
  }
}

export interface IssueResultInit extends FailureMeta {
  ok: boolean;
  token?: string | null;
  expiresIn?: number | null;
  issuedAt?: number | null;
  error?: string | null;
  message?: string | null;
}

/** Result of `issueServerToken()`. */
export class IssueResult {
  readonly ok: boolean;
  /** The `sct_` server token. Hand it to the client SDK as `serverToken`. */
  readonly token: string | null;
  /** Lifetime in seconds. */
  readonly expiresIn: number | null;
  /** Issue time, unix seconds. */
  readonly issuedAt: number | null;
  /** Error code, e.g. `rate_limit_exceeded`, `invalid_app_secret`. */
  readonly error: string | null;
  /** Human-readable message from the API. */
  readonly message: string | null;
  readonly httpStatus: number | null;
  readonly retryAfter: number | null;
  readonly retryable: boolean | null;
  readonly cause: CaptchaLaError | undefined;

  constructor(init: IssueResultInit) {
    this.ok = init.ok;
    this.token = init.token ?? null;
    this.expiresIn = init.expiresIn ?? null;
    this.issuedAt = init.issuedAt ?? null;
    this.error = init.error ?? null;
    this.message = init.message ?? null;
    this.httpStatus = init.httpStatus ?? null;
    this.retryAfter = init.retryAfter ?? null;
    this.retryable = init.retryable ?? null;
    this.cause = init.cause;
  }

  toJSON(): Record<string, unknown> {
    return {
      ok: this.ok,
      token: this.token,
      expires_in: this.expiresIn,
      issued_at: this.issuedAt,
      error: this.error,
      message: this.message,
    };
  }
}

export interface ModerationResultInit extends FailureMeta {
  ok: boolean;
  flagged?: boolean;
  categories?: Record<string, boolean>;
  categoryScores?: Record<string, number>;
  contentType?: string | null;
  raw?: Record<string, unknown> | null;
  error?: string | null;
  message?: string | null;
}

/** Result of `moderationCheck()` / `moderationText()`. */
export class ModerationResult {
  /** The request succeeded (regardless of `flagged`). */
  readonly ok: boolean;
  /** Verdict: the content was flagged. */
  readonly flagged: boolean;
  /** Category name -> tripped. The category set depends on the model; iterate defensively. */
  readonly categories: Record<string, boolean>;
  /** Category name -> score, when provided. */
  readonly categoryScores: Record<string, number>;
  /** `text` / `image` / `mixed`, when provided. */
  readonly contentType: string | null;
  /** Full `data` payload. */
  readonly raw: Record<string, unknown> | null;
  readonly error: string | null;
  readonly message: string | null;
  readonly httpStatus: number | null;
  readonly retryAfter: number | null;
  readonly retryable: boolean | null;
  readonly cause: CaptchaLaError | undefined;

  constructor(init: ModerationResultInit) {
    this.ok = init.ok;
    this.flagged = init.flagged ?? false;
    this.categories = init.categories ?? {};
    this.categoryScores = init.categoryScores ?? {};
    this.contentType = init.contentType ?? null;
    this.raw = init.raw ?? null;
    this.error = init.error ?? null;
    this.message = init.message ?? null;
    this.httpStatus = init.httpStatus ?? null;
    this.retryAfter = init.retryAfter ?? null;
    this.retryable = init.retryable ?? null;
    this.cause = init.cause;
  }

  /** True if any of the named categories tripped. */
  hasCategory(...names: string[]): boolean {
    return names.some((n) => this.categories[n] === true);
  }

  toJSON(): Record<string, unknown> {
    return {
      ok: this.ok,
      flagged: this.flagged,
      categories: this.categories,
      category_scores: this.categoryScores,
      content_type: this.contentType,
      error: this.error,
      message: this.message,
      raw: this.raw,
    };
  }
}
