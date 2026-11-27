# CaptchaLa Node.js SDK

[English](https://github.com/Captcha-La/captchala-node/blob/main/README.md) · [简体中文](https://github.com/Captcha-La/captchala-node/blob/main/README_zh.md) · [日本語](https://github.com/Captcha-La/captchala-node/blob/main/README.ja.md) · [한국어](https://github.com/Captcha-La/captchala-node/blob/main/README.ko.md) · [Español](https://github.com/Captcha-La/captchala-node/blob/main/README.es.md) · [Português (BR)](https://github.com/Captcha-La/captchala-node/blob/main/README.pt-BR.md) · **Deutsch**

Serverseitiges SDK zur Validierung von CaptchaLa-Tokens unter Node.js. TypeScript, keine Laufzeitabhängigkeiten, ESM und CommonJS.

- [Website](https://captcha.la)
- [Dokumentation](https://docs.captcha.la/sdk/server-node)
- [Web-SDK-Dokumentation](https://docs.captcha.la/web-sdk)
- [Dashboard](https://dash.captcha.la)

## Installation

```bash
npm install @captcha-la/node
```

Erfordert **Node.js 18+** (nutzt das globale `fetch`). Läuft auch unter Bun, Deno und Edge-Runtimes, die `fetch` bereitstellen.

## Schnellstart

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

CommonJS funktioniert ebenfalls: `const { CaptchaLaClient } = require('@captcha-la/node');`

## API-Referenz

### `new CaptchaLaClient(options?)`

| Option | Standard | Beschreibung |
|---|---|---|
| `appKey` | `process.env.CAPTCHALA_APP_KEY` | App Key (aus dem Dashboard) |
| `appSecret` | `process.env.CAPTCHALA_APP_SECRET` | App Secret (aus dem Dashboard). Nur serverseitig |
| `timeoutMs` | `5000` | Timeout pro Versuch, in Millisekunden |
| `maxRetries` | `2` | Wiederholungen nach dem ersten Versuch (`0` deaktiviert sie) |
| `retryBackoffMs` | `200` | Basisverzögerung für exponentiellen Backoff |
| `rejectClientOnly` | `false` | Client-only-Tokens immer ablehnen, siehe unten |
| `fetch` | globales `fetch` | Eigenes fetch (Proxys, Tests) |
| `headers` | `{}` | Zusätzliche Header, die bei jedem Request gesendet werden |

Wirft `ConfigurationError`, wenn Key oder Secret fehlen. Erstellen Sie einen Client und verwenden Sie ihn wieder.

### `client.validate(token, options?): Promise<ValidateResult>`

Validiert ein pass token aus dem Client-SDK. Wirft nie bei ungültigen Tokens, API-Fehlern oder Netzwerkfehlern. Prüfen Sie `result.valid` und `result.error`.

| Option | Beschreibung |
|---|---|
| `clientIp` | *(optional, empfohlen)* Die IP des Endnutzers aus Ihrem eingehenden Request. Wird für zusätzliche Risikoprüfungen verwendet |
| `keepToken` | `true` = prüfen, ohne das Token zu verbrauchen (Standard `false`) |
| `expectedAction` | Die erwartete Aktion, z. B. `login`. Ein für eine andere Aktion ausgestelltes Token schlägt mit `action_mismatch` fehl |
| `expectedHostname` | Erwarteter Hostname (Web) bzw. Package- / Bundle-ID (nativ), als String oder Array. `*.example.com` passt auf jede Subdomain. Abweichung: `hostname_mismatch` |
| `bindUid`, `bindAccount`, `bindEmail`, `bindPhone`, `scene` | Identität des Endnutzers, verglichen mit der bei der Ausstellung gebundenen Identität (siehe `bindingMatch`) |
| `signal` | `AbortSignal` zum Abbrechen des Requests |

```ts
const result = await captchala.validate(req.body.captcha_token, {
  clientIp: req.ip,
  expectedAction: 'login',
  expectedHostname: ['www.example.com', '*.example.com'],
  bindUid: user.id,
});
```

### `ValidateResult`

| Feld | Typ | Beschreibung |
|---|---|---|
| `valid` | `boolean` | Ob die Validierung bestanden wurde. Das einzige Feld, an dem Sie entscheiden sollten |
| `error` | `string \| null` | Fehlercode, z. B. `token_expired`, `action_mismatch`, `request_failed` |
| `message` | `string \| null` | Lesbare API-Meldung bei Fehlern auf API-Ebene |
| `action` | `string \| null` | Geschäftsaktion des Tokens |
| `uid` | `string \| null` | Bei der Ausstellung über `bindUid` gebundene Nutzer-ID |
| `challengeId` | `string \| null` | Challenge-ID |
| `hostname` | `string \| null` | Wo die Challenge gelöst wurde (Hostname oder Package-ID) |
| `challengeTs` | `string \| null` | Zeitpunkt der Lösung, ISO 8601 UTC |
| `riskLevel` | `string \| null` | `low` / `medium` / `high` / `critical`. Nur zur Information |
| `riskLabels` | `string[]` | Grobe Risikokategorien, z. B. `proxy`. Nur zur Information |
| `captchaArgs` | `CaptchaArgs \| null` | Echo des Lösungskontexts: `platform`, `userIp`, `referer`, `pkg`, `solvedAt`, `riskScore`. Nur zur Information |
| `userIp` | `string \| null` | Beim Lösen erfasste IP des Endnutzers. Nur zur Information |
| `binding` / `bindingMatch` | object \| null | Bei der Ausstellung gebundene Identität und der Vergleich pro Feld |
| `bindingMismatch` | `boolean` | `true`, wenn ein Feld in `bindingMatch` `false` ist |
| `degraded` / `degradedReason` | `boolean` / `string \| null` | `dg_`-Token, ausgestellt bei ausgeschöpftem Kontingent, siehe unten |
| `offline` / `clientOnly` / `warning` | | Fallbacks bei Ausfällen, siehe [Token-Typen](#token-typen) |
| `test` | `boolean` | Antwort von einem öffentlichen Testschlüssel. In Produktion ablehnen |
| `httpStatus`, `retryAfter`, `retryable` | | Details zum Fehlschlag |
| `cause` | `CaptchaLaError \| undefined` | Typisierter Fehler bei API- / Netzwerkfehlern |
| `raw` | object \| null | Das rohe `data`-Objekt |

Methoden: `throwIfInvalid()` wirft `ValidationFailedError`, sofern nicht `valid`; `toJSON()`.

### `bindUid` prüfen

Wenn Sie das server token mit `bindUid: 'user_42'` ausgestellt haben, vergleichen Sie das Ergebnis mit dem erwarteten Nutzer:

```ts
const result = await captchala.validate(token);
if (result.valid && result.uid !== expectedUserId) {
  // pass token was issued for a different user: reject
}
```

Oder senden Sie die Identität beim Validieren mit und prüfen Sie `result.bindingMismatch`.

### `client.issueServerToken(action, options?): Promise<IssueResult>`

Erzeugt ein einmaliges `sct_`-server token. Übergeben Sie es dem Client-SDK als `serverToken`.

| Option | Beschreibung |
|---|---|
| `bindIp` | IP des Endnutzers. Eine aus einem anderen Netzwerk gestartete Challenge kann abgelehnt werden |
| `ttl` | Lebensdauer in Sekunden (Server-Standard 300, max. 900) |
| `maxUses` | Für wie viele Durchläufe das Token verwendet werden darf (Server-Standard 10) |
| `bindUid` | Ihre Nutzer-ID; wird von validate als `uid` zurückgegeben |
| `bindAccount`, `bindEmail`, `bindPhone`, `scene` | Identität des Endnutzers |
| `bindDeviceId`, `bindFingerprint` | An eine Geräte-ID / einen Browser-Fingerprint binden |

```ts
const issue = await captchala.issueServerToken('login', { bindUid: user.id, ttl: 300 });
if (!issue.ok) return res.status(503).json({ error: issue.error }); // rate_limit_exceeded, ...
res.json({ serverToken: issue.token });
```

`IssueResult`: `ok`, `token`, `expiresIn`, `issuedAt`, `error`, `message`, `httpStatus`, `retryAfter`, `retryable`, `cause`.

### `client.moderationCheck(input, options?)` / `client.moderationText(text, options?)`

Multimodale Inhaltsmoderation. `input` ist eine Liste OpenAI-kompatibler Elemente; nutzen Sie die Helfer `textItem()` / `imageUrlItem()`.

```ts
import { textItem, imageUrlItem } from '@captcha-la/node';

const m = await captchala.moderationCheck([textItem(comment), imageUrlItem(uploadUrl)], { userId: user.id });
if (m.ok && m.flagged && m.hasCategory('violence', 'csam')) {
  // hard block
}

const t = await captchala.moderationText('user comment here');
```

`ModerationResult`: `ok`, `flagged`, `categories`, `categoryScores`, `contentType`, `raw`, `error`, `message`, `hasCategory(...names)`. Die Kategorien hängen vom Modell ab, iterieren Sie also defensiv darüber.

### `userMessage(code)`

Eine kurze, für Nutzer unbedenkliche englische Meldung zu einem Fehlercode, für Formularfehler (`"CAPTCHA expired or was already used. Please refresh and try again."`). Zeigen Sie Endnutzern nie rohe Codes. Unbekannte Codes fallen auf eine allgemeine Meldung zurück.

## Fehler, Wiederholungen und Timeouts

Methoden liefern ein Ergebnis und werfen nicht bei Verifizierungs-, API- oder Netzwerkfehlern. `result.error` ist ein kurzer Code. `result.cause` enthält einen typisierten Fehler, wenn der Fehlschlag vom Transport oder der API kam:

| Klasse | Wann |
|---|---|
| `NetworkError` (`connectFailed`, `aborted`) | DNS-Fehler, Verbindung abgelehnt / zurückgesetzt, abgebrochen |
| `TimeoutError` (erweitert `NetworkError`) | Keine Antwort innerhalb von `timeoutMs` |
| `AuthenticationError` | Falscher oder fehlender App-Key / App-Secret |
| `RateLimitError` | Rate-Limit oder Kontingent; siehe `retryAfter` |
| `InvalidResponseError` | Body war nicht das erwartete JSON |
| `APIError` | Jeder andere API-Fehler (Basisklasse der drei obigen) |
| `ValidationFailedError` | Geworfen von `result.throwIfInvalid()` |

Alle erweitern `CaptchaLaError` und tragen `code`.

Wiederholungen nutzen exponentiellen Backoff mit Jitter. Verbindungsfehler und HTTP 502 / 503 werden immer wiederholt. Timeouts, zurückgesetzte Verbindungen und HTTP 504 werden für `validate` und `issueServerToken` wiederholt, aber nicht für die Moderation, bei der der Inhalt möglicherweise schon verarbeitet wird. Rate-Limit-Antworten (HTTP 429) werden nicht wiederholt. Beachten Sie, dass ein pass token nur einmal verwendbar ist: Hat ein erster Versuch die API erreicht und das Token verbraucht, bevor die Verbindung abbrach, meldet die Wiederholung `token_already_used`. Das schlägt sicher fehl (Fail-closed).

## Framework-Helfer

Jeder Helfer hat einen eigenen Subpath-Export und keine Abhängigkeit vom Framework. Das Token wird aus dem Body-Feld `captcha_token` (oder `captchala_token`) gelesen, danach aus dem Header `X-Captcha-Token`. Bei einem Fehlschlag ist die Standardantwort HTTP 400 `{"error":"captcha_failed","code":"<error code>"}`. Alle Helfer akzeptieren `expectedAction`, `expectedHostname`, `allowDegraded`, `tokenFields`, `tokenHeader`, `getToken`, `getClientIp`, `getIdentity` und `onFailure`.

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

`verifyRequest(req, options)` gibt das `ValidateResult` zurück, wenn Sie die Antwort lieber selbst behandeln. Es liest JSON-, URL-encoded- und Multipart-Bodys.

### Fastify

```ts
import { CaptchaLaClient } from '@captcha-la/node';
import { captchalaPreHandler } from '@captcha-la/node/fastify';

const client = new CaptchaLaClient();

fastify.post('/login', { preHandler: captchalaPreHandler({ client, expectedAction: 'login' }) }, async (request) => {
  return { uid: request.captchala?.uid };
});
```

### Client-IP

Die Helfer übergeben die IP des Endnutzers aus `CF-Connecting-IP`, dem ersten Eintrag von `X-Forwarded-For`, `X-Real-IP` oder der Socket-Adresse (`clientIpFromHeaders()`). Jeder kann diese Header setzen, wenn Ihre App nicht hinter einem Proxy steht, der sie überschreibt. Die IP ist nur ein zusätzliches Risikosignal, aber übergeben Sie `getClientIp`, wenn Sie es besser wissen, z. B. `getClientIp: (req) => req.ip` mit Express `trust proxy`.

## Token-Typen

| Präfix | Quelle | Behandlung |
|---|---|---|
| `pt_` | Haupt-API | Wird von `validate()` verifiziert |
| `offline_` | Backup-Dienst, während einer Dienststörung | Wird automatisch gegen den Backup-Dienst verifiziert; `offline=true` |
| `dg_` | Haupt-API, degradiert (Kontingent ausgeschöpft) | `valid` ist immer `false`; prüfen Sie `degraded` und entscheiden Sie selbst |
| `client_` | Reiner Client-Platzhalter (native SDKs) | Siehe unten |
| `co_` | Reiner Client-Platzhalter (Web-SDK) | Siehe unten |

### Degradierte Tokens

Ist das Kontingent einer App ausgeschöpft, schließt das Client-SDK mit einem `dg_`-Token ab, damit Ihre Nutzer nicht blockiert werden. `valid` bleibt `false`. Um den Ablauf offen zu halten, während Sie upgraden:

```ts
if (result.valid || result.degraded) { /* allow */ }
```

Die Framework-Helfer tun dies mit `allowDegraded: true`.

### Client-only-Tokens (`client_` / `co_`)

Das Client-SDK erzeugt diese nur, wenn es weder die API noch den Backup-Dienst erreichen konnte. Sie tragen keine Signatur, daher akzeptiert das SDK eines nur, wenn auch Ihr Server die API nicht erreicht:

1. Es prüft die API (2 s Timeout). Jede HTTP-Antwort bedeutet, dass kein Ausfall vorliegt: `valid=false`, `clientOnly=true`, `error='client_only_rejected_api_reachable'`.
2. Andernfalls prüft es den Backup-Dienst auf dieselbe Weise.
3. Nur wenn beide nicht erreichbar sind: `valid=true`, `clientOnly=true`, `offline=true`, mit einer `warning`.

Die Prüfergebnisse werden pro Prozess zwischengespeichert (30 s bei Erreichbarkeit, 5 s sonst), und gleichzeitige Validierungen teilen sich eine Prüfung. Lehnen Sie diese Tokens bei sensiblen Aktionen (Login, Zahlung) auch während eines Ausfalls ab:

```ts
const strict = new CaptchaLaClient({ rejectClientOnly: true });
// client_ / co_ -> valid=false, error='client_only_rejected_by_policy'
```

## Ihre Integration testen

Die API stellt öffentliche Testschlüssel bereit, die immer bestehen oder immer fehlschlagen, ohne dass ein CAPTCHA gelöst werden muss. Siehe [Testschlüssel](https://docs.captcha.la/api-reference#test-keys). Ergebnisse von ihnen haben `test === true`. Konfigurieren Sie sie niemals in Produktion.

Injizieren Sie in Unit-Tests ein `fetch`:

```ts
const client = new CaptchaLaClient({
  appKey: 'k',
  appSecret: 's',
  fetch: async () => Response.json({ code: 0, data: { valid: true, action: 'login' } }),
});
```

## Entwicklung

```bash
npm install
npm test        # builds dist/esm + dist/cjs, then runs the test suite
CAPTCHALA_APP_KEY=xxx CAPTCHALA_APP_SECRET=xxx node scripts/live-smoke.mjs   # live check, no real challenge
```

## Lizenz

MIT
