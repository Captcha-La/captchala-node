// Test helpers: a scripted fetch mock that records every call.

/** Build a fetch Response with a JSON (or raw string) body. */
export function reply(status, body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, { status, headers: { 'content-type': 'application/json', ...headers } });
}

/** A rejection that looks like undici's "connection refused". */
export function connRefused() {
  return new TypeError('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) });
}

/** A rejection that looks like a reset after the request was sent. */
export function connReset() {
  return new TypeError('fetch failed', { cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) });
}

/** A handler that never answers until aborted (to exercise timeouts). */
export function hang() {
  return (_url, init) =>
    new Promise((_resolve, reject) => {
      if (init.signal.aborted) return reject(new DOMException('aborted', 'AbortError'));
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
}

/**
 * mockFetch(step1, step2, ...): each step is a Response, an Error (rejected),
 * or a function (url, init, call) => Response | Promise<Response>. The last
 * step repeats. `calls` records { url, init, headers, body }.
 */
export function mockFetch(...steps) {
  const calls = [];
  const fn = async (url, init) => {
    const headers = new Headers(init.headers);
    const call = { url, init, headers, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    if (typeof step === 'function') return step(url, init, call);
    return step.clone();
  };
  fn.calls = calls;
  return fn;
}

export const ok = (data) => reply(200, { code: 0, msg: 'success', data });
