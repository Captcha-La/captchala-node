/**
 * Fastify preHandler hook.
 *
 * ```ts
 * import { CaptchaLaClient } from '@captcha-la/node';
 * import { captchalaPreHandler } from '@captcha-la/node/fastify';
 *
 * const client = new CaptchaLaClient();
 * fastify.post('/login', { preHandler: captchalaPreHandler({ client, expectedAction: 'login' }) },
 *   async (request) => ({ uid: request.captchala?.uid }));
 * ```
 *
 * No dependency on fastify itself.
 */
import {
  DEFAULT_TOKEN_FIELDS,
  DEFAULT_TOKEN_HEADER,
  clientIpFromHeaders,
  failureBody,
  passes,
  runGuard,
  tokenFromBody,
  type GuardOptions,
} from './guard.js';
import type { ValidateResult } from './results.js';

/** The parts of a Fastify request this hook reads. */
export interface FastifyLikeRequest {
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  captchala?: ValidateResult;
}

/** The parts of a Fastify reply this hook uses. */
export interface FastifyLikeReply {
  code(statusCode: number): FastifyLikeReply;
  send(payload?: unknown): unknown;
}

export interface FastifyOptions<Req extends FastifyLikeRequest = FastifyLikeRequest> extends GuardOptions<Req> {
  /** Called when validation fails. Default: reply 400 `{ "error": "captcha_failed", "code": "..." }`. */
  onFailure?: (result: ValidateResult, request: Req, reply: FastifyLikeReply) => unknown;
}

export function captchalaPreHandler<Req extends FastifyLikeRequest = FastifyLikeRequest>(options: FastifyOptions<Req>) {
  const fields = options.tokenFields ?? DEFAULT_TOKEN_FIELDS;
  const headerName = (options.tokenHeader ?? DEFAULT_TOKEN_HEADER).toLowerCase();
  return async function captchalaHook(request: Req, reply: FastifyLikeReply): Promise<unknown> {
    const result = await runGuard(options, request, {
      token: () => {
        const h = request.headers[headerName];
        return tokenFromBody(request.body, fields) ?? (Array.isArray(h) ? h[0] : h);
      },
      ip: () => clientIpFromHeaders(request.headers, request.ip),
    });
    request.captchala = result;
    if (passes(result, options.allowDegraded)) return undefined;
    if (options.onFailure) return options.onFailure(result, request, reply);
    return reply.code(400).send(failureBody(result));
  };
}
