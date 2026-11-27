import { isDeepStrictEqual } from 'node:util';
import { assertRealtimeRule, normalizeRule, strategyRuleSchema, exitOverlaySchema, type ExitOverlay } from '../shared/strategy-rules.ts';
import type { DailyRun } from '../shared/market-data.ts';
import { strategyPolicy } from '../shared/trading-policy.ts';
import { z } from 'zod';
import type { Strategy } from '../shared/model.ts';

const positive = z.int().positive();
const instant = z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString());
export const strategyContractSchema = z.object({
  contractId: z.uuid(), ledgerPath: z.string().min(1), accountFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  strategyId: z.string().min(1).max(80), revision: positive, code: z.string().regex(/^\d{6}$/),
  fast: z.int().min(2).max(60), slow: z.int().min(3).max(120), rule: strategyRuleSchema.optional(), overlay: exitOverlaySchema.optional(), qty: positive.max(10000),
  startsAt: instant, endsAt: instant,
  maxOrderAmount: positive, maxAttempts: positive, maxTotalAmount: positive,
  sellPolicy: z.enum(['deny', 'account', 'contract']), policy: strategyPolicy.optional(),
}).strict().refine(c => (c.sellPolicy !== 'contract' || !!c.policy) && c.fast < c.slow && (c.rule?.kind !== 'ma_crossover' || (c.fast === c.rule.fast && c.slow === c.rule.slow)) && c.maxOrderAmount <= c.maxTotalAmount && Date.parse(c.startsAt) < Date.parse(c.endsAt), '전략 계약의 기간·한도를 확인하세요.').superRefine((c, ctx) => {
  try { assertRealtimeRule(c.rule, c.overlay, c.slow); }
  catch (error) { ctx.addIssue({ code: 'custom', message: (error as Error).message }); }
});
export type StrategyContract = z.infer<typeof strategyContractSchema>;

function normalizeOverlay(overlay?: ExitOverlay) {
  if (!overlay?.chandelier && !overlay?.volatilityParity) return undefined;
  return { ...(overlay.chandelier && { chandelier: overlay.chandelier }),
    ...(overlay.volatilityParity && { volatilityParity: overlay.volatilityParity }) };
}

export function sameStrategyConditions(strategy: Strategy, saved: Pick<Strategy, 'rule' | 'overlay'>) {
  return isDeepStrictEqual(normalizeRule(strategy.rule, strategy.fast, strategy.slow),
    normalizeRule(saved.rule, strategy.fast, strategy.slow))
    && isDeepStrictEqual(normalizeOverlay(strategy.overlay), normalizeOverlay(saved.overlay));
}

export function eligibleDailyRun(run: DailyRun, code: string) {
  return run.code === code && run.coverageComplete && run.nextDate === null && run.status.complete
    && !run.status.error && run.quality.state === 'passed';
}

export function assertStrategyIdentity(contract: StrategyContract, strategy: Strategy | undefined) {
  if (!strategy || strategy.environment !== 'kis-paper' || strategy.id !== contract.strategyId
    || strategy.revision !== contract.revision || strategy.code !== contract.code || strategy.fast !== contract.fast
    || strategy.slow !== contract.slow || strategy.qty !== contract.qty || !sameStrategyConditions(strategy, contract)) throw new Error('저장 전략과 승인 계약의 종목·revision·신호·수량이 다릅니다.');
  assertRealtimeRule(strategy.rule, strategy.overlay, strategy.slow);
}

export function assertStrategyTerms(contract: StrategyContract, strategy: Strategy | undefined) {
  assertStrategyIdentity(contract, strategy);
  const now = Date.now();
  if (now < Date.parse(contract.startsAt) || now >= Date.parse(contract.endsAt)) throw new Error('전략 계약 시간창 밖입니다.');
}
