import { DatabaseSync } from 'node:sqlite';
import { initialState } from '../shared/fixtures.ts';
import type { State, PaperOrder } from '../shared/model.ts';
import { record } from './engine.ts';

export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), schema_version INTEGER NOT NULL, body TEXT NOT NULL);');
    this.db.exec('CREATE TABLE IF NOT EXISTS paper_orders (request_id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS paper_baseline (day TEXT PRIMARY KEY, equity REAL NOT NULL);');
    this.db.prepare('INSERT OR IGNORE INTO workspace VALUES (1, 1, ?)').run(JSON.stringify(initialState()));
    const row = this.db.prepare('SELECT schema_version FROM workspace WHERE id=1').get();
    if (row?.schema_version !== 1) throw new Error('지원하지 않는 저장 형식입니다. 원본 DB를 보존하세요.');
    this.update(state => {
      state.playing = false;
      const active = state.strategies.filter(s => s.active);
      active.forEach(s => { s.active = false; });
      if (active.length) record(state, '서버 재시작으로 전략 정지', '주문과 잔고를 확인한 뒤 개별 재개하세요.', 'warning');
    });
    for (const order of this.paperOrders()) if (order.status === 'sending') this.savePaper({ ...order, status: 'unknown', message: '전송 중 서버가 재시작되었습니다. KIS 계좌 대조가 필요합니다.' });
  }
  paperOrders(): PaperOrder[] { return this.db.prepare('SELECT body FROM paper_orders ORDER BY rowid DESC').all().map(row => JSON.parse(row.body as string) as PaperOrder); }
  savePaper(order: PaperOrder) { this.db.prepare('INSERT INTO paper_orders (request_id,body) VALUES (?,?) ON CONFLICT(request_id) DO UPDATE SET body=excluded.body').run(order.requestId, JSON.stringify(order)); }
  paperBaseline(day: string, value: number) {
    this.db.prepare('INSERT OR IGNORE INTO paper_baseline (day,equity) VALUES (?,?)').run(day, value);
    return Number(this.db.prepare('SELECT equity FROM paper_baseline WHERE day=?').get(day)!.equity);
  }
  read(): State {
    const row = this.db.prepare('SELECT body FROM workspace WHERE id=1').get();
    return JSON.parse(row!.body as string) as State;
  }
  update<T>(fn: (state: State) => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const state = this.read(); const result = fn(state); state.revision += 1;
      this.db.prepare('UPDATE workspace SET body=? WHERE id=1').run(JSON.stringify(state)); this.db.exec('COMMIT'); return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
