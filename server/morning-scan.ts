import { randomUUID } from 'node:crypto';
import { addDays, masterSourceLabel } from '../shared/market-data.ts';
import { seoulDay } from './morning.ts';
import type { Store } from './store.ts';
import type { KisClient } from './kis.ts';
import type { MarketData } from './market-data.ts';

export class MorningScan {
  state = { running: false, checked: 0, total: 0, day: '', message: '' };
  private stopped = false;
  constructor(
    private store: Store,
    private kis: KisClient,
    private market: MarketData,
  ) {}
  close() {
    this.stopped = true;
  }
  start(open = '09:00') {
    if (!this.kis.configured()) throw new Error('KIS 모의 시세 연결이 필요합니다.');
    if (this.state.running) return this.state;
    const day = seoulDay(Date.now());
    if (Date.now() >= Date.parse(day + 'T' + open + ':00+09:00'))
      throw new Error('당일 장전 수집 시간이 지났습니다.');
    this.state = { running: true, checked: 0, total: 0, day, message: '공식 목록을 확인하고 있어.' };
    void this.collect(day, open)
      .catch((e) => {
        this.state.message = e instanceof Error ? e.message : '자료 수집 실패';
      })
      .finally(() => {
        this.state.running = false;
      });
    return this.state;
  }
  private async collect(day: string, open: string) {
    const master = await this.market.refreshMaster();
    if (this.stopped) return;
    if (
      master.sources.length !== 2 ||
      master.sources.some((s) => s.phase !== 'ready' || masterSourceLabel(s) !== 'KIS 공개 종목 마스터')
    )
      throw new Error('공식 종목 목록 전체 확인 실패');
    const instruments = master.instruments.filter(
      (i) => ['EF', 'ST'].includes(i.group) && i.tradingHalted === false && i.liquidation === false,
    );
    this.state.total = instruments.length;
    const to = addDays(day.replaceAll('-', ''), -1),
      from = addDays(to, -42);
    const source =
      'https://apiportal.koreainvestment.com/apiservice-apiservice?/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice';
    const base = { id: randomUUID(), code: '069500', from, to, adjustment: 'raw' as const };
    const reference = await this.kis.dailyPage(base, from, to);
    const dates = [...new Set(reference.filter((b) => b.volume > 0).map((b) => b.date))].sort();
    if (dates.length < 21 || this.stopped) throw new Error('KODEX 200의 비교 거래일 부족');
    const already = new Set(
      this.store
        .dailyRuns()
        .filter(
          (r) =>
            r.to === to &&
            r.from === from &&
            r.adjustment === 'raw' &&
            r.status.complete &&
            r.calendar?.dates.join() === dates.join(),
        )
        .map((r) => r.code),
    );
    const held = new Set(this.kis.connection().balance?.positions.map((p) => p.code));
    instruments.sort((a, b) => Number(held.has(b.code)) - Number(held.has(a.code)));
    let failures = 0;
    for (const i of instruments) {
      if (this.stopped) return;
      if (Date.now() >= Date.parse(day + 'T' + open + ':00+09:00'))
        throw new Error('장전 마감 · 완료한 종목만 보존했어.');
      if (!already.has(i.code)) {
        const run = this.market.start({ ...base, id: randomUUID(), code: i.code, calendar: { source, dates } });
        const saved = await this.market.step(run.id);
        if (saved.status.error) {
          failures++;
          if (failures >= 3) throw new Error('연속 수집 실패 · ' + saved.status.error);
        } else failures = 0;
      }
      this.state.checked++;
      this.state.message = 'KODEX 200 관측 거래일과 종목별 일봉을 대조 중이야.';
    }
    this.state.message = '전체 목록의 일봉 대조를 마쳤어.';
  }
}
