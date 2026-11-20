import { oncePolicy, sessionBounds, validOncePolicy, type OncePolicy } from '../shared/trading-policy.ts';
import { DEFAULT_PAPER_MAX_QTY, MAX_ORDER_QTY, paperRecoveryInput, samePaperIntent, type PaperOrderInput, type PaperRecoveryInput } from '../shared/contracts.ts';
import type { PaperOrder, BrokerOrder, PaperEvidence, ConnectionState, PaperRiskSnapshot, KisQuote } from '../shared/model.ts';
import { KisClient, KisRejected, KisNotSent, koreaDate } from './kis.ts';
import { Store } from './store.ts';
import { halt } from './engine.ts';
import { assertStrategyTerms, strategyContractSchema, type StrategyContract } from './strategy-contract.ts';
import type { Strategy } from '../shared/model.ts';
import { z } from 'zod';

export const paperApprovalSchema = z.object({ date: z.iso.date(), requestId: z.uuid(), ledgerPath: z.string().min(1).optional(), accountFingerprint: z.string().regex(/^[0-9a-f]{64}$/).optional(), cancelProbe: z.literal(true).optional(), code: z.enum(['069500', '005930']).optional(), maxQty: z.int().positive().max(MAX_ORDER_QTY).optional(), maxAmount: z.number().int().positive().max(300000).optional(), orderType: z.literal('market').optional(), allowExistingHolding: z.literal(true).optional() }).strict().refine(v => Boolean(v.ledgerPath) === Boolean(v.accountFingerprint), '한정 실행의 전용 원장과 계좌 바인딩이 필요합니다.').refine(value => value.orderType !== 'market' || (value.code === '005930' && !value.cancelProbe && (value.maxQty ?? 1) === 1), '시장가는 삼성전자 매수1회·API 취소 없음 승인만 지원합니다.').refine(value => value.orderType === 'market' || (value.maxAmount ?? 100000) <= 200000, '지정가 승인 상한은 20만원입니다.');
const configuredApproval = z.object({ ...paperApprovalSchema.shape,
  ledgerPath: z.string().min(1), accountFingerprint: z.string().regex(/^[0-9a-f]{64}$/), code: z.string().regex(/^\d{6}$/),
  maxQty: z.int().positive().max(MAX_ORDER_QTY), maxAmount: z.int().positive().max(100000000),
  assetKind: z.enum(['stock', 'etf']), policy: oncePolicy,
}).strict().refine(a => a.ledgerPath !== ':memory:' && (!a.policy.exchangeNotice || a.policy.exchangeNotice.date === a.date) && !!sessionBounds(a.date, a.policy.session, a.policy.exchangeNotice) &&
  validOncePolicy(a.policy, a.orderType ?? 'limit', a.code, a.maxAmount, !!a.cancelProbe),
  '고정한 주문 정책·거래일·잔량 취소 범위를 확인하세요.');
export const preparedApprovalSchema = z.union([paperApprovalSchema, configuredApproval]);
export type PaperApproval = Omit<z.infer<typeof paperApprovalSchema>, 'code'> &
  { code?: string; policy?: OncePolicy; assetKind?: 'stock' | 'etf' };

// Only the isolated broker probe supplies this contract. File, JSON and draft entry points use the legacy schema.
const sessionTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const krxSession = z.object({ date: z.iso.date(), open: sessionTime, close: sessionTime }).strict();
export type PaperKrxSession = z.infer<typeof krxSession>;
const lowerLimitApprovalSchema = paperApprovalSchema.safeExtend({
  krxSession,
  lowerLimitPrice: z.int().positive(),
  ledgerPath: z.string().min(1),
  accountFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  code: z.literal('005930'),
}).refine(a => a.krxSession.date === a.date && a.krxSession.open < a.krxSession.close
  && a.krxSession.open < '15:30' && a.krxSession.close > '09:00'
  && ![0, 6].includes(new Date(a.date + 'T12:00:00+09:00').getUTCDay()),
  '승인 거래일과 KRX 정규장 시간창을 확인하세요.').refine(a => a.ledgerPath !== ':memory:' && !a.orderType && !a.cancelProbe && a.lowerLimitPrice <= (a.maxAmount ?? 100000),
  '하한가 검증에는 단가를 감당하는 삼성전자 지정가 전용 원장과 취소 없는 승인이 필요합니다.');

function kospiStockTick(price: number) {
  if (price < 2000) return 1;
  if (price < 5000) return 5;
  if (price < 20000) return 10;
  if (price < 50000) return 50;
  if (price < 200000) return 100;
  if (price < 500000) return 500;
  return 1000;
}

function checkApprovedLimit(price: number, quote: KisQuote, lowerLimitPrice?: number, policy?: OncePolicy, kind?: 'stock' | 'etf') {
  let tick = quote.tickSize;
  if (policy) {
    const tickFor = kind === 'etf' ? (p: number) => p < 2000 ? 1 : 5 : kospiStockTick;
    if (quote.liquidation !== false || ![quote.price, quote.lower, quote.upper].every(Number.isSafeInteger) ||
        quote.lower <= 0 || quote.price < quote.lower || quote.price > quote.upper ||
        tick !== tickFor(quote.price) || quote.price % tick !== 0) throw new Error('재조회 시세의 가격 범위·호가단위·정리매매 상태를 확인하세요.');
    const target = policy.priceMode === 'current' || policy.priceMode === 'cappedCurrent' ? quote.price : policy.limitPrice;
    if (price !== target || (policy.priceMode === 'lower' && price !== quote.lower)) {
      throw new Error(`승인 지정가 불일치: 주문 ${price}원, 계약 기준 ${target}원, 재조회 하한가 ${quote.lower}원.`);
    }
    tick = tickFor(price);
  } else if (lowerLimitPrice === undefined) {
    if (price !== quote.price) throw new Error(`승인 지정가 불일치: 지정가 ${price}원, 재조회 현재가 ${quote.price}원.`);
  } else {
    if (price !== lowerLimitPrice || price !== quote.lower) throw new Error('지정가·고정 단가·재조회 하한가가 일치해야 합니다.');
    if (quote.liquidation !== false || !Number.isSafeInteger(quote.price) || !Number.isSafeInteger(quote.upper)
      || quote.lower > quote.price || quote.price > quote.upper || quote.tickSize !== kospiStockTick(quote.price)
      || quote.price % quote.tickSize !== 0) throw new Error('재조회 시세의 가격 범위·호가단위·정리매매 상태를 확인하세요.');
    tick = kospiStockTick(price);
  }
  if (!Number.isSafeInteger(tick) || tick <= 0 || price % tick !== 0) throw new Error(`승인 호가 단위 오류: 지정가 ${price}원, 호가 단위 ${tick}원.`);
}

function withinApproval(approval: PaperApproval, qty: number, price: number) {
  return Number.isSafeInteger(qty) && qty >= 1 && qty <= (approval.maxQty ?? 1) &&
    Number.isSafeInteger(price) && price >= 0 && qty * price <= (approval.maxAmount ?? 100000);
}

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
  constructor(private store: Store, private kis: KisClient, private approval?: PaperApproval & { lowerLimitPrice?: number; krxSession?: PaperKrxSession }, private contract?: StrategyContract, private checkInstrument?: () => void) {
    if (contract) {
      this.contract = strategyContractSchema.parse(contract);
      if (approval || store.path !== contract.ledgerPath || kis.accountFingerprint() !== contract.accountFingerprint) throw new Error('전략 계약의 승인·원장·계좌 설정이 다릅니다.');
      store.bindStrategyContract(this.contract);
    } else if (store.strategyContract()) throw new Error('원장에 고정된 전략 계약이 필요합니다.');
    if (!approval && store.hasPaperRun()) throw new Error('저장된 1회 승인 설정이 필요합니다. 제한 없이 재시작할 수 없습니다.');
    if (approval) {
      this.approval = 'lowerLimitPrice' in approval ? lowerLimitApprovalSchema.parse(approval) : preparedApprovalSchema.parse(approval);
    }
    if (approval?.ledgerPath && (approval.ledgerPath !== store.path || approval.accountFingerprint !== kis.accountFingerprint())) throw new Error('승인된 전용 원장·계좌가 아닙니다.');
    if (this.approval && store.configurePaperRun(this.approval, this.approval.lowerLimitPrice !== undefined || !!this.approval.policy)) {
      this.restoredApproval = true;
      const order = this.approval.policy && store.paperOrders().find(o => o.requestId === this.approval!.requestId);
      const elapsed = order ? Date.now() - Date.parse(order.createdAt) : -1;
      const remaining = elapsed >= 0 ? this.approval.policy!.observationSeconds * 1000 - elapsed : 0;
      kis.limitRequestsFor(Math.max(0, remaining));
      store.update(state => halt(state, true));
    }
    if (this.timingPolicy) kis.configureTiming(this.timingPolicy);
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
  approvalStatus() {
    if (!this.approval) return { active: false };
    const { ledgerPath, accountFingerprint, ...publicTerms } = this.approval;
    return { active: true, ...publicTerms };
  }
  riskSnapshot(): PaperRiskSnapshot {
    const day = koreaDate();
    return { day, baselineEquity: this.store.paperBaselineValue(day), unresolvedCount: this.store.paperOrders().filter(o => o.status === 'unknown' || o.status === 'sending').length, orders: this.riskOrders?.day === day ? this.riskOrders : null };
  }
  get strategyOrderType() { return this.contract?.policy?.orderType ?? 'limit'; }
  get timingPolicy() { return this.contract?.policy ?? this.approval?.policy; }
  private checkWindow() {
    if (!this.approval) return;
    const { date, krxSession, policy } = this.approval;
    if (policy) {
      const bounds = sessionBounds(date, policy.session, policy.exchangeNotice), now = Date.now();
      if (!bounds || now < bounds.start || now >= bounds.end) throw new KisNotSent('고정한 KRX 실행 시간창 밖입니다.');
      return;
    }
    const open = krxSession && krxSession.open > '09:00' ? krxSession.open : '09:00';
    const close = krxSession && krxSession.close < '15:30' ? krxSession.close : '15:30';
    const now = Date.now();
    if (now < Date.parse(`${date}T${open}:00+09:00`) || now >= Date.parse(`${date}T${close}:00+09:00`)) throw new KisNotSent('승인된 수동 실행 시간창 밖입니다.');
  }
  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const job = this.queue.catch(() => {}).then(run); this.queue = job; return job;
  }
  refresh(freshBalance = false) { return this.enqueue(() => this.refreshInsideQueue(freshBalance)); }
  private async refreshInsideQueue(freshBalance = false) {
    this.riskOrders = null;
    const day = koreaDate();
    const connection = await this.kis.balance(freshBalance); const orders = await this.kis.dailyOrders(day);
    const byDay = new Map([[day, { rows: orders, observedAt: new Date().toISOString() }]]);
    const localOrders = this.store.paperOrders().filter(local => local.brokerId);
    const settled = (local: PaperOrder) => ['filled', 'cancelled', 'rejected'].includes(local.status);
    for (const local of localOrders) {
      if (!settled(local) && !byDay.has(local.tradeDate)) {
        const rows = await this.kis.dailyOrders(local.tradeDate);
        byDay.set(local.tradeDate, { rows, observedAt: new Date().toISOString() });
      }
    }
    const checks: { id: string; at: string }[] = [];
    for (const local of localOrders) {
      const observation = byDay.get(local.tradeDate);
      if (!observation) continue;
      const { rows, observedAt } = observation;
      const found = rows.filter(row => sameId(row.brokerId, local.brokerId!) && (!local.organization || sameId(row.organization, local.organization)) && matches(local, row));
      const row = found.length === 1 ? found[0] : undefined;
      const matched = row && row.filled >= local.filled && !(row.cancelled && row.remaining > 0);
      const next: PaperOrder = matched ? reconciled(local, row) : { ...local, status: 'unknown', message: '저장한 주문과 KIS 조회가 일치하지 않습니다. 추가 주문을 차단합니다.' };
      const changed = next.status !== local.status || next.filled !== local.filled || next.remaining !== local.remaining;
      if (changed && !settled(local)) {
        this.store.savePaper(next, { actor: 'system', action: 'reconcile', before: local.status, evidence: { ...evidence(local.tradeDate, rows, connection), observedAt } });
      }
      if (matched && (!settled(local) || !changed)) checks.push({ id: local.requestId, at: observedAt });
    }
    this.store.recordOrderChecks(checks);
    this.riskOrders = { day, observedAt: new Date().toISOString(), rows: orders.map(({ code, side, price, remaining, cancelled }) => ({ code, side, price, remaining, cancelled })) };
    return { connection, brokerOrders: orders, orders: this.store.paperOrders() };
  }
  cancelProbeEnabled() { return this.approval?.cancelProbe === true; }
  private probeOrder(orders: PaperOrder[]) {
    const order = orders.find(row => row.requestId === this.approval?.requestId);
    if (!this.approval || !order || !order.brokerId || !order.organization || order.code !== (this.approval.code ?? '069500') || order.side !== 'buy' || order.price <= 0 || !withinApproval(this.approval, order.qty, order.price) || !['accepted', 'partial'].includes(order.status) || order.remaining <= 0) return undefined;
    return { ...order, brokerId: order.brokerId, organization: order.organization };
  }
  private probeExpiry(order: PaperOrder) {
    const approval = this.approval!;
    const close = approval.policy ? sessionBounds(approval.date, approval.policy.session, approval.policy.exchangeNotice)?.end ?? 0 : Date.parse(approval.date + 'T15:30:00+09:00');
    return Math.min(Date.parse(order.createdAt) + (approval.policy?.observationSeconds ?? 120) * 1000, close);
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
      if ((this.restoredApproval && this.approval?.policy) || !this.cancelProbeEnabled() || id !== this.approval!.requestId) throw new Error('전량취소 검증 승인이 없습니다.');
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
      const validity = this.timingPolicy?.recoverySeconds ?? 300;
      if (!inspected?.evidence || Date.now() - Date.parse(inspected.at) > validity * 1000 || Date.now() < Date.parse(inspected.at)) throw new Error(`복구 근거가 없거나 ${validity === 300 ? '5분' : validity + '초'} 유효기간이 지났습니다. 다시 조회하세요.`);
      const selected = recoveryCandidates(order, inspected.evidence.orders);
      if (selected.length !== 1 || !sameId(selected[0].brokerId, input.brokerId) || !sameId(selected[0].organization, input.organization)) throw new Error('일치하는 복구 후보가 유일하지 않거나 선택한 주문이 다릅니다. 불명을 유지합니다.');
      const connection = await this.kis.balance(true); const rows = await this.kis.dailyOrders(order.tradeDate);
      const candidates = recoveryCandidates(order, rows);
      const row = candidates.length === 1 ? candidates[0] : undefined;
      if (!row || !sameId(row.brokerId, input.brokerId) || !sameId(row.organization, input.organization) || row.filled < selected[0].filled) throw new Error('최신 조회가 복구 근거와 일치하지 않습니다. 불명을 유지합니다.');
      if (this.store.paperOrders().some(other => other.requestId !== input.id && other.tradeDate === row.date && other.brokerId && sameId(other.brokerId, row.brokerId) && (!other.organization || sameId(other.organization, row.organization)))) throw new Error('이미 다른 로컬 주문에 연결된 주문번호입니다.');
      const observation = evidence(order.tradeDate, rows, connection);
      const next = reconciled(order, row);
      this.store.savePaper(next, { actor: 'local-user', action: 'recovery-confirm', before: 'unknown', evidence: observation, recovery: { evidenceId: input.evidenceId, brokerId: row.brokerId, organization: row.organization } });
      return next;
    });
  }
  private numberlessUnknown(id: string) {
    const order = this.store.paperOrders().find(row => row.requestId === id);
    if (!order || order.status !== 'unknown' || order.brokerId) throw new Error('주문번호 없는 응답 불명 주문만 명시적 복구할 수 있습니다.');
    return order;
  }
  async submit(request: PaperOrderInput, checkSignal?: (minimumWaitMs?: number) => void, strategy?: PaperOrder['strategy']): Promise<PaperOrder> {
    return this.enqueue(async () => {
      let input = request;
      const policy = this.approval?.policy;
      const ceiling = 'priceMode' in request ? request.price : undefined;
      if ((ceiling !== undefined) !== (policy?.priceMode === 'cappedCurrent') ||
          (ceiling !== undefined && (ceiling !== policy?.limitPrice || request.side !== 'buy')))
        throw new KisNotSent('재조회 현재가 주문은 계약과 동일한 매수 단가 상한을 명시해야 합니다.');
      const market = 'orderType' in input && input.orderType === 'market';
      if (this.contract && (!strategy || market !== (this.strategyOrderType === 'market'))) throw new KisNotSent('고정한 주문 방식의 전략 계약 주문만 허용됩니다.');
      const existing = this.store.paperOrders().find(o => o.requestId === input.requestId);
      if (existing) {
        if (existing.strategy?.id !== strategy?.id || existing.strategy?.revision !== strategy?.revision
          || existing.strategy?.event !== strategy?.event || existing.strategy?.signal !== strategy?.signal) throw new Error('동일 요청 ID의 전략 출처가 다릅니다.');
        if (!samePaperIntent(existing, request)) throw new Error('동일 요청 ID의 주문 내용이 다릅니다.');
        return existing;
      }
      const checkManualQuantity = () => {
        if (!strategy && !checkSignal && input.qty > (this.store.read().paperManualMaxQty ?? DEFAULT_PAPER_MAX_QTY)) {
          throw new KisNotSent('KIS 수동 주문 한도(수량)를 초과했습니다.');
        }
      };
      checkManualQuantity();
      this.checkInstrument?.();
      const checkContract = () => {
        if (!this.contract) {
          if (strategy) throw new KisNotSent(this.approval ? '전략은 1회 승인 범위 밖입니다.' : '저장 전략 전송에 별도 계약이 필요합니다.');
          return;
        }
        const c = this.contract;
        if (!strategy || strategy.id !== c.strategyId || strategy.revision !== c.revision
          || strategy.signal !== input.side || input.code !== c.code || input.qty !== c.qty
          || !Number.isSafeInteger(input.price) || (market ? input.price !== 0 : input.price <= 0) || (input.side === 'sell' && c.sellPolicy === 'deny')) throw new KisNotSent('전략 계약의 주문 조건이 다릅니다.');
        const saved = this.store.read().strategies.find(s => s.id === c.strategyId);
        if (!saved?.active || !checkSignal || !this.realtimeGuard || !this.store.realtimeRequired()) throw new KisNotSent('실행 중인 승인 전략과 실시간 대조가 필요합니다.');
        try { assertStrategyTerms(c, saved); }
        catch (error) { throw new KisNotSent((error as Error).message); }
      };
      if (market && !this.contract && (this.approval?.orderType !== 'market' || strategy)) throw new Error('시장가 1회 승인이 없습니다.');
      if (this.store.realtimeRequired() && !this.realtimeGuard) throw new KisNotSent('실시간 대조 안전장치 없이 신규 주문을 실행할 수 없습니다.');
      checkSignal?.();
      const checkRealtime = this.realtimeGuard?.(input.code);
      checkContract();
      if (this.contract && !market) this.store.checkStrategyAmount(this.contract, input.price * input.qty);
      const quoteMs = (this.timingPolicy?.quoteSeconds ?? 5) * 1000;
      let claimed = false;
      if (this.approval) {
        if ((this.approval.orderType === 'market') !== market || input.requestId !== this.approval.requestId || input.code !== (this.approval.code ?? '069500') || input.side !== (policy?.side ?? 'buy') || !withinApproval(this.approval, input.qty, input.price) || (market ? input.price !== 0 : input.price <= 0)) throw new Error('조건부 1회 승인 범위와 주문이 다릅니다.');
        this.checkWindow();
        if (policy?.consumeAt !== 'validated') { this.store.claimPaperRun(); claimed = true; }
      }
      try {
      if (this.store.paperOrders().some(o => ['unknown', 'sending'].includes(o.status))) throw new Error('응답 불명 주문이 있습니다. KIS 계좌 대조 전 추가 주문을 차단합니다.');
      if (this.store.paperOrders().length >= 1000) throw new Error('KIS 주문 기록 한도에 도달했습니다.');
      if (this.approval && this.store.read().risk.halted) throw new Error('신규 주문 정지 상태입니다.');
      const { connection, brokerOrders } = await this.refreshInsideQueue(true); const balance = connection.balance!;
      checkSignal?.();
      if (this.store.paperOrders().some(o => o.status === 'unknown')) throw new Error('계좌 대조 중 응답 불명 주문이 확인되었습니다.');
      if (policy?.allowPending && brokerOrders.some(o => o.cancelled && o.remaining > 0)) throw new Error('취소 상태와 잔량이 모순되어 계좌 대조가 필요합니다.');
      if (this.approval) {
        if (!policy?.allowPending && brokerOrders.some(o => o.remaining > 0)) throw new Error('승인 조건에 따라 기존 미체결 주문을 먼저 대조하세요.');
        if (input.side === 'buy' && !this.approval.allowExistingHolding && balance.positions.some(p => p.code === input.code && p.qty > 0))
          throw new Error('현재 승인 조건에서 기존 보유 종목의 추가 매수를 차단했습니다.');
        if (ceiling === undefined && input.side === 'buy' && balance.cash - input.price < (policy?.cashReserve ?? 1)) throw new Error('승인 조건의 현금 여유가 부족합니다.');
      }
      const quoteStarted = performance.now(), quoteStartedAt = Date.now();
      const quote = await this.kis.quote(input.code, this.approval?.lowerLimitPrice !== undefined || this.timingPolicy ? 'identified' : true);
      checkSignal?.();
      const quoteReceived = performance.now();
      if (ceiling !== undefined) {
        if (quote.price > ceiling) throw new KisNotSent(`재조회 현재가 ${quote.price}원이 승인 단가 상한 ${ceiling}원을 초과했습니다.`);
        input = { code: request.code, qty: request.qty, side: 'buy', price: quote.price, requestId: request.requestId };
      }
      if (this.approval || this.contract?.policy) {
        if (quoteReceived - quoteStarted > quoteMs || Date.now() - quoteStartedAt > quoteMs) throw new Error(`승인 시세 조회 지연: ${quoteMs / 1000}초를 초과했습니다.`);
        if (!market && this.approval) checkApprovedLimit(input.price, quote, this.approval.lowerLimitPrice, policy, this.approval.assetKind);
      }
      const valuationPrice = market ? quote.upper : input.price;
      if (market && (!Number.isSafeInteger(valuationPrice) || valuationPrice < quote.price || valuationPrice <= 0 || valuationPrice * input.qty > (this.contract?.maxOrderAmount ?? this.approval?.maxAmount ?? 100000))) throw new Error('시장가 상한가가 승인 금액을 초과하거나 유효하지 않습니다.');
      const risk = this.store.read().risk;
      if (risk.halted) throw new Error('신규 주문 정지 상태입니다.');
      const value = balance.totalEquity;
      if (this.store.paperBaseline(koreaDate(), value) - value >= risk.dailyLoss) throw new Error('KIS 모의 계좌 손실 한도에 도달했습니다.');
      if (this.contract?.policy && (quote.liquidation !== false || quote.lower <= 0 || quote.price < quote.lower || quote.price > quote.upper)) throw new Error('전략 시세 범위·정리매매 상태를 확인하세요.');
      if (policy && market && (quote.liquidation !== false || !Number.isSafeInteger(quote.price) || quote.lower <= 0 || quote.lower > quote.price)) throw new Error('시장가 시세·정리매매 상태를 확인하세요.');
      if (quote.stopped) throw new Error('거래정지 종목은 주문할 수 없습니다.');
      if (!market && (input.price < quote.lower || input.price > quote.upper)) throw new Error('지정가가 KIS 가격 제한 범위를 벗어났습니다.');
      const amount = valuationPrice * input.qty;
      if (this.approval && input.side === 'buy' && balance.cash - amount < (policy?.cashReserve ?? 1)) throw new Error('승인 조건의 현금 여유가 부족합니다.');
      if (!Number.isSafeInteger(amount) || amount > risk.maxOrder) throw new Error('1회 주문 한도를 초과했습니다.');
      if (market && this.contract) this.store.checkStrategyAmount(this.contract, amount);
      const holding = balance.positions.find(p => p.code === input.code);
      if (input.side === 'buy') {
        if ((policy?.allowPending || this.contract?.policy) && brokerOrders.some(o => o.code === input.code && o.side === 'buy' && o.remaining > 0 && (o.price <= 0 || o.cancelled))) throw new Error('기존 미체결 매수의 예약 금액을 확정할 수 없습니다.');
        const pending = brokerOrders.filter(o => o.code === input.code && o.side === 'buy' && !o.cancelled).reduce((a, o) => a + o.remaining * o.price, 0);
        if ((holding?.qty ?? 0) * quote.price + pending + amount > risk.maxPosition) throw new Error('KIS 종목별 투자 한도를 초과했습니다.');
        const power = await this.kis.buyingPower(input.code, market ? quote.price : input.price);
        if (this.approval && power.cash - amount < (policy?.cashReserve ?? 1)) throw new Error('승인 조건의 미수 없는 현금 여유가 부족합니다.');
        if (input.qty > power.qty || amount > power.cash) throw new Error('KIS 미수 없는 매수 가능 수량 또는 현금이 부족합니다.');
      } else {
        const reserved = brokerOrders.filter(o => o.code === input.code && o.side === 'sell' && !o.cancelled).reduce((a, o) => a + o.remaining, 0);
        if (((this.contract || policy) && input.qty > (holding?.sellable ?? 0)) || input.qty > (holding?.qty ?? 0) - reserved) throw new Error('KIS 매도 가능 보유 수량이 부족합니다.');
      }
      const latestRisk = this.store.read().risk;
      if (latestRisk.halted || JSON.stringify(risk) !== JSON.stringify(latestRisk)) throw new Error('검증 중 위험 설정이 바뀌었습니다. 다시 확인하세요.');
      const local: PaperOrder = { ...input, ...(ceiling !== undefined && {priceCeiling:ceiling}), ...(strategy ? { strategy } : {}), createdAt: new Date().toISOString(), tradeDate: koreaDate(), status: 'sending', filled: 0, remaining: input.qty, message: 'KIS 모의 전송 중' };
      if (!this.contract) checkSignal?.(this.kis.minimumRequestWaitMs());
      if (this.approval && !claimed) {
        this.checkWindow();
        this.store.claimPaperRun();
        claimed = true;
      }
      this.store.savePaper(local, { actor: 'system', action: 'sending', before: null }, this.contract, this.contract && (() => {
        checkSignal?.(this.kis.minimumRequestWaitMs());
        checkRealtime?.();
        checkContract();
      }), amount);
      this.riskOrders = null;
      try {
        const beforeDispatch = () => {
          try { this.checkInstrument?.(); } catch (err) { throw new KisNotSent((err as Error).message); }
          checkManualQuantity();
          const currentRisk = this.store.read().risk;
          if (currentRisk.halted || JSON.stringify(currentRisk) !== JSON.stringify(risk)) throw new KisNotSent('전송 직전 위험 설정 변경으로 주문을 보내지 않았습니다.');
          checkSignal?.();
          checkRealtime?.();
          checkContract();
          this.checkWindow();
          if ((this.approval || this.contract?.policy) && (performance.now() - quoteReceived > quoteMs || Date.now() - Date.parse(quote.receivedAt) > quoteMs || Date.now() < Date.parse(quote.receivedAt))) throw new KisNotSent(`승인된 시세의 ${quoteMs / 1000}초 유효기간이 지났습니다.`);
        };
        const receipt = await this.kis.submit(input, checkRequestWindow => {
          if (!this.contract) beforeDispatch();
          else if (!this.store.markStrategyDispatch(local, () => {
            beforeDispatch();
            checkRequestWindow();
          })) throw new KisNotSent('전송 직전 계약 예약이 없거나 이미 사용됐습니다.');
        });
        Object.assign(local, receipt, { status: 'accepted', message: 'KIS 모의 주문 접수. 체결은 조회·대조로 확인하세요.' });
      } catch (error) {
        local.status = error instanceof KisRejected || error instanceof KisNotSent ? 'rejected' : 'unknown';
        local.message = error instanceof Error ? error.message : '주문 응답 불명';
      }
      this.store.savePaper(local, { actor: 'system', action: 'response', before: 'sending' });
      return local;
      } finally {
        if (claimed) {
          this.kis.limitRequestsFor((policy?.observationSeconds ?? 120) * 1000);
          this.store.update(state => halt(state, true));
        }
      }
    });
  }
}
