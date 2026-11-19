import { paperRecoveryInput, type PaperOrderInput, type PaperRecoveryInput } from '../shared/contracts.ts';
import type { PaperOrder, BrokerOrder, PaperEvidence, ConnectionState, PaperRiskSnapshot } from '../shared/model.ts';
import { KisClient, KisRejected, KisNotSent, koreaDate } from './kis.ts';
import { Store } from './store.ts';
import { halt } from './engine.ts';
import { assertStrategyTerms, strategyContractSchema, type StrategyContract } from './strategy-contract.ts';
import type { Strategy } from '../shared/model.ts';
import { z } from 'zod';

export const paperApprovalSchema = z.object({ date: z.iso.date(), requestId: z.uuid(), cancelProbe: z.literal(true).optional(), code: z.enum(['069500', '005930']).optional(), maxAmount: z.number().int().positive().max(300000).optional(), orderType: z.literal('market').optional(), allowExistingHolding: z.literal(true).optional() }).strict().refine(value => value.orderType !== 'market' || (value.code === '005930' && !value.cancelProbe), '시장가는 삼성전자 매수1회·API 취소 없음 승인만 지원합니다.').refine(value => value.orderType === 'market' || (value.maxAmount ?? 100000) <= 200000, '지정가 승인 상한은 20만원입니다.');
export type PaperApproval = z.infer<typeof paperApprovalSchema>;

export const paperCapabilities = {
  changeOrders: { status: 'blocked', reason: '정정취소 전 필수 가능수량 조회는 모의투자 미지원입니다. KIS 모의 앱에서 수동 처리 후 주문을 대조하세요.', source: 'https://apiportal.koreainvestment.com/apiservice-apiservice?/uapi/domestic-stock/v1/trading/inquire-psbl-rvsecncl' },
} as const;
const normalizeId = (id: string) => id.replace(/^0+(?=\d)/, '');
const sameId = (a: string, b: string) => normalizeId(a) === normalizeId(b);
const matches = (local: PaperOrder, row: BrokerOrder) => row.date === local.tradeDate && row.code === local.code && row.side === local.side && row.qty === local.qty && row.price === local.price && (local.orderType ?? 'limit') === (row.orderType ?? 'limit');
function recoveryCandidates(local: PaperOrder, rows: BrokerOrder[]) {
  const candidates = rows.filter(row => matches(local, row));
  if (candidates.length === 1) {
    const [row] = candidates;
    if (row.filled < local.filled || (row.cancelled && row.remaining > 0)) return [];
  }
  return candidates;
}
const reconciled = (local: PaperOrder, row: BrokerOrder): PaperOrder => ({ ...local, brokerId: row.brokerId, organization: row.organization, filled: row.filled, remaining: row.remaining,
  status: row.filled === local.qty ? 'filled' : row.remaining === 0 ? 'cancelled' : row.filled > 0 ? 'partial' : 'accepted', message: 'KIS 주문 조회와 대조했습니다.' });
const evidence = (tradeDate: string, orders: BrokerOrder[], connection: ConnectionState): PaperEvidence => ({ observedAt: new Date().toISOString(), tradeDate, orders,
  balance: { cash: connection.balance!.cash, totalEquity: connection.balance!.totalEquity, positions: connection.balance!.positions.map(({ code, qty }) => ({ code, qty })) } });

export class PaperBroker {
  private realtimeGuard?: (code: string) => () => void;
  setRealtimeGuard(guard: (code: string) => () => void) { this.realtimeGuard = guard; }
  private restoredApproval = false;
  private queue: Promise<unknown> = Promise.resolve();
  private riskOrders: (NonNullable<PaperRiskSnapshot['orders']> & { day: string }) | null = null;
  constructor(private store: Store, private kis: KisClient, private approval?: PaperApproval, private contract?: StrategyContract) {
    if (contract) {
      this.contract = strategyContractSchema.parse(contract);
      if (approval || store.path !== contract.ledgerPath || kis.accountFingerprint() !== contract.accountFingerprint) throw new Error('전략 계약의 승인·원장·계좌 설정이 다릅니다.');
      store.bindStrategyContract(this.contract);
    } else if (store.strategyContract()) throw new Error('원장에 고정된 전략 계약이 필요합니다.');
    if (!approval && store.hasPaperRun()) throw new Error('저장된 1회 승인 설정이 필요합니다. 제한 없이 재시작할 수 없습니다.');
    if (approval && store.configurePaperRun(paperApprovalSchema.parse(approval))) {
      this.restoredApproval = true;
      kis.limitRequestsFor(0);
      store.update(state => halt(state, true));
    }
  }
  strategyBudget() {
    if (!this.contract) return undefined;
    const { maxAttempts, maxTotalAmount } = this.contract;
    return { ...this.store.strategyUsage(), maxAttempts, maxTotalAmount };
  }
  checkStrategyStart(strategy: Strategy) {
    if (!this.contract) throw new Error('저장 전략을 시작하려면 별도 전략 계약이 필요합니다.');
    assertStrategyTerms(this.contract, strategy);
    if (this.store.paperOrders().some(o => o.status === 'unknown' || o.status === 'sending')) throw new Error('응답 불명 또는 전송 중 주문을 먼저 대조하세요.');
    if (this.budgetExhausted()) throw new Error('전략 계약 한도가 소진됐습니다.');
  }
  budgetExhausted() {
    const b = this.strategyBudget();
    return b !== undefined && (b.attempts >= b.maxAttempts || b.amount >= b.maxTotalAmount);
  }
  contractExpired() { return this.contract !== undefined && Date.now() >= Date.parse(this.contract.endsAt); }
  approvalStatus() { return this.approval ? { active: true, ...this.approval } : { active: false }; }
  riskSnapshot(): PaperRiskSnapshot {
    const day = koreaDate();
    return { day, baselineEquity: this.store.paperBaselineValue(day), unresolvedCount: this.store.paperOrders().filter(o => o.status === 'unknown' || o.status === 'sending').length, orders: this.riskOrders?.day === day ? this.riskOrders : null };
  }
  private checkWindow() {
    const now = Date.now();
    if (this.approval && (now < Date.parse(`${this.approval.date}T09:00:00+09:00`) || now >= Date.parse(`${this.approval.date}T15:30:00+09:00`))) throw new KisNotSent('승인된 수동 실행 시간창 밖입니다.');
  }
  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const job = this.queue.catch(() => {}).then(run); this.queue = job; return job;
  }
  refresh(freshBalance = false) { return this.enqueue(() => this.refreshInsideQueue(freshBalance)); }
  private async refreshInsideQueue(freshBalance = false) {
    this.riskOrders = null;
    const day = koreaDate();
    const connection = await this.kis.balance(freshBalance); const orders = await this.kis.dailyOrders(day);
    const byDay = new Map([[day, orders]]);
    const pending = this.store.paperOrders().filter(local => local.brokerId && !['filled', 'cancelled', 'rejected'].includes(local.status));
    for (const local of pending) {
      if (!byDay.has(local.tradeDate)) byDay.set(local.tradeDate, await this.kis.dailyOrders(local.tradeDate));
    }
    for (const local of pending) {
      const rows = byDay.get(local.tradeDate)!;
      const found = rows.filter(row => sameId(row.brokerId, local.brokerId!) && (!local.organization || sameId(row.organization, local.organization)) && matches(local, row));
      const row = found.length === 1 ? found[0] : undefined;
      const next: PaperOrder = row && row.filled >= local.filled && !(row.cancelled && row.remaining > 0) ? reconciled(local, row) : { ...local, status: 'unknown', message: '저장한 주문과 KIS 조회가 일치하지 않습니다. 추가 주문을 차단합니다.' };
      if (next.status !== local.status || next.filled !== local.filled || next.remaining !== local.remaining) this.store.savePaper(next, { actor: 'system', action: 'reconcile', before: local.status, evidence: evidence(local.tradeDate, rows, connection) });
    }
    this.riskOrders = { day, observedAt: new Date().toISOString(), rows: orders.map(({ code, side, price, remaining, cancelled }) => ({ code, side, price, remaining, cancelled })) };
    return { connection, brokerOrders: orders, orders: this.store.paperOrders() };
  }
  cancelProbeEnabled() { return this.approval?.cancelProbe === true; }
  private probeOrder(orders: PaperOrder[]) {
    const order = orders.find(row => row.requestId === this.approval?.requestId);
    if (!order || !order.brokerId || !order.organization || order.code !== (this.approval?.code ?? '069500') || order.side !== 'buy' || order.qty !== 1 || order.price <= 0 || order.price > (this.approval?.maxAmount ?? 100000) || !['accepted', 'partial'].includes(order.status) || order.remaining <= 0) return undefined;
    return { ...order, brokerId: order.brokerId, organization: order.organization };
  }
  private probeExpiry(order: PaperOrder) {
    return Math.min(Date.parse(order.createdAt) + 120000, Date.parse(this.approval!.date + 'T15:30:00+09:00'));
  }
  private checkProbeWindow(order: PaperOrder) {
    this.checkWindow();
    const now = Date.now(), created = Date.parse(order.createdAt);
    if (order.tradeDate !== koreaDate() || order.tradeDate !== this.approval!.date.replaceAll('-', '') || !Number.isFinite(created) || now < created || now >= this.probeExpiry(order)) throw new KisNotSent('전량취소 검증 시간이 종료되었습니다.');
  }
  cancellation(orders: PaperOrder[]) {
    if (!this.cancelProbeEnabled()) return { candidate: null, reason: paperCapabilities.changeOrders.reason };
    const order = this.probeOrder(orders);
    if (!order || this.restoredApproval || this.store.paperAudit(order.requestId).some(a => a.action === 'cancel-attempt')) {
      return { candidate: null, reason: '이 실행에서 취소할 수 있는 승인 원주문이 없습니다.' };
    }
    try { this.checkProbeWindow(order); }
    catch { return { candidate: null, reason: '한정 전량취소 유효시간이 종료되었습니다.' }; }
    return { candidate: { requestId: order.requestId, expiresAt: new Date(this.probeExpiry(order)).toISOString() }, reason: '승인된 원주문의 미체결 잔량만 한 번 취소할 수 있습니다.' };
  }
  cancelProbe(id: string, reconcileFirst = false) {
    return this.enqueue(async () => {
      if (!this.cancelProbeEnabled() || id !== this.approval!.requestId) throw new Error('전량취소 검증 승인이 없습니다.');
      if (reconcileFirst) {
        if (this.cancellation(this.store.paperOrders()).candidate?.requestId !== id) throw new Error('현재 취소할 수 있는 승인 원주문이 없습니다.');
        await this.refreshInsideQueue(true);
      }
      const order = this.probeOrder(this.store.paperOrders());
      if (!order) throw new Error('승인된 미체결 원주문을 확인할 수 없습니다.');
      const check = () => this.checkProbeWindow(order);
      check();
      const pending: PaperOrder = { ...order, status: 'unknown', message: '전량취소 검증 시도. 최종 상태는 주문 조회로 확인하세요.' };
      this.store.claimPaperCancel(pending);
      this.riskOrders = null;
      try {
        await this.kis.cancelAll(order.brokerId, order.organization, check);
        pending.message = '전량취소 요청 접수. 취소 완료는 아직 확인되지 않았습니다.';
      } catch (error) {
        pending.message = error instanceof Error ? error.message : '전량취소 응답 불명';
      }
      this.store.savePaper(pending, { actor: 'system', action: 'cancel-response', before: 'unknown' });
      return pending;
    });
  }
  inspectRecovery(id: string) {
    return this.enqueue(async () => {
      const order = this.numberlessUnknown(id);
      const connection = await this.kis.balance(true); const rows = await this.kis.dailyOrders(order.tradeDate);
      const snapshot = evidence(order.tradeDate, rows, connection);
      const audit = this.store.appendPaperAudit({ requestId: id, actor: 'local-user', action: 'recovery-inspect', before: 'unknown', after: 'unknown', evidence: snapshot });
      return { order, evidenceId: audit.id, evidence: snapshot, candidates: recoveryCandidates(order, rows), message: '주문번호·거래일·종목·방향·수량·가격을 확인하세요. 조회에 없다는 이유로 불명을 해제하지 않습니다.' };
    });
  }
  confirmRecovery(raw: PaperRecoveryInput) {
    const input = paperRecoveryInput.parse(raw);
    return this.enqueue(async () => {
      const audit = this.store.paperAudit(input.id);
      const prior = audit.find(row => row.action === 'recovery-confirm' && row.recovery?.evidenceId === input.evidenceId);
      if (prior) {
        if (!sameId(prior.recovery!.brokerId, input.brokerId) || !sameId(prior.recovery!.organization, input.organization)) throw new Error('동일 복구 근거의 주문번호·조직번호가 다릅니다.');
        return this.store.paperOrders().find(order => order.requestId === input.id)!;
      }
      const order = this.numberlessUnknown(input.id);
      const inspected = audit.find(row => row.id === input.evidenceId && row.action === 'recovery-inspect');
      if (!inspected?.evidence || Date.now() - Date.parse(inspected.at) > 300000 || Date.now() < Date.parse(inspected.at)) throw new Error('복구 근거가 없거나 5분 유효기간이 지났습니다. 다시 조회하세요.');
      const selected = recoveryCandidates(order, inspected.evidence.orders);
      if (selected.length !== 1 || !sameId(selected[0].brokerId, input.brokerId) || !sameId(selected[0].organization, input.organization)) throw new Error('일치하는 복구 후보가 유일하지 않거나 선택한 주문이 다릅니다. 불명을 유지합니다.');
      const connection = await this.kis.balance(true); const rows = await this.kis.dailyOrders(order.tradeDate);
      const candidates = recoveryCandidates(order, rows);
      const row = candidates.length === 1 ? candidates[0] : undefined;
      if (!row || !sameId(row.brokerId, input.brokerId) || !sameId(row.organization, input.organization) || row.filled < selected[0].filled) throw new Error('최신 조회가 복구 근거와 일치하지 않습니다. 불명을 유지합니다.');
      if (this.store.paperOrders().some(other => other.requestId !== input.id && other.tradeDate === row.date && other.brokerId && sameId(other.brokerId, row.brokerId) && (!other.organization || sameId(other.organization, row.organization)))) throw new Error('이미 다른 로컬 주문에 연결된 주문번호입니다.');
      const next = reconciled(order, row);
      this.store.savePaper(next, { actor: 'local-user', action: 'recovery-confirm', before: 'unknown', evidence: evidence(order.tradeDate, rows, connection), recovery: { evidenceId: input.evidenceId, brokerId: row.brokerId, organization: row.organization } });
      return next;
    });
  }
  private numberlessUnknown(id: string) {
    const order = this.store.paperOrders().find(row => row.requestId === id);
    if (!order || order.status !== 'unknown' || order.brokerId) throw new Error('주문번호 없는 응답 불명 주문만 명시적 복구할 수 있습니다.');
    return order;
  }
  async submit(input: PaperOrderInput, checkSignal?: (minimumWaitMs?: number) => void, strategy?: PaperOrder['strategy']): Promise<PaperOrder> {
    return this.enqueue(async () => {
      const market = 'orderType' in input && input.orderType === 'market';
      if (this.contract && (!strategy || market)) throw new KisNotSent('지정가 전략 계약 주문만 허용됩니다.');
      const existing = this.store.paperOrders().find(o => o.requestId === input.requestId);
      if (existing) {
        if (existing.strategy?.id !== strategy?.id || existing.strategy?.revision !== strategy?.revision
          || existing.strategy?.event !== strategy?.event || existing.strategy?.signal !== strategy?.signal) throw new Error('동일 요청 ID의 전략 출처가 다릅니다.');
        if (existing.code !== input.code || existing.side !== input.side || existing.qty !== input.qty || existing.price !== input.price || (existing.orderType ?? 'limit') !== (market ? 'market' : 'limit')) throw new Error('동일 요청 ID의 주문 내용이 다릅니다.');
        return existing;
      }
      const checkContract = () => {
        if (!this.contract) {
          if (strategy) throw new KisNotSent(this.approval ? '전략은 1회 승인 범위 밖입니다.' : '저장 전략 전송에 별도 계약이 필요합니다.');
          return;
        }
        const c = this.contract;
        if (!strategy || market || strategy.id !== c.strategyId || strategy.revision !== c.revision
          || strategy.signal !== input.side || input.code !== c.code || input.qty !== c.qty
          || !Number.isSafeInteger(input.price) || input.price <= 0 || (input.side === 'sell' && c.sellPolicy === 'deny')) throw new KisNotSent('지정가 전략 계약의 주문 조건이 다릅니다.');
        const saved = this.store.read().strategies.find(s => s.id === c.strategyId);
        if (!saved?.active || !checkSignal || !this.realtimeGuard || !this.store.realtimeRequired()) throw new KisNotSent('실행 중인 승인 전략과 실시간 대조가 필요합니다.');
        try { assertStrategyTerms(c, saved); }
        catch (error) { throw new KisNotSent((error as Error).message); }
      };
      if (market && (this.approval?.orderType !== 'market' || strategy)) throw new Error('시장가 1회 승인이 없습니다.');
      if (this.store.realtimeRequired() && !this.realtimeGuard) throw new KisNotSent('실시간 대조 안전장치 없이 신규 주문을 실행할 수 없습니다.');
      checkSignal?.();
      const checkRealtime = this.realtimeGuard?.(input.code);
      checkContract();
      if (this.contract) this.store.checkStrategyAmount(this.contract, input.price * input.qty);
      if (this.approval) {
        if ((this.approval.orderType === 'market') !== market || input.requestId !== this.approval.requestId || input.code !== (this.approval.code ?? '069500') || input.side !== 'buy' || input.qty !== 1 || !Number.isSafeInteger(input.price) || (market ? input.price !== 0 : input.price <= 0 || input.price > (this.approval.maxAmount ?? 100000))) throw new Error('조건부 1회 승인 범위와 주문이 다릅니다.');
        this.checkWindow();
        this.store.claimPaperRun();
      }
      try {
      if (this.store.paperOrders().some(o => ['unknown', 'sending'].includes(o.status))) throw new Error('응답 불명 주문이 있습니다. KIS 계좌 대조 전 추가 주문을 차단합니다.');
      if (this.store.paperOrders().length >= 1000) throw new Error('KIS 주문 기록 한도에 도달했습니다.');
      if (this.approval && this.store.read().risk.halted) throw new Error('신규 주문 정지 상태입니다.');
      const { connection, brokerOrders } = await this.refreshInsideQueue(true); const balance = connection.balance!;
      checkSignal?.();
      if (this.store.paperOrders().some(o => o.status === 'unknown')) throw new Error('계좌 대조 중 응답 불명 주문이 확인되었습니다.');
      if (this.approval && (brokerOrders.some(o => o.remaining > 0) || (!this.approval.allowExistingHolding && balance.positions.some(p => p.code === input.code && p.qty > 0)) || balance.cash <= input.price)) throw new Error('승인 조건의 빈 보유·미체결 없음·현금 여유를 충족하지 못했습니다.');
      const quoteStarted = performance.now(), quoteStartedAt = Date.now();
      const quote = await this.kis.quote(input.code, true);
      checkSignal?.();
      const quoteReceived = performance.now();
      if (this.approval) {
        if (quoteReceived - quoteStarted > 5000 || Date.now() - quoteStartedAt > 5000) throw new Error('승인 시세 조회 지연: 5초를 초과했습니다.');
        if (!market && input.price !== quote.price) throw new Error(`승인 지정가 불일치: 지정가 ${input.price}원, 재조회 현재가 ${quote.price}원.`);
        if (!market && (!Number.isSafeInteger(quote.tickSize) || quote.tickSize <= 0 || input.price % quote.tickSize !== 0)) throw new Error(`승인 호가 단위 오류: 지정가 ${input.price}원, 호가 단위 ${quote.tickSize}원.`);
      }
      const valuationPrice = market ? quote.upper : input.price;
      if (market && (!Number.isSafeInteger(valuationPrice) || valuationPrice < quote.price || valuationPrice <= 0 || valuationPrice > (this.approval!.maxAmount ?? 100000))) throw new Error('시장가 상한가가 승인 금액을 초과하거나 유효하지 않습니다.');
      const risk = this.store.read().risk;
      if (risk.halted) throw new Error('신규 주문 정지 상태입니다.');
      const value = balance.totalEquity;
      if (this.store.paperBaseline(koreaDate(), value) - value >= risk.dailyLoss) throw new Error('KIS 모의 계좌 손실 한도에 도달했습니다.');
      if (quote.stopped) throw new Error('거래정지 종목은 주문할 수 없습니다.');
      if (!market && (input.price < quote.lower || input.price > quote.upper)) throw new Error('지정가가 KIS 가격 제한 범위를 벗어났습니다.');
      const amount = valuationPrice * input.qty;
      if (this.approval && balance.cash <= amount) throw new Error('승인 조건의 현금 여유가 부족합니다.');
      if (!Number.isSafeInteger(amount) || amount > risk.maxOrder) throw new Error('1회 주문 한도를 초과했습니다.');
      const holding = balance.positions.find(p => p.code === input.code);
      if (input.side === 'buy') {
        const pending = brokerOrders.filter(o => o.code === input.code && o.side === 'buy' && !o.cancelled).reduce((a, o) => a + o.remaining * o.price, 0);
        if ((holding?.qty ?? 0) * quote.price + pending + amount > risk.maxPosition) throw new Error('KIS 종목별 투자 한도를 초과했습니다.');
        const power = await this.kis.buyingPower(input.code, market ? quote.price : input.price);
        if (this.approval && amount >= power.cash) throw new Error('승인 조건의 미수 없는 현금 여유가 부족합니다.');
        if (input.qty > power.qty || amount > power.cash) throw new Error('KIS 미수 없는 매수 가능 수량 또는 현금이 부족합니다.');
      } else {
        const reserved = brokerOrders.filter(o => o.code === input.code && o.side === 'sell' && !o.cancelled).reduce((a, o) => a + o.remaining, 0);
        if ((this.contract && input.qty > (holding?.sellable ?? 0)) || input.qty > (holding?.qty ?? 0) - reserved) throw new Error('KIS 매도 가능 보유 수량이 부족합니다.');
      }
      const latestRisk = this.store.read().risk;
      if (latestRisk.halted || JSON.stringify(risk) !== JSON.stringify(latestRisk)) throw new Error('검증 중 위험 설정이 바뀌었습니다. 다시 확인하세요.');
      const local: PaperOrder = { ...input, ...(strategy ? { strategy } : {}), createdAt: new Date().toISOString(), tradeDate: koreaDate(), status: 'sending', filled: 0, remaining: input.qty, message: 'KIS 모의 전송 중' };
      if (!this.contract) checkSignal?.(this.kis.minimumRequestWaitMs());
      this.store.savePaper(local, { actor: 'system', action: 'sending', before: null }, this.contract, this.contract && (() => {
        checkSignal?.(this.kis.minimumRequestWaitMs());
        checkRealtime?.();
        checkContract();
      }));
      this.riskOrders = null;
      try {
        const receipt = await this.kis.submit(input, () => {
          checkSignal?.();
          checkRealtime?.();
          checkContract();
          this.checkWindow();
          if (this.approval && (performance.now() - quoteReceived > 5000 || Date.now() - Date.parse(quote.receivedAt) > 5000 || Date.now() < Date.parse(quote.receivedAt))) throw new KisNotSent('승인된 시세의 5초 유효기간이 지났습니다.');
          const currentRisk = this.store.read().risk;
          if (currentRisk.halted || JSON.stringify(currentRisk) !== JSON.stringify(risk)) throw new KisNotSent('전송 직전 위험 설정 변경으로 주문을 보내지 않았습니다.');
          if (this.contract && !this.store.markStrategyDispatch(local)) throw new KisNotSent('전송 직전 계약 예약이 없거나 이미 사용됐습니다.');
        });
        Object.assign(local, receipt, { status: 'accepted', message: 'KIS 모의 주문 접수. 체결은 조회·대조로 확인하세요.' });
      } catch (error) {
        local.status = error instanceof KisRejected || error instanceof KisNotSent ? 'rejected' : 'unknown';
        local.message = error instanceof Error ? error.message : '주문 응답 불명';
      }
      this.store.savePaper(local, { actor: 'system', action: 'response', before: 'sending' });
      return local;
      } finally {
        if (this.approval) {
          this.kis.limitRequestsFor(120000);
          this.store.update(state => halt(state, true));
        }
      }
    });
  }
}
