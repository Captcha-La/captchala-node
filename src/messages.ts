/**
 * End-user messages for validation error codes, for form errors. Never show
 * raw codes to end users; unknown codes fall back to a generic message.
 * English only: translate them with your own i18n using these as source strings.
 */
const GENERIC = 'CAPTCHA verification did not pass. Please try again.';
const REFRESH = 'CAPTCHA expired or was already used. Please refresh and try again.';
const CONFIG = 'CAPTCHA configuration error. Please contact the site owner.';

const MESSAGES: Record<string, string> = {
  token_expired: REFRESH,
  token_already_used: REFRESH,
  token_not_found: REFRESH,
  action_mismatch: 'CAPTCHA was solved for a different action. Please refresh and try again.',
  hostname_mismatch: 'CAPTCHA was solved on a different site. Please refresh and try again.',
  request_failed: 'CAPTCHA service is temporarily unavailable. Please try again shortly.',
  rate_limited: 'Too many CAPTCHA attempts. Please wait a moment.',
  rate_limit_exceeded: 'Too many CAPTCHA attempts. Please wait a moment.',
  invalid_app_key: CONFIG,
  invalid_app_secret: CONFIG,
  missing_app_key: CONFIG,
  test_always_fail: GENERIC,
};

/** A short, user-safe message for a `ValidateResult.error` code. */
export function userMessage(code: string | null | undefined): string {
  return (code && MESSAGES[code]) || GENERIC;
}
