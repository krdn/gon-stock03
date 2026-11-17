import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const fixture = `
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
let requests = 0;
const timeout = AbortSignal.timeout;
AbortSignal.timeout = milliseconds => {
  assert.equal(milliseconds, 15000);
  return timeout(milliseconds);
};
globalThis.fetch = async (url, init) => {
  requests++;
  assert.equal(url, 'https://openapivts.koreainvestment.com:29443/oauth2/Approval');
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'error');
  assert.equal(new Headers(init.headers).get('Content-Type'), 'application/json');
  assert.ok(init.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(init.body), { grant_type: 'client_credentials', appkey: 'fixture-app', secretkey: 'fixture-secret' });
  console.log('AUTH_REQUEST');
  if (process.env.CASE === 'http') return new Response('private-response', { status: 403 });
  if (process.env.CASE === 'json') return new Response('private-response');
  if (process.env.CASE === 'network') throw new Error('private-response');
  if (process.env.CASE === 'timeout') throw new DOMException('private-response', 'TimeoutError');
  if (process.env.CASE === 'empty') return Response.json({ approval_key: ' ' });
  return Response.json({ approval_key: 'fixture-approval' });
};
cp.spawn = (command, args, options) => {
  const env = options?.env ?? process.env;
  assert.equal(command, 'npm');
  assert.equal(env.STOCK_DB, '/fixture/preserved.sqlite');
  assert.equal(env.KIS_PAPER_APPROVAL, 'preserved-approval');
  if (process.env.CASE === 'default') assert.equal(requests, 0);
  else {
    assert.equal(requests, 1);
    assert.equal(env.KIS_WS_APPROVAL_KEY, args[1] === 'dev:server' ? 'fixture-approval' : undefined);
  }
  console.log('CHILD ' + args[1]);
  const child = new EventEmitter(); child.kill = () => true;
  process.nextTick(() => child.emit('exit', 0));
  return child;
};
syncBuiltinESMExports();
`;

function run(mode: string, overrides: NodeJS.ProcessEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gon-ws-startup-'));
  try {
    const preload = join(dir, 'preload.mjs'); writeFileSync(preload, fixture);
    return spawnSync(process.execPath, ['--import', 'tsx', '--import', pathToFileURL(preload).href, 'scripts/dev.ts', ...(mode === 'default' ? [] : ['--realtime'])], {
      encoding: 'utf8', timeout: 10000,
      env: { ...process.env, CASE: mode, KIS_APP_KEY: 'fixture-app', KIS_APP_SECRET: 'fixture-secret', KIS_HTS_ID: 'fixture-hts', KIS_WS_APPROVAL_KEY: 'stale-approval', KIS_WS_SESSION: '{"date":"2026-11-18","open":"09:00","close":"15:30","verified":true}', STOCK_DB: '/fixture/preserved.sqlite', KIS_PAPER_APPROVAL: 'preserved-approval', ...overrides },
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('기본 dev는 인증 없이 기존 실행을 유지한다', () => {
  const result = run('default');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CHILD dev:server/);
  assert.match(result.stdout, /CHILD dev:web/);
  assert.doesNotMatch(result.stdout, /AUTH_REQUEST/);
});

test('명시 실행은 접속키를 한 번 발급해 서버에만 전달하고 기존 원장·승인을 보존한다', () => {
  const result = run('success');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /AUTH_REQUEST/);
  assert.match(result.stdout, /CHILD dev:server/);
  assert.match(result.stdout, /CHILD dev:web/);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-approval|fixture-secret|stale-approval/);
});

for (const mode of ['http', 'json', 'network', 'timeout', 'empty']) {
  test(`발급 실패(${mode})는 자식을 시작하지 않고 비밀 원문을 숨긴다`, () => {
    const result = run(mode);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /WebSocket 준비 실패/);
    assert.match(result.stdout, /AUTH_REQUEST/);
    assert.doesNotMatch(result.stdout + result.stderr, /CHILD|private-response|fixture-secret|stale-approval/);
  });
}

for (const overrides of [
  { KIS_APP_KEY: '' }, { KIS_APP_SECRET: '' }, { KIS_HTS_ID: ' ' }, { KIS_WS_SESSION: '' },
  { KIS_WS_SESSION: 'private-invalid-json' },
  { KIS_WS_SESSION: '{"date":"2026-11-18","open":"09:00","close":"15:30","verified":false}' },
]) {
  test(`설정 오류는 인증과 앱 시작 전에 차단: ${Object.keys(overrides)[0]} ${Object.values(overrides)[0]}`, () => {
    const result = run('invalid', overrides);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /WebSocket 준비 실패/);
    assert.doesNotMatch(result.stdout + result.stderr, /AUTH_REQUEST|CHILD|private-invalid-json|fixture-secret/);
  });
}
