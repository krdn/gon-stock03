import { randomUUID } from 'node:crypto';
import { instrumentSeeds } from '../shared/fixtures.ts';
import { calendarSource, isoDay, krxTradingDates, verifyCalendar } from '../shared/krx-calendar.ts';
import { addDays, scopeNotice, syncInput, type DailyInput, type SyncRun } from '../shared/market-data.ts';
import type { SyncInventory } from '../shared/data-inventory.ts';
import { afterCloseBuffer } from '../shared/trading-policy.ts';
import { koreaDate, type KisClient } from './kis.ts';
import type { Store } from './store.ts';
import type { MarketData } from './market-data.ts';

export class MarketDataSync {
  private active: SyncRun | null = null;
  get running() {
    return this.active !== null;
  }
  constructor(
    private store: Store,
    private kis: KisClient,
    private market: MarketData,
    private scanning: () => boolean,
  ) {}
  private persistFinished() {
    if (this.active?.finishedAt) {
      this.store.saveSync(this.active);
      this.active = null;
    }
  }
  inventory(limit: number): SyncInventory {
    this.persistFinished();
    return {
      morningScan: this.store.latestMorningScan(),
      active: this.active,
      latest: this.store.syncRuns(1, true)[0] ?? null,
      runs: this.store.syncRuns(limit),
      scopeNotice,
      serverNow: new Date().toISOString(),
    };
  }
  start(input: unknown) {
    const { trigger, targetDate = koreaDate(), limit, includeMaster } = syncInput.parse(input);
    const today = koreaDate();
    if (targetDate > today) throw Error('미래일을 수집할 수 없습니다.');
    this.persistFinished();
    if (this.active) return { code: 202, body: { ...this.active, scopeNotice, deduplicated: true } };
    const reasonCode =
      targetDate === today && !afterCloseBuffer(today, Date.now(), this.market.notice)
        ? 'BEFORE_CLOSE_BUFFER'
        : this.kis.connection().configured === false
          ? 'KIS_UNCONFIGURED'
          : null;
    if (!reasonCode && (this.scanning() || this.market.busy))
      return { code: 409, body: { reasonCode: 'COLLECTION_ACTIVE', error:'다른 시세 수집이 진행 중입니다.', scopeNotice } };
    const startedAt = new Date().toISOString();
    const run: SyncRun = {
      runId: randomUUID(),
      trigger,
      targetDate,
      sourceLabel: trigger === 'manual' ? '수동 실행' : '장후 동기화',
      status: reasonCode ? 'skipped' : 'running',
      reasonCode,
      calendarSource,
      calendarVerified: false,
      scopeLimit: limit,
      totalSymbols: 0,
      succeededSymbols: 0,
      failedSymbols: 0,
      masterRefreshed: false,
      startedAt,
      finishedAt: reasonCode ? startedAt : null,
      summary: {
        scopeNotice,
        tier1: 0,
        tier2: 0,
        tier1Truncated: false,
        omitted: [],
        halted: [],
        mismatch: [],
        failures: [],
      },
    };
    this.store.saveSync(run);
    if (reasonCode) return { code: 200, body: { ...run, scopeNotice } };
    this.active = run;
    void Promise.resolve()
      .then(() => this.collect(run, includeMaster))
      .catch(() => {
        run.status = run.succeededSymbols ? 'partial' : 'failed';
        run.reasonCode ??= 'COLLECTION_FAILED';
      })
      .finally(() => {
        run.finishedAt = new Date().toISOString();
        this.persistFinished();
      })
      .catch(() => console.error('동기화 종료 상태를 저장하지 못했습니다.'));
    return { code: 202, body: { ...run, scopeNotice, deduplicated: false } };
  }
  private symbols(run: SyncRun) {
    const day = isoDay(run.targetDate),
      account = this.kis.accountFingerprint();
    const dates = krxTradingDates(addDays(run.targetDate, -30), run.targetDate).slice(-5).reverse();
    const candidates = this.store.syncCandidateCodes(account, dates.map(isoDay));
    const held =
      this.kis
        .connection()
        .balance?.positions.filter((p) => p.qty > 0)
        .map((p) => p.code) ?? [];
    const carry = this.store.carryPreviewCodes(account, day, 'next:' + day);
    const state = this.store.read();
    const instruments = new Map(this.store.masterData().instruments.map((i) => [i.code, i]));
    const protectedCodes = new Set([...held, ...carry]);
    const eligible = (code: string) => {
      const row = instruments.get(code);
      return (
        row &&
        ['ST', 'EF'].includes(row.group) &&
        row.liquidation === false &&
        (row.tradingHalted === false || (row.tradingHalted === true && protectedCodes.has(code)))
      );
    };
    run.summary.halted = [...new Set([...held, ...carry])].filter(
      (code) => instruments.get(code)?.tradingHalted,
    );
    const tier1 = [...new Set(['069500', '229200', ...held, ...carry, ...candidates])].filter(eligible);
    const strategies = state.strategies.toSorted(
      (a, b) => Number(b.environment === 'kis-paper') - Number(a.environment === 'kis-paper'),
    );
    const symbols = [
      ...new Set([
        ...tier1,
        ...state.watchlist,
        ...strategies.map((s) => s.code),
        ...instrumentSeeds.map((i) => i.code),
      ]),
    ]
      .filter(eligible)
      .slice(0, run.scopeLimit);
    run.summary.tier1 = Math.min(tier1.length, run.scopeLimit);
    run.summary.tier2 = symbols.length - run.summary.tier1;
    run.summary.omitted = tier1.slice(run.scopeLimit);
    run.summary.tier1Truncated = run.summary.omitted.length > 0;
    return symbols;
  }
  private async collect(run: SyncRun, includeMaster: boolean) {
    if (includeMaster) {
      await this.market.syncMastersAtomic(run.runId);
      run.masterRefreshed = true;
      this.store.saveSync(run);
    }
    const symbols = this.symbols(run);
    run.totalSymbols = symbols.length;
    this.store.saveSync(run);
    if (symbols[0] !== '069500') {
      run.reasonCode = 'REFERENCE_UNAVAILABLE';
      throw Error();
    }
    const to = run.targetDate,
      from = addDays(to, -60);
    let calendar: DailyInput['calendar'];
    for (const code of symbols) {
      const source = run.trigger === 'manual' ? 'manual_sync' : 'post_close_sync';
      const daily = this.market.start({ id: randomUUID(), code, from, to, adjustment: 'raw' },
        { triggerSource: source, syncRunId: run.runId });
      const result = await this.market.step(daily.id, {
        syncId: run.runId,
        source,
        calendar: (page) => {
          if (code === '069500') {
            const check = verifyCalendar(from, to, page, (day) => this.market.noticeFor(day));
            run.summary.mismatch = check.mismatch;
            run.calendarVerified = check.verified;
            if (check.verified) calendar = { source: calendarSource, dates: check.dates };
          }
          return calendar;
        },
      });
      if (result.quality.state === 'passed') run.succeededSymbols++;
      else {
        run.failedSymbols++;
        run.summary.failures.push({
          code,
          reason: result.status.error ? 'DAILY_FAILED' : result.quality.state,
        });
      }
      this.store.saveSync(run);
      if (code === '069500' && (!result.coverageComplete || result.quality.state === 'failed')) {
        run.reasonCode = 'REFERENCE_UNAVAILABLE';
        throw Error();
      }
    }
    run.status = run.failedSymbols ? (run.succeededSymbols ? 'partial' : 'failed') : 'succeeded';
    if (!run.calendarVerified) run.reasonCode = 'CALENDAR_UNVERIFIED';
  }
}
