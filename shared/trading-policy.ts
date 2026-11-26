import { z } from 'zod';

import { isoDay, isKrxTradingDay, krxSessionNotice, needsSessionNotice } from './krx-calendar.ts';

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '시각은 HH:MM으로 입력하세요.');
export const sessionWindow = z
  .object({ open: clock, close: clock })
  .strict()
  .refine((s) => s.open < s.close, '시작 시각은 종료보다 빨라야 합니다.');
const seconds = z.int().min(1).max(600);
export const exchangeNotice = sessionWindow
  .safeExtend({
    date: z.iso.date(),
    source: z.url({
      protocol: /^https$/,
      hostname: /^(?:(?:kind|global|www)\.krx\.co\.kr|securities\.koreainvestment\.com)$/,
    }),
  })
  .refine(
    (s) => s.date !== '2026-11-19' || (s.open === '10:00' && s.close === '16:30'),
    '11월 19일 KRX 공식 정규장은 10:00~16:30입니다.',
  );
export type ExchangeNotice = z.infer<typeof exchangeNotice>;
const connectionTiming = {
  exchangeNotice: exchangeNotice.optional(),
  requestSeconds: z.int().min(1).max(120),
  balanceSeconds: z.int().min(1).max(600),
  extraSpacingMs: z.int().min(0).max(30000),
  masterDays: z.int().min(1).max(30),
  reconnects: z.int().min(0).max(20),
  silenceSeconds: z.int().min(1).max(600),
  recoverySeconds: z.int().min(1).max(3600),
};
export const strategyPolicy = z
  .object({
    ...connectionTiming,
    orderType: z.enum(['limit', 'market']),
    quoteSeconds: seconds,
    signalSeconds: seconds,
    session: sessionWindow,
  })
  .strict();
export const oncePolicy = z
  .object({
    ...connectionTiming,
    session: sessionWindow,
    side: z.enum(['buy', 'sell']),
    priceMode: z.enum(['current', 'fixed', 'lower', 'cappedCurrent']),
    limitPrice: z.int().positive().max(10000000).optional(),
    quoteSeconds: seconds,
    observationSeconds: z.int().min(1).max(86400),
    allowPending: z.boolean(),
    cashReserve: z.int().min(0).max(100000000),
    consumeAt: z.enum(['preflight', 'validated']),
  })
  .strict()
  .refine(
    (p) => (p.priceMode === 'current' ? p.limitPrice === undefined : p.limitPrice !== undefined),
    '선택한 지정가 기준에 맞는 고정 단가 또는 매수 단가 상한을 확인하세요.',
  );
export type OncePolicy = z.infer<typeof oncePolicy>;
export type StrategyPolicy = z.infer<typeof strategyPolicy>;

// Normal session unless an exchange notice specifies a different session for that date.
// The operator still confirms that the selected date is a trading day.
export function krxHours(date: string, notice?: ExchangeNotice) {
  const session = notice?.date === date ? notice : krxSessionNotice(date);
  return session ? { open: session.open, close: session.close } : { open: '09:00', close: '15:30' };
}
export function afterCloseBuffer(day: string, now: number, notice?: ExchangeNotice) {
  const iso = isoDay(day);
  if (needsSessionNotice(iso) && notice?.date !== iso && !krxSessionNotice(iso)) return false;
  return isKrxTradingDay(iso) && now >= Date.parse(iso + 'T' + krxHours(iso, notice).close + ':00+09:00') + 600000;
}
// 1단계에서는 KST 주말만 차단하며 평일 공휴일은 차단하지 않는다.
export function isKstWeekend(date: string) {
  const day = new Date(date + 'T12:00:00+09:00').getUTCDay();
  return day === 0 || day === 6;
}
export function sessionBounds(date: string, window: { open: string; close: string }, notice?: ExchangeNotice) {
  const official = krxHours(date, notice);
  const open = window.open > official.open ? window.open : official.open;
  const close = window.close < official.close ? window.close : official.close;
  if (isKstWeekend(date) || open >= close) return null;
  return { start: Date.parse(date + 'T' + open + ':00+09:00'), end: Date.parse(date + 'T' + close + ':00+09:00') };
}
export function defaultOncePolicy(date: string): OncePolicy {
  return {
    requestSeconds: 15,
    balanceSeconds: 120,
    extraSpacingMs: 0,
    masterDays: 1,
    reconnects: 3,
    silenceSeconds: 45,
    recoverySeconds: 300,
    session: krxHours(date),
    side: 'buy',
    priceMode: 'current',
    quoteSeconds: 5,
    observationSeconds: 120,
    allowPending: false,
    cashReserve: 1,
    consumeAt: 'preflight',
  };
}
export function defaultStrategyPolicy(): StrategyPolicy {
  return {
    orderType: 'limit',
    requestSeconds: 15,
    balanceSeconds: 120,
    extraSpacingMs: 0,
    masterDays: 1,
    reconnects: 3,
    silenceSeconds: 45,
    recoverySeconds: 300,
    session: { open: '00:00', close: '23:59' },
    quoteSeconds: 5,
    signalSeconds: 5,
  };
}
export function validOncePolicy(
  p: OncePolicy,
  type: 'limit' | 'market',
  code: string,
  amount: number,
  cancel: boolean,
) {
  if (p.priceMode === 'cappedCurrent' && p.side !== 'buy') return false;
  if (type === 'market' && p.priceMode !== 'current') return false;
  if (p.limitPrice !== undefined && p.limitPrice > amount) return false;
  // Preserve the observed scoped cancel exception. General VTS cancel eligibility cannot be queried.
  return (
    !cancel ||
    (p.side === 'buy' &&
      type === 'limit' &&
      (p.priceMode === 'current' || p.priceMode === 'cappedCurrent') &&
      ['005930', '069500'].includes(code) &&
      amount <= 200000 &&
      !p.allowPending)
  );
}

export function approvalBinding(a: {
  ledgerPath?: string;
  accountFingerprint?: string;
  cancelProbe?: true;
  policy?: OncePolicy;
  assetKind?: 'stock' | 'etf';
  lowerLimitPrice?: number;
  krxSession?: { date: string; open: string; close: string };
}) {
  if (!a.ledgerPath) return null;
  const parts: unknown[] = [a.ledgerPath, a.accountFingerprint, !!a.cancelProbe];
  if (a.policy) parts.push('settings-v2', a.assetKind, oncePolicy.parse(a.policy));
  if (a.lowerLimitPrice !== undefined) {
    if (!a.krxSession) throw new Error('하한가 후보의 KRX 세션이 필요합니다.');
    parts.push('lower-limit-v1', a.lowerLimitPrice, a.krxSession.date, a.krxSession.open, a.krxSession.close);
  }
  return JSON.stringify(parts);
}
