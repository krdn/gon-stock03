import { z } from 'zod';
import type { StateSnapshot } from './model.ts';
import { masterCodeSchema } from './market-data.ts';

export const storageErrorMessage = '요청과 이벤트 저장에 실패했습니다. 저장소 상태를 확인하세요.';

export const codeSchema = z.string().regex(/^\d{6}$/);
const integer = (min: number, max: number) => z.number().int().min(min).max(max);
export const orderInput = z.object({ code: codeSchema, side: z.enum(['buy', 'sell']), qty: integer(1, 100000), price: integer(1, 10000000), requestId: z.uuid() }).strict();
export const strategyInput = z.object({ name: z.string().trim().min(1).max(60), code: codeSchema, fast: integer(2, 60), slow: integer(3, 100), qty: integer(1, 10000) }).strict().refine(v => v.fast < v.slow, '단기 기간은 장기 기간보다 작아야 합니다.');
export const backtestInput = z.object({ code: codeSchema, fast: integer(2, 60), slow: integer(3, 100), capital: integer(100000, 100000000), feeBps: z.number().min(0).max(100), slippageBps: z.number().min(0).max(100) }).strict().refine(v => v.fast < v.slow, '단기 기간은 장기 기간보다 작아야 합니다.');
export const riskInput = z.object({ maxOrder: integer(10000, 100000000), maxPosition: integer(10000, 100000000), dailyLoss: integer(1000, 100000000) }).strict();
export const journalInput = z.object({ code: codeSchema, text: z.string().trim().min(1).max(2000) }).strict();
export const idInput = z.object({ id: z.string().min(1).max(80) }).strict();
export const paperRecoveryInput = z.object({ id: z.uuid(), evidenceId: z.uuid(), brokerId: z.string().regex(/^\d{1,10}$/), organization: z.string().regex(/^\d{1,5}$/), confirmed: z.literal(true) }).strict();
export type PaperRecoveryInput = z.infer<typeof paperRecoveryInput>;
export const haltInput = z.object({ halted: z.boolean() }).strict();
export type OrderInput = z.infer<typeof orderInput>;

export const dataStatusSchema = z.object({
  environment: z.enum(['demo', 'kis-paper']), source: z.enum(['synthetic', 'kis-rest']),
  phase: z.enum(['disconnected', 'loading', 'ready', 'stale', 'partial', 'error']),
  observedAt: z.iso.datetime().nullable(), lastSuccessAt: z.iso.datetime().nullable(),
  staleAfterMs: z.number().positive(), complete: z.boolean(), error: z.string().nullable(), pages: z.number().int().nonnegative(),
});
const connectionFailureSchema = z.object({ kind: z.enum(['missing', 'invalid', 'expired', 'permission', 'rate-limit', 'network', 'upstream', 'contract', 'rejected']), message: z.string() });
export const connectionSchema = z.object({
  configured: z.boolean(), mode: z.literal('paper'), connected: z.boolean(), checkedAt: z.iso.datetime().optional(), message: z.string(),
  status: dataStatusSchema.extend({ environment: z.literal('kis-paper'), source: z.literal('kis-rest') }),
  injection: z.object({ phase: z.enum(['unverified', 'missing', 'invalid', 'present']), missing: z.array(z.enum(['KIS_APP_KEY', 'KIS_APP_SECRET', 'KIS_CANO', 'KIS_ACNT_PRDT_CD'])) }),
  authentication: z.object({ phase: z.enum(['unverified', 'loading', 'ready', 'expired', 'error']), lastSuccessAt: z.iso.datetime().nullable(), validUntil: z.iso.datetime().nullable(), retryAt: z.iso.datetime().nullable(), failure: connectionFailureSchema.nullable() }),
  failure: connectionFailureSchema.nullable(),
  balance: z.object({ cash: z.number().nonnegative(), totalEquity: z.number().nonnegative(), positions: z.array(z.object({ code: z.string(), name: z.string(), qty: z.number().nonnegative(), average: z.number().nonnegative(), price: z.number().positive().nullable() })) }).optional(),
});
export const stateSnapshotSchema = z.object({
  cash: z.number(), startingEquity: z.number(),
  instruments: z.array(z.object({ code: codeSchema, name: z.string(), market: z.enum(['KOSPI', 'KOSDAQ', 'ETF']), sector: z.string(), price: z.number(), change: z.number(), volume: z.number(), history: z.array(z.number()) })),
  positions: z.array(z.object({ code: codeSchema, qty: z.number(), average: z.number() })),
  orders: z.array(z.object({ id: z.string(), code: codeSchema, side: z.enum(['buy', 'sell']), qty: z.number(), price: z.number(), filledPrice: z.number().optional(), status: z.enum(['pending', 'filled', 'cancelled']), createdAt: z.string(), filledAt: z.string().optional(), source: z.string(), fee: z.number(), requestId: z.string() })),
  watchlist: z.array(masterCodeSchema),
  strategies: z.array(z.object({ id: z.string(), name: z.string(), code: codeSchema, fast: z.number(), slow: z.number(), qty: z.number(), active: z.boolean(), lastSignal: z.enum(['buy', 'sell', 'hold']), lastTick: z.number() })),
  risk: riskInput.extend({ halted: z.boolean() }),
  events: z.array(z.object({ id: z.string(), time: z.string(), level: z.enum(['info', 'warning', 'error']), title: z.string(), detail: z.string(), read: z.boolean() })),
  journal: z.array(z.object({ id: z.string(), date: z.string(), code: codeSchema, text: z.string() })),
  tick: z.number(), playing: z.boolean(), revision: z.number().int().nonnegative(), updatedAt: z.string(), instanceId: z.string().min(1),
  status: dataStatusSchema.extend({ environment: z.literal('demo'), source: z.literal('synthetic') }), connection: connectionSchema,
}) satisfies z.ZodType<StateSnapshot>;
