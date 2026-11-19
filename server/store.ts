import { DatabaseSync } from 'node:sqlite';
import { closeSync, constants, fchmodSync, fstatSync, openSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initialState } from '../shared/fixtures.ts';
import type { State, PaperOrder, PaperAudit } from '../shared/model.ts';
import type { Experiment } from '../shared/backtest.ts';
import { paperEvent, presentEvent } from './events.ts';
import { record } from './engine.ts';
import type { DailyRun, MasterInstrument, MasterSnapshot, MasterState, RemovedInstrument, StoredBar } from '../shared/market-data.ts';

import { assertStrategyIdentity, type StrategyContract } from './strategy-contract.ts';

export class Store {
  private db: DatabaseSync;
  private checkStrategyStartup(contract?: StrategyContract) {
    const has = (name: string) => this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
    const pinned = has('strategy_contract') && this.db.prepare('SELECT body FROM strategy_contract WHERE id=1').get()?.body;
    if (pinned && pinned !== JSON.stringify(contract)) throw new Error('원장에 고정된 전략 계약이 필요합니다.');
    if (contract && (has('paper_run') || !has('workspace'))) throw new Error('전략 전용 원장을 확인하세요.');
    if (contract && !pinned) {
      const row = this.db.prepare('SELECT body FROM workspace WHERE id=1').get();
      const state: State = JSON.parse(String(row?.body));
      const strategy = state.strategies.find(s => s.id === contract.strategyId);
      assertStrategyIdentity(contract, strategy);
    }
  }
  constructor(readonly path: string, startup?: { contract?: StrategyContract }) {
    if (path !== ':memory:') for (const suffix of ['', '-wal', '-shm']) {
      let fd: number;
      try {
        fd = openSync(path + suffix, constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK | (suffix ? 0 : constants.O_CREAT), 0o600);
      } catch (error) {
        if (suffix && (error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid?.()) throw new Error('DB는 현재 사용자가 소유한 단일 일반 파일이어야 합니다. 원본을 보존하세요.');
        fchmodSync(fd, 0o600);
      } finally { closeSync(fd); }
    }
    this.db = new DatabaseSync(path);
    try { if (startup) this.checkStrategyStartup(startup.contract); }
    catch (error) { this.db.close(); throw error; }
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), schema_version INTEGER NOT NULL, body TEXT NOT NULL);');
    this.db.exec('CREATE TABLE IF NOT EXISTS paper_orders (request_id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS paper_baseline (day TEXT PRIMARY KEY, equity REAL NOT NULL);');
    this.db.exec('CREATE TABLE IF NOT EXISTS strategy_contract (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS strategy_claim (request_id TEXT PRIMARY KEY, event TEXT NOT NULL UNIQUE, amount INTEGER NOT NULL CHECK(amount>0), dispatched INTEGER NOT NULL DEFAULT 0);');
    this.db.exec('CREATE TABLE IF NOT EXISTS realtime_guard (id INTEGER PRIMARY KEY CHECK(id=1));');
    this.db.exec('CREATE TABLE IF NOT EXISTS paper_event_read (id TEXT PRIMARY KEY);');
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
      active.forEach(s => { s.active = false; s.run = (s.run ?? 0) + 1; });
      for (const strategy of state.strategies) for (const evaluation of strategy.evaluations ?? []) if (evaluation.status === 'sending') { evaluation.status = 'unknown'; evaluation.reason = '평가 중 서버 재시작 · 주문 원장 대조 필요 · 자동 재전송 없음'; }
      if (active.length) record(state, '서버 재시작으로 전략 정지', '주문과 잔고를 확인한 뒤 개별 재개하세요.', 'warning');
    });
    for (const order of this.paperOrders()) if (order.status === 'sending') this.savePaper({ ...order, status: 'unknown', message: '전송 중 서버가 재시작되었습니다. KIS 계좌 대조가 필요합니다.' }, { actor: 'system', action: 'restart', before: 'sending' });
    for (const run of this.dailyRuns()) if (run.status.phase === 'loading') this.saveDaily({ ...run, status: { ...run.status, phase: 'partial', complete: false, error: '수집 중 서버가 재시작되었습니다. 마지막 저장 구간부터 재개하세요.' } });
    this.saveMasterStates(this.masterData().sources.filter(state => state.phase === 'loading').map(state => ({ ...state, phase: 'error', error: '마스터 수집 중 서버가 재시작되었습니다. 다시 수집하세요.' })));
  }
  realtimeRequired() { return Boolean(this.db.prepare('SELECT id FROM realtime_guard WHERE id=1').get()); }
  requireRealtime() { this.db.prepare('INSERT OR IGNORE INTO realtime_guard VALUES (1)').run(); }
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
  strategyContract() {
    return this.db.prepare('SELECT body FROM strategy_contract WHERE id=1').get()?.body;
  }
  bindStrategyContract(contract: StrategyContract) {
    this.db.exec('PRAGMA synchronous = FULL; BEGIN IMMEDIATE');
    try {
      if (this.hasPaperRun()) throw new Error('1회 승인 원장과 전략 계약을 혼용할 수 없습니다.');
      const body = JSON.stringify(contract);
      if (!this.strategyContract() && this.paperOrders().some(o => !['filled', 'cancelled', 'rejected'].includes(o.status))) throw new Error('미해결 주문이 있는 원장입니다.');
      this.db.prepare('INSERT OR IGNORE INTO strategy_contract VALUES (1,?)').run(body);
      if (this.strategyContract() !== body) throw new Error('원장에 고정된 전략 계약과 다릅니다.');
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  markStrategyDispatch(order: PaperOrder) {
    const result = this.db.prepare(`UPDATE strategy_claim SET dispatched=1
      WHERE request_id=? AND event=? AND dispatched=0
      AND EXISTS (SELECT 1 FROM paper_orders WHERE request_id=? AND body=?)`)
      .run(order.requestId, order.strategy!.event, order.requestId, JSON.stringify(order));
    return result.changes === 1;
  }
  strategyUsage() {
    return this.db.prepare('SELECT COUNT(*) AS attempts, COALESCE(SUM(amount),0) AS amount FROM strategy_claim').get() as { attempts: number; amount: number };
  }
  checkStrategyAmount(contract: StrategyContract, amount: number) {
    const used = this.strategyUsage();
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > contract.maxOrderAmount
      || used.attempts >= contract.maxAttempts || amount > contract.maxTotalAmount - used.amount) throw new Error('전략 계약의 횟수 또는 주문대금 한도를 초과했습니다.');
  }
  configurePaperRun(approval: { date: string; requestId: string; code?: string; maxQty?: number; maxAmount?: number; allowExistingHolding?: true; orderType?: 'market' }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.strategyContract()) throw new Error('전략 계약과 1회 승인 원장을 혼용할 수 없습니다.');
      this.db.exec('CREATE TABLE IF NOT EXISTS paper_run (id INTEGER PRIMARY KEY CHECK(id=1), day TEXT NOT NULL, request_id TEXT NOT NULL, attempted INTEGER NOT NULL DEFAULT 0);');
      const columns = this.db.prepare('PRAGMA table_info(paper_run)').all();
      if (!columns.some(column => column.name === 'code')) this.db.exec("ALTER TABLE paper_run ADD COLUMN code TEXT NOT NULL DEFAULT '069500';");
      if (!columns.some(column => column.name === 'max_qty')) this.db.exec('ALTER TABLE paper_run ADD COLUMN max_qty INTEGER NOT NULL DEFAULT 1;');
      if (!columns.some(column => column.name === 'max_amount')) this.db.exec('ALTER TABLE paper_run ADD COLUMN max_amount INTEGER NOT NULL DEFAULT 100000;');
      if (!columns.some(column => column.name === 'allow_holding')) this.db.exec('ALTER TABLE paper_run ADD COLUMN allow_holding INTEGER NOT NULL DEFAULT 0;');
      if (!columns.some(column => column.name === 'order_type')) this.db.exec("ALTER TABLE paper_run ADD COLUMN order_type TEXT NOT NULL DEFAULT 'limit';");
      this.db.prepare('INSERT OR IGNORE INTO paper_run (id,day,request_id,code,max_qty,max_amount,allow_holding,order_type) VALUES (1,?,?,?,?,?,?,?)').run(approval.date, approval.requestId, approval.code ?? '069500', approval.maxQty ?? 1, approval.maxAmount ?? 100000, Number(approval.allowExistingHolding === true), approval.orderType ?? 'limit');
      const row = this.db.prepare('SELECT day,request_id,attempted,code,max_qty,max_amount,allow_holding,order_type FROM paper_run WHERE id=1').get()!;
      if (row.day !== approval.date || row.request_id !== approval.requestId || row.code !== (approval.code ?? '069500') || row.max_qty !== (approval.maxQty ?? 1) || row.max_amount !== (approval.maxAmount ?? 100000) || row.allow_holding !== Number(approval.allowExistingHolding === true) || row.order_type !== (approval.orderType ?? 'limit')) throw new Error('저장된 1회 승인과 실행 설정이 다릅니다. 원장을 초기화하지 마세요.');
      this.db.exec('COMMIT');
      return Boolean(row.attempted);
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
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
  savePaper(order: PaperOrder, audit?: Omit<PaperAudit, 'id' | 'at' | 'requestId' | 'after'>, contract?: StrategyContract, checkReservation?: () => void) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (audit?.action === 'sending') {
        const bound = this.strategyContract();
        if (bound !== (contract && JSON.stringify(contract))) throw new Error('원장에 고정된 전략 계약과 전송 설정이 다릅니다.');
        if (contract) {
          checkReservation?.();
          const amount = order.qty * order.price;
          if (!order.strategy) throw new Error('전략 주문 출처가 필요합니다.');
          this.checkStrategyAmount(contract, amount);
          if (this.paperOrders().some(o => o.requestId === order.requestId || o.status === 'sending' || o.status === 'unknown')) throw new Error('중복 또는 대조되지 않은 전략 주문입니다.');
          this.db.prepare('INSERT INTO strategy_claim(request_id,event,amount) VALUES (?,?,?)').run(order.requestId, order.strategy.event, amount);
        }
      }
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
  events() {
    const read = new Set(this.db.prepare('SELECT id FROM paper_event_read').all().map(row => row.id));
    const audits = this.db.prepare('SELECT body FROM paper_audit ORDER BY rowid DESC LIMIT 1000').all().map(row => {
      const audit = JSON.parse(row.body as string) as PaperAudit;
      return paperEvent(audit, read.has(audit.id));
    });
    return [...audits, ...this.read().events.filter(e => !/^KIS 모의 주문 (accepted|unknown|rejected)$/.test(e.title)).map(presentEvent)].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 1000);
  }
  markPaperEventsRead(ids: string[]) {
    const mark = this.db.prepare('INSERT OR IGNORE INTO paper_event_read SELECT id FROM paper_audit WHERE id=?');
    for (const id of ids) if (id.startsWith('paper:')) mark.run(id.slice(6));
  }
  paperBaseline(day: string, value: number) {
    this.db.prepare('INSERT OR IGNORE INTO paper_baseline (day,equity) VALUES (?,?)').run(day, value);
    return Number(this.db.prepare('SELECT equity FROM paper_baseline WHERE day=?').get(day)!.equity);
  }
  paperBaselineValue(day: string) {
    const row = this.db.prepare('SELECT equity FROM paper_baseline WHERE day=?').get(day);
    return row ? Number(row.equity) : null;
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
