import { oncePolicy, strategyPolicy, validOncePolicy } from './trading-policy.ts';
import { z } from 'zod';
import type { State } from './model.ts';
import { DEFAULT_PAPER_MAX_QTY, MAX_ORDER_QTY } from './contracts.ts';

const amount = z.int().positive();
const instant = z.iso.datetime({ offset: true }).transform((v) => new Date(v).toISOString());
export const onceTerms = z
  .object({
    kind: z.literal('once'),
    date: z.iso.date(),
    code: z.string().regex(/^\d{6}$/, '6자리 종목코드를 입력하세요.'),
    policy: oncePolicy.optional(),
    orderType: z.enum(['limit', 'market']),
    maxQty: amount.max(MAX_ORDER_QTY),
    maxAmount: amount.max(100000000),
    allowExistingHolding: z.boolean(),
    cancelProbe: z.boolean(),
  })
  .strict()
  .refine(
    (v) =>
      v.policy
        ? (!v.policy.exchangeNotice || v.policy.exchangeNotice.date === v.date) &&
          validOncePolicy(v.policy, v.orderType, v.code, v.maxAmount, v.cancelProbe)
        : ['005930', '069500'].includes(v.code) &&
          (v.orderType === 'limit'
            ? v.maxAmount <= 200000
            : v.code === '005930' && v.maxQty === 1 && v.maxAmount <= 300000 && !v.cancelProbe),
    '주문 방식·고정 단가·취소 범위를 확인하세요. 확장 계약의 일반 잔량 취소는 KIS 모의 앱을 사용합니다.',
  );
export const strategyTerms = z
  .object({
    kind: z.literal('strategy'),
    strategyId: z.string().min(1).max(80),
    revision: amount,
    startsAt: instant,
    endsAt: instant,
    maxOrderAmount: amount,
    maxAttempts: amount,
    maxTotalAmount: amount,
    sellPolicy: z.enum(['deny', 'account', 'contract']),
    policy: strategyPolicy.optional(),
  })
  .strict()
  .refine(
    (v) => (v.sellPolicy !== 'contract' || !!v.policy) && v.startsAt < v.endsAt && v.maxOrderAmount <= v.maxTotalAmount,
    '기간 또는 주문당·누적 금액을 확인하세요.',
  );
export const tradingTerms = z.discriminatedUnion('kind', [onceTerms, strategyTerms]);
export type TradingTerms = z.infer<typeof tradingTerms>;
export type PlanKind = TradingTerms['kind'];

export function planStem(kind: PlanKind, id: string) {
  return (kind === 'once' ? 'approval-' : 'strategy-') + id;
}

export function planLimits(state: State) {
  const { maxOrder, maxPosition, dailyLoss, halted } = state.risk;
  return { maxOrder, maxPosition, dailyLoss, halted, manualQty: state.paperManualMaxQty ?? DEFAULT_PAPER_MAX_QTY };
}
export interface PlanVersion {
  id: string;
  terms: TradingTerms;
  fixed: boolean;
  limits: ReturnType<typeof planLimits>;
  runId?: string;
  symbol?: string;
  fast?: number;
  slow?: number;
  qty?: number;
}
export interface PlanRecord {
  draft: PlanVersion;
  previous?: PlanVersion;
}
export interface TradingSettingsData {
  plans: Partial<Record<PlanKind, PlanRecord>>;
  active: TradingTerms | null;
  usage?: { attempts: number; amount: number };
  canFix: boolean;
}
