# SDK CaptchaLa para Node.js

[English](https://github.com/Captcha-La/captchala-node/blob/main/README.md) · [简体中文](https://github.com/Captcha-La/captchala-node/blob/main/README_zh.md) · [日本語](https://github.com/Captcha-La/captchala-node/blob/main/README.ja.md) · [한국어](https://github.com/Captcha-La/captchala-node/blob/main/README.ko.md) · [Español](https://github.com/Captcha-La/captchala-node/blob/main/README.es.md) · **Português (BR)** · [Deutsch](https://github.com/Captcha-La/captchala-node/blob/main/README.de.md)

SDK de servidor para validar tokens CaptchaLa a partir do Node.js. TypeScript, zero dependências em tempo de execução, ESM e CommonJS.

- [Site](https://captcha.la)
- [Documentação](https://docs.captcha.la/sdk/server-node)
- [Documentação do Web SDK](https://docs.captcha.la/web-sdk)
- [Painel](https://dash.captcha.la)

## Instalação

```bash
npm install @captcha-la/node
```

Requer **Node.js 18+** (usa o `fetch` global). Também roda no Bun, no Deno e em runtimes edge que oferecem `fetch`.

## Início rápido

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

CommonJS também funciona: `const { CaptchaLaClient } = require('@captcha-la/node');`

## Referência da API

### `new CaptchaLaClient(options?)`

| Opção | Padrão | Descrição |
|---|---|---|
| `appKey` | `process.env.CAPTCHALA_APP_KEY` | App Key (do painel) |
| `appSecret` | `process.env.CAPTCHALA_APP_SECRET` | App Secret (do painel). Somente no servidor |
| `baseUrl` | `https://verify.captcha.la` | URL base da API |
| `timeoutMs` | `5000` | Timeout por tentativa, em milissegundos |
| `maxRetries` | `2` | Novas tentativas após a primeira (`0` desativa) |
| `retryBackoffMs` | `200` | Atraso base do backoff exponencial |
| `rejectClientOnly` | `false` | Sempre rejeita tokens client-only, veja abaixo |
| `fetch` | `fetch` global | fetch personalizado (proxies, testes) |
| `headers` | `{}` | Headers extras enviados em todas as requisições |

Lança `ConfigurationError` quando a key ou o secret estão ausentes. Crie um único client e reutilize-o.

### `client.validate(token, options?): Promise<ValidateResult>`

Valida um pass token vindo do SDK cliente. Nunca lança exceção para tokens inválidos, erros da API ou falhas de rede. Verifique `result.valid` e `result.error`.

| Opção | Descrição |
|---|---|
| `clientIp` | *(opcional, recomendado)* O IP do usuário final, obtido da requisição recebida. Usado em verificações de risco adicionais |
| `keepToken` | `true` = verifica sem consumir o token (padrão `false`) |
| `expectedAction` | A ação esperada, ex.: `login`. Um token emitido para outra ação falha com `action_mismatch` |
| `expectedHostname` | Hostname (web) ou package / bundle id (nativo) esperado, como string ou array. `*.example.com` corresponde a qualquer subdomínio. Divergência: `hostname_mismatch` |
| `bindUid`, `bindAccount`, `bindEmail`, `bindPhone`, `scene` | Identidade do usuário final, comparada com a identidade vinculada na emissão (veja `bindingMatch`) |
| `signal` | `AbortSignal` para cancelar a requisição |

```ts
const result = await captchala.validate(req.body.captcha_token, {
  clientIp: req.ip,
  expectedAction: 'login',
  expectedHostname: ['www.example.com', '*.example.com'],
  bindUid: user.id,
});
```

### `ValidateResult`

| Campo | Tipo | Descrição |
|---|---|---|
| `valid` | `boolean` | Se a validação passou. O único campo a usar para liberar ou bloquear |
| `error` | `string \| null` | Código de erro, ex.: `token_expired`, `action_mismatch`, `request_failed` |
| `message` | `string \| null` | Mensagem legível da API, para erros no nível da API |
| `action` | `string \| null` | Ação de negócio do token |
| `uid` | `string \| null` | ID do usuário vinculado via `bindUid` na emissão |
| `challengeId` | `string \| null` | ID do desafio |
| `hostname` | `string \| null` | Onde o desafio foi resolvido (hostname ou package id) |
| `challengeTs` | `string \| null` | Momento da resolução, ISO 8601 UTC |
| `riskLevel` | `string \| null` | `low` / `medium` / `high` / `critical`. Informativo |
| `riskLabels` | `string[]` | Categorias de risco gerais, ex.: `proxy`. Informativo |
| `captchaArgs` | `CaptchaArgs \| null` | Eco do contexto da resolução: `platform`, `userIp`, `referer`, `pkg`, `solvedAt`, `riskScore`. Informativo |
| `userIp` | `string \| null` | IP do usuário final registrado no momento da resolução. Informativo |
| `binding` / `bindingMatch` | object \| null | Identidade vinculada na emissão e a comparação campo a campo |
| `bindingMismatch` | `boolean` | `true` quando algum campo de `bindingMatch` é `false` |
| `degraded` / `degradedReason` | `boolean` / `string \| null` | Token `dg_` emitido com a cota esgotada, veja abaixo |
| `offline` / `clientOnly` / `warning` | | Fallbacks para indisponibilidade, veja [Tipos de token](#token-types) |
| `test` | `boolean` | Resposta de uma chave de teste pública. Rejeite em produção |
| `httpStatus`, `retryAfter`, `retryable` | | Detalhes da falha |
| `cause` | `CaptchaLaError \| undefined` | Erro tipado para falhas de API / rede |
| `raw` | object \| null | O objeto `data` bruto |

Métodos: `throwIfInvalid()` lança `ValidationFailedError` a menos que `valid`; `toJSON()`.

### Verificando `bindUid`

Se você emitiu o server token com `bindUid: 'user_42'`, compare o resultado com o usuário esperado:

```ts
const result = await captchala.validate(token);
if (result.valid && result.uid !== expectedUserId) {
  // pass token was issued for a different user: reject
}
```

Ou envie a identidade no validate e verifique `result.bindingMismatch`.

### `client.issueServerToken(action, options?): Promise<IssueResult>`

Gera um server token `sct_` de uso único. Entregue-o ao SDK cliente como `serverToken`.

| Opção | Descrição |
|---|---|
| `bindIp` | IP do usuário final. Um desafio iniciado a partir de outra rede pode ser rejeitado |
| `ttl` | Tempo de vida em segundos (padrão do servidor 300, máximo 900) |
| `maxUses` | Em quantos fluxos de aprovação o token pode ser usado (padrão do servidor 10) |
| `bindUid` | O ID do seu usuário; retornado pelo validate como `uid` |
| `bindAccount`, `bindEmail`, `bindPhone`, `scene` | Identidade do usuário final |
| `bindDeviceId`, `bindFingerprint` | Vincula a um device id / fingerprint do navegador |

```ts
const issue = await captchala.issueServerToken('login', { bindUid: user.id, ttl: 300 });
if (!issue.ok) return res.status(503).json({ error: issue.error }); // rate_limit_exceeded, ...
res.json({ serverToken: issue.token });
```

`IssueResult`: `ok`, `token`, `expiresIn`, `issuedAt`, `error`, `message`, `httpStatus`, `retryAfter`, `retryable`, `cause`.

### `client.moderationCheck(input, options?)` / `client.moderationText(text, options?)`

Moderação de conteúdo multimodal. `input` é uma lista de itens compatíveis com a OpenAI; use os helpers `textItem()` / `imageUrlItem()`.

```ts
import { textItem, imageUrlItem } from '@captcha-la/node';

const m = await captchala.moderationCheck([textItem(comment), imageUrlItem(uploadUrl)], { userId: user.id });
if (m.ok && m.flagged && m.hasCategory('violence', 'csam')) {
  // hard block
}

const t = await captchala.moderationText('user comment here');
```

`ModerationResult`: `ok`, `flagged`, `categories`, `categoryScores`, `contentType`, `raw`, `error`, `message`, `hasCategory(...names)`. As categorias dependem do modelo, então percorra-as de forma defensiva.

### `userMessage(code)`

Uma mensagem curta em inglês, segura para o usuário, correspondente a um código de erro, para erros de formulário (`"CAPTCHA expired or was already used. Please refresh and try again."`). Nunca mostre códigos brutos aos usuários finais. Códigos desconhecidos caem em uma mensagem genérica.

## Erros, novas tentativas e timeouts

Os métodos resolvem para um resultado e não lançam exceção em falhas de verificação, de API ou de rede. `result.error` é um código curto. `result.cause` contém um erro tipado quando a falha veio do transporte ou da API:

| Classe | Quando |
|---|---|
| `NetworkError` (`connectFailed`, `aborted`) | Falha de DNS, conexão recusada / reiniciada, cancelamento |
| `TimeoutError` (estende `NetworkError`) | Sem resposta dentro de `timeoutMs` |
| `AuthenticationError` | App key / secret incorretos ou ausentes |
| `RateLimitError` | Limite de taxa ou cota; veja `retryAfter` |
| `InvalidResponseError` | O corpo não era o JSON esperado |
| `APIError` | Qualquer outro erro da API (classe base das três acima) |
| `ValidationFailedError` | Lançado por `result.throwIfInvalid()` |

Todas estendem `CaptchaLaError` e carregam `code`.

As novas tentativas usam backoff exponencial com jitter. Falhas de conexão e HTTP 502 / 503 são sempre repetidas. Timeouts, conexões reiniciadas e HTTP 504 são repetidos para `validate` e `issueServerToken`, mas não para moderação, em que o conteúdo pode já estar sendo processado. Respostas de limite de taxa (HTTP 429) não são repetidas. Observe que um pass token é de uso único: se uma primeira tentativa chegou à API e o token foi consumido antes de a conexão cair, a nova tentativa informa `token_already_used`. A falha é fechada (fail closed).

## Helpers para frameworks

Cada helper fica em seu próprio subpath export e não depende do framework. O token é lido do campo `captcha_token` (ou `captchala_token`) do corpo e, em seguida, do header `X-Captcha-Token`. Em caso de falha, a resposta padrão é HTTP 400 `{"error":"captcha_failed","code":"<error code>"}`. Todos os helpers aceitam `expectedAction`, `expectedHostname`, `allowDegraded`, `tokenFields`, `tokenHeader`, `getToken`, `getClientIp`, `getIdentity` e `onFailure`.

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

`verifyRequest(req, options)` retorna o `ValidateResult` caso você prefira tratar a resposta por conta própria. Ele lê corpos JSON, URL-encoded e multipart.

### Fastify

```ts
import { CaptchaLaClient } from '@captcha-la/node';
import { captchalaPreHandler } from '@captcha-la/node/fastify';

const client = new CaptchaLaClient();

fastify.post('/login', { preHandler: captchalaPreHandler({ client, expectedAction: 'login' }) }, async (request) => {
  return { uid: request.captchala?.uid };
});
```

### IP do cliente

Os helpers repassam o IP do usuário final a partir de `CF-Connecting-IP`, da primeira entrada de `X-Forwarded-For`, de `X-Real-IP` ou do endereço do socket (`clientIpFromHeaders()`). Qualquer pessoa pode definir esses headers quando seu app não está atrás de um proxy que os sobrescreve. O IP é apenas um sinal de risco extra, mas passe `getClientIp` se você tiver uma fonte melhor, ex.: `getClientIp: (req) => req.ip` com `trust proxy` do Express.

<a id="token-types"></a>
## Tipos de token

| Prefixo | Origem | Tratamento |
|---|---|---|
| `pt_` | API principal | Verificado por `validate()` |
| `offline_` | Serviço de backup, durante uma interrupção do serviço | Verificado automaticamente junto ao serviço de backup; `offline=true` |
| `dg_` | API principal, modo degradado (cota esgotada) | `valid` é sempre `false`; verifique `degraded` e decida você mesmo |
| `client_` | Placeholder client-only (SDKs nativos) | Veja abaixo |
| `co_` | Placeholder client-only (web SDK) | Veja abaixo |

### Tokens degradados

Quando a cota de um app se esgota, o SDK cliente conclui com um token `dg_` para que seus usuários não fiquem bloqueados. `valid` continua `false`. Para manter o fluxo liberado enquanto você faz o upgrade:

```ts
if (result.valid || result.degraded) { /* allow */ }
```

Os helpers para frameworks fazem isso com `allowDegraded: true`.

### Tokens client-only (`client_` / `co_`)

O SDK cliente só gera esses tokens quando não conseguiu alcançar nem a API nem o serviço de backup. Eles não têm assinatura, então o SDK só aceita um deles se o seu servidor também não conseguir alcançar a API:

1. Ele testa a API (timeout de 2 s). Qualquer resposta HTTP significa que não há interrupção: `valid=false`, `clientOnly=true`, `error='client_only_rejected_api_reachable'`.
2. Caso contrário, testa o serviço de backup da mesma forma.
3. Somente quando ambos estão inacessíveis: `valid=true`, `clientOnly=true`, `offline=true`, com um `warning`.

Os resultados dos testes ficam em cache por processo (30 s quando acessível, 5 s quando não), e validações concorrentes compartilham um único teste. Para ações sensíveis (login, pagamento), recuse esses tokens mesmo durante uma interrupção:

```ts
const strict = new CaptchaLaClient({ rejectClientOnly: true });
// client_ / co_ -> valid=false, error='client_only_rejected_by_policy'
```

## Testando sua integração

A API oferece chaves de teste públicas que sempre passam ou sempre falham, sem resolver um CAPTCHA. Veja [Chaves de teste](https://docs.captcha.la/api-reference#test-keys). Os resultados obtidos com elas têm `test === true`. Nunca as configure em produção.

Em testes unitários, injete um `fetch`:

```ts
const client = new CaptchaLaClient({
  appKey: 'k',
  appSecret: 's',
  fetch: async () => Response.json({ code: 0, data: { valid: true, action: 'login' } }),
});
```

## Desenvolvimento

```bash
npm install
npm test        # builds dist/esm + dist/cjs, then runs the test suite
CAPTCHALA_APP_KEY=xxx CAPTCHALA_APP_SECRET=xxx node scripts/live-smoke.mjs   # live check, no real challenge
```

## Licença

MIT
