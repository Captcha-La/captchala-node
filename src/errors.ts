/**
 * Typed errors.
 *
 * The client methods never throw for verification outcomes or API / network
 * failures: they resolve to a result object whose `error` field holds a short
 * code (e.g. `token_expired`, `request_failed`). When the failure was caused by
 * the transport or by an API-level error, the matching error instance below is
 * attached to the result as `cause`, so you can branch on its type.
 *
 * Errors are thrown only for programming mistakes (missing credentials,
 * `ConfigurationError`) and by `ValidateResult.throwIfInvalid()`.
 */

export class CaptchaLaError extends Error {
  /** Short machine-readable code, e.g. `request_failed` or `invalid_app_secret`. */
  readonly code: string;

  constructor(code: string, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, options);
    this.name = 'CaptchaLaError';
    this.code = code;
  }
}

/** Invalid client configuration (e.g. missing app key / secret). Thrown by the constructor. */
export class ConfigurationError extends CaptchaLaError {
  constructor(message: string) {
    super('configuration_error', message);
    this.name = 'ConfigurationError';
  }
}

/** The request could not be completed: DNS failure, connection refused, reset, aborted, ... */
export class NetworkError extends CaptchaLaError {
  /** True when the connection could not be established, i.e. the request never reached the API. */
  readonly connectFailed: boolean;
  /** True when the caller's AbortSignal cancelled the request. */
  readonly aborted: boolean;

  constructor(
    message: string,
    options?: { cause?: unknown; connectFailed?: boolean; aborted?: boolean; code?: string },
  ) {
    super(options?.code ?? 'request_failed', message, { cause: options?.cause });
    this.name = 'NetworkError';
    this.connectFailed = options?.connectFailed ?? false;
    this.aborted = options?.aborted ?? false;
  }
}

/** The request did not finish within the configured timeout. */
export class TimeoutError extends NetworkError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = 'TimeoutError';
  }
}

export interface APIErrorDetails {
  httpStatus: number;
  retryAfter?: number | null;
  retryable?: boolean | null;
  body?: unknown;
}

/** The API answered with an error envelope (`code != 0`) or a non-2xx status. */
export class APIError extends CaptchaLaError {
  /** HTTP status of the response. */
  readonly httpStatus: number;
  /** Seconds to wait before retrying, when the API said so. */
  readonly retryAfter: number | null;
  /** Whether the API marked the request as retryable later. */
  readonly retryable: boolean | null;
  /** Decoded response body, for inspection. */
  readonly body: unknown;

  constructor(code: string, message: string | undefined, details: APIErrorDetails) {
    super(code, message);
    this.name = 'APIError';
    this.httpStatus = details.httpStatus;
    this.retryAfter = details.retryAfter ?? null;
    this.retryable = details.retryable ?? null;
    this.body = details.body;
  }
}

/** Wrong or missing app key / secret. */
export class AuthenticationError extends APIError {
  constructor(code: string, message: string | undefined, details: APIErrorDetails) {
    super(code, message, details);
    this.name = 'AuthenticationError';
  }
}

/** Rate limit or quota reached. Check `retryAfter` before trying again. */
export class RateLimitError extends APIError {
  constructor(code: string, message: string | undefined, details: APIErrorDetails) {
    super(code, message, details);
    this.name = 'RateLimitError';
  }
}

/** The response body was not the expected JSON envelope. */
export class InvalidResponseError extends APIError {
  constructor(code: string, message: string | undefined, details: APIErrorDetails) {
    super(code, message, details);
    this.name = 'InvalidResponseError';
  }
}

/**
 * Thrown by `ValidateResult.throwIfInvalid()`. Carries the result so callers
 * can read `error`, `degraded`, etc.
 */
export class ValidationFailedError extends CaptchaLaError {
  readonly result: import('./results.js').ValidateResult;

  constructor(result: import('./results.js').ValidateResult) {
    super(result.error ?? 'unknown_error', `CAPTCHA validation failed: ${result.error ?? 'unknown_error'}`, {
      cause: result.cause,
    });
    this.name = 'ValidationFailedError';
    this.result = result;
  }
}
