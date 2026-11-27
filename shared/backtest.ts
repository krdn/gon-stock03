import {portfolioCodes, portfolioRuleSchema} from './portfolio-rules.ts';
import { z } from 'zod';
import { backtestInput, ruleBacktestInput } from './contracts.ts';
import { marketDate, masterCodeSchema } from './market-data.ts';
import { dailyDetailSchema, dailyRunSchema } from './data-inventory.ts';

export const dailyBacktestInput = backtestInput.safeExtend({
  code: masterCodeSchema, runId: z.uuid(), source: z.literal('kis-rest'), from: marketDate, to: marketDate, adjustment: z.enum(['adjusted', 'raw']),
}).refine(v => v.from <= v.to, '시작일은 종료일보다 늦을 수 없습니다.');
export type DailyBacktestInput = z.infer<typeof dailyBacktestInput>;
export const experimentSnapshotSchema = z.object({
  engineVersion: z.literal('daily-ma-next-open-v1'), input: dailyBacktestInput,
  collection: dailyRunSchema, bars: dailyDetailSchema.shape.bars,
});
export type ExperimentSnapshot = z.infer<typeof experimentSnapshotSchema>;
export const backtestResultSchema = z.object({
  equity: z.array(z.number()), trades: z.array(z.object({ bar: z.number().int().nonnegative(), side: z.enum(['buy', 'sell']), price: z.number().positive(), qty: z.number().int().positive(), fee: z.number().nonnegative(), date: marketDate.optional(), signalDate: marketDate.optional() })),
  returnPct: z.number(), maxDrawdown: z.number(), finalEquity: z.number(), fees: z.number().nonnegative(), slippageCost: z.number().nonnegative(), source: z.string(),
});
export const legacyExperiment = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), inputHash: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.iso.datetime(), snapshot: experimentSnapshotSchema, result: backtestResultSchema });
export const dailyRuleBacktestInput = ruleBacktestInput.extend({
  code: masterCodeSchema, runId: z.uuid(), source: z.literal('kis-rest'), from: marketDate, to: marketDate,
  adjustment: z.enum(['adjusted','raw']),
}).refine(v => v.from <= v.to, '시작일은 종료일보다 늦을 수 없습니다.');
export const ruleSnapshotSchema = experimentSnapshotSchema.extend({
  engineVersion: z.literal('daily-rules-next-open-v2'), input: dailyRuleBacktestInput,
});
const ruleResultSchema = backtestResultSchema.extend({
  trades: z.array(backtestResultSchema.shape.trades.element.extend({reason:z.string().min(1)})),
  benchmark: backtestResultSchema.pick({returnPct:true, maxDrawdown:true, finalEquity:true}),
});
const byCode = (a:{code:string}, b:{code:string}) => a.code.localeCompare(b.code,'en');
export const dailyPortfolioBacktestInput = z.strictObject({
  runs: z.array(z.strictObject({code:masterCodeSchema, runId:z.uuid()})).min(2).max(7).transform(rows => rows.sort(byCode)),
  source:z.literal('kis-rest'), from:marketDate, to:marketDate, adjustment:z.enum(['adjusted','raw']),
  capital:backtestInput.shape.capital, feeBps:backtestInput.shape.feeBps, slippageBps:backtestInput.shape.slippageBps,
  rule:portfolioRuleSchema,
}).refine(v => v.from <= v.to, '시작일은 종료일보다 늦을 수 없습니다.')
  .refine(v => {
    const codes = portfolioCodes(v.rule);
    return v.runs.length === codes.length && codes.every(code => v.runs.some(run => run.code === code));
  }, '수집 종목과 바스켓 구성이 일치해야 합니다.');
export const portfolioSnapshotSchema = z.object({
  engineVersion:z.literal('daily-portfolio-next-open-v3'), input:dailyPortfolioBacktestInput,
  legs:z.array(z.object({code:masterCodeSchema, collection:dailyRunSchema, bars:dailyDetailSchema.shape.bars})).min(2).max(7).transform(rows => rows.sort(byCode)),
}).refine(({legs,input}) => legs.length === input.runs.length && legs.every((leg,i) =>
  leg.code === input.runs[i].code && leg.collection.code === leg.code && leg.collection.id === input.runs[i].runId));
export const portfolioResultSchema = ruleResultSchema.extend({
  trades:z.array(ruleResultSchema.shape.trades.element.extend({code:masterCodeSchema})),
  rebalances:z.array(z.object({signalDate:marketDate,date:marketDate,
    targets:z.array(z.object({code:masterCodeSchema, weight:z.number().min(0).max(1)})),reason:z.string().min(1)})),
});
export type PortfolioSnapshot = z.infer<typeof portfolioSnapshotSchema>;
export type PortfolioResult = z.infer<typeof portfolioResultSchema>;
export const singleExperimentSchema = z.union([legacyExperiment,legacyExperiment.extend({snapshot:ruleSnapshotSchema,result:ruleResultSchema})]);
export type SingleExperiment = z.infer<typeof singleExperimentSchema>;
export const experimentSchema = z.union([singleExperimentSchema,legacyExperiment.extend({snapshot:portfolioSnapshotSchema,result:portfolioResultSchema})]);
export type Experiment = z.infer<typeof experimentSchema>;
export const experimentSummarySchema = legacyExperiment.pick({ id: true, createdAt: true }).extend({ input: z.union([dailyBacktestInput,dailyRuleBacktestInput,dailyPortfolioBacktestInput]), bars: z.number().int().nonnegative() });
export const experimentListSchema = z.object({ experiments: z.array(experimentSummarySchema) });

export const singleExperimentListSchema = experimentListSchema.transform(({experiments}) => ({
  experiments: experiments.flatMap(item => 'runs' in item.input ? [] : [{...item,input:item.input}]),
}));

export type LegacyExperiment = z.infer<typeof legacyExperiment>;
const legacySummary = experimentSummarySchema.extend({input:dailyBacktestInput});
export const legacyExperimentListSchema = experimentListSchema.transform(({experiments}) => ({
  experiments: experiments.flatMap(item => 'rule' in item.input ? [] : [legacySummary.parse(item)]),
}));
