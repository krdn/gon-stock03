import { z } from 'zod';
import { dataStatusSchema } from './contracts.ts';
import { dailyInput, marketDate, masterCodeSchema, type DailyRun } from './market-data.ts';

export const dailyRunSchema = dailyInput.safeExtend({
  source: z.literal('kis-rest'), exchange: z.literal('KRX'), endpoint: z.string(), startedAt: z.iso.datetime(), captureDate: marketDate,
  nextDate: marketDate.nullable(), coverageComplete: z.boolean(),
  status: dataStatusSchema.extend({ environment: z.literal('kis-paper'), source: z.literal('kis-rest') }),
  quality: z.object({ state: z.enum(['pending', 'unverified', 'passed', 'failed']), missingDates: z.array(marketDate), unexpectedDates: z.array(marketDate), candidateMissingDates: z.array(marketDate), duplicates: z.number().int().nonnegative(), emptyWindows: z.array(z.object({ from: marketDate, to: marketDate })) }),
}) satisfies z.ZodType<DailyRun>;
export const dailyRunsSchema = z.object({ runs: z.array(dailyRunSchema) });
export const dailyDetailSchema = z.object({ run: dailyRunSchema, bars: z.array(z.object({
  date: marketDate, code: masterCodeSchema, adjustment: z.enum(['adjusted', 'raw']), source: z.literal('kis-rest'), collectedAt: z.iso.datetime(),
  open: z.number().nonnegative(), high: z.number().nonnegative(), low: z.number().nonnegative(), close: z.number().positive(), volume: z.number().int().nonnegative(),
})) });
