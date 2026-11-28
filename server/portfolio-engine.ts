import type {PortfolioResult, PortfolioSnapshot} from '../shared/backtest.ts';
import {portfolioCodes, portfolioWarmup, targetWeights} from '../shared/portfolio-rules.ts';
import {fee, unitsAt} from './engine.ts';

export function backtestPortfolio(legs:Pick<PortfolioSnapshot['legs'][number],'code'|'bars'>[], input:PortfolioSnapshot['input']):PortfolioResult {
  const {rule,capital,feeBps,slippageBps} = input;
  function affordableUnits(budget:number,price:number) {
    const candidate = unitsAt(budget,price,feeBps);
    if (!Number.isSafeInteger(candidate)) throw new Error('정수 수량 계산 범위를 벗어났습니다.');
    const cost = (qty:number) => qty*price + fee(qty*price,feeBps);
    if (cost(candidate) <= budget) return candidate;
    // A rounded-up fee can exceed the value of several fractional-price shares.
    let low = 0, high = candidate;
    while (low < high) {
      const mid = low + Math.ceil((high-low)/2);
      if (cost(mid) <= budget) low = mid;
      else high = mid-1;
    }
    return low;
  }
  const slip = slippageBps / 10000;
  const bars = legs[0].bars;
  const warmup = portfolioWarmup(rule);
  if (bars.length <= warmup) throw new Error(`판정과 다음 봉 체결에 최소 ${warmup+1}봉이 필요합니다.`);
  const holdings = portfolioCodes(rule).map(code => ({
    code, bars:legs.find(leg => leg.code === code)!.bars, qty:0, benchmarkQty:0,
  }));
  for (const asset of holdings) {
    for (const {date,open,high,low,close} of asset.bars) {
      if (![open,high,low,close].every(v=>Number.isFinite(v) && v>0) ||
          low > Math.min(open,close) || high < Math.max(open,close)) {
        throw new Error(`잘못된 OHLC 가격입니다 (${asset.code} · ${date}).`);
      }
    }
  }
  let cash = capital, benchmarkCash = capital, fees = 0, slippageCost = 0;
  for (const asset of holdings) {
    if (asset.code === rule.safeAsset) continue;
    const price = asset.bars[0].open * (1+slip);
    asset.benchmarkQty = affordableUnits(capital/rule.assets.length,price);
    const amount = asset.benchmarkQty*price;
    benchmarkCash -= amount+fee(amount,feeBps);
  }
  const equity:number[] = [], benchmarkEquity:number[] = [];
  const trades:PortfolioResult['trades'] = [], rebalances:PortfolioResult['rebalances'] = [];
  for (let i=0; i<bars.length; i++) {
    if (i >= warmup && (i-warmup)%rule.rebalanceDays === 0) {
      const {weights,reason} = targetWeights(legs,i-1,rule);
      const dates = {date:bars[i].date,signalDate:bars[i-1].date};
      const value = holdings.reduce((sum,a) => sum+a.qty*a.bars[i].open,cash);
      const targets = holdings.map(asset => affordableUnits(value*weights[asset.code],asset.bars[i].open*(1+slip)));
      rebalances.push({...dates,targets:holdings.map(({code}) => ({code,weight:weights[code]})),reason});
      for (const side of ['sell','buy'] as const) {
        for (const [index,asset] of holdings.entries()) {
          const open = asset.bars[i].open;
          const price = open*(side === 'sell' ? 1-slip : 1+slip);
          const diff = targets[index]-asset.qty;
          const qty = side === 'sell' ? -diff : Math.min(diff,affordableUnits(cash,price));
          if (qty <= 0) continue;
          const amount = qty*price, cost = fee(amount,feeBps);
          asset.qty += side === 'sell' ? -qty : qty;
          cash += side === 'sell' ? amount-cost : -(amount+cost);
          if (cash < 0) throw new Error('거래 비용을 충당할 현금이 부족합니다.');
          fees += cost;
          slippageCost += qty*Math.abs(price-open);
          trades.push({...dates,code:asset.code,bar:i,side,price,qty,fee:cost,reason});
        }
      }
    }
    equity.push(holdings.reduce((sum,a) => sum+a.qty*a.bars[i].close,cash));
    benchmarkEquity.push(holdings.reduce((sum,a) => sum+a.benchmarkQty*a.bars[i].close,benchmarkCash));
  }
  function summary(curve:number[]) {
    let peak = capital, maxDrawdown = 0;
    for (const value of curve) {
      peak = Math.max(peak,value);
      maxDrawdown = Math.max(maxDrawdown,(peak-value)/peak*100);
    }
    const finalEquity = curve[curve.length-1];
    return {returnPct:(finalEquity/capital-1)*100,maxDrawdown,finalEquity};
  }
  return {...summary(equity),equity,trades,rebalances,fees,slippageCost,benchmark:summary(benchmarkEquity),
    source:'KIS 저장 일봉 · 다음 봉 시가 체결 가정 · 세금 미포함 · 벤치마크: 위험 자산 동일 비중 첫 시가 보유'};
}
