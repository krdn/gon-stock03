import {advanceTick} from '../server/engine.ts';
import {initialState} from '../shared/fixtures.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {test} from 'node:test';
import {addDays} from '../shared/market-data.ts';
import {dailyPortfolioBacktestInput,portfolioResultSchema,portfolioSnapshotSchema,singleExperimentListSchema} from '../shared/backtest.ts';
import {portfolioCodes,portfolioOnly,portfolioRuleSchema,targetWeights,type PortfolioRule} from '../shared/portfolio-rules.ts';
import {strategyInput} from '../shared/contracts.ts';
import {planLimits} from '../shared/trading-plan.ts';
import {Store} from '../server/store.ts';
import {backtestPortfolio} from '../server/portfolio-engine.ts';
import {createExperiment,replayExperiment} from '../server/backtest.ts';
import {fixTradingDraft,saveTradingDraft} from '../server/trading-plans.ts';
import {KisClient} from '../server/kis.ts';
import {dailyFixture} from './backtest-fixture.ts';
import {startTestServer} from './test-server.ts';

const assets = ['069500','005930'], safeAsset = '00088K';
const dual:PortfolioRule = {kind:'dual_momentum',assets,safeAsset,lookbackDays:20,rebalanceDays:5};
const faber:PortfolioRule = {kind:'faber_gtaa',assets,safeAsset,smaPeriod:200,rebalanceDays:20};
function fixture(rule:PortfolioRule = dual) {
  const base = dailyFixture();
  const dates:string[] = [];
  for (let i=0; dates.length<260; i++) {
    const weekday = (3+i)%7;
    if (weekday>0 && weekday<6) dates.push(addDays('20250101',i));
  }
  const legs = portfolioCodes(rule).map((code,index) => {
    const collection = {...base.run,id:randomUUID(),code,from:dates[0],to:dates[259],triggerSource:'manual_sync' as const,
      calendar:{source:'https://example.test/calendar',dates}};
    const bars = dates.map((date,i) => {
      const close = index === 2 ? 70 : (index === 0 && i > 25 ? 155-i/2 : 100+i);
      return {...base.bars[0],date,code,open:close+3,close,high:close+5,low:close-1};
    });
    return {code,collection,bars};
  });
  const input = dailyPortfolioBacktestInput.parse({runs:legs.map(l => ({code:l.code,runId:l.collection.id})),
    source:'kis-rest',from:dates[0],to:dates[259],adjustment:'raw',capital:100000,feeBps:10,slippageBps:5,rule});
  return {legs,input,dates};
}

test('260봉 듀얼·GTAA 목표와 종가 판정·다음 시가 체결·비용 및 벤치마크', () => {
  const {legs,input,dates} = fixture();
  assert.equal(targetWeights(legs,20,dual).weights[assets[0]],1);
  assert.equal(targetWeights(legs,20,{...dual,assets:[...assets].reverse()}).weights[assets[1]],1);
  for (const rule of [dual,faber]) {
    const flat = legs.map(l => ({...l,bars:l.bars.map(b => ({...b,close:100}))}));
    assert.equal(targetWeights(flat,200,rule).weights[safeAsset],1);
    assert.ok(Object.values(targetWeights(flat,200,{...rule,safeAsset:null}).weights).every(w=>w===0));
    const result = backtestPortfolio(legs,{...input,rule});
    portfolioResultSchema.parse(result);
    const first = rule.kind === 'dual_momentum' ? 20 : 199;
    assert.deepEqual(result.rebalances.map(r=>r.signalDate),dates.filter((_,i)=>i>=first && i<=258 && (i-first)%rule.rebalanceDays===0));
    assert.equal(result.rebalances[0].date,dates[first+1]);
    if (rule.kind === 'faber_gtaa') assert.deepEqual(result.rebalances[0].targets.map(t=>t.weight),[0,0.5,0.5]);
    let cash = input.capital;
    for (const tr of result.trades) {
      const open = legs.find(l=>l.code===tr.code)!.bars[tr.bar].open;
      assert.equal(tr.price,open*(1+(tr.side==='buy'?1:-1)*0.0005));
      assert.equal(tr.signalDate,dates[tr.bar-1]);
      assert.ok(Number.isInteger(tr.qty) && tr.qty>0);
      cash += (tr.side === 'sell' ? 1 : -1)*tr.qty*tr.price-tr.fee;
      assert.ok(cash>=0);
    }
    if (rule.kind === 'dual_momentum') {
      const sale = result.trades.find(t=>t.side==='sell' && result.trades.some(other=>other.bar===t.bar && other.side==='buy'))!;
      assert.deepEqual(result.trades.filter(t=>t.date===sale.date).map(t=>t.side),['sell','buy']);
    }
    const qty = Math.floor(50000/(103*1.0005*1.001));
    const spend = qty*(103*1.0005);
    const residual = input.capital-2*(spend+Math.ceil(spend*0.001));
    const curve = dates.map((_,i)=>residual+qty*legs[0].bars[i].close+qty*legs[1].bars[i].close);
    let peak = input.capital, dd = 0;
    for (const v of curve) {peak=Math.max(peak,v);dd=Math.max(dd,(peak-v)/peak*100);}
    assert.equal(result.benchmark.finalEquity,curve[259]);
    assert.equal(result.benchmark.returnPct,(curve[259]/input.capital-1)*100);
    assert.equal(result.benchmark.maxDrawdown,dd);
    const prefix = backtestPortfolio(legs.map(l=>({...l,bars:l.bars.slice(0,220)})),{...input,rule});
    assert.deepEqual(prefix.equity,result.equity.slice(0,220));
    assert.deepEqual(prefix.trades,result.trades.filter(t=>t.bar<220));
  }
  assert.throws(()=>backtestPortfolio(legs.map(l=>({...l,bars:l.bars.slice(0,21)})),input),/최소 22봉/);
});

test('안전자산 없는 하락장에서는 현금을 보유하고 양수 신호 유지 시 비용 포함 목표를 재계산한다', () => {
  for (const rule of [dual,faber]) {
    const {input,legs} = fixture({...rule,safeAsset:null});
    const falling = legs.map(l=>({...l,bars:l.bars.map((b,i)=>({...b,close:500-i}))}));
    const result = backtestPortfolio(falling,input);
    assert.deepEqual(result.trades,[]);
    assert.ok(result.equity.every(value=>value===input.capital));
  }
  const {input,legs} = fixture();
  const rising = legs.map(l=>({...l,bars:l.bars.slice(0,27).map((b,i)=>({...b,open:i===26 ? 105 : 100,close:100+i}))}));
  const result = backtestPortfolio(rising,input);
  assert.deepEqual(result.trades.map(tr=>[tr.side,tr.qty]),[['buy',998],['sell',2]]);
});

test('소수 시가의 원 단위 수수료도 가용 현금을 넘기지 않는다', () => {
  const {legs,input} = fixture();
  const cheap = legs.map(l => ({...l,bars:l.bars.slice(0,22).map((b,i) => ({...b,open:0.01,close:0.01+i*0.0001}))}));
  const {trades} = backtestPortfolio(cheap,input);
  assert.equal(trades.length,1);
  const {price,qty,fee} = trades[0];
  assert.ok(price*qty+fee <= input.capital);
  const next = price*(qty+1);
  assert.ok(next+Math.ceil(next*input.feeBps/10000) > input.capital);
});

test('코드 집합·정규 정렬·재생·혼합 목록과 pruning', () => {
  const {legs,input} = fixture();
  assert.ok(!dailyPortfolioBacktestInput.safeParse({...input,runs:input.runs.slice(1)}).success);
  assert.ok(!dailyPortfolioBacktestInput.safeParse({...input,runs:input.runs.map(()=>input.runs[0])}).success);
  assert.ok(!portfolioRuleSchema.safeParse({...dual,safeAsset:assets[0]}).success);
  const store = new Store(':memory:');
  try {
    const base = dailyFixture(); store.saveDaily(base.run,base.bars);
    const v1 = createExperiment(store,base.input);
    const {fast,slow,...common} = base.input;
    const v2 = createExperiment(store,{...common,rule:{kind:'ma_crossover',maType:'sma',fast,slow}});
    legs.forEach(l => store.saveDaily(l.collection,l.bars));
    const exp = createExperiment(store,input);
    assert.equal(createExperiment(store,{...input,runs:[...input.runs].reverse()}).id,exp.id);
    const snapshot = portfolioSnapshotSchema.parse(exp.snapshot);
    assert.deepEqual(snapshot.legs.map(l=>l.code),portfolioCodes(dual).sort());
    assert.deepEqual(snapshot.input.rule.assets,assets);
    assert.deepEqual(portfolioSnapshotSchema.parse({...snapshot,legs:[...legs].reverse()}),snapshot);
    assert.ok(!portfolioSnapshotSchema.safeParse({...snapshot,legs:legs.slice(1)}).success);
    assert.equal(store.experiments().find(e=>e.id===exp.id)?.bars,260);
    assert.deepEqual(new Set(singleExperimentListSchema.parse({experiments:store.experiments()}).experiments.map(e=>e.id)),new Set([v1.id,v2.id]));
    for (const l of legs) {
      store.saveDaily({...l.collection,id:randomUUID(),startedAt:'2026-01-25T01:00:00.000Z'},l.bars);
      assert.equal(store.dailyBars(l.collection.id).length,260);
    }
    for (const e of [v1,v2,exp]) assert.equal(replayExperiment(store,e.id).matches,true);
  } finally {store.close();}
});

test('개별 봉 누락 및 서로 다른 달력 길이·동일 길이 날짜 불일치 거부', () => {
  for (const kind of ['bar','calendar','shift']) {
    const {legs,input,dates} = fixture();
    const target = legs[0];
    target.bars.splice(100,1);
    if (kind !== 'bar') target.collection.calendar.dates = dates.filter((_,i)=>i!==100);
    if (kind === 'shift') {
      // One otherwise valid leg omits a different day from the other two.
      for (const l of legs.slice(1)) {
        l.bars.splice(101,1);
        l.collection.calendar.dates = dates.filter((_,i)=>i!==101);
      }
    }
    const store = new Store(':memory:');
    try {
      legs.forEach(l=>store.saveDaily(l.collection,l.bars));
      assert.throws(()=>createExperiment(store,input),new RegExp('바스켓 종목의 거래일 달력이 일치하지 않습니다.*'+target.code+'.*'+dates[100]));
    } finally {store.close();}
  }
});

test('잘못 활성화된 DEMO 바스켓만 정지하고 다음 전략의 tick을 계속 처리한다', () => {
  const state = initialState();
  const strategy = {id:'basket',code:assets[0],name:'fixture',lastSignal:'hold' as const,lastTick:-1,qty:1,active:true,fast:5,slow:20};
  state.strategies = [{...strategy,rule:dual},{...strategy,id:'single'}];
  advanceTick(state);
  assert.equal(state.strategies[0].active,false);
  assert.equal(state.strategies[1].lastTick,state.tick);
});

test('바스켓 전체 마스터 검사와 DEMO·모의 실행·초안·고정 차단', async () => {
  const directory = mkdtempSync(join(tmpdir(),'portfolio-test-'));
  const store = new Store(join(directory,'fixture.sqlite'));
  let sent = 0;
  const kis = new KisClient({key:'',secret:'',account:'',product:''},async()=>{sent++;throw Error('unexpected transport');},0);
  const api = await startTestServer(store,kis);
  async function post(path:string,body:unknown) {
    const response = await fetch(api.url+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Workbench':'local'},body:JSON.stringify(body)});
    return {status:response.status,data:await response.json()};
  }
  try {
    const strategy = {name:'포트폴리오',code:assets[0],qty:1,fast:5,slow:20,rule:dual};
    assert.ok(!strategyInput.safeParse({...strategy,code:assets[1]}).success);
    assert.ok(!strategyInput.safeParse({...strategy,overlay:{}}).success);
    assert.equal((await post('strategies',strategy)).data.error,portfolioOnly);
    assert.equal((await post('backtest',{...fixture().input,code:assets[0]})).data.error,portfolioOnly);
    assert.equal((await post('backtest/daily',{...dailyFixture().input,rule:dual})).status,400);
    const paper = {...strategy,environment:'kis-paper'};
    const rows = portfolioCodes(dual).map(code=>({code,name:code,exchange:'KOSPI' as const,kind:'etf' as const,isin:'KR7000000000',group:'EF',tradingHalted:false,liquidation:false}));
    const master = {exchange:'KOSPI' as const,source:'fixture',collectedAt:new Date().toISOString(),sha256:'a'.repeat(64),rows};
    for (const invalid of [{group:'XX'},{tradingHalted:true},{liquidation:true}]) {
      for (const code of portfolioCodes(dual)) {
        store.saveMasters([{...master,rows:rows.map(r=>r.code===code?{...r,...invalid}:r)}]);
        assert.equal((await post('strategies',paper)).status,400);
      }
    }
    store.saveMasters([master]);
    assert.equal((await post('strategies',paper)).status,200);
    const saved = store.read().strategies.at(-1)!;
    assert.equal((await post('kis/strategies/run',{id:saved.id,active:true})).data.error,portfolioOnly);
    const terms = {kind:'strategy' as const,strategyId:saved.id,revision:1,startsAt:'2099-01-05T09:00:00+09:00',endsAt:'2099-01-09T15:00:00+09:00',
      maxOrderAmount:100000,maxTotalAmount:100000,maxAttempts:1,sellPolicy:'deny' as const};
    assert.throws(()=>saveTradingDraft(store,{expectedId:null,terms}),{message:portfolioOnly});
    const id = randomUUID();
    store.changeTradingPlan('strategy',null,()=>({draft:{id,terms,limits:planLimits(store.read()),fixed:false}}));
    assert.throws(()=>fixTradingDraft(store,kis,{kind:'strategy',expectedId:id}),{message:portfolioOnly});
    assert.equal(store.tradingPlan('strategy')?.draft.fixed,false);
    assert.equal(sent,0);
  } finally {await api.close();store.close();rmSync(directory,{recursive:true,force:true});}
});
