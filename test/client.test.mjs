import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APIError,
  AuthenticationError,
  CaptchaLaClient,
  ConfigurationError,
  ERROR_CLIENT_ONLY_POLICY,
  ERROR_CLIENT_ONLY_REJECTED,
  InvalidResponseError,
  NetworkError,
  RateLimitError,
  TimeoutError,
  ValidationFailedError,
  imageUrlItem,
  resetReachabilityCache,
  textItem,
} from '../dist/esm/index.js';
import { connRefused, connReset, hang, mockFetch, ok, reply } from './helpers.mjs';
import { readFileSync } from 'node:fs';

const PKG_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const make = (fetch, extra = {}) =>
  new CaptchaLaClient({ appKey: 'key_1', appSecret: 'secret_1', fetch, retryBackoffMs: 0, ...extra });

const SUCCESS = {
  valid: true,
  challenge_id: 'ch_1',
  action: 'login',
  uid: 'user_42',
  captcha_args: { platform: 'web', user_ip: '1.2.3.4', referer: 'https://a.example/login', pkg: null, solved_at: 1750000000, risk_score: 12 },
  hostname: 'a.example',
  challenge_ts: '2025-06-15T15:06:40Z',
  risk_level: 'low',
  risk_labels: ['proxy'],
  binding: { uid: 'user_42', account: null, email: 'A@example.com', phone: null, scene: 'login' },
  binding_match: { uid: true },
};

afterEach(() => resetReachabilityCache());

describe('constructor', () => {
  test('requires credentials', () => {
    const saved = { k: process.env.CAPTCHALA_APP_KEY, s: process.env.CAPTCHALA_APP_SECRET };
    delete process.env.CAPTCHALA_APP_KEY;
    delete process.env.CAPTCHALA_APP_SECRET;
    try {
      assert.throws(() => new CaptchaLaClient({ appSecret: 's' }), ConfigurationError);
      assert.throws(() => new CaptchaLaClient({ appKey: 'k' }), ConfigurationError);
      process.env.CAPTCHALA_APP_KEY = 'env_key';
      process.env.CAPTCHALA_APP_SECRET = 'env_secret';
      assert.equal(new CaptchaLaClient().appKey, 'env_key');
    } finally {
      if (saved.k === undefined) delete process.env.CAPTCHALA_APP_KEY; else process.env.CAPTCHALA_APP_KEY = saved.k;
      if (saved.s === undefined) delete process.env.CAPTCHALA_APP_SECRET; else process.env.CAPTCHALA_APP_SECRET = saved.s;
    }
  });

  test('does not expose the secret', () => {
    const c = make(mockFetch(ok({})));
    assert.ok(!JSON.stringify(c).includes('secret_1'));
    assert.ok(!Object.values(c).includes('secret_1'));
  });
});

describe('validate', () => {
  test('success maps every field and sends credentials', async () => {
    const f = mockFetch(ok(SUCCESS));
    const r = await make(f).validate('pt_abc');
    assert.equal(r.valid, true);
    assert.equal(r.error, null);
    assert.equal(r.challengeId, 'ch_1');
    assert.equal(r.action, 'login');
    assert.equal(r.uid, 'user_42');
    assert.equal(r.hostname, 'a.example');
    assert.equal(r.challengeTs, '2025-06-15T15:06:40Z');
    assert.equal(r.riskLevel, 'low');
    assert.deepEqual(r.riskLabels, ['proxy']);
    assert.deepEqual(r.captchaArgs, { platform: 'web', userIp: '1.2.3.4', referer: 'https://a.example/login', pkg: null, solvedAt: 1750000000, riskScore: 12 });
    assert.equal(r.userIp, '1.2.3.4');
    assert.equal(r.binding.email, 'A@example.com');
    assert.equal(r.bindingMismatch, false);
    assert.equal(r.offline, false);
    assert.equal(r.test, false);

    assert.equal(f.calls.length, 1);
    const c = f.calls[0];
    assert.equal(c.url, 'https://verify.captcha.la/v1/validate');
    assert.equal(c.init.method, 'POST');
    assert.equal(c.headers.get('x-app-key'), 'key_1');
    assert.equal(c.headers.get('x-app-secret'), 'secret_1');
    assert.equal(c.headers.get('content-type'), 'application/json');
    assert.equal(c.headers.get('user-agent'), `captchala-node/${PKG_VERSION}`);
    assert.deepEqual(c.body, { pass_token: 'pt_abc', keep_token: false });
  });

  test('sends client_ip, keep_token, expected_* and identity fields', async () => {
    const f = mockFetch(ok(SUCCESS));
    await make(f).validate('pt_abc', {
      clientIp: '5.6.7.8',
      keepToken: true,
      expectedAction: 'login',
      expectedHostname: ['a.example', '*.b.example'],
      bindUid: 'user_42',
      bindAccount: 'alice',
      bindEmail: 'a@example.com',
      bindPhone: '+8613800138000',
      scene: 'login',
    });
    assert.deepEqual(f.calls[0].body, {
      pass_token: 'pt_abc',
      keep_token: true,
      client_ip: '5.6.7.8',
      expected_action: 'login',
      expected_hostname: ['a.example', '*.b.example'],
      bind_uid: 'user_42',
      bind_account: 'alice',
      bind_email: 'a@example.com',
      bind_phone: '+8613800138000',
      scene: 'login',
    });
  });

  test('validates against the CaptchaLa API and ignores unknown URL options', async () => {
    const f = mockFetch(ok(SUCCESS));
    await make(f, { baseUrl: 'http://127.0.0.1:9999/', backupUrl: 'https://backup.example' }).validate('pt_abc');
    assert.equal(f.calls[0].url, 'https://verify.captcha.la/v1/validate');
  });

  test('invalid token is a clean failure without cause', async () => {
    const f = mockFetch(ok({ valid: false, error: 'token_not_found' }));
    const r = await make(f).validate('pt_bogus');
    assert.equal(r.valid, false);
    assert.equal(r.error, 'token_not_found');
    assert.equal(r.cause, undefined);
    assert.equal(r.httpStatus, 200);
    assert.equal(f.calls.length, 1, 'verification failures are not retried');
  });

  test('empty token never hits the network', async () => {
    const f = mockFetch(ok(SUCCESS));
    const r = await make(f).validate('');
    assert.equal(r.valid, false);
    assert.equal(r.error, 'empty_token');
    assert.equal(f.calls.length, 0);
  });

  test('action_mismatch and hostname_mismatch from the API', async () => {
    for (const code of ['action_mismatch', 'hostname_mismatch']) {
      const r = await make(mockFetch(ok({ valid: false, error: code }))).validate('pt_x', { expectedAction: 'login', expectedHostname: 'a.example' });
      assert.equal(r.valid, false);
      assert.equal(r.error, code);
    }
  });

  test('action re-check rejects a token for another action', async () => {
    const r = await make(mockFetch(ok({ ...SUCCESS, action: 'pay' }))).validate('pt_x', { expectedAction: 'login' });
    assert.equal(r.valid, false);
    assert.equal(r.error, 'action_mismatch');
    assert.equal(r.action, 'pay');
  });

  test('action re-check skips test-key answers', async () => {
    const r = await make(mockFetch(ok({ valid: true, test: true, action: 'test' }))).validate('pt_x', { expectedAction: 'login' });
    assert.equal(r.valid, true);
    assert.equal(r.test, true);
  });

  test('binding mismatch is surfaced but does not change valid', async () => {
    const r = await make(mockFetch(ok({ ...SUCCESS, binding_match: { uid: true, email: false } }))).validate('pt_x');
    assert.equal(r.valid, true);
    assert.equal(r.bindingMismatch, true);
    assert.deepEqual(r.bindingMatch, { uid: true, email: false });
  });

  test('degraded token: valid false, degraded true', async () => {
    const r = await make(mockFetch(ok({ valid: false, degraded: true, reason: 'quota_exhausted', expired: false }))).validate('dg_x');
    assert.equal(r.valid, false);
    assert.equal(r.degraded, true);
    assert.equal(r.degradedReason, 'quota_exhausted');
  });

  test('legacy ok:true is accepted', async () => {
    const r = await make(mockFetch(ok({ ok: true }))).validate('pt_x');
    assert.equal(r.valid, true);
  });

  test('offline_ tokens go to the backup service', async () => {
    const f = mockFetch(ok({ valid: true }));
    const r = await make(f).validate('offline_abc');
    assert.equal(f.calls[0].url, 'https://fallbackapiv1.captchala.com/api/validate');
    assert.equal(r.valid, true);
    assert.equal(r.offline, true);
  });

  test('authentication errors carry a typed cause', async () => {
    const f = mockFetch(reply(200, { code: -1, msg: 'Invalid app secret', error: 'invalid_app_secret' }));
    const r = await make(f).validate('pt_x');
    assert.equal(r.valid, false);
    assert.equal(r.error, 'invalid_app_secret');
    assert.ok(r.cause instanceof AuthenticationError);
    assert.ok(r.cause instanceof APIError);
    assert.equal(r.cause.code, 'invalid_app_secret');
    assert.equal(f.calls.length, 1);
  });

  test('code:0 on a non-2xx status is never a success', async () => {
    const r = await make(mockFetch(reply(500, { code: 0, data: { valid: true } }))).validate('pt_x');
    assert.equal(r.valid, false);
    assert.ok(r.cause instanceof APIError);
    assert.equal(r.httpStatus, 500);
  });

  test('connection failures are retried, then reported as request_failed', async () => {
    const f = mockFetch(connRefused());
    const r = await make(f, { maxRetries: 2 }).validate('pt_x');
    assert.equal(f.calls.length, 3);
    assert.equal(r.valid, false);
    assert.equal(r.error, 'request_failed');
    assert.ok(r.cause instanceof NetworkError);
    assert.equal(r.cause.connectFailed, true);
  });

  test('a retry after a connection failure can succeed', async () => {
    const f = mockFetch(connRefused(), ok(SUCCESS));
    const r = await make(f).validate('pt_x');
    assert.equal(f.calls.length, 2);
    assert.equal(r.valid, true);
  });

  test('503 / 502 / 504 are retried', async () => {
    for (const status of [502, 503, 504]) {
      const f = mockFetch(reply(status, '<html>bad gateway</html>'), ok(SUCCESS));
      const r = await make(f).validate('pt_x');
      assert.equal(f.calls.length, 2, `status ${status}`);
      assert.equal(r.valid, true);
    }
  });

  test('exhausted retries on 502 give http_502 with InvalidResponseError', async () => {
    const f = mockFetch(reply(502, '<html>bad gateway</html>'));
    const r = await make(f, { maxRetries: 1 }).validate('pt_x');
    assert.equal(f.calls.length, 2);
    assert.equal(r.error, 'http_502');
    assert.ok(r.cause instanceof InvalidResponseError);
  });

  test('service_online 503 is not retried', async () => {
    const f = mockFetch(reply(503, { code: -1, error: 'service_online', message: 'Main API is online' }));
    const r = await make(f).validate('pt_x');
    assert.equal(f.calls.length, 1);
    assert.equal(r.error, 'service_online');
  });

  test('429 is not retried and exposes retryAfter', async () => {
    const f = mockFetch(reply(429, { code: -1, error: 'rate_limited', msg: 'slow down', retry_after: 7, retryable: true }));
    const r = await make(f).validate('pt_x');
    assert.equal(f.calls.length, 1);
    assert.equal(r.error, 'rate_limited');
    assert.equal(r.retryAfter, 7);
    assert.equal(r.retryable, true);
    assert.ok(r.cause instanceof RateLimitError);
  });

  test('Retry-After header is read', async () => {
    const r = await make(mockFetch(reply(429, { code: -1, error: 'rate_limited' }, { 'retry-after': '3' }))).validate('pt_x');
    assert.equal(r.retryAfter, 3);
  });

  test('timeouts are retried for validate and reported as TimeoutError', async () => {
    const f = mockFetch(hang());
    const r = await make(f, { timeoutMs: 30, maxRetries: 1 }).validate('pt_x');
    assert.equal(f.calls.length, 2);
    assert.equal(r.error, 'request_failed');
    assert.ok(r.cause instanceof TimeoutError);
  });

  test('maxRetries: 0 disables retries', async () => {
    const f = mockFetch(connRefused());
    await make(f, { maxRetries: 0 }).validate('pt_x');
    assert.equal(f.calls.length, 1);
  });

  test('caller abort is not retried', async () => {
    const ac = new AbortController();
    const f = mockFetch((url, init) => {
      ac.abort();
      return hang()(url, init);
    });
    const r = await make(f).validate('pt_x', { signal: ac.signal });
    assert.equal(f.calls.length, 1);
    assert.equal(r.error, 'request_failed');
    assert.equal(r.cause.aborted, true);
  });

  test('non-JSON 200 is invalid_response', async () => {
    const r = await make(mockFetch(reply(200, 'not json'))).validate('pt_x');
    assert.equal(r.error, 'invalid_response');
    assert.ok(r.cause instanceof InvalidResponseError);
  });

  test('throwIfInvalid', async () => {
    const good = await make(mockFetch(ok(SUCCESS))).validate('pt_x');
    assert.equal(good.throwIfInvalid(), good);
    const bad = await make(mockFetch(ok({ valid: false, error: 'token_expired' }))).validate('pt_x');
    assert.throws(() => bad.throwIfInvalid(), (e) => e instanceof ValidationFailedError && e.code === 'token_expired' && e.result === bad);
  });

  test('toJSON uses snake_case keys', async () => {
    const r = await make(mockFetch(ok(SUCCESS))).validate('pt_x');
    const j = JSON.parse(JSON.stringify(r));
    assert.equal(j.valid, true);
    assert.equal(j.challenge_id, 'ch_1');
    assert.equal(j.captcha_args.userIp, '1.2.3.4');
  });
});

describe('client-only tokens', () => {
  test('rejected by policy without probing', async () => {
    const f = mockFetch(ok({}));
    const r = await make(f, { rejectClientOnly: true }).validate('co_abc');
    assert.equal(r.valid, false);
    assert.equal(r.clientOnly, true);
    assert.equal(r.error, ERROR_CLIENT_ONLY_POLICY);
    assert.equal(f.calls.length, 0);
  });

  test('rejected when the main API answers anything', async () => {
    for (const status of [200, 400, 503]) {
      resetReachabilityCache();
      const f = mockFetch(reply(status, 'nope'));
      const r = await make(f).validate('client_abc');
      assert.equal(r.valid, false);
      assert.equal(r.error, ERROR_CLIENT_ONLY_REJECTED);
      assert.equal(f.calls.length, 1, 'probes are not retried');
      assert.deepEqual(f.calls[0].body, { pass_token: '', keep_token: true });
    }
  });

  test('rejected when only the backup answers', async () => {
    const f = mockFetch(connRefused(), reply(200, 'ok'));
    const r = await make(f).validate('co_abc');
    assert.equal(r.valid, false);
    assert.match(r.warning, /backup/);
    assert.equal(f.calls.length, 2);
  });

  test('accepted when both are unreachable, and the result is cached', async () => {
    const f = mockFetch(connRefused());
    const c = make(f);
    const r = await c.validate('client_abc');
    assert.equal(r.valid, true);
    assert.equal(r.clientOnly, true);
    assert.equal(r.offline, true);
    assert.ok(r.warning);
    assert.equal(f.calls.length, 2);
    await c.validate('co_def');
    assert.equal(f.calls.length, 2, 'cached probe results are reused');
  });

  test('concurrent probes are single-flight', async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    const f = mockFetch(async () => {
      await gate;
      return reply(200, 'x');
    });
    const c = make(f);
    const p = Promise.all([c.validate('co_1'), c.validate('co_2'), c.validate('co_3')]);
    await new Promise((r) => setTimeout(r, 10));
    release();
    const rs = await p;
    assert.ok(rs.every((r) => r.valid === false));
    assert.equal(f.calls.length, 1);
  });
});

describe('issueServerToken', () => {
  test('success and request body', async () => {
    const f = mockFetch(ok({ server_token: 'sct_abc', expires_in: 300, issued_at: 1713600000 }));
    const r = await make(f).issueServerToken('login', {
      bindIp: '1.2.3.4', ttl: 120, maxUses: 3, bindUid: 'u1', bindEmail: 'a@b.example', bindDeviceId: 'd1', bindFingerprint: 'fp1', scene: 'login',
    });
    assert.equal(r.ok, true);
    assert.equal(r.token, 'sct_abc');
    assert.equal(r.expiresIn, 300);
    assert.equal(r.issuedAt, 1713600000);
    assert.equal(f.calls[0].url, 'https://verify.captcha.la/v1/server/challenge/issue');
    assert.deepEqual(f.calls[0].body, {
      action: 'login', bind_ip: '1.2.3.4', ttl: 120, max_uses: 3, bind_device_id: 'd1', bind_fingerprint: 'fp1', bind_uid: 'u1', bind_email: 'a@b.example', scene: 'login',
    });
  });

  test('empty action is rejected locally', async () => {
    const f = mockFetch(ok({}));
    const r = await make(f).issueServerToken('');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'invalid_action');
    assert.equal(f.calls.length, 0);
  });

  test('API errors use the error code, not the message', async () => {
    const r = await make(mockFetch(reply(200, { code: -1, msg: 'secret mismatch', error: 'invalid_app_secret' }))).issueServerToken('login');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'invalid_app_secret');
    assert.equal(r.message, 'secret mismatch');
    assert.ok(r.cause instanceof AuthenticationError);
  });

  test('rate limit', async () => {
    const r = await make(mockFetch(reply(200, { code: -1, error: 'rate_limit_exceeded', retry_after: 10, retryable: true }))).issueServerToken('login');
    assert.equal(r.error, 'rate_limit_exceeded');
    assert.ok(r.cause instanceof RateLimitError);
    assert.equal(r.retryAfter, 10);
  });

  test('network failure', async () => {
    const f = mockFetch(connReset());
    const r = await make(f, { maxRetries: 1 }).issueServerToken('login');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'request_failed');
    assert.equal(f.calls.length, 2, 'issue retries ambiguous failures');
  });
});

describe('moderation', () => {
  test('check: credentials in body, verdict mapped', async () => {
    const f = mockFetch(ok({ flagged: true, categories: { violence: true, hate: false }, category_scores: { violence: 0.9 }, result: 'block' }));
    const r = await make(f).moderationCheck([textItem('hello'), imageUrlItem('https://img.example/a.png')], { userId: 'u1' });
    assert.equal(r.ok, true);
    assert.equal(r.flagged, true);
    assert.equal(r.hasCategory('hate'), false);
    assert.equal(r.hasCategory('hate', 'violence'), true);
    assert.equal(r.categoryScores.violence, 0.9);
    assert.equal(r.raw.result, 'block');
    const c = f.calls[0];
    assert.equal(c.url, 'https://verify.captcha.la/v1/moderation/check');
    assert.deepEqual(c.body, {
      app_key: 'key_1', app_secret: 'secret_1', user_id: 'u1',
      input: [{ type: 'text', text: 'hello' }, { type: 'image_url', image_url: { url: 'https://img.example/a.png' } }],
    });
  });

  test('text', async () => {
    const f = mockFetch(ok({ flagged: false, categories: {} }));
    const r = await make(f).moderationText('hi');
    assert.equal(r.ok, true);
    assert.equal(r.flagged, false);
    assert.equal(f.calls[0].url, 'https://verify.captcha.la/v1/moderation/text');
    assert.equal(f.calls[0].body.text, 'hi');
  });

  test('empty input is rejected locally', async () => {
    const f = mockFetch(ok({}));
    assert.equal((await make(f).moderationCheck([])).error, 'empty_input');
    assert.equal((await make(f).moderationText('')).error, 'empty_text');
    assert.equal(f.calls.length, 0);
  });

  test('error envelope with top-level error / message', async () => {
    const r = await make(mockFetch(reply(401, { code: 1, error: 'invalid_credentials', message: 'bad credentials' }))).moderationText('hi');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'invalid_credentials');
    assert.equal(r.message, 'bad credentials');
    assert.ok(r.cause instanceof AuthenticationError);
  });

  test('not retried after a timeout', async () => {
    const f = mockFetch(hang());
    const r = await make(f, { timeoutMs: 30 }).moderationText('hi');
    assert.equal(f.calls.length, 1);
    assert.ok(r.cause instanceof TimeoutError);
  });

  test('retried after a connection failure', async () => {
    const f = mockFetch(connRefused(), ok({ flagged: false }));
    const r = await make(f).moderationText('hi');
    assert.equal(f.calls.length, 2);
    assert.equal(r.ok, true);
  });
});
