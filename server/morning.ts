import { randomUUID } from 'node:crypto';
import { addDays, masterSourceLabel, type StoredBar } from '../shared/market-data.ts';
import {
  AFTER_OPEN_BLOCK_REASON,
  APPROVAL_BLOCK_TEXT,
  MISSING_BALANCE_BLOCK_REASON,
  type MorningCandidate,
  type MorningItem,
  type MorningReport,
} from '../shared/morning.ts';
import type { ConnectionState } from '../shared/model.ts';
import type { Store } from './store.ts';

export function seoulDay(now: number) {
  return new Date(now + 9 * 3600000).toISOString().slice(0, 10);
}

type EvaluateResult =
  | { kind: 'skip' }
  | { kind: 'invalid' }
  | { kind: 'ok'; breakout: boolean; candidate: MorningCandidate };

function evaluateBars(
  code: string,
  name: string,
  rawBars: StoredBar[],
  cutoff: number,
  day: string,
  heldQty: number,
): EvaluateResult {
  const bars = rawBars
    .filter((b) => b.date < day.replaceAll('-', '') && Date.parse(b.collectedAt) <= cutoff)
    .slice(-21);
  if (bars.length < 21) return { kind: 'skip' };
  const last = bars[20],
    prev = bars.slice(0, 20);
  if (cutoff - Date.parse(last.date.replace(/^(....)(..)(..)$/, '$1-$2-$3') + 'T15:30:00+09:00') > 5 * 86400000)
    return { kind: 'skip' };
  const reference = Math.max(...prev.map((b) => b.high)),
    avgVolume = prev.reduce((s, b) => s + b.volume, 0) / 20;
  if (avgVolume <= 0 || bars.some((b) => b.low <= 0 || b.volume <= 0)) return { kind: 'invalid' };
  const breakout = last.close >= reference && last.volume > avgVolume;
  const candidate: MorningCandidate = {
    code,
    name,
    held: heldQty,
    closes: bars.map((b) => b.close),
    asOf: last.date,
    reference: Math.max(reference, last.close),
    exit: Math.min(...prev.slice(-5).map((b) => b.low)),
    limit: 0,
    relativeVolume: last.volume / avgVolume,
  };
  return { kind: 'ok', breakout, candidate };
}

export function buildMorning(
  store: Store,
  connection: ConnectionState,
  now: number,
  news: MorningItem[],
  gaps: string[],
  indicators: MorningReport['indicators'] = [],
  open = '09:00',
): MorningReport {
  const day = seoulDay(now);
  const openAt = Date.parse(day + 'T' + open + ':00+09:00');
  const cutoff = Math.min(now, openAt);
  const market = store.masterData(),
    risk = store.read().risk;
  const fresh = (at: string | null, ttl: number) =>
    at !== null && Date.parse(at) <= cutoff && cutoff - Date.parse(at) <= ttl;
  const available = new Set(
    market.sources
      .filter(
        (s) =>
          s.phase === 'ready' &&
          masterSourceLabel(s) === 'KIS 공개 종목 마스터' &&
          fresh(s.lastSuccessAt, 7 * 86400000),
      )
      .map((s) => s.exchange),
  );
  const universe = market.instruments.filter(
    (i) =>
      available.has(i.exchange) &&
      ['ST', 'EF'].includes(i.group) &&
      i.liquidation === false &&
      i.tradingHalted === false,
  );
  const balance =
    connection.status.complete &&
    connection.status.phase === 'ready' &&
    fresh(connection.status.lastSuccessAt, connection.status.staleAfterMs)
      ? connection.balance
      : undefined;
  const holdings = (balance?.positions ?? [])
    .filter((p) => p.qty > 0)
    .map((p) => ({ code: p.code, name: p.name, qty: p.qty, value: p.price === null ? null : p.price * p.qty }));
  const held = new Map(holdings.map((p) => [p.code, p]));
  const instruments = new Map(universe.map((i) => [i.code, i]));
  const seen = new Set<string>(),
    candidates: MorningCandidate[] = [],
    watch: MorningReport['watch'] = [];
  const recordEvaluated = (evaluated: Extract<EvaluateResult, { kind: 'ok' }>) => {
    const { breakout, candidate } = evaluated;
    seen.add(candidate.code);
    if (breakout || held.has(candidate.code)) candidates.push(candidate);
    if (!breakout && !held.has(candidate.code)) {
      const { closes, ...levels } = candidate;
      watch.push(levels);
    }
  };
  const recentBars = store.morningRecentBars(
    addDays(day.replaceAll('-', ''), -60),
    day.replaceAll('-', ''),
    new Date(cutoff).toISOString(),
  );
  const incompleteMeta = store.morningIncompleteMeta(day.replaceAll('-', ''), new Date(cutoff).toISOString());
  for (const [code, rawBars] of recentBars) {
    const instrument = instruments.get(code);
    if (!instrument || seen.has(code)) continue;
    const evaluated = evaluateBars(code, instrument.name, rawBars, cutoff, day, held.get(code)?.qty ?? 0);
    if (evaluated.kind === 'invalid') seen.add(code);
    else if (evaluated.kind === 'ok') recordEvaluated(evaluated);
  }
  const runs = store
    .dailyRuns()
    .filter(
      (r) =>
        r.adjustment === 'raw' &&
        r.quality.state === 'passed' &&
        r.coverageComplete &&
        r.status.complete &&
        fresh(r.status.lastSuccessAt, 7 * 86400000),
    )
    .sort((a, b) => b.to.localeCompare(a.to));
  for (const run of runs) {
    const instrument = instruments.get(run.code);
    if (!instrument || seen.has(run.code)) continue;
    const incomplete = incompleteMeta.get(run.code);
    if (incomplete && (run.to < incomplete.toDate || Date.parse(run.status.lastSuccessAt!) <= Date.parse(incomplete.checkedAt)))
      continue;
    const evaluated = evaluateBars(
      run.code,
      instrument.name,
      store.dailyBars(run.id),
      cutoff,
      day,
      held.get(run.code)?.qty ?? 0,
    );
    if (evaluated.kind === 'invalid') seen.add(run.code);
    else if (evaluated.kind === 'ok') recordEvaluated(evaluated);
  }
  candidates.sort((a, b) => b.relativeVolume - a.relativeVolume || a.code.localeCompare(b.code));
  const materialNews = (p: MorningCandidate) =>
    news.filter((n) => n.title.includes(p.name) && Date.parse(n.publishedAt) <= cutoff);
  const riskDisclosure = (p: MorningCandidate) =>
    materialNews(p).some((n) => /거래정지|상장폐지|감사의견거절|회생절차/.test(n.title));
  const weakerMarket = indicators.some(
    (i) => i.id === 'SP500' && i.latest !== null && i.previous !== null && i.latest < i.previous,
  );
  const weakerWon = indicators.some(
    (i) => i.id === 'DEXKOUS' && i.latest !== null && i.previous !== null && i.latest > i.previous,
  );
  const cautious = weakerMarket && weakerWon;
  const picks = [...candidates.filter((p) => p.held > 0), ...candidates.filter((p) => !p.held).slice(0, 5)];
  const warnings = [...gaps];
  const approvalBlockReasons: string[] = [];
  const addBlockReason = (reason: string) => {
    if (!approvalBlockReasons.includes(reason)) approvalBlockReasons.push(reason);
  };
  for (const gap of gaps) {
    if (gap.includes(APPROVAL_BLOCK_TEXT)) addBlockReason(gap);
  }
  if (now >= openAt) {
    warnings.push(AFTER_OPEN_BLOCK_REASON);
    addBlockReason(AFTER_OPEN_BLOCK_REASON);
  }
  if (!balance) {
    warnings.push(MISSING_BALANCE_BLOCK_REASON);
    addBlockReason(MISSING_BALANCE_BLOCK_REASON);
  } else if (balance.totalEquity <= 0) {
    addBlockReason(MISSING_BALANCE_BLOCK_REASON);
  }
  if (available.size !== 2) warnings.push('두 시장의 공식 종목 목록 갱신 필요');
  if (seen.size < universe.length) warnings.push('검증된 최근 일봉이 없는 종목 제외');
  // Exposure by ETF constituent is unknown until a point-in-time holdings file is available.
  if (
    holdings.some((p) => market.instruments.find((i) => i.code === p.code)?.kind === 'etf') ||
    picks.some((p) => instruments.get(p.code)?.kind === 'etf')
  )
    warnings.push('ETF 구성 종목 중복 비중 미측정');
  let remaining = balance?.cash ?? 0;
  for (const p of picks) {
    const value = held.get(p.code)?.value;
    const room = value === null ? 0 : risk.maxPosition - (value ?? 0);
    if (riskDisclosure(p)) {
      warnings.push(p.name + ' 위험 공시 제목 확인 · 매수 보류');
      continue;
    }
    if (p.held && p.closes.at(-1)! < p.reference) continue;
    p.limit = Math.max(
      0,
      Math.min(
        Math.floor(((balance?.cash ?? 0) * (cautious ? 0.5 : 1)) / picks.length),
        remaining,
        room,
        risk.maxOrder,
      ),
    );
    remaining -= p.limit;
  }
  return {
    id: randomUUID(),
    day,
    createdAt: new Date(now).toISOString(),
    cutoff: new Date(cutoff).toISOString(),
    cash: balance?.cash ?? null,
    equity: balance?.totalEquity ?? null,
    conclusion: cautious
      ? '미국 주가가 내리고 원화가 약해져, 새 후보에 배분할 현금을 절반으로 줄였어.'
      : '최근 고점과 거래량을 함께 확인해 보유 종목과 새 후보를 골랐어.',
    exposureComplete: false,
    indicators,
    watch: watch.sort((a, b) => b.relativeVolume - a.relativeVolume || a.code.localeCompare(b.code)),
    holdings,
    universe: universe.length,
    evaluated: seen.size,
    candidates: picks,
    retainedCash: balance ? remaining : null,
    dailyLoss: risk.dailyLoss,
    news: news
      .filter((n) => Date.parse(n.publishedAt) <= cutoff)
      .sort(
        (a, b) =>
          Number(picks.some((p) => b.title.includes(p.name))) -
          Number(picks.some((p) => a.title.includes(p.name))),
      ),
    gaps: warnings,
    approvalBlocked: approvalBlockReasons.length > 0,
    approvalBlockReasons,
    approvedAt: null,
  };
}
