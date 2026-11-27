import {isPortfolioRule, portfolioOnly, type PortfolioRule} from './portfolio-rules.ts';
import { z } from 'zod';
import { bollinger, dmi, macd, atr, averageVolume, ema, rollingHighest, rollingLowest, rsi, sma } from './indicators.ts';

const period = (min: number, max: number) => z.int().min(min).max(max);
export const strategyRuleSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('volatility_breakout'), k: z.number().min(0.1).max(1), useAdaptiveNoise: z.boolean(),
    noiseLookback: period(5,60), trendMaPeriod: period(5,200), holdDays: period(1,10) }),
  z.strictObject({ kind: z.literal('ma_crossover'), maType: z.enum(['sma','ema']), fast: period(2,60), slow: period(3,120),
    regimePeriod: period(20,240).nullish(), minRelativeVolume: z.number().min(0).max(5).optional() }).refine(v => v.fast < v.slow, '단기 기간은 장기 기간보다 작아야 합니다.'),
  z.strictObject({ kind: z.literal('donchian_breakout'), entryLookback: period(10,120), exitLookback: period(3,60), volumeMultiplier: z.number().min(0.5).max(5) })
    .refine(v => v.exitLookback < v.entryLookback, '청산 기간은 진입 기간보다 작아야 합니다.'),
  z.strictObject({ kind: z.literal('rsi2_pullback'), rsiPeriod: period(2,5), oversoldThreshold: z.number().min(2).max(25), longTrendMa: period(60,240), exitShortMa: period(3,10), maxHoldingDays: period(3,20) }),
  z.strictObject({ kind: z.literal('macd_momentum'),
    fastPeriod: period(3, 30), slowPeriod: period(10, 100), signalPeriod: period(3, 30), requireZeroLineAbove: z.boolean() })
    .refine(v => v.fastPeriod < v.slowPeriod, 'MACD 단기 기간은 장기 기간보다 작아야 합니다.'),
  z.strictObject({ kind: z.literal('adx_dmi_trend'),
    diPeriod: period(7, 30), adxThreshold: z.number().min(15).max(40) }),
  z.strictObject({ kind: z.literal('bollinger_squeeze'),
    period: period(10, 60), stdDevMultiplier: z.number().min(1.5).max(3), squeezeLookback: period(20, 120), squeezePercentile: z.number().min(10).max(50) }),
  z.strictObject({ kind: z.literal('ttm_squeeze'),
    period: period(14, 30), bbMult: z.number().min(1.5).max(2.5), kcMult: z.number().min(1).max(2.5) }),
  z.strictObject({ kind: z.literal('bollinger_percent_b'),
    bbPeriod: period(14, 30), bbStdDev: z.number().min(1.8).max(2.5), rsiPeriod: period(7, 21), rsiOversold: z.number().min(20).max(40), exitPercentB: z.number().min(0.4).max(1) }),
  z.strictObject({ kind: z.literal('low_volume_pullback'),
    pullbackDays: period(2, 7), maxVolumeRatio: z.number().min(0.3).max(0.9), trendFastMa: period(10, 30), trendSlowMa: period(40, 120) })
    .refine(v => v.trendFastMa < v.trendSlowMa, '단기 추세선은 장기 추세선보다 작아야 합니다.'),
  z.strictObject({ kind: z.literal('disparity_reversion'),
    maPeriod: period(10, 60), buyDisparity: z.number().min(85).max(97), sellDisparity: z.number().min(98).max(105), stopLossPct: z.number().min(2).max(10) })
    .refine(v => v.buyDisparity < v.sellDisparity, '매수 이격도는 매도 이격도보다 작아야 합니다.'),
]);
export const exitOverlaySchema = z.strictObject({
  volatilityParity: z.strictObject({ volLookback: period(10,60),
    targetAnnualVolPct: z.number().min(5,'목표 변동성은 5% 이상이어야 합니다.').max(60), maxAllocationPct: z.number().min(10).max(100) }).optional(),
  chandelier: z.strictObject({ atrPeriod: period(7,30), atrMultiplier: z.number().min(1.5).max(5) }).optional() });
export type StrategyRule = z.infer<typeof strategyRuleSchema>;
export type ExitOverlay = z.infer<typeof exitOverlaySchema>;
export interface RuleBar { close: number; open?: number; high?: number; low?: number; volume?: number; date?: string }
export interface Holding { barsHeld: number; entryPrice?: number; trailStop?: number }
export function warmup(rule: StrategyRule, overlay?: ExitOverlay) {
  let n: number;
  switch (rule.kind) {
    case 'volatility_breakout': n = Math.max(rule.noiseLookback, rule.trendMaPeriod); break;
    case 'macd_momentum': n = rule.slowPeriod + rule.signalPeriod + 10; break;
    case 'adx_dmi_trend': n = 2 * rule.diPeriod; break;
    case 'bollinger_squeeze': n = Math.max(rule.period + rule.squeezeLookback, 21); break;
    case 'ttm_squeeze': n = rule.period + 2; break;
    case 'bollinger_percent_b': n = Math.max(rule.bbPeriod, rule.rsiPeriod + 1) + 1; break;
    case 'low_volume_pullback': n = Math.max(rule.trendSlowMa, 21 + rule.pullbackDays); break;
    case 'disparity_reversion': n = rule.maPeriod; break;
    case 'ma_crossover': n = Math.max(rule.slow + 1, rule.regimePeriod ?? 0, rule.minRelativeVolume ? 21 : 0); break;
    case 'donchian_breakout': n = Math.max(rule.entryLookback, 20) + 1; break;
    case 'rsi2_pullback': n = Math.max(rule.longTrendMa, rule.exitShortMa, rule.rsiPeriod + 1); break;
  }
  return Math.max(n, overlay?.chandelier?.atrPeriod ?? 0, overlay?.volatilityParity ? overlay.volatilityParity.volLookback + 1 : 0);
}
export function assertCloseOnly(rule?: StrategyRule | PortfolioRule, overlay?: ExitOverlay) {
  if (isPortfolioRule(rule)) throw new Error(portfolioOnly);
  if (overlay?.volatilityParity || overlay?.chandelier || (rule && STRATEGY_CATALOG[rule.kind].environments.demo === false) || (rule?.kind === 'ma_crossover' && rule.minRelativeVolume))
    throw new Error('DEMO는 종가만 제공합니다. 고저가·거래량이 필요한 규칙은 저장 일봉 백테스트에서 사용하세요.');
}
function unfilteredSma(rule?: StrategyRule) {
  return !rule || (rule.kind === 'ma_crossover' && rule.maType === 'sma' && !rule.regimePeriod && !rule.minRelativeVolume);
}

export function isBasicRealtimeSma(rule?: StrategyRule | PortfolioRule, overlay?: ExitOverlay, slow?: number) {
  if (isPortfolioRule(rule)) return false;
  return !overlay?.chandelier && !overlay?.volatilityParity && unfilteredSma(rule)
    && (rule?.kind === 'ma_crossover' ? rule.slow : slow ?? 0) <= 100;
}

export function assertRealtimeRule(rule?: StrategyRule | PortfolioRule, overlay?: ExitOverlay, slow?: number) {
  if (isPortfolioRule(rule)) throw new Error(portfolioOnly);
  if (rule?.kind === 'volatility_breakout' || overlay?.volatilityParity)
    throw new Error('윌리엄스 변동성 돌파와 변동성 패리티 수량 조절은 저장 일봉 백테스트 전용입니다.');
  if (unfilteredSma(rule) && !overlay?.chandelier && !isBasicRealtimeSma(rule, overlay, slow))
    throw new Error('실시간 체결가 기본 SMA의 장기 기간은 100 이하여야 합니다.');
}

export function normalizeRule(rule: PortfolioRule | StrategyRule | undefined, fast: number, slow: number): StrategyRule {
  if (isPortfolioRule(rule)) throw new Error(portfolioOnly);
  if (!rule) return { kind: 'ma_crossover', maType: 'sma', fast, slow };
  if (rule.kind === 'ma_crossover' && unfilteredSma(rule))
    return { kind: rule.kind, maType: 'sma', fast: rule.fast, slow: rule.slow };
  return rule;
}
function required(bar: RuleBar, field: 'open'|'high'|'low'|'volume') {
  const value = bar[field];
  if (value === undefined || !Number.isFinite(value)) throw new Error('전략에 필요한 시가·고저가·거래량이 없습니다.');
  return value;
}
const toHlc = (b: RuleBar) => ({close:b.close, high:required(b,'high'), low:required(b,'low')});
export function breakoutEntry(prior: readonly RuleBar[], today: RuleBar, rule: Extract<StrategyRule,{kind:'volatility_breakout'}>) {
  const prev = prior.at(-1)!;
  const range = required(prev,'high') - required(prev,'low');
  if (range <= 0 || prev.close <= sma(prior.slice(-rule.trendMaPeriod).map(b => b.close), rule.trendMaPeriod)) return;
  const k = rule.useAdaptiveNoise ? sma(prior.slice(-rule.noiseLookback).map(b => {
    const width = required(b,'high') - required(b,'low');
    return width > 0 ? 1 - Math.abs(required(b,'open') - b.close) / width : 0.5;
  }), rule.noiseLookback) : rule.k;
  const open = required(today,'open'), target = open + k * range;
  if (required(today,'high') >= target) return Math.max(open,target);
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
    case 'volatility_breakout':
      if (holding && holding.barsHeld >= rule.holdDays) return decision('sell','목표 보유 기간 경과 시가 청산');
      break;
    case 'macd_momentum': {
      const {value, hist, prevHist} = macd(closes, rule.fastPeriod, rule.slowPeriod, rule.signalPeriod);
      if (prevHist >= 0 && hist < 0) return decision('sell','MACD 히스토그램 하향 반전');
      if (prevHist <= 0 && hist > 0 && (!rule.requireZeroLineAbove || value > 0))
        return decision('buy','MACD 히스토그램 상향 돌파');
      break;
    }
    case 'adx_dmi_trend': {
      const {plusDI, minusDI, adx, prev} = dmi(bars.map(toHlc), rule.diPeriod);
      if (plusDI < minusDI) return decision('sell','-DI가 +DI를 상향 역전');
      if (plusDI > minusDI && adx >= rule.adxThreshold && adx > prev.adx)
        return decision('buy','+DI 우위 및 ADX 추세 강도 충족');
      break;
    }
    case 'bollinger_squeeze': {
      const band = bollinger(closes, rule.period, rule.stdDevMultiplier);
      if (last.close < band.mid) return decision('sell','볼린저 중심선 하향 이탈');
      if (last.close <= band.upper) break;
      const widths = Array.from({length:rule.squeezeLookback}, (_, i) => {
        const end = closes.length - rule.squeezeLookback + i;
        const {mid, upper, lower} = bollinger(closes.slice(end-rule.period, end), rule.period, rule.stdDevMultiplier);
        return (upper - lower) / mid;
      });
      const rank = Math.ceil(widths.length * rule.squeezePercentile / 100) - 1;
      const threshold = widths.toSorted((a,b) => a-b)[rank];
      if (Math.min(...widths.slice(-5)) <= threshold && required(last,'volume') > 1.2 * sma(prior.slice(-20).map(b => required(b,'volume')),20))
        return decision('buy','볼린저 스퀴즈 수축 후 상단 돌파와 거래량 증가');
      break;
    }
    case 'ttm_squeeze': {
      const hlc = bars.map(toHlc);
      const momentum = (end: number) => {
        const window = hlc.slice(end-rule.period, end);
        const midpoint = (Math.max(...window.map(b=>b.high)) + Math.min(...window.map(b=>b.low))) / 2;
        return window.at(-1)!.close - (midpoint + sma(window.map(b=>b.close),rule.period)) / 2;
      };
      const squeeze = (end: number) => {
        const values = closes.slice(0,end);
        const band = bollinger(values,rule.period,rule.bbMult);
        const mid = ema(values,rule.period), width = rule.kcMult * atr(hlc.slice(0,end),rule.period);
        return band.upper < mid + width && band.lower > mid - width;
      };
      const end = bars.length, now = momentum(end), prev = momentum(end-1);
      if (now < 0 || (now > 0 && now < prev && prev < momentum(end-2)))
        return decision('sell','TTM 모멘텀 음전환 또는 2봉 연속 둔화');
      if (now > 0 && now > prev && squeeze(end-1) && !squeeze(end))
        return decision('buy','켈트너-볼린저 스퀴즈 해제 및 양의 모멘텀 발산');
      break;
    }
    case 'bollinger_percent_b': {
      const percentB = (values: readonly number[]) => {
        const {upper, lower} = bollinger(values,rule.bbPeriod,rule.bbStdDev);
        return upper === lower ? 0.5 : (values.at(-1)! - lower) / (upper - lower);
      };
      const now = percentB(closes), prev = percentB(closes.slice(0,-1));
      if (now >= rule.exitPercentB) return decision('sell','볼린저 %B 목표 수준 회복');
      if (prev <= 0.05 && now > prev && last.close > prior.at(-1)!.close && rsi(closes,rule.rsiPeriod) <= rule.rsiOversold)
        return decision('buy','볼린저 하단 과매도 반등 및 RSI 기준 충족');
      break;
    }
    case 'low_volume_pullback': {
      const pull = prior.slice(-rule.pullbackDays);
      const fast = sma(closes,rule.trendFastMa), slow = sma(closes,rule.trendSlowMa);
      if (last.close < fast || last.close <= Math.min(...pull.map(b=>required(b,'low'))))
        return decision('sell','단기 추세선 또는 눌림목 저점 하향 이탈');
      const anchor = prior.at(-rule.pullbackDays-1)!.close;
      if (fast > slow && last.close > slow && pull.every(b=>b.close < anchor) &&
          sma(pull.map(b=>required(b,'volume')),pull.length) <= rule.maxVolumeRatio * sma(prior.slice(-20).map(b=>required(b,'volume')),20) &&
          last.close > required(last,'open') && last.close > required(prior.at(-1)!,'high'))
        return decision('buy','상승 추세 중 거래량 고갈 눌림목 후 고가 돌파 반전');
      break;
    }
    case 'disparity_reversion': {
      const ratio = 100 * last.close / sma(closes, rule.maPeriod);
      if (ratio >= rule.sellDisparity || (holding?.entryPrice !== undefined && last.close <= holding.entryPrice * (1-rule.stopLossPct/100)))
        return decision('sell','목표 이격도 복원 또는 손절 기준 도달');
      const {high, low} = toHlc(last);
      if (ratio <= rule.buyDisparity && high > low && (last.close-low)/(high-low) >= 0.4)
        return decision('buy','과대 이격 괴리 후 하단 반등 마감');
      break;
    }
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
const breakout = (k:number,useAdaptiveNoise:boolean,noiseLookback:number,trendMaPeriod:number,holdDays:number) =>
  ({kind:'volatility_breakout',k,useAdaptiveNoise,noiseLookback,trendMaPeriod,holdDays} as const);
export const STRATEGY_CATALOG = {
  volatility_breakout: {title:'윌리엄스 변동성 돌파', buyWhen:'상승 추세에서 당일 가격이 시가 대비 전일 변동폭의 k배 목표가를 돌파하면 사요.',
    sellWhen:'설정한 보유 거래일이 지나면 다음 시가에 팔아요.', cautionRegime:'윗꼬리가 잦은 횡보장에서는 돌파 직후 되밀릴 수 있어요.',
    fields:['open','high','low','close'], environments:{daily:true,demo:false,kisPaper:false},
    presets:{conservative:breakout(0.6,true,20,60,1), basic:breakout(0.5,false,20,20,1), aggressive:breakout(0.4,false,10,5,2)}},
  ma_crossover:{title:'이동평균 교차',buyWhen:'단기선이 장기선을 위로 넘을 때 사요.', sellWhen:'단기선이 장기선 아래로 내려가면 팔아요.', cautionRegime:'횡보장에서는 교차가 자주 반복돼요.',
    fields:['close'],optionalFields:['volume'], environments:{daily:true,demo:'거래량 필터 끔',kisPaper:'필터 없는 SMA(장기 100 이하)는 실시간 체결가, 필터·EMA·오버레이는 확정 일봉 기반'}, presets:{conservative:maPreset(20,60),basic:maPreset(5,20),aggressive:maPreset(3,10)}},
  donchian_breakout:{title:'돈키안 돌파',buyWhen:'거래량이 늘면서 이전 고점에 도달하면 사요.',sellWhen:'종가가 최근 저점까지 내려오면 팔아요.',cautionRegime:'횡보장에서는 돌파 직후 되밀릴 수 있어요.',
    fields:['close','high','low','volume'],environments:{daily:true,demo:false,kisPaper:'확정 일봉 기반'},presets:{conservative:channel(55,20,1.5),basic:channel(20,10,1),aggressive:channel(10,5,0.8)}},
  rsi2_pullback:{title:'RSI 단기 눌림목',buyWhen:'장기 상승 추세에서 단기 과매도가 나타나면 사요.',sellWhen:'단기 평균이나 RSI가 회복되거나 보유 기한이 되면 팔아요.',cautionRegime:'추세가 꺾이면 과매도가 오래 이어질 수 있어요.',
    fields:['close'],environments:{daily:true,demo:true,kisPaper:'확정 일봉 기반'},presets:{conservative:pullback(5,200),basic:pullback(10,200),aggressive:pullback(20,60)}},
  macd_momentum: {
    title:'MACD 히스토그램', buyWhen:'히스토그램이 양수로 전환하고 설정한 제로선 조건을 충족하면 사요.', sellWhen:'히스토그램이 음수로 전환하면 팔아요.', cautionRegime:'횡보장에서는 잦은 교차가 나타나요.',
    fields:['close'], environments:{daily:true, demo:true, kisPaper:'확정 일봉 기반'},
    presets:{
      conservative: {kind:'macd_momentum', fastPeriod:12, slowPeriod:26, signalPeriod:9, requireZeroLineAbove:true},
      basic: {kind:'macd_momentum', fastPeriod:12, slowPeriod:26, signalPeriod:9, requireZeroLineAbove:false},
      aggressive: {kind:'macd_momentum', fastPeriod:8, slowPeriod:17, signalPeriod:9, requireZeroLineAbove:false},
    },
  },
  adx_dmi_trend: {
    title:'ADX·DMI 추세', buyWhen:'+DI가 우세하고 상승 중인 ADX가 기준 이상이면 사요.', sellWhen:'-DI가 +DI보다 높으면 팔아요.', cautionRegime:'추세가 형성된 뒤 신호가 나올 수 있어요.',
    fields:['close', 'high', 'low'], environments:{daily:true, demo:false, kisPaper:'확정 일봉 기반'},
    presets:{
      conservative: {kind:'adx_dmi_trend', diPeriod:14, adxThreshold:30},
      basic: {kind:'adx_dmi_trend', diPeriod:14, adxThreshold:25},
      aggressive: {kind:'adx_dmi_trend', diPeriod:10, adxThreshold:20},
    },
  },
  bollinger_squeeze: {
    title:'볼린저 스퀴즈', buyWhen:'최근 밴드 수축 후 거래량이 늘며 상단을 돌파하면 사요.', sellWhen:'종가가 중심선 아래면 팔아요.', cautionRegime:'거래량이 동반된 돌파도 되밀릴 수 있어요.',
    fields:['close', 'volume'], environments:{daily:true, demo:false, kisPaper:'확정 일봉 기반'},
    presets:{
      conservative: {kind:'bollinger_squeeze', period:20, stdDevMultiplier:2, squeezeLookback:60, squeezePercentile:20},
      basic: {kind:'bollinger_squeeze', period:20, stdDevMultiplier:2, squeezeLookback:60, squeezePercentile:25},
      aggressive: {kind:'bollinger_squeeze', period:20, stdDevMultiplier:1.8, squeezeLookback:40, squeezePercentile:35},
    },
  },
  ttm_squeeze: {
    title:'TTM 스퀴즈', buyWhen:'수축이 풀리며 양의 모멘텀이 커지면 사요.', sellWhen:'모멘텀이 음수이거나 양수에서 두 봉 연속 둔화하면 팔아요.', cautionRegime:'변동성 확대가 계속될지는 알 수 없어요.',
    fields:['close', 'high', 'low'], environments:{daily:true, demo:false, kisPaper:'확정 일봉 기반'},
    presets:{
      conservative: {kind:'ttm_squeeze', period:20, bbMult:2, kcMult:1.5},
      basic: {kind:'ttm_squeeze', period:20, bbMult:2, kcMult:1.5},
      aggressive: {kind:'ttm_squeeze', period:14, bbMult:1.8, kcMult:1.5},
    },
  },
  bollinger_percent_b: {
    title:'볼린저 %B 반등', buyWhen:'하단 과매도 이후 종가와 %B가 상승하고 RSI가 낮으면 사요.', sellWhen:'%B가 목표 수준 이상이면 팔아요.', cautionRegime:'하락 추세에서는 과매도가 이어질 수 있어요.',
    fields:['close'], environments:{daily:true, demo:true, kisPaper:'확정 일봉 기반'},
    presets:{
      conservative: {kind:'bollinger_percent_b', bbPeriod:20, bbStdDev:2.2, rsiPeriod:14, rsiOversold:30, exitPercentB:0.5},
      basic: {kind:'bollinger_percent_b', bbPeriod:20, bbStdDev:2, rsiPeriod:14, rsiOversold:35, exitPercentB:0.55},
      aggressive: {kind:'bollinger_percent_b', bbPeriod:14, bbStdDev:1.8, rsiPeriod:10, rsiOversold:40, exitPercentB:0.65},
    },
  },
  low_volume_pullback: {
    title:'거래량 고갈 눌림목', buyWhen:'상승 추세에서 거래량이 줄어든 눌림 뒤 양봉이 직전 고가를 넘으면 사요.', sellWhen:'종가가 단기선 아래이거나 직전 눌림 기간의 최저가 이하면 팔아요.', cautionRegime:'유동성이 적으면 거래량 감소를 해석하기 어려워요.',
    fields:['open', 'high', 'low', 'close', 'volume'], environments:{daily:true, demo:false, kisPaper:'확정 일봉 기반'},
    presets:{
      conservative: {kind:'low_volume_pullback', pullbackDays:4, maxVolumeRatio:0.55, trendFastMa:20, trendSlowMa:60},
      basic: {kind:'low_volume_pullback', pullbackDays:3, maxVolumeRatio:0.65, trendFastMa:20, trendSlowMa:60},
      aggressive: {kind:'low_volume_pullback', pullbackDays:2, maxVolumeRatio:0.75, trendFastMa:10, trendSlowMa:40},
    },
  },
  disparity_reversion: {
    title:'이격도 복원', buyWhen:'이격도가 낮고 종가가 봉 범위의 40% 이상에서 마감하면 사요.', sellWhen:'목표 이격도를 회복하거나 진입가 대비 손절 기준에 닿으면 팔아요.', cautionRegime:'다음 봉 시가가 손절 기준보다 낮을 수 있어요.',
    fields:['close', 'high', 'low'], environments:{daily:true, demo:false, kisPaper:'확정 일봉 기반'},
    presets:{
      conservative: {kind:'disparity_reversion', maPeriod:20, buyDisparity:91, sellDisparity:99, stopLossPct:4},
      basic: {kind:'disparity_reversion', maPeriod:20, buyDisparity:93, sellDisparity:99.5, stopLossPct:5},
      aggressive: {kind:'disparity_reversion', maPeriod:15, buyDisparity:95, sellDisparity:100.5, stopLossPct:6},
    },
  },
} as const;
