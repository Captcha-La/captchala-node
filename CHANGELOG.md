# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-26

### Added
- `CaptchaLaClient` with `validate()`, `issueServerToken()`, `moderationCheck()`
  and `moderationText()`. Default base URL `https://verify.captcha.la`.
- `validate()` options: `clientIp`, `keepToken`, `expectedAction`,
  `expectedHostname` (string or list), and the identity fields `bindUid`,
  `bindAccount`, `bindEmail`, `bindPhone`, `scene`.
- `ValidateResult` exposes `hostname`, `challengeTs`, `riskLevel`, `riskLabels`,
  `captchaArgs`, `binding`, `bindingMatch` / `bindingMismatch`, `test`,
  degraded-token fields and `throwIfInvalid()`.
- `issueServerToken()` options: `bindIp`, `ttl`, `maxUses`, `bindUid`,
  `bindAccount`, `bindEmail`, `bindPhone`, `scene`, `bindDeviceId`,
  `bindFingerprint`.
- `offline_` tokens are verified against the backup service; client-only
  tokens (`client_` / `co_`) are accepted only when the API and the backup
  service are both unreachable, with cached, single-flight probes and a
  `rejectClientOnly` option.
- Retries with exponential backoff and jitter, per-attempt timeouts,
  `AbortSignal` support.
- Typed errors: `CaptchaLaError`, `ConfigurationError`, `NetworkError`,
  `TimeoutError`, `APIError`, `AuthenticationError`, `RateLimitError`,
  `InvalidResponseError`, `ValidationFailedError`.
- Framework helpers as subpath exports with no framework dependency:
  `@captcha-la/node/express`, `@captcha-la/node/next` (App Router),
  `@captcha-la/node/fastify`.
- ESM and CommonJS builds with type declarations. Zero runtime dependencies.
