import {editorDraftFromTransfer,formFromRule,parseTransferDraft} from '../src/pages/research-rule-form.ts';
import {advanceTick} from '../server/engine.ts';
import {initialState} from '../shared/fixtures.ts';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {test} from 'node:test';
import {addDays} from '../shared/market-data.ts';
import {dailyPortfolioBacktestInput,portfolioResultSchema,portfolioSnapshotSchema,singleExperimentListSchema} from '../shared/backtest.ts';
import {PORTFOLIO_CATALOG,portfolioWarmup,portfolioCodes,portfolioOnly,portfolioRuleSchema,targetWeights,type PortfolioRule} from '../shared/portfolio-rules.ts';
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
const sector = {kind:'krx_sector_rs',assets,safeAsset,...PORTFOLIO_CATALOG.krx_sector_rs.presets.conservative} as const;
const clenow = {kind:'clenow_momentum',assets,safeAsset,...PORTFOLIO_CATALOG.clenow_momentum.presets.conservative} as const;
function fixture(rule:PortfolioRule = dual) {
  const base = dailyFixture();
  const dates:string[] = [];
  for (let i=0; dates.length<260; i++) {
    const weekday = (3+i)%7;
    if (weekday>0 && weekday<6) dates.push(addDays('20250101',i));
  }
  const legs = portfolioCodes(rule).map((code,index) => {
    const collection = {...base.run,id:'00000000-0000-4000-8000-00000000000'+index,code,from:dates[0],to:dates[259],triggerSource:'manual_sync' as const,
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
    const falling = legs.map(l=>({...l,bars:l.bars.map((b,i)=>({...b,close:500-i,high:600,low:1}))}));
    const result = backtestPortfolio(falling,input);
    assert.deepEqual(result.trades,[]);
    assert.ok(result.equity.every(value=>value===input.capital));
  }
  const {input,legs} = fixture();
  const rising = legs.map(l=>({...l,bars:l.bars.slice(0,27).map((b,i)=>({...b,low:1,high:200,open:i===26 ? 105 : 100,close:100+i}))}));
  const result = backtestPortfolio(rising,input);
  assert.deepEqual(result.trades.map(tr=>[tr.side,tr.qty]),[['buy',998],['sell',2]]);
});

test('소수 시가의 원 단위 수수료도 가용 현금을 넘기지 않는다', () => {
  const {legs,input} = fixture();
  const cheap = legs.map(l => ({...l,bars:l.bars.slice(0,22).map((b,i) => ({...b,high:0.02,low:0.01,open:0.01,close:0.01+i*0.0001}))}));
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
    const oldFaber = createExperiment(store,{...input,rule:faber});
    const rotations = [sector,clenow].map(rule=>createExperiment(store,{...input,rule}));
    // Captured from af0a65e with these fixture run IDs.
    assert.deepEqual([v1,v2,exp,oldFaber].map(e=>[e.inputHash,createHash('sha256').update(JSON.stringify(e.result)).digest('hex')]),[
      ['250f7976c8002efc246c4f1333a20a732c05899cb972faacbef30356cef4d0e4','de6678fb43545d5a36ce18179bb8d78fc03d9f2adf417ab2145e70791c67e5a7'],
      ['f40d68ca7e3be93c5ae36be9092fc9454bd9416cca13d38dc350108dd261117a','bd8a82457ff1e58f66ff644b2b27eeb0b2e4252baae6abeed9e263c320832d71'],
      ['9a46a90c03160db1b4811ae5214774d9a78e74d957ac56318148f89cedf74a98','de477f99df9203c9ab52eb768af8c26d9cb7a51c02dc9ca70a2874eb085dbd28'],
      ['08234c5fb632ad9150ba6d86b2fd1dca1bc199e3de2a49536a3ae2767313ea83','74baff423e88eb6438731723f52e9154853d8804a824bf54f1d866afbfc5bc8a'],
    ]);
    for (const l of legs) {
      store.saveDaily({...l.collection,id:randomUUID(),startedAt:'2026-01-25T01:00:00.000Z'},l.bars);
      assert.equal(store.dailyBars(l.collection.id).length,260);
    }
    for (const e of [v1,v2,exp,oldFaber,...rotations]) assert.equal(replayExperiment(store,e.id).matches,true);
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

for (const rule of [dual,sector,clenow]) test(rule.kind+' 잘못 활성화된 DEMO 바스켓만 정지하고 다음 전략의 tick을 계속 처리한다', () => {
  const state = initialState();
  const strategy = {id:'basket',code:assets[0],name:'fixture',lastSignal:'hold' as const,lastTick:-1,qty:1,active:true,fast:5,slow:20};
  state.strategies = [{...strategy,rule},{...strategy,id:'single'}];
  advanceTick(state);
  assert.equal(state.strategies[0].active,false);
  assert.equal(state.strategies[1].lastTick,state.tick);
});

for (const rule of [dual,sector,clenow]) test(rule.kind+' 바스켓 전체 마스터 검사와 DEMO·모의 실행·초안·고정 차단', async () => {
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
    const strategy = {name:'포트폴리오',code:assets[0],qty:1,fast:5,slow:20,rule};
    assert.ok(!strategyInput.safeParse({...strategy,code:assets[1]}).success);
    assert.ok(!strategyInput.safeParse({...strategy,overlay:{}}).success);
    assert.equal((await post('strategies',strategy)).data.error,portfolioOnly);
    assert.equal((await post('backtest',{...fixture(rule).input,code:assets[0]})).data.error,portfolioOnly);
    assert.equal((await post('backtest/daily',{...dailyFixture().input,rule})).status,400);
    const paper = {...strategy,environment:'kis-paper'};
    const rows = portfolioCodes(rule).map(code=>({code,name:code,exchange:'KOSPI' as const,kind:'etf' as const,isin:'KR7000000000',group:'EF',tradingHalted:false,liquidation:false}));
    const master = {exchange:'KOSPI' as const,source:'fixture',collectedAt:new Date().toISOString(),sha256:'a'.repeat(64),rows};
    for (const invalid of [{group:'XX'},{tradingHalted:true},{liquidation:true}]) {
      for (const code of portfolioCodes(rule)) {
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

test('상대강도 수익률·고점 경계, 동률과 상한 잔여분', () => {
  const rule = {...sector,rsLookbackDays:10};
  const prices = (code:string,base:number,high:number) => ({code,bars:Array.from({length:11},(_,i)=>({
    close:i===0 ? base : 90, high:i===0 ? 200 : high, low:1,
  }))});
  const legs = [...assets].reverse().map(code=>prices(code,80,100));
  const both = targetWeights(legs,10,rule);
  assert.equal(both.reason,'상대강도 상위 '+assets.join(',')+' (한도 40%)');
  assert.deepEqual(assets.map(c=>both.weights[c]),[0.4,0.4]);
  assert.ok(Math.abs(both.weights[safeAsset]-0.2)<1e-15);
  assert.equal(targetWeights(legs,10,{...rule,topK:1}).weights[assets[0]],0.4);
  for (const invalid of [prices(assets[1],90,100),prices(assets[1],80,100.01),prices(assets[1],80,Infinity)]) {
    const one = targetWeights([invalid,legs[1]],10,rule);
    assert.equal(one.weights[assets[0]],0.4);
    assert.equal(one.weights[safeAsset],0.6);
  }
  for (const safe of [safeAsset,null]) {
    const none = targetWeights(assets.map(c=>prices(c,90,100)),10,{...rule,safeAsset:safe});
    assert.equal(none.reason,'양의 상대강도·고점 유지 자산 없음');
    assert.equal(none.weights[safeAsset],safe ? 1 : undefined);
  }
});

test('로그 회귀 순위·추세·ATR 역가중 및 정규화', () => {
  const rule = {...clenow,regressionDays:20,regimeSmaPeriod:20,atrPeriod:10,riskPerAssetBps:100};
  function series(code:string,slope:number,width:number) {
    return {code,bars:Array.from({length:20},(_,i)=>{
      const close = 100*Math.exp(slope*i);
      return {close,high:close+width,low:close-width};
    })};
  }
  for (const width of [0.1,10]) {
    const legs = [series(assets[1],0.0001,width*2),series(assets[0],0.0002,width)];
    const raw = [legs[1],legs[0]].map(l=>0.01*l.bars[19].close/(l.bars[19].high-l.bars[19].low));
    const total = raw[0]+raw[1];
    for (const safe of [safeAsset,null]) {
      const {weights,reason} = targetWeights(legs,19,{...rule,safeAsset:safe});
      assert.equal(reason,'회귀 모멘텀 상위 '+assets.join(',')+' (ATR 역가중)');
      for (const [i,c] of assets.entries()) assert.ok(Math.abs(weights[c]-raw[i]/Math.max(1,total))<1e-12);
      if (safe) assert.ok(Math.abs(weights[safe]-Math.max(0,1-total))<1e-12);
      assert.ok(Object.values(weights).reduce((a,b)=>a+b,0)<=1);
    }
    assert.equal(targetWeights(legs,19,{...rule,topK:1}).weights[assets[1]],0);
  }
  const tied = [...assets].reverse().map(c=>series(c,0.001,1));
  assert.equal(targetWeights(tied,19,{...rule,topK:1}).weights[assets[1]],0);
  for (const slope of [0,-0.02]) {
    const legs = assets.map(c=>series(c,slope,1));
    for (const safe of [safeAsset,null]) {
      const r = targetWeights(legs,19,{...rule,safeAsset:safe});
      assert.equal(r.reason,'추세·양의 회귀 모멘텀 자산 없음');
      assert.equal(r.weights[safeAsset],safe ? 1 : undefined);
    }
  }
  const tiny = {code:assets[0],bars:Array.from({length:20},(_,i)=>{
    const close = Number.MIN_VALUE*(i===19 ? 2 : 1);
    return {low:close,high:close,close};
  })};
  assert.equal(targetWeights([tiny],19,rule).weights[assets[0]],1);
  const invalid = series(assets[0],0.001,1);
  invalid.bars[0].low = NaN;
  assert.equal(targetWeights([invalid],19,rule).weights[safeAsset],1);
});

for (const rule of [sector,clenow,{...clenow,regressionDays:20,atrPeriod:10,regimeSmaPeriod:20}]) {
  test(rule.kind+' 준비 '+portfolioWarmup(rule)+'봉 경계·다음 시가와 미래 독립', () => {
    const {legs,input,dates} = fixture(rule);
    const w = portfolioWarmup(rule);
    const prefix = (n:number)=>legs.map(l=>({...l,bars:l.bars.slice(0,n)}));
    assert.throws(()=>backtestPortfolio(prefix(w),input),new RegExp('최소 '+(w+1)+'봉'));
    const first = backtestPortfolio(prefix(w+1),input);
    assert.ok(first.trades.length>0 && first.trades.every(tr=>tr.bar===w));
    const full = backtestPortfolio(legs,input);
    assert.deepEqual(full.rebalances.map(r=>[r.signalDate,r.date]),dates.flatMap((d,i)=>
      i>=w && (i-w)%rule.rebalanceDays===0 ? [[dates[i-1],d]] : []));
    assert.deepEqual(full.trades.filter(tr=>tr.bar<=w),first.trades);
    const future = legs.map(l=>({...l,bars:l.bars.map((b,i)=>i<=w ? b : {...b,open:42,high:44,low:40,close:43})}));
    const altered = backtestPortfolio(future,input);
    assert.deepEqual(altered.rebalances[0],first.rebalances[0]);
    assert.deepEqual(altered.trades.filter(tr=>tr.bar<=w),first.trades);
    if (w===20) assert.deepEqual(backtestPortfolio(prefix(43),input).trades[0],first.trades[0]);
    const changed = prefix(w+1);
    for (const leg of changed) leg.bars[w] = {...leg.bars[w],open:leg.bars[w].close};
    const later = backtestPortfolio(changed,input);
    assert.deepEqual(later.rebalances,first.rebalances);
    assert.notEqual(later.trades[0].price,first.trades[0].price);
  });
}

test('엔진은 안전자산을 포함해 잘못된 OHLC를 거부한다', () => {
  for (const bad of [{low:0},{close:NaN},{high:Infinity},{open:0},{high:71},{low:71}]) {
    const {legs,input} = fixture(sector);
    Object.assign(legs[2].bars[0],bad);
    assert.throws(()=>backtestPortfolio(legs,input),/OHLC.*00088K/);
  }
});

test('회귀와 레짐 창을 독립적으로 검사하고 동일 종가 SMA 경계를 제외한다', () => {
  const rule = {...clenow,regressionDays:20,regimeSmaPeriod:21,atrPeriod:10};
  const weights = (closes:number[])=>targetWeights([{code:assets[0],
    bars:closes.map(close=>({close,low:close-1,high:close+1}))}],20,rule).weights;
  assert.equal(weights([80,...Array(20).fill(100)])[safeAsset],1);
  const equal = [...Array.from({length:20},(_,i)=>81+i*2),100];
  assert.equal(weights(equal)[safeAsset],1);
  equal[20] += 1;
  assert.ok(weights(equal)[assets[0]]>0);
  assert.equal(weights([1,...Array.from({length:20},(_,i)=>120-i/10)])[safeAsset],1);
});

for (const rule of [sector,clenow]) test(rule.kind+' 단독 실험 참조 원장 보존과 재생',()=>{
  const {input,legs} = fixture(rule);
  const store = new Store(':memory:');
  try {
    for (const l of legs) store.saveDaily(l.collection,l.bars);
    const exp = createExperiment(store,input);
    for (const l of legs) {
      store.saveDaily({...l.collection,id:randomUUID(),startedAt:'2026-01-25T00:00:00.000Z'},l.bars);
      assert.equal(store.dailyBars(l.collection.id).length,260);
    }
    assert.equal(replayExperiment(store,exp.id).matches,true);
  } finally {store.close();}
});

test('4B-1 편집기는 신규 규칙의 저장 초안과 편집 진입을 차단한다',()=>{
  for (const rule of [sector,clenow]) {
    assert.equal(parseTransferDraft({code:assets[0],rule}),null);
    assert.throws(()=>formFromRule(rule),/지원하지 않는/);
  }
  const legacy = parseTransferDraft({code:assets[0],rule:dual,overlay:{chandelier:{atrPeriod:14,atrMultiplier:3}}});
  assert.ok(legacy);
  assert.equal(editorDraftFromTransfer(legacy).ruleForm.useChandelier,false);
});
