# CaptchaLa Node.js SDK

[English](https://github.com/Captcha-La/captchala-node/blob/main/README.md) · [简体中文](https://github.com/Captcha-La/captchala-node/blob/main/README_zh.md) · **日本語** · [한국어](https://github.com/Captcha-La/captchala-node/blob/main/README.ko.md) · [Español](https://github.com/Captcha-La/captchala-node/blob/main/README.es.md) · [Português (BR)](https://github.com/Captcha-La/captchala-node/blob/main/README.pt-BR.md) · [Deutsch](https://github.com/Captcha-La/captchala-node/blob/main/README.de.md)

Node.js から CaptchaLa のトークンを検証するためのサーバーサイド SDK です。TypeScript 製、ランタイム依存ゼロ、ESM と CommonJS の両方に対応しています。

- [公式サイト](https://captcha.la)
- [ドキュメント](https://docs.captcha.la/sdk/server-node)
- [Web SDK ドキュメント](https://docs.captcha.la/web-sdk)
- [ダッシュボード](https://dash.captcha.la)

## インストール

```bash
npm install @captcha-la/node
```

**Node.js 18 以上** が必要です（グローバルの `fetch` を使用）。`fetch` を提供する Bun、Deno、エッジランタイムでも動作します。

## クイックスタート

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

CommonJS でも使えます：`const { CaptchaLaClient } = require('@captcha-la/node');`

## API リファレンス

### `new CaptchaLaClient(options?)`

| オプション | デフォルト | 説明 |
|---|---|---|
| `appKey` | `process.env.CAPTCHALA_APP_KEY` | App Key（ダッシュボードで取得） |
| `appSecret` | `process.env.CAPTCHALA_APP_SECRET` | App Secret（ダッシュボードで取得）。サーバー側でのみ使用してください |
| `timeoutMs` | `5000` | 1 回の試行あたりのタイムアウト（ミリ秒） |
| `maxRetries` | `2` | 初回試行後のリトライ回数（`0` で無効） |
| `retryBackoffMs` | `200` | 指数バックオフの基準遅延 |
| `rejectClientOnly` | `false` | クライアント専用トークンを常に拒否します。後述を参照 |
| `fetch` | グローバルの `fetch` | カスタム fetch（プロキシ、テスト用） |
| `headers` | `{}` | すべてのリクエストに付与する追加ヘッダー |

キーまたはシークレットが未設定の場合は `ConfigurationError` をスローします。クライアントは 1 つ作成して使い回してください。

### `client.validate(token, options?): Promise<ValidateResult>`

クライアント SDK から受け取った pass token を検証します。無効なトークン、API エラー、ネットワーク障害のいずれでも例外はスローしません。`result.valid` と `result.error` を確認してください。

| オプション | 説明 |
|---|---|
| `clientIp` | *（任意・推奨）* 受信したリクエストから得たエンドユーザーの IP。追加のリスクチェックに使われます |
| `keepToken` | `true` = トークンを消費せずにチェックします（デフォルト `false`） |
| `expectedAction` | 想定するアクション（例：`login`）。別のアクション向けに発行されたトークンは `action_mismatch` で失敗します |
| `expectedHostname` | 想定するホスト名（Web）またはパッケージ / バンドル ID（ネイティブ）。文字列または配列で指定します。`*.example.com` は任意のサブドメインに一致します。不一致の場合：`hostname_mismatch` |
| `bindUid`, `bindAccount`, `bindEmail`, `bindPhone`, `scene` | エンドユーザーの識別情報。発行時にバインドされた識別情報と照合されます（`bindingMatch` を参照） |
| `signal` | リクエストをキャンセルするための `AbortSignal` |

```ts
const result = await captchala.validate(req.body.captcha_token, {
  clientIp: req.ip,
  expectedAction: 'login',
  expectedHostname: ['www.example.com', '*.example.com'],
  bindUid: user.id,
});
```

### `ValidateResult`

| フィールド | 型 | 説明 |
|---|---|---|
| `valid` | `boolean` | 検証に合格したかどうか。判定に使うべき唯一のフィールドです |
| `error` | `string \| null` | エラーコード（例：`token_expired`、`action_mismatch`、`request_failed`） |
| `message` | `string \| null` | API レベルのエラー時の、人が読める API メッセージ |
| `action` | `string \| null` | トークンの業務アクション |
| `uid` | `string \| null` | 発行時に `bindUid` でバインドされたユーザー ID |
| `challengeId` | `string \| null` | チャレンジ ID |
| `hostname` | `string \| null` | チャレンジが解かれた場所（ホスト名またはパッケージ ID） |
| `challengeTs` | `string \| null` | 解答時刻（ISO 8601 UTC） |
| `riskLevel` | `string \| null` | `low` / `medium` / `high` / `critical`。参考情報です |
| `riskLabels` | `string[]` | 大まかなリスクカテゴリ（例：`proxy`）。参考情報です |
| `captchaArgs` | `CaptchaArgs \| null` | 解答時のコンテキスト：`platform`、`userIp`、`referer`、`pkg`、`solvedAt`、`riskScore`。参考情報です |
| `userIp` | `string \| null` | 解答時に記録されたエンドユーザーの IP。参考情報です |
| `binding` / `bindingMatch` | object \| null | 発行時にバインドされた識別情報と、フィールドごとの照合結果 |
| `bindingMismatch` | `boolean` | `bindingMatch` のいずれかのフィールドが `false` の場合に `true` |
| `degraded` / `degradedReason` | `boolean` / `string \| null` | クォータ超過中に発行された `dg_` トークン。後述を参照 |
| `offline` / `clientOnly` / `warning` | | 障害時のフォールバック。[トークンの種類](#token-types) を参照 |
| `test` | `boolean` | 公開テストキーによる応答。本番環境では拒否してください |
| `httpStatus`, `retryAfter`, `retryable` | | 失敗の詳細 |
| `cause` | `CaptchaLaError \| undefined` | API / ネットワーク障害時の型付きエラー |
| `raw` | object \| null | 生の `data` オブジェクト |

メソッド：`throwIfInvalid()` は `valid` でない場合に `ValidationFailedError` をスローします。`toJSON()`。

### `bindUid` の確認

`bindUid: 'user_42'` を指定して server token を発行した場合は、結果を想定するユーザーと照合してください：

```ts
const result = await captchala.validate(token);
if (result.valid && result.uid !== expectedUserId) {
  // pass token was issued for a different user: reject
}
```

または validate 時に識別情報を送信し、`result.bindingMismatch` を確認します。

### `client.issueServerToken(action, options?): Promise<IssueResult>`

ワンタイムの `sct_` server token を発行します。これを `serverToken` としてクライアント SDK に渡してください。

| オプション | 説明 |
|---|---|
| `bindIp` | エンドユーザーの IP。別のネットワークから開始されたチャレンジは拒否される場合があります |
| `ttl` | 有効期間（秒）。サーバーのデフォルトは 300、最大 900 |
| `maxUses` | このトークンで実行できる pass フローの回数（サーバーのデフォルトは 10） |
| `bindUid` | アプリ側のユーザー ID。validate で `uid` として返されます |
| `bindAccount`, `bindEmail`, `bindPhone`, `scene` | エンドユーザーの識別情報 |
| `bindDeviceId`, `bindFingerprint` | デバイス ID / ブラウザフィンガープリントにバインドします |

```ts
const issue = await captchala.issueServerToken('login', { bindUid: user.id, ttl: 300 });
if (!issue.ok) return res.status(503).json({ error: issue.error }); // rate_limit_exceeded, ...
res.json({ serverToken: issue.token });
```

`IssueResult`：`ok`、`token`、`expiresIn`、`issuedAt`、`error`、`message`、`httpStatus`、`retryAfter`、`retryable`、`cause`。

### `client.moderationCheck(input, options?)` / `client.moderationText(text, options?)`

マルチモーダルなコンテンツモデレーションです。`input` は OpenAI 互換のアイテムのリストで、`textItem()` / `imageUrlItem()` ヘルパーで作成できます。

```ts
import { textItem, imageUrlItem } from '@captcha-la/node';

const m = await captchala.moderationCheck([textItem(comment), imageUrlItem(uploadUrl)], { userId: user.id });
if (m.ok && m.flagged && m.hasCategory('violence', 'csam')) {
  // hard block
}

const t = await captchala.moderationText('user comment here');
```

`ModerationResult`：`ok`、`flagged`、`categories`、`categoryScores`、`contentType`、`raw`、`error`、`message`、`hasCategory(...names)`。カテゴリはモデルによって異なるため、決め打ちせずに列挙して扱ってください。

### `userMessage(code)`

エラーコードに対応する、ユーザーに表示しても安全な短い英語メッセージを返します。フォームのエラー表示に使えます（`"CAPTCHA expired or was already used. Please refresh and try again."`）。生のエラーコードをエンドユーザーに見せないでください。未知のコードには汎用メッセージが返されます。

## エラー、リトライ、タイムアウト

各メソッドは結果オブジェクトで解決し、検証・API・ネットワークの失敗で例外をスローすることはありません。`result.error` は短いコードです。失敗の原因が通信層または API にある場合、`result.cause` に型付きエラーが入ります：

| クラス | 発生条件 |
|---|---|
| `NetworkError` (`connectFailed`, `aborted`) | DNS 解決の失敗、接続拒否 / リセット、中断 |
| `TimeoutError`（`NetworkError` を継承） | `timeoutMs` 以内に応答がない |
| `AuthenticationError` | アプリキー / シークレットが誤っている、または未設定 |
| `RateLimitError` | レート制限またはクォータ超過。`retryAfter` を参照 |
| `InvalidResponseError` | レスポンスボディが想定した JSON ではない |
| `APIError` | その他の API エラー（上記 3 つの基底クラス） |
| `ValidationFailedError` | `result.throwIfInvalid()` がスローする |

いずれも `CaptchaLaError` を継承し、`code` を持ちます。

リトライはジッター付きの指数バックオフで行われます。接続失敗と HTTP 502 / 503 は常にリトライします。タイムアウト、接続リセット、HTTP 504 は `validate` と `issueServerToken` ではリトライしますが、モデレーションではコンテンツがすでに処理中の可能性があるためリトライしません。レート制限の応答（HTTP 429）はリトライしません。なお pass token は 1 回限りです。最初の試行が API に届いてトークンが消費された後に接続が切れた場合、リトライは `token_already_used` を返します。つまりフェイルクローズになります。

## フレームワーク用ヘルパー

各ヘルパーは個別のサブパスとしてエクスポートされており、フレームワーク本体には依存しません。トークンはまずボディの `captcha_token`（または `captchala_token`）フィールドから、次に `X-Captcha-Token` ヘッダーから読み取られます。失敗時のデフォルトレスポンスは HTTP 400 `{"error":"captcha_failed","code":"<error code>"}` です。すべてのヘルパーで `expectedAction`、`expectedHostname`、`allowDegraded`、`tokenFields`、`tokenHeader`、`getToken`、`getClientIp`、`getIdentity`、`onFailure` を指定できます。

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

レスポンスを自分で処理したい場合は、`verifyRequest(req, options)` が `ValidateResult` を返します。JSON、URL エンコード、multipart のボディを読み取れます。

### Fastify

```ts
import { CaptchaLaClient } from '@captcha-la/node';
import { captchalaPreHandler } from '@captcha-la/node/fastify';

const client = new CaptchaLaClient();

fastify.post('/login', { preHandler: captchalaPreHandler({ client, expectedAction: 'login' }) }, async (request) => {
  return { uid: request.captchala?.uid };
});
```

### クライアント IP

ヘルパーは `CF-Connecting-IP`、`X-Forwarded-For` の先頭のエントリ、`X-Real-IP`、またはソケットアドレスからエンドユーザーの IP を取得して渡します（`clientIpFromHeaders()`）。アプリがこれらのヘッダーを上書きするプロキシの背後にない場合、誰でもこれらのヘッダーを設定できます。IP は追加のリスクシグナルにすぎませんが、より正確な取得方法がわかっている場合は `getClientIp` を指定してください。例：Express の `trust proxy` と組み合わせた `getClientIp: (req) => req.ip`。

<a id="token-types"></a>
## トークンの種類

| プレフィックス | 発行元 | 扱い |
|---|---|---|
| `pt_` | メイン API | `validate()` で検証されます |
| `offline_` | サービス障害時のバックアップサービス | バックアップサービスに対して自動的に検証されます。`offline=true` |
| `dg_` | メイン API（縮退モード、クォータ超過） | `valid` は常に `false`。`degraded` を確認し、扱いをアプリ側で決めてください |
| `client_` | クライアント専用プレースホルダー（ネイティブ SDK） | 後述を参照 |
| `co_` | クライアント専用プレースホルダー（Web SDK） | 後述を参照 |

### 縮退トークン

アプリのクォータを使い切ると、ユーザーがブロックされないよう、クライアント SDK は `dg_` トークンを発行して完了します。`valid` は `false` のままです。アップグレードするまでフローを通したい場合は次のようにします：

```ts
if (result.valid || result.degraded) { /* allow */ }
```

フレームワーク用ヘルパーでは `allowDegraded: true` で同じ動作になります。

### クライアント専用トークン（`client_` / `co_`）

クライアント SDK がこれらを発行するのは、API にもバックアップサービスにも到達できなかった場合だけです。署名を持たないため、SDK はサーバー側からも API に到達できない場合にのみ受け入れます：

1. API への疎通を確認します（タイムアウト 2 秒）。何らかの HTTP 応答があれば障害ではないと判断し、`valid=false`、`clientOnly=true`、`error='client_only_rejected_api_reachable'` になります。
2. そうでなければ、バックアップサービスに対して同様に疎通を確認します。
3. 両方に到達できない場合に限り、`valid=true`、`clientOnly=true`、`offline=true` となり、`warning` が付きます。

疎通確認の結果はプロセスごとにキャッシュされ（到達可能なら 30 秒、到達不能なら 5 秒）、同時に行われる検証は 1 回の疎通確認を共有します。機密性の高い操作（ログイン、決済）では、障害時でもこれらを拒否してください：

```ts
const strict = new CaptchaLaClient({ rejectClientOnly: true });
// client_ / co_ -> valid=false, error='client_only_rejected_by_policy'
```

## 連携のテスト

API には、CAPTCHA を解かずに常に合格または常に失敗する公開テストキーが用意されています。[テストキー](https://docs.captcha.la/api-reference#test-keys) を参照してください。テストキーによる結果には `test === true` が付きます。本番環境では絶対に設定しないでください。

ユニットテストでは `fetch` を注入します：

```ts
const client = new CaptchaLaClient({
  appKey: 'k',
  appSecret: 's',
  fetch: async () => Response.json({ code: 0, data: { valid: true, action: 'login' } }),
});
```

## 開発

```bash
npm install
npm test        # builds dist/esm + dist/cjs, then runs the test suite
CAPTCHALA_APP_KEY=xxx CAPTCHALA_APP_SECRET=xxx node scripts/live-smoke.mjs   # live check, no real challenge
```

## ライセンス

MIT
