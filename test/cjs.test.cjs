// The CommonJS build loads and works.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const sdk = require('../dist/cjs/index.js');
const { captchala } = require('../dist/cjs/express.js');
const { withCaptchaLa } = require('../dist/cjs/next.js');
const { captchalaPreHandler } = require('../dist/cjs/fastify.js');

test('cjs exports', async () => {
  assert.equal(typeof sdk.CaptchaLaClient, 'function');
  assert.equal(sdk.Client, sdk.CaptchaLaClient);
  assert.equal(sdk.VERSION, '1.0.0');
  assert.equal(typeof captchala, 'function');
  assert.equal(typeof withCaptchaLa, 'function');
  assert.equal(typeof captchalaPreHandler, 'function');
  const fetch = async () => new Response(JSON.stringify({ code: 0, data: { valid: false, error: 'token_not_found' } }), { status: 200 });
  const r = await new sdk.CaptchaLaClient({ appKey: 'k', appSecret: 's', fetch }).validate('pt_x');
  assert.equal(r.error, 'token_not_found');
});

test('package exports resolve by name', () => {
  const pkg = require('@captcha-la/node/package.json');
  assert.equal(pkg.name, '@captcha-la/node');
});
