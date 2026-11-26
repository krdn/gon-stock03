import { z } from 'zod';
import type { DataStatus, KisQuote } from './model.ts';

export const masterCodeSchema = z.string().regex(/^[0-9A-Z]{6}$/);
export const MARKET_PAGE_SIZE = 8;
export const MARKET_REFRESH_MS = 15_000;
export const MARKET_STALE_MS = 30_000;

const isoDate = (value: string) => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
export const marketDate = z.string().regex(/^\d{8}$/).refine(value => {
  const iso = isoDate(value);
  const time = Date.parse(iso);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === iso;
});
export function addDays(date: string, days: number) {
  const value = new Date(`${isoDate(date)}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10).replaceAll('-', '');
}
export const dailyInput = z.object({
  id: z.uuid(), code: z.string().regex(/^[0-9A-Z]{6}$/), from: marketDate, to: marketDate,
  adjustment: z.enum(['adjusted', 'raw']),
  calendar: z.object({ source: z.url().max(500).regex(/^https:\/\//), dates: z.array(marketDate).max(3660) }).strict().optional(),
}).strict().refine(v => v.from <= v.to && Date.parse(isoDate(v.to)) - Date.parse(isoDate(v.from)) <= 3659 * 86400000, '기간은 최대 3660일입니다.')
  .refine(v => !v.calendar || (new Set(v.calendar.dates).size === v.calendar.dates.length && v.calendar.dates.every(d => d >= v.from && d <= v.to)), '달력 거래일의 중복과 범위를 확인하세요.');
export type DailyInput = z.infer<typeof dailyInput>;
export interface DailyPrice { date: string; open: number; high: number; low: number; close: number; volume: number }
export interface StoredBar extends DailyPrice { code: string; adjustment: DailyInput['adjustment']; source: 'kis-rest'; collectedAt: string }
export interface DailyRun extends DailyInput {
  source: 'kis-rest'; exchange: 'KRX'; endpoint: string; startedAt: string; captureDate: string;
  nextDate: string | null; coverageComplete: boolean; status: DataStatus;
  quality: { state: 'pending' | 'unverified' | 'passed' | 'failed'; missingDates: string[]; unexpectedDates: string[]; candidateMissingDates: string[]; duplicates: number; emptyWindows: { from: string; to: string }[] };
}
export type Exchange = 'KOSPI' | 'KOSDAQ';
export const masterUrl = (exchange: Exchange) => `https://new.real.download.dws.co.kr/common/master/${exchange.toLowerCase()}_code.mst.zip`;

export function masterSourceLabel(state?: MasterState) {
  if (!state?.lastSuccessAt) return '목록 출처 미확인';
  if (state.source === masterUrl(state.exchange) && /^[a-f0-9]{64}$/.test(state.sha256 ?? '')) return 'KIS 공개 종목 마스터';
  if (['synthetic', 'fixture', 'https://example.test/master', 'https://example.test/fixture'].includes(state.source)) return '합성 예시 목록';
  return '목록 출처 미확인';
}

export interface MasterInstrument { code: string; isin: string; name: string; exchange: Exchange; kind: 'stock' | 'etf'; group: string; sector?: string; tradingHalted?: boolean; liquidation?: boolean }
export interface RemovedInstrument extends MasterInstrument { removedAt: string }
export interface MasterSnapshot { exchange: Exchange; source: string; sha256: string; collectedAt: string; rows: MasterInstrument[] }
export interface MasterState { exchange: Exchange; source: string; phase: 'loading' | 'ready' | 'error'; observedAt: string; lastSuccessAt: string | null; error: string | null; sha256: string | null; count: number }
const masterInstrumentSchema = z.object({ code: masterCodeSchema, isin: z.string(), name: z.string().min(1), exchange: z.enum(['KOSPI', 'KOSDAQ']), kind: z.enum(['stock', 'etf']), group: z.string(), sector:z.string().optional(), tradingHalted: z.boolean().optional(), liquidation: z.boolean().optional() });
export const masterDataSchema = z.object({
  instruments: z.array(masterInstrumentSchema), removed: z.array(masterInstrumentSchema.extend({ removedAt: z.iso.datetime() })).default([]),
  sources: z.array(z.object({ exchange: z.enum(['KOSPI', 'KOSDAQ']), source: z.string(), phase: z.enum(['loading', 'ready', 'error']), observedAt: z.iso.datetime(), lastSuccessAt: z.iso.datetime().nullable(), error: z.string().nullable(), sha256: z.string().nullable(), count: z.number().int().nonnegative() })),
});
export type MasterDataSnapshot = z.infer<typeof masterDataSchema>;
export const marketQuoteInput = z.object({ code: masterCodeSchema }).strict();
export const marketQuoteSchema = z.object({ code: masterCodeSchema, price: z.number().positive(), change: z.number(), upper: z.number().nonnegative(), lower: z.number().nonnegative(), tickSize: z.number().nonnegative(), stopped: z.boolean(), receivedAt: z.iso.datetime(), volume: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(), sector: z.string().optional(), liquidation: z.boolean().optional() }) satisfies z.ZodType<KisQuote>;

export const DEFAULT_SYNC_SYMBOL_LIMIT = 30;
export const MAX_SYNC_SYMBOL_LIMIT = 50;
export const scopeNotice = '우선 범위 수집 기준(범위 밖 미검증)';
export const syncInput = z.object({
  trigger:z.enum(['post_close','manual']).default('post_close'), targetDate:marketDate.optional(),
  limit:z.int().min(1).max(MAX_SYNC_SYMBOL_LIMIT).default(DEFAULT_SYNC_SYMBOL_LIMIT), includeMaster:z.boolean().default(true),
}).strict();
export type SyncRun = {
  runId:string; trigger:'manual'|'post_close'; targetDate:string; sourceLabel:string;
  status:'running'|'succeeded'|'partial'|'skipped'|'failed'|'interrupted'; reasonCode:string|null;
  calendarSource:string; calendarVerified:boolean; scopeLimit:number; totalSymbols:number; succeededSymbols:number;
  failedSymbols:number; masterRefreshed:boolean; startedAt:string; finishedAt:string|null;
  summary:{scopeNotice:string; tier1:number; tier2:number; tier1Truncated:boolean; omitted:string[]; halted:string[]; mismatch:string[]; failures:{code:string;reason:string}[]; message?:string};
};
