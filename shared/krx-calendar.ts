import { addDays, type DailyPrice } from './market-data.ts';
import type { ExchangeNotice } from './trading-policy.ts';

// 2026-11-27 snapshot of KRX market holidays and special equity sessions.
export const calendarSource = 'https://global.krx.co.kr/contents/GLB/05/0501/0501110000/GLB0501110000.jsp';
const holidays = new Set(
  '0101 0216 0217 0218 0302 0501 0505 0525 0603 0717 0817 0924 0925 1005 1009 1225 1231'.split(' '),
);
// Keep the required dates even when the exchange notice itself is unavailable.
const requiredNotices = ['2026-01-02', '2026-11-19'];
export const needsSessionNotice = (iso: string) => requiredNotices.includes(iso);
const sessions: ExchangeNotice[] = [
  { date: '2026-01-02', open: '10:00', close: '15:30', source: calendarSource },
  {
    date: '2026-11-19',
    open: '10:00',
    close: '16:30',
    source: 'https://kind.krx.co.kr/external/2026/11/05/000141/20261105000216/99303.htm',
  },
];
export const isoDay = (day: string) => day.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
export const isCalendarSnapshotFresh = (year: number) => year === 2026;
export const krxSessionNotice = (day: string) => sessions.find((s) => s.date === isoDay(day));
export function isKrxTradingDay(day: string) {
  const iso = isoDay(day),
    weekday = new Date(iso + 'T00:00:00Z').getUTCDay();
  return (
    isCalendarSnapshotFresh(Number(iso.slice(0, 4))) &&
    weekday >= 1 &&
    weekday <= 5 &&
    !holidays.has(iso.slice(5).replace('-', ''))
  );
}
export function krxTradingDates(from: string, to: string) {
  const dates: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) if (isKrxTradingDay(day)) dates.push(day);
  return dates;
}
export function verifyCalendar(
  from: string,
  to: string,
  bars: Pick<DailyPrice, 'date' | 'volume'>[],
  notice = krxSessionNotice,
) {
  const expected = new Set(krxTradingDates(from, to)),
    actual = new Set(bars.filter((b) => b.volume > 0).map((b) => b.date));
  const mismatch = [
    ...[...expected].filter((day) => !actual.has(day)),
    ...[...actual].filter((day) => !expected.has(day)),
  ].sort();
  const verified =
    expected.size > 0 &&
    [from, to].every((d) => isCalendarSnapshotFresh(Number(d.slice(0, 4)))) &&
    requiredNotices.every(day => day < isoDay(from) || day > isoDay(to) || notice(day)?.date === day) &&
    mismatch.length === 0;
  return { dates: [...expected], mismatch, verified };
}
