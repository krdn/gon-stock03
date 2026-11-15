import { z } from 'zod';
import { backtestInput } from './contracts.ts';
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
export const experimentSchema = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), inputHash: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.iso.datetime(), snapshot: experimentSnapshotSchema, result: backtestResultSchema });
export type Experiment = z.infer<typeof experimentSchema>;
export const experimentSummarySchema = experimentSchema.pick({ id: true, createdAt: true }).extend({ input: dailyBacktestInput, bars: z.number().int().nonnegative() });
export const experimentListSchema = z.object({ experiments: z.array(experimentSummarySchema) });
