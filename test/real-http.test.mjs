// Exercises the real global fetch against a local HTTP server.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { CaptchaLaClient, NetworkError, TimeoutError, resetReachabilityCache } from '../dist/esm/index.js';

let server;
let base;
let closedA;
let closedB;

/** A localhost port nothing listens on (fetch blocks well-known ports such as 1). */
async function closedPort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return `http://127.0.0.1:${port}`;
}
const hits = [];

before(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      hits.push({ url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null });
      const token = hits.at(-1).body?.pass_token;
      if (token === 'pt_slow') return; // never answer: timeout
      if (token === 'pt_flaky' && hits.filter((h) => h.body?.pass_token === 'pt_flaky').length === 1) {
        res.writeHead(503).end('busy');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: 0, msg: 'success', data: token === 'pt_good' || token === 'pt_flaky' ? { valid: true, action: 'login' } : { valid: false, error: 'token_not_found' } }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  closedA = await closedPort();
  closedB = await closedPort();
});

after(() => {
  server.closeAllConnections?.();
  server.close();
});

const client = (extra = {}) => new CaptchaLaClient({ appKey: 'k', appSecret: 's', baseUrl: base, retryBackoffMs: 0, ...extra });

describe('real fetch', () => {
  test('success and invalid', async () => {
    assert.equal((await client().validate('pt_good')).valid, true);
    const bad = await client().validate('pt_bogus');
    assert.equal(bad.valid, false);
    assert.equal(bad.error, 'token_not_found');
    const h = hits.at(-1);
    assert.equal(h.url, '/v1/validate');
    assert.equal(h.headers['x-app-key'], 'k');
    assert.equal(h.headers['x-app-secret'], 's');
  });

  test('503 then success', async () => {
    const r = await client().validate('pt_flaky');
    assert.equal(r.valid, true);
  });

  test('timeout', async () => {
    const r = await client({ timeoutMs: 100, maxRetries: 0 }).validate('pt_slow');
    assert.equal(r.valid, false);
    assert.ok(r.cause instanceof TimeoutError);
  });

  test('connection refused is retried and flagged connectFailed', async () => {
    const r = await new CaptchaLaClient({ appKey: 'k', appSecret: 's', baseUrl: closedA, retryBackoffMs: 0, maxRetries: 1 }).validate('pt_x');
    assert.equal(r.error, 'request_failed');
    assert.ok(r.cause instanceof NetworkError);
    assert.equal(r.cause.connectFailed, true);
  });

  test('client-only token accepted only when both endpoints are down', async () => {
    resetReachabilityCache();
    const down = new CaptchaLaClient({ appKey: 'k', appSecret: 's', baseUrl: closedA, backupUrl: closedB });
    assert.equal((await down.validate('co_x')).valid, true);
    resetReachabilityCache();
    const up = client({ backupUrl: closedB });
    assert.equal((await up.validate('co_x')).valid, false);
  });
});
