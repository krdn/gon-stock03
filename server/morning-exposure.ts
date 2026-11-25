import type { MorningReport } from '../shared/morning.ts';
import type { KisClient } from './kis.ts';
import type { Store } from './store.ts';

export async function applyExposure(report: MorningReport, store: Store, kis: KisClient) {
  const instruments = new Map(store.masterData().instruments.map((i) => [i.code, i]));
  const funds = new Map<string, Map<string, number>>();
  const codes = [...new Set([...report.holdings, ...report.candidates].map((p) => p.code))];
  const held = new Set(report.holdings.map((p) => p.code));
  const missingBaskets = new Set<string>();
  let complete = true;
  for (const code of codes) {
    const instrument = instruments.get(code);
    if (!instrument) {
      complete = false;
      continue;
    }
    if (instrument.kind !== 'etf') continue;
    try {
      funds.set(code, await kis.etfWeights(code));
    } catch {
      missingBaskets.add(code);
      report.gaps.push(instrument.name + ' 구성비 전체 확인 불가 · 이 ETF 매수 보류');
      if (held.has(code)) complete = false;
    }
  }
  const exposure = new Map<string, number>();
  const components = (code: string) => funds.get(code) ?? new Map([[code, 1]]);
  for (const h of report.holdings) {
    if (h.value === null) {
      complete = false;
      continue;
    }
    for (const [code, weight] of components(h.code))
      exposure.set(code, (exposure.get(code) ?? 0) + h.value * weight);
  }
  const sectorExposure = new Map<string, number>();
  for (const [code, amount] of exposure) {
    const sector = instruments.get(code)?.sector;
    if (sector) sectorExposure.set(sector, (sectorExposure.get(sector) ?? 0) + amount);
  }
  const openingSector = new Map(sectorExposure);
  const cap = store.read().risk.maxPosition;
  for (const candidate of report.candidates) {
    const weights = components(candidate.code);
    for (const [code, weight] of weights) {
      candidate.limit = Math.min(
        candidate.limit,
        Math.max(0, Math.floor((cap - (exposure.get(code) ?? 0)) / weight)),
      );
    }
    const sectors = new Map<string, number>();
    for (const [code, weight] of weights) {
      const sector = instruments.get(code)?.sector;
      if (sector) sectors.set(sector, (sectors.get(sector) ?? 0) + weight);
    }
    for (const [sector, weight] of sectors)
      candidate.limit = Math.min(
        candidate.limit,
        Math.max(0, Math.floor((cap - (sectorExposure.get(sector) ?? 0)) / weight)),
      );
    if (!complete || missingBaskets.has(candidate.code)) candidate.limit = 0;
    for (const [sector, weight] of sectors)
      sectorExposure.set(sector, (sectorExposure.get(sector) ?? 0) + candidate.limit * weight);
    for (const [code, weight] of weights) exposure.set(code, (exposure.get(code) ?? 0) + candidate.limit * weight);
  }
  for (const watch of report.watch) {
    // Until an ETF has a verified basket its discretionary intraday budget is zero.
    watch.sector = instruments.get(watch.code)?.sector;
    watch.sectorRoom = watch.sector ? Math.max(0, cap - (sectorExposure.get(watch.sector) ?? 0)) : undefined;
    watch.limit =
      complete && instruments.get(watch.code)?.kind === 'stock'
        ? Math.max(
            0,
            Math.min(store.read().risk.maxOrder, watch.sectorRoom ?? cap, cap - (exposure.get(watch.code) ?? 0)),
          )
        : 0;
  }
  report.sectors = [...sectorExposure].map(([sector, planned]) => ({
    sector,
    held: openingSector.get(sector) ?? 0,
    planned,
  }));
  report.exposureComplete = complete;
  if (!complete) report.gaps.push('기초 종목의 중복 보유 확인이 부족해 새 매수를 보류해.');
  else report.gaps = report.gaps.filter((g) => g !== 'ETF 구성 종목 중복 비중 미측정');
  report.retainedCash =
    report.cash === null ? null : report.cash - report.candidates.reduce((v, p) => v + p.limit, 0);
}
