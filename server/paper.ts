import type { OrderInput } from '../shared/contracts.ts';
import type { PaperOrder } from '../shared/model.ts';
import { KisClient, KisRejected, KisNotSent, koreaDate } from './kis.ts';
import { Store } from './store.ts';
import { record } from './engine.ts';

export class PaperBroker {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private store: Store, private kis: KisClient) {}
  async refresh(freshBalance = false) {
    const connection = await this.kis.balance(freshBalance); const orders = await this.kis.dailyOrders();
    const byDay = new Map([[koreaDate(), orders]]);
    for (const local of this.store.paperOrders()) {
      if (!local.brokerId || ['filled', 'cancelled', 'rejected'].includes(local.status)) continue;
      if (!byDay.has(local.tradeDate)) byDay.set(local.tradeDate, await this.kis.dailyOrders(local.tradeDate));
      const normalizeId = (id: string) => id.replace(/^0+(?=\d)/, '');
      const row = byDay.get(local.tradeDate)!.find(o => normalizeId(o.brokerId) === normalizeId(local.brokerId!) && o.code === local.code && o.date === local.tradeDate && o.side === local.side && o.qty === local.qty);
      if (!row) { this.store.savePaper({ ...local, status: 'unknown', message: '저장한 주문번호가 KIS 조회에서 확인되지 않습니다. 추가 주문을 차단합니다.' }); continue; }
      local.filled = row.filled; local.remaining = row.remaining;
      local.status = row.filled >= local.qty ? 'filled' : row.cancelled || row.remaining === 0 ? 'cancelled' : row.filled > 0 ? 'partial' : 'accepted';
      local.message = 'KIS 주문 조회와 대조했습니다.'; this.store.savePaper(local);
    }
    return { connection, brokerOrders: orders, orders: this.store.paperOrders() };
  }
  async submit(input: OrderInput): Promise<PaperOrder> {
    const job = this.queue.catch(() => {}).then(async () => {
      const existing = this.store.paperOrders().find(o => o.requestId === input.requestId);
      if (existing) {
        if (existing.code !== input.code || existing.side !== input.side || existing.qty !== input.qty || existing.price !== input.price) throw new Error('동일 요청 ID의 주문 내용이 다릅니다.');
        return existing;
      }
      if (this.store.paperOrders().some(o => ['unknown', 'sending'].includes(o.status))) throw new Error('응답 불명 주문이 있습니다. KIS 계좌 대조 전 추가 주문을 차단합니다.');
      if (this.store.paperOrders().length >= 1000) throw new Error('KIS 주문 기록 한도에 도달했습니다.');
      const { connection, brokerOrders } = await this.refresh(true); const balance = connection.balance!;
      if (this.store.paperOrders().some(o => o.status === 'unknown')) throw new Error('계좌 대조 중 응답 불명 주문이 확인되었습니다.');
      const quote = await this.kis.quote(input.code, true);
      const risk = this.store.read().risk;
      if (risk.halted) throw new Error('신규 주문 정지 상태입니다.');
      const value = balance.totalEquity;
      if (this.store.paperBaseline(koreaDate(), value) - value >= risk.dailyLoss) throw new Error('KIS 모의 계좌 손실 한도에 도달했습니다.');
      if (quote.stopped) throw new Error('거래정지 종목은 주문할 수 없습니다.');
      if (input.price < quote.lower || input.price > quote.upper) throw new Error('지정가가 KIS 가격 제한 범위를 벗어났습니다.');
      const amount = input.price * input.qty;
      if (!Number.isSafeInteger(amount) || amount > risk.maxOrder) throw new Error('1회 주문 한도를 초과했습니다.');
      const holding = balance.positions.find(p => p.code === input.code);
      if (input.side === 'buy') {
        const pending = brokerOrders.filter(o => o.code === input.code && o.side === 'buy' && !o.cancelled).reduce((a, o) => a + o.remaining * o.price, 0);
        if ((holding?.qty ?? 0) * quote.price + pending + amount > risk.maxPosition) throw new Error('KIS 종목별 투자 한도를 초과했습니다.');
        const power = await this.kis.buyingPower(input.code, input.price);
        if (input.qty > power.qty || amount > power.cash) throw new Error('KIS 미수 없는 매수 가능 수량 또는 현금이 부족합니다.');
      } else {
        const reserved = brokerOrders.filter(o => o.code === input.code && o.side === 'sell' && !o.cancelled).reduce((a, o) => a + o.remaining, 0);
        if (input.qty > (holding?.qty ?? 0) - reserved) throw new Error('KIS 매도 가능 보유 수량이 부족합니다.');
      }
      const latestRisk = this.store.read().risk;
      if (latestRisk.halted || JSON.stringify(risk) !== JSON.stringify(latestRisk)) throw new Error('검증 중 위험 설정이 바뀌었습니다. 다시 확인하세요.');
      const local: PaperOrder = { ...input, createdAt: new Date().toISOString(), tradeDate: koreaDate(), status: 'sending', filled: 0, remaining: input.qty, message: 'KIS 모의 전송 중' };
      this.store.savePaper(local);
      try {
        const receipt = await this.kis.submit(input, () => {
          const currentRisk = this.store.read().risk;
          if (currentRisk.halted || JSON.stringify(currentRisk) !== JSON.stringify(risk)) throw new KisNotSent('전송 직전 위험 설정 변경으로 주문을 보내지 않았습니다.');
        });
        Object.assign(local, receipt, { status: 'accepted', message: 'KIS 모의 주문 접수. 체결은 조회·대조로 확인하세요.' });
      } catch (error) {
        local.status = error instanceof KisRejected || error instanceof KisNotSent ? 'rejected' : 'unknown';
        local.message = error instanceof Error ? error.message : '주문 응답 불명';
      }
      this.store.savePaper(local);
      this.store.update(state => record(state, `KIS 모의 주문 ${local.status}`, local.message, local.status === 'accepted' ? 'info' : 'warning'));
      return local;
    });
    this.queue = job; return job;
  }
}
