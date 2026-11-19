import { z } from 'zod';
import type { State } from './model.ts';
import { DEFAULT_PAPER_MAX_QTY, MAX_ORDER_QTY } from './contracts.ts';

const amount = z.int().positive();
const instant = z.iso.datetime({ offset: true }).transform((v) => new Date(v).toISOString());
export const onceTerms = z
  .object({
    kind: z.literal('once'),
    date: z.iso.date(),
    code: z.enum(['005930', '069500']),
    orderType: z.enum(['limit', 'market']),
    maxQty: amount.max(MAX_ORDER_QTY),
    maxAmount: amount.max(300000),
    allowExistingHolding: z.boolean(),
    cancelProbe: z.boolean(),
  })
  .strict()
  .refine(
    (v) => (v.orderType === 'limit' ? v.maxAmount <= 200000 : v.code === '005930' && v.maxQty === 1 && !v.cancelProbe),
    '지정가는 20만원 이하, 시장가는 삼성전자 1주·취소 없음만 지원합니다.',
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
    sellPolicy: z.enum(['deny', 'account']),
  })
  .strict()
  .refine(
    (v) => v.startsAt < v.endsAt && v.maxOrderAmount <= v.maxTotalAmount,
    '기간 또는 주문당·누적 금액을 확인하세요.',
  );
export const tradingTerms = z.discriminatedUnion('kind', [onceTerms, strategyTerms]);
export type TradingTerms = z.infer<typeof tradingTerms>;
export type PlanKind = TradingTerms['kind'];
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
