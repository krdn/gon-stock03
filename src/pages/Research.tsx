import { useEffect, useState } from 'react';
import { Play, Plus, Square, Zap } from 'lucide-react';
import { useWorkbench } from '../context';
import { Badge, Chart, Empty, Panel, Stat } from '../components/ui';
import { won, type BacktestResult } from '../../shared/model';
import { dailyRunsSchema } from '../../shared/data-inventory';
import type { DailyRun } from '../../shared/market-data';
import { experimentListSchema, experimentSchema, backtestResultSchema, type Experiment } from '../../shared/backtest';
import { z } from 'zod';

export function Strategies() {
  const { available, busy } = useWorkbench();
  const [environment, setEnvironment] = useState<'demo' | 'kis-paper'>('demo');
  return <><label className="field">전략 환경<select disabled={!available || busy} value={environment} onChange={e => setEnvironment(e.target.value as 'demo' | 'kis-paper')}><option value="demo">DEMO 합성 봉</option><option value="kis-paper">KIS 모의 체결가 이벤트</option></select></label><StrategyStudio key={environment} environment={environment} /></>;
}
function StrategyStudio({ environment }: { environment: 'demo' | 'kis-paper' }) {
  const kis = environment === 'kis-paper';
  const { state, act, busy, available, realtime } = useWorkbench(); const [name, setName] = useState('나의 이동평균 전략'), [code, setCode] = useState('069500'), [fast, setFast] = useState(5), [slow, setSlow] = useState(20), [qty, setQty] = useState(1);
  const quoteAge = realtime?.lastQuoteAt ? Date.now() - Date.parse(realtime.lastQuoteAt) : Infinity;
  const realtimeReady = available && realtime?.fresh && realtime.ordersAllowed && quoteAge >= 0 && quoteAge <= 5000;
  async function save(e: React.FormEvent) { e.preventDefault(); try { await act('strategies', { name, code, fast, slow, qty, environment }); } catch { /* Error is shown by the workspace. */ } }
  return <><div className="notice compact"><Zap size={16} />{kis ? 'KIS 검증 체결가 이벤트마다 교차를 평가합니다. 시작은 전송 승인을 확대하지 않으며 기존 고정 1회 승인을 유지합니다.' : '자동매매는 로컬 데모 봉 재생에서만 실행됩니다. 전략 시작 후 자동 재생을 켜면 3초마다 신호 → 위험 검사 → 주문을 처리합니다.'}</div>{kis && <p role="status">{realtime?.message ?? '실시간 상태 미확인'} · <a href="/paper">실시간 연결·대조 확인</a></p>}{!kis && <div className="button-row" style={{ marginBottom: 20 }}><button className="button primary" disabled={busy || !available || (!state.playing && state.risk.halted)} onClick={() => void act('playback').catch(() => {})}>{state.playing ? '자동 재생 정지' : '자동 재생 시작'}</button><span className="muted tiny">데모 봉 #{state.tick} · {state.playing ? '3초마다 자동 평가 중' : '재생 정지'}</span></div>}<div className="grid-main"><div className="strategy-list">{state.strategies.filter(s => (s.environment ?? 'demo') === environment).map(s => <Panel key={s.id}><div className="strategy-top"><span className="strategy-icon"><Zap size={22} /></span><Badge tone={s.active ? 'teal' : 'neutral'}>{s.active ? kis ? '실행 중 · 체결가 이벤트 평가' : '실행 대기 · 봉 재생 시 평가' : '정지'}</Badge></div><h2>{s.name}</h2><p className="tiny muted">{kis ? 'KIS 모의' : 'DEMO'} · revision {s.revision ?? 1}</p><p className="muted">{state.instruments.find(i => i.code === s.code)?.name} · 이동평균 교차</p><div className="rule-diagram"><div><small>단기 평균</small><strong>{s.fast}{kis ? '이벤트' : '봉'}</strong></div><span>교차</span><div><small>장기 평균</small><strong>{s.slow}{kis ? '이벤트' : '봉'}</strong></div><span>→</span><div><small>주문 수량</small><strong>{s.qty}주</strong></div></div><div className="check-row"><span>마지막 신호</span><strong>{s.lastSignal === 'hold' ? '관망' : s.lastSignal === 'buy' ? '상향 교차 · 매수' : '하향 교차 · 매도'}</strong></div><div className="button-row"><button disabled={!available || busy || (!s.active && (state.risk.halted || (kis && (!realtimeReady || realtime?.code !== s.code))))} className={`button ${s.active ? 'secondary' : 'primary'}`} onClick={() => void act(kis ? 'kis/strategies/run' : 'strategies/toggle', kis ? { id: s.id, active: !s.active } : { id: s.id }).catch(() => {})}>{s.active ? <Square size={14} /> : <Play size={14} />}{s.active ? '전략 정지' : '전략 시작'}</button>{!kis && <button disabled={!available || busy} className="button secondary" onClick={() => void act('tick').catch(() => {})}>다음 데모 봉 재생</button>}</div>{kis && <><p className="soft-note">{!s.active ? '정지 · 개별 시작 전 신규 평가/주문 없음' : realtimeReady ? '신선한 이벤트 대기 · 승인/위험 조건은 주문마다 검사' : '신규 주문 차단 · ' + (!available ? '상태 미확인' : realtime?.message ?? '실시간 미확인')}</p><details open><summary>최근 평가 · 최대 100건</summary>{s.evaluations?.length ? s.evaluations.map(e => <div className="strategy-evaluation" key={e.event}><p>{e.event} · revision {e.revision} · {e.signal === 'hold' ? '관망' : e.signal === 'buy' ? '매수' : '매도'} · {{ hold: '관망', blocked: '차단', sending: '검사·전송 중', accepted: '접수 · 체결 미확정', unknown: '응답 불명', rejected: '거부 · 미전송' }[e.status]}</p><p>{e.reason}</p>{e.requestId && <p>요청 ID: <code>{e.requestId}</code> · 주문번호: {e.brokerId ?? '없음'} · <a href="/paper">원장 대조</a></p>}</div>) : <p>평가 기록 없음 · 시작 이후 새 체결가 이벤트가 필요합니다.</p>}</details></>}</Panel>)}<Panel title="실행 규칙">{kis ? <><p className="prose">검증된 KRX 체결가 이벤트의 이동평균 교차만 신호로 사용합니다. 분봉·일봉 전략이 아닙니다. 표본 부족·교차 없음·차단도 기록합니다. 저장 설정은 revision 1로 고정하며 변경하려면 새 전략을 저장하세요.</p><p className="prose">매도 신호는 수동 보유분도 계좌의 매도 가능 수량 안에서 매도합니다. 모든 주문은 수동과 같은 금액·종목·손실 한도·긴급정지·승인 검사를 거칩니다. 기존 고정 승인 UUID와 다른 전략 요청은 차단됩니다. 응답 불명은 재전송하지 않고 원장을 대조하세요.</p><p className="prose">정지·서버 재시작·연결 중단 후 자동 재개하지 않습니다. 시작 전에 받은 이벤트도 재실행하지 않습니다. 시작 후 브라우저를 닫아도 서버가 새 이벤트를 평가하므로 종료하려면 전략 정지를 누르세요. 접수된 주문은 정지로 취소되지 않습니다.</p></> : <><p className="prose">단기 평균이 장기 평균을 아래에서 위로 교차하면 매수합니다. 위에서 아래로 교차하면 보유 범위에서 매도합니다. 같은 봉을 두 번 평가하지 않으며, 신규 주문은 다음 봉에서 체결 여부를 판단하고 미체결 전략 주문은 그 봉에서 만료됩니다. 전략은 수동으로 매수한 보유분도 매도할 수 있습니다.</p><p className="muted prose">서버 재시작 시 전략은 정지 상태로 복구합니다. DEMO 재생은 KIS 전략 실행과 분리됩니다.</p></>}</Panel></div><Panel title="새 전략 만들기" action={<Plus size={18} />}><form onSubmit={save}><label className="field">전략 이름<input value={name} onChange={e => setName(e.target.value)} required maxLength={60} /></label><label className="field">대상 종목<select value={code} onChange={e => setCode(e.target.value)}>{state.instruments.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label><div className="form-grid"><label className="field">단기 평균 ({kis ? '이벤트' : '봉'})<input type="number" min="2" max="60" value={fast} onChange={e => setFast(Number(e.target.value))} required /></label><label className="field">장기 평균 ({kis ? '이벤트' : '봉'})<input type="number" min="3" max="100" value={slow} onChange={e => setSlow(Number(e.target.value))} required /></label></div><label className="field">회당 수량 (주)<input type="number" min="1" max="10000" value={qty} onChange={e => setQty(Number(e.target.value))} required /></label><div className="soft-note">시작 전 백테스트를 확인하세요. 단기 기간은 장기 기간보다 작아야 합니다.</div><button disabled={!available || busy} className="button primary wide">전략 저장</button></form></Panel></div></>;
}
function DemoBacktest() {
  const { state, act, available, busy } = useWorkbench(); const [code, setCode] = useState('069500'), [fast, setFast] = useState(5), [slow, setSlow] = useState(20), [capital, setCapital] = useState(10000000), [fee, setFee] = useState(1.5), [slip, setSlip] = useState(5), [result, setResult] = useState<BacktestResult | null>(null);
  async function run(e: React.FormEvent) { e.preventDefault(); try { const r = await act<{ result: BacktestResult }>('backtest', { code, fast, slow, capital, feeBps: fee, slippageBps: slip }); setResult(r.result); } catch { setResult(null); } }
  return <><div className="notice warning">현재 저장된 합성 봉으로 계산하는 기능 검증입니다. 실제 표본 수는 결과에 표시합니다. 실제 과거 수익률이나 미래 성과를 의미하지 않습니다.</div><div className="trade-grid"><div>{result ? <><div className="stats-grid three"><Stat label="합성 구간 수익률" value={`${result.returnPct.toFixed(2)}%`} /><Stat label="최대 낙폭" value={`${result.maxDrawdown.toFixed(2)}%`} /><Stat label="체결 횟수" value={`${result.trades.length}회`} /></div><Panel title="자산 곡선" action={<Badge>비용 반영</Badge>}><Chart values={result.equity} height={250} label="합성 데이터 백테스트 평가자산 곡선" /><div className="check-row"><span>최종 평가자산</span><strong>{won(result.finalEquity)}원</strong></div><div className="check-row"><span>누적 수수료</span><strong>{won(result.fees)}원</strong></div><p className="muted tiny">{result.source} · 마지막 보유분은 평가하며 강제 청산하지 않습니다.</p></Panel><Panel title="백테스트 거래 내역" className="top-gap">{result.trades.length ? <div className="table-scroll"><table><thead><tr><th>봉 번호</th><th>방향</th><th>체결가</th><th>수량</th><th>수수료</th></tr></thead><tbody>{result.trades.map((t, i) => <tr key={i}><td>{t.bar}</td><td className={t.side === 'buy' ? 'up' : 'down'}>{t.side === 'buy' ? '매수' : '매도'}</td><td>{won(t.price)}</td><td>{t.qty}</td><td>{won(t.fee)}</td></tr>)}</tbody></table></div> : <Empty title="교차 신호가 없습니다">이 구간에는 진입 조건을 만족한 거래가 없습니다.</Empty>}</Panel></> : <Panel><Empty title="첫 실험을 시작해 보세요">오른쪽에서 규칙과 비용을 정하면 합성 구간의 자산 곡선·낙폭·거래 내역을 계산합니다.</Empty><div className="backtest-principles"><div><span>01</span><strong>시간 순서를 지킵니다</strong><p>종가 신호는 다음 봉 가격으로 실행</p></div><div><span>02</span><strong>비용을 드러냅니다</strong><p>수수료·슬리피지 입력값 적용</p></div><div><span>03</span><strong>데이터를 구분합니다</strong><p>합성 표본과 실제 과거 데이터 분리</p></div></div></Panel>}</div><Panel title="실험 설정"><form onSubmit={run}><label className="field">대상<select value={code} onChange={e => setCode(e.target.value)}>{state.instruments.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label><div className="form-grid"><label className="field">단기 (봉)<input type="number" min="2" max="60" value={fast} onChange={e => setFast(Number(e.target.value))} required /></label><label className="field">장기 (봉)<input type="number" min="3" max="100" value={slow} onChange={e => setSlow(Number(e.target.value))} required /></label></div><label className="field">초기 자금 (원)<input type="number" min="100000" max="100000000" value={capital} onChange={e => setCapital(Number(e.target.value))} required /></label><label className="field">수수료 (bp, 1bp = 0.01%)<input type="number" step="0.1" min="0" max="100" value={fee} onChange={e => setFee(Number(e.target.value))} required /></label><label className="field">슬리피지 (bp)<input type="number" step="0.1" min="0" max="100" value={slip} onChange={e => setSlip(Number(e.target.value))} required /></label><p className="muted tiny">기본값은 검증용 가정입니다. 세금은 포함하지 않으며 실제 수수료 정책을 대체하지 않습니다.</p><button className="button primary wide" disabled={busy || !available}><Play size={15} />백테스트 실행</button></form></Panel></div></>;
}

export function Backtest() {
  const [source, setSource] = useState('stored'); const { busy } = useWorkbench();
  return <><label className="field">데이터 출처<select disabled={busy} value={source} onChange={e => setSource(e.target.value)}><option value="stored">KIS 저장 일봉 · 과거 구간 실험</option><option value="demo">DEMO 합성 · 기능 검증</option></select></label>{source === 'stored' ? <StoredBacktest /> : <DemoBacktest />}</>;
}
const dateInput = (value: string) => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;

function StoredBacktest() {
  const { act, available, busy } = useWorkbench();
  const [runs, setRuns] = useState<DailyRun[] | null>(null), [experiments, setExperiments] = useState<z.infer<typeof experimentListSchema>['experiments']>([]);
  const [selected, setSelected] = useState(''), [policy, setPolicy] = useState('adjusted'), [savedId, setSavedId] = useState('');
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [fast, setFast] = useState(5), [slow, setSlow] = useState(20);
  const [capital, setCapital] = useState(10000000), [fee, setFee] = useState(1.5), [slip, setSlip] = useState(5);
  const [experiment, setExperiment] = useState<Experiment | null>(null), [replay, setReplay] = useState('');
  const [loading, setLoading] = useState(true), [pending, setPending] = useState(false), [error, setError] = useState(''), [listError, setListError] = useState(''), [revision, setRevision] = useState(0);
  function choose(run: DailyRun | undefined) { setSelected(run?.id ?? ''); setFrom(run?.from ?? ''); setTo(run?.to ?? ''); setExperiment(null); setReplay(''); setError(''); }
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setListError('');
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
    void (async () => {
      try {
        const [dailyResponse, savedResponse] = await Promise.all([fetch('/api/data/daily', { signal }), fetch('/api/backtest/experiments', { signal })]);
        if (!dailyResponse.ok || !savedResponse.ok) throw new Error();
        const daily = dailyRunsSchema.parse(await dailyResponse.json()), saved = experimentListSchema.parse(await savedResponse.json());
        if (controller.signal.aborted) return;
        setRuns(daily.runs); setExperiments(saved.experiments); setSavedId(previous => saved.experiments.some(row => row.id === previous) ? previous : saved.experiments[0]?.id ?? '');
        if (!daily.runs.some(run => run.id === selected)) {
          const first = daily.runs[0]; setSelected(first?.id ?? ''); setPolicy(first?.adjustment ?? 'adjusted'); setFrom(first?.from ?? ''); setTo(first?.to ?? '');
        }
      } catch { if (!controller.signal.aborted) setListError('실험 목록 조회 실패 · 이전 목록은 최신 확인값이 아닙니다. 다시 조회하세요.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [revision]);
  const run = runs?.find(row => row.id === selected);
  const eligible = run?.coverageComplete && run.status.complete && !run.status.error && run.quality.state === 'passed' && !!run.calendar;
  const locked = busy || pending || loading;
  async function execute(e: React.FormEvent) {
    e.preventDefault(); if (!run) return; setError(''); setExperiment(null); setReplay('');
    try {
      const response = await act<{ experiment: unknown }>('backtest/daily', { runId: run.id, source: 'kis-rest', code: run.code, from, to, adjustment: policy, fast, slow, capital, feeBps: fee, slippageBps: slip });
      const saved = experimentSchema.parse(response.experiment); setExperiment(saved); setSavedId(saved.id); setRevision(v => v + 1);
    } catch (error) { setError(error instanceof z.ZodError ? '실험 응답 형식이 올바르지 않습니다.' : error instanceof Error ? error.message : '실험 실행 실패'); }
  }
  async function load() {
    setPending(true); setError(''); setExperiment(null); setReplay('');
    try {
      const response = await fetch(`/api/backtest/experiments/${savedId}`, { signal: AbortSignal.timeout(8000) }); if (!response.ok) throw new Error();
      const saved = experimentSchema.parse((await response.json()).experiment); if (saved.id !== savedId) throw new Error();
      const input = saved.snapshot.input;
      setSelected(input.runId); setPolicy(input.adjustment); setFrom(input.from); setTo(input.to); setFast(input.fast); setSlow(input.slow); setCapital(input.capital); setFee(input.feeBps); setSlip(input.slippageBps); setExperiment(saved);
    } catch { setError('저장 실험 조회 실패 · 다시 불러오세요.'); }
    finally { setPending(false); }
  }
  async function verify() {
    if (!experiment) return; setReplay(''); setError('');
    try {
      const response = z.object({ result: backtestResultSchema, matches: z.boolean(), inputHash: z.string() }).parse(await act('backtest/replay', { id: experiment.id }));
      if (response.inputHash !== experiment.inputHash) throw new Error('실험 입력이 일치하지 않습니다.');
      setReplay(response.matches ? '재현 일치 · 고정 입력과 저장 결과가 같습니다.' : '재현 불일치 · 엔진·저장 결과를 점검하세요.');
    } catch (error) { setError(error instanceof Error ? error.message : '재현 검증 실패'); }
  }
  return <div className="data-inventory">
    <div className="notice warning">저장 시점의 KIS 일봉으로 구현 동작을 검토합니다. 입력 달력 대조는 공식 달력·가격 정확성·과거 시점 정보(PIT) 인증이 아닙니다. 실제 KIS 일봉·공식 달력의 실측 검증과 수익성 검증은 별도입니다.</div>
    <Panel title="저장된 실험" action={<button className="button secondary" disabled={locked} onClick={() => setRevision(v => v + 1)}>실험 목록 새로고침</button>}>
      {loading && <p role="status">저장 일봉·실험 목록 조회 중</p>}
      {listError && <p role="alert">{listError}</p>}
      <label className="field">저장 실험<select value={savedId} disabled={locked || !!listError} onChange={e => setSavedId(e.target.value)}><option value="">실험 선택</option>{experiments.map(item => <option key={item.id} value={item.id}>{item.input.code} · {dateInput(item.input.from)} ~ {dateInput(item.input.to)} · {item.input.adjustment === 'raw' ? '원주가' : '수정주가'} · {item.bars}봉 · {item.id.slice(0, 10)}</option>)}</select></label>
      <button className="button secondary" disabled={!savedId || locked || !!listError} onClick={() => void load()}>저장 실험 불러오기</button>
      {!loading && !listError && experiments.length === 0 && <p className="muted">저장된 실험이 없습니다. 실행에 성공하면 입력과 결과가 함께 보존됩니다.</p>}
    </Panel>
    {error && <p role="alert" className="soft-note">{error}</p>}
    <div className="trade-grid top-gap"><div>{experiment ? <section aria-label="저장 일봉 실험 결과">
      <div className="stats-grid three"><Stat label="저장 구간 수익률" value={`${experiment.result.returnPct.toFixed(2)}%`} /><Stat label="최대 낙폭" value={`${experiment.result.maxDrawdown.toFixed(2)}%`} /><Stat label="체결 횟수" value={`${experiment.result.trades.length}회`} /></div>
      <Panel title="자산 곡선" action={<Badge>KIS 저장 일봉</Badge>}>
        <Chart values={experiment.result.equity} height={250} label="저장 일봉 백테스트 평가자산 곡선" />
        <div className="check-row"><span>최종 평가자산</span><strong>{won(experiment.result.finalEquity)}원</strong></div>
        <div className="check-row"><span>누적 수수료</span><strong>{won(experiment.result.fees)}원</strong></div>
        <div className="check-row"><span>누적 슬리피지 비용 (체결가에 포함)</span><strong>{won(experiment.result.slippageCost)}원</strong></div>
        <p>{experiment.result.source}</p>
        <dl className="data-facts">
          <div><dt>고정 입력</dt><dd>{experiment.snapshot.input.code} · {dateInput(experiment.snapshot.input.from)} ~ {dateInput(experiment.snapshot.input.to)} · {experiment.snapshot.bars.length}봉</dd></div>
          <div><dt>가격 정책·수집 기준일</dt><dd>{experiment.snapshot.input.adjustment === 'raw' ? '원주가' : '수정주가'} · {dateInput(experiment.snapshot.collection.captureDate)}</dd></div>
          <div><dt>규칙·자금</dt><dd>단기 {experiment.snapshot.input.fast} / 장기 {experiment.snapshot.input.slow} · {won(experiment.snapshot.input.capital)}원</dd></div>
          <div><dt>비용 가정</dt><dd>수수료 {experiment.snapshot.input.feeBps}bp · 슬리피지 {experiment.snapshot.input.slippageBps}bp</dd></div>
        </dl>
        <details><summary>재현 입력·출처 확인</summary><p>실험 입력 SHA256: <code data-testid="experiment-hash">{experiment.inputHash}</code></p><p>엔진: {experiment.snapshot.engineVersion} · 저장: {experiment.createdAt}</p><p>수집 ID: {experiment.snapshot.collection.id} · 출처: {experiment.snapshot.collection.endpoint}</p><p>입력 달력: {experiment.snapshot.collection.calendar?.source} · 공식 출처 진위 미검증</p><a className="text-link" href={`/api/backtest/experiments/${experiment.id}`} target="_blank" rel="noreferrer">고정 입력·결과 JSON 보기 ↗</a></details>
        <button className="button secondary top-gap" disabled={locked || !available} onClick={() => void verify()}>고정 입력으로 재현 검증</button>
        {replay && <p role="status">{replay}</p>}
      </Panel>
      <Panel title="백테스트 거래 내역" className="top-gap">{experiment.result.trades.length ? <div className="table-scroll"><table><thead><tr><th>신호일 → 체결일</th><th>방향</th><th>체결가</th><th>수량</th><th>수수료</th></tr></thead><tbody>{experiment.result.trades.map(t => <tr key={t.bar}><td>{dateInput(t.signalDate!)} → {dateInput(t.date!)}</td><td>{t.side === 'buy' ? '매수' : '매도'}</td><td>{t.price.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}</td><td>{t.qty}</td><td>{won(t.fee)}</td></tr>)}</tbody></table></div> : <Empty title="교차 신호가 없습니다">이 구간에는 체결된 거래가 없습니다. 거래 0건도 재현할 수 있습니다.</Empty>}</Panel>
    </section> : <Panel><Empty title="저장 일봉으로 실험하세요">기간 안의 종가 신호를 다음 봉 시가에 실행합니다. 최소 장기 기간 + 2봉이 필요하며 기간 이전 봉은 준비 구간에 사용하지 않습니다.</Empty></Panel>}
    <Panel title="계산 가정과 한계" className="top-gap"><p className="prose">종가 이동평균 교차 후 다음 봉 시가에 전액 매수·전량 매도를 가정합니다. 수수료는 매 체결금액 × bp / 10,000을 원 단위 올림합니다. 슬리피지는 매수 시 더하고 매도 시 뺍니다. 자산은 현금 + 보유수량 × 당일 종가, 낙폭은 초기자금을 포함한 최고 자산 대비 하락률입니다.</p><p className="prose">세금·배당·기업행사를 반영하지 않습니다. 원주가의 분할·병합과 수집 시점 수정주가의 사후 조정은 성과 해석을 왜곡할 수 있습니다. 호가단위·유동성·가격제한·미체결은 모델링하지 않으며 0 가격·0 거래량 봉은 거부합니다. 마지막 보유분은 강제 청산하지 않습니다.</p></Panel>
    </div><Panel title="실험 설정"><form onSubmit={execute} onChange={() => { setExperiment(null); setReplay(''); }}>
      <fieldset className="backtest-fields" disabled={locked}><label className="field">수정주가 정책<select value={policy} onChange={e => { setPolicy(e.target.value); choose(runs?.find(row => row.adjustment === e.target.value)); }}><option value="adjusted">수정주가 · 수집 시점 기준</option><option value="raw">원주가 · 기업행사 미반영</option></select></label>
      <label className="field">일봉 수집 기록<select value={selected} onChange={e => choose(runs?.find(row => row.id === e.target.value))}><option value="">수집 기록 선택</option>{runs?.filter(row => row.adjustment === policy).map(row => <option key={row.id} value={row.id}>{row.code} · {dateInput(row.from)} ~ {dateInput(row.to)} · {row.id.slice(0, 8)}</option>)}</select></label>
      {!loading && !listError && runs?.length === 0 && <p>저장된 KIS 일봉이 없습니다</p>}
      {run && <p className="soft-note">{eligible ? '입력 달력 대조 통과 · 실행 시 저장 봉을 다시 검사합니다.' : '부분 수집·품질 실패·달력 미대조 기록은 실행할 수 없습니다.'}</p>}
      <a className="text-link" href="/data">데이터 상태 확인 →</a>
      <div className="form-grid top-gap"><label className="field">시작일<input type="date" required value={from ? dateInput(from) : ''} onChange={e => setFrom(e.target.value.replaceAll('-', ''))} /></label><label className="field">종료일<input type="date" required value={to ? dateInput(to) : ''} onChange={e => setTo(e.target.value.replaceAll('-', ''))} /></label></div>
      <div className="form-grid"><label className="field">단기 (봉)<input type="number" min="2" max="60" value={fast} onChange={e => setFast(Number(e.target.value))} required /></label><label className="field">장기 (봉)<input type="number" min="3" max="100" value={slow} onChange={e => setSlow(Number(e.target.value))} required /></label></div>
      <label className="field">초기 자금 (원)<input type="number" min="100000" max="100000000" value={capital} onChange={e => setCapital(Number(e.target.value))} required /></label>
      <label className="field">수수료 (bp, 1bp = 0.01%)<input type="number" step="0.1" min="0" max="100" value={fee} onChange={e => setFee(Number(e.target.value))} required /></label>
      <label className="field">슬리피지 (bp)<input type="number" step="0.1" min="0" max="100" value={slip} onChange={e => setSlip(Number(e.target.value))} required /></label>
      <p className="muted tiny">기본 비용은 검증용 가정입니다. 선택 기간의 봉·설정·출처·달력·엔진 버전을 고정 저장합니다. 동일 입력은 같은 실험으로 반환합니다.</p>
      <button className="button primary wide" disabled={!available || !eligible || !!listError}><Play size={15} />저장 일봉 실험 실행</button></fieldset>
    </form></Panel></div>
  </div>;
}
