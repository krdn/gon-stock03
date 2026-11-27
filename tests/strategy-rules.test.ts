import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dailyFixture} from './backtest-fixture.ts';
import {Store} from '../server/store.ts';
import {createExperiment, replayExperiment} from '../server/backtest.ts';
import {initialState} from '../shared/fixtures.ts';
import {advanceTick,backtestRules} from '../server/engine.ts';
import {legacyExperimentListSchema, legacyExperiment} from '../shared/backtest.ts';
import {evaluateClose, strategyRuleSchema, exitOverlaySchema, STRATEGY_CATALOG} from '../shared/strategy-rules.ts';
import {sma,ema,wilder,atr,rsi} from '../shared/indicators.ts';
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
    for (const spec of [{rule:channel},{rule:{...rule,minRelativeVolume:1}},{rule,overlay}]) {
      assert.match((await post('strategies',{...base,...spec})).data.error,/종가만/);
      assert.match((await post('backtest',{code:base.code,...costs,...spec})).data.error,/종가만/);
    }
    for (const spec of [{rule:channel},{rule:{...rule,maType:'ema'}},{rule:{...rule,regimePeriod:20}},{rule:{...rule,minRelativeVolume:1}},{rule,overlay}]) {
      const saved = await post('strategies',{...base,...spec,environment:'kis-paper'});
      assert.equal(saved.status,200);
      const id = store.read().strategies.at(-1)!.id;
      const start = await post('kis/strategies/run',{id,active:true});
      assert.equal(start.data.error,'신규 다중 전략 규칙의 KIS 장중 실시간 평가는 장전 레벨 트리거 계약 연결 후 활성화됩니다.');
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
