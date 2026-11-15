import { z } from 'zod';
import type { DataStatus } from './model.ts';

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
export interface MasterInstrument { code: string; isin: string; name: string; exchange: Exchange; kind: 'stock' | 'etf'; group: string }
export interface MasterSnapshot { exchange: Exchange; source: string; sha256: string; collectedAt: string; rows: MasterInstrument[] }
export interface MasterState { exchange: Exchange; source: string; phase: 'loading' | 'ready' | 'error'; observedAt: string; lastSuccessAt: string | null; error: string | null; sha256: string | null; count: number }
