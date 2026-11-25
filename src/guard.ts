import type { CaptchaLaClient, IdentityFields } from './client.js';
import type { ValidateResult } from './results.js';

/** Header names accepted as a fallback place for the pass token. */
export const DEFAULT_TOKEN_HEADER = 'x-captcha-token';
/** Body / form fields searched for the pass token, in order. */
export const DEFAULT_TOKEN_FIELDS = ['captcha_token', 'captchala_token'];

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** IP literal check without node:net, so the helpers also run on edge runtimes. */
function isIp(ip: string): boolean {
  if (IPV4.test(ip)) return true;
  if (!ip.includes(':') || !/^[0-9a-fA-F:.]+$/.test(ip)) return false;
  try {
    return new URL(`http://[${ip}]/`).hostname.length > 2;
  } catch {
    return false;
  }
}

type HeaderBag = Record<string, string | string[] | undefined> | Headers;

function header(headers: HeaderBag, name: string): string | undefined {
  if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(name) ?? undefined;
  const v = (headers as Record<string, string | string[] | undefined>)[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Best-effort end-user IP: `CF-Connecting-IP`, the first `X-Forwarded-For`
 * entry, `X-Real-IP`, then the socket address. These headers can be set by
 * anyone when your app is not behind a proxy that overwrites them; the IP is
 * only an extra risk signal, but pass your own `getClientIp` if you know
 * better (e.g. `req.ip` with Express `trust proxy`).
 */
export function clientIpFromHeaders(headers: HeaderBag, remoteAddress?: string | null): string | undefined {
  const candidates = [
    header(headers, 'cf-connecting-ip'),
    header(headers, 'x-forwarded-for')?.split(',')[0],
    header(headers, 'x-real-ip'),
    remoteAddress ?? undefined,
  ];
  for (const c of candidates) {
    let ip = c?.trim();
    if (!ip) continue;
    if (ip.startsWith('::ffff:') && IPV4.test(ip.slice(7))) ip = ip.slice(7);
    if (isIp(ip)) return ip;
  }
  return undefined;
}

/** Options shared by the framework helpers. */
export interface GuardOptions<Req> {
  /** The client used for validation. */
  client: CaptchaLaClient;
  /** Body / form fields to read the token from. Default `['captcha_token', 'captchala_token']`. */
  tokenFields?: string[];
  /** Header to read the token from when no body field has it. Default `x-captcha-token`. */
  tokenHeader?: string;
  /** Custom token extraction. Overrides `tokenFields` / `tokenHeader`. */
  getToken?: (req: Req) => string | undefined | null | Promise<string | undefined | null>;
  /** Custom end-user IP extraction. */
  getClientIp?: (req: Req) => string | undefined | null;
  /** End-user identity to send with the validation. */
  getIdentity?: (req: Req) => IdentityFields | undefined | Promise<IdentityFields | undefined>;
  expectedAction?: string;
  expectedHostname?: string | string[];
  /** Let `dg_` tokens (quota exhausted) through. Default false. */
  allowDegraded?: boolean;
}

/** JSON body sent with the default 400 response. */
export function failureBody(result: ValidateResult): { error: string; code: string } {
  return { error: 'captcha_failed', code: result.error ?? 'unknown_error' };
}

export function passes(result: ValidateResult, allowDegraded: boolean | undefined): boolean {
  return result.valid || (allowDegraded === true && result.degraded);
}

export function tokenFromBody(body: unknown, fields: string[]): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const get = (k: string): unknown =>
    typeof (body as FormData).get === 'function' && !(body instanceof Map)
      ? (body as FormData).get(k)
      : (body as Record<string, unknown>)[k];
  for (const f of fields) {
    const v = get(f);
    if (typeof v === 'string' && v !== '') return v;
  }
  return undefined;
}

export async function runGuard<Req>(
  opts: GuardOptions<Req>,
  req: Req,
  defaults: { token: () => string | undefined | Promise<string | undefined>; ip: () => string | undefined },
): Promise<ValidateResult> {
  const token = opts.getToken ? await opts.getToken(req) : await defaults.token();
  const clientIp = opts.getClientIp ? opts.getClientIp(req) : defaults.ip();
  const identity = opts.getIdentity ? await opts.getIdentity(req) : undefined;
  return opts.client.validate(token ?? '', {
    ...identity,
    clientIp: clientIp ?? undefined,
    expectedAction: opts.expectedAction,
    expectedHostname: opts.expectedHostname,
  });
}
