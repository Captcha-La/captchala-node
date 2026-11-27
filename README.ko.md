# CaptchaLa Node.js SDK

[English](https://github.com/Captcha-La/captchala-node/blob/main/README.md) · [简体中文](https://github.com/Captcha-La/captchala-node/blob/main/README_zh.md) · [日本語](https://github.com/Captcha-La/captchala-node/blob/main/README.ja.md) · **한국어** · [Español](https://github.com/Captcha-La/captchala-node/blob/main/README.es.md) · [Português (BR)](https://github.com/Captcha-La/captchala-node/blob/main/README.pt-BR.md) · [Deutsch](https://github.com/Captcha-La/captchala-node/blob/main/README.de.md)

Node.js에서 CaptchaLa 토큰을 검증하기 위한 서버 측 SDK입니다. TypeScript로 작성되었고, 런타임 의존성이 없으며, ESM과 CommonJS를 모두 지원합니다.

- [웹사이트](https://captcha.la)
- [문서](https://docs.captcha.la/sdk/server-node)
- [웹 SDK 문서](https://docs.captcha.la/web-sdk)
- [대시보드](https://dash.captcha.la)

## 설치

```bash
npm install @captcha-la/node
```

**Node.js 18 이상**이 필요합니다(전역 `fetch` 사용). `fetch`를 제공하는 Bun, Deno, 엣지 런타임에서도 동작합니다.

## 빠른 시작

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

CommonJS도 사용할 수 있습니다: `const { CaptchaLaClient } = require('@captcha-la/node');`

## API 레퍼런스

### `new CaptchaLaClient(options?)`

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `appKey` | `process.env.CAPTCHALA_APP_KEY` | App Key(대시보드에서 확인) |
| `appSecret` | `process.env.CAPTCHALA_APP_SECRET` | App Secret(대시보드에서 확인). 서버 측에서만 사용 |
| `timeoutMs` | `5000` | 시도당 타임아웃(밀리초) |
| `maxRetries` | `2` | 첫 시도 이후 재시도 횟수(`0`이면 비활성화) |
| `retryBackoffMs` | `200` | 지수 백오프의 기본 지연 시간 |
| `rejectClientOnly` | `false` | client-only 토큰을 항상 거부. 아래 참고 |
| `fetch` | 전역 `fetch` | 사용자 정의 fetch(프록시, 테스트용) |
| `headers` | `{}` | 모든 요청에 추가로 보낼 헤더 |

키나 시크릿이 없으면 `ConfigurationError`를 던집니다. 클라이언트는 하나만 만들어 재사용하세요.

### `client.validate(token, options?): Promise<ValidateResult>`

클라이언트 SDK에서 받은 pass token을 검증합니다. 토큰이 유효하지 않거나 API 오류, 네트워크 장애가 발생해도 예외를 던지지 않습니다. `result.valid`와 `result.error`를 확인하세요.

| 옵션 | 설명 |
|---|---|
| `clientIp` | *(선택, 권장)* 들어온 요청에서 얻은 최종 사용자의 IP. 추가 위험 검사에 사용됩니다 |
| `keepToken` | `true` = 토큰을 소비하지 않고 확인만 합니다(기본값 `false`) |
| `expectedAction` | 기대하는 액션(예: `login`). 다른 액션용으로 발급된 토큰은 `action_mismatch`로 실패합니다 |
| `expectedHostname` | 기대하는 호스트 이름(웹) 또는 패키지 / 번들 ID(네이티브). 문자열 또는 배열. `*.example.com`은 모든 서브도메인과 일치합니다. 불일치 시: `hostname_mismatch` |
| `bindUid`, `bindAccount`, `bindEmail`, `bindPhone`, `scene` | 최종 사용자 신원. 발급 시 바인딩된 신원과 비교됩니다(`bindingMatch` 참고) |
| `signal` | 요청을 취소하기 위한 `AbortSignal` |

```ts
const result = await captchala.validate(req.body.captcha_token, {
  clientIp: req.ip,
  expectedAction: 'login',
  expectedHostname: ['www.example.com', '*.example.com'],
  bindUid: user.id,
});
```

### `ValidateResult`

| 필드 | 타입 | 설명 |
|---|---|---|
| `valid` | `boolean` | 검증 통과 여부. 허용/차단 판단에는 이 필드만 사용하세요 |
| `error` | `string \| null` | 오류 코드(예: `token_expired`, `action_mismatch`, `request_failed`) |
| `message` | `string \| null` | API 수준 오류에 대한 사람이 읽을 수 있는 API 메시지 |
| `action` | `string \| null` | 토큰의 비즈니스 액션 |
| `uid` | `string \| null` | 발급 시 `bindUid`로 바인딩된 사용자 ID |
| `challengeId` | `string \| null` | 챌린지 ID |
| `hostname` | `string \| null` | 챌린지를 푼 위치(호스트 이름 또는 패키지 ID) |
| `challengeTs` | `string \| null` | 풀이 시각(ISO 8601 UTC) |
| `riskLevel` | `string \| null` | `low` / `medium` / `high` / `critical`. 참고용 |
| `riskLabels` | `string[]` | 대략적인 위험 분류(예: `proxy`). 참고용 |
| `captchaArgs` | `CaptchaArgs \| null` | 풀이 컨텍스트 에코: `platform`, `userIp`, `referer`, `pkg`, `solvedAt`, `riskScore`. 참고용 |
| `userIp` | `string \| null` | 풀이 시점에 기록된 최종 사용자 IP. 참고용 |
| `binding` / `bindingMatch` | object \| null | 발급 시 바인딩된 신원과 필드별 비교 결과 |
| `bindingMismatch` | `boolean` | `bindingMatch` 필드 중 하나라도 `false`이면 `true` |
| `degraded` / `degradedReason` | `boolean` / `string \| null` | 할당량 소진 중 발급된 `dg_` 토큰. 아래 참고 |
| `offline` / `clientOnly` / `warning` | | 장애 시 대체 처리. [토큰 유형](#token-types) 참고 |
| `test` | `boolean` | 공개 테스트 키에서 온 응답. 프로덕션에서는 거부하세요 |
| `httpStatus`, `retryAfter`, `retryable` | | 실패 상세 정보 |
| `cause` | `CaptchaLaError \| undefined` | API / 네트워크 장애에 대한 타입이 지정된 오류 |
| `raw` | object \| null | 원본 `data` 객체 |

메서드: `throwIfInvalid()`는 `valid`가 아니면 `ValidationFailedError`를 던집니다. `toJSON()`.

### `bindUid` 확인

`bindUid: 'user_42'`로 server token을 발급했다면, 결과를 기대하는 사용자와 비교하세요.

```ts
const result = await captchala.validate(token);
if (result.valid && result.uid !== expectedUserId) {
  // pass token was issued for a different user: reject
}
```

또는 validate 시 신원을 함께 보내고 `result.bindingMismatch`를 확인하세요.

### `client.issueServerToken(action, options?): Promise<IssueResult>`

일회용 `sct_` server token을 발급합니다. 클라이언트 SDK에 `serverToken`으로 전달하세요.

| 옵션 | 설명 |
|---|---|
| `bindIp` | 최종 사용자 IP. 다른 네트워크에서 시작된 챌린지는 거부될 수 있습니다 |
| `ttl` | 유효 기간(초, 서버 기본값 300, 최대 900) |
| `maxUses` | 이 토큰으로 진행할 수 있는 통과 플로우 수(서버 기본값 10) |
| `bindUid` | 사용자 ID. validate 결과에 `uid`로 그대로 반환됩니다 |
| `bindAccount`, `bindEmail`, `bindPhone`, `scene` | 최종 사용자 신원 |
| `bindDeviceId`, `bindFingerprint` | 기기 ID / 브라우저 지문에 바인딩 |

```ts
const issue = await captchala.issueServerToken('login', { bindUid: user.id, ttl: 300 });
if (!issue.ok) return res.status(503).json({ error: issue.error }); // rate_limit_exceeded, ...
res.json({ serverToken: issue.token });
```

`IssueResult`: `ok`, `token`, `expiresIn`, `issuedAt`, `error`, `message`, `httpStatus`, `retryAfter`, `retryable`, `cause`.

### `client.moderationCheck(input, options?)` / `client.moderationText(text, options?)`

멀티모달 콘텐츠 모더레이션입니다. `input`은 OpenAI 호환 항목의 목록이며, `textItem()` / `imageUrlItem()` 헬퍼를 사용하세요.

```ts
import { textItem, imageUrlItem } from '@captcha-la/node';

const m = await captchala.moderationCheck([textItem(comment), imageUrlItem(uploadUrl)], { userId: user.id });
if (m.ok && m.flagged && m.hasCategory('violence', 'csam')) {
  // hard block
}

const t = await captchala.moderationText('user comment here');
```

`ModerationResult`: `ok`, `flagged`, `categories`, `categoryScores`, `contentType`, `raw`, `error`, `message`, `hasCategory(...names)`. 카테고리는 모델에 따라 달라지므로 방어적으로 순회하세요.

### `userMessage(code)`

오류 코드에 대해 사용자에게 보여도 안전한 짧은 영어 메시지를 반환합니다. 폼 오류 표시에 사용하세요(`"CAPTCHA expired or was already used. Please refresh and try again."`). 원시 코드를 최종 사용자에게 그대로 보여 주지 마세요. 알 수 없는 코드는 일반 메시지로 대체됩니다.

## 오류, 재시도, 타임아웃

메서드는 결과 객체로 resolve되며, 검증 실패나 API 오류, 네트워크 장애에도 예외를 던지지 않습니다. `result.error`는 짧은 코드입니다. 실패가 전송 계층이나 API에서 발생한 경우 `result.cause`에 타입이 지정된 오류가 담깁니다.

| 클래스 | 발생 조건 |
|---|---|
| `NetworkError` (`connectFailed`, `aborted`) | DNS 실패, 연결 거부 / 재설정, 중단 |
| `TimeoutError` (`NetworkError` 상속) | `timeoutMs` 안에 응답 없음 |
| `AuthenticationError` | 앱 키 / 시크릿이 잘못되었거나 없음 |
| `RateLimitError` | 요청 한도 또는 할당량 초과. `retryAfter` 참고 |
| `InvalidResponseError` | 응답 본문이 기대한 JSON이 아님 |
| `APIError` | 그 밖의 모든 API 오류(위 세 클래스의 기반 클래스) |
| `ValidationFailedError` | `result.throwIfInvalid()`가 던짐 |

모두 `CaptchaLaError`를 상속하며 `code`를 가집니다.

재시도는 지터가 적용된 지수 백오프를 사용합니다. 연결 실패와 HTTP 502 / 503은 항상 재시도합니다. 타임아웃, 연결 재설정, HTTP 504는 `validate`와 `issueServerToken`에서는 재시도하지만, 콘텐츠가 이미 처리 중일 수 있는 모더레이션에서는 재시도하지 않습니다. 요청 한도 응답(HTTP 429)은 재시도하지 않습니다. pass token은 일회용이라는 점에 유의하세요. 첫 시도가 API에 도달해 토큰이 소비된 뒤 연결이 끊겼다면 재시도는 `token_already_used`를 보고합니다. 즉 fail closed로 처리됩니다.

## 프레임워크 헬퍼

각 헬퍼는 별도의 서브패스 export로 제공되며 프레임워크에 대한 의존성이 없습니다. 토큰은 본문의 `captcha_token`(또는 `captchala_token`) 필드에서 먼저 읽고, 없으면 `X-Captcha-Token` 헤더에서 읽습니다. 실패 시 기본 응답은 HTTP 400 `{"error":"captcha_failed","code":"<error code>"}`입니다. 모든 헬퍼는 `expectedAction`, `expectedHostname`, `allowDegraded`, `tokenFields`, `tokenHeader`, `getToken`, `getClientIp`, `getIdentity`, `onFailure`를 받습니다.

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

응답을 직접 처리하고 싶다면 `verifyRequest(req, options)`가 `ValidateResult`를 반환합니다. JSON, URL 인코딩, multipart 본문을 읽을 수 있습니다.

### Fastify

```ts
import { CaptchaLaClient } from '@captcha-la/node';
import { captchalaPreHandler } from '@captcha-la/node/fastify';

const client = new CaptchaLaClient();

fastify.post('/login', { preHandler: captchalaPreHandler({ client, expectedAction: 'login' }) }, async (request) => {
  return { uid: request.captchala?.uid };
});
```

### 클라이언트 IP

헬퍼는 `CF-Connecting-IP`, `X-Forwarded-For`의 첫 번째 항목, `X-Real-IP`, 소켓 주소 순으로 최종 사용자 IP를 가져와 전달합니다(`clientIpFromHeaders()`). 앱이 이 헤더들을 덮어쓰는 프록시 뒤에 있지 않다면 누구나 이 헤더를 설정할 수 있습니다. IP는 추가 위험 신호일 뿐이지만, 더 정확한 방법이 있다면 `getClientIp`를 전달하세요. 예: Express의 `trust proxy`와 함께 `getClientIp: (req) => req.ip`.

<a id="token-types"></a>
## 토큰 유형

| 접두사 | 출처 | 처리 |
|---|---|---|
| `pt_` | 메인 API | `validate()`로 검증 |
| `offline_` | 서비스 장애 중 백업 서비스 | 백업 서비스에 대해 자동 검증, `offline=true` |
| `dg_` | 메인 API, degraded(할당량 소진) | `valid`는 항상 `false`. `degraded`를 확인하고 직접 판단 |
| `client_` | client-only 플레이스홀더(네이티브 SDK) | 아래 참고 |
| `co_` | client-only 플레이스홀더(웹 SDK) | 아래 참고 |

### Degraded 토큰

앱의 할당량이 소진되면 사용자가 차단되지 않도록 클라이언트 SDK가 `dg_` 토큰으로 완료합니다. `valid`는 `false`로 유지됩니다. 업그레이드하는 동안 플로우를 열어 두려면 다음과 같이 합니다.

```ts
if (result.valid || result.degraded) { /* allow */ }
```

프레임워크 헬퍼에서는 `allowDegraded: true`로 같은 동작을 합니다.

### Client-only 토큰(`client_` / `co_`)

클라이언트 SDK는 API와 백업 서비스 모두에 연결할 수 없을 때만 이 토큰을 발급합니다. 서명이 없으므로, SDK는 서버에서도 API에 연결할 수 없는 경우에만 이 토큰을 허용합니다.

1. API를 프로브합니다(타임아웃 2초). HTTP 응답이 하나라도 오면 장애가 아닌 것으로 보고 `valid=false`, `clientOnly=true`, `error='client_only_rejected_api_reachable'`이 됩니다.
2. 그렇지 않으면 같은 방식으로 백업 서비스를 프로브합니다.
3. 둘 다 연결할 수 없을 때만 `valid=true`, `clientOnly=true`, `offline=true`가 되고 `warning`이 함께 반환됩니다.

프로브 결과는 프로세스별로 캐시되며(연결 가능 시 30초, 불가 시 5초), 동시에 진행되는 검증은 하나의 프로브를 공유합니다. 민감한 액션(로그인, 결제)에서는 장애 중에도 이 토큰을 거부하세요.

```ts
const strict = new CaptchaLaClient({ rejectClientOnly: true });
// client_ / co_ -> valid=false, error='client_only_rejected_by_policy'
```

## 연동 테스트

API는 CAPTCHA를 풀지 않아도 항상 통과하거나 항상 실패하는 공개 테스트 키를 제공합니다. [테스트 키](https://docs.captcha.la/api-reference#test-keys)를 참고하세요. 이 키로 얻은 결과는 `test === true`입니다. 프로덕션에는 절대 설정하지 마세요.

단위 테스트에서는 `fetch`를 주입하세요.

```ts
const client = new CaptchaLaClient({
  appKey: 'k',
  appSecret: 's',
  fetch: async () => Response.json({ code: 0, data: { valid: true, action: 'login' } }),
});
```

## 개발

```bash
npm install
npm test        # builds dist/esm + dist/cjs, then runs the test suite
CAPTCHALA_APP_KEY=xxx CAPTCHALA_APP_SECRET=xxx node scripts/live-smoke.mjs   # live check, no real challenge
```

## 라이선스

MIT
