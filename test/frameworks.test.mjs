import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CaptchaLaClient, clientIpFromHeaders } from '../dist/esm/index.js';
import { captchala } from '../dist/esm/express.js';
import { verifyRequest, withCaptchaLa } from '../dist/esm/next.js';
import { captchalaPreHandler } from '../dist/esm/fastify.js';
import { mockFetch, ok } from './helpers.mjs';

const answer = (data) => mockFetch(ok(data));
const make = (fetch) => new CaptchaLaClient({ appKey: 'k', appSecret: 's', fetch, retryBackoffMs: 0 });

function fakeRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
}

function runExpress(mw, req) {
  const res = fakeRes();
  return new Promise((resolve) => {
    const next = (err) => resolve({ res, nextCalled: true, err });
    mw(req, res, next);
    // failure path resolves through res.json
    const orig = res.json;
    res.json = (b) => (orig(b), resolve({ res, nextCalled: false }), res);
  });
}

describe('clientIpFromHeaders', () => {
  test('order and validation', () => {
    assert.equal(clientIpFromHeaders({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }), '1.1.1.1');
    assert.equal(clientIpFromHeaders({ 'x-forwarded-for': ' 2.2.2.2 , 3.3.3.3' }), '2.2.2.2');
    assert.equal(clientIpFromHeaders({ 'x-forwarded-for': 'garbage', 'x-real-ip': '4.4.4.4' }), '4.4.4.4');
    assert.equal(clientIpFromHeaders({}, '::ffff:5.5.5.5'), '5.5.5.5');
    assert.equal(clientIpFromHeaders({}, '2001:db8::1'), '2001:db8::1');
    assert.equal(clientIpFromHeaders(new Headers({ 'x-real-ip': '6.6.6.6' })), '6.6.6.6');
    assert.equal(clientIpFromHeaders({}), undefined);
  });
});

describe('express', () => {
  test('passes and attaches the result', async () => {
    const f = answer({ valid: true, action: 'login' });
    const mw = captchala({ client: make(f), expectedAction: 'login' });
    const req = { body: { captcha_token: 'pt_1' }, headers: { 'x-forwarded-for': '9.9.9.9' }, socket: { remoteAddress: '127.0.0.1' } };
    const { nextCalled, err } = await runExpress(mw, req);
    assert.equal(nextCalled, true);
    assert.equal(err, undefined);
    assert.equal(req.captchala.valid, true);
    assert.deepEqual(f.calls[0].body, { pass_token: 'pt_1', keep_token: false, client_ip: '9.9.9.9', expected_action: 'login' });
  });

  test('rejects with 400 JSON', async () => {
    const mw = captchala({ client: make(answer({ valid: false, error: 'token_expired' })) });
    const { res, nextCalled } = await runExpress(mw, { body: { captchala_token: 'pt_1' }, headers: {} });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'captcha_failed', code: 'token_expired' });
  });

  test('token from header, identity, custom IP', async () => {
    const f = answer({ valid: true });
    const mw = captchala({ client: make(f), getClientIp: () => '8.8.8.8', getIdentity: (req) => ({ bindUid: req.user.id }) });
    await runExpress(mw, { headers: { 'x-captcha-token': 'pt_h' }, user: { id: 'u7' } });
    assert.deepEqual(f.calls[0].body, { pass_token: 'pt_h', keep_token: false, client_ip: '8.8.8.8', bind_uid: 'u7' });
  });

  test('missing token -> empty_token without network', async () => {
    const f = answer({ valid: true });
    const { res } = await runExpress(captchala({ client: make(f) }), { headers: {} });
    assert.equal(res.body.code, 'empty_token');
    assert.equal(f.calls.length, 0);
  });

  test('allowDegraded', async () => {
    const mw = captchala({ client: make(answer({ valid: false, degraded: true, reason: 'quota_exhausted' })), allowDegraded: true });
    const req = { body: { captcha_token: 'dg_1' }, headers: {} };
    const { nextCalled } = await runExpress(mw, req);
    assert.equal(nextCalled, true);
    assert.equal(req.captchala.degraded, true);
  });

  test('custom onFailure', async () => {
    const mw = captchala({
      client: make(answer({ valid: false, error: 'x' })),
      onFailure: (result, req, res) => res.status(403).json({ nope: result.error }),
    });
    const { res } = await runExpress(mw, { body: { captcha_token: 'pt' }, headers: {} });
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { nope: 'x' });
  });
});

describe('next', () => {
  test('JSON body, handler gets the result, body still readable', async () => {
    const f = answer({ valid: true, uid: 'u1' });
    const POST = withCaptchaLa({ client: make(f), expectedAction: 'login' }, async (req, ctx, captcha) => {
      const body = await req.json();
      return new Response(JSON.stringify({ uid: captcha.uid, user: body.user, ctx }));
    });
    const req = new Request('https://app.example/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '7.7.7.7' },
      body: JSON.stringify({ captcha_token: 'pt_n', user: 'alice' }),
    });
    const res = await POST(req, { params: {} });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { uid: 'u1', user: 'alice', ctx: { params: {} } });
    assert.equal(f.calls[0].body.client_ip, '7.7.7.7');
    assert.equal(f.calls[0].body.pass_token, 'pt_n');
  });

  test('form body and failure response', async () => {
    const f = answer({ valid: false, error: 'hostname_mismatch' });
    const POST = withCaptchaLa({ client: make(f), expectedHostname: 'app.example' }, () => new Response('should not run'));
    const form = new URLSearchParams({ captchala_token: 'pt_f' });
    const res = await POST(new Request('https://app.example/x', { method: 'POST', body: form }), {});
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'captcha_failed', code: 'hostname_mismatch' });
    assert.equal(f.calls[0].body.pass_token, 'pt_f');
    assert.equal(f.calls[0].body.expected_hostname, 'app.example');
  });

  test('verifyRequest with header token', async () => {
    const f = answer({ valid: true });
    const r = await verifyRequest(new Request('https://a.example', { headers: { 'x-captcha-token': 'pt_hh' } }), { client: make(f) });
    assert.equal(r.valid, true);
    assert.equal(f.calls[0].body.pass_token, 'pt_hh');
  });
});

describe('fastify', () => {
  function fakeReply() {
    const reply = { statusCode: 200, payload: undefined };
    reply.code = (c) => ((reply.statusCode = c), reply);
    reply.send = (p) => ((reply.payload = p), reply);
    return reply;
  }

  test('passes', async () => {
    const f = answer({ valid: true });
    const hook = captchalaPreHandler({ client: make(f) });
    const request = { body: { captcha_token: 'pt_z' }, headers: {}, ip: '10.0.0.1' };
    const reply = fakeReply();
    assert.equal(await hook(request, reply), undefined);
    assert.equal(request.captchala.valid, true);
    assert.equal(f.calls[0].body.client_ip, '10.0.0.1');
  });

  test('rejects', async () => {
    const hook = captchalaPreHandler({ client: make(answer({ valid: false, error: 'token_already_used' })) });
    const reply = fakeReply();
    await hook({ body: { captcha_token: 'pt_z' }, headers: {} }, reply);
    assert.equal(reply.statusCode, 400);
    assert.deepEqual(reply.payload, { error: 'captcha_failed', code: 'token_already_used' });
  });
});
