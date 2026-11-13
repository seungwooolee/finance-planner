import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import { ApiError, requestJson } from '../src/lib/dion/wake-retry.ts';
import { feedbackLink, reviewToolsEnabled } from '../src/lib/dion/beta-config.ts';

const response = (status, value = {}) => Response.json(value, { status });
function clock(send) {
  let elapsed = 0;
  const waits = [];
  return { runtime: { fetch: send, now: () => elapsed, sleep: async ms => { waits.push(ms); elapsed += ms; } }, waits, elapsed: () => elapsed };
}

test('503 HTML/JSON and network errors back off, preserving request identity', async () => {
  const sent = [], states = [];
  const fake = clock(async (path, init) => {
    sent.push({ path, ...init });
    if (sent.length === 1) return new Response('<html>Starting</html>', { status: 503 });
    if (sent.length === 2) throw new TypeError('Failed to fetch');
    if (sent.length === 3) return response(503, { detail: { code: 'TEMPORARY' } });
    return response(200, { run_id: 'same-run' });
  });
  const value = await requestJson('/api/save', { method: 'POST', body: { request_key: 'original-key', amount: '00100.00' }, token: 'test-token', onState: state => states.push(state) }, fake.runtime);
  assert.deepEqual(value, { run_id: 'same-run' });
  assert.deepEqual(fake.waits, [1000, 2000, 4000]);
  assert.equal(new Set(sent.map(s => s.body)).size, 1);
  assert.ok(sent.every(s => s.headers.Authorization === 'Bearer test-token'));
  assert.ok(states.some(s => s.waiting));
  assert.deepEqual(states.at(-1), { waiting: false, exhausted: false });
});

test('persistent 503 stops at 90 seconds and retains the existing error code', async () => {
  const states = [], fake = clock(async () => response(503, { detail: { code: 'DB_CONFIG_MISSING' } }));
  await assert.rejects(requestJson('/api/save', { onState: state => states.push(state) }, fake.runtime), e => e instanceof ApiError && e.status === 503 && e.code === 'DB_CONFIG_MISSING');
  assert.equal(fake.elapsed(), 90000);
  assert.deepEqual(fake.waits.slice(0, 5), [1000, 2000, 4000, 8000, 10000]);
  assert.deepEqual(states.at(-1), { waiting: false, exhausted: true });
});

for (const status of [400, 401, 409, 422, 429, 500]) test(`${status} is never retried`, async () => {
  let count = 0;
  const fake = clock(async () => { count++; return response(status, { detail: { code: 'EXISTING_CODE' } }); });
  await assert.rejects(requestJson('/api/test', {}, fake.runtime), e => e instanceof ApiError && e.code === 'EXISTING_CODE');
  assert.equal(count, 1);
  assert.deepEqual(fake.waits, []);
});

test('network exhaustion retains the error and offers manual retry state', async () => {
  const failure = new TypeError('offline'), states = [], fake = clock(async () => { throw failure; });
  await assert.rejects(requestJson('/api/test', { onState: s => states.push(s) }, fake.runtime), e => e === failure);
  assert.equal(fake.elapsed(), 90000);
  assert.ok(states.at(-1).exhausted);
});

test('a hanging fetch is bounded by the total deadline', async () => {
  const states = [];
  await assert.rejects(requestJson('/api/test', { onState: s => states.push(s) }, {
    budgetMs: 15,
    fetch: (_path, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
  }), { name: 'TimeoutError' });
  assert.ok(states.at(-1).exhausted);
});

test('caller cancellation stops backoff without exposing retry for a stale request', async () => {
  const controller = new AbortController(), states = [];
  await assert.rejects(requestJson('/api/test', { signal: controller.signal, onState: s => states.push(s) }, {
    fetch: async () => response(503), sleep: async () => { controller.abort(); throw controller.signal.reason; },
  }), { name: 'AbortError' });
  assert.deepEqual(states.at(-1), { waiting: false, exhausted: false });
});

test('review tools are opt-in and feedback is optional and safe', () => {
  for (const value of [undefined, '', 'false', 'TRUE', '1']) assert.equal(reviewToolsEnabled(value), false);
  assert.equal(reviewToolsEnabled('true'), true);
  for (const value of [undefined, '', 'javascript:alert(1)', 'not a URL']) assert.equal(feedbackLink(value), null);
  assert.equal(feedbackLink('https://example.test/feedback'), 'https://example.test/feedback');
});

// Compile just the new JSX components with the already installed TypeScript;
// Node's built-in TS loader handles the transport directly. No browser/server.
const require = createRequire(import.meta.url);
const ts = require('typescript');
function component(path) {
  const file = new URL(path, import.meta.url);
  const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  const localRequire = name => name === '../lib/dion/beta-config' ? { feedbackLink } : require(name);
  new Script(`(function(require,exports){${output}\n})`, { filename: file.pathname }).runInThisContext()(localRequire, exports);
  return exports;
}
const { createElement } = require('react'), { renderToStaticMarkup: render } = require('react-dom/server');
const { ServerWakeNotice } = component('../src/components/server-wake-notice.tsx');
const { BetaNotice } = component('../src/components/beta-notice.tsx');

test('waiting, exhausted and recovered notices render the requested states', () => {
  assert.match(render(createElement(ServerWakeNotice, { waiting: true, exhausted: false, onRetry() {} })), /서버 준비 중이에요\(최대 1분\)/);
  assert.match(render(createElement(ServerWakeNotice, { waiting: false, exhausted: true, onRetry() {} })), /다시 시도/);
  assert.equal(render(createElement(ServerWakeNotice, { waiting: false, exhausted: false, onRetry() {} })), '');
});

test('beta banner omits feedback unless configured', () => {
  const original = process.env.NEXT_PUBLIC_FEEDBACK_URL;
  try {
    delete process.env.NEXT_PUBLIC_FEEDBACK_URL;
    const missing = render(createElement(BetaNotice));
    assert.match(missing, /가상 데이터만 입력해 주세요/);
    assert.doesNotMatch(missing, /<a\b|피드백:/);
    process.env.NEXT_PUBLIC_FEEDBACK_URL = 'https://example.test/feedback';
    assert.match(render(createElement(BetaNotice)), /href="https:\/\/example.test\/feedback"/);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_FEEDBACK_URL;
    else process.env.NEXT_PUBLIC_FEEDBACK_URL = original;
  }
});
