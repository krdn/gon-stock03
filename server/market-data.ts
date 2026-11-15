import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { dailyInput, addDays, type DailyInput, type DailyPrice, type DailyRun, type Exchange, type MasterSnapshot } from '../shared/market-data.ts';
import { emptyStatus } from '../shared/status.ts';
import { KisClient, KisDataError, koreaDate } from './kis.ts';
import { Store } from './store.ts';

const masterUrl = (exchange: Exchange) => `https://new.real.download.dws.co.kr/common/master/${exchange.toLowerCase()}_code.mst.zip`;
const endpoint = '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice';
const unzip = promisify(execFile);

export function parseMaster(bytes: Buffer, exchange: Exchange): MasterSnapshot {
  let content: string;
  try { content = new TextDecoder('euc-kr', { fatal: true }).decode(bytes); }
  catch { throw new Error('종목 마스터 문자 인코딩이 올바르지 않습니다.'); }
  const tail = exchange === 'KOSPI' ? 227 : 221;
  const rows: MasterSnapshot['rows'] = []; const seen = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    if (!line) continue;
    if (line.length <= 21 + tail) throw new Error('종목 마스터 고정폭 형식이 일치하지 않습니다.');
    const group = line.slice(-tail, -tail + 2);
    if (!['ST', 'MF', 'RT', 'SC', 'IF', 'DR', 'FS', 'EF'].includes(group)) continue;
    const code = line.slice(0, 9).trim(), isin = line.slice(9, 21).trim(), name = line.slice(21, -tail).trim();
    if (!/^[0-9A-Z]{6}$/.test(code) || !/^[A-Z0-9]{12}$/.test(isin) || !name || seen.has(code)) throw new Error('종목 마스터 코드·이름이 잘못되었거나 중복되었습니다.');
    const flagOffset = exchange === 'KOSPI' ? 60 : 55;
    const flag = (offset: number) => line.at(-tail + offset) === 'Y' ? true : line.at(-tail + offset) === 'N' ? false : undefined;
    seen.add(code); rows.push({ code, isin, name, exchange, kind: group === 'EF' ? 'etf' : 'stock', group, tradingHalted: flag(flagOffset), liquidation: flag(flagOffset + 1) });
  }
  if (!rows.length) throw new Error('종목 마스터에 주식·ETF가 없습니다.');
  return { exchange, source: masterUrl(exchange), sha256: createHash('sha256').update(bytes).digest('hex'), collectedAt: new Date().toISOString(), rows };
}

async function downloadMaster(exchange: Exchange, transport: typeof fetch): Promise<MasterSnapshot> {
  let directory: string | undefined;
  try {
    const response = await transport(masterUrl(exchange), { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok || !response.body) throw new Error();
    const chunks: Uint8Array[] = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length; if (size > 8 * 1024 * 1024) { await response.body.cancel().catch(() => {}); throw new Error(); }
      chunks.push(chunk);
    }
    directory = await mkdtemp(join(tmpdir(), 'stock03-master-'));
    const archive = join(directory, 'master.zip'); await writeFile(archive, Buffer.concat(chunks), { mode: 0o600 });
    const { stdout } = await unzip('unzip', ['-p', archive, `${exchange.toLowerCase()}_code.mst`], { encoding: 'buffer', timeout: 15000, maxBuffer: 16 * 1024 * 1024 });
    return parseMaster(stdout, exchange);
  } catch { throw new Error('공식 종목 마스터 다운로드·압축 해제·형식 검증에 실패했습니다. TLS와 unzip 설치를 확인하세요.'); }
  finally { if (directory) await rm(directory, { recursive: true, force: true }); }
}

function quality(run: DailyRun, dates: string[]): DailyRun['quality'] {
  if (!run.coverageComplete) return run.quality;
  const actual = new Set(dates);
  if (run.calendar) {
    const expected = new Set(run.calendar.dates);
    const missingDates = [...expected].filter(date => !actual.has(date)).sort();
    const unexpectedDates = dates.filter(date => !expected.has(date));
    return { ...run.quality, state: missingDates.length || unexpectedDates.length ? 'failed' : 'passed', missingDates, unexpectedDates };
  }
  const candidateMissingDates: string[] = [];
  for (let day = run.from; day <= run.to; day = addDays(day, 1)) {
    const weekday = new Date(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !actual.has(day)) candidateMissingDates.push(day);
  }
  return { ...run.quality, state: 'unverified', candidateMissingDates };
}

export class MarketData {
  private stepping = false;
  private refreshing?: Promise<ReturnType<Store['masterData']>>;
  constructor(private store: Store, private kis: KisClient, private transport: typeof fetch = fetch) {}
  refreshMaster() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.loadMasters().finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }
  private async loadMasters() {
    const previousSources = this.store.masterData().sources;
    const states = (['KOSPI', 'KOSDAQ'] as const).map(exchange => {
      const previous = previousSources.find(row => row.exchange === exchange);
      return { exchange, source: masterUrl(exchange), phase: 'loading' as const, observedAt: new Date().toISOString(), lastSuccessAt: previous?.lastSuccessAt ?? null, sha256: previous?.sha256 ?? null, count: previous?.count ?? 0, error: null };
    });
    this.store.saveMasterStates(states);
    try {
      const snapshots: MasterSnapshot[] = [];
      for (const exchange of ['KOSPI', 'KOSDAQ'] as const) snapshots.push(await downloadMaster(exchange, this.transport));
      this.store.saveMasters(snapshots);
    } catch {
      this.store.saveMasterStates(states.map(state => ({ ...state, phase: 'error', observedAt: new Date().toISOString(), error: '두 시장의 마스터 수집·검증·저장에 실패해 전체 교체를 보류했습니다. 이전 성공 자료를 보존했습니다. 다시 수집하세요.' })));
    }
    return this.store.masterData();
  }
  start(input: unknown) {
    const config = dailyInput.parse(input);
    if (config.to >= koreaDate()) throw new Error('일봉 수집 종료일은 서울 기준 오늘보다 이전이어야 합니다.');
    if (config.calendar) config.calendar.dates.sort();
    const previous = this.store.dailyRun(config.id);
    if (previous) {
      const previousConfig: DailyInput = { id: previous.id, code: previous.code, from: previous.from, to: previous.to, adjustment: previous.adjustment, ...(previous.calendar ? { calendar: previous.calendar } : {}) };
      if (JSON.stringify(config) !== JSON.stringify(previousConfig)) throw new Error('이미 사용한 수집 ID의 조건을 변경할 수 없습니다.');
      return previous;
    }
    const run: DailyRun = { ...config, source: 'kis-rest', exchange: 'KRX', endpoint, startedAt: new Date().toISOString(), captureDate: koreaDate(), nextDate: config.from, coverageComplete: false,
      status: { ...emptyStatus('kis-paper'), phase: 'partial', staleAfterMs: 86400000 },
      quality: { state: 'pending', missingDates: [], unexpectedDates: [], candidateMissingDates: [], duplicates: 0, emptyWindows: [] } };
    this.store.saveDaily(run); return run;
  }
  async step(id: string) {
    const run = this.store.dailyRun(id);
    if (!run) throw new Error('수집 ID를 찾지 못했습니다.');
    if (this.stepping) throw new Error('다른 일봉 구간을 수집 중입니다. 완료 후 재개하세요.');
    if (!run.nextDate) return run;
    if (run.captureDate !== koreaDate()) throw new Error('수집 날짜가 바뀌었습니다. 수정 기준 혼합을 피하려면 새 ID로 전체 기간을 수집하세요.');
    this.stepping = true;
    const from = run.nextDate, to = [addDays(from, 89), run.to].sort()[0];
    try {
      this.store.saveDaily({ ...run, status: { ...run.status, phase: 'loading', error: null } });
      const page = await this.kis.dailyPage(run, from, to);
      if (run.captureDate !== koreaDate()) throw new KisDataError('contract', '수집 중 서울 날짜가 바뀌었습니다. 새 수집 ID가 필요합니다.');
      const unique = new Map<string, DailyPrice>(); let duplicates = 0;
      for (const row of page) {
        const previous = unique.get(row.date);
        if (previous) {
          if (JSON.stringify(previous) !== JSON.stringify(row)) throw new KisDataError('contract', '같은 거래일에 서로 다른 일봉이 반환되었습니다.');
          duplicates++;
        } else unique.set(row.date, row);
      }
      const now = new Date().toISOString();
      const bars = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date)).map(row => ({ ...row, code: run.code, adjustment: run.adjustment, source: 'kis-rest' as const, collectedAt: now }));
      const next: DailyRun = { ...run, nextDate: to === run.to ? null : addDays(to, 1), coverageComplete: to === run.to,
        quality: { ...run.quality, duplicates: run.quality.duplicates + duplicates, emptyWindows: bars.length ? run.quality.emptyWindows : [...run.quality.emptyWindows, { from, to }] } };
      next.quality = quality(next, [...this.store.dailyBars(id).map(bar => bar.date), ...bars.map(bar => bar.date)]);
      const complete = next.coverageComplete && next.quality.state === 'passed';
      next.status = { ...run.status, phase: complete ? 'ready' : 'partial', complete, observedAt: now, lastSuccessAt: complete ? now : null, error: null, pages: run.status.pages + 1 };
      this.store.saveDaily(next, bars); return next;
    } catch (error) {
      const message = error instanceof KisDataError ? `${error.message} ${error.kind === 'contract' ? '원천 데이터·수집 날짜를 확인하세요. 반복 재개로 품질 오류를 해소하지 않습니다.' : '연결·인증·제한 상태를 확인한 뒤 마지막 저장 구간부터 재개하세요.'}` : '일봉 저장에 실패했습니다. 저장소 상태를 확인한 뒤 재개하세요.';
      const failed: DailyRun = { ...run, status: { ...run.status, phase: run.status.pages ? 'partial' : 'error', complete: false, observedAt: new Date().toISOString(), error: message } };
      this.store.saveDaily(failed); return failed;
    } finally { this.stepping = false; }
  }
}
