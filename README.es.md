# SDK de CaptchaLa para Node.js

[English](https://github.com/Captcha-La/captchala-node/blob/main/README.md) · [简体中文](https://github.com/Captcha-La/captchala-node/blob/main/README_zh.md) · [日本語](https://github.com/Captcha-La/captchala-node/blob/main/README.ja.md) · [한국어](https://github.com/Captcha-La/captchala-node/blob/main/README.ko.md) · **Español** · [Português (BR)](https://github.com/Captcha-La/captchala-node/blob/main/README.pt-BR.md) · [Deutsch](https://github.com/Captcha-La/captchala-node/blob/main/README.de.md)

SDK de servidor para validar tokens de CaptchaLa desde Node.js. TypeScript, sin dependencias en tiempo de ejecución, ESM y CommonJS.

- [Sitio web](https://captcha.la)
- [Documentación](https://docs.captcha.la/sdk/server-node)
- [Documentación del Web SDK](https://docs.captcha.la/web-sdk)
- [Panel de control](https://dash.captcha.la)

## Instalación

```bash
npm install @captcha-la/node
```

Requiere **Node.js 18+** (usa el `fetch` global). También funciona en Bun, Deno y runtimes edge que ofrezcan `fetch`.

## Inicio rápido

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

CommonJS también funciona: `const { CaptchaLaClient } = require('@captcha-la/node');`

## Referencia de la API

### `new CaptchaLaClient(options?)`

| Opción | Valor por defecto | Descripción |
|---|---|---|
| `appKey` | `process.env.CAPTCHALA_APP_KEY` | App Key (del panel de control) |
| `appSecret` | `process.env.CAPTCHALA_APP_SECRET` | App Secret (del panel de control). Solo en el servidor |
| `timeoutMs` | `5000` | Tiempo de espera por intento, en milisegundos |
| `maxRetries` | `2` | Reintentos tras el primer intento (`0` los desactiva) |
| `retryBackoffMs` | `200` | Retardo base del backoff exponencial |
| `rejectClientOnly` | `false` | Rechaza siempre los tokens solo de cliente, ver más abajo |
| `fetch` | `fetch` global | fetch personalizado (proxies, tests) |
| `headers` | `{}` | Cabeceras adicionales enviadas en cada petición |

Lanza `ConfigurationError` cuando falta la clave o el secreto. Crea un único cliente y reutilízalo.

### `client.validate(token, options?): Promise<ValidateResult>`

Valida un pass token del SDK de cliente. Nunca lanza excepciones por tokens inválidos, errores de la API o fallos de red. Comprueba `result.valid` y `result.error`.

| Opción | Descripción |
|---|---|
| `clientIp` | *(opcional, recomendado)* La IP del usuario final tomada de tu petición entrante. Se usa para comprobaciones de riesgo adicionales |
| `keepToken` | `true` = comprueba sin consumir el token (por defecto `false`) |
| `expectedAction` | Acción que esperas, p. ej. `login`. Un token emitido para otra acción falla con `action_mismatch` |
| `expectedHostname` | Hostname (web) o package / bundle id (nativo) que esperas, como string o array. `*.example.com` coincide con cualquier subdominio. Si no coincide: `hostname_mismatch` |
| `bindUid`, `bindAccount`, `bindEmail`, `bindPhone`, `scene` | Identidad del usuario final, comparada con la identidad vinculada al emitir (ver `bindingMatch`) |
| `signal` | `AbortSignal` para cancelar la petición |

```ts
const result = await captchala.validate(req.body.captcha_token, {
  clientIp: req.ip,
  expectedAction: 'login',
  expectedHostname: ['www.example.com', '*.example.com'],
  bindUid: user.id,
});
```

### `ValidateResult`

| Campo | Tipo | Descripción |
|---|---|---|
| `valid` | `boolean` | Si la validación pasó. Es el único campo en el que basar la decisión |
| `error` | `string \| null` | Código de error, p. ej. `token_expired`, `action_mismatch`, `request_failed` |
| `message` | `string \| null` | Mensaje legible de la API, para errores a nivel de API |
| `action` | `string \| null` | Acción de negocio del token |
| `uid` | `string \| null` | ID de usuario vinculado mediante `bindUid` al emitir |
| `challengeId` | `string \| null` | ID del desafío |
| `hostname` | `string \| null` | Dónde se resolvió el desafío (hostname o package id) |
| `challengeTs` | `string \| null` | Momento de la resolución, ISO 8601 UTC |
| `riskLevel` | `string \| null` | `low` / `medium` / `high` / `critical`. Informativo |
| `riskLabels` | `string[]` | Categorías de riesgo generales, p. ej. `proxy`. Informativo |
| `captchaArgs` | `CaptchaArgs \| null` | Eco del contexto de resolución: `platform`, `userIp`, `referer`, `pkg`, `solvedAt`, `riskScore`. Informativo |
| `userIp` | `string \| null` | IP del usuario final registrada al resolver. Informativo |
| `binding` / `bindingMatch` | object \| null | Identidad vinculada al emitir y la comparación campo por campo |
| `bindingMismatch` | `boolean` | `true` cuando algún campo de `bindingMatch` es `false` |
| `degraded` / `degradedReason` | `boolean` / `string \| null` | Token `dg_` emitido con la cuota agotada, ver más abajo |
| `offline` / `clientOnly` / `warning` | | Alternativas ante caídas del servicio, ver [Tipos de token](#token-types) |
| `test` | `boolean` | Respuesta de una clave de prueba pública. Recházala en producción |
| `httpStatus`, `retryAfter`, `retryable` | | Detalles del fallo |
| `cause` | `CaptchaLaError \| undefined` | Error tipado para fallos de API / red |
| `raw` | object \| null | El objeto `data` sin procesar |

Métodos: `throwIfInvalid()` lanza `ValidationFailedError` salvo que `valid` sea verdadero; `toJSON()`.

### Verificar `bindUid`

Si emitiste el server token con `bindUid: 'user_42'`, compara el resultado con el usuario que esperas:

```ts
const result = await captchala.validate(token);
if (result.valid && result.uid !== expectedUserId) {
  // pass token was issued for a different user: reject
}
```

O envía la identidad al validar y comprueba `result.bindingMismatch`.

### `client.issueServerToken(action, options?): Promise<IssueResult>`

Genera un server token `sct_` de un solo uso. Entrégalo al SDK de cliente como `serverToken`.

| Opción | Descripción |
|---|---|
| `bindIp` | IP del usuario final. Un desafío iniciado desde otra red puede ser rechazado |
| `ttl` | Duración en segundos (por defecto en el servidor 300, máximo 900) |
| `maxUses` | En cuántos flujos de paso se puede usar el token (por defecto en el servidor 10) |
| `bindUid` | Tu ID de usuario; validate lo devuelve como `uid` |
| `bindAccount`, `bindEmail`, `bindPhone`, `scene` | Identidad del usuario final |
| `bindDeviceId`, `bindFingerprint` | Vincula a un device id / huella del navegador |

```ts
const issue = await captchala.issueServerToken('login', { bindUid: user.id, ttl: 300 });
if (!issue.ok) return res.status(503).json({ error: issue.error }); // rate_limit_exceeded, ...
res.json({ serverToken: issue.token });
```

`IssueResult`: `ok`, `token`, `expiresIn`, `issuedAt`, `error`, `message`, `httpStatus`, `retryAfter`, `retryable`, `cause`.

### `client.moderationCheck(input, options?)` / `client.moderationText(text, options?)`

Moderación de contenido multimodal. `input` es una lista de elementos compatibles con OpenAI; usa los helpers `textItem()` / `imageUrlItem()`.

```ts
import { textItem, imageUrlItem } from '@captcha-la/node';

const m = await captchala.moderationCheck([textItem(comment), imageUrlItem(uploadUrl)], { userId: user.id });
if (m.ok && m.flagged && m.hasCategory('violence', 'csam')) {
  // hard block
}

const t = await captchala.moderationText('user comment here');
```

`ModerationResult`: `ok`, `flagged`, `categories`, `categoryScores`, `contentType`, `raw`, `error`, `message`, `hasCategory(...names)`. Las categorías dependen del modelo, así que recórrelas de forma defensiva.

### `userMessage(code)`

Un mensaje breve en inglés, seguro para mostrar al usuario, para un código de error, pensado para errores de formulario (`"CAPTCHA expired or was already used. Please refresh and try again."`). Nunca muestres códigos sin procesar a los usuarios finales. Los códigos desconocidos usan un mensaje genérico.

## Errores, reintentos y tiempos de espera

Los métodos se resuelven con un resultado y no lanzan excepciones por fallos de verificación, de la API o de red. `result.error` es un código breve. `result.cause` contiene un error tipado cuando el fallo vino del transporte o de la API:

| Clase | Cuándo |
|---|---|
| `NetworkError` (`connectFailed`, `aborted`) | Fallo de DNS, conexión rechazada / reiniciada, petición abortada |
| `TimeoutError` (extiende `NetworkError`) | Sin respuesta dentro de `timeoutMs` |
| `AuthenticationError` | App key / secret incorrectos o ausentes |
| `RateLimitError` | Límite de tasa o cuota; ver `retryAfter` |
| `InvalidResponseError` | El cuerpo no era el JSON esperado |
| `APIError` | Cualquier otro error de la API (clase base de las tres anteriores) |
| `ValidationFailedError` | Lanzado por `result.throwIfInvalid()` |

Todas extienden `CaptchaLaError` y llevan `code`.

Los reintentos usan backoff exponencial con jitter. Los fallos de conexión y los HTTP 502 / 503 siempre se reintentan. Los tiempos de espera agotados, las conexiones reiniciadas y los HTTP 504 se reintentan para `validate` e `issueServerToken`, pero no para la moderación, donde el contenido podría estar ya procesándose. Las respuestas de límite de tasa (HTTP 429) no se reintentan. Ten en cuenta que un pass token es de un solo uso: si un primer intento llegó a la API y consumió el token antes de que se cortara la conexión, el reintento devuelve `token_already_used`. Falla de forma segura (fail closed).

## Helpers para frameworks

Cada helper vive en su propia exportación de subruta y no depende del framework. El token se lee del campo `captcha_token` (o `captchala_token`) del cuerpo y, si no está, de la cabecera `X-Captcha-Token`. En caso de fallo, la respuesta por defecto es HTTP 400 `{"error":"captcha_failed","code":"<error code>"}`. Todos los helpers aceptan `expectedAction`, `expectedHostname`, `allowDegraded`, `tokenFields`, `tokenHeader`, `getToken`, `getClientIp`, `getIdentity` y `onFailure`.

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

`verifyRequest(req, options)` devuelve el `ValidateResult` si prefieres gestionar la respuesta tú mismo. Lee cuerpos JSON, URL-encoded y multipart.

### Fastify

```ts
import { CaptchaLaClient } from '@captcha-la/node';
import { captchalaPreHandler } from '@captcha-la/node/fastify';

const client = new CaptchaLaClient();

fastify.post('/login', { preHandler: captchalaPreHandler({ client, expectedAction: 'login' }) }, async (request) => {
  return { uid: request.captchala?.uid };
});
```

### IP del cliente

Los helpers pasan la IP del usuario final tomada de `CF-Connecting-IP`, la primera entrada de `X-Forwarded-For`, `X-Real-IP` o la dirección del socket (`clientIpFromHeaders()`). Cualquiera puede establecer estas cabeceras cuando tu aplicación no está detrás de un proxy que las sobrescriba. La IP es solo una señal de riesgo adicional, pero pasa `getClientIp` si tienes una fuente más fiable, p. ej. `getClientIp: (req) => req.ip` con `trust proxy` de Express.

<a id="token-types"></a>
## Tipos de token

| Prefijo | Origen | Tratamiento |
|---|---|---|
| `pt_` | API principal | Verificado por `validate()` |
| `offline_` | Servicio de respaldo, durante una interrupción del servicio | Se verifica automáticamente contra el servicio de respaldo; `offline=true` |
| `dg_` | API principal, en modo degradado (cuota agotada) | `valid` siempre es `false`; comprueba `degraded` y decide tú |
| `client_` | Marcador solo de cliente (SDKs nativos) | Ver más abajo |
| `co_` | Marcador solo de cliente (web SDK) | Ver más abajo |

### Tokens degradados

Cuando la cuota de una aplicación se agota, el SDK de cliente completa el flujo con un token `dg_` para que tus usuarios no queden bloqueados. `valid` sigue siendo `false`. Para mantener el flujo abierto mientras actualizas tu plan:

```ts
if (result.valid || result.degraded) { /* allow */ }
```

Los helpers para frameworks lo hacen con `allowDegraded: true`.

### Tokens solo de cliente (`client_` / `co_`)

El SDK de cliente solo los genera cuando no pudo contactar ni con la API ni con el servicio de respaldo. No llevan firma, así que el SDK solo acepta uno si tu servidor tampoco puede contactar con la API:

1. Sondea la API (tiempo de espera de 2 s). Cualquier respuesta HTTP significa que no hay caída: `valid=false`, `clientOnly=true`, `error='client_only_rejected_api_reachable'`.
2. Si no, sondea el servicio de respaldo de la misma forma.
3. Solo cuando ambos son inalcanzables: `valid=true`, `clientOnly=true`, `offline=true`, con un `warning`.

Los resultados del sondeo se cachean por proceso (30 s si hay conexión, 5 s si no) y las validaciones concurrentes comparten un mismo sondeo. Para acciones sensibles (inicio de sesión, pagos), recházalos incluso durante una caída:

```ts
const strict = new CaptchaLaClient({ rejectClientOnly: true });
// client_ / co_ -> valid=false, error='client_only_rejected_by_policy'
```

## Probar tu integración

La API ofrece claves de prueba públicas que siempre pasan o siempre fallan, sin resolver un CAPTCHA. Consulta [Claves de prueba](https://docs.captcha.la/api-reference#test-keys). Los resultados obtenidos con ellas tienen `test === true`. Nunca las configures en producción.

En tests unitarios, inyecta un `fetch`:

```ts
const client = new CaptchaLaClient({
  appKey: 'k',
  appSecret: 's',
  fetch: async () => Response.json({ code: 0, data: { valid: true, action: 'login' } }),
});
```

## Desarrollo

```bash
npm install
npm test        # builds dist/esm + dist/cjs, then runs the test suite
CAPTCHALA_APP_KEY=xxx CAPTCHALA_APP_SECRET=xxx node scripts/live-smoke.mjs   # live check, no real challenge
```

## Licencia

MIT
