import { z } from 'zod';

export const codeSchema = z.string().regex(/^\d{6}$/);
const integer = (min: number, max: number) => z.number().int().min(min).max(max);
export const orderInput = z.object({ code: codeSchema, side: z.enum(['buy', 'sell']), qty: integer(1, 100000), price: integer(1, 10000000), requestId: z.uuid() }).strict();
export const strategyInput = z.object({ name: z.string().trim().min(1).max(60), code: codeSchema, fast: integer(2, 60), slow: integer(3, 100), qty: integer(1, 10000) }).strict().refine(v => v.fast < v.slow, '단기 기간은 장기 기간보다 작아야 합니다.');
export const backtestInput = z.object({ code: codeSchema, fast: integer(2, 60), slow: integer(3, 100), capital: integer(100000, 100000000), feeBps: z.number().min(0).max(100), slippageBps: z.number().min(0).max(100) }).strict().refine(v => v.fast < v.slow, '단기 기간은 장기 기간보다 작아야 합니다.');
export const riskInput = z.object({ maxOrder: integer(10000, 100000000), maxPosition: integer(10000, 100000000), dailyLoss: integer(1000, 100000000) }).strict();
export const journalInput = z.object({ code: codeSchema, text: z.string().trim().min(1).max(2000) }).strict();
export const idInput = z.object({ id: z.string().min(1).max(80) }).strict();
export const haltInput = z.object({ halted: z.boolean() }).strict();
export type OrderInput = z.infer<typeof orderInput>;
