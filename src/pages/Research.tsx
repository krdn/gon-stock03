import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Play, Plus, Square } from 'lucide-react';
import { useWorkbench } from '../context';
import { Badge, Chart, Panel, Stat } from '../components/ui';
import { won, type BacktestResult, type Strategy } from '../../shared/model';
import { dailyRunsSchema } from '../../shared/data-inventory';
import type { DailyRun } from '../../shared/market-data';
import { experimentListSchema, experimentSchema, backtestResultSchema, type Experiment } from '../../shared/backtest';
import { z } from 'zod';

import './Strategies.css';
import './Backtest.css';

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
  const loading = status.phase === 'loading';
  const rechecking = loading && Boolean(server);
  let emptyList = '새 규칙을 저장하면 여기에 표시합니다.';
  let evaluationNotice = '';
  let replayStatus = `합성 봉 #${state.tick} · ${state.playing ? '3초마다 자동 평가 중' : state.risk.halted ? '긴급정지로 재생 시작 차단' : '재생 정지'}`;
  if (!available) {
    if (loading) emptyList = rechecking ? '저장 전략 재확인 중 · 마지막 조회는 0건입니다.' : '저장 전략을 불러오는 중입니다.';
    else emptyList = server ? '마지막 조회는 0건입니다. 최신 목록은 미확인입니다.' : '로컬 조회 실패 · 저장 전략 미확인';
    if (server) {
      const previous = evaluation ? '마지막 조회 기록' : '마지막 조회에서 평가 기록 없음';
      evaluationNotice = (rechecking ? '최신 평가 재확인 중' : '최신 평가 미확인') + ' · ' + previous;
    } else {
      evaluationNotice = loading ? '저장된 평가 불러오는 중' : '로컬 조회 실패 · 평가 미확인';
    }
    replayStatus = rechecking ? '재생 상태 재확인 중' : loading ? '재생 상태 조회 중' : '재생 상태 미확인';
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
        {evaluationNotice && <p className={loading ? 'studio-meta' : 'studio-warning'}>{evaluationNotice}</p>}
        {latest && evaluation ? <>
          <div className="studio-result-line"><span className={'studio-outcome ' + evaluation.status}>{evaluationLabels[evaluation.status]}</span><strong>{evaluation.reason}</strong></div>
          <p className="studio-meta">{latest.name} · revision {evaluation.revision} · {signalLabels[evaluation.signal]}</p>
          <p className="studio-meta"><time dateTime={evaluation.at}>{evaluationTime.format(new Date(evaluation.at))} KST</time> · 로컬 저장 기록</p>
          <Link className="text-link" to={{ search, hash: '#strategy-' + latest.id }}>해당 전략 보기</Link>
        </> : available && <p>{strategies.length ? '평가 기록 없음 · 시작 후 새 체결가 이벤트가 필요합니다.' : '저장된 KIS 전략이 없습니다.'}</p>}
      </section> : <div className="studio-replay">
        <div><strong>DEMO 봉 재생</strong><p className="studio-meta">{replayStatus}</p></div>
        <button className="button secondary" disabled={busy || !available || (!state.playing && state.risk.halted)} onClick={() => void act('playback').catch(() => {})}>{!available ? '자동 재생 제어' : state.playing ? '자동 재생 정지' : '자동 재생 시작'}</button>
      </div>}
      <div className="studio-list-title"><h2>저장 전략</h2><span className="studio-meta">{server ? `${strategies.length}개${available ? '' : ' · 이전 조회'}` : loading ? '조회 중' : '미확인'}</span></div>
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
  const { state, realtime, act, available, busy, serverNow, status } = useWorkbench();
  const instrument = state.instruments.find(i => i.code === s.code);
  const quoteAge = realtime?.lastQuoteAt ? serverNow - Date.parse(realtime.lastQuoteAt) : Infinity;
  const freshQuote = quoteAge >= 0 && quoteAge <= (realtime?.quoteSeconds ?? 5) * 1000;
  let blocked = '';
  if (state.risk.halted) blocked = '긴급정지 켜짐';
  else if (kis) {
    if (!realtime?.fresh || !realtime.ordersAllowed) blocked = realtime?.message || '실시간 상태 미확인';
    else if (!freshQuote) blocked = '현재 시세 유효 시간 확인 필요';
    else if (realtime.code !== s.code) blocked = '실시간 대조 종목이 전략과 다릅니다.';
  }
  let controlNote = '';
  const rechecking = status.phase === 'loading';
  if (rechecking) controlNote = '서버 실행 상태 재확인 중 · 시작·정지 대기';
  else if (!available) controlNote = status.error ? '서버 실행 상태 미확인 · 연결 복구 전 시작·정지 불가' : '서버 실행 상태 미확인 · 최신 상태 확인 필요';
  else if (blocked) controlNote = (s.active ? '신규 주문 차단 · ' : '전략 시작 차단 · ') + blocked;
  const evaluations = s.evaluations ?? [];
  const [historyOpen, setHistoryOpen] = useState(false);
  return <Panel className="studio-card">
    <div className="studio-card-head">
      <h3 id={'strategy-' + s.id} tabIndex={-1}>{s.name}</h3>
      <Badge tone={available && s.active ? 'teal' : 'neutral'}>{rechecking ? '재확인 중' : !available ? '상태 미확인' : s.active ? '실행 중' : '정지'}</Badge>
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
    {!kis && controlNote && <p className={rechecking ? 'studio-meta' : 'studio-warning'}>{controlNote}</p>}
    {kis && <p className="studio-meta">{controlNote || '별도 서버 계약과 주문별 승인·위험 검사 적용'} · <Link to="/paper">실시간 연결·대조 확인</Link></p>}
    {kis && <p className="studio-meta">시작 후 브라우저를 닫아도 서버는 계속 평가합니다. 전략 정지 후에도 접수된 주문은 유지됩니다.</p>}
    <div className="button-row">
      <button disabled={!available || busy || (!s.active && Boolean(blocked))} className={'button ' + (!available || s.active ? 'secondary' : 'primary')} onClick={() => void act(kis ? 'kis/strategies/run' : 'strategies/toggle', kis ? { id: s.id, active: !s.active } : { id: s.id }).catch(() => {})}>
        {available && (s.active ? <Square size={14} /> : <Play size={14} />)}{!available ? '전략 실행 제어' : s.active ? '전략 정지' : '전략 시작'}
      </button>
      {!kis && <button disabled={!available || busy} className="button secondary" onClick={() => void act('tick').catch(() => {})}>다음 데모 봉 재생</button>}
    </div>
  </Panel>;
}

function StrategyEditor({ environment, onSaved }: { environment: StrategyEnvironment; onSaved: (id: string) => void }) {
  const { state, act, busy, available, server, status } = useWorkbench();
  const [name, setName] = useState('나의 이동평균 전략');
  const [code, setCode] = useState('069500');
  const [fast, setFast] = useState('5'), [slow, setSlow] = useState('20'), [qty, setQty] = useState('1');
  const [attempted, setAttempted] = useState(false);
  const instruments = server ? state.instruments : [];
  const noSelection = !available ? (status.phase === 'loading' ? '종목 목록 조회 중' : '종목 목록 미확인') :
    instruments.length ? '종목을 선택하세요' : '저장 가능한 종목 없음';
  const validCode = instruments.some(i => i.code === code);
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
      <label className="field">대상 종목<select required disabled={!available || busy} value={validCode ? code : ''} onChange={e => setCode(e.target.value)}>{!validCode && <option value="">{noSelection}</option>}{instruments.map(i => <option key={i.code} value={i.code}>{i.name}</option>)}</select></label>
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

type ExperimentInput = Experiment['snapshot']['input'];
type Assumptions = Pick<ExperimentInput, 'fast' | 'slow' | 'capital' | 'feeBps' | 'slippageBps'>;
const defaultAssumptions: Assumptions = { fast: 5, slow: 20, capital: 10000000, feeBps: 1.5, slippageBps: 5 };
const dateInput = (value?: string) => value ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}` : '';
const pricePolicy = (value: string) => value === 'raw' ? '원주가' : '수정주가';

function assumptions({ fast, slow, capital, feeBps, slippageBps }: Assumptions): Assumptions {
  return { fast, slow, capital, feeBps, slippageBps };
}

function ExperimentFields({ values, change }: { values: Assumptions; change: (values: Assumptions) => void }) {
  function field(key: keyof Assumptions, label: string, min: number, max: number, step = 1) {
    return <label className="field">{label}<input type="number" min={min} max={max} step={step} required
      value={Number.isNaN(values[key]) ? '' : values[key]} onChange={event => change({ ...values, [key]: event.target.valueAsNumber })} /></label>;
  }
  return <>
    <div className="form-grid">{field('fast', '단기 (봉)', 2, 60)}{field('slow', '장기 (봉)', 3, 100)}</div>
    {field('capital', '초기 자금 (원)', 100000, 100000000)}
    <div className="form-grid">{field('feeBps', '수수료 (bp, 1bp = 0.01%)', 0, 100, 0.1)}{field('slippageBps', '슬리피지 (bp)', 0, 100, 0.1)}</div>
  </>;
}

function ResultSummary({ result, label }: { result: BacktestResult; label: string }) {
  return <><div className="stats-grid three"><Stat label={label} value={`${result.returnPct.toFixed(2)}%`} /><Stat label="최대 낙폭" value={`${result.maxDrawdown.toFixed(2)}%`} /><Stat label="체결 횟수" value={`${result.trades.length}회`} /></div>
    <p>최종 평가자산 <strong>{won(result.finalEquity)}원</strong> · 누적 수수료 {won(result.fees)}원 · 체결가에 포함된 슬리피지 {won(result.slippageCost)}원</p></>;
}

function Trades({ result, daily }: { result: BacktestResult; daily?: boolean }) {
  return <Panel title="백테스트 거래 내역">{result.trades.length ? <div className="table-scroll"><table>
    <thead><tr><th>{daily ? '신호일 → 체결일' : '봉 번호'}</th><th>방향</th><th>체결가 (원)</th><th>수량 (주)</th><th>수수료 (원)</th></tr></thead>
    <tbody>{result.trades.map(t => <tr key={t.bar}><td>{daily ? `${dateInput(t.signalDate) || '미확인'} → ${dateInput(t.date) || '미확인'}` : t.bar}</td>
      <td>{t.side === 'buy' ? '매수' : '매도'}</td><td>{t.price.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}</td><td>{t.qty}</td><td>{won(t.fee)}</td></tr>)}</tbody>
  </table></div> : <p>이 구간에는 체결된 거래가 없습니다.</p>}</Panel>;
}

function useResultFocus(result: unknown) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (result && ref.current) {
      ref.current.focus({ preventScroll: true });
      ref.current.scrollIntoView({ block: 'start' });
    }
  }, [result]);
  return ref;
}

function DemoBacktest() {
  const { state, act, available, busy } = useWorkbench();
  const [selection, setSelection] = useState<string | null>(null), [values, setValues] = useState(defaultAssumptions);
  const [calculation, setCalculation] = useState<{ code: string; result: BacktestResult } | null>(null), [error, setError] = useState('');
  const instrument = selection === null
    ? state.instruments.find(row => row.code === '069500') ?? state.instruments[0]
    : state.instruments.find(row => row.code === selection);
  const code = instrument?.code ?? '';
  const result = calculation?.code === code ? calculation.result : null;
  const resultRef = useResultFocus(result);
  async function run(event: React.FormEvent) {
    event.preventDefault(); setCalculation(null); setError('');
    if (!code || busy || !available) return;
    if (values.fast >= values.slow) { setError('단기 기간은 장기 기간보다 작아야 합니다.'); return; }
    try {
      const response = await act<{ result: unknown }>('backtest', { code, ...values });
      setCalculation({ code, result: backtestResultSchema.parse(response.result) });
    } catch (err) { setError(err instanceof z.ZodError ? '실험 응답 형식이 올바르지 않습니다.' : err instanceof Error ? err.message : '합성 실험 계산 실패'); }
  }
  return <div className="bt-grid"><Panel title="합성 실험 설정"><p className="bt-note">현재 저장된 합성 봉으로 계산하는 기능 검증입니다. 다음 봉 종가에 체결한다고 가정합니다. 실제 과거 성과는 미측정입니다.</p>
    <form onSubmit={run} onChange={() => { setCalculation(null); setError(''); }}><fieldset className="backtest-fields" disabled={busy}>
      <label className="field">대상<select value={code} onChange={event => setSelection(event.target.value)}>{!code && <option value="" disabled>{state.instruments.length ? '종목을 다시 선택하세요' : '합성 종목 없음'}</option>}{state.instruments.map(item => <option value={item.code} key={item.code}>{item.name}</option>)}</select></label>
      {!code && <p role="status">{state.instruments.length ? '선택한 합성 종목을 찾을 수 없습니다. 대상을 다시 선택하세요.' : '계산할 합성 종목이 없습니다.'}</p>}
      <ExperimentFields values={values} change={setValues} />
      <p className="bt-note">비용은 검증용 가정이며 세금은 포함하지 않습니다. 결과는 이 화면에서 확인합니다.</p>
      {error && <p role="alert" className="bt-warning">합성 실험 입력·계산 확인 · {error}</p>}
      <button className="button primary wide" disabled={!available || !code}><Play size={15} />백테스트 실행</button>
    </fieldset></form></Panel>
    {result && <section aria-label="합성 실험 결과" ref={resultRef} tabIndex={-1} className="bt-result">
      <Panel title="합성 실험 결과"><strong>{code} · {result.source}</strong>
        <p>단기 {values.fast} / 장기 {values.slow} · 초기 {won(values.capital)}원 · 수수료 {values.feeBps}bp · 슬리피지 {values.slippageBps}bp</p>
        <ResultSummary result={result} label="합성 구간 수익률" /></Panel>
      <Panel title="자산 곡선"><Chart values={result.equity} height={230} label="합성 데이터 백테스트 평가자산 곡선" /><p className="bt-note">마지막 보유분은 평가하며 강제 청산하지 않습니다.</p></Panel>
      <Trades result={result} />
    </section>}
  </div>;
}

type BacktestSelection = { values: Assumptions; focus: 'policy' | 'run' } | { saved: Experiment };

export function Backtest() {
  const [params, setParams] = useSearchParams(), location = useLocation();
  const transfer = useRef<{ key: string; selection: BacktestSelection } | null>(null);
  const { busy } = useWorkbench();
  const source = params.get('source') ?? 'stored', runId = params.get('run');
  const valid = params.getAll('source').length <= 1 && params.getAll('run').length <= 1
    && (source === 'stored' || source === 'demo') && (runId === null || (params.get('source') === 'stored' && z.uuid().safeParse(runId).success));
  function select(nextSource: string, nextRun?: string, selection?: BacktestSelection) {
    if (valid && nextSource === source && nextRun === undefined && !selection) return;
    const next = new URLSearchParams(params); next.set('source', nextSource); next.delete('run');
    if (nextRun) next.set('run', nextRun);
    transfer.current = selection ? { key: crypto.randomUUID(), selection } : null;
    setParams(next, { state: { backtestSelection: transfer.current?.key } });
  }
  const initial = transfer.current && transfer.current.key === location.state?.backtestSelection ? transfer.current.selection : null;
  return <div className="bt-page"><label className="field bt-source">데이터 출처<select disabled={busy} value={valid ? source : ''} onChange={event => select(event.target.value)}>
    {!valid && <option value="" disabled>출처를 다시 선택하세요</option>}
    <option value="stored">KIS 저장 일봉 · 과거 구간 실험</option><option value="demo">DEMO 합성 · 기능 검증</option>
  </select></label>
    {!valid ? <p className="bt-warning" role="alert">백테스트 주소의 출처 또는 수집 ID가 올바르지 않습니다. 데이터 출처를 직접 선택하세요.</p>
      : source === 'demo' ? <DemoBacktest /> : <StoredBacktest key={runId ?? 'default'} requested={runId} initial={initial} select={(id, selection) => select('stored', id, selection)} />}
  </div>;
}

function StoredBacktest({ requested, initial, select }: { requested: string | null; initial: BacktestSelection | null; select: (id: string, selection: BacktestSelection) => void }) {
  const { act, available, busy } = useWorkbench();
  const saved = initial && 'saved' in initial ? initial.saved : null;
  const draft = initial && 'values' in initial ? initial : null;
  const input = saved?.snapshot.input;
  const [runs, setRuns] = useState<DailyRun[] | null>(null), [experiments, setExperiments] = useState<z.infer<typeof experimentListSchema>['experiments']>([]);
  const [selected, setSelected] = useState<string | null>(requested), [savedId, setSavedId] = useState(saved?.id ?? '');
  const [from, setFrom] = useState(input?.from ?? ''), [to, setTo] = useState(input?.to ?? ''), [values, setValues] = useState<Assumptions>(() => assumptions(input ?? draft?.values ?? defaultAssumptions));
  const [experiment, setExperiment] = useState<Experiment | null>(saved), [replay, setReplay] = useState('');
  const [loading, setLoading] = useState(true), [pending, setPending] = useState(false), [error, setError] = useState(''), [loadError, setLoadError] = useState(''), [listError, setListError] = useState(''), [revision, setRevision] = useState(0);
  const [replayError, setReplayError] = useState('');
  const loader = useRef<AbortController | null>(null);
  const resultRef = useResultFocus(experiment);
  const policySelect = useRef<HTMLSelectElement>(null), runSelect = useRef<HTMLSelectElement>(null);
  const focusAfterSelection = useRef(draft?.focus);
  useEffect(() => {
    if (!loading && !listError && focusAfterSelection.current) {
      (focusAfterSelection.current === 'policy' ? policySelect : runSelect).current?.focus();
      focusAfterSelection.current = undefined;
    }
  }, [loading, listError]);
  useEffect(() => () => loader.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setListError(''); setLoadError('');
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
    void (async () => {
      try {
        const [dailyResponse, savedResponse] = await Promise.all([fetch('/api/data/daily', { signal }), fetch('/api/backtest/experiments', { signal })]);
        if (!dailyResponse.ok || !savedResponse.ok) throw new Error();
        const daily = dailyRunsSchema.parse(await dailyResponse.json()), saved = experimentListSchema.parse(await savedResponse.json());
        if (controller.signal.aborted) return;
        const id = selected ?? daily.runs[0]?.id;
        const match = daily.runs.find(row => row.id === id);
        setRuns(daily.runs); setExperiments(saved.experiments);
        setSavedId(previous => saved.experiments.some(row => row.id === previous) ? previous : (saved.experiments.find(row => row.input.runId === id) ?? (requested === null ? saved.experiments[0] : undefined))?.id ?? '');
        if (match && (!runs || selected === null)) { setSelected(match.id); setFrom(input?.from ?? match.from); setTo(input?.to ?? match.to); }
      } catch { if (!controller.signal.aborted) setListError(runs === null ? '실험 목록 조회 실패 · 저장 일봉과 실험 목록을 확인하지 못했습니다.' : '실험 목록 조회 실패 · 이전 목록은 최신 확인값이 아닙니다.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [revision]);
  const run = runs?.find(row => row.id === selected);
  const policy = run?.adjustment ?? runs?.[0]?.adjustment ?? 'adjusted';
  const eligible = run?.coverageComplete && run.nextDate === null && run.status.complete && !run.status.error && run.quality.state === 'passed' && !!run.calendar;
  const locked = busy || pending || loading;
  function chooseRun(id: string | undefined, focus: 'policy' | 'run') {
    if (id && id !== selected) select(id, { values, focus });
  }
  function clearResult() { setExperiment(null); setReplay(''); setReplayError(''); setError(''); }
  async function execute(event: React.FormEvent) {
    event.preventDefault(); if (!run || !eligible || locked || listError || !available) return;
    clearResult();
    if (values.fast >= values.slow) { setError('단기 기간은 장기 기간보다 작아야 합니다.'); return; }
    if (from > to) { setError('시작일은 종료일보다 늦을 수 없습니다.'); return; }
    try {
      const response = await act<{ experiment: unknown }>('backtest/daily', { ...values, runId: run.id, source: run.source, code: run.code, from, to, adjustment: policy });
      const saved = experimentSchema.parse(response.experiment);
      setExperiment(saved); setSavedId(saved.id);
      setExperiments(items => items.some(item => item.id === saved.id) ? items : [
        { id: saved.id, createdAt: saved.createdAt, input: saved.snapshot.input, bars: saved.snapshot.bars.length }, ...items,
      ]);
    } catch (err) { setError(err instanceof z.ZodError ? '실험 응답 형식이 올바르지 않습니다.' : err instanceof Error ? err.message : '실험 실행 실패'); }
  }
  async function load() {
    setPending(true); setLoadError(''); clearResult();
    const controller = new AbortController(); loader.current = controller;
    try {
      const response = await fetch(`/api/backtest/experiments/${savedId}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
      if (!response.ok) throw new Error();
      const saved = experimentSchema.parse((await response.json()).experiment);
      if (controller.signal.aborted) return;
      if (saved.id !== savedId) throw new Error();
      const fixed = saved.snapshot.input;
      if (fixed.runId !== selected) { select(fixed.runId, { saved }); return; }
      setFrom(fixed.from); setTo(fixed.to); setValues(assumptions(fixed)); setExperiment(saved);
    } catch { if (!controller.signal.aborted) setLoadError('저장 실험 조회 실패 · 다시 불러오세요.'); }
    finally { if (!controller.signal.aborted) setPending(false); }
  }
  async function verify() {
    if (!experiment) return; setReplay(''); setReplayError('');
    try {
      const response = z.object({ result: backtestResultSchema, matches: z.boolean(), inputHash: z.string() }).parse(await act('backtest/replay', { id: experiment.id }));
      if (response.inputHash !== experiment.inputHash) throw new Error('실험 입력이 일치하지 않습니다.');
      if (response.matches) setReplay('재현 일치 · 고정 입력과 저장 결과가 같습니다.');
      else setReplayError('재현 불일치 · 엔진·저장 결과를 점검하세요.');
    } catch (err) { setReplayError(err instanceof z.ZodError ? '재현 응답 형식이 올바르지 않습니다.' : err instanceof Error ? err.message : '재현 결과를 확인하지 못했습니다.'); }
  }
  return <><div className="bt-nav"><span>KIS 저장 일봉 · 종가 신호 → 다음 봉 시가 체결</span><a className="text-link" href="#backtest-history">저장된 실험으로 이동 ↓</a></div>
    {loading && <p role="status">저장 일봉·실험 목록 조회 중</p>}
    {listError && <p className="bt-warning" role="alert">{listError} <button className="text-link" onClick={() => setRevision(v => v + 1)}>다시 조회</button></p>}
    <div className="bt-grid"><Panel title="저장 일봉 실험 설정"><form onSubmit={execute} onChange={event => {
      const control = event.nativeEvent.target;
      if (control !== runSelect.current && control !== policySelect.current) clearResult();
    }}>
      <fieldset className="backtest-fields" disabled={locked || !!listError}>
        {!loading && !listError && selected && !run && <p className="bt-warning" role="alert">요청한 수집 기록을 찾을 수 없습니다. 데이터 상태를 확인하거나 기록을 직접 선택하세요.</p>}
        {!loading && !listError && !runs?.length && <p>저장된 KIS 일봉이 없습니다</p>}
        <div className="bt-pickers"><label className="field">수정주가 정책<select ref={policySelect} value={policy} onChange={event => {
            if (run?.adjustment !== event.target.value) chooseRun(runs?.find(row => row.adjustment === event.target.value)?.id, 'policy');
          }}>
          <option value="adjusted" disabled={!runs?.some(row => row.adjustment === 'adjusted')}>수정주가 · 수집 시점 기준</option><option value="raw" disabled={!runs?.some(row => row.adjustment === 'raw')}>원주가 · 기업행사 미반영</option></select></label>
          <label className="field">일봉 수집 기록<select ref={runSelect} value={run?.id ?? ''} onChange={event => chooseRun(event.target.value, 'run')}>
            <option value="" disabled>수집 기록 선택</option>{runs?.filter(row => row.adjustment === policy).map(row => <option key={row.id} value={row.id}>{row.code} · {dateInput(row.from)} ~ {dateInput(row.to)} · {row.id.slice(0, 8)}</option>)}</select></label></div>
        {run && <p className={eligible ? 'bt-note' : 'bt-warning'}>{eligible ? `입력 달력 대조 통과 · 수집 기준일 ${dateInput(run.captureDate)}` : !run.coverageComplete || run.nextDate ? '부분 수집 · 수집 구간이 끝나지 않아 실행할 수 없습니다.' : !run.calendar || run.quality.state === 'unverified' ? '입력 달력 미대조 · 실행할 수 없습니다.' : '수집 상태·품질 확인 필요 · 실행할 수 없습니다.'}</p>}
        <div className="form-grid"><label className="field">시작일<input type="date" required value={dateInput(from)} min={run && dateInput(run.from)} max={run && dateInput(run.to)} onChange={event => setFrom(event.target.value.replaceAll('-', ''))} /></label><label className="field">종료일<input type="date" required value={dateInput(to)} min={run && dateInput(run.from)} max={run && dateInput(run.to)} onChange={event => setTo(event.target.value.replaceAll('-', ''))} /></label></div>
        <ExperimentFields values={values} change={setValues} />
        <p className="bt-note">선택 기간에 장기 기간 + 2봉 이상이 필요합니다. 실행하면 입력·비용 가정과 결과를 함께 저장합니다.</p>
        {error && <p className="bt-warning" role="alert">저장 일봉 실험 실패 · {error}</p>}
        <button className="button primary wide" disabled={!available || !eligible}><Play size={15} />저장 일봉 실험 실행</button>
      </fieldset></form><Link className="text-link" to={run ? `/data?run=${run.id}#inventory-daily` : '/data#inventory-daily'}>데이터 상태 확인 →</Link></Panel>
      <div className="bt-output">
        {experiment && <section ref={resultRef} tabIndex={-1} className="bt-result" aria-label="저장 일봉 실험 결과">
          <Panel title="저장 일봉 실험 결과"><strong>{experiment.snapshot.input.code} · {pricePolicy(experiment.snapshot.input.adjustment)} · {experiment.snapshot.bars.length}봉</strong>
            <p>{dateInput(experiment.snapshot.input.from)} ~ {dateInput(experiment.snapshot.input.to)} · 수집 기준일 {dateInput(experiment.snapshot.collection.captureDate)}</p>
            <p>단기 {experiment.snapshot.input.fast} / 장기 {experiment.snapshot.input.slow} · 초기 {won(experiment.snapshot.input.capital)}원 · 수수료 {experiment.snapshot.input.feeBps}bp · 슬리피지 {experiment.snapshot.input.slippageBps}bp</p>
            <ResultSummary result={experiment.result} label="저장 구간 수익률" />
            <button className="button secondary" disabled={locked || !available} onClick={() => void verify()}>고정 입력으로 재현 검증</button>
            {replay && <p role="status">{replay}</p>}{replayError && <p role="alert" className="bt-warning">재현 검증 실패 · {replayError}</p>}
            <details><summary>재현 입력·출처 확인</summary><p>실험 입력 SHA256 <code data-testid="experiment-hash">{experiment.inputHash}</code></p>
              <p>엔진 {experiment.snapshot.engineVersion} · 저장 {experiment.createdAt}</p><p>수집 ID {experiment.snapshot.collection.id} · 출처 {experiment.snapshot.collection.endpoint}</p>
              <p>입력 달력 {experiment.snapshot.collection.calendar?.source ?? '미기록'} · 공식 출처 진위 미검증</p>
              <a className="text-link" href={`/api/backtest/experiments/${experiment.id}`} target="_blank" rel="noreferrer">고정 입력·결과 JSON 보기 ↗</a></details>
          </Panel><Panel title="자산 곡선"><Chart values={experiment.result.equity} height={230} label="저장 일봉 백테스트 평가자산 곡선" /><p>{experiment.result.source}</p></Panel>
          <Trades result={experiment.result} daily />
        </section>}
        <section id="backtest-history" tabIndex={-1}><Panel title="저장된 실험" action={<button className="button secondary" disabled={locked} onClick={() => setRevision(v => v + 1)}>실험 목록 새로고침</button>}>
          {!loading && !listError && experiments.length === 0 ? <p>저장된 실험이 없습니다. 실행에 성공하면 입력과 결과가 함께 보존됩니다.</p> : <>
            <label className="field">저장 실험<select value={savedId} disabled={locked || !!listError} onChange={event => { setSavedId(event.target.value); setLoadError(''); }}><option value="">실험 선택</option>{experiments.map(item => <option key={item.id} value={item.id}>{item.input.code} · {dateInput(item.input.from)} ~ {dateInput(item.input.to)} · {pricePolicy(item.input.adjustment)} · {item.bars}봉 · {item.id.slice(0, 10)}</option>)}</select></label>
            <button className="button secondary" disabled={!savedId || locked || !!listError} onClick={() => void load()}>저장 실험 불러오기</button></>}
          {loadError && <p role="alert" className="bt-warning">{loadError}</p>}
        </Panel></section>
        <Panel title="계산 가정과 한계"><p>세금·배당·기업행사를 반영하지 않습니다. 입력 달력의 공식성·가격 정확성·과거 시점 정보(PIT)와 실제 수익성은 미검증입니다.</p>
          <details><summary>체결·비용·평가 방식</summary><p>종가 교차 후 다음 봉 시가에 전액 매수·전량 매도합니다. 수수료는 체결금액 × bp / 10,000을 원 단위 올림합니다. 슬리피지는 매수 시 더하고 매도 시 뺍니다.</p>
            <p>낙폭은 초기자금을 포함한 최고 평가자산 대비 하락률입니다. 마지막 보유분은 종가로 평가합니다. 원주가 분할·병합과 수정주가 사후 조정에 유의하세요. 호가단위·유동성·가격제한·미체결은 모델링하지 않습니다.</p></details>
        </Panel>
      </div>
    </div></>;
}
