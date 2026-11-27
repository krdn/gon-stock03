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
]).refine(rule => new Set(portfolioCodes(rule)).size === portfolioCodes(rule).length, '바스켓 종목이 중복됩니다.');
export type PortfolioRule = z.infer<typeof portfolioRuleSchema>;
export function portfolioCodes(rule: {assets:string[], safeAsset:string|null}) {
  return rule.safeAsset ? [...rule.assets, rule.safeAsset] : [...rule.assets];
}
export function isPortfolioRule(rule: {kind:string} | undefined): rule is PortfolioRule {
  return rule?.kind === 'dual_momentum' || rule?.kind === 'faber_gtaa';
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
};
export function portfolioWarmup(rule:PortfolioRule) {
  return rule.kind === 'dual_momentum' ? rule.lookbackDays + 1 : rule.smaPeriod;
}
export function targetWeights(legs: readonly {code:string, bars:readonly {close:number}[]}[], t:number, rule:PortfolioRule) {
  const weights: Record<string,number> = Object.fromEntries(portfolioCodes(rule).map(code => [code,0]));
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
