/**
 * Next.js App Router helpers (route handlers). Works with any runtime that
 * has the WHATWG Request / Response classes.
 *
 * ```ts
 * // app/api/login/route.ts
 * import { CaptchaLaClient } from '@captcha-la/node';
 * import { withCaptchaLa } from '@captcha-la/node/next';
 *
 * const client = new CaptchaLaClient();
 * export const POST = withCaptchaLa({ client, expectedAction: 'login' }, async (req, ctx, captcha) => {
 *   return Response.json({ ok: true, uid: captcha.uid });
 * });
 * ```
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

export interface NextOptions extends GuardOptions<Request> {
  /** Build the failure response. Default: 400 `{ "error": "captcha_failed", "code": "..." }`. */
  onFailure?: (result: ValidateResult, req: Request) => Response | Promise<Response>;
}

async function tokenFromRequest(req: Request, fields: string[], headerName: string): Promise<string | undefined> {
  const fromHeader = req.headers.get(headerName);
  if (fromHeader) return fromHeader;
  const type = req.headers.get('content-type') ?? '';
  try {
    // Read a clone so the handler can still consume the body.
    if (type.includes('application/json')) return tokenFromBody(await req.clone().json(), fields);
    if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
      return tokenFromBody(await req.clone().formData(), fields);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Validate the token carried by `req` and return the result. */
export function verifyRequest(req: Request, options: NextOptions): Promise<ValidateResult> {
  const fields = options.tokenFields ?? DEFAULT_TOKEN_FIELDS;
  const headerName = options.tokenHeader ?? DEFAULT_TOKEN_HEADER;
  return runGuard(options, req, {
    token: () => tokenFromRequest(req, fields, headerName),
    ip: () => clientIpFromHeaders(req.headers),
  });
}

/**
 * Wrap a route handler: the handler runs only when validation passes and
 * receives the ValidateResult as its third argument.
 */
export function withCaptchaLa<Ctx = unknown>(
  options: NextOptions,
  handler: (req: Request, ctx: Ctx, captcha: ValidateResult) => Response | Promise<Response>,
): (req: Request, ctx: Ctx) => Promise<Response> {
  return async (req, ctx) => {
    const result = await verifyRequest(req, options);
    if (passes(result, options.allowDegraded)) return handler(req, ctx, result);
    if (options.onFailure) return options.onFailure(result, req);
    return new Response(JSON.stringify(failureBody(result)), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  };
}
