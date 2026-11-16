import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.ts';
import { makeServer } from '../server/http.ts';
import { KisClient } from '../server/kis.ts';

test('static HTTP errors and successful routes stay isolated from API and broker I/O', async t => {
  const cwd = process.cwd();
  const root = await mkdtemp(join(tmpdir(), 'stock-static-'));
  const store = new Store(':memory:');
  let calls = 0;
  const kis = new KisClient({ key: '', secret: '', account: '', product: '' }, async () => {
    calls++; throw new Error('Unexpected broker request');
  });
  const server = makeServer(store, kis, [4319], undefined, { config: { approvalKey: '', htsId: '', session: { date: '2026-11-16', open: '09:00', close: '15:30', verified: true } }, connect: () => { throw new Error('Unexpected WebSocket'); } });
  process.chdir(root);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const read = (path: string, method = 'GET', body?: string) => new Promise<{ status: number | undefined; headers: import('node:http').IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: address.port, path, method, headers: { Host: '127.0.0.1:4319', 'Content-Type': 'application/json', 'X-Workbench': 'local' } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text }));
      res.on('error', reject);
    });
    req.on('error', reject); req.end(body);
  });
  const paths = ['/dashboard', '/assets/missing.js', '/project-map.html'];
  const errors = async (status: number, message: string) => {
    for (const path of paths) for (const method of ['GET', 'HEAD']) {
      const response = await read(path, method);
      assert.equal(response.status, status, `${method} ${path}`);
      assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.equal(response.body, method === 'HEAD' ? '' : JSON.stringify({ error: message }));
      assert.ok(!JSON.stringify(response).includes(root));
    }
  };
  t.beforeEach(async () => { await rm('dist', { recursive: true, force: true }); });
  try {
    await t.test('absent dist returns safe 404 for GET and bodyless HEAD', async () => {
      await errors(404, '파일이 없습니다.');
    });
    await t.test('missing files inside dist return safe 404', async () => {
      await mkdir('dist/assets', { recursive: true });
      await errors(404, '파일이 없습니다.');
    });
    await t.test('non-directory path component returns safe 404', async () => {
      await writeFile('dist', 'not a directory');
      await errors(404, '파일이 없습니다.');
    });
    await t.test('unreadable directory targets return safe 500', async () => {
      for (const file of ['index.html', 'assets/missing.js', 'project-map.html']) await mkdir(join('dist', file), { recursive: true });
      await errors(500, '파일을 읽지 못했습니다.');
    });
    await t.test('normal files and SPA retain content, MIME and security headers', async () => {
      await mkdir('dist/assets', { recursive: true });
      const files = [
        ['index.html', '<html>SPA fixture</html>', 'text/html; charset=utf-8'],
        ['project-map.html', '<html>Map fixture</html>', 'text/html; charset=utf-8'],
        ['assets/app.js', 'export {};', 'text/javascript; charset=utf-8'],
        ['assets/app.css', 'body {}', 'text/css; charset=utf-8'],
      ];
      for (const [file, content] of files) await writeFile(join('dist', file), content);
      for (const [file, content, type] of [...files, ['dashboard', files[0][1], files[0][2]]]) for (const method of ['GET', 'HEAD']) {
        const response = await read('/' + file, method);
        assert.equal(response.status, 200); assert.equal(response.body, method === 'HEAD' ? '' : content);
        assert.equal(response.headers['content-type'], type); assert.equal(response.headers['cache-control'], 'no-cache');
        assert.equal(response.headers['x-content-type-options'], 'nosniff');
        assert.equal(response.headers['referrer-policy'], 'no-referrer'); assert.equal(response.headers['x-frame-options'], 'DENY');
      }
    });
    await t.test('API errors and method restrictions retain their contract', async () => {
      const state = await read('/api/state'); assert.equal(state.status, 200); assert.equal(JSON.parse(state.body).status.environment, 'demo');
      const invalid = await read('/api/risk/halt', 'POST', '{"halted":"false"}');
      assert.equal(invalid.status, 400); assert.deepEqual(JSON.parse(invalid.body), { error: '입력값을 확인하세요. 범위·필수 항목 또는 단기/장기 기간이 올바르지 않습니다.' });
      const unknown = await read('/api/missing', 'POST', '{}');
      assert.equal(unknown.status, 400); assert.deepEqual(JSON.parse(unknown.body), { error: '지원하지 않는 API입니다.' });
      assert.equal((await read('/api/missing')).status, 405);
      assert.equal((await read('/dashboard', 'POST')).status, 405);
      assert.equal(store.read().risk.halted, false);
    });
  } finally {
    server.closeAllConnections(); server.close(); await once(server, 'close');
    store.close(); process.chdir(cwd); await rm(root, { recursive: true, force: true });
    assert.equal(calls, 0);
  }
});
