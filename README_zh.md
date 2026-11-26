# CaptchaLa Node.js SDK

[English](https://github.com/Captcha-La/captchala-node/blob/main/README.md) · **简体中文** · [日本語](https://github.com/Captcha-La/captchala-node/blob/main/README.ja.md) · [한국어](https://github.com/Captcha-La/captchala-node/blob/main/README.ko.md) · [Español](https://github.com/Captcha-La/captchala-node/blob/main/README.es.md) · [Português (BR)](https://github.com/Captcha-La/captchala-node/blob/main/README.pt-BR.md) · [Deutsch](https://github.com/Captcha-La/captchala-node/blob/main/README.de.md)

用于在 Node.js 服务端校验 CaptchaLa 令牌的 SDK。TypeScript 编写，零运行时依赖，同时提供 ESM 与 CommonJS。

- [官网](https://captcha.la)
- [文档](https://docs.captcha.la/sdk/server-node)
- [Web SDK 文档](https://docs.captcha.la/web-sdk)
- [控制台](https://dash.captcha.la)

## 安装

```bash
npm install @captcha-la/node
```

需要 **Node.js 18+**（使用全局 `fetch`）。Bun、Deno 以及提供 `fetch` 的边缘运行时同样可用。

## 快速开始

```ts
import { CaptchaLaClient } from '@captcha-la/node';

// 未传入时读取环境变量 CAPTCHALA_APP_KEY / CAPTCHALA_APP_SECRET
const captchala = new CaptchaLaClient({ appKey: 'your_app_key', appSecret: 'your_app_secret' });

const result = await captchala.validate(token, {
  clientIp: userIp,          // 可选，推荐传入
  expectedAction: 'login',   // 可选：拒绝为其他 action 签发的令牌
});

if (result.valid) {
  // 校验通过
} else {
  // 校验失败
  console.log(result.error); // 例如 "token_expired"
}
```

CommonJS 写法：`const { CaptchaLaClient } = require('@captcha-la/node');`

## API 参考

### `new CaptchaLaClient(options?)`

| 选项 | 默认值 | 说明 |
|---|---|---|
| `appKey` | `process.env.CAPTCHALA_APP_KEY` | App Key（控制台获取） |
| `appSecret` | `process.env.CAPTCHALA_APP_SECRET` | App Secret（控制台获取），仅限服务端 |
| `baseUrl` | `https://verify.captcha.la` | API 地址 |
| `timeoutMs` | `5000` | 单次请求超时（毫秒） |
| `maxRetries` | `2` | 首次请求之后的重试次数（`0` 关闭重试） |
| `retryBackoffMs` | `200` | 指数退避的基础间隔 |
| `rejectClientOnly` | `false` | 始终拒绝纯客户端令牌，见下文 |
| `fetch` | 全局 `fetch` | 自定义 fetch（代理、测试） |
| `headers` | `{}` | 每个请求附带的额外请求头 |

缺少 key 或 secret 时抛出 `ConfigurationError`。建议创建一个实例并复用。

### `client.validate(token, options?): Promise<ValidateResult>`

校验前端 SDK 返回的 pass token。令牌无效、API 报错或网络故障都不会抛异常，请检查 `result.valid` 与 `result.error`。

| 选项 | 说明 |
|---|---|
| `clientIp` | *（可选，推荐）* 来自入站请求的终端用户 IP，用于额外的风险检查 |
| `keepToken` | `true` = 只检查不消费令牌（默认 `false`） |
| `expectedAction` | 期望的 action，例如 `login`。令牌属于其他 action 时返回 `action_mismatch` |
| `expectedHostname` | 期望的域名（Web）或包名 / Bundle ID（原生），字符串或数组；`*.example.com` 匹配任意子域。不匹配时返回 `hostname_mismatch` |
| `bindUid`、`bindAccount`、`bindEmail`、`bindPhone`、`scene` | 终端用户身份，与签发时绑定的身份比对（见 `bindingMatch`） |
| `signal` | 用于取消请求的 `AbortSignal` |

```ts
const result = await captchala.validate(req.body.captcha_token, {
  clientIp: req.ip,
  expectedAction: 'login',
  expectedHostname: ['www.example.com', '*.example.com'],
  bindUid: user.id,
});
```

### `ValidateResult`

| 字段 | 类型 | 说明 |
|---|---|---|
| `valid` | `boolean` | 是否通过。唯一应当用于放行判断的字段 |
| `error` | `string \| null` | 错误码，例如 `token_expired`、`action_mismatch`、`request_failed` |
| `message` | `string \| null` | API 级错误的可读信息 |
| `action` | `string \| null` | 令牌对应的业务 action |
| `uid` | `string \| null` | 签发时通过 `bindUid` 绑定的用户 ID |
| `challengeId` | `string \| null` | 挑战 ID |
| `hostname` | `string \| null` | 完成验证的域名或包名 |
| `challengeTs` | `string \| null` | 完成时间，ISO 8601 UTC |
| `riskLevel` | `string \| null` | `low` / `medium` / `high` / `critical`，仅供参考 |
| `riskLabels` | `string[]` | 粗粒度风险类别，例如 `proxy`，仅供参考 |
| `captchaArgs` | `CaptchaArgs \| null` | 验证时上下文：`platform`、`userIp`、`referer`、`pkg`、`solvedAt`、`riskScore`，仅供参考 |
| `userIp` | `string \| null` | 验证时记录的用户 IP，仅供参考 |
| `binding` / `bindingMatch` | object \| null | 签发时绑定的身份，及逐字段比对结果 |
| `bindingMismatch` | `boolean` | 任一 `bindingMatch` 字段为 `false` 时为 `true` |
| `degraded` / `degradedReason` | `boolean` / `string \| null` | 配额耗尽时签发的 `dg_` 令牌，见下文 |
| `offline` / `clientOnly` / `warning` | | 故障兜底，见[令牌类型](#令牌类型) |
| `test` | `boolean` | 来自公开测试 key 的结果，生产环境应拒绝 |
| `httpStatus`、`retryAfter`、`retryable` | | 失败详情 |
| `cause` | `CaptchaLaError \| undefined` | API / 网络故障对应的类型化错误 |
| `raw` | object \| null | 原始 `data` 对象 |

方法：`throwIfInvalid()`（未通过时抛出 `ValidationFailedError`）、`toJSON()`。

### 校验 `bindUid`

若签发 server token 时传了 `bindUid: 'user_42'`，校验后与期望用户比对：

```ts
const result = await captchala.validate(token);
if (result.valid && result.uid !== expectedUserId) {
  // 该 pass token 属于其他用户，拒绝
}
```

也可以在校验时传入身份字段，再检查 `result.bindingMismatch`。

### `client.issueServerToken(action, options?): Promise<IssueResult>`

签发一次性的 `sct_` server token，交给客户端 SDK 的 `serverToken` 参数。

| 选项 | 说明 |
|---|---|
| `bindIp` | 终端用户 IP，从其他网络发起的挑战可能被拒绝 |
| `ttl` | 有效期（秒），服务端默认 300，最大 900 |
| `maxUses` | 可用于多少次通过流程（服务端默认 10） |
| `bindUid` | 你的用户 ID，校验时以 `uid` 返回 |
| `bindAccount`、`bindEmail`、`bindPhone`、`scene` | 终端用户身份 |
| `bindDeviceId`、`bindFingerprint` | 绑定设备 ID / 浏览器指纹 |

```ts
const issue = await captchala.issueServerToken('login', { bindUid: user.id, ttl: 300 });
if (!issue.ok) return res.status(503).json({ error: issue.error }); // rate_limit_exceeded 等
res.json({ serverToken: issue.token });
```

`IssueResult`：`ok`、`token`、`expiresIn`、`issuedAt`、`error`、`message`、`httpStatus`、`retryAfter`、`retryable`、`cause`。

### `client.moderationCheck(input, options?)` / `client.moderationText(text, options?)`

多模态内容审核。`input` 为 OpenAI 兼容格式的数组，可用 `textItem()` / `imageUrlItem()` 构造。

```ts
import { textItem, imageUrlItem } from '@captcha-la/node';

const m = await captchala.moderationCheck([textItem(comment), imageUrlItem(uploadUrl)], { userId: user.id });
if (m.ok && m.flagged && m.hasCategory('violence', 'csam')) {
  // 直接拦截
}

const t = await captchala.moderationText('user comment here');
```

`ModerationResult`：`ok`、`flagged`、`categories`、`categoryScores`、`contentType`、`raw`、`error`、`message`、`hasCategory(...names)`。类别集合取决于模型，请不要写死。

### `userMessage(code)`

为错误码返回一条可以展示给终端用户的简短英文提示，用于表单错误。切勿向用户展示原始错误码；未知错误码返回通用提示。

## 错误、重试与超时

各方法总是返回结果对象，校验失败、API 错误、网络故障都不会抛异常。`result.error` 为简短错误码；若失败来自传输层或 API，`result.cause` 中是对应的类型化错误：

| 类 | 场景 |
|---|---|
| `NetworkError`（`connectFailed`、`aborted`） | DNS 失败、连接被拒 / 重置、请求被取消 |
| `TimeoutError`（继承 `NetworkError`） | `timeoutMs` 内无响应 |
| `AuthenticationError` | app key / secret 错误或缺失 |
| `RateLimitError` | 限流或配额，见 `retryAfter` |
| `InvalidResponseError` | 响应体不是预期的 JSON |
| `APIError` | 其他 API 错误（以上三者的基类） |
| `ValidationFailedError` | 由 `result.throwIfInvalid()` 抛出 |

以上均继承 `CaptchaLaError`，带有 `code`。

重试采用带抖动的指数退避。连接失败和 HTTP 502 / 503 总会重试；超时、连接重置和 HTTP 504 对 `validate` 与 `issueServerToken` 重试，对内容审核不重试（内容可能已在处理）。限流响应（HTTP 429）不重试。注意 pass token 只能使用一次：如果首次请求已到达 API 并消费了令牌、但连接随后断开，重试会返回 `token_already_used`，结果仍是拒绝。

## 框架集成

每个集成都在独立的子路径导出中，不依赖对应框架。令牌依次从请求体字段 `captcha_token`（或 `captchala_token`）和请求头 `X-Captcha-Token` 读取。失败时默认返回 HTTP 400 `{"error":"captcha_failed","code":"<错误码>"}`。所有集成都支持 `expectedAction`、`expectedHostname`、`allowDegraded`、`tokenFields`、`tokenHeader`、`getToken`、`getClientIp`、`getIdentity` 和 `onFailure`。

### Express

```ts
import express from 'express';
import { CaptchaLaClient } from '@captcha-la/node';
import { captchala } from '@captcha-la/node/express';

const client = new CaptchaLaClient();
const app = express();

app.post('/login', express.json(), captchala({ client, expectedAction: 'login' }), (req, res) => {
  // req.captchala 即 ValidateResult
  res.json({ ok: true });
});
```

### Next.js（App Router）

```ts
// app/api/login/route.ts
import { CaptchaLaClient } from '@captcha-la/node';
import { withCaptchaLa } from '@captcha-la/node/next';

const client = new CaptchaLaClient();

export const POST = withCaptchaLa({ client, expectedAction: 'login' }, async (req, ctx, captcha) => {
  const body = await req.json(); // 请求体仍可读取
  return Response.json({ ok: true, uid: captcha.uid });
});
```

如需自行处理响应，可用 `verifyRequest(req, options)` 直接拿到 `ValidateResult`。支持 JSON、URL 编码和 multipart 请求体。

### Fastify

```ts
import { CaptchaLaClient } from '@captcha-la/node';
import { captchalaPreHandler } from '@captcha-la/node/fastify';

const client = new CaptchaLaClient();

fastify.post('/login', { preHandler: captchalaPreHandler({ client, expectedAction: 'login' }) }, async (request) => {
  return { uid: request.captchala?.uid };
});
```

### 客户端 IP

集成默认依次取 `CF-Connecting-IP`、`X-Forwarded-For` 第一项、`X-Real-IP` 和套接字地址（`clientIpFromHeaders()`）。如果你的应用前面没有会覆盖这些请求头的代理，任何人都可以伪造它们。IP 只是额外的风险信号，但如有更可靠的来源请传 `getClientIp`，例如配置了 Express `trust proxy` 时用 `getClientIp: (req) => req.ip`。

## 令牌类型

| 前缀 | 来源 | 处理方式 |
|---|---|---|
| `pt_` | 主 API | 由 `validate()` 校验 |
| `offline_` | 服务中断期间由备用服务签发 | 自动向备用服务校验，`offline=true` |
| `dg_` | 主 API 降级（配额耗尽） | `valid` 恒为 `false`，检查 `degraded` 自行决定 |
| `client_` | 纯客户端占位令牌（原生 SDK） | 见下文 |
| `co_` | 纯客户端占位令牌（Web SDK） | 见下文 |

### 降级令牌

应用配额耗尽时，客户端 SDK 会直接以 `dg_` 令牌完成，不打断用户流程。`valid` 仍为 `false`。若希望在升级套餐前继续放行：

```ts
if (result.valid || result.degraded) { /* 放行 */ }
```

框架集成中对应 `allowDegraded: true`。

### 纯客户端令牌（`client_` / `co_`）

客户端 SDK 只有在 API 和备用服务都无法访问时才会生成此类令牌。它们没有签名，因此只有当你的服务器同样无法访问 API 时才会被接受：

1. 探测 API（2 秒超时）。只要有任何 HTTP 响应就说明没有故障：`valid=false`、`clientOnly=true`、`error='client_only_rejected_api_reachable'`。
2. 否则以同样方式探测备用服务。
3. 两者都不可达时：`valid=true`、`clientOnly=true`、`offline=true`，并带 `warning`。

探测结果在进程内缓存（可达 30 秒，不可达 5 秒），并发校验共享同一次探测。对登录、支付等敏感操作，可在故障期间也拒绝此类令牌：

```ts
const strict = new CaptchaLaClient({ rejectClientOnly: true });
// client_ / co_ -> valid=false, error='client_only_rejected_by_policy'
```

## 测试你的集成

API 提供始终通过 / 始终失败的公开测试 key，无需完成验证码，见[测试 key](https://docs.captcha.la/api-reference#test-keys)。其结果 `test === true`，切勿在生产环境配置。

单元测试中可注入 `fetch`：

```ts
const client = new CaptchaLaClient({
  appKey: 'k',
  appSecret: 's',
  fetch: async () => Response.json({ code: 0, data: { valid: true, action: 'login' } }),
});
```

## 开发

```bash
npm install
npm test        # 构建 dist/esm + dist/cjs 并运行测试
CAPTCHALA_APP_KEY=xxx CAPTCHALA_APP_SECRET=xxx node scripts/live-smoke.mjs   # 线上冒烟，不会完成真实挑战
```

## 许可证

MIT
