# CaptchaLa Node.js SDK

**English** · [简体中文](https://github.com/Captcha-La/captchala-node/blob/main/README_zh.md) · [日本語](https://github.com/Captcha-La/captchala-node/blob/main/README.ja.md) · [한국어](https://github.com/Captcha-La/captchala-node/blob/main/README.ko.md) · [Español](https://github.com/Captcha-La/captchala-node/blob/main/README.es.md) · [Português (BR)](https://github.com/Captcha-La/captchala-node/blob/main/README.pt-BR.md) · [Deutsch](https://github.com/Captcha-La/captchala-node/blob/main/README.de.md)

Server-side SDK for validating CaptchaLa tokens from Node.js. TypeScript, zero runtime dependencies, ESM and CommonJS.

- [Website](https://captcha.la)
- [Documentation](https://docs.captcha.la/sdk/server-node)
- [Web SDK Documentation](https://docs.captcha.la/web-sdk)
- [Dashboard](https://dash.captcha.la)

## Installation

```bash
npm install @captcha-la/node
```

Requires **Node.js 18+** (uses the global `fetch`). Also runs on Bun, Deno and edge runtimes that provide `fetch`.

## Quick Start

```ts
import { CaptchaLaClient } from '@captcha-la/node';

// Reads CAPTCHALA_APP_KEY / CAPTCHALA_APP_SECRET when not passed.
const captchala = new CaptchaLaClient({ appKey: 'your_app_key', appSecret: 'your_app_secret' });

const result = await captchala.validate(token, {
  clientIp: userIp,          // optional, recommended
  expectedAction: 'login',   // optional: reject tokens issued for another action
});

if (result.valid) {
  // Verification passed
} else {
  // Verification failed
  console.log(result.error); // e.g. "token_expired"
}
```

CommonJS works too: `const { CaptchaLaClient } = require('@captcha-la/node');`

## API Reference

### `new CaptchaLaClient(options?)`

| Option | Default | Description |
|---|---|---|
| `appKey` | `process.env.CAPTCHALA_APP_KEY` | App Key (from dashboard) |
| `appSecret` | `process.env.CAPTCHALA_APP_SECRET` | App Secret (from dashboard). Server-side only |
| `baseUrl` | `https://verify.captcha.la` | API base URL |
| `timeoutMs` | `5000` | Timeout per attempt, in milliseconds |
| `maxRetries` | `2` | Retries after the first attempt (`0` disables) |
| `retryBackoffMs` | `200` | Base delay for exponential backoff |
| `rejectClientOnly` | `false` | Always reject client-only tokens, see below |
| `fetch` | global `fetch` | Custom fetch (proxies, tests) |
| `headers` | `{}` | Extra headers sent with every request |

Throws `ConfigurationError` when the key or secret is missing. Create one client and reuse it.

### `client.validate(token, options?): Promise<ValidateResult>`

Validate a pass token from the client SDK. It never throws for invalid tokens, API errors or network failures. Check `result.valid` and `result.error`.

| Option | Description |
|---|---|
| `clientIp` | *(optional, recommended)* The end-user's IP from your inbound request. Used for additional risk checks |
| `keepToken` | `true` = check without consuming the token (default `false`) |
| `expectedAction` | Action you expect, e.g. `login`. A token issued for another action fails with `action_mismatch` |
| `expectedHostname` | Hostname (web) or package / bundle id (native) you expect, as a string or an array. `*.example.com` matches any subdomain. Mismatch: `hostname_mismatch` |
| `bindUid`, `bindAccount`, `bindEmail`, `bindPhone`, `scene` | End-user identity, compared with the identity bound at issue (see `bindingMatch`) |
| `signal` | `AbortSignal` to cancel the request |

```ts
const result = await captchala.validate(req.body.captcha_token, {
  clientIp: req.ip,
  expectedAction: 'login',
  expectedHostname: ['www.example.com', '*.example.com'],
  bindUid: user.id,
});
```

### `ValidateResult`

| Field | Type | Description |
|---|---|---|
| `valid` | `boolean` | Whether validation passed. The only field to gate on |
| `error` | `string \| null` | Error code, e.g. `token_expired`, `action_mismatch`, `request_failed` |
| `message` | `string \| null` | Human-readable API message, for API-level errors |
| `action` | `string \| null` | Business action of the token |
| `uid` | `string \| null` | User ID bound via `bindUid` at issue |
| `challengeId` | `string \| null` | Challenge ID |
| `hostname` | `string \| null` | Where the challenge was solved (hostname or package id) |
| `challengeTs` | `string \| null` | Solve time, ISO 8601 UTC |
| `riskLevel` | `string \| null` | `low` / `medium` / `high` / `critical`. Informational |
| `riskLabels` | `string[]` | Coarse risk categories, e.g. `proxy`. Informational |
| `captchaArgs` | `CaptchaArgs \| null` | Solve-context echo: `platform`, `userIp`, `referer`, `pkg`, `solvedAt`, `riskScore`. Informational |
| `userIp` | `string \| null` | End-user IP recorded at solve time. Informational |
| `binding` / `bindingMatch` | object \| null | Identity bound at issue, and the per-field comparison |
| `bindingMismatch` | `boolean` | `true` when any `bindingMatch` field is `false` |
| `degraded` / `degradedReason` | `boolean` / `string \| null` | `dg_` token issued while the quota is exhausted, see below |
| `offline` / `clientOnly` / `warning` | | Outage fallbacks, see [Token Types](#token-types) |
| `test` | `boolean` | Answer from a public test key. Reject it in production |
| `httpStatus`, `retryAfter`, `retryable` | | Failure details |
| `cause` | `CaptchaLaError \| undefined` | Typed error for API / network failures |
| `raw` | object \| null | The raw `data` object |

Methods: `throwIfInvalid()` throws `ValidationFailedError` unless `valid`; `toJSON()`.

### Verifying `bindUid`

If you issued the server token with `bindUid: 'user_42'`, compare the result with the user you expect:

```ts
const result = await captchala.validate(token);
if (result.valid && result.uid !== expectedUserId) {
  // pass token was issued for a different user: reject
}
```

Or send the identity at validate and check `result.bindingMismatch`.

### `client.issueServerToken(action, options?): Promise<IssueResult>`

Mint a one-time `sct_` server token. Hand it to the client SDK as `serverToken`.

| Option | Description |
|---|---|
| `bindIp` | End-user IP. A challenge started from another network may be rejected |
| `ttl` | Lifetime in seconds (server default 300, max 900) |
| `maxUses` | How many pass flows the token may be used for (server default 10) |
| `bindUid` | Your user ID; echoed by validate as `uid` |
| `bindAccount`, `bindEmail`, `bindPhone`, `scene` | End-user identity |
| `bindDeviceId`, `bindFingerprint` | Bind to a device id / browser fingerprint |

```ts
const issue = await captchala.issueServerToken('login', { bindUid: user.id, ttl: 300 });
if (!issue.ok) return res.status(503).json({ error: issue.error }); // rate_limit_exceeded, ...
res.json({ serverToken: issue.token });
```

`IssueResult`: `ok`, `token`, `expiresIn`, `issuedAt`, `error`, `message`, `httpStatus`, `retryAfter`, `retryable`, `cause`.

### `client.moderationCheck(input, options?)` / `client.moderationText(text, options?)`

Multi-modal content moderation. `input` is a list of OpenAI-compatible items; use the `textItem()` / `imageUrlItem()` helpers.

```ts
import { textItem, imageUrlItem } from '@captcha-la/node';

const m = await captchala.moderationCheck([textItem(comment), imageUrlItem(uploadUrl)], { userId: user.id });
if (m.ok && m.flagged && m.hasCategory('violence', 'csam')) {
  // hard block
}

const t = await captchala.moderationText('user comment here');
```

`ModerationResult`: `ok`, `flagged`, `categories`, `categoryScores`, `contentType`, `raw`, `error`, `message`, `hasCategory(...names)`. Categories depend on the model, so iterate them defensively.

### `userMessage(code)`

A short, user-safe English message for an error code, for form errors (`"CAPTCHA expired or was already used. Please refresh and try again."`). Never show raw codes to end users. Unknown codes fall back to a generic message.

## Errors, retries and timeouts

Methods resolve to a result and do not throw for verification, API or network failures. `result.error` is a short code. `result.cause` holds a typed error when the failure came from the transport or the API:

| Class | When |
|---|---|
| `NetworkError` (`connectFailed`, `aborted`) | DNS failure, connection refused / reset, aborted |
| `TimeoutError` (extends `NetworkError`) | No answer within `timeoutMs` |
| `AuthenticationError` | Wrong or missing app key / secret |
| `RateLimitError` | Rate limit or quota; see `retryAfter` |
| `InvalidResponseError` | Body was not the expected JSON |
| `APIError` | Any other API error (base class of the three above) |
| `ValidationFailedError` | Thrown by `result.throwIfInvalid()` |

All extend `CaptchaLaError` and carry `code`.

Retries use exponential backoff with jitter. Connection failures and HTTP 502 / 503 are always retried. Timeouts, connection resets and HTTP 504 are retried for `validate` and `issueServerToken`, but not for moderation, where the content may already be processing. Rate-limit answers (HTTP 429) are not retried. Note that a pass token is single-use: if a first attempt reached the API and was consumed before the connection dropped, the retry reports `token_already_used`. It fails closed.

## Framework helpers

Each helper lives in its own subpath export and has no dependency on the framework. The token is read from the `captcha_token` (or `captchala_token`) body field, then from the `X-Captcha-Token` header. On failure the default response is HTTP 400 `{"error":"captcha_failed","code":"<error code>"}`. All helpers accept `expectedAction`, `expectedHostname`, `allowDegraded`, `tokenFields`, `tokenHeader`, `getToken`, `getClientIp`, `getIdentity` and `onFailure`.

### Express

```ts
import express from 'express';
import { CaptchaLaClient } from '@captcha-la/node';
import { captchala } from '@captcha-la/node/express';

const client = new CaptchaLaClient();
const app = express();

app.post('/login', express.json(), captchala({ client, expectedAction: 'login' }), (req, res) => {
  // req.captchala is the ValidateResult
  res.json({ ok: true });
});
```

### Next.js (App Router)

```ts
// app/api/login/route.ts
import { CaptchaLaClient } from '@captcha-la/node';
import { withCaptchaLa } from '@captcha-la/node/next';

const client = new CaptchaLaClient();

export const POST = withCaptchaLa({ client, expectedAction: 'login' }, async (req, ctx, captcha) => {
  const body = await req.json(); // the body is still readable
  return Response.json({ ok: true, uid: captcha.uid });
});
```

`verifyRequest(req, options)` returns the `ValidateResult` if you prefer to handle the response yourself. It reads JSON, URL-encoded and multipart bodies.

### Fastify

```ts
import { CaptchaLaClient } from '@captcha-la/node';
import { captchalaPreHandler } from '@captcha-la/node/fastify';

const client = new CaptchaLaClient();

fastify.post('/login', { preHandler: captchalaPreHandler({ client, expectedAction: 'login' }) }, async (request) => {
  return { uid: request.captchala?.uid };
});
```

### Client IP

The helpers pass the end-user IP from `CF-Connecting-IP`, the first `X-Forwarded-For` entry, `X-Real-IP` or the socket address (`clientIpFromHeaders()`). Anyone can set these headers when your app is not behind a proxy that overwrites them. The IP is only an extra risk signal, but pass `getClientIp` if you know better, e.g. `getClientIp: (req) => req.ip` with Express `trust proxy`.

## Token Types

| Prefix | Source | Handling |
|---|---|---|
| `pt_` | Main API | Verified by `validate()` |
| `offline_` | Backup service, during a service disruption | Verified automatically against the backup service; `offline=true` |
| `dg_` | Main API, degraded (quota exhausted) | `valid` is always `false`; check `degraded` and decide yourself |
| `client_` | Client-only placeholder (native SDKs) | See below |
| `co_` | Client-only placeholder (web SDK) | See below |

### Degraded tokens

When an app's quota is exhausted the client SDK completes with a `dg_` token so your users are not blocked. `valid` stays `false`. To keep the flow open while you upgrade:

```ts
if (result.valid || result.degraded) { /* allow */ }
```

The framework helpers do this with `allowDegraded: true`.

### Client-only tokens (`client_` / `co_`)

The client SDK mints these only when it could reach neither the API nor the backup service. They carry no signature, so the SDK accepts one only if your server cannot reach the API either:

1. It probes the API (2 s timeout). Any HTTP answer means there is no outage: `valid=false`, `clientOnly=true`, `error='client_only_rejected_api_reachable'`.
2. Otherwise it probes the backup service the same way.
3. Only when both are unreachable: `valid=true`, `clientOnly=true`, `offline=true`, with a `warning`.

Probe results are cached per process (30 s when reachable, 5 s when not), and concurrent validations share one probe. For sensitive actions (login, payment) refuse them even during an outage:

```ts
const strict = new CaptchaLaClient({ rejectClientOnly: true });
// client_ / co_ -> valid=false, error='client_only_rejected_by_policy'
```

## Testing your integration

The API provides public test keys that always pass or always fail, without solving a CAPTCHA. See [Test keys](https://docs.captcha.la/api-reference#test-keys). Results from them have `test === true`. Never configure them in production.

In unit tests, inject a `fetch`:

```ts
const client = new CaptchaLaClient({
  appKey: 'k',
  appSecret: 's',
  fetch: async () => Response.json({ code: 0, data: { valid: true, action: 'login' } }),
});
```

## Development

```bash
npm install
npm test        # builds dist/esm + dist/cjs, then runs the test suite
CAPTCHALA_APP_KEY=xxx CAPTCHALA_APP_SECRET=xxx node scripts/live-smoke.mjs   # live check, no real challenge
```

## License

MIT
