/**
 * Express (and Connect-style) middleware.
 *
 * ```ts
 * import { CaptchaLaClient } from '@captcha-la/node';
 * import { captchala } from '@captcha-la/node/express';
 *
 * const client = new CaptchaLaClient();
 * app.post('/login', express.json(), captchala({ client, expectedAction: 'login' }), (req, res) => {
 *   // req.captchala is the ValidateResult
 * });
 * ```
 *
 * Needs a body parser (express.json() / express.urlencoded()) before it, or
 * the token in the `X-Captcha-Token` header. No dependency on express itself.
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

/** The parts of an Express request this middleware reads. */
export interface ExpressLikeRequest {
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  captchala?: ValidateResult;
}

/** The parts of an Express response this middleware uses. */
export interface ExpressLikeResponse {
  status(code: number): ExpressLikeResponse;
  json(body: unknown): unknown;
}

export type NextFunction = (err?: unknown) => void;

export interface ExpressOptions<Req extends ExpressLikeRequest = ExpressLikeRequest> extends GuardOptions<Req> {
  /**
   * Called when validation fails. Default: respond 400
   * `{ "error": "captcha_failed", "code": "<error code>" }`.
   */
  onFailure?: (result: ValidateResult, req: Req, res: ExpressLikeResponse, next: NextFunction) => unknown;
}

export function captchala<Req extends ExpressLikeRequest = ExpressLikeRequest>(options: ExpressOptions<Req>) {
  const fields = options.tokenFields ?? DEFAULT_TOKEN_FIELDS;
  const headerName = (options.tokenHeader ?? DEFAULT_TOKEN_HEADER).toLowerCase();
  return function captchalaMiddleware(req: Req, res: ExpressLikeResponse, next: NextFunction): void {
    runGuard(options, req, {
      token: () => {
        const h = req.headers[headerName];
        return tokenFromBody(req.body, fields) ?? (Array.isArray(h) ? h[0] : h);
      },
      ip: () => clientIpFromHeaders(req.headers, req.socket?.remoteAddress),
    }).then(
      (result) => {
        req.captchala = result;
        if (passes(result, options.allowDegraded)) return next();
        if (options.onFailure) return void options.onFailure(result, req, res, next);
        res.status(400).json(failureBody(result));
      },
      (err: unknown) => next(err),
    );
  };
}

export { captchala as captchalaMiddleware };
