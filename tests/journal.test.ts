import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { Store } from '../server/store.ts';
import { makeServer } from '../server/http.ts';
import { KisClient } from '../server/kis.ts';
import { storageErrorMessage } from '../shared/contracts.ts';

const headers = { 'Connection': 'close', 'Content-Type': 'application/json', 'X-Workbench': 'local' };

test('journal API rejects blank/invalid input and rolls back a real SQLite write failure', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stock03-journal-')), path = join(directory, 'state.sqlite');
  const store = new Store(path), db = new DatabaseSync(path);
  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4334]);
  server.listen(4334, '127.0.0.1'); await once(server, 'listening');
  const post = (data: unknown) => fetch('http://127.0.0.1:4334/api/journal', { method: 'POST', headers, body: JSON.stringify(data) });
  try {
    const before = store.read();
    for (const text of ['', ' \n\t ', 'x'.repeat(2001)]) assert.equal((await post({ code: '005930', text })).status, 400);
    assert.equal((await post({ code: '999999', text: '지원하지 않는 종목' })).status, 400);
    assert.deepEqual(store.read(), before);
    const text = '<img src=x onerror="alert(1)">\n삼성 관찰; DROP TABLE workspace;';
    assert.equal((await post({ code: '005930', text: `  ${text}  ` })).status, 200);
    assert.equal(store.read().journal[0].text, text);
    assert.equal(store.read().journal[0].code, '005930');
    const saved = store.read();
    db.exec("CREATE TRIGGER reject_journal BEFORE UPDATE ON workspace BEGIN SELECT RAISE(ABORT, 'fixture disk failure at /private/state.sqlite'); END");
    const failed = await post({ code: '005930', text: '실패 시 저장하지 않음' });
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: storageErrorMessage });
    assert.deepEqual(store.read(), saved);
    db.exec('DROP TRIGGER reject_journal');
    assert.equal((await post({ code: '005930', text: '다시 저장' })).status, 200);
    assert.equal(store.read().journal.length, saved.journal.length + 1);
    assert.deepEqual(store.read().orders, before.orders);
  } finally { server.closeAllConnections(); server.close(); await once(server, 'close'); db.close(); store.close(); rmSync(directory, { recursive: true }); }
});

test('journal survives a real server process restart with the same SQLite file', { timeout: 20000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stock03-journal-restart-'));
  const env = { ...process.env, STOCK_PORT: '4335', STOCK_DB: join(directory, 'state.sqlite'), KIS_APP_KEY: '', KIS_APP_SECRET: '', KIS_CANO: '', KIS_ACNT_PRDT_CD: '' };
  const start = async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      await new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', code => reject(new Error(`server exited before ready: ${code}`)));
        child.stdout.on('data', bytes => { if (String(bytes).includes('GON Stock local server:')) resolve(); });
      });
      return child;
    } catch (error) { child.kill(); throw error; }
  };
  const stop = async (child: Awaited<ReturnType<typeof start>>) => { const exited = once(child, 'exit'); child.kill('SIGTERM'); const [code] = await exited; assert.equal(code, 0); };
  let child = await start();
  try {
    const text = '<script>not executable</script>\n재시작 보존';
    const response = await fetch('http://127.0.0.1:4335/api/journal', { method: 'POST', headers, body: JSON.stringify({ code: '005930', text }) });
    assert.equal(response.status, 200); await response.json();
    const read = async () => (await fetch('http://127.0.0.1:4335/api/state', { headers })).json();
    const before = await read();
    assert.equal(before.journal[0].text, text); assert.ok(before.journal[0].id); assert.ok(Number.isFinite(Date.parse(before.journal[0].date)));
    await stop(child); child = await start();
    const after = await read();
    assert.notEqual(after.instanceId, before.instanceId);
    assert.deepEqual(after.journal, before.journal);
    assert.deepEqual(after.orders, before.orders);
  } finally { if (child.exitCode === null) await stop(child); rmSync(directory, { recursive: true }); }
});
