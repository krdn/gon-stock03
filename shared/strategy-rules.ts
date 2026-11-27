import { z } from 'zod';
import { atr, averageVolume, ema, rollingHighest, rollingLowest, rsi, sma } from './indicators.ts';

const period = (min: number, max: number) => z.int().min(min).max(max);
export const strategyRuleSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ma_crossover'), maType: z.enum(['sma','ema']), fast: period(2,60), slow: period(3,120),
    regimePeriod: period(20,240).nullish(), minRelativeVolume: z.number().min(0).max(5).optional() }).refine(v => v.fast < v.slow, '단기 기간은 장기 기간보다 작아야 합니다.'),
  z.strictObject({ kind: z.literal('donchian_breakout'), entryLookback: period(10,120), exitLookback: period(3,60), volumeMultiplier: z.number().min(0.5).max(5) })
    .refine(v => v.exitLookback < v.entryLookback, '청산 기간은 진입 기간보다 작아야 합니다.'),
  z.strictObject({ kind: z.literal('rsi2_pullback'), rsiPeriod: period(2,5), oversoldThreshold: z.number().min(2).max(25), longTrendMa: period(60,240), exitShortMa: period(3,10), maxHoldingDays: period(3,20) }),
]);
export const exitOverlaySchema = z.strictObject({ chandelier: z.strictObject({ atrPeriod: period(7,30), atrMultiplier: z.number().min(1.5).max(5) }).optional() });
export type StrategyRule = z.infer<typeof strategyRuleSchema>;
export type ExitOverlay = z.infer<typeof exitOverlaySchema>;
export interface RuleBar { close: number; high?: number; low?: number; volume?: number; date?: string }
export interface Holding { barsHeld: number; trailStop?: number }
export function warmup(rule: StrategyRule, overlay?: ExitOverlay) {
  let n: number;
  switch (rule.kind) {
    case 'ma_crossover': n = Math.max(rule.slow + 1, rule.regimePeriod ?? 0, rule.minRelativeVolume ? 21 : 0); break;
    case 'donchian_breakout': n = Math.max(rule.entryLookback, 20) + 1; break;
    case 'rsi2_pullback': n = Math.max(rule.longTrendMa, rule.exitShortMa, rule.rsiPeriod + 1); break;
  }
  return Math.max(n, overlay?.chandelier?.atrPeriod ?? 0);
}
export function assertCloseOnly(rule?: StrategyRule, overlay?: ExitOverlay) {
  if (overlay?.chandelier || rule?.kind === 'donchian_breakout' || (rule?.kind === 'ma_crossover' && rule.minRelativeVolume))
    throw new Error('DEMO는 종가만 제공합니다. 고저가·거래량이 필요한 규칙은 저장 일봉 백테스트에서 사용하세요.');
}
export function assertRealtimeRule(rule?: StrategyRule, overlay?: ExitOverlay) {
  if (overlay?.chandelier || (rule && (rule.kind !== 'ma_crossover' || rule.maType !== 'sma' || rule.regimePeriod || rule.minRelativeVolume)))
    throw new Error('신규 다중 전략 규칙의 KIS 장중 실시간 평가는 장전 레벨 트리거 계약 연결 후 활성화됩니다.');
}
function required(bar: RuleBar, field: 'high'|'low'|'volume') {
  const value = bar[field];
  if (value === undefined || !Number.isFinite(value)) throw new Error('전략에 필요한 고저가·거래량이 없습니다.');
  return value;
}
export function evaluateClose(bars: readonly RuleBar[], rule: StrategyRule, holding?: Holding, overlay?: ExitOverlay) {
  let trailStop = holding?.trailStop;
  const decision = (signal: 'buy'|'sell'|'hold', reason: string) => ({signal, reason, trailStop});
  if (bars.length < warmup(rule, overlay)) return decision('hold','준비 봉 부족');
  const closes = bars.map(b => b.close), last = bars.at(-1)!, prior = bars.slice(0,-1);
  if (holding && overlay?.chandelier) {
    const {atrPeriod, atrMultiplier} = overlay.chandelier;
    const hlc = bars.map(b => ({close:b.close, high:required(b,'high'), low:required(b,'low')}));
    const high = Math.max(...hlc.slice(-holding.barsHeld).map(b => b.high));
    trailStop = Math.max(trailStop ?? -Infinity, high - atrMultiplier * atr(hlc, atrPeriod));
    if (last.close <= trailStop) return decision('sell','샹들리에 추적 손절선 도달');
  }
  switch (rule.kind) {
    case 'ma_crossover': {
      const ma = rule.maType === 'ema' ? ema : sma, prev = closes.slice(0,-1);
      const before = ma(prev,rule.fast) - ma(prev,rule.slow), now = ma(closes,rule.fast) - ma(closes,rule.slow);
      if (before >= 0 && now < 0) return decision('sell','단기선이 장기선을 하향 돌파');
      if (before <= 0 && now > 0 && (!rule.regimePeriod || last.close > ma(closes,rule.regimePeriod)) &&
          (!rule.minRelativeVolume || required(last,'volume') >= rule.minRelativeVolume * averageVolume(prior.slice(-20).map(b => required(b,'volume')),20)))
        return decision('buy','단기선이 장기선을 상향 돌파하고 진입 조건 충족');
      break;
    }
    case 'donchian_breakout': {
      if (last.close <= rollingLowest(prior.slice(-rule.exitLookback).map(b => required(b,'low')),rule.exitLookback)) return decision('sell','직전 채널 하단 도달');
      if (last.close >= rollingHighest(prior.slice(-rule.entryLookback).map(b => required(b,'high')),rule.entryLookback) &&
          required(last,'volume') > rule.volumeMultiplier * averageVolume(prior.slice(-20).map(b => required(b,'volume')),20)) return decision('buy','직전 채널 상단 돌파와 거래량 증가');
      break;
    }
    case 'rsi2_pullback': {
      const oscillator = rsi(closes,rule.rsiPeriod), short = sma(closes,rule.exitShortMa);
      if (holding && holding.barsHeld >= rule.maxHoldingDays) return decision('sell','최대 보유 봉 도달');
      if (holding && (last.close >= short || oscillator >= 70)) return decision('sell','단기 평균 또는 RSI 회복');
      if (!holding && last.close > sma(closes,rule.longTrendMa) && last.close < short && oscillator <= rule.oversoldThreshold) return decision('buy','장기 상승 추세에서 단기 과매도');
      break;
    }
  }
  return decision('hold','매매 조건 미충족');
}
const maPreset = (fast:number,slow:number): StrategyRule => ({kind:'ma_crossover',maType:'sma',fast,slow});
const channel = (entryLookback:number,exitLookback:number,volumeMultiplier:number): StrategyRule => ({kind:'donchian_breakout',entryLookback,exitLookback,volumeMultiplier});
const pullback = (oversoldThreshold:number,longTrendMa:number): StrategyRule => ({kind:'rsi2_pullback',rsiPeriod:2,oversoldThreshold,longTrendMa,exitShortMa:5,maxHoldingDays:10});
export const STRATEGY_CATALOG = {
  ma_crossover:{title:'이동평균 교차',buyWhen:'단기선이 장기선을 위로 넘을 때 사요.', sellWhen:'단기선이 장기선 아래로 내려가면 팔아요.', cautionRegime:'횡보장에서는 교차가 자주 반복돼요.',
    fields:['close'],optionalFields:['volume'], environments:{daily:true,demo:'거래량 필터 끔',kisPaper:'필터 없는 SMA'}, presets:{conservative:maPreset(20,60),basic:maPreset(5,20),aggressive:maPreset(3,10)}},
  donchian_breakout:{title:'돈키안 돌파',buyWhen:'거래량이 늘면서 이전 고점에 도달하면 사요.',sellWhen:'종가가 최근 저점까지 내려오면 팔아요.',cautionRegime:'횡보장에서는 돌파 직후 되밀릴 수 있어요.',
    fields:['close','high','low','volume'],environments:{daily:true,demo:false,kisPaper:false},presets:{conservative:channel(55,20,1.5),basic:channel(20,10,1),aggressive:channel(10,5,0.8)}},
  rsi2_pullback:{title:'RSI 단기 눌림목',buyWhen:'장기 상승 추세에서 단기 과매도가 나타나면 사요.',sellWhen:'단기 평균이나 RSI가 회복되거나 보유 기한이 되면 팔아요.',cautionRegime:'추세가 꺾이면 과매도가 오래 이어질 수 있어요.',
    fields:['close'],environments:{daily:true,demo:true,kisPaper:false},presets:{conservative:pullback(5,200),basic:pullback(10,200),aggressive:pullback(20,60)}},
} as const;
