import type { SyncRun } from '../shared/market-data.ts';
import type { MorningReport } from '../shared/morning.ts';
import { approvalBinding, type OncePolicy } from '../shared/trading-policy.ts';
import type { PaperKrxSession } from './paper.ts';
import type { PlanKind, PlanRecord } from '../shared/trading-plan.ts';
import { DatabaseSync } from 'node:sqlite';
import { displayOrders } from './order-history.ts';
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
    this.db.exec('CREATE TABLE IF NOT EXISTS trading_plans (kind TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS trading_pins (run_id TEXT PRIMARY KEY, draft_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL);');
    this.db.exec('CREATE TABLE IF NOT EXISTS strategy_contract (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS strategy_claim (request_id TEXT PRIMARY KEY, event TEXT NOT NULL UNIQUE, amount INTEGER NOT NULL CHECK(amount>0), dispatched INTEGER NOT NULL DEFAULT 0);');
    this.db.exec('CREATE TABLE IF NOT EXISTS paper_order_checks (request_id TEXT PRIMARY KEY, observed_at TEXT NOT NULL)');
    this.db.exec('CREATE TABLE IF NOT EXISTS realtime_guard (id INTEGER PRIMARY KEY CHECK(id=1));');
    this.db.exec('CREATE TABLE IF NOT EXISTS paper_event_read (id TEXT PRIMARY KEY);');
    this.db.exec('CREATE TABLE IF NOT EXISTS paper_audit (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, body TEXT NOT NULL); CREATE INDEX IF NOT EXISTS paper_audit_request ON paper_audit(request_id);');
    this.db.exec('CREATE TABLE IF NOT EXISTS market_master (exchange TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS market_instruments (code TEXT PRIMARY KEY, exchange TEXT NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS daily_runs (id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS daily_bars (run_id TEXT NOT NULL, date TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(run_id,date));');
    this.db.exec(`CREATE TABLE IF NOT EXISTS morning_reports (id TEXT PRIMARY KEY, account TEXT NOT NULL, day TEXT NOT NULL, body TEXT NOT NULL, approved TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS morning_approved ON morning_reports(account,day) WHERE approved IS NOT NULL;
      CREATE TABLE IF NOT EXISTS morning_signals (report TEXT NOT NULL, event TEXT NOT NULL, code TEXT NOT NULL, side TEXT NOT NULL, price INTEGER NOT NULL, at TEXT NOT NULL, outcome TEXT NOT NULL, request TEXT, PRIMARY KEY(report,event,code));
      CREATE TABLE IF NOT EXISTS morning_additions (report TEXT NOT NULL,code TEXT NOT NULL,body TEXT NOT NULL,expires INTEGER NOT NULL,approved TEXT,PRIMARY KEY(report,code));
      CREATE TABLE IF NOT EXISTS morning_claim (request TEXT PRIMARY KEY,report TEXT NOT NULL,code TEXT NOT NULL,buy_amount INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS morning_carry (account TEXT NOT NULL, day TEXT NOT NULL, code TEXT NOT NULL, report TEXT NOT NULL, qty INTEGER NOT NULL, claimed INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(account,day,code));
      CREATE TABLE IF NOT EXISTS morning_close (report TEXT PRIMARY KEY,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS morning_stops (account TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY(account,day));
      CREATE TABLE IF NOT EXISTS morning_daily_bars (code TEXT NOT NULL, date TEXT NOT NULL, body TEXT NOT NULL, collected_at TEXT NOT NULL, PRIMARY KEY(code,date));
      CREATE INDEX IF NOT EXISTS morning_daily_bars_date ON morning_daily_bars(date);
      CREATE TABLE IF NOT EXISTS morning_scan_meta (code TEXT PRIMARY KEY, to_date TEXT NOT NULL, calendar_hash TEXT NOT NULL, status TEXT NOT NULL, checked_at TEXT NOT NULL);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS market_sync_runs (
        id TEXT PRIMARY KEY,
        trigger TEXT NOT NULL CHECK(trigger IN ('post_close', 'manual')),
        source_label TEXT NOT NULL CHECK(source_label IN ('장후 동기화', '수동 실행')),
        target_date TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('running', 'succeeded', 'partial', 'skipped', 'failed', 'interrupted')),
        reason_code TEXT,
        calendar_source TEXT,
        calendar_verified INTEGER NOT NULL DEFAULT 0 CHECK(calendar_verified IN (0, 1)),
        scope_limit INTEGER NOT NULL CHECK(scope_limit BETWEEN 1 AND 50),
        total_symbols INTEGER NOT NULL DEFAULT 0,
        succeeded_symbols INTEGER NOT NULL DEFAULT 0,
        failed_symbols INTEGER NOT NULL DEFAULT 0,
        master_refreshed INTEGER NOT NULL DEFAULT 0 CHECK(master_refreshed IN (0, 1)),
        started_at TEXT NOT NULL,
        finished_at TEXT,
        summary_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS market_sync_runs_started ON market_sync_runs(started_at DESC);
      CREATE INDEX IF NOT EXISTS market_sync_runs_target ON market_sync_runs(target_date, started_at DESC);`);
    if (!this.db.prepare('PRAGMA table_info(morning_scan_meta)').all().some(row => row.name === 'source'))
      this.db.exec("ALTER TABLE morning_scan_meta ADD COLUMN source TEXT NOT NULL DEFAULT 'morning_scan' CHECK(source IN ('morning_scan','post_close_sync','manual_sync'))");
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
    this.db.exec("UPDATE morning_signals SET outcome=COALESCE((SELECT json_extract(body,'$.status') FROM paper_orders WHERE request_id=morning_signals.request),'서버 중단 · 원장 재확인') WHERE outcome='검사 중'");
    for (const run of this.dailyRuns()) if (run.status.phase === 'loading') this.saveDaily({ ...run, status: { ...run.status, phase: 'partial', complete: false, error: '수집 중 서버가 재시작되었습니다. 마지막 저장 구간부터 재개하세요.' } });
    this.saveMasterStates(this.masterData().sources.filter(state => state.phase === 'loading').map(state => ({ ...state, phase: 'error', error: '마스터 수집 중 서버가 재시작되었습니다. 다시 수집하세요.' })));
    this.db.prepare(`UPDATE market_sync_runs SET status=CASE WHEN succeeded_symbols>0 OR master_refreshed=1 THEN 'partial' ELSE 'interrupted' END,
      reason_code='SERVER_RESTART', finished_at=?, summary_json=json_set(summary_json,'$.message','동기화 중 서버가 재시작됐습니다. 완료 종목만 보존했습니다.') WHERE status='running'`).run(new Date().toISOString());
  }
  saveSync(r: SyncRun) {
    this.db.prepare(`INSERT INTO market_sync_runs
      (id,trigger,source_label,target_date,status,reason_code,calendar_source,calendar_verified,scope_limit,total_symbols,
       succeeded_symbols,failed_symbols,master_refreshed,started_at,finished_at,summary_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,reason_code=excluded.reason_code,calendar_verified=excluded.calendar_verified,
       total_symbols=excluded.total_symbols,succeeded_symbols=excluded.succeeded_symbols,failed_symbols=excluded.failed_symbols,
       master_refreshed=excluded.master_refreshed,finished_at=excluded.finished_at,summary_json=excluded.summary_json`)
      .run(r.runId,r.trigger,r.sourceLabel,r.targetDate,r.status,r.reasonCode,r.calendarSource,+r.calendarVerified,r.scopeLimit,
        r.totalSymbols,r.succeededSymbols,r.failedSymbols,+r.masterRefreshed,r.startedAt,r.finishedAt,JSON.stringify(r.summary));
  }
  syncRuns(limit:number, finishedOnly=false): SyncRun[] {
    return this.db.prepare(`SELECT * FROM market_sync_runs WHERE (?=0 OR status!='running') ORDER BY started_at DESC,rowid DESC LIMIT ?`)
      .all(+finishedOnly,limit).map(r => ({
        runId:String(r.id),trigger:r.trigger as SyncRun['trigger'],sourceLabel:String(r.source_label),targetDate:String(r.target_date),
        status:r.status as SyncRun['status'],reasonCode:r.reason_code as string|null,calendarSource:String(r.calendar_source),
        calendarVerified:!!r.calendar_verified,scopeLimit:Number(r.scope_limit),totalSymbols:Number(r.total_symbols),
        succeededSymbols:Number(r.succeeded_symbols),failedSymbols:Number(r.failed_symbols),masterRefreshed:!!r.master_refreshed,
        startedAt:String(r.started_at),finishedAt:r.finished_at as string|null,summary:JSON.parse(String(r.summary_json)),
      }));
  }
  syncCandidateCodes(account: string, days: string[]): string[] {
    return this.db.prepare(`SELECT DISTINCT json_extract(candidate.value,'$.code') AS code
      FROM morning_reports r, json_each(r.body,'$.candidates') candidate
      WHERE r.account=? AND r.day IN (SELECT value FROM json_each(?))
      ORDER BY r.day DESC,r.rowid DESC,CAST(candidate.key AS INTEGER)`)
      .all(account, JSON.stringify(days)).map(row => String(row.code));
  }
  saveMorning(account: string, report: MorningReport) {
    this.db
      .prepare('INSERT INTO morning_reports(id,account,day,body) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM morning_reports WHERE account=? AND day=? AND approved IS NOT NULL)')
      .run(report.id, account, report.day, JSON.stringify(report),account,report.day);
  }
  morning(account: string, day: string): MorningReport | null {
    const row = this.db
      .prepare(
        'SELECT body,approved FROM morning_reports WHERE account=? AND day=? ORDER BY approved IS NOT NULL DESC,rowid DESC LIMIT 1',
      )
      .get(account, day);
    return row ? { ...JSON.parse(String(row.body)), approvedAt: row.approved } : null;
  }
  morningOrders(account:string,day:string):PaperOrder[]{
    return this.db.prepare(`SELECT p.body FROM morning_claim c JOIN paper_orders p ON p.request_id=c.request
      JOIN morning_reports r ON r.id=c.report WHERE r.account=? AND json_extract(p.body,'$.tradeDate')=?`)
      .all(account,day.replaceAll('-','')).map(row=>JSON.parse(String(row.body)) as PaperOrder);
  }
  saveMorningClose(report: string, result: import('./morning-close.ts').MorningClose) {
    this.db
      .prepare(
        "INSERT INTO morning_close VALUES (?,?) ON CONFLICT(report) DO UPDATE SET body=excluded.body WHERE json_extract(morning_close.body,'$.hold') IS NULL",
      )
      .run(report, JSON.stringify(result));
  }
  morningClose(report: string): import('./morning-close.ts').MorningClose | null {
    const row = this.db.prepare('SELECT body FROM morning_close WHERE report=?').get(report);
    return row ? JSON.parse(String(row.body)) : null;
  }
  morningDays(account: string) {
    return this.db
      .prepare('SELECT DISTINCT day FROM morning_reports WHERE account=? ORDER BY day DESC LIMIT 60')
      .all(account)
      .map((r) => String(r.day));
  }
  additions(report: string) {
    return this.db
      .prepare('SELECT body,expires,approved FROM morning_additions WHERE report=? ORDER BY rowid')
      .all(report)
      .map((r) => ({
        candidate: JSON.parse(String(r.body)) as MorningReport['candidates'][number],
        expires: Number(r.expires),
        approved: r.approved as string | null,
      }));
  }
  proposeMorning(report: string, candidate: MorningReport['candidates'][number], expires: number) {
    this.db
      .prepare(
        `INSERT INTO morning_additions VALUES (?,?,?,?,NULL) ON CONFLICT(report,code)
  DO UPDATE SET body=excluded.body,expires=excluded.expires WHERE morning_additions.approved IS NULL`,
      )
      .run(report, candidate.code, JSON.stringify(candidate), expires);
  }
  approveAddition(report: MorningReport, code: string, expires: number, now: number) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const conditions = this.additions(report.id),
        proposed = conditions.find((p) => p.candidate.code === code);
      if (!report.approvedAt || !proposed || proposed.approved || proposed.expires !== expires || expires <= now)
        throw new Error('편입 제안을 다시 확인하세요.');
      const total = conditions
        .filter((p) => p.approved)
        .reduce((sum, p) => sum + p.candidate.limit, proposed.candidate.limit);
      const proposedSector = proposed.candidate.sector;
      if (proposedSector) {
        const reserved = conditions
          .filter((a) => a.approved && a.candidate.sector === proposedSector)
          .reduce((v, a) => v + a.candidate.limit, 0);
        if (reserved + proposed.candidate.limit > (proposed.candidate.sectorRoom ?? 0))
          throw new Error('해당 업종의 편입 한도를 초과합니다.');
      }
      if (total > (report.retainedCash ?? 0)) throw new Error('새 후보에 배분할 현금이 부족합니다.');
      this.db
        .prepare('UPDATE morning_additions SET approved=? WHERE report=? AND code=?')
        .run(new Date(now).toISOString(), report.id, code);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  reserveMorning(report: MorningReport, account: string, day: string, order: PaperOrder) {
    const stored = this.morning(account, report.day);
    if (
      !stored?.approvedAt ||
      stored.id !== report.id ||
      this.paperOrders().some((o) => o.requestId === order.requestId || ['sending', 'unknown'].includes(o.status))
    )
      throw new Error('보고서 승인 또는 이전 주문 대조 필요');
    const terms =
      stored.candidates.find((p) => p.code === order.code) ??
      this.additions(report.id).find((a) => a.approved && a.candidate.code === order.code)?.candidate;
    if (!terms || order.qty !== 1) throw new Error('승인하지 않은 포트폴리오 주문');
    const buyAmount = order.side === 'buy' ? order.qty * order.price : 0;
    if (buyAmount) {
      const used = Number(
        this.db
          .prepare('SELECT COALESCE(SUM(buy_amount),0) AS n FROM morning_claim WHERE report=? AND code=?')
          .get(report.id, order.code)?.n,
      );
      if (
        report.day !== day ||
        order.price <= terms.reference ||
        this.morningStopped(account, day) ||
        used + buyAmount > terms.limit
      )
        throw new Error('당일 매수 조건 또는 누적 한도 초과');
    } else if (
      order.price >= terms.exit ||
      (report.day !== day && !this.claimCarry(account, day, report.id, order.code))
    )
      throw new Error('당일 또는 이월 매도 조건 초과');
    this.db
      .prepare('INSERT INTO morning_claim VALUES (?,?,?,?)')
      .run(order.requestId, report.id, order.code, buyAmount);
  }
  releaseUnsentMorning(request: string, account: string, day: string, report: MorningReport, code: string) {
    // Called inside the broker response transaction, only for a proven pre-transmission rejection.
    const deleted = this.db
      .prepare('DELETE FROM morning_claim WHERE request=? AND report=? AND code=?')
      .run(request, report.id, code);
    if (deleted.changes && report.day !== day)
      this.db
        .prepare(
          'UPDATE morning_carry SET claimed=claimed-1 WHERE account=? AND day=? AND code=? AND report=? AND claimed>0',
        )
        .run(account, day, code, report.id);
  }
  saveCarry(account: string, day: string, report: string, positions: { code: string; qty: number }[]) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const p of positions)
        this.db
          .prepare('INSERT OR IGNORE INTO morning_carry(account,day,code,report,qty) VALUES (?,?,?,?,?)')
          .run(account, day, p.code, report, p.qty);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  pendingCarry(account: string) {
    return Boolean(
      this.db.prepare("SELECT 1 FROM morning_carry WHERE account=? AND day LIKE 'next:%' LIMIT 1").get(account),
    );
  }
  carryPreviewCodes(account: string, day: string, nextDay: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT c.code, r.body
         FROM morning_carry c
         JOIN morning_reports r ON c.report = r.id AND c.account = r.account
         WHERE c.account = ?
           AND c.day IN (?, ?)
           AND c.claimed < c.qty
           AND r.approved IS NOT NULL`,
      )
      .all(account, day, nextDay);
    const codes = new Set<string>();
    for (const row of rows) {
      JSON.parse(String(row.body));
      codes.add(String(row.code));
    }
    return [...codes];
  }
  bindNextSession(account: string, previous: string, today: string) {
    this.db.prepare("UPDATE morning_carry SET day='expired:'||substr(day,6) WHERE account=? AND day LIKE 'next:%' AND substr(day,6)<?").run(account,previous);
    this.db
      .prepare('UPDATE morning_carry SET day=? WHERE account=? AND day=?')
      .run(today, account, 'next:' + previous);
  }
  carry(account: string, day: string) {
    return this.db
      .prepare(
        `SELECT c.code,c.qty,c.claimed,r.body,r.approved FROM morning_carry c JOIN morning_reports r ON c.report=r.id AND c.account=r.account
  WHERE c.account=? AND c.day=? AND c.claimed<c.qty AND r.approved IS NOT NULL`,
      )
      .all(account, day)
      .map((row) => ({
        code: String(row.code),
        report: { ...JSON.parse(String(row.body)), approvedAt: row.approved } as MorningReport,
        remaining: Number(row.qty) - Number(row.claimed),
      }));
  }
  claimCarry(account: string, day: string, report: string, code: string) {
    return (
      this.db
        .prepare(
          'UPDATE morning_carry SET claimed=claimed+1 WHERE account=? AND day=? AND report=? AND code=? AND claimed<qty',
        )
        .run(account, day, report, code).changes === 1
    );
  }
  approveMorning(account: string, day: string, id: string, at: string) {
    const result = this.db
      .prepare(
        `UPDATE morning_reports SET approved=? WHERE id=? AND account=? AND day=? AND approved IS NULL AND id=(
  SELECT id FROM morning_reports WHERE account=? AND day=? ORDER BY approved IS NOT NULL DESC,rowid DESC LIMIT 1)`,
      )
      .run(at, id, account, day, account, day);
    if (!result.changes && this.morning(account, day)?.approvedAt && this.morning(account, day)?.id === id) return;
    if (!result.changes) throw new Error('현재 보고서를 다시 확인하세요.');
  }
  morningSignal(
    report: string,
    event: string,
    code: string,
    side: string,
    price: number,
    at: string,
    outcome: string,
    request:string|null=null,
  ) {
    return (
      this.db
        .prepare('INSERT OR IGNORE INTO morning_signals(report,event,code,side,price,at,outcome,request) VALUES (?,?,?,?,?,?,?,?)')
        .run(report, event, code, side, price, at, outcome,request).changes === 1
    );
  }
  finishMorningSignal(report: string, event: string, code: string, outcome: string) {
    this.db
      .prepare('UPDATE morning_signals SET outcome=? WHERE report=? AND event=? AND code=?')
      .run(outcome, report, event, code);
  }
  morningSignals(report: string) {
    return this.db
      .prepare(
        'SELECT at,code,side,price,outcome FROM morning_signals WHERE report=? ORDER BY rowid DESC LIMIT 100',
      )
      .all(report);
  }
  morningStopped(account: string, day: string, reached = false) {
    if (reached) this.db.prepare('INSERT OR IGNORE INTO morning_stops VALUES (?,?)').run(account, day);
    return !!this.db.prepare('SELECT 1 FROM morning_stops WHERE account=? AND day=?').get(account, day);
  }
  saveMorningScanSymbol(code: string, toDate: string, calendarHash: string, status: 'passed' | 'incomplete', bars: StoredBar[]) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.writeMorningBars(code,toDate,calendarHash,status,bars,'morning_scan');
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  private writeMorningBars(code:string,toDate:string,calendarHash:string,status:'passed'|'incomplete',bars:StoredBar[],source:'morning_scan'|'manual_sync'|'post_close_sync') {
    this.db.prepare('DELETE FROM morning_daily_bars WHERE code=?').run(code);
    if (status === 'passed') {
      const insert = this.db.prepare('INSERT INTO morning_daily_bars (code,date,body,collected_at) VALUES (?,?,?,?)');
      for (const bar of bars) insert.run(code, bar.date, JSON.stringify(bar), bar.collectedAt);
    }
    this.db.prepare('INSERT OR REPLACE INTO morning_scan_meta (code,to_date,calendar_hash,status,checked_at,source) VALUES (?,?,?,?,?,?)')
      .run(code, toDate, calendarHash, status, new Date().toISOString(), source);
  }
  morningScannedCodes(toDate: string, calendarHash: string): Set<string> {
    return new Set(
      this.db
        .prepare('SELECT code FROM morning_scan_meta WHERE to_date=? AND calendar_hash=?')
        .all(toDate, calendarHash)
        .map((row) => String(row.code)),
    );
  }
  morningRecentBars(fromDate: string, beforeDate: string, cutoffIso: string): Map<string, StoredBar[]> {
    const rows = this.db
      .prepare(
        `SELECT b.code, b.body
         FROM morning_daily_bars b
         JOIN morning_scan_meta m ON m.code = b.code
         WHERE m.status = 'passed'
           AND m.to_date < ?
           AND m.checked_at <= ?
           AND b.date >= ?
           AND b.date < ?
           AND b.collected_at <= ?
         ORDER BY b.code, b.date`,
      )
      .all(beforeDate, cutoffIso, fromDate, beforeDate, cutoffIso);
    const result = new Map<string, StoredBar[]>();
    for (const row of rows) {
      const code = String(row.code);
      const bar = JSON.parse(String(row.body)) as StoredBar;
      const list = result.get(code);
      if (list) list.push(bar);
      else result.set(code, [bar]);
    }
    return result;
  }
  morningIncompleteMeta(beforeDate: string, cutoffIso: string): Map<string, { toDate: string; checkedAt: string }> {
    const rows = this.db
      .prepare(
        `SELECT code, to_date, checked_at
         FROM morning_scan_meta
         WHERE status = 'incomplete'
           AND to_date < ?
           AND checked_at <= ?`,
      )
      .all(beforeDate, cutoffIso);
    const result = new Map<string, { toDate: string; checkedAt: string }>();
    for (const row of rows) {
      result.set(String(row.code), { toDate: String(row.to_date), checkedAt: String(row.checked_at) });
    }
    return result;
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
  saveMasters(snapshots: MasterSnapshot[], syncId?:string) {
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
      if (syncId) this.db.prepare('UPDATE market_sync_runs SET master_refreshed=1 WHERE id=?').run(syncId);
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
  dailyRuns(limit?: number): DailyRun[] {
    const rows = limit === undefined
      ? this.db.prepare('SELECT body FROM daily_runs ORDER BY rowid DESC').all()
      : this.db.prepare('SELECT body FROM daily_runs ORDER BY rowid DESC LIMIT ?').all(limit);
    return rows.map(row => JSON.parse(row.body as string) as DailyRun);
  }
  dailyRun(id: string): DailyRun | undefined { const row = this.db.prepare('SELECT body FROM daily_runs WHERE id=?').get(id); return row ? JSON.parse(row.body as string) as DailyRun : undefined; }
  dailyBars(id: string): StoredBar[] { return this.db.prepare('SELECT body FROM daily_bars WHERE run_id=? ORDER BY date').all(id).map(row => JSON.parse(row.body as string) as StoredBar); }
  saveDaily(run: DailyRun, bars: StoredBar[] = [], projection?: {syncId:string;source:"manual_sync"|"post_close_sync";hash:string}) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const insert = this.db.prepare('INSERT INTO daily_bars VALUES (?,?,?)');
      for (const bar of bars) insert.run(run.id, bar.date, JSON.stringify(bar));
      this.db.prepare('INSERT INTO daily_runs VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(run.id, JSON.stringify(run));
      if (projection && run.quality.state === 'passed') {
        this.db.prepare('UPDATE market_sync_runs SET succeeded_symbols=succeeded_symbols+1 WHERE id=?').run(projection.syncId);
        const existing = this.db.prepare('SELECT to_date FROM morning_scan_meta WHERE code=?').get(run.code);
        if (!existing || String(existing.to_date) <= run.to) this.writeMorningBars(run.code,run.to,projection.hash,'passed',bars,projection.source);
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  experiments() { return this.db.prepare('SELECT body FROM backtest_experiments ORDER BY rowid DESC').all().map(row => {
    const experiment = JSON.parse(row.body as string) as Experiment;
    return { id: experiment.id, createdAt: experiment.createdAt, input: experiment.snapshot.input, bars: experiment.snapshot.bars.length };
  }); }
  experiment(id: string): Experiment | undefined { const row = this.db.prepare('SELECT body FROM backtest_experiments WHERE id=?').get(id); return row ? JSON.parse(row.body as string) as Experiment : undefined; }
  saveExperiment(experiment: Experiment) { this.db.prepare('INSERT OR IGNORE INTO backtest_experiments VALUES (?,?)').run(experiment.id, JSON.stringify(experiment)); }
  tradingPlan(kind: PlanKind): PlanRecord | undefined {
    const row = this.db.prepare('SELECT body FROM trading_plans WHERE kind=?').get(kind);
    return row ? JSON.parse(String(row.body)) : undefined;
  }
  changeTradingPlan(kind: PlanKind, expectedId: string | null, change: (old?: PlanRecord) => PlanRecord) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const old = this.tradingPlan(kind);
      if ((old?.draft.id ?? null) !== expectedId) throw new Error('다른 화면에서 설정이 변경됐습니다. 저장본을 다시 확인하세요.');
      const next = change(old);
      if (next.draft.fixed && !old?.draft.fixed) this.db.prepare('INSERT INTO trading_pins VALUES(?,?,?)').run(next.draft.runId!,next.draft.id,kind);
      this.db.prepare('INSERT INTO trading_plans VALUES(?,?) ON CONFLICT(kind) DO UPDATE SET body=excluded.body').run(kind, JSON.stringify(next));
      this.db.exec('COMMIT');
      return next;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  recordOrderChecks(checks: { id: string; at: string }[]) {
    if (!checks.length) return;
    const put = this.db.prepare(`INSERT INTO paper_order_checks VALUES (?,?)
      ON CONFLICT(request_id) DO UPDATE SET observed_at = max(observed_at, excluded.observed_at)`);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const check of checks) put.run(check.id, check.at);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  displayPaperOrders() { return displayOrders(this.db); }
  pinnedRuns() {
    return this.db.prepare('SELECT kind, draft_id AS draftId, run_id AS runId FROM trading_pins ORDER BY rowid').all() as
      { kind: PlanKind; draftId: string; runId: string }[];
  }
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
      if (!this.strategyContract() && !contract.policy && !this.read().instruments.some(row => row.code === contract.code))
        throw new Error('확장 종목은 매매설정의 새 전략 정책을 고정해야 합니다.');
      if (!this.strategyContract() && this.paperOrders().some(o => !['filled', 'cancelled', 'rejected'].includes(o.status))) throw new Error('미해결 주문이 있는 원장입니다.');
      this.db.prepare('INSERT OR IGNORE INTO strategy_contract VALUES (1,?)').run(body);
      if (this.strategyContract() !== body) throw new Error('원장에 고정된 전략 계약과 다릅니다.');
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  markStrategyDispatch(order: PaperOrder, beforeDispatch?: () => void) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      beforeDispatch?.();
      const result = this.db.prepare(`UPDATE strategy_claim SET dispatched=1
        WHERE request_id=? AND event=? AND dispatched=0
        AND EXISTS (SELECT 1 FROM paper_orders WHERE request_id=? AND body=?)`)
        .run(order.requestId, order.strategy!.event, order.requestId, JSON.stringify(order));
      this.db.exec('COMMIT');
      return result.changes === 1;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  strategyAvailableShares(code: string) {
    const rows = this.db.prepare('SELECT p.body FROM paper_orders p JOIN strategy_claim c ON c.request_id=p.request_id WHERE c.dispatched=1').all();
    let shares = 0;
    for (const row of rows) {
      const order: PaperOrder = JSON.parse(String(row.body));
      if (order.code !== code) continue;
      shares += order.side === 'buy' ? order.filled : -order.filled;
      if (order.side === 'sell' && ['accepted', 'partial'].includes(order.status)) shares -= order.remaining;
    }
    return shares;
  }
  strategyUsage() {
    return this.db.prepare('SELECT COUNT(*) AS attempts, COALESCE(SUM(amount),0) AS amount FROM strategy_claim').get() as { attempts: number; amount: number };
  }
  checkStrategyAmount(contract: StrategyContract, amount: number) {
    const used = this.strategyUsage();
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > contract.maxOrderAmount
      || used.attempts >= contract.maxAttempts || amount > contract.maxTotalAmount - used.amount) throw new Error('전략 계약의 횟수 또는 주문대금 한도를 초과했습니다.');
  }
  configurePaperRun(approval: { policy?: OncePolicy; assetKind?: 'stock' | 'etf'; lowerLimitPrice?: number; krxSession?: PaperKrxSession; ledgerPath?: string; accountFingerprint?: string; cancelProbe?: true; date: string; requestId: string; code?: string; maxQty?: number; maxAmount?: number; allowExistingHolding?: true; orderType?: 'market' }, existingOnly = false) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (existingOnly && (!this.hasPaperRun() || !this.db.prepare('SELECT 1 FROM paper_run WHERE id=1').get())) {
        throw new Error('하한가 후보는 미리 고정한 새 승인 원장이 필요합니다.');
      }
      if (this.strategyContract()) throw new Error('전략 계약과 1회 승인 원장을 혼용할 수 없습니다.');
      this.db.exec('CREATE TABLE IF NOT EXISTS paper_run (id INTEGER PRIMARY KEY CHECK(id=1), day TEXT NOT NULL, request_id TEXT NOT NULL, attempted INTEGER NOT NULL DEFAULT 0);');
      const columns = this.db.prepare('PRAGMA table_info(paper_run)').all();
      if (!columns.some(column => column.name === 'binding')) this.db.exec('ALTER TABLE paper_run ADD COLUMN binding TEXT;');
      const binding = approvalBinding(approval);
      if (!columns.some(column => column.name === 'code')) this.db.exec("ALTER TABLE paper_run ADD COLUMN code TEXT NOT NULL DEFAULT '069500';");
      if (!columns.some(column => column.name === 'max_qty')) this.db.exec('ALTER TABLE paper_run ADD COLUMN max_qty INTEGER NOT NULL DEFAULT 1;');
      if (!columns.some(column => column.name === 'max_amount')) this.db.exec('ALTER TABLE paper_run ADD COLUMN max_amount INTEGER NOT NULL DEFAULT 100000;');
      if (!columns.some(column => column.name === 'allow_holding')) this.db.exec('ALTER TABLE paper_run ADD COLUMN allow_holding INTEGER NOT NULL DEFAULT 0;');
      if (!columns.some(column => column.name === 'order_type')) this.db.exec("ALTER TABLE paper_run ADD COLUMN order_type TEXT NOT NULL DEFAULT 'limit';");
      this.db.prepare('INSERT OR IGNORE INTO paper_run (id,day,request_id,code,max_qty,max_amount,allow_holding,order_type,binding) VALUES (1,?,?,?,?,?,?,?,?)').run(approval.date, approval.requestId, approval.code ?? '069500', approval.maxQty ?? 1, approval.maxAmount ?? 100000, Number(approval.allowExistingHolding === true), approval.orderType ?? 'limit', binding);
      const row = this.db.prepare('SELECT day,request_id,attempted,code,max_qty,max_amount,allow_holding,order_type,binding FROM paper_run WHERE id=1').get()!;
      if (row.binding !== binding || row.day !== approval.date || row.request_id !== approval.requestId || row.code !== (approval.code ?? '069500') || row.max_qty !== (approval.maxQty ?? 1) || row.max_amount !== (approval.maxAmount ?? 100000) || row.allow_holding !== Number(approval.allowExistingHolding === true) || row.order_type !== (approval.orderType ?? 'limit')) throw new Error('저장된 1회 승인과 실행 설정이 다릅니다. 원장을 초기화하지 마세요.');
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
  savePaper(order: PaperOrder, audit?: Omit<PaperAudit, 'id' | 'at' | 'requestId' | 'after'>, contract?: StrategyContract, checkReservation?: () => void, marketAmount?: number) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (audit?.action === 'sending') {
        const bound = this.strategyContract();
        if (bound !== (contract && JSON.stringify(contract))) throw new Error('원장에 고정된 전략 계약과 전송 설정이 다릅니다.');
        checkReservation?.();
        if (contract) {
          const amount = order.orderType === 'market' && contract.policy?.orderType === 'market' ? marketAmount ?? 0 : order.qty * order.price;
          if (!order.strategy) throw new Error('전략 주문 출처가 필요합니다.');
          this.checkStrategyAmount(contract, amount);
          if (contract.sellPolicy === 'contract' && order.side === 'sell' && order.qty > this.strategyAvailableShares(order.code))
            throw new Error('이 전략 계약의 확인된 매수 잔량이 부족합니다.');
          if (this.paperOrders().some(o => o.requestId === order.requestId || o.status === 'sending' || o.status === 'unknown')) throw new Error('중복 또는 대조되지 않은 전략 주문입니다.');
          this.db.prepare('INSERT INTO strategy_claim(request_id,event,amount) VALUES (?,?,?)').run(order.requestId, order.strategy.event, amount);
        }
      }
      this.db.prepare('INSERT INTO paper_orders (request_id,body) VALUES (?,?) ON CONFLICT(request_id) DO UPDATE SET body=excluded.body').run(order.requestId, JSON.stringify(order));
      if(audit?.action==='response') checkReservation?.();
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
