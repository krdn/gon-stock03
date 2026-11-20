import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Play, Plus, Square } from 'lucide-react';
import { useWorkbench } from '../context';
import { Badge, Chart, Empty, Panel, Stat } from '../components/ui';
import { won, type BacktestResult, type Strategy } from '../../shared/model';
import { dailyRunsSchema } from '../../shared/data-inventory';
import type { DailyRun } from '../../shared/market-data';
import { experimentListSchema, experimentSchema, backtestResultSchema, type Experiment } from '../../shared/backtest';
import { z } from 'zod';

import './Strategies.css';

type StrategyEnvironment = 'demo' | 'kis-paper';
const evaluationLabels = { hold: '관망', blocked: '차단', sending: '검사·전송 중', accepted: '접수 · 체결 미확정', unknown: '응답 불명', rejected: '거부 · 미전송' };
const signalLabels = { hold: '관망', buy: '매수', sell: '매도' };
const evaluationTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function Strategies() {
  const [params, setParams] = useSearchParams();
  const { busy, available } = useWorkbench();
  const environment = params.get('environment') === 'kis-paper' ? 'kis-paper' : 'demo';
  const { search } = useLocation();
  return <section className="strategy-studio" aria-label="전략 작업">
    <div className="studio-tools">
      <label className="field">전략 환경
        <select value={environment} disabled={!available || busy} onChange={e => {
          const next = new URLSearchParams(params);
          next.set('environment', e.target.value);
          setParams(next);
        }}>
          <option value="demo">DEMO 합성 봉</option>
          <option value="kis-paper">KIS 모의 체결가 이벤트</option>
        </select>
      </label>
      <Link className="button secondary" to={{ search, hash: '#strategy-editor' }}><Plus size={15} />새 전략 만들기</Link>
    </div>
    <StrategyStudio key={environment} environment={environment} />
  </section>;
}

function StrategyStudio({ environment }: { environment: StrategyEnvironment }) {
  const kis = environment === 'kis-paper';
  const { state, act, busy, available, server, status } = useWorkbench();
  const { search, hash, key } = useLocation();
  const navigate = useNavigate();
  const strategies = server ? state.strategies.filter(s => (s.environment ?? 'demo') === environment) : [];
  const latest = strategies.filter(s => s.evaluations?.length).sort((a, b) =>
    Date.parse(b.evaluations![0].at) - Date.parse(a.evaluations![0].at))[0];
  const evaluation = latest?.evaluations?.[0];
  const [savedId, setSavedId] = useState('');
  useEffect(() => {
    if (savedId) {
      setSavedId('');
      navigate({ search, hash: '#strategy-' + savedId }, { replace: true });
    }
  }, [savedId, navigate, search]);
  let emptyList = '새 규칙을 저장하면 여기에 표시합니다.';
  if (!available) {
    if (status.phase === 'loading') emptyList = '저장 전략을 불러오는 중입니다.';
    else emptyList = server ? '마지막 조회는 0건입니다. 최신 목록은 미확인입니다.' : '로컬 조회 실패 · 저장 전략 미확인';
  }
  const targetId = hash.slice(1);
  const targetExists = targetId === 'strategy-editor' || (kis && targetId === 'strategy-evaluations') ||
    strategies.some(s => targetId === 'strategy-' + s.id);
  useEffect(() => {
    if (!targetExists) return;
    const target = document.getElementById(targetId);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start' });
  }, [targetId, targetExists, key]);
  return <div className="studio-grid">
    <div className="studio-results">
      {kis ? <section className="panel studio-recent" aria-labelledby="strategy-evaluations">
        <h2 id="strategy-evaluations" tabIndex={-1}>최근 KIS 평가</h2>
        {!available && <p className="studio-warning">{status.phase === 'loading' ? '저장된 평가 불러오는 중' : server ? '최신 평가 미확인 · 마지막 조회 기록' : '로컬 조회 실패 · 평가 미확인'}</p>}
        {latest && evaluation ? <>
          <div className="studio-result-line"><span className={'studio-outcome ' + evaluation.status}>{evaluationLabels[evaluation.status]}</span><strong>{evaluation.reason}</strong></div>
          <p className="studio-meta">{latest.name} · revision {evaluation.revision} · {signalLabels[evaluation.signal]}</p>
          <p className="studio-meta"><time dateTime={evaluation.at}>{evaluationTime.format(new Date(evaluation.at))} KST</time> · 로컬 저장 기록</p>
          <Link className="text-link" to={{ search, hash: '#strategy-' + latest.id }}>해당 전략 보기</Link>
        </> : available && <p>{strategies.length ? '평가 기록 없음 · 시작 후 새 체결가 이벤트가 필요합니다.' : '저장된 KIS 전략이 없습니다.'}</p>}
      </section> : <div className="studio-replay">
        <div><strong>DEMO 봉 재생</strong><p className="studio-meta">{available ? `합성 봉 #${state.tick} · ${state.playing ? '3초마다 자동 평가 중' : state.risk.halted ? '긴급정지로 재생 시작 차단' : '재생 정지'}` : '재생 상태 미확인'}</p></div>
        <button className="button secondary" disabled={busy || !available || (!state.playing && state.risk.halted)} onClick={() => void act('playback').catch(() => {})}>{state.playing ? '자동 재생 정지' : '자동 재생 시작'}</button>
      </div>}
      <div className="studio-list-title"><h2>저장 전략</h2><span className="studio-meta">{server ? `${strategies.length}개${available ? '' : ' · 이전 조회'}` : '미확인'}</span></div>
      {!strategies.length && <p className="studio-meta">{emptyList}</p>}
      {strategies.map(strategy => <StrategyCard key={strategy.id} strategy={strategy} kis={kis} />)}
      <details className="panel studio-rules">
        <summary>실행 규칙</summary>
        {kis ? <>
          <p>검증된 KRX 체결가 이벤트의 이동평균 교차를 평가합니다. 분봉·일봉 계산과 단위가 다릅니다. 표본 부족과 교차 없음도 기록합니다.</p>
          <p>계좌 보유 매도가 계약에서 허용되면 수동 보유분도 매도 가능 수량에 포함됩니다. 공통 금액·종목·손실 한도와 승인 검사를 거치며, 거절된 주문의 예약 횟수와 금액도 사용량에 남습니다. 응답 불명은 재전송하지 말고 원장을 대조하세요.</p>
          <p>정지·재시작·연결 중단 후에는 직접 다시 시작해야 합니다. 시작 전에 받은 이벤트는 다시 실행하지 않습니다.</p>
        </> : <p>이동평균의 상향 교차는 매수, 하향 교차는 보유 범위의 매도입니다. 수동 매수 보유분도 포함합니다. 같은 봉을 두 번 평가하지 않습니다. 신규 주문은 다음 봉에서 체결 여부를 판단하며 미체결분은 그 봉에서 만료됩니다. 서버 재시작 시 전략은 정지합니다.</p>}
      </details>
    </div>
    <StrategyEditor environment={environment} onSaved={setSavedId} />
  </div>;
}

function StrategyCard({ strategy: s, kis }: { strategy: Strategy; kis: boolean }) {
  const { state, realtime, act, available, busy, serverNow } = useWorkbench();
  const instrument = state.instruments.find(i => i.code === s.code);
  const quoteAge = realtime?.lastQuoteAt ? serverNow - Date.parse(realtime.lastQuoteAt) : Infinity;
  const freshQuote = quoteAge >= 0 && quoteAge <= (realtime?.quoteSeconds ?? 5) * 1000;
  let blocked = '';
  if (!available) blocked = '로컬 상태 미확인';
  else if (state.risk.halted) blocked = '긴급정지 켜짐';
  else if (kis) {
    if (!realtime?.fresh || !realtime.ordersAllowed) blocked = realtime?.message || '실시간 상태 미확인';
    else if (!freshQuote) blocked = '현재 시세 유효 시간 확인 필요';
    else if (realtime.code !== s.code) blocked = '실시간 대조 종목이 전략과 다릅니다.';
  }
  const evaluations = s.evaluations ?? [];
  const [historyOpen, setHistoryOpen] = useState(false);
  return <Panel className="studio-card">
    <div className="studio-card-head">
      <h3 id={'strategy-' + s.id} tabIndex={-1}>{s.name}</h3>
      <Badge tone={available && s.active ? 'teal' : 'neutral'}>{!available ? '상태 미확인' : s.active ? '실행 중' : '정지'}</Badge>
    </div>
    <p className="studio-meta">{kis ? 'KIS 모의' : 'DEMO'} · revision {s.revision ?? 1} · {instrument?.name ?? s.code}{instrument && ' ' + s.code}</p>
    <div className="studio-terms"><span>단기 <b>{s.fast}{kis ? '이벤트' : '봉'}</b></span><span>장기 <b>{s.slow}{kis ? '이벤트' : '봉'}</b></span><span>회당 <b>{s.qty}주</b></span></div>
    {kis && <Link className="text-link" to={`/settings/trading/strategy?strategy=${encodeURIComponent(s.id)}`}>다음 계약 준비</Link>}
    {kis ? <details className="studio-history" onToggle={e => setHistoryOpen(e.currentTarget.open)}>
      <summary>최근 평가 · {evaluations.length}건 (최대 100건){!available && ' · 이전 조회'}</summary>
      {evaluations.length ? historyOpen && evaluations.map(e => <div className="strategy-evaluation" key={e.event}>
        <p><strong>{evaluationLabels[e.status]}</strong> · {signalLabels[e.signal]} · revision {e.revision}</p>
        <p>{e.reason}</p><p className="studio-meta"><time dateTime={e.at}>{evaluationTime.format(new Date(e.at))} KST</time> · 이벤트 {e.event}</p>
        {e.requestId && <p>요청 ID: <code>{e.requestId}</code> · 주문번호: {e.brokerId ?? '없음'} · <Link to="/paper">원장 대조</Link></p>}
      </div>) : <p>{available ? '평가 기록 없음 · 시작 이후 새 체결가 이벤트가 필요합니다.' : '평가 기록 미확인'}</p>}
    </details> : <p className="studio-meta">마지막 신호 · {s.lastTick < 0 ? '평가 기록 없음' : signalLabels[s.lastSignal]}{!available && ' · 이전 조회'}</p>}
    {!kis && blocked && <p className="studio-warning">신규 실행 차단 · {blocked}</p>}
    {kis && <p className="studio-meta">{blocked ? (s.active ? '신규 주문 차단 · ' : '전략 시작 차단 · ') + blocked : '별도 서버 계약과 주문별 승인·위험 검사 적용'} · <Link to="/paper">실시간 연결·대조 확인</Link></p>}
    {kis && <p className="studio-meta">시작 후 브라우저를 닫아도 서버는 계속 평가합니다. 전략 정지 후에도 접수된 주문은 유지됩니다.</p>}
    <div className="button-row">
      <button disabled={!available || busy || (!s.active && Boolean(blocked))} className={'button ' + (s.active ? 'secondary' : 'primary')} onClick={() => void act(kis ? 'kis/strategies/run' : 'strategies/toggle', kis ? { id: s.id, active: !s.active } : { id: s.id }).catch(() => {})}>
        {s.active ? <Square size={14} /> : <Play size={14} />}{s.active ? '전략 정지' : '전략 시작'}
      </button>
      {!kis && <button disabled={!available || busy} className="button secondary" onClick={() => void act('tick').catch(() => {})}>다음 데모 봉 재생</button>}
    </div>
  </Panel>;
}

function StrategyEditor({ environment, onSaved }: { environment: StrategyEnvironment; onSaved: (id: string) => void }) {
  const { state, act, busy, available } = useWorkbench();
  const [name, setName] = useState('나의 이동평균 전략');
  const [code, setCode] = useState('069500');
  const [fast, setFast] = useState('5'), [slow, setSlow] = useState('20'), [qty, setQty] = useState('1');
  const [attempted, setAttempted] = useState(false);
  const validCode = state.instruments.some(i => i.code === code);
  const invalidPeriods = attempted && fast !== '' && slow !== '' && Number(fast) >= Number(slow);
  const unit = environment === 'kis-paper' ? '이벤트' : '봉';
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAttempted(true);
    if (Number(fast) >= Number(slow)) {
      e.currentTarget.querySelector<HTMLInputElement>('[name="fast"]')?.focus();
      return;
    }
    try {
      const saved = await act<{ id: string }>('strategies', { name, code, fast: Number(fast), slow: Number(slow), qty: Number(qty), environment });
      onSaved(saved.id);
    } catch { /* The workspace announces server errors and keeps the draft. */ }
  }
  return <Panel className="studio-editor">
    <h2 id="strategy-editor" tabIndex={-1}>새 전략 만들기</h2>
    <p className="studio-meta">{environment === 'kis-paper' ? 'KIS 모의' : 'DEMO'} · 새 전략은 revision 1, 정지 상태로 저장됩니다.</p>
    <form onSubmit={save}>
      <label className="field">전략 이름<input value={name} onChange={e => setName(e.target.value)} required maxLength={60} /></label>
      <label className="field">대상 종목<select required value={validCode ? code : ''} onChange={e => setCode(e.target.value)}>{!validCode && <option value="">
        {state.instruments.length ? '종목을 선택하세요' : '저장 가능한 종목 없음'}</option>}{state.instruments.map(i => <option key={i.code} value={i.code}>{i.name}</option>)}</select></label>
      <div className="form-grid">
        <label className="field">단기 평균 ({unit})<input name="fast" type="number" min="2" max="60" value={fast} onChange={e => setFast(e.target.value)} required aria-invalid={invalidPeriods || undefined} aria-describedby={invalidPeriods ? 'strategy-period-error' : undefined} /></label>
        <label className="field">장기 평균 ({unit})<input type="number" min="3" max="100" value={slow} onChange={e => setSlow(e.target.value)} required aria-invalid={invalidPeriods || undefined} aria-describedby={invalidPeriods ? 'strategy-period-error' : undefined} /></label>
      </div>
      {invalidPeriods && <p className="studio-warning" id="strategy-period-error" role="alert">단기 평균은 장기 평균보다 작아야 합니다.</p>}
      <label className="field">회당 수량 (주)<input type="number" min="1" max="10000" value={qty} onChange={e => setQty(e.target.value)} required /></label>
      <button disabled={!available || busy || !validCode} className="button primary wide">전략 저장</button>
    </form>
  </Panel>;
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
