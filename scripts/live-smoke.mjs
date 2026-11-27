// Live smoke test against the real API. Never solves a challenge.
//   CAPTCHALA_APP_KEY=... CAPTCHALA_APP_SECRET=... node scripts/live-smoke.mjs
// Prints no secrets and no full tokens.
import { CaptchaLaClient } from '../dist/esm/index.js';

let failed = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!cond) failed++;
};

const client = new CaptchaLaClient();

const bogus = await client.validate('pt_sdk_smoke_bogus_token', { clientIp: '203.0.113.7', expectedAction: 'login' });
check('bogus token is invalid', bogus.valid === false && typeof bogus.error === 'string' && bogus.cause === undefined, `error=${bogus.error}`);

const empty = await client.validate('');
check('empty token rejected locally', empty.error === 'empty_token');

const wrong = await new CaptchaLaClient({ appKey: client.appKey, appSecret: 'wrong-secret' }).validate('pt_x');
check('wrong secret -> AuthenticationError', wrong.cause?.name === 'AuthenticationError', `error=${wrong.error}`);

const issued = await client.issueServerToken('login', { ttl: 60, maxUses: 1 });
check('issue server token', issued.ok && /^sct_/.test(issued.token ?? ''), issued.ok ? `token=${issued.token.slice(0, 8)}..., expiresIn=${issued.expiresIn}` : `error=${issued.error}`);

const pass = await new CaptchaLaClient({ appKey: 'test_pass_7f3c9a2e5b18d4f6', appSecret: 'test_secret_pass_c41e8b0d27a95f3e' }).validate('pt_anything');
check('public always-pass test key', pass.valid && pass.test, `riskLevel=${pass.riskLevel}`);

const fail = await new CaptchaLaClient({ appKey: 'test_fail_2d9e6b4a0c7f1835', appSecret: 'test_secret_fail_9b5f03e7d1a46c28' }).validate('pt_anything');
check('public always-fail test key', !fail.valid && fail.error === 'test_always_fail');

const swapped = await new CaptchaLaClient({ appKey: 'test_pass_7f3c9a2e5b18d4f6', appSecret: 'test_secret_fail_9b5f03e7d1a46c28' }).validate('pt_anything');
check('test key with wrong secret -> invalid_app_secret', !swapped.valid && swapped.error === 'invalid_app_secret' && swapped.cause?.name === 'AuthenticationError');

process.exit(failed ? 1 : 0);
