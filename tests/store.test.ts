import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.ts';

test('SQLite transaction rolls back and restart preserves data while stopping strategies', () => {
  const directory = mkdtempSync(join(tmpdir(), 'stock03-test-')); const path = join(directory, 'state.sqlite'); let store = new Store(path);
  try {
    const cash = store.read().cash;
    assert.throws(() => store.update(state => { state.cash = 1; throw new Error('rollback'); }), /rollback/);
    assert.equal(store.read().cash, cash);
    store.update(state => { state.strategies[0].active = true; state.risk.halted = true; state.journal.push({ id: 'test', date: '2026-11-14', code: '005930', text: '보존할 일지' }); });
    store.savePaper({ requestId: 'inflight', code: '005930', side: 'buy', qty: 1, price: 70000, createdAt: '2026-11-14', tradeDate: '20261114', status: 'sending', filled: 0, remaining: 1, message: '전송 중' });
    store.close(); store = new Store(path);
    assert.equal(store.read().strategies[0].active, false);
    assert.equal(store.read().risk.halted, true);
    assert.equal(store.read().journal[0].text, '보존할 일지');
    assert.equal(store.paperOrders()[0].status, 'unknown');
  } finally { store.close(); rmSync(directory, { recursive: true }); }
});
