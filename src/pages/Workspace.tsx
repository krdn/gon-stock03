import { useId, useRef, useState } from 'react';
import { MorningPortfolio } from '../components/MorningPortfolio';
import { PortfolioHelpPanel } from '../components/PortfolioHelpPanel';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BookOpen, RefreshCw, ShieldCheck, Star, Zap } from 'lucide-react';
import { useWorkbench } from '../context';
import { Badge, Change, Chart, DataStatusLine, Empty, PageLink, Panel, Stat, confirmedAt, phaseLabels } from '../components/ui';
import { equity, won, type Instrument } from '../../shared/model';
import { portfolioValue } from '../../shared/portfolio';
import { BALANCE_STALE_MS } from '../../shared/status';
import './dashboard-v2.css';
import './portfolio.css';
import { MarketExplorer } from './MarketExplorer';

export function InstrumentTable({ instruments }: { instruments: Instrument[] }) {
  const { state, act, busy, available } = useWorkbench();
  return <div className="table-scroll"><table><thead><tr><th>관심</th><th>종목명 / 코드</th><th>현재가</th><th>등락률</th><th className="spark-header">가격 흐름 <span className="muted">· 합성</span></th><th>거래량</th><th><span className="sr-only">종목 열기</span></th></tr></thead><tbody>{instruments.map(s => <tr key={s.code}><td><button className={`star-button ${state.watchlist.includes(s.code) ? 'selected' : ''}`} aria-label={`${s.name} 관심 ${state.watchlist.includes(s.code) ? '해제' : '등록'}`} disabled={busy || !available} onClick={() => void act('watchlist', { code: s.code }).catch(() => {})}><Star size={17} /></button></td><td><Link className="stock-name" to={`/trade?code=${s.code}`}>{s.name}<small>{s.code}<span>{s.market}</span></small></Link></td><td className="number">{won(s.price)}</td><td><Change value={s.change} /></td><td className="spark-cell"><Chart values={s.history.slice(-30)} height={35} color={s.change >= 0 ? 'var(--red)' : 'var(--blue)'} area={false} label={`${s.name} 합성 가격 추이`} /></td><td className="number muted">{(s.volume / 10000).toFixed(1)}만</td><td><Link className="table-action" to={`/trade?code=${s.code}`} aria-label={`${s.name} 트레이딩`}><ArrowUpRight size={17} /></Link></td></tr>)}</tbody></table></div>;
}
export function Dashboard() {
  const { state, status, connection, paperRisk, available, realtime, serverNow } = useWorkbench();
  const quoteAge = realtime?.lastQuoteAt ? serverNow - Date.parse(realtime.lastQuoteAt) : Infinity;
  const realtimeReady = available && realtime?.fresh && realtime.ordersAllowed && quoteAge >= 0 && quoteAge <= (realtime.quoteSeconds ?? 5) * 1000;
  const demo = portfolioValue(state.cash, state.positions.map(p => ({ ...p, name: p.code, price: state.instruments.find(s => s.code === p.code)?.price ?? null })));
  const kis = connection.balance ? portfolioValue(connection.balance.cash, connection.balance.positions) : null;
  const money = (value: number | null) => value === null ? '평가 불가' : `${won(value)}원`;
  const profit = (value: number | null) => value === null ? '평가 불가' : `${value >= 0 ? '+' : ''}${won(value)}원`;
  const ordersAge = paperRisk?.orders ? serverNow - Date.parse(paperRisk.orders.observedAt) : Infinity;
  const ordersKnown = available && paperRisk?.orders && ordersAge >= 0 && ordersAge < BALANCE_STALE_MS;
  const pending = paperRisk?.orders?.rows.filter(o => !o.cancelled && o.remaining > 0).length;
  const important = state.events.filter(e => e.level !== 'info').slice(0, 3);
  const demoStrategies = state.strategies.filter(s => s.environment !== 'kis-paper');
  const kisStrategies = state.strategies.filter(s => s.environment === 'kis-paper');
  const hasLocalSnapshot = available || Boolean(status.lastSuccessAt);
  const localNotice = status.lastSuccessAt ? '이전 DEMO 확인값 · 최신 아님'
    : status.phase === 'loading' ? 'DEMO 조회 중 · 서버 확인 전' : 'DEMO 서버 미확인';
  const currentBalance = available && connection.connected && connection.status.phase === 'ready' && connection.status.complete;
  const market = state.instruments.find(s => s.code === '069500');
  return <>
    {important.length > 0 && <section className="dash-alerts" aria-label="중요 알림">
      {important.map(e => <div className="dash-alert" key={e.id}>
        <strong>{e.level === 'error' ? '오류' : '경고'} · {e.environment === 'kis-paper' ? 'KIS 모의' : e.environment === 'shared' ? '공통 위험' : 'DEMO'}</strong>
        <Link to={e.target === 'strategies' ? `/strategies?environment=${e.environment === 'kis-paper' ? 'kis-paper' : 'demo'}` : e.target ? `/${e.target}` : '/alerts'}>{e.title} · 원인 화면</Link>
        <span>{e.detail}</span>{confirmedAt(e.time)}
      </div>)}
      {!available && <strong>알림 최신 상태 미확인</strong>}
    </section>}
    <MorningPortfolio hideEmpty />
    <div className="dash-accounts">
      <section className="dash-account" aria-label="DEMO 계좌 요약">
        <header><h2>DEMO 계좌</h2><span>합성 시나리오</span></header>
        <div className="dash-value"><span>총 평가자산</span><strong>{hasLocalSnapshot ? money(demo.total) : '미확인'}</strong></div>
        {!available && <p className="dash-warning">{localNotice}{status.error && ` · ${status.error}`}</p>}
        {hasLocalSnapshot && demo.unpriced > 0 && <p className="dash-warning">현재가 누락 {demo.unpriced}종목 · 전체 합계 평가 불가</p>}
        <p className="dash-time">로컬 확인 {confirmedAt(status.lastSuccessAt)}</p>
        <div className="dash-actions"><PageLink to="/orders">DEMO 주문 확인</PageLink><PageLink to="/strategies?environment=demo">DEMO 전략 확인</PageLink></div>
        <p>미체결 {available ? `${state.orders.filter(o => o.status === 'pending').length}건` : '미확인'}</p>
        <details><summary>DEMO 잔고와 전략 상세</summary>
          <DataStatusLine label="대시보드 DEMO 조회 상태" status={status} />
          <div className="stats-grid">
            <Stat label="보유 평가손익" value={hasLocalSnapshot ? profit(demo.profit) : '미확인'} sub="수수료 차감 전 평가손익" />
            <Stat label="보유 현금" value={hasLocalSnapshot ? money(demo.cash) : '미확인'} sub="예약액은 현금에서 아직 차감되지 않음" />
            <Stat label="실행 전략" value={available ? `${demoStrategies.filter(s => s.active).length} / ${demoStrategies.length}` : '미확인'} sub="로컬 봉 재생 시 평가" />
          </div>
          <p>DEMO 주문 가능액은 보유 현금에서 미체결 매수 예약액(지정가 × 수량 + 예상 수수료)을 제외합니다. 현금은 체결 시 차감됩니다.</p>
        </details>
      </section>
      <section className="dash-account" aria-label="KIS 계좌 요약">
        <header><h2>KIS 모의 계좌</h2><span>REST · {available ? phaseLabels[connection.status.phase] : '로컬 상태 미확인'}</span></header>
        <div className="dash-value"><span>총 평가자산</span><strong>{kis ? money(kis.total) : '잔고 미확인'}</strong></div>
        {kis && !currentBalance && <p className="dash-warning">이전 전체 성공값 · 최신 아님</p>}
        {connection.status.error && <p className="dash-warning">{connection.status.error}</p>}
        {kis && kis.unpriced > 0 && <p className="dash-warning">현재가 누락 {kis.unpriced}종목 · 전체 합계 평가 불가</p>}
        <p className="dash-time">잔고 최종 전체 성공 {confirmedAt(connection.status.lastSuccessAt)}</p>
        <div className="dash-actions"><PageLink to="/paper">KIS 주문 대조</PageLink><PageLink to="/strategies?environment=kis-paper">KIS 전략 평가 확인</PageLink></div>
        <p>{ordersKnown ? `미체결 ${pending}건` : '미체결 미확인'} · <strong className={paperRisk?.unresolvedCount ? 'dash-warning' : undefined}>{available && paperRisk ? `불명·전송 중 ${paperRisk.unresolvedCount}건` : '불명·전송 중 미확인'}</strong></p>
        <p className="dash-time">주문 최종 전체 성공 {confirmedAt(paperRisk?.orders?.observedAt)}</p>
        {!currentBalance && <PageLink to="/settings">{available ? 'KIS 연결 원인 확인' : '연결·설정 확인'}</PageLink>}
        <details><summary>KIS 잔고와 전략 상세</summary>
          <DataStatusLine label="대시보드 KIS 조회 상태" status={connection.status} showPages />
          {kis ? <div className="stats-grid">
            <Stat label="보유 평가손익" value={profit(kis.profit)} sub="원본 평균가 기준 · 비용 전" />
            <Stat label="KIS 모의 예수금" value={money(kis.cash)} sub="주문 가능 금액이 아닙니다" />
            <Stat label="주식·ETF 평가액" value={money(kis.invested)} sub="양수 보유수량 × 현재가" />
          </div> : <p>전체 잔고 조회 전에는 금액을 표시하지 않습니다.</p>}
          <p>주문 전체 대조 후 60초가 지나면 미체결 여부는 미확인입니다. 불명·전송 중 건수는 로컬 원장을 기준으로 합니다.</p>
          <section aria-label="KIS 전략 현황"><h3>KIS 실행 전략</h3>
            <p>{available ? `${kisStrategies.filter(s => s.active).length} / ${kisStrategies.length}` : '미확인'} · {!available ? '상태 미확인' : realtimeReady ? '실시간 입력 준비' : '실시간 입력 차단 · ' + (realtime?.message ?? '실시간 미확인')}</p>
            {available && !kisStrategies.length && <p>저장된 KIS 전략 없음</p>}
            {hasLocalSnapshot && kisStrategies.map(s => <p key={s.id}>{s.name} · {available ? s.active ? '실행 중' : '정지' : '이전 확인값'} · revision {s.revision ?? 1} · {s.evaluations?.[0] ? `${{ buy: '매수', sell: '매도', hold: '관망' }[s.evaluations[0].signal]} · ${s.evaluations[0].reason}` : '평가 기록 없음'}{s.evaluations?.[0] && <> · 평가 {confirmedAt(s.evaluations[0].at)}</>}</p>)}
          </section>
          <div className="dash-actions">{currentBalance && <PageLink to="/settings">KIS 연결 설정</PageLink>}<PageLink to="/portfolio">계좌 상세</PageLink></div>
        </details>
      </section>
    </div>
    <section aria-label="대시보드 거래 상태" className="dash-status">
      <strong>{!available ? '상태 미확인 · 신규 작업 차단' : state.risk.halted ? '신규 주문 정지' : '긴급정지 꺼짐'}</strong>
      <PageLink to="/risk">위험·정지 원인 확인</PageLink>
      {!important.length && <span>{available ? '현재 표시할 중요 알림 없음' : '중요 알림 미확인'}</span>}
      <PageLink to="/alerts">전체 알림</PageLink>
    </section>
    {available ? <>
      <div className="grid-main">
        <Panel title="시장 관찰" eyebrow="MARKET PULSE" action={<Badge>합성 시나리오</Badge>}>
          {market?.history.length ? <>
            <div className="market-highlight">
              <div><span className="muted">KODEX 200 · 069500</span><h3>{won(market.price)}<small>KRW</small></h3><Change value={market.change} /></div>
              <div className="segment"><span className="active">{market.history.length}봉</span><span>합성 가격</span></div>
            </div>
            <Chart values={market.history} height={205} />
            <div className="chart-axis"><span>표본 1</span><span>현재 데모 봉</span></div>
          </> : <Empty title="합성 시세 없음">KODEX 200의 합성 데이터가 없습니다.</Empty>}
          <div className="market-mini">{state.instruments.slice(0, 3).map(s =>
            <Link key={s.code} to={`/trade?mode=demo&code=${s.code}`}><span>{s.name}</span><strong>{won(s.price)}</strong><Change value={s.change} /></Link>
          )}</div>
        </Panel>
        <Panel title="매매 준비 상태" eyebrow="PRE-FLIGHT">
          <div className="ready-visual"><ShieldCheck size={37} /><div><h3>{state.risk.halted ? '신규 주문 정지' : '로컬 데모 준비'}</h3><p>KIS 모의투자는 별도 연결 확인</p></div></div>
          <div className="check-row"><span>현재 환경</span><Badge tone="teal">로컬 데모</Badge></div>
          <div className="check-row"><span>1회 주문 한도</span><strong>{won(state.risk.maxOrder)}원</strong></div>
          <div className="check-row"><span>미체결 주문</span><strong>{state.orders.filter(o => o.status === 'pending').length}건</strong></div>
          <div className="check-row"><span>데이터 출처</span><span>합성 시나리오</span></div>
          <Link to="/trade?mode=demo" className="button primary wide">DEMO 트레이딩 열기<ArrowRight size={16} /></Link>
          <Link to="/settings" className="subtle-link">KIS 모의 계좌 연결 확인 ↗</Link>
        </Panel>
      </div>
      <div className="grid-main">
        <Panel title="나의 관심종목" action={<PageLink to="/watchlist">전체 보기</PageLink>}>
          {state.watchlist.length ? <InstrumentTable instruments={state.instruments.filter(s => state.watchlist.includes(s.code))} /> : <p>등록된 관심종목 없음</p>}
          {state.watchlist.filter(code => !state.instruments.some(row => row.code === code)).map(code =>
            <Link className="button quiet" to="/watchlist" key={code}>관심종목 {code} · 시세 확인 ↗</Link>
          )}
        </Panel>
        <Panel title="전략 워크플로" action={<Zap size={18} className="muted" />}>
          <ol className="workflow-list">
            <li><span>01</span><div><strong>규칙을 정의하세요</strong><p>대상 종목과 진입·청산 조건 설정</p></div></li>
            <li><span>02</span><div><strong>가정을 검증하세요</strong><p>비용을 포함한 합성 데이터 백테스트</p></div></li>
            <li><span>03</span><div><strong>신호를 관찰하세요</strong><p>로컬 봉을 재생하고 주문 이유 확인</p></div></li>
          </ol>
          <PageLink to="/strategies?environment=demo">DEMO 전략 스튜디오 열기</PageLink>
        </Panel>
      </div>
    </> : <Panel title="시장 관찰 · 관심종목"><p>{localNotice} · 합성 시세와 관심종목을 확인할 수 없습니다.</p></Panel>}
  </>;
}
export function Market({ watchOnly = false }: { watchOnly?: boolean }) {
  return <MarketExplorer key={watchOnly ? 'watchlist' : 'market'} watchOnly={watchOnly} />;
}

type PnlFilter = 'all' | 'gain' | 'loss' | 'flat';
type PortfolioSort = 'default' | 'value-desc' | 'weight-desc' | 'profit-desc' | 'profit-asc' | 'return-desc';

/** 자산 구성 비율 바 종목별 세그먼트 색상 팔레트. */
const ALLOC_SEGMENT_COLORS = ['#2f62ad', '#3e8476', '#b6802e', '#765aa6', '#b23b44', '#397b91'];

/** DEMO 지정가 예상 수수료(0.015% 올림) 계산. */
const calcDemoFee = (amount: number) => Math.ceil((amount * 1.5) / 10000);

/** 분할 매수 소수점 평균 매입가를 초대형 정수 정밀도 손실 없이 최대 4자리까지 포맷한다. */
function formatAveragePrice(average: number): string {
  if (!Number.isFinite(average)) return '평가 불가';
  if (Number.isInteger(average)) return `${average.toLocaleString('ko-KR')}원`;
  return `${Number(average.toFixed(4)).toLocaleString('ko-KR', { maximumFractionDigits: 4 })}원`;
}

/** 종목별 평가수익률을 `-0.00%`·`NaN` 없이 계산해 표시 값과 색상을 반환한다. */
function returnRate(p: { average: number; qty: number; profit: number | null }): { value: string; raw: number | null; tone?: 'up' | 'down' } {
  const cost = p.average * p.qty;
  if (p.profit === null || !Number.isFinite(cost) || cost <= 0) return { value: '평가 불가', raw: null };
  const roundedProfit = Math.round(p.profit);
  const rawPct = (p.profit / cost) * 100;
  if (!Number.isFinite(rawPct)) return { value: '평가 불가', raw: null };
  const roundedPct = Math.round(rawPct * 100) / 100;
  if (roundedProfit === 0 || roundedPct === 0) return { value: '0.00%', raw: rawPct };
  if (roundedPct > 0) return { value: `+${roundedPct.toFixed(2)}%`, raw: rawPct, tone: 'up' };
  return { value: `${roundedPct.toFixed(2)}%`, raw: rawPct, tone: 'down' };
}

/** 정렬 시 `null`/평가 불가 항목을 항상 뒤로 배치하는 비교 함수. */
function compareNullable(a: number | null, b: number | null, dir: 'desc' | 'asc'): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === 'desc' ? b - a : a - b;
}

export function Portfolio() {
  const { state, status, connection, paperRisk, act, busy, available, serverNow } = useWorkbench();
  const [params, setParams] = useSearchParams();
  const kis = params.get('environment') !== 'demo';
  const [helpOpen, setHelpOpen] = useState(false);
  const helpPanelId = useId();
  const helpToggleRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState('');
  const [pnlFilter, setPnlFilter] = useState<PnlFilter>('all');
  const [sortBy, setSortBy] = useState<PortfolioSort>('default');
  const searchInputRef = useRef<HTMLInputElement>(null);

  function closeHelp() {
    setHelpOpen(false);
    helpToggleRef.current?.focus();
  }

  function clearFilters() {
    setQuery('');
    setPnlFilter('all');
    setSortBy('default');
    searchInputRef.current?.focus();
  }

  function selectEnvironment(environment: 'kis-paper' | 'demo') {
    if ((environment === 'kis-paper') === kis) return;
    setQuery('');
    setPnlFilter('all');
    setSortBy('default');
    const next = new URLSearchParams(params);
    next.set('environment', environment);
    setParams(next);
  }
  const hasDemoSnapshot = available || Boolean(status.lastSuccessAt);
  const balance = kis ? connection.balance : hasDemoSnapshot ? {
    cash: state.cash,
    positions: state.positions.map(p => {
      const instrument = state.instruments.find(s => s.code === p.code);
      return { ...p, name: instrument?.name ?? p.code, price: instrument?.price ?? null };
    }),
  } : null;
  const dataStatus = kis ? connection.status : status;
  const current = dataStatus.phase === 'ready' && dataStatus.complete;
  const portfolio = balance ? portfolioValue(balance.cash, balance.positions) : null;
  const money = (value: number | null) => value === null ? '평가 불가' : `${won(value)}원`;
  const weight = (value: number | null) => value === null ? '산출 불가' : `${value.toFixed(1)}%`;
  function profit(value: number | null) {
    if (value === null) return { value: '평가 불가' };
    const rounded = Math.round(value);
    if (rounded === 0) return { value: '0원' };
    return { value: `${rounded > 0 ? '+' : ''}${won(rounded)}원`, tone: rounded > 0 ? 'up' : 'down' };
  }
  const loading = status.phase === 'loading' || dataStatus.phase === 'loading';
  const incomplete = dataStatus.phase === 'partial' || dataStatus.phase === 'error';
  let emptyTitle = kis ? 'KIS 계좌 미확인' : 'DEMO 계좌 미확인';
  if (loading) emptyTitle = '계좌 조회 중';
  else if (kis && available) emptyTitle = incomplete ? 'KIS 잔고 전체 조회 미완료' : 'KIS 잔고를 조회해 주세요';

  const normalizedQuery = query.trim().toLowerCase();
  const controlsActive = normalizedQuery !== '' || pnlFilter !== 'all' || sortBy !== 'default';
  const visiblePositions = (() => {
    if (!portfolio) return [];
    const filtered = portfolio.positions.filter(p => {
      if (normalizedQuery && !p.name.toLowerCase().includes(normalizedQuery) && !p.code.toLowerCase().includes(normalizedQuery)) {
        return false;
      }
      if (pnlFilter === 'gain') return p.profit !== null && Math.round(p.profit) > 0;
      if (pnlFilter === 'loss') return p.profit !== null && Math.round(p.profit) < 0;
      if (pnlFilter === 'flat') return p.profit === null || Math.round(p.profit) === 0;
      return true;
    });
    if (sortBy === 'default') return filtered;
    return [...filtered].sort((a, b) => {
      if (sortBy === 'value-desc') return compareNullable(a.value, b.value, 'desc');
      if (sortBy === 'weight-desc') return compareNullable(a.weight, b.weight, 'desc');
      if (sortBy === 'profit-desc') return compareNullable(a.profit, b.profit, 'desc');
      if (sortBy === 'profit-asc') return compareNullable(a.profit, b.profit, 'asc');
      return compareNullable(returnRate(a).raw, returnRate(b).raw, 'desc');
    });
  })();

  // 포트폴리오 분석 및 위험·배분 진단 허브 집계 (항상 전체 보유종목 기준)
  const totalCost = portfolio ? portfolio.positions.reduce((sum, p) => sum + p.average * p.qty, 0) : 0;
  const totalReturnText = (() => {
    if (!portfolio) return '산출 불가';
    if (portfolio.positions.length === 0) return '보유종목 없음 (0.00%)';
    if (portfolio.unpriced > 0 || portfolio.profit === null) return '평가 불가 (현재가 누락)';
    if (Number.isFinite(totalCost) && totalCost > 0) {
      const rate = returnRate({ average: totalCost, qty: 1, profit: portfolio.profit });
      return `${rate.value} (손익 ${profit(portfolio.profit).value})`;
    }
    return '산출 불가';
  })();
  const gainPositions = portfolio ? portfolio.positions.filter(p => p.profit !== null && Math.round(p.profit) > 0) : [];
  const lossPositions = portfolio ? portfolio.positions.filter(p => p.profit !== null && Math.round(p.profit) < 0) : [];
  const gainCount = gainPositions.length;
  const lossCount = lossPositions.length;
  const flatCount = portfolio ? portfolio.positions.length - gainCount - lossCount : 0;
  const bestGain = gainPositions.reduce<(typeof gainPositions)[number] | null>(
    (best, p) => (!best || p.profit! > best.profit! ? p : best),
    null,
  );
  const worstLoss = lossPositions.reduce<(typeof lossPositions)[number] | null>(
    (worst, p) => (!worst || p.profit! < worst.profit! ? p : worst),
    null,
  );
  const weightedPositions = portfolio
    ? [...portfolio.positions].filter(p => p.weight !== null).sort((a, b) => b.weight! - a.weight!)
    : [];
  const topWeightPos = weightedPositions[0] ?? null;
  const top3Weight = weightedPositions.length > 0
    ? weightedPositions.slice(0, 3).reduce((sum, p) => sum + p.weight!, 0)
    : null;
  const valuedPositions = portfolio
    ? [...portfolio.positions].filter(p => p.value !== null).sort((a, b) => b.value! - a.value!)
    : [];
  const maxValuePos = valuedPositions[0] ?? null;

  const ordersAge = paperRisk?.orders ? serverNow - Date.parse(paperRisk.orders.observedAt) : Infinity;
  const ordersKnown = available && Boolean(paperRisk?.orders) && ordersAge >= 0 && ordersAge < BALANCE_STALE_MS;
  const kisPendingCount = paperRisk?.orders?.rows.filter(o => !o.cancelled && o.remaining > 0).length ?? 0;

  const demoPendingOrders = state.orders.filter(o => o.status === 'pending');
  const demoPendingBuyReserved = demoPendingOrders
    .filter(o => o.side === 'buy')
    .reduce((sum, o) => sum + o.qty * o.price + calcDemoFee(o.qty * o.price), 0);
  const demoAvailableCash = portfolio ? Math.max(0, portfolio.cash - demoPendingBuyReserved) : 0;
  const totalShares = portfolio ? portfolio.positions.reduce((sum, p) => sum + p.qty, 0) : 0;
  const demoPendingSellShares = demoPendingOrders
    .filter(o => o.side === 'sell')
    .reduce((sum, o) => sum + o.qty, 0);
  const demoSellableShares = portfolio
    ? portfolio.positions.reduce((sum, p) => {
      const reserved = demoPendingOrders
        .filter(o => o.side === 'sell' && o.code === p.code)
        .reduce((acc, o) => acc + o.qty, 0);
      return sum + Math.max(0, p.qty - reserved);
    }, 0)
    : 0;
  const kisSellableSummary = (() => {
    if (!portfolio || portfolio.positions.length === 0) return '주문가능 0주';
    const known = portfolio.positions.filter(p => p.sellable !== undefined);
    if (known.length === 0) return '주문가능 미확인';
    const sellableSum = known.reduce((sum, p) => sum + p.sellable!, 0);
    const unknownSellableCount = portfolio.positions.length - known.length;
    if (unknownSellableCount === 0) return `주문가능 ${sellableSum.toLocaleString('ko-KR')}주`;
    return `주문가능 확인 ${sellableSum.toLocaleString('ko-KR')}주 (${unknownSellableCount}종목 미확인)`;
  })();
  const currentDailyLoss = Math.max(0, state.startingEquity - equity(state));
  const demoLossLimitHit = !kis && currentDailyLoss >= state.risk.dailyLoss;

  const allocSegments = portfolio && portfolio.total !== null && portfolio.total > 0 && portfolio.unpriced === 0
    ? [
      { key: 'cash', label: '현금', weight: portfolio.cashWeight ?? 0, color: 'var(--teal)' },
      ...portfolio.positions.map((p, index) => ({
        key: p.code,
        label: p.name,
        weight: p.weight ?? 0,
        color: ALLOC_SEGMENT_COLORS[index % ALLOC_SEGMENT_COLORS.length],
      })),
    ]
    : null;

  return <div className="portfolio-page">
    <div className="portfolio-toolbar" role="group" aria-label="포트폴리오 환경">
      <button type="button" className={`button ${kis ? 'primary' : 'secondary'}`} aria-pressed={kis} onClick={() => selectEnvironment('kis-paper')}>KIS 모의</button>
      <button type="button" className={`button ${!kis ? 'primary' : 'secondary'}`} aria-pressed={!kis} onClick={() => selectEnvironment('demo')}>로컬 DEMO</button>
      {kis && <button type="button" className="button secondary" disabled={!available || busy || connection.status.phase === 'loading'} onClick={() => void act('kis/check').catch(() => {})}><RefreshCw size={15} aria-hidden="true" />KIS 잔고 새로고침</button>}
      <button
        ref={helpToggleRef}
        type="button"
        className={`button small-button ${helpOpen ? 'primary' : 'secondary'} portfolio-help-toggle`}
        aria-expanded={helpOpen}
        aria-controls={helpOpen ? helpPanelId : undefined}
        onClick={() => setHelpOpen(open => !open)}
      >
        <BookOpen size={14} aria-hidden="true" />
        사용방법 도움말
      </button>
    </div>
    {helpOpen && <PortfolioHelpPanel panelId={helpPanelId} onClose={closeHelp} />}
    {kis && <MorningPortfolio />}
    <div className="portfolio-source" role="group" aria-label="포트폴리오 조회 상태">
      <strong>{kis ? 'KIS 모의 잔고 · REST' : 'DEMO 계좌 · 로컬 합성 데이터'}</strong>
      <Badge tone={current ? 'teal' : 'neutral'}>{phaseLabels[dataStatus.phase]}</Badge>
      <span>{kis ? '잔고 최종 전체 성공' : '로컬 확인'} {confirmedAt(dataStatus.lastSuccessAt)}</span>
    </div>
    {!current && (loading || portfolio || incomplete || dataStatus.error) && <div className="portfolio-warning" role="status">
      {loading && <strong>{status.phase === 'loading' ? '로컬 서버에서 계좌 상태 확인 중' : 'KIS 잔고 새로고침 중'}</strong>}
      {portfolio && <strong>{kis ? '이전 전체 성공값 · 최신 아님' : '이전 DEMO 확인값 · 최신 아님'}</strong>}
      {incomplete && !portfolio && <strong>전체 조회 미완료 · 확인된 금액 없음</strong>}
      {dataStatus.phase === 'partial' && <span>{dataStatus.pages}페이지 확인 · 부분 잔고 합산 제외</span>}
      {dataStatus.error && <span>{dataStatus.error}</span>}
      {dataStatus.observedAt && dataStatus.observedAt !== dataStatus.lastSuccessAt && <span>최근 관측 {confirmedAt(dataStatus.observedAt)}</span>}
      {kis && available && !loading && (incomplete || dataStatus.error || dataStatus.phase === 'stale') && <Link to="/settings">연결 원인 확인</Link>}
    </div>}
    {!portfolio ? <Empty title={emptyTitle}>
      {kis ? '잔고 전체 조회가 끝나면 예수금과 보유종목을 표시합니다.' : '로컬 서버에서 확인한 뒤 보유 현금과 종목을 표시합니다.'}
      {kis && available && !loading && !incomplete && !dataStatus.error && <> <Link to="/settings">연결·설정 확인</Link></>}
    </Empty> : <>
      {portfolio.unpriced > 0 && <div className="notice warning" role="status">현재가 누락 {portfolio.unpriced}종목 · 해당 평가액·손익과 전체 평가 합계·비중은 평가 불가입니다.</div>}
      {portfolio.total === 0 && <p className="notice" role="status">총자산 0원 · 비중을 산출하지 않습니다.</p>}
      <section className="stats-grid" aria-label="포트폴리오 요약">
        <Stat label="총 평가자산" value={money(portfolio.total)} />
        <Stat label={kis ? 'KIS 모의 예수금' : 'DEMO 보유 현금'} value={money(portfolio.cash)} sub={kis ? '주문 가능 금액과 다름' : '예약액 차감 전'} />
        <Stat label="보유 평가손익" {...profit(portfolio.profit)} sub="평균 매입가 기준 · 비용 전" />
        <Stat label="주식·ETF 평가액" value={money(portfolio.invested)} />
      </section>
      <Panel title="보유자산" action={<Badge>{kis ? 'KIS 모의' : 'DEMO'} · {portfolio.positions.length}종목</Badge>}>
        {portfolio.positions.length > 0 && (
          <div className="portfolio-controls" role="region" aria-label="보유종목 검색 및 정렬 제어">
            <label className="portfolio-search">
              <span className="sr-only">보유종목 검색</span>
              <input
                ref={searchInputRef}
                type="search"
                aria-label="보유종목 검색"
                placeholder="종목명 또는 코드"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </label>
            <div className="portfolio-filter-group" role="group" aria-label="손익 상태 필터">
              {([
                ['all', '전체'],
                ['gain', '수익 종목'],
                ['loss', '손실 종목'],
                ['flat', '보합·평가불가'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`portfolio-chip${pnlFilter === id ? ' active' : ''}`}
                  aria-pressed={pnlFilter === id}
                  onClick={() => setPnlFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="portfolio-sort">
              <span className="sr-only">보유종목 정렬</span>
              <select
                aria-label="보유종목 정렬"
                value={sortBy}
                onChange={e => setSortBy(e.target.value as PortfolioSort)}
              >
                <option value="default">기본 순서</option>
                <option value="value-desc">평가액 높은 순</option>
                <option value="weight-desc">비중 높은 순</option>
                <option value="profit-desc">평가손익 높은 순</option>
                <option value="profit-asc">평가손익 낮은 순</option>
                <option value="return-desc">수익률 높은 순</option>
              </select>
            </label>
            {controlsActive && (
              <div className="portfolio-controls-summary">
                <span>표시 {visiblePositions.length}종목 / 전체 {portfolio.positions.length}종목</span>
                {visiblePositions.length > 0 && (
                  <button type="button" className="text-link" onClick={clearFilters}>조건 지우기</button>
                )}
              </div>
            )}
          </div>
        )}
        {portfolio.positions.length ? (
          visiblePositions.length ? <div className="table-scroll mobile-records"><table role="table"><thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">종목</th><th role="columnheader" scope="col">보유수량</th><th role="columnheader" scope="col">평균 매입가</th><th role="columnheader" scope="col">현재가</th><th role="columnheader" scope="col">평가액</th><th role="columnheader" scope="col">평가손익</th><th role="columnheader" scope="col">수익률</th><th role="columnheader" scope="col">비중</th></tr></thead><tbody role="rowgroup">
            {visiblePositions.map(p => {
              const pnl = profit(p.profit);
              const rate = returnRate(p);
              return <tr role="row" key={p.code}>
                <td role="cell" data-label="종목"><span className="record-value"><Link className="stock-name" to={`${kis ? '/paper?code=' : '/trade?mode=demo&code='}${encodeURIComponent(p.code)}`}>{p.name}<small>{p.code}</small></Link></span></td>
                <td role="cell" className="number" data-label="보유수량"><span className="record-value">{p.qty.toLocaleString('ko-KR')}주</span></td><td role="cell" className="number" data-label="평균 매입가"><span className="record-value">{formatAveragePrice(p.average)}</span></td>
                <td role="cell" className="number" data-label="현재가"><span className="record-value">{p.price !== null && p.price > 0 ? money(p.price) : '평가 불가'}</span></td>
                <td role="cell" className="number" data-label="평가액"><span className="record-value">{money(p.value)}</span></td><td role="cell" className={pnl.tone ? `number ${pnl.tone}` : 'number'} data-label="평가손익"><span className="record-value">{pnl.value}</span></td>
                <td role="cell" className={rate.tone ? `number ${rate.tone}` : 'number'} data-label="수익률"><span className="record-value">{rate.value}</span></td>
                <td role="cell" className="number" data-label="비중"><span className="record-value">{weight(p.weight)}</span></td>
              </tr>;
            })}
          </tbody></table></div> : <Empty title="조건에 맞는 보유종목이 없습니다"><button type="button" className="text-link" onClick={clearFilters}>조건 지우기</button></Empty>
        ) : <Empty title="보유종목 없음">보유수량이 0인 종목은 제외합니다.</Empty>}
      </Panel>
      <section className="portfolio-hub" role="region" aria-label="포트폴리오 분석 및 위험·배분 진단 허브">
        {allocSegments && (
          <div className="portfolio-alloc-panel" role="region" aria-label="자산 구성 비율 바">
            <div className="portfolio-alloc-head">
              <h3>자산 구성 비율</h3>
              <span>현금 {weight(portfolio.cashWeight)} · 주식·ETF {weight(portfolio.investedWeight)}</span>
            </div>
            <div className="portfolio-alloc-bar">
              {allocSegments.map(seg => seg.weight > 0 && (
                <div
                  key={seg.key}
                  className="portfolio-alloc-seg"
                  style={{ width: `${Math.min(100, Math.max(0, seg.weight))}%`, backgroundColor: seg.color }}
                  title={`${seg.label} ${weight(seg.weight)}`}
                />
              ))}
            </div>
            <ul className="portfolio-alloc-legend">
              {allocSegments.map(seg => (
                <li key={seg.key}>
                  <span className="portfolio-alloc-dot" style={{ backgroundColor: seg.color }} aria-hidden="true" />
                  <span>{seg.label} <strong>{weight(seg.weight)}</strong></span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="portfolio-hub-grid">
          <article className="portfolio-hub-card">
            <h3>손익 기여도 및 수익률 분석</h3>
            <dl className="portfolio-hub-list">
              <div>
                <dt>매입원금 · 평가액</dt>
                <dd>총 매입 {won(totalCost)}원 · 현재 평가 {money(portfolio.invested)}</dd>
              </div>
              <div>
                <dt>총 투자 수익률</dt>
                <dd>{totalReturnText}</dd>
              </div>
              <div>
                <dt>손익 종목 분포</dt>
                <dd>수익 {gainCount}종목 · 손실 {lossCount}종목 · 보합·미평가 {flatCount}종목</dd>
              </div>
              <div>
                <dt>최고 수익 · 최대 손실 기여</dt>
                <dd>
                  {bestGain ? `${bestGain.name} (+${won(Math.round(bestGain.profit!))}원)` : '해당 없음'}
                  {' · '}
                  {worstLoss ? `${worstLoss.name} (${won(Math.round(worstLoss.profit!))}원)` : '해당 없음'}
                </dd>
              </div>
            </dl>
          </article>
          <article className="portfolio-hub-card">
            <h3>자산 배분 및 집중도 진단</h3>
            <dl className="portfolio-hub-list">
              <div>
                <dt>현금 대 투자 비중</dt>
                <dd>현금 {weight(portfolio.cashWeight)} · 주식·ETF {weight(portfolio.investedWeight)}</dd>
              </div>
              <div>
                <dt>최대 비중 · 상위 집중도</dt>
                <dd>
                  {portfolio.positions.length === 0
                    ? '보유종목 없음'
                    : `최대 ${topWeightPos && topWeightPos.weight !== null ? `${topWeightPos.name} (${weight(topWeightPos.weight)})` : '산출 불가'} · 상위 3종목 합산 ${top3Weight !== null ? weight(top3Weight) : '산출 불가'}`}
                </dd>
              </div>
              <div>
                <dt>종목별 한도 대비 최대 노출</dt>
                <dd>
                  {!available
                    ? '로컬 상태 미확인'
                    : portfolio.positions.length === 0
                      ? `한도 ${won(state.risk.maxPosition)}원 · 보유종목 없음`
                      : maxValuePos && maxValuePos.value !== null && state.risk.maxPosition > 0
                        ? `${maxValuePos.name} ${won(maxValuePos.value)}원 / 한도 ${won(state.risk.maxPosition)}원 (${Math.round((maxValuePos.value / state.risk.maxPosition) * 100)}%)`
                        : `한도 ${won(state.risk.maxPosition)}원 · 노출 산출 불가`}
                </dd>
              </div>
              <div>
                <dt>계좌 기준 자산 대조</dt>
                <dd>
                  {kis
                    ? `화면 합계 ${money(portfolio.total)} · KIS API 총평가 ${connection.balance ? `${won(connection.balance.totalEquity)}원` : '미확인'}`
                    : `시작 자산 ${won(state.startingEquity)}원 · 현재 ${money(portfolio.total)}`}
                </dd>
              </div>
            </dl>
          </article>
          <article className="portfolio-hub-card">
            <h3>가용 자금 · 매도 가능량 및 연계 허브</h3>
            <dl className="portfolio-hub-list">
              <div>
                <dt>가용 자금 및 미체결 진단</dt>
                <dd>
                  {kis
                    ? `예수금 ${won(portfolio.cash)}원 · ${ordersKnown ? `미체결 ${kisPendingCount}건` : '미체결 미확인'} · ${available && paperRisk ? `불명·전송 중 ${paperRisk.unresolvedCount}건` : '불명·전송 중 미확인'}`
                    : `예약 제외 가용 ${won(demoAvailableCash)}원 · 미체결 매수 예약 ${won(demoPendingBuyReserved)}원`}
                </dd>
              </div>
              <div>
                <dt>보유 및 매도 가능 수량</dt>
                <dd>
                  {kis
                    ? `총 보유 ${totalShares.toLocaleString('ko-KR')}주 · ${kisSellableSummary}`
                    : `총 보유 ${totalShares.toLocaleString('ko-KR')}주 · 즉시 매도 가능 ${demoSellableShares.toLocaleString('ko-KR')}주 (매도 예약 ${demoPendingSellShares.toLocaleString('ko-KR')}주)`}
                </dd>
              </div>
              <div>
                <dt>신규 주문 제어 · 위험 한도</dt>
                <dd>
                  {!available
                    ? '로컬 상태 미확인 (차단)'
                    : state.risk.halted
                      ? `긴급정지 켜짐 (신규 주문 정지) · 1회 ${won(state.risk.maxOrder)}원 · 일일 손실 ${won(state.risk.dailyLoss)}원`
                      : demoLossLimitHit
                        ? `일일 손실 한도 도달 (신규 주문 정지) · 1회 ${won(state.risk.maxOrder)}원 · 일일 손실 ${won(state.risk.dailyLoss)}원`
                        : `긴급정지 꺼짐 (정상) · 1회 ${won(state.risk.maxOrder)}원 · 일일 손실 ${won(state.risk.dailyLoss)}원`}
                </dd>
              </div>
            </dl>
            <div className="portfolio-hub-links">
              {kis ? <>
                <Link className="text-link" to="/paper">KIS 모의 매매·대조</Link>
                <Link className="text-link" to="/orders?view=kis">KIS 모의 원장</Link>
                <Link className="text-link" to="/strategies?environment=kis-paper">KIS 전략 스튜디오</Link>
                <Link className="text-link" to="/risk?env=kis">KIS 위험관리</Link>
              </> : <>
                <Link className="text-link" to="/trade?mode=demo">DEMO 연습 주문</Link>
                <Link className="text-link" to="/orders?view=demo">DEMO 주문 원장</Link>
                <Link className="text-link" to="/strategies?environment=demo">DEMO 전략 스튜디오</Link>
                <Link className="text-link" to="/risk">DEMO 위험관리</Link>
              </>}
            </div>
          </article>
        </div>
      </section>
      <details className="portfolio-details" key={kis ? 'kis' : 'demo'}>
        <summary>평가 기준과 자산 배분</summary>
        <p>{kis ? 'KIS 잔고의 예수금과 보유종목 현재가' : '로컬 DEMO 보유 현금과 합성 현재가'}로 총 평가자산을 계산합니다. 손익은 원본 평균 매입가 기준이며 원 단위로 반올림합니다.</p>
        {kis && connection.balance && <p>KIS 계좌 총평가액 {money(connection.balance.totalEquity)} · API 참고값으로 결제·미수 반영 기준에 따라 화면 합계와 다를 수 있습니다.</p>}
        <p>최근 관측 {confirmedAt(dataStatus.observedAt)}{kis && ` · ${dataStatus.pages}페이지 · ${dataStatus.complete ? '전체 확인' : '전체 확인 전'}`}</p>
        <div className="allocation">
          <div className="allocation-center"><span>현금 비중</span><strong>{weight(portfolio.cashWeight)}</strong></div>
          <svg viewBox="0 0 120 120" role="img" aria-label="현금과 투자 자산의 비중">
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--line)" strokeWidth="12" />
            {portfolio.cashWeight !== null && portfolio.cashWeight >= 0 && portfolio.cashWeight <= 100 && <circle cx="60" cy="60" r="50" fill="none" stroke="var(--teal)" strokeWidth="12" strokeDasharray={`${314 * portfolio.cashWeight / 100} 314`} transform="rotate(-90 60 60)" />}
          </svg>
        </div>
        <div className="check-row"><span>주식·ETF 비중</span><strong>{weight(portfolio.investedWeight)}</strong></div>
        <p>종목 비중은 종목 평가액을 총 평가자산으로 나눕니다. 현재가 누락 또는 총자산 0원이면 비중은 산출 불가입니다.</p>
      </details>
    </>}
  </div>;
}
