import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { initialState } from '../shared/fixtures.ts';
import type { State, PaperOrder, PaperAudit } from '../shared/model.ts';
import type { Experiment } from '../shared/backtest.ts';
import { record } from './engine.ts';
import type { DailyRun, MasterInstrument, MasterSnapshot, MasterState, RemovedInstrument, StoredBar } from '../shared/market-data.ts';

export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), schema_version INTEGER NOT NULL, body TEXT NOT NULL);');
    this.db.exec('CREATE TABLE IF NOT EXISTS paper_orders (request_id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS paper_baseline (day TEXT PRIMARY KEY, equity REAL NOT NULL);');
    this.db.exec('CREATE TABLE IF NOT EXISTS paper_audit (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, body TEXT NOT NULL); CREATE INDEX IF NOT EXISTS paper_audit_request ON paper_audit(request_id);');
    this.db.exec('CREATE TABLE IF NOT EXISTS market_master (exchange TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS market_instruments (code TEXT PRIMARY KEY, exchange TEXT NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS daily_runs (id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS daily_bars (run_id TEXT NOT NULL, date TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(run_id,date));');
    this.db.exec('CREATE TABLE IF NOT EXISTS backtest_experiments (id TEXT PRIMARY KEY, body TEXT NOT NULL);');
    this.db.exec('CREATE TABLE IF NOT EXISTS market_removed (code TEXT PRIMARY KEY, body TEXT NOT NULL);');
    this.db.prepare('INSERT OR IGNORE INTO workspace VALUES (1, 1, ?)').run(JSON.stringify(initialState()));
    const row = this.db.prepare('SELECT schema_version FROM workspace WHERE id=1').get();
    if (row?.schema_version !== 1) throw new Error('지원하지 않는 저장 형식입니다. 원본 DB를 보존하세요.');
    this.update(state => {
      state.playing = false;
      const active = state.strategies.filter(s => s.active);
      active.forEach(s => { s.active = false; });
      if (active.length) record(state, '서버 재시작으로 전략 정지', '주문과 잔고를 확인한 뒤 개별 재개하세요.', 'warning');
    });
    for (const order of this.paperOrders()) if (order.status === 'sending') this.savePaper({ ...order, status: 'unknown', message: '전송 중 서버가 재시작되었습니다. KIS 계좌 대조가 필요합니다.' }, { actor: 'system', action: 'restart', before: 'sending' });
    for (const run of this.dailyRuns()) if (run.status.phase === 'loading') this.saveDaily({ ...run, status: { ...run.status, phase: 'partial', complete: false, error: '수집 중 서버가 재시작되었습니다. 마지막 저장 구간부터 재개하세요.' } });
    this.saveMasterStates(this.masterData().sources.filter(state => state.phase === 'loading').map(state => ({ ...state, phase: 'error', error: '마스터 수집 중 서버가 재시작되었습니다. 다시 수집하세요.' })));
  }
  masterData() {
    return {
      sources: this.db.prepare('SELECT body FROM market_master ORDER BY exchange').all().map(row => JSON.parse(row.body as string) as MasterState),
      instruments: this.db.prepare('SELECT body FROM market_instruments ORDER BY code').all().map(row => JSON.parse(row.body as string) as MasterInstrument),
      removed: this.db.prepare('SELECT body FROM market_removed ORDER BY code').all().map(row => JSON.parse(row.body as string) as RemovedInstrument),
    };
  }
  saveMasters(snapshots: MasterSnapshot[]) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const nextCodes = new Set(snapshots.flatMap(snapshot => snapshot.rows.map(row => row.code)));
      const removed = this.db.prepare('INSERT OR REPLACE INTO market_removed VALUES (?,?)');
      for (const row of this.masterData().instruments) if (!nextCodes.has(row.code)) removed.run(row.code, JSON.stringify({ ...row, removedAt: new Date().toISOString() }));
      this.db.exec('DELETE FROM market_instruments');
      const insert = this.db.prepare('INSERT INTO market_instruments VALUES (?,?,?)');
      const reappeared = this.db.prepare('DELETE FROM market_removed WHERE code=?');
      for (const snapshot of snapshots) {
        for (const row of snapshot.rows) { insert.run(row.code, row.exchange, JSON.stringify(row)); reappeared.run(row.code); }
        const state: MasterState = { exchange: snapshot.exchange, source: snapshot.source, phase: 'ready', observedAt: snapshot.collectedAt, lastSuccessAt: snapshot.collectedAt, error: null, sha256: snapshot.sha256, count: snapshot.rows.length };
        this.db.prepare('INSERT INTO market_master VALUES (?,?) ON CONFLICT(exchange) DO UPDATE SET body=excluded.body').run(state.exchange, JSON.stringify(state));
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  saveMasterStates(states: MasterState[]) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const insert = this.db.prepare('INSERT INTO market_master VALUES (?,?) ON CONFLICT(exchange) DO UPDATE SET body=excluded.body');
      for (const state of states) insert.run(state.exchange, JSON.stringify(state));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  dailyRuns(): DailyRun[] { return this.db.prepare('SELECT body FROM daily_runs ORDER BY rowid DESC').all().map(row => JSON.parse(row.body as string) as DailyRun); }
  dailyRun(id: string): DailyRun | undefined { const row = this.db.prepare('SELECT body FROM daily_runs WHERE id=?').get(id); return row ? JSON.parse(row.body as string) as DailyRun : undefined; }
  dailyBars(id: string): StoredBar[] { return this.db.prepare('SELECT body FROM daily_bars WHERE run_id=? ORDER BY date').all(id).map(row => JSON.parse(row.body as string) as StoredBar); }
  saveDaily(run: DailyRun, bars: StoredBar[] = []) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const insert = this.db.prepare('INSERT INTO daily_bars VALUES (?,?,?)');
      for (const bar of bars) insert.run(run.id, bar.date, JSON.stringify(bar));
      this.db.prepare('INSERT INTO daily_runs VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(run.id, JSON.stringify(run));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  experiments() { return this.db.prepare('SELECT body FROM backtest_experiments ORDER BY rowid DESC').all().map(row => {
    const experiment = JSON.parse(row.body as string) as Experiment;
    return { id: experiment.id, createdAt: experiment.createdAt, input: experiment.snapshot.input, bars: experiment.snapshot.bars.length };
  }); }
  experiment(id: string): Experiment | undefined { const row = this.db.prepare('SELECT body FROM backtest_experiments WHERE id=?').get(id); return row ? JSON.parse(row.body as string) as Experiment : undefined; }
  saveExperiment(experiment: Experiment) { this.db.prepare('INSERT OR IGNORE INTO backtest_experiments VALUES (?,?)').run(experiment.id, JSON.stringify(experiment)); }
  paperOrders(): PaperOrder[] { return this.db.prepare('SELECT body FROM paper_orders ORDER BY rowid DESC').all().map(row => JSON.parse(row.body as string) as PaperOrder); }
  hasPaperRun() { return Boolean(this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='paper_run'").get()); }
  configurePaperRun(approval: { date: string; requestId: string }) {
    this.db.exec('CREATE TABLE IF NOT EXISTS paper_run (id INTEGER PRIMARY KEY CHECK(id=1), day TEXT NOT NULL, request_id TEXT NOT NULL, attempted INTEGER NOT NULL DEFAULT 0);');
    this.db.prepare('INSERT OR IGNORE INTO paper_run (id,day,request_id) VALUES (1,?,?)').run(approval.date, approval.requestId);
    const row = this.db.prepare('SELECT day,request_id,attempted FROM paper_run WHERE id=1').get()!;
    if (row.day !== approval.date || row.request_id !== approval.requestId) throw new Error('저장된 1회 승인과 실행 설정이 다릅니다. 원장을 초기화하지 마세요.');
    return Boolean(row.attempted);
  }
  claimPaperRun() {
    const result = this.db.prepare('UPDATE paper_run SET attempted=1 WHERE id=1 AND attempted=0').run();
    if (result.changes !== 1) throw new Error('1회 실행 승인을 이미 사용했습니다. 재전송하지 마세요.');
  }
  claimPaperCancel(order: PaperOrder) {
    this.db.exec('CREATE TABLE IF NOT EXISTS paper_cancel_attempt (request_id TEXT PRIMARY KEY);');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const run = this.db.prepare('SELECT request_id,attempted FROM paper_run WHERE id=1').get();
      if (run?.request_id !== order.requestId || run.attempted !== 1) throw new Error('사용된 원주문 승인이 없습니다.');
      const result = this.db.prepare('INSERT OR IGNORE INTO paper_cancel_attempt VALUES (?)').run(order.requestId);
      if (result.changes !== 1) throw new Error('전량취소를 이미 시도했습니다. 재전송하지 마세요.');
      this.db.prepare('UPDATE paper_orders SET body=? WHERE request_id=?').run(JSON.stringify(order), order.requestId);
      this.appendPaperAudit({ requestId: order.requestId, actor: 'local-user', action: 'cancel-attempt', before: null, after: 'unknown' });
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  savePaper(order: PaperOrder, audit?: Omit<PaperAudit, 'id' | 'at' | 'requestId' | 'after'>) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO paper_orders (request_id,body) VALUES (?,?) ON CONFLICT(request_id) DO UPDATE SET body=excluded.body').run(order.requestId, JSON.stringify(order));
      if (audit) this.appendPaperAudit({ ...audit, requestId: order.requestId, after: order.status });
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  appendPaperAudit(audit: Omit<PaperAudit, 'id' | 'at'>): PaperAudit {
    const entry = { ...audit, id: randomUUID(), at: new Date().toISOString() };
    this.db.prepare('INSERT INTO paper_audit VALUES (?,?,?)').run(entry.id, entry.requestId, JSON.stringify(entry)); return entry;
  }
  paperAudit(requestId: string): PaperAudit[] { return this.db.prepare('SELECT body FROM paper_audit WHERE request_id=? ORDER BY rowid').all(requestId).map(row => JSON.parse(row.body as string) as PaperAudit); }
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
