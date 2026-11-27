import {createHash} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dailyFixture} from './backtest-fixture.ts';
import {Store} from '../server/store.ts';
import {createExperiment, replayExperiment} from '../server/backtest.ts';
import {initialState} from '../shared/fixtures.ts';
import {advanceTick,backtestRules} from '../server/engine.ts';
import {legacyExperimentListSchema, legacyExperiment} from '../shared/backtest.ts';
import {assertCloseOnly, assertRealtimeRule, warmup, evaluateClose, strategyRuleSchema, exitOverlaySchema, STRATEGY_CATALOG} from '../shared/strategy-rules.ts';
import {dmi,sma,ema,wilder,atr,rsi} from '../shared/indicators.ts';
import {KisClient} from '../server/kis.ts';
import {startTestServer} from './test-server.ts';

const rule = {kind:'ma_crossover',maType:'sma',fast:2,slow:4} as const;
const costs = {capital:100000,feeBps:10,slippageBps:5};
const channel = {kind:'donchian_breakout',entryLookback:10,exitLookback:3,volumeMultiplier:1} as const;
const overlay = {chandelier:{atrPeriod:7,atrMultiplier:2}};

test('v1 fixture 해시·재현과 v2 기본 SMA의 거래·비용·평가액, 혼합 실험 목록', () => {
  const store = new Store(':memory:');
  try {
    const {run,bars,input} = dailyFixture();
    store.saveDaily(run,bars);
    const first = createExperiment(store,input);
    assert.equal(first.id,'250f7976c8002efc246c4f1333a20a732c05899cb972faacbef30356cef4d0e4');
    assert.ok(replayExperiment(store,first.id).matches);
    const {fast,slow,...common} = input;
    const next = createExperiment(store,{...common,rule});
    assert.ok(replayExperiment(store,next.id).matches);
    assert.equal(next.snapshot.engineVersion,'daily-rules-next-open-v2');
    assert.notEqual(first.id,next.id);
    const withStop = createExperiment(store,{...common,rule,overlay});
    assert.ok(replayExperiment(store,withStop.id).matches);
    assert.ok('benchmark' in next.result);
    const {benchmark,trades,...base} = next.result;
    assert.deepEqual({...base,trades:trades.map(({reason,...trade}) => {assert.match(reason,/[가-힣]/);return trade;})},first.result);
    const entry = bars[0].open * (1+input.slippageBps/10000);
    const units = Math.floor(input.capital/(entry*(1+input.feeBps/10000)));
    const cash = input.capital - (units*entry + Math.ceil(units*entry*input.feeBps/10000));
    const curve = bars.map(b => cash + units*b.close);
    let peak = input.capital, mdd = 0;
    for (const equity of curve) {peak=Math.max(peak,equity);mdd=Math.max(mdd,(peak-equity)/peak*100);}
    assert.deepEqual(benchmark,{returnPct:(curve.at(-1)!/input.capital-1)*100,maxDrawdown:mdd,finalEquity:curve.at(-1)});
    const list = legacyExperimentListSchema.parse({experiments:store.experiments()});
    assert.deepEqual(list.experiments.map(e => e.id),[first.id]);
    assert.deepEqual(legacyExperiment.parse(store.experiment(first.id)),first);
    const changed = bars.map((b,i) => i < 10 ? b : {...b,close:600+i,open:500,high:1000});
    const after = backtestRules(changed,changed.map(b=>b.open),{...costs,rule},'daily');
    assert.deepEqual(after.trades.filter(t=>t.bar<10),trades.filter(t=>t.bar<10));
    assert.deepEqual(after.equity.slice(0,10),base.equity.slice(0,10));
  } finally {store.close();}
});

test('준비 봉과 지표 시드, 엄격한 입력과 카탈로그 프리셋', () => {
  assert.equal(sma([2,4,6,12],3),22/3);
  assert.equal(ema([2,4,6,12],3),8);
  assert.equal(wilder([2,4,6,10],3),6);
  assert.equal(atr([{high:12,low:10,close:11},{high:21,low:19,close:20}],2),6);
  assert.equal(rsi([10,9,8],2),0);
  assert.equal(rsi([8,9,10],2),100);
  assert.equal(rsi([8,8,8],2),50);
  assert.throws(()=>backtestRules([],[],{...costs,rule:channel},'daily'),/최소 22봉/);
  for (const item of Object.values(STRATEGY_CATALOG)) for (const preset of Object.values(item.presets)) strategyRuleSchema.parse(preset);
  for (const invalid of [{...rule,fast:4},{...channel,exitLookback:10},{...rule,other:1},{kind:'rsi2_pullback'}]) assert.equal(strategyRuleSchema.safeParse(invalid).success,false);
  assert.equal(exitOverlaySchema.safeParse({chandelier:{...overlay.chandelier,extra:true}}).success,false);
});
test('돈키안은 오늘 고저·거래량 제외, MA 거래량 경계와 장기 필터 적용',()=>{
  const past = Array.from({length:20},()=>({close:10,high:12,low:8,volume:100}));
  const today = {close:12,high:19,low:6,volume:101};
  assert.equal(evaluateClose([...past,today],channel).signal,'buy');
  assert.equal(evaluateClose([...past,{...today,volume:100}],channel).signal,'hold');
  assert.equal(evaluateClose([...past,{...today,close:8}],channel).signal,'sell');
  const ma = {...rule, regimePeriod:20,minRelativeVolume:1};
  assert.equal(evaluateClose([...past,{...today,volume:100}],ma).signal,'buy');
  assert.equal(evaluateClose([...past,{...today,volume:99}],ma).signal,'hold');
  const declining = past.map((b,i)=>({...b,close:i<15?30:10}));
  assert.equal(evaluateClose([...declining,today],ma).signal,'hold');
});
test('RSI 눌림목 진입, 평균 회복과 보유 기한 청산, 샹들리에 단조성과 매도 우선순위',()=>{
  const pull = STRATEGY_CATALOG.rsi2_pullback.presets.aggressive;
  const bars = [...Array<number>(48).fill(10),...Array<number>(9).fill(22),21,20,19].map(close=>({close}));
  assert.equal(evaluateClose(bars,pull).signal,'buy');
  assert.equal(evaluateClose(bars,pull,{barsHeld:10}).signal,'sell');
  assert.equal(evaluateClose([...bars,{close:25}],pull,{barsHeld:2}).signal,'sell');
  const history = Array.from({length:21},()=>({close:10,high:11,low:9,volume:100}));
  const initial = evaluateClose(history,channel,{barsHeld:1},overlay);
  assert.equal(initial.trailStop,7);
  const exit = evaluateClose([...history,{close:7,high:12,low:1,volume:1}],channel,{barsHeld:2,trailStop:initial.trailStop},overlay);
  assert.equal(exit.trailStop,7);
  assert.match(exit.reason,/샹들리에/);
  assert.equal(exit.signal,'sell');
});

test('DEMO 종가 전략 저장·계산 및 OHLCV 거부, KIS 시작 게이트는 전송 전 차단',async()=>{
  const store = new Store(':memory:');
  let upstream = 0;
  const kis = new KisClient({key:'',secret:'',account:'',product:''},async()=>{upstream++;throw Error('unexpected transport');},0);
  const api = await startTestServer(store,kis);
  async function post(path:string,body:unknown) {
    const res = await fetch(api.url+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Workbench':'local'},body:JSON.stringify(body)});
    return {status:res.status,data:await res.json()};
  }
  try {
    const base = {name:'테스트',code:'005930',qty:1,fast:2,slow:4};
    assert.equal((await post('strategies',{...base,rule})).status,200);
    assert.equal((await post('backtest',{code:base.code,...costs,rule})).status,200);
    for (const kind of ['macd_momentum','bollinger_percent_b'] as const) {
      const spec = {rule:STRATEGY_CATALOG[kind].presets.basic};
      assert.equal((await post('strategies',{...base,...spec})).status,200);
      assert.equal((await post('backtest',{code:base.code,...costs,...spec})).status,200);
    }
    const newRules = ([...phaseTwo,"volatility_breakout"] as const).map(kind => ({rule:STRATEGY_CATALOG[kind].presets.basic}));
    for (const spec of [...newRules.filter(({rule})=>!STRATEGY_CATALOG[rule.kind].environments.demo),{rule:channel},{rule:{...rule,minRelativeVolume:1}},{rule,overlay},{rule,overlay:{volatilityParity:parity}}]) {
      assert.match((await post('strategies',{...base,...spec})).data.error,/종가만/);
      assert.match((await post('backtest',{code:base.code,...costs,...spec})).data.error,/종가만/);
    }
    for (const spec of [...newRules,{rule:channel},{rule:{...rule,maType:'ema'}},{rule:{...rule,regimePeriod:20}},{rule:{...rule,minRelativeVolume:1}},{rule,overlay},{rule,overlay:{volatilityParity:parity}}]) {
      const saved = await post('strategies',{...base,...spec,environment:'kis-paper'});
      assert.equal(saved.status,200);
      const id = store.read().strategies.at(-1)!.id;
      const start = await post('kis/strategies/run',{id,active:true});
      assert.match(start.data.error, spec.rule.kind === 'volatility_breakout' || ('overlay' in spec && 'volatilityParity' in spec.overlay!) ? /저장 일봉 백테스트 전용/ : /REST 대조/);
      assert.equal(store.read().strategies.at(-1)!.active,false);
    }
    assert.equal(upstream,0);assert.deepEqual(store.paperOrders(),[]);
  } finally {await api.close();store.close();}
});

test('DEMO RSI 보유 시간은 실제 전량 매도 시 초기화된다',()=>{
  const state = initialState();
  const position = state.positions.find(p=>p.qty>0)!;
  const instrument = state.instruments.find(i=>i.code===position.code)!;
  instrument.history = Array<number>(100).fill(instrument.price);
  state.strategies = [{id:'rule',name:'테스트',code:position.code,fast:2,slow:4,qty:1,active:true,lastSignal:'hold',lastTick:-1,
    rule:STRATEGY_CATALOG.rsi2_pullback.presets.aggressive,entryTick:0}];
  state.orders = [{id:'fixture',requestId:'manual',code:position.code,side:'sell',qty:position.qty,price:1,status:'pending',createdAt:'',source:'manual',fee:0}];
  advanceTick(state);
  assert.equal(state.orders[0].status,'filled');
  assert.equal(position.qty,0);
  assert.equal(state.strategies[0].entryTick,undefined);
  assert.notEqual(state.strategies[0].lastSignal,'sell');
});

test('돈키안·RSI·샹들리에 시뮬레이션에서 이후 가격이 이전 거래·평가액을 바꾸지 않는다',()=>{
  const bars = Array.from({length:90},(_,i)=>{
    const close = i<50 ? 10 : i<61 ? 22 : i<68 ? 82-i : i<78 ? 22 : 8;
    return {open:close,close,high:close+0.2,low:close-0.2,volume:i===50?1000:100};
  });
  const changed = bars.map((b,i)=> i<75 ? b : {...b,open:99,high:112,low:80,close:111});
  for (const spec of [{rule:channel},{rule:STRATEGY_CATALOG.rsi2_pullback.presets.aggressive},{rule:channel,overlay}]) {
    const run = (data:typeof bars)=>backtestRules(data,data.map(b=>b.open),{...costs,...spec},'daily');
    const original = run(bars), mutated = run(changed);
    const trades = original.trades.filter(t=>t.bar<75);
    assert.ok(trades.length>0);
    assert.deepEqual(mutated.trades.filter(t=>t.bar<75),trades);
    assert.deepEqual(mutated.equity.slice(0,75),original.equity.slice(0,75));
  }
});

const phaseTwo = ['macd_momentum', 'adx_dmi_trend', 'bollinger_squeeze', 'ttm_squeeze',
  'bollinger_percent_b', 'low_volume_pullback', 'disparity_reversion'] as const;

for (const kind of phaseTwo) {
  test(`${kind} 최소 봉 매수·매도, 입력·환경 경계와 다음 시가 체결`, () => {
    const catalog = STRATEGY_CATALOG[kind], rule = catalog.presets.basic;
    const count = warmup(rule);
    const bar = (close:number) => ({open:close-1, high:close+1, low:close-1, close, volume:100});
    const history = Array.from({length:count-1}, () => bar(100));
    let buy = bar(120), sell = bar(80);
    switch (kind) {
      case 'adx_dmi_trend':
        for (let i = 0; i < 5; i++) history[count-6+i] = bar(101+i);
        break;
      case 'bollinger_squeeze':
        buy.volume = 121;
        assert.equal(evaluateClose([...history,{...buy,volume:120}],rule).signal,'hold');
        break;
      case 'bollinger_percent_b':
        history[count-2] = bar(70);
        buy = bar(72); sell = bar(120);
        break;
      case 'low_volume_pullback':
        history.forEach((_, i) => { history[i] = bar(50+i); });
        for (let i = 1; i <= 3; i++) history[count-1-i] = {...bar(101),volume:40};
        break;
      case 'disparity_reversion':
        buy = bar(80); sell = bar(101);
        break;
    }
    const input = [...history,buy];
    assert.equal(evaluateClose(history,rule).reason,'준비 봉 부족');
    assert.equal(evaluateClose(input,rule).signal,'buy');
    assert.equal(evaluateClose([...history,sell],rule,{barsHeld:1}).signal,'sell');
    assert.equal(strategyRuleSchema.safeParse({...rule,extra:0}).success,false);
    assert.doesNotThrow(()=>assertRealtimeRule(rule));
    if (kind === 'macd_momentum' || kind === 'bollinger_percent_b') {
      assert.doesNotThrow(()=>assertCloseOnly(rule));
      assert.equal(evaluateClose(input.map(({close})=>({close})),rule).signal,'buy');
    } else assert.throws(()=>assertCloseOnly(rule),/종가만/);
    const simulate = (tail:number) => {
      const bars = [...input, bar(111), bar(tail)];
      return backtestRules(bars,bars.map(b=>b.open),{...costs,slippageBps:0,rule},'daily');
    };
    const original = simulate(70), changed = simulate(170);
    assert.equal(original.trades[0].bar,count);
    assert.equal(original.trades[0].price,110);
    assert.deepEqual(original.trades.filter(t=>t.bar<=count),changed.trades.filter(t=>t.bar<=count));
    assert.deepEqual(original.equity.slice(0,count+1),changed.equity.slice(0,count+1));
  });
}

test('이격도 손절은 다음 시가의 실제 진입 체결가를 사용한다', () => {
  const rule = STRATEGY_CATALOG.disparity_reversion.presets.basic;
  const bars = [...Array<number>(19).fill(100),80,90,88].map(close=>({open:close,close,high:close+1,low:close-1}));
  bars[20].open = 98;
  const {trades} = backtestRules(bars,bars.map(b=>b.open),{...costs,rule},'daily');
  assert.deepEqual(trades.map(t=>[t.side,t.bar]),[['buy',20],['sell',21]]);
});

test('Wilder 방향 지표는 정확히 2n봉에서 첫 ADX와 그 직후 값을 비교한다', () => {
  const period = 7;
  // The first n bars are flat. Starting with bar n+1 every DX equals 100.
  const bars = Array.from({length:2*period}, (_,i) => {
    const close = 100 + Math.max(0,i-period+1);
    return {close, high:close+1, low:close-1};
  });
  const {adx,prev,plusDI,minusDI} = dmi(bars,period);
  const seed = 100*(period-1)/period;
  assert.ok(Math.abs(prev.adx-seed)<1e-10);
  assert.ok(Math.abs(adx-(seed+(100-seed)/period))<1e-10);
  assert.ok(plusDI > prev.plusDI && minusDI === 0 && prev.minusDI === 0);
});

test('기준 커밋의 일봉 v1·v2 10종·샹들리에 실험 ID와 결과를 재생한다', () => {
  const {run, bars, input} = dailyFixture();
  const history = Array.from({length:240}, (_, i) => {
    const date = new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10).replaceAll('-', '');
    const bar = bars[i % bars.length];
    return {...bar, date};
  });
  const dates = history.map(b => b.date);
  const range = {from:dates[0], to:dates.at(-1)!};
  const store = new Store(':memory:');
  try {
    store.saveDaily({...run,...range,calendar:{...run.calendar!,dates}},history);
    const {fast,slow,...common} = {...input,...range};
    const kinds = ['ma_crossover','donchian_breakout','rsi2_pullback',...phaseTwo] as const;
    const specs = [{...common,fast,slow}, ...kinds.map(kind => ({...common,rule:STRATEGY_CATALOG[kind].presets.basic})), {...common,rule,overlay}];
    const digest = createHash('sha256');
    for (const spec of specs) {
      const experiment = createExperiment(store,spec);
      assert.ok(replayExperiment(store,experiment.id).matches);
      digest.update(JSON.stringify([experiment.id,experiment.result]));
    }
    assert.equal(digest.digest('hex'),'df416d735fd533651079a02a844b7b93be85d5772a245dd0d883bcee3a62df2a');
  } finally { store.close(); }
});

const breakoutRule = {...STRATEGY_CATALOG.volatility_breakout.presets.basic, noiseLookback:5, trendMaPeriod:5, holdDays:2};
const parity = {volLookback:10,targetAnnualVolPct:20,maxAllocationPct:40};
const breakoutBars = Array.from({length:16}, (_,i) => ({
  date:String(i), open:100+i, high:103+i, low:99+i, close:102+i,
}));
function runBreakout(bars = breakoutBars, rule = breakoutRule, extra: Parameters<typeof backtestRules>[2]['overlay'] = undefined, capital = costs.capital) {
  return backtestRules(bars,bars.map(b=>b.open),{...costs,capital,rule,overlay:extra},'daily');
}

test('돌파는 준비 봉 직후 목표가에서 매수하고 보유 기한 시가에 한 번만 청산한다', () => {
  const {trades} = runBreakout();
  const price = 107 * 1.0005;
  const qty = Math.floor(costs.capital / (price * 1.001));
  assert.deepEqual(trades[0],{bar:5,date:'5',signalDate:'4',side:'buy',reason:'전일 변동폭 기준 당일 목표가 상향 돌파',
    price,qty,fee:Math.ceil(qty * price * 0.001)});
  assert.deepEqual(trades.slice(1,3).map(t=>[t.side,t.bar,t.reason]),[
    ['sell',7,'목표 보유 기간 경과 시가 청산'],['buy',8,'전일 변동폭 기준 당일 목표가 상향 돌파']]);
  assert.equal(trades[1].price,107 * 0.9995);
  assert.throws(()=>runBreakout(breakoutBars.slice(0,5)),/최소 6봉/);
  const edge = breakoutBars.slice(0,6).map(b=>({...b}));
  edge[5].high=107;
  assert.equal(runBreakout(edge).trades.length,1);
  edge[5].high-=0.001;
  assert.equal(runBreakout(edge).trades.length,0);
  edge[5].high=200;
  edge[4]={...edge[4],open:106,high:106,low:106,close:106};
  assert.equal(runBreakout(edge).trades.length,0);
  edge[4]={...breakoutBars[4],close:100,low:99};
  assert.equal(runBreakout(edge).trades.length,0);
});

test('적응형 노이즈는 직전 확정 OHLC만 사용하고 폭 0인 봉은 0.5다', () => {
  const bars = breakoutBars.map(b=>({...b}));
  bars[1]={...bars[1],open:102,close:102,high:102,low:102};
  bars[2].close = bars[2].open; // noise=1, other four=0.5
  const adaptive = {...breakoutRule,useAdaptiveNoise:true,k:1};
  const original = runBreakout(bars,adaptive);
  assert.equal(original.trades[0].price,(105+0.6*4)*1.0005);
  bars[5].low=1; bars[5].close=2;
  assert.deepEqual(runBreakout(bars.slice(0,6),adaptive).trades[0],original.trades[0]);
});

test('샹들리에는 진입 봉 확정 후 보유 기한보다 우선하여 다음 시가에 청산한다', () => {
  const bars = breakoutBars.map(b=>({...b}));
  bars[7].high=240;
  const {trades} = runBreakout(bars,{...breakoutRule,holdDays:1},overlay);
  assert.deepEqual(trades.slice(0,2).map(t=>[t.bar,t.reason]),[
    [7,'전일 변동폭 기준 당일 목표가 상향 돌파'],[8,'샹들리에 추적 손절선 도달']]);
  assert.equal(trades.filter(t=>t.bar===8).length,1);
});

test('패리티는 체결 전 확정 수익률의 모집단 변동성과 수수료를 반영한다', () => {
  const bars = breakoutBars.map(b=>({...b}));
  let close=100;
  for (let i=0;i<=10;i++) {
    if (i) close *= i%2 ? 0.9 : 1.2;
    bars[i]={...bars[i],open:close,high:close+1,low:close-1,close};
  }
  const {trades} = runBreakout(bars,breakoutRule,{volatilityParity:parity});
  const price = 112 * 1.0005;
  const annualVolPct = 0.15*Math.sqrt(252)*100;
  assert.equal(trades[0].bar,11);
  assert.equal(trades[0].qty,Math.floor(costs.capital * (20/annualVolPct) / (price*1.001)));
  bars[11].close=50; bars[11].low=1;
  assert.deepEqual(runBreakout(bars.slice(0,12),breakoutRule,{volatilityParity:parity}).trades,trades.slice(0,1));
  const capped = runBreakout(breakoutBars,breakoutRule,{volatilityParity:parity}).trades[0];
  assert.equal(capped.qty,Math.floor(costs.capital * 0.4 / (capped.price*1.001)));
  assert.equal(runBreakout(breakoutBars,breakoutRule,{volatilityParity:parity},150).trades.length,0);
});

test('돌파·패리티 입력은 엄격하고 선택 오버레이 생략을 보존한다', () => {
  for (const invalid of [{k:0.09},{k:1.01},{useAdaptiveNoise:1},{noiseLookback:4},{trendMaPeriod:201},{holdDays:1.1},{extra:0}])
    assert.equal(strategyRuleSchema.safeParse({...breakoutRule,...invalid}).success,false);
  for (const invalid of [{volLookback:9},{volLookback:60.1},{maxAllocationPct:9},{maxAllocationPct:101},{targetAnnualVolPct:61},{extra:true}])
    assert.equal(exitOverlaySchema.safeParse({volatilityParity:{...parity,...invalid}}).success,false);
  assert.throws(()=>exitOverlaySchema.parse({volatilityParity:{...parity,targetAnnualVolPct:4}}),/목표 변동성은 5% 이상이어야 합니다/);
  assert.deepEqual(exitOverlaySchema.parse({}),{});
  assert.equal(warmup(breakoutRule,{...overlay,volatilityParity:parity}),11);
});

test('수익률 분산 0에서는 현금 한도를 쓰고 기존 종가 전략도 매수 수량만 줄인다', () => {
  const bars = breakoutBars.map((b,i) => {
    const close = i === 0 ? 90 : 100;
    return {...b,open:close,high:close+2,low:close-2,close};
  });
  const first = runBreakout(bars,{...breakoutRule,trendMaPeriod:12},{volatilityParity:parity}).trades[0];
  assert.equal(first.bar,12);
  assert.equal(first.qty,Math.floor(costs.capital*0.4/(first.price*1.001)));
  const maBars = [...Array<number>(12).fill(100),110,105].map(close=>({close,open:close-1}));
  const run = (sized:boolean) => backtestRules(maBars,maBars.map(b=>b.open),{
    ...costs,rule,overlay:sized ? {volatilityParity:parity} : undefined,
  },'daily').trades[0];
  const normal = run(false), sized = run(true);
  assert.equal(sized.bar,13);
  assert.equal(sized.price,normal.price);
  assert.ok(sized.qty>0 && sized.qty<normal.qty);
});
