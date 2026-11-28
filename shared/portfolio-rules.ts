import { atr, sma } from './indicators.ts';
import { z } from 'zod';
import { masterCodeSchema } from './market-data.ts';

const common = {
  assets: z.array(masterCodeSchema).min(2).max(6),
  safeAsset: masterCodeSchema.nullable(),
  rebalanceDays: z.int().min(5).max(60),
};
export const portfolioRuleSchema = z.discriminatedUnion('kind', [
  z.strictObject({kind:z.literal('dual_momentum'), ...common, lookbackDays:z.int().min(20).max(252)}),
  z.strictObject({kind:z.literal('faber_gtaa'), ...common, smaPeriod:z.int().min(20).max(250)}),
  z.strictObject({kind:z.literal('krx_sector_rs'), ...common,
    rsLookbackDays:z.int().min(10).max(120), topK:z.int().min(1).max(5), maxWeightPct:z.int().min(20).max(100)}),
  z.strictObject({kind:z.literal('clenow_momentum'), ...common,
    regressionDays:z.int().min(20).max(252), atrPeriod:z.int().min(10).max(60), regimeSmaPeriod:z.int().min(20).max(250),
    topK:z.int().min(1).max(5), riskPerAssetBps:z.int().min(5).max(100)}),
  z.strictObject({kind:z.literal('price_regime'), ...common,
    trendSmaPeriod:z.int().min(20).max(250), volLookback:z.int().min(10).max(60),
    maxAnnualVolPct:z.int().min(5).max(80), cautionExposurePct:z.int().min(0).max(100)}),
]).refine(rule => new Set(portfolioCodes(rule)).size === portfolioCodes(rule).length, '바스켓 종목이 중복됩니다.');
export type PortfolioRule = z.infer<typeof portfolioRuleSchema>;
export function portfolioCodes(rule: {assets:string[], safeAsset:string|null}) {
  return rule.safeAsset ? [...rule.assets, rule.safeAsset] : [...rule.assets];
}
export function isPortfolioRule(rule: {kind:string} | undefined): rule is PortfolioRule {
  return !!rule && Object.hasOwn(PORTFOLIO_CATALOG,rule.kind);
}
export const portfolioOnly = '다종목 자산배분 전략은 저장 일봉 다종목 백테스트 전용입니다.';
const environments = { daily:true, demo:false, kisPaper:false } as const;
export const PORTFOLIO_CATALOG = {
  dual_momentum: {title:'ETF 듀얼 모멘텀', environments, presets:{
    conservative:{lookbackDays:120,rebalanceDays:20}, basic:{lookbackDays:60,rebalanceDays:20}, aggressive:{lookbackDays:20,rebalanceDays:10},
  }},
  faber_gtaa: {title:'파버 GTAA', environments, presets:{
    conservative:{smaPeriod:200,rebalanceDays:20}, basic:{smaPeriod:120,rebalanceDays:20}, aggressive:{smaPeriod:60,rebalanceDays:10},
  }},
  krx_sector_rs: {title:'KRX 섹터 상대강도', environments, presets:{
    conservative:{rsLookbackDays:60,topK:2,maxWeightPct:40,rebalanceDays:20},
    basic:{rsLookbackDays:20,topK:2,maxWeightPct:50,rebalanceDays:20},
    aggressive:{rsLookbackDays:10,topK:3,maxWeightPct:60,rebalanceDays:10},
  }},
  clenow_momentum: {title:'클레노우 회귀 모멘텀', environments, presets:{
    conservative:{regressionDays:120,atrPeriod:20,regimeSmaPeriod:200,topK:2,riskPerAssetBps:10,rebalanceDays:20},
    basic:{regressionDays:90,atrPeriod:20,regimeSmaPeriod:100,topK:2,riskPerAssetBps:20,rebalanceDays:20},
    aggressive:{regressionDays:60,atrPeriod:14,regimeSmaPeriod:60,topK:3,riskPerAssetBps:35,rebalanceDays:10},
  }},
  price_regime: {title:'가격 레짐 (매크로 대용)', environments, presets:{
    conservative:{trendSmaPeriod:200,volLookback:60,maxAnnualVolPct:20,cautionExposurePct:30,rebalanceDays:20},
    basic:{trendSmaPeriod:200,volLookback:20,maxAnnualVolPct:25,cautionExposurePct:50,rebalanceDays:20},
    aggressive:{trendSmaPeriod:100,volLookback:20,maxAnnualVolPct:35,cautionExposurePct:70,rebalanceDays:10},
  }},
};
export function portfolioWarmup(rule:PortfolioRule) {
  if (rule.kind === 'price_regime') return Math.max(rule.trendSmaPeriod, rule.volLookback + 1);
  if (rule.kind === 'krx_sector_rs') return rule.rsLookbackDays+1;
  if (rule.kind === 'clenow_momentum') return Math.max(rule.regressionDays,rule.regimeSmaPeriod,rule.atrPeriod+1);
  return rule.kind === 'dual_momentum' ? rule.lookbackDays + 1 : rule.smaPeriod;
}
type PriceBar = {high:number; low:number; close:number};
type Leg = {code:string; bars:readonly PriceBar[]};
type RotationRule = Extract<PortfolioRule,{kind:'krx_sector_rs'|'clenow_momentum'}>;

function validBar({low,close,high}:PriceBar) {
  return Number.isFinite(high) && low > 0 && low <= close && close <= high;
}

function regressionScore(closes:number[]) {
  const logs = closes.map(Math.log);
  const mean = sma(logs,logs.length);
  const mid = (logs.length-1)/2;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [i,y] of logs.entries()) {
    sxx += (i-mid)**2;
    syy += (y-mean)**2;
    sxy += (i-mid)*(y-mean);
  }
  if (sxx <= 0 || syy <= 0 || ![sxx,syy,sxy].every(Number.isFinite)) return 0;
  const beta = sxy/sxx;
  const r2 = sxy*sxy/(sxx*syy);
  return beta > 0 && Number.isFinite(r2) ? 252*beta*Math.min(1,Math.max(0,r2)) : 0;
}

function rotationCandidate(bars:readonly PriceBar[], t:number, rule:RotationRule) {
  if (t < portfolioWarmup(rule)-1 || !bars[t]) return;
  const close = bars[t].close;
  if (rule.kind === 'krx_sector_rs') {
    const window = bars.slice(t-rule.rsLookbackDays,t+1);
    if (!window.every(validBar)) return;
    const ret = close/window[0].close-1;
    const keep = close/Math.max(...window.slice(1).map(b=>b.high));
    if (ret > 0 && Number.isFinite(ret) && keep >= 0.9) return {score:ret*keep,atrPct:0};
  } else {
    const prefix = bars.slice(0,t+1);
    if (!prefix.every(validBar)) return;
    const closes = prefix.map(b=>b.close);
    if (close <= sma(closes,rule.regimeSmaPeriod)) return;
    const score = regressionScore(closes.slice(-rule.regressionDays));
    if (score > 0) return {score,atrPct:atr(prefix,rule.atrPeriod)/close};
  }
}

function rotationWeights(legs:readonly Leg[], t:number, rule:RotationRule, weights:Record<string,number>) {
  const winners = rule.assets.flatMap(code => {
    const candidate = rotationCandidate(legs.find(leg=>leg.code===code)?.bars ?? [],t,rule);
    return candidate ? [{code,...candidate}] : [];
  }).sort((a,b)=>b.score-a.score).slice(0,rule.topK);
  const sector = rule.kind === 'krx_sector_rs';
  if (!winners.length) {
    if (rule.safeAsset) weights[rule.safeAsset] = 1;
    return {weights,reason:sector ? '양의 상대강도·고점 유지 자산 없음' : '추세·양의 회귀 모멘텀 자산 없음'};
  }
  const equal = 1/winners.length;
  const raw = winners.map(({atrPct}) => {
    if (sector) return Math.min(equal,rule.maxWeightPct/100);
    const u = (rule.riskPerAssetBps/10000)/atrPct;
    return Number.isFinite(u) && u > 0 ? u : equal;
  });
  const total = raw.reduce((sum,w)=>sum+w,0);
  for (const [i,{code}] of winners.entries()) weights[code] = raw[i]/Math.max(1,total);
  if (rule.safeAsset) weights[rule.safeAsset] = Math.max(0,1-total);
  clampWeights(rule, weights);
  const codes = winners.map(w=>w.code).join(',');
  return {weights,reason:sector ? '상대강도 상위 '+codes+' (한도 '+rule.maxWeightPct+'%)' : '회귀 모멘텀 상위 '+codes+' (ATR 역가중)'};
}

function clampWeights(rule:PortfolioRule, weights:Record<string,number>) {
  // Integer-like codes can enumerate differently from the order in the result targets.
  for (const order of [portfolioCodes(rule), Object.keys(weights)]) {
    let allocated = 0;
    for (const code of order) {
      weights[code] = Math.min(weights[code],1-allocated);
      allocated += weights[code];
    }
  }
}

type PriceRegimeRule = Extract<PortfolioRule,{kind:'price_regime'}>;

function priceRegimeSignal(bars:readonly PriceBar[], t:number, rule:PriceRegimeRule) {
  const code = rule.assets[0];
  const warmup = portfolioWarmup(rule);
  const unavailable = {exposure:0, reason:'레짐 위험회피 · ' + code + ' 판정 자료 부족 또는 무효'};
  if (t < warmup - 1 || !bars[t]) return unavailable;
  const window = bars.slice(t - warmup + 1, t + 1);
  if (!window.every(validBar)) return unavailable;
  const closes = window.map(bar => bar.close);
  if (bars[t].close <= sma(closes, rule.trendSmaPeriod)) {
    return {exposure:0, reason:'레짐 위험회피 · ' + code + ' 종가≤SMA' + rule.trendSmaPeriod};
  }

  const prices = closes.slice(-rule.volLookback - 1);
  const returns = prices.slice(1).map((close, i) => close / prices[i] - 1);
  const mean = sma(returns, returns.length);
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  const vol = Math.sqrt(variance) * Math.sqrt(252) * 100;
  if (!Number.isFinite(vol)) return unavailable;

  const detail = code + ' 종가>SMA' + rule.trendSmaPeriod + ' · 연변동성 ' + vol.toFixed(1) + '%';
  if (vol <= rule.maxAnnualVolPct) {
    return {exposure:1, reason:'레짐 위험선호 · ' + detail + '≤' + rule.maxAnnualVolPct + '%'};
  }
  return {exposure:rule.cautionExposurePct / 100,
    reason:'레짐 경계 · ' + detail + '>' + rule.maxAnnualVolPct + '% · 위험 노출 ' + rule.cautionExposurePct + '%'};
}

function priceRegimeWeights(legs:readonly Leg[], t:number, rule:PriceRegimeRule) {
  const bars = legs.find(leg => leg.code === rule.assets[0])?.bars ?? [];
  const {exposure, reason} = priceRegimeSignal(bars, t, rule);
  const weights = Object.fromEntries(rule.assets.map(asset => [asset, exposure / rule.assets.length]));
  if (rule.safeAsset) weights[rule.safeAsset] = Math.max(0, 1 - exposure);
  clampWeights(rule, weights);
  return {weights, reason};
}

export function targetWeights(legs:readonly Leg[], t:number, rule:PortfolioRule) {
  if (rule.kind === 'price_regime') return priceRegimeWeights(legs, t, rule);
  const weights: Record<string,number> = Object.fromEntries(portfolioCodes(rule).map(code => [code,0]));
  if (rule.kind === 'krx_sector_rs' || rule.kind === 'clenow_momentum') return rotationWeights(legs,t,rule,weights);
  let winner = rule.safeAsset, best = 0, selected = 0;
  for (const code of rule.assets) {
    const bars = legs.find(leg => leg.code === code)!.bars;
    if (rule.kind === 'dual_momentum') {
      const momentum = bars[t].close / bars[t-rule.lookbackDays].close - 1;
      if (momentum > best) { best = momentum; winner = code; }
    } else {
      const mean = bars.slice(t-rule.smaPeriod+1,t+1).reduce((sum,b) => sum+b.close,0) / rule.smaPeriod;
      if (bars[t].close > mean) { weights[code] = 1/rule.assets.length; selected++; }
    }
  }
  if (rule.kind === 'dual_momentum') {
    if (winner) weights[winner] = 1;
    return {weights,reason:best > 0 ? '양의 모멘텀 1위 ' + winner : '양의 모멘텀 없음'};
  }
  if (rule.safeAsset) weights[rule.safeAsset] = (rule.assets.length-selected)/rule.assets.length;
  return {weights, reason:'종가가 이동평균을 초과한 위험 자산 ' + selected + '종'};
}
