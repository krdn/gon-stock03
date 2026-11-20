import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, RefreshCw, ShieldCheck, Star, Zap } from 'lucide-react';
import { useWorkbench } from '../context';
import { Badge, Change, Chart, DataStatusLine, Empty, PageLink, Panel, Stat, phaseLabels } from '../components/ui';
import { won, type Instrument } from '../../shared/model';
import { portfolioValue } from '../../shared/portfolio';
import { BALANCE_STALE_MS } from '../../shared/status';
import './dashboard-v2.css';
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
  const confirmedAt = (value: string | null | undefined) => value
    ? <time dateTime={value}>{new Date(value).toLocaleString('ko-KR')}</time> : '없음';
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

export function Portfolio() {
  const { state, status, connection, act, busy, available } = useWorkbench();
  const [environment, setEnvironment] = useState<'kis-paper' | 'demo'>('kis-paper');
  const kis = environment === 'kis-paper';
  const balance = kis ? connection.balance : {
    cash: state.cash,
    positions: state.positions.map(p => {
      const instrument = state.instruments.find(s => s.code === p.code);
      return { ...p, name: instrument?.name ?? p.code, price: instrument?.price ?? null };
    }),
  };
  const dataStatus = kis ? connection.status : status;
  const current = dataStatus.phase === 'ready' && dataStatus.complete;
  const portfolio = balance ? portfolioValue(balance.cash, balance.positions) : null;
  const money = (value: number | null) => value === null ? '평가 불가' : `${won(value)}원`;
  const weight = (value: number | null) => value === null ? '산출 불가' : `${value.toFixed(1)}%`;
  const profit = (value: number | null) => value === null ? '평가 불가' : `${value >= 0 ? '+' : ''}${won(value)}원`;
  return <>
    <div className="button-row" role="group" aria-label="포트폴리오 환경">
      <button className={`button ${kis ? 'primary' : 'secondary'}`} aria-pressed={kis} onClick={() => setEnvironment('kis-paper')}>KIS 모의</button>
      <button className={`button ${!kis ? 'primary' : 'secondary'}`} aria-pressed={!kis} onClick={() => setEnvironment('demo')}>로컬 DEMO</button>
      {kis && <button className="button secondary" disabled={!available || busy || connection.status.phase === 'loading'} onClick={() => void act('kis/check').catch(() => {})}><RefreshCw size={15} />KIS 잔고 새로고침</button>}
    </div>
    <p className="muted">{kis ? 'KIS 모의 계좌 · REST 수동 조회' : '로컬 DEMO · 합성 시나리오'} · 선택한 환경의 자산만 표시합니다.</p>
    <DataStatusLine label="포트폴리오 조회 상태" status={dataStatus} showPages={kis} />
    {!current && <div className="notice warning" role="status">{balance ? kis ? '이전 전체 성공값 · 최신 아님' : status.lastSuccessAt ? '이전 DEMO 확인값 · 최신 아님' : 'DEMO 미리보기 · 서버 미확인' : 'KIS 잔고 전체 조회 전 · 금액을 아직 확인할 수 없습니다.'} {dataStatus.phase === 'partial' && '페이지 조회 불완전 · 새 부분 잔고는 합산하지 않습니다.'}</div>}
    {!portfolio ? <Empty title="KIS 잔고를 조회해 주세요">잔고 새로고침으로 전체 페이지를 확인합니다. <Link to="/settings">연결·설정 확인 ↗</Link></Empty> : <>
      {portfolio.unpriced > 0 && <div className="notice warning" role="status">현재가 누락 {portfolio.unpriced}종목 · 해당 평가액·손익과 전체 평가 합계·비중은 평가 불가입니다.</div>}
      {portfolio.total === 0 && <p className="notice" role="status">총자산 0원 · 비중을 산출하지 않습니다.</p>}
      <section className="stats-grid" aria-label="포트폴리오 요약">
        <Stat label="총 평가자산" value={money(portfolio.total)} sub="예수금 + 보유종목 평가액" />
        <Stat label="주식·ETF 평가액" value={money(portfolio.invested)} sub={`비중 ${weight(portfolio.investedWeight)}`} />
        <Stat label={kis ? 'KIS 모의 예수금' : 'DEMO 보유 현금'} value={money(portfolio.cash)} sub={`비중 ${weight(portfolio.cashWeight)}`} />
        <Stat label="보유 평가손익" value={profit(portfolio.profit)} sub="원본 평균가 기준 · 비용 전 · 원 단위 반올림" tone={portfolio.profit === null ? undefined : portfolio.profit >= 0 ? 'up' : 'down'} />
      </section>
      {kis && <p className="muted tiny">KIS 계좌 총평가액: {money(connection.balance!.totalEquity)} · API 제공 참고값. 화면 합계는 예수금과 현재 보유 평가액으로 계산하므로 결제·미수 등의 반영 기준에 따라 다를 수 있습니다. 예수금은 주문 가능 금액이 아닙니다.</p>}
      <div className="grid-main">
        <Panel title="보유자산" action={<Badge>{kis ? 'KIS 모의' : 'DEMO'} · {portfolio.positions.length}종목</Badge>}>
          {portfolio.positions.length ? <div className={kis ? 'table-scroll mobile-records' : 'table-scroll'}><table role="table"><thead role="rowgroup"><tr role="row"><th role="columnheader">종목</th><th role="columnheader">보유수량</th><th role="columnheader">평균 매입가</th><th role="columnheader">현재가</th><th role="columnheader">평가액</th><th role="columnheader">평가손익</th><th role="columnheader">비중</th></tr></thead><tbody role="rowgroup">
            {portfolio.positions.map(p => <tr role="row" key={p.code}>
              <td role="cell" data-label="종목"><span className="record-value"><Link className="stock-name" to={`${kis ? '/paper' : '/trade'}?code=${encodeURIComponent(p.code)}`}>{p.name}<small>{p.code}</small></Link></span></td>
              <td role="cell" className="number" data-label="보유수량"><span className="record-value">{p.qty}주</span></td><td role="cell" className="number" data-label="평균 매입가"><span className="record-value">{p.average.toLocaleString('ko-KR', { maximumFractionDigits: 20 })}</span></td>
              <td role="cell" className="number" data-label="현재가"><span className="record-value">{p.price !== null && p.price > 0 ? won(p.price) : '평가 불가'}</span></td>
              <td role="cell" className="number" data-label="평가액"><span className="record-value">{money(p.value)}</span></td><td role="cell" className={p.profit === null ? 'number' : p.profit >= 0 ? 'number up' : 'number down'} data-label="평가손익"><span className="record-value">{profit(p.profit)}</span></td>
              <td role="cell" className="number" data-label="비중"><span className="record-value">{weight(p.weight)}</span></td>
            </tr>)}
          </tbody></table></div> : <Empty title="보유종목 없음">보유수량이 0인 종목은 제외합니다.</Empty>}
        </Panel>
        <Panel title="자산 배분">
          <div className="allocation"><div className="allocation-center"><span>현금 비중</span><strong>{weight(portfolio.cashWeight)}</strong></div>
            <svg viewBox="0 0 120 120" role="img" aria-label="현금과 투자 자산의 비중"><circle cx="60" cy="60" r="50" fill="none" stroke="var(--line)" strokeWidth="12" />
              {portfolio.cashWeight !== null && portfolio.cashWeight >= 0 && portfolio.cashWeight <= 100 && <circle cx="60" cy="60" r="50" fill="none" stroke="var(--teal)" strokeWidth="12" strokeDasharray={`${314 * portfolio.cashWeight / 100} 314`} transform="rotate(-90 60 60)" />}
            </svg>
          </div>
          <div className="check-row"><span>현금</span><strong>{money(portfolio.cash)}</strong></div>
          <div className="check-row"><span>주식·ETF</span><strong>{money(portfolio.invested)}</strong></div>
          <p className="muted tiny">종목 비중 = 종목 평가액 ÷ 총 평가자산. 현재가 누락 또는 총자산 0이면 비중은 산출 불가입니다.</p>
        </Panel>
      </div>
    </>}
  </>;
}
