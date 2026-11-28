import { RealtimeStatus } from '../components/RealtimeStatus';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import './Settings.css';
import './Risk.css';
import './Alerts.css';
import './Journal.css';
import { Check, ChevronDown, Landmark, RefreshCw, Server, Settings2, ShieldCheck, Square, Wallet } from 'lucide-react';
import { useWorkbench } from '../context';
import { Badge, Empty, Panel } from '../components/ui';
import { equity, won, type ConnectionFailure, type Event as WorkspaceEvent } from '../../shared/model';
import { DEFAULT_PAPER_MAX_QTY } from '../../shared/contracts';
import { portfolioValue } from '../../shared/portfolio';
import { authenticationStatus } from '../../shared/status';

export function Risk() {
  const { state, status, serverNow, act, busy, available, connection, paperRisk } = useWorkbench();
  const [params, setParams] = useSearchParams();
  const demo = params.get('env') !== 'kis';
  function selectEnvironment(nextDemo: boolean) {
    if (nextDemo === demo) return;
    const next = new URLSearchParams(params);
    if (nextDemo) next.delete('env');
    else next.set('env', 'kis');
    setParams(next);
  }

  const ordersAge = paperRisk?.orders ? serverNow - Date.parse(paperRisk.orders.observedAt) : Infinity;
  const currentOrders = ordersAge >= 0 && ordersAge < 60_000;
  const currentBalance = connection.connected && connection.status.complete && Boolean(connection.balance);
  const known = available && (demo || (currentBalance && currentOrders && paperRisk?.unresolvedCount === 0));
  const positions = demo
    ? state.positions.map(p => ({ ...p, price: state.instruments.find(s => s.code === p.code)?.price ?? p.average }))
    : connection.balance?.positions ?? [];
  const orders = demo
    ? state.orders.filter(o => o.status === 'pending').map(o => ({ ...o, remaining: o.qty, cancelled: false }))
    : paperRisk?.orders?.rows ?? [];
  const codes = [...new Set([...positions.map(p => p.code), ...orders.filter(o => !o.cancelled && o.remaining > 0).map(o => o.code)])];
  const baseline = demo ? state.startingEquity : paperRisk?.baselineEquity;
  const currentEquity = demo ? equity(state) : connection.balance?.totalEquity;
  const loss = baseline != null && currentEquity != null ? Math.max(0, baseline - currentEquity) : null;
  const loading = status.phase === 'loading';
  const unavailableValue = loading ? '확인 중' : '미확인';
  const halted = state.risk.halted;
  const [halting, setHalting] = useState(false);
  const unresolved = paperRisk?.unresolvedCount ?? 0;
  const resumeBlocked = halted && (!paperRisk || unresolved > 0);
  const changes = state.events.filter(e => ['위험 한도 변경', '신규 주문 긴급정지', '신규 주문 허용', '위험관리 요청 차단', '주문 요청 차단', '전략 주문 차단'].includes(e.title)).slice(0, 5);
  const balanceReason = {
    disconnected: 'KIS 잔고 미연결', loading: 'KIS 잔고 조회 중', ready: 'KIS 전체 잔고 미확인',
    stale: 'KIS 잔고 확인 기한 경과', partial: 'KIS 잔고 일부만 수신', error: 'KIS 잔고 조회 실패',
  }[connection.status.phase];
  const money = (amount: number) => available ? won(amount) + '원' : unavailableValue;
  const time = (at: string | null | undefined) => at ? new Date(at).toLocaleString('ko-KR') : '미확인';

  return <div className="risk-page">
    <Panel title="환경별 사용량과 차단 이유" className="risk-usage">
      <div className="tabs" role="group" aria-label="사용량 환경">
        <button aria-pressed={demo} className={demo ? 'active' : ''} onClick={() => selectEnvironment(true)}>DEMO 사용량</button>
        <button aria-pressed={!demo} className={!demo ? 'active' : ''} onClick={() => selectEnvironment(false)}>KIS 모의 사용량</button>
      </div>
      <div className="risk-reading">
        {known ? <>
          <div className="risk-loss"><span>손실 사용량 / 한도</span><strong>{loss === null ? '기준 미설정' : `${won(loss)}원 / ${won(state.risk.dailyLoss)}원`}</strong></div>
          <p className="muted">{demo ? 'DEMO 시작 자산 − 현재 평가자산, 최솟값 0' : 'KIS 당일 첫 주문 전 총평가금액 − 조회 총평가금액, 최솟값 0'}</p>
          <div role="status">
            {halted && <p>긴급정지로 신규 주문 차단</p>}
            {loss === null ? <p>첫 주문 검증 때 손실 기준을 설정합니다.</p> : loss >= state.risk.dailyLoss
              ? <p>손실 한도 도달 · 신규 매수·매도 차단</p>
              : !halted && <p>주문별 금액·현금·보유 수량을 추가 검사합니다.</p>}
          </div>
        </> : <>
          <h3>{demo ? 'DEMO' : 'KIS'} 사용량 {unavailableValue}</h3>
          {!available ? <p>{loading ? '로컬 상태를 읽고 있습니다.' : '로컬 서버의 최신 상태를 확인하세요.'}</p> : <ul>
            {!currentBalance && <li>{balanceReason} · <Link to="/settings">연결·잔고 확인</Link></li>}
            {!paperRisk || !currentOrders ? <li>{!paperRisk ? '로컬 주문 원장 상태 미확인' : !paperRisk.orders ? '당일 주문 대조 기록 없음' : ordersAge < 0 ? '주문 대조 시각 확인 필요' : '주문 대조 후 60초 경과'} · <Link to="/paper">KIS 주문 대조</Link></li> : null}
            {unresolved > 0 && <li>불명·전송 중 {unresolved}건 · <Link to="/paper">주문 상태 복구</Link></li>}
          </ul>}
        </>}
      </div>
      <details className="risk-details">
        <summary>계산 기준과 확인 시각</summary>
        <p>{demo ? 'DEMO는 일별 자동 초기화가 없습니다. 미체결 매수 금액은 현금·종목 한도에 예약되며 1회 주문 한도에는 합산하지 않습니다.' : 'KST 거래일의 기준 자산을 사용하며 입출금을 보정하지 않습니다. 이 화면은 저장된 조회 결과를 읽고, 새 주문은 최신 시세와 가능수량으로 다시 검사합니다.'}</p>
        {known && <p>기준 자산 / 현재 평가자산 · {baseline == null ? '미설정' : money(baseline)} / {currentEquity == null ? '미확인' : money(currentEquity)}</p>}
        <p>{demo ? `DEMO 합성 데이터 · 로컬 확인 ${time(status.lastSuccessAt)}` : `KIS 저장 조회값 · 기준일 ${paperRisk?.day ?? '미확인'} · 마지막 전체 잔고 ${time(connection.status.lastSuccessAt)} · 주문 대조 ${time(paperRisk?.orders?.observedAt)}`}</p>
      </details>
    </Panel>

    <Panel title="DEMO·KIS 공통 주문 제어" className="risk-controls" action={
      <Link className="text-link" to={'/settings/trading/general?from=risk' + (demo ? '' : '&env=kis')}>매매 한도 변경</Link>
    }>
      <p className="risk-impact" id="risk-impact">{!available ? '최신 서버 상태 확인 후 신규 주문을 제어할 수 있습니다.' : halted
        ? '재개하면 신규 주문의 긴급정지만 해제합니다. 기존 접수 주문과 보유자산은 유지됩니다.'
        : '신규 주문과 전략 실행을 멈춥니다. 접수된 주문과 보유자산은 유지됩니다.'}</p>
      {available && unresolved > 0 && <p className="risk-warning" role="alert">KIS 불명·전송 중 {unresolved}건 · {halted ? '대조 전 재개 금지' : '주문 상태 대조 필요'}</p>}
      {available && halted && !paperRisk && <p role="status">주문 원장 상태 미확인 · 새로고침 후 재개하세요.</p>}
      {available && halted && <p className="risk-resume" id="risk-resume">재개해도 손실 한도 검사가 적용되고 전략은 직접 시작해야 합니다.</p>}
      <button className={`button ${halted ? 'secondary' : 'danger'}`} disabled={(!halted ? halting : busy || halting) || !available || resumeBlocked}
        aria-describedby={available && halted ? 'risk-impact risk-resume' : 'risk-impact'} onClick={() => {
          setHalting(true);
          void act('risk/halt', { halted: !halted }).catch(() => {}).finally(() => setHalting(false));
        }}>
        {halted ? <Check size={15} aria-hidden="true" /> : <Square size={15} aria-hidden="true" />}{!available ? '신규 주문 상태 ' + unavailableValue : halted ? '신규 주문 허용' : '신규 주문 긴급정지'}
      </button>
      <div className="risk-order-links"><Link to="/orders">DEMO 미체결 주문 확인</Link><Link to="/paper">KIS 주문 대조·불명 복구</Link></div>
      <dl className="risk-caps">
        <div><dt>1회 주문 한도</dt><dd>{money(state.risk.maxOrder)}</dd></div>
        <div><dt>종목별 한도</dt><dd>{money(state.risk.maxPosition)}</dd></div>
        <div><dt>공통 손실 한도</dt><dd>{money(state.risk.dailyLoss)}</dd></div>
      </dl>
      <details className="risk-details"><summary>매매 한도 적용 방식</summary>
        <p>주문 1건의 지정가 × 수량</p><p>KIS 시장가 주문은 상한가 × 수량으로 검사합니다. 종목별 한도는 보유 평가액과 미체결 매수, 신규 매수 금액을 합산합니다. 공통 손실 한도는 각 환경의 기준 자산으로 매수·매도를 모두 검사합니다. 정지는 서버를 다시 시작해도 유지됩니다.</p>
      </details>
    </Panel>

    {known && <Panel title={demo ? 'DEMO 종목별 사용량' : 'KIS 모의 종목별 사용량'} className="risk-exposure">
      {codes.length ? <div className="table-scroll" role="region" aria-label="종목별 한도 사용량" tabIndex={0}>
        <table><thead><tr>{['종목', '종목 한도 사용량 (원)', '한도 (원)', '보유 평가액 (원)', '매수 예약액 (원)', '매도 가능 보유'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{codes.map(code => {
            const p = positions.find(p => p.code === code), qty = p?.qty ?? 0;
            const held = qty === 0 ? 0 : p?.price == null ? null : qty * p.price;
            const buys = orders.filter(o => o.code === code && o.side === 'buy' && !o.cancelled && o.remaining > 0);
            const pendingBuy = buys.some(o => o.price <= 0) ? null : buys.reduce((sum, o) => sum + o.remaining * o.price, 0);
            const reservedSell = orders.filter(o => o.code === code && o.side === 'sell' && !o.cancelled).reduce((sum, o) => sum + o.remaining, 0);
            const used = held === null || pendingBuy === null ? null : held + pendingBuy;
            const name = (!demo && connection.balance?.positions.find(p => p.code === code)?.name) || state.instruments.find(i => i.code === code)?.name;
            return <tr key={code}>
              <td>{name ? <>{name} <small>{code}</small></> : code}</td>
              <td>{used === null ? '미확인' : won(used)}{used !== null && used >= state.risk.maxPosition && <Badge>추가 매수 한도 도달</Badge>}</td>
              <td>{won(state.risk.maxPosition)}</td><td>{held === null ? '평가 불가' : won(held)}</td><td>{pendingBuy === null ? '예약액 미확인' : won(pendingBuy)}</td><td>{Math.max(0, qty - reservedSell)}주 / 보유 {qty}주</td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <Empty title="보유·미체결 없음">조회한 환경에 보유와 미체결 주문이 없습니다.</Empty>}
    </Panel>}
    <Panel title="최근 위험관리 이벤트" className="risk-events">
      {!available ? <p>최신 이벤트 {unavailableValue}</p> : changes.length ? changes.map(e => <article className="event" key={e.id}><div><h3>{e.title}</h3><p>{e.detail}</p><time>{time(e.time)}</time></div></article>) : <Empty title="위험관리 이벤트 없음">한도 변경·정지·재개·주문 차단을 이곳에서 확인합니다.</Empty>}
    </Panel>
  </div>;
}

export function Journal() {
  const { state, server, status, act, refresh, available, busy } = useWorkbench();
  const { key: visit } = useLocation();
  const instruments = server ? state.instruments : [];
  const firstCode = instruments[0]?.code ?? '';
  const [code, setCode] = useState(firstCode);
  useEffect(() => { if (!code && firstCode) setCode(firstCode); }, [code, firstCode]);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  useLayoutEffect(() => {
    setQuery(typeof history.state?.journalSearch === 'string' ? history.state.journalSearch : '');
  }, [visit]);
  const [feedback, setFeedback] = useState<{ message: string; blocked?: boolean }>();
  const recordsTitle = useRef<HTMLHeadingElement>(null);
  const stockInput = useRef<HTMLSelectElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const memoInput = useRef<HTMLTextAreaElement>(null);
  const draftRevision = useRef(0);
  const current = Boolean(server) && available && status.complete;
  useEffect(() => {
    if (current) setFeedback(previous => previous?.blocked ? undefined : previous);
  }, [current]);
  const records = server ? state.journal : [];
  const names = new Map(instruments.map(s => [s.code, s.name]));
  const validStock = names.has(code);
  const stockPlaceholder = instruments.length ? '종목을 다시 선택하세요' : current ? '선택할 종목 없음' : '종목 목록 미확인';
  const term = query.trim().toLowerCase();
  const entries = records.filter(j => [j.text, j.code, names.get(j.code) ?? ''].some(value => value.toLowerCase().includes(term)));

  function search(value: string) {
    setQuery(value);
    // Keep free text out of the URL and keep the router's own history fields.
    try { history.replaceState({ ...history.state, journalSearch: value }, ''); }
    catch { /* Filtering still works when browser history writes are restricted. */ }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!validStock || busy) return;
    if (!current) {
      setFeedback({ message: '최신 로컬 상태를 확인한 뒤 다시 저장하세요. 초안은 유지됩니다.', blocked: true });
      return;
    }
    const submittedRevision = draftRevision.current;
    setFeedback(undefined);
    try {
      await act('journal', { code, text });
      if (draftRevision.current === submittedRevision) setText('');
      setFeedback({ message: `${names.get(code) ?? code} 메모를 저장했습니다.` });
    } catch (error) {
      setFeedback({ message: error instanceof Error && 'definitive' in error && error.definitive
        ? '저장하지 못했습니다. 입력한 내용을 확인하세요.'
        : '저장 결과를 확인하지 못했습니다. 초안은 유지됩니다. 다시 저장하기 전에 목록을 확인하세요.' });
    }
  }

  const scope = current ? '전체' : '수신';
  const showSearch = Boolean(server && (records.length || query));
  return <div className="grid-main journal-page">
    <section className="panel journal-records" aria-labelledby="journal-records-title">
      <header className="journal-heading">
        <div><h2 id="journal-records-title" tabIndex={-1} ref={recordsTitle}>나의 기록</h2><span className="journal-source">로컬 저장{records.length > 0 && ` · ${term ? `검색 ${entries.length}건 / ` : ''}${scope} ${records.length}건`}</span></div>
        {records.length > 0 && <button type="button" className="button secondary journal-jump" onClick={() => (stockInput.current?.disabled ? memoInput.current : stockInput.current)?.focus()}>메모 작성</button>}
        {showSearch && <div className="journal-search">
          <input ref={searchInput} aria-label="일지 검색" placeholder="종목명·코드·본문 검색" value={query} onChange={e => search(e.target.value)} />
          {query && <button type="button" onClick={() => { search(''); (records.length ? searchInput.current : recordsTitle.current)?.focus(); }}>검색 지우기</button>}
        </div>}
      </header>
      {!current && <p className="journal-status" role="status">{!server
        ? status.phase === 'loading' ? '저장한 기록을 불러오는 중입니다.' : '저장한 기록을 확인하지 못했습니다.'
        : status.phase === 'partial' || (available && !status.complete) ? '전체 기록을 확인하지 못했습니다. 받은 기록만 표시합니다.' : '마지막으로 받은 기록입니다. 최신 목록을 확인해야 합니다.'}</p>}
      {entries.map(j => <article className="journal-entry" key={j.id}>
        <div><strong>{names.get(j.code) ?? '종목명 미확인'} <small>{j.code}</small></strong><time dateTime={j.date}>{new Date(j.date).toLocaleString('ko-KR')}</time></div>
        <p>{j.text}</p>
      </article>)}
      {(current || records.length > 0) && !entries.length && <div className="journal-empty">
        <h3>{records.length ? (current ? '검색 결과가 없습니다' : '받은 기록에서 검색 결과가 없습니다') : '기록이 쌓이면 원칙이 보입니다'}</h3>
        <p>{records.length ? '다른 종목명·코드·본문으로 검색해 보세요.' : '종목을 고르고 첫 매매 메모를 남겨보세요.'}</p>
      </div>}
    </section>
    <section className="panel journal-compose" aria-labelledby="journal-compose-title">
      <form onSubmit={save}>
        <header className="journal-heading"><h2 id="journal-compose-title">기록 작성</h2>
          <label className="journal-stock">종목<select ref={stockInput} disabled={!instruments.length} value={validStock ? code : ''} onChange={e => { draftRevision.current += 1; setCode(e.target.value); }}>
            {!validStock && <option value="" disabled>{stockPlaceholder}</option>}
            {instruments.map(s => <option value={s.code} key={s.code}>{s.name}</option>)}
          </select></label>
        </header>
        <label className="field" htmlFor="journal-note">매매 메모</label>
        <textarea ref={memoInput} id="journal-note" rows={3} required maxLength={2000} disabled={!server} value={text} placeholder="관찰한 이유나 다음에 지킬 원칙" onChange={e => { draftRevision.current += 1; setText(e.target.value); }} />
        <div className="journal-submit"><span>{text.length.toLocaleString('ko-KR')} / 2,000</span><button className="button primary" disabled={!current || !validStock || busy}>일지 저장</button></div>
        {feedback && <div className="journal-feedback">
          <p role={feedback.blocked ? 'alert' : undefined}>{feedback.message}</p>
          {feedback.blocked ? <button type="button" onClick={() => void refresh()}>로컬 상태 확인</button> :
            <button type="button" onClick={() => { search(''); recordsTitle.current?.focus(); void refresh(); }}>전체 기록 확인</button>}
        </div>}
      </form>
    </section>
  </div>;
}
const alertFilters = [
  { key: 'level', label: '중요도', options: [['info', '안내'], ['warning', '주의'], ['error', '오류']] },
  { key: 'env', label: '환경', options: [['demo', 'DEMO'], ['kis-paper', 'KIS 모의'], ['shared', '공통 위험'], ['unknown', '미확인']] },
  { key: 'read', label: '읽음 상태', options: [['unread', '미읽음'], ['read', '읽음']] },
] as const;

function alertCause(event: WorkspaceEvent) {
  if (!event.target) return null;
  const kis = event.environment === 'kis-paper';
  const prefix = kis ? 'KIS 모의 ' : event.environment === 'demo' ? 'DEMO ' : '';
  switch (event.target) {
    case 'strategies': return { to: kis ? '/strategies?environment=kis-paper' : '/strategies', label: prefix + '전략' };
    case 'orders': return { to: kis ? '/orders?view=kis' : '/orders', label: prefix + '주문·체결' };
    case 'risk': return { to: kis ? '/risk?env=kis' : '/risk', label: '위험관리' };
    case 'paper': return { to: '/paper', label: 'KIS 모의 매매' };
    case 'settings': return { to: '/settings', label: '연결·설정' };
  }
}

export function Alerts() {
  const { state, act, status, server, realtime, available, busy } = useWorkbench();
  const [params, setParams] = useSearchParams();
  const [feedback, setFeedback] = useState('');
  const selection = alertFilters.map(group => group.options.find(([id]) => id === params.get(group.key))?.[0] ?? 'all');
  const [level, environment, read] = selection;
  const received = Boolean(server);
  const initialLoading = !received && status.phase === 'loading';
  const current = received && available && status.complete;
  const partial = received && (status.phase === 'partial' || (available && !status.complete));
  const events = received ? state.events : [];
  const rows = events.filter(e => (level === 'all' || e.level === level)
    && (environment === 'all' || (e.environment ?? 'unknown') === environment)
    && (read === 'all' || e.read === (read === 'read')));
  const unreadIds = rows.filter(e => !e.read).map(e => e.id);
  const filtered = level !== 'all' || environment !== 'all' || read !== 'all';
  const realtimePhase = received && realtime ? { stopped: '미연결', connecting: '연결 중', reconciling: '대조 필요', ready: '대조 완료', disconnected: '수신 중단', error: '오류' }[realtime.phase] : '상태 미확인';
  const urgent = realtime?.phase === 'error' || realtime?.phase === 'disconnected' || realtime?.phase === 'reconciling'
    || Boolean(realtime?.required && !realtime.ordersAllowed);
  const realtimeDetails = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (received && urgent && realtimeDetails.current) realtimeDetails.current.open = true;
  }, [received, urgent]);

  function updateFilter(key?: string, value?: string) {
    const next = new URLSearchParams(params);
    if (!key) alertFilters.forEach(group => next.delete(group.key));
    else if (value && value !== 'all') next.set(key, value);
    else next.delete(key);
    setFeedback('');
    setParams(next, { replace: true });
  }

  async function markVisibleRead() {
    setFeedback('');
    try {
      await act('events/read', { ids: unreadIds });
      setFeedback(`선택 당시 미읽음 ${unreadIds.length}건의 저장 요청을 처리했습니다.`);
    } catch {
      setFeedback('읽음 저장 결과를 확인하지 못했습니다. 목록의 읽음 상태를 확인한 뒤 다시 시도하세요.');
    }
  }

  return <Panel className="alerts-page" title="워크스페이스 이벤트" action={
    <button className="button secondary" disabled={!current || busy || !unreadIds.length} onClick={() => void markVisibleRead()}>
      <Check size={16} aria-hidden="true" />{current ? `이 목록 ${unreadIds.length}건 읽음 처리` : '이 목록 읽음 처리'}
    </button>
  }>
    <div className="alerts-filters">{alertFilters.map((group, index) => <div key={group.key}>
      <label htmlFor={`alerts-${group.key}`}>{group.label}</label>
      <select id={`alerts-${group.key}`} value={selection[index]} onChange={e => updateFilter(group.key, e.target.value)}>
        <option value="all">전체</option>{group.options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
    </div>)}</div>
    <div className="alerts-scope"><span role="status">{received && <>수신 {events.length}건 중 표시 {rows.length}건 · 이 목록 미읽음 {unreadIds.length}건</>}</span>
      <small>최근 최대 1,000건 · 읽음만 로컬에 저장 · 외부 발송 없음</small>
    </div>
    {feedback && <p className="alerts-feedback" role="status">{feedback}</p>}
    {!current && <p className={initialLoading ? 'alerts-feedback' : 'alerts-warning'} role="status">{!received
      ? initialLoading ? '이벤트를 불러오는 중입니다.' : '이벤트 수신 여부 미확인 · 로컬 서버 연결을 다시 확인하세요.'
      : `${partial ? '이벤트 일부 수신' : '최신 이벤트 미확인'} · 받은 기록만 표시합니다. 추가 이벤트가 누락될 수 있어 읽음 저장을 중단합니다.`}
      {received && status.lastSuccessAt && <> 마지막 전체 확인 <time dateTime={status.lastSuccessAt}>{new Date(status.lastSuccessAt).toLocaleString('ko-KR')}</time></>}
    </p>}
    {received && urgent && <p className="alerts-warning" role="alert">{!current && '마지막 수신 기준 · '}KIS 실시간 {realtimePhase}
      {realtime?.required && !realtime.ordersAllowed && ' · 실시간 기준 신규 주문 차단'} · <Link to="/paper">KIS 대조 화면</Link>
    </p>}
    <details className="alerts-realtime" ref={realtimeDetails}><summary>{received && realtime && !current && '마지막 수신 기준 · '}KIS 실시간 {realtimePhase} 상세</summary><RealtimeStatus /></details>
    {rows.map(e => {
      const cause = alertCause(e);
      return <article className={`event ${e.read ? 'read' : ''}`} key={e.id}>
        <div>
          <div className="alerts-meta"><span className={`alert-level ${e.level}`}>{{ info: '안내', warning: '주의', error: '오류' }[e.level]}</span>
            <span>{e.environment ? { 'kis-paper': 'KIS 모의', shared: '공통 위험', demo: 'DEMO' }[e.environment] : '환경 미확인'}</span>
            <span>{e.read ? '읽음' : '미읽음'}</span><time dateTime={e.time}>{new Date(e.time).toLocaleString('ko-KR')}</time>
          </div>
          <h3>{!e.read && <span className="unread-dot" aria-hidden="true" />}{e.title}</h3>
          <p>{e.detail}</p>
          {cause && <Link to={cause.to} className="text-link alerts-cause">{cause.label} 원인 화면</Link>}
          {e.requestId && <details className="alerts-request"><summary>요청 ID</summary><code>{e.requestId}</code></details>}
        </div>
      </article>;
    })}
    {!rows.length && (current || events.length > 0) && <Empty title={events.length ? '조건에 맞는 이벤트가 없습니다' : '아직 이벤트가 없습니다'}>
      {events.length && filtered ? <button className="text-link" onClick={() => updateFilter()}>필터 초기화</button> : '주문·전략·위험관리 동작이 이곳에 기록됩니다.'}
    </Empty>}
  </Panel>;
}
export { DataStatus } from './DataInventory';
const connectionRecovery: Record<ConnectionFailure['kind'], { label: string; action: string }> = {
  missing: { label: '필수 설정 미주입', action: '연결 설정 방법을 열어 Infisical에 모의 계좌 정보를 등록한 뒤 서버를 다시 실행하세요.' },
  invalid: { label: '설정 형식 오류', action: 'Infisical에서 키 앞뒤 공백·개행 여부와 계좌번호 앞 8자리, 상품코드 2자리를 확인하고 서버를 다시 실행하세요.' },
  expired: { label: '만료·갱신 필요', action: '인증 갱신 대기 시각 이후 다시 조회하세요. 토큰은 서버에서 갱신하며 잔고 응답까지 확인합니다.' },
  permission: { label: '인증·권한 거부', action: '모의투자 API 서비스 신청, 모의 전용 키와 계좌 권한을 확인하세요. 키를 바꿨다면 서버를 다시 실행하세요.' },
  'rate-limit': { label: '호출 제한', action: '연속 클릭을 멈추고 잠시 기다린 뒤 다시 조회하세요. 인증 발급은 1분 간격으로 제한합니다.' },
  network: { label: '네트워크 오류', action: '네트워크와 KIS 모의 서버 연결을 확인한 뒤 다시 조회하세요. 실전 서버로 전환하지 않습니다.' },
  upstream: { label: 'KIS 서비스 오류', action: 'KIS 서비스 상태와 점검 공지를 확인하고 잠시 후 다시 조회하세요.' },
  contract: { label: '응답 확인 불가', action: '전체 잔고를 확정하지 못했습니다. 다시 조회해도 반복되면 응답 계약을 점검하세요.' },
  rejected: { label: '요청 거부', action: '모의 계좌·키·서비스 이용 가능 시간을 확인한 뒤 다시 조회하세요.' },
};
export function Settings() {
  const { state, act, busy, available, connection, realtime, paperRisk, refresh, server, serverNow, status } = useWorkbench();
  const [checking, setChecking] = useState(false);
  const previousCheckStart = useRef<string | null>(null);
  const [params, setParams] = useSearchParams();
  const showGuide = params.get('guide') === 'setup';
  const [refreshState, setRefreshState] = useState<'idle' | 'pending' | 'settled' | 'confirmed' | 'unavailable'>('idle');
  useEffect(() => {
    if (refreshState === 'settled') {
      setRefreshState(available ? 'confirmed' : 'unavailable');
      return;
    }
    if (refreshState !== 'confirmed' && refreshState !== 'unavailable') return;
    if ((refreshState === 'confirmed') !== available) {
      setRefreshState('idle');
      return;
    }
    const timer = window.setTimeout(() => setRefreshState('idle'), 5000);
    return () => window.clearTimeout(timer);
  }, [available, refreshState]);
  const authentication = authenticationStatus(connection.authentication, serverNow);
  const retrySeconds = authentication.retryAt ? Math.max(0, Math.ceil((Date.parse(authentication.retryAt) - serverNow) / 1000)) : 0;
  const elapsed = connection.checkStartedAt ? Math.max(0, Math.floor((serverNow - Date.parse(connection.checkStartedAt)) / 1000)) : 0;
  const loading = checking || connection.status.phase === 'loading';
  const confirmedProgress = connection.status.phase === 'loading' && connection.checkStartedAt !== null
    && (!checking || connection.checkStartedAt !== previousCheckStart.current);
  const currentBalance = available && connection.status.phase === 'ready' && connection.status.complete && Boolean(connection.balance) && !loading;
  const time = (value: string | null) => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '없음';
  const injectionLabel = { unverified: '미확인', missing: '미주입', invalid: '설정 형식 오류', present: '필수 값 있음' }[connection.injection.phase];
  const authLabel = { unverified: '미확인', loading: '인증 중', ready: '토큰 발급됨', expired: '만료·갱신 필요', error: '인증 실패' }[authentication.phase];
  const balanceLabel = { disconnected: '미조회', loading: '조회 중', ready: '전체 조회 확인', stale: '다시 조회 필요', partial: '일부만 수신', error: '조회 실패' }[connection.status.phase];
  const injectionFailure: ConnectionFailure | null = connection.injection.phase === 'missing' || connection.injection.phase === 'invalid' ? { kind: connection.injection.phase, message: '서버 필수 환경변수와 계좌 형식을 확인하세요.' } : null;
  const setupBlocked = available && injectionFailure !== null;
  const failure = available && !loading ? injectionFailure ?? connection.failure ?? authentication.failure : null;
  const balance = connection.balance;
  const portfolio = balance ? portfolioValue(balance.cash, balance.positions) : null;
  const formatProfit = (value: number | null) => {
    if (value === null) return { text: '평가 불가', tone: undefined as 'up' | 'down' | undefined };
    const rounded = Math.round(value);
    if (rounded > 0) return { text: `+${won(rounded)}원`, tone: 'up' as const };
    if (rounded < 0) return { text: `${won(rounded)}원`, tone: 'down' as const };
    return { text: '0원', tone: undefined };
  };
  const portfolioProfit = formatProfit(portfolio ? portfolio.profit : null);
  const realtimePhaseLabels = {
    stopped: '미연결',
    connecting: '연결 중',
    reconciling: 'REST 대조 필요',
    ready: 'REST 대조 완료',
    disconnected: '수신 중단',
    error: '오류',
  } as const;
  const realtimePhaseLabel = available && realtime ? (realtimePhaseLabels[realtime.phase] ?? '상태 미확인') : '상태 미확인';
  const kisStrategies = state.strategies.filter(s => s.environment === 'kis-paper');
  const demoStrategies = state.strategies.filter(s => s.environment !== 'kis-paper');
  const missingSettings = connection.injection.phase === 'missing';
  const missingFields = connection.injection.missing;
  const initialLoad = !available && status.phase === 'loading';
  function overview() {
    if (initialLoad) return { title: '서버 상태를 확인하고 있습니다', detail: '서버의 연결 상태를 불러오는 중입니다.', tone: 'neutral' };
    if (!available) return { title: '로컬 서버 연결을 확인하세요', detail: '개발 서버를 실행한 뒤 서버 상태를 새로고침하세요.', tone: 'warning' };
    if (loading) return { title: '모의 잔고를 조회하고 있습니다', detail: '한국투자증권에서 전체 잔고를 받아오고 있습니다.', tone: 'neutral' };
    if (injectionFailure) {
      const detail = missingSettings && missingFields.length > 0
        ? `필수 값 ${missingFields.length}개가 빠졌습니다. 연결 설정 방법에서 누락 항목을 확인하고 Infisical에 등록하세요.`
        : connectionRecovery[injectionFailure.kind].action;
      return { title: missingSettings ? '모의 계좌 설정이 필요합니다' : '모의 계좌 설정을 수정하세요', detail, tone: 'warning' };
    }
    if (connection.status.phase === 'partial') {
      const recovery = failure && connectionRecovery[failure.kind];
      const balanceNote = balance ? '표시 금액은 이전 전체 조회 기준입니다.' : '아직 전체 조회 잔고가 없습니다.';
      return {
        title: recovery ? `잔고 일부 수신 · ${recovery.label}` : '잔고를 일부만 받았습니다',
        detail: `${balanceNote} ${recovery?.action ?? '전체 잔고를 확인하려면 다시 조회하세요.'}`,
        tone: 'warning',
      };
    }
    if (failure) {
      const recovery = connectionRecovery[failure.kind];
      const action = failure.kind === 'expired' && retrySeconds === 0
        ? '지금 다시 조회하면 서버에서 토큰을 갱신하고 전체 잔고를 확인합니다.'
        : recovery.action;
      const prefix = currentBalance
        ? '아래 잔고는 최근 전체 조회 기준입니다. '
        : balance
          ? '표시 금액은 이전 전체 조회 기준입니다. '
          : '';
      return { title: recovery.label, detail: prefix + action, tone: 'warning' };
    }
    if (retrySeconds > 0) return { title: '인증 갱신을 기다리고 있습니다', detail: '대기 시간이 끝나면 모의 잔고를 다시 조회할 수 있습니다.', tone: 'neutral' };
    if (currentBalance) return { title: '모의 잔고를 확인했습니다', detail: '아래에서 예수금과 보유 종목을 확인할 수 있습니다.', tone: 'success' };
    if (connection.status.phase === 'error') return { title: '모의 잔고 조회에 실패했습니다', detail: '잠시 후 다시 조회하세요. 서버 상세 정보에서 오류를 확인할 수 있습니다.', tone: 'warning' };
    if (balance) return { title: '잔고를 다시 조회하세요', detail: '아래 금액은 이전 전체 조회 기준입니다. 다시 조회하면 현재 잔고를 확인할 수 있습니다.', tone: 'warning' };
    return { title: '모의 잔고를 조회하세요', detail: '조회하면 한국투자증권 모의 계좌의 예수금과 보유 종목을 불러옵니다.', tone: 'neutral' };
  }
  const summary = overview();
  const checkDisabled = !available || setupBlocked || busy || loading || retrySeconds > 0;
  function toggleGuide() {
    const next = new URLSearchParams(params);
    if (showGuide) next.delete('guide');
    else next.set('guide', 'setup');
    setParams(next, { replace: true, preventScrollReset: true });
  }
  async function check() {
    previousCheckStart.current = connection.checkStartedAt;
    setChecking(true);
    try { await act('kis/check'); } catch { /* App displays the request error. */ } finally { setChecking(false); }
  }
  async function refreshStatus() {
    setRefreshState('pending');
    try { await refresh(); } finally { setRefreshState('settled'); }
  }
  const guideButton = <button key="guide" type="button" className={`button ${setupBlocked ? 'primary' : 'secondary'}`} aria-expanded={showGuide}
    aria-controls="connection-guide" onClick={toggleGuide}>연결 설정 방법<ChevronDown size={15} aria-hidden="true" /></button>;
  const checkButton = <button key="check" type="button" className={`button ${checkDisabled ? 'secondary' : 'primary'}`} disabled={checkDisabled}
    aria-describedby={available && retrySeconds > 0 ? 'settings-retry' : 'settings-summary-detail'} onClick={() => void check()}><Wallet size={17} aria-hidden="true" />KIS 모의 잔고 조회</button>;
  return <div className="settings-page">
    <section className="settings-overview" aria-label="모의 계좌 연결">
      <div className="settings-task">
        <header className="settings-provider"><span className="settings-provider-icon"><Landmark size={20} aria-hidden="true" /></span>
          <strong>한국투자증권</strong><Badge>모의 계좌</Badge>
        </header>
        <div className={`settings-summary ${summary.tone}`} role="status" aria-label={failure ? '연결 복구 안내' : '현재 연결 상태'}>
          <h2>{summary.title}</h2><p id="settings-summary-detail">{summary.detail}</p>
        </div>
        {available && retrySeconds > 0 && <p id="settings-retry">{retrySeconds}초 후 다시 조회할 수 있습니다.</p>}
        <div className="settings-actions">
          {setupBlocked ? guideButton : checkButton}
          <button type="button" className={`button ${!available && !initialLoad ? 'primary' : 'secondary'}`} disabled={refreshState === 'pending'}
            aria-describedby="settings-refresh-effect" onClick={() => void refreshStatus()}>
            <RefreshCw size={15} aria-hidden="true" />로컬 서버 상태 새로고침</button>
          {setupBlocked ? checkButton : guideButton}
        </div>
        <p className="settings-hint" id="settings-refresh-effect">새로고침은 로컬 상태만 읽습니다. KIS 조회에 성공하면 전체 잔고가 갱신됩니다.</p>
        <p className="settings-feedback" role="status" aria-label="새로고침 결과">
          {refreshState === 'pending' && '서버 응답을 기다리고 있습니다.'}
          {refreshState === 'confirmed' && available && '로컬 서버 상태를 확인했습니다. 외부 KIS 호출 없음.'}
          {refreshState === 'unavailable' && !available && '로컬 서버 상태를 확인하지 못했습니다. 외부 KIS 호출 없음.'}
        </p>
      </div>
      <section className="settings-checks" aria-label="연결 점검">
        <h3>연결 점검</h3>
        <div className="settings-stages">
          <div role="group" aria-label="서버 필수 설정 상태"><span><Settings2 size={16} aria-hidden="true" />서버 키·계좌 설정</span>
            <Badge>{available ? injectionLabel : '서버 상태 확인 필요'}</Badge></div>
          <div role="group" aria-label="KIS 인증 상태"><span><ShieldCheck size={16} aria-hidden="true" />KIS 인증</span>
            <Badge tone={available && authentication.phase === 'ready' ? 'teal' : 'neutral'}>{available ? authLabel : '서버 상태 확인 필요'}</Badge></div>
          <div role="group" aria-label="모의 잔고 조회 상태"><span><Wallet size={16} aria-hidden="true" />잔고 조회</span>
            <Badge tone={currentBalance ? 'teal' : 'neutral'}>{!available ? '서버 상태 확인 필요' : loading ? '조회 중' : balanceLabel}</Badge></div>
        </div>
        {available && loading && <p className="settings-progress">{confirmedProgress
          ? `확인한 페이지: ${connection.status.pages} · 경과 ${elapsed}초`
          : '서버의 조회 진행 상태를 기다리고 있습니다.'}</p>}
      </section>
      <div id="connection-guide" className="settings-guide" hidden={!showGuide}>
        <h3>모의 계좌 연결 방법</h3>
        <ol>
          <li>한국투자증권에서 모의투자 API를 신청하고 모의 전용 키와 계좌를 준비하세요.</li>
          <li>Infisical의 <code>dev /kis</code>에 {available && missingSettings && missingFields.length > 0
            ? <>누락된 항목을 등록하세요. <code>{missingFields.join(', ')}</code>.</>
            : <>모의 계좌의 <code>KIS_APP_KEY</code>, <code>KIS_APP_SECRET</code>, <code>KIS_CANO</code>, <code>KIS_ACNT_PRDT_CD</code>를 등록하세요.</>}
            {' '}계좌번호는 앞 8자리, 상품코드는 2자리입니다.</li>
          <li>프로젝트 폴더에서 <code className="connection-command">npm run dev</code>로 서버를 다시 실행하세요. 로그인 오류가 있으면 터미널에서 Infisical에 다시 로그인하세요.</li>
        </ol>
        <p>비밀값은 Infisical에서만 관리하세요. 서버를 다시 실행한 뒤 로컬 서버 상태를 새로고침하세요.</p>
      </div>
    </section>
    {balance && <Panel title="모의 계좌 잔고" className="settings-balance" action={<Badge tone={currentBalance ? 'teal' : 'neutral'}>{currentBalance ? '조회 완료' : '이전 조회 잔고'}</Badge>}>
      <p className="settings-hint">조회 기준 (한국시간) <time dateTime={connection.status.lastSuccessAt ?? undefined}>{time(connection.status.lastSuccessAt)}</time></p>
      <dl className="settings-cash"><dt>예수금</dt><dd>{won(balance.cash)}원</dd></dl>
      <dl className="settings-balance-summary" aria-label="모의 계좌 평가 요약">
        <div>
          <dt>총 평가자산</dt>
          <dd>{portfolio && portfolio.total !== null ? <>{`${won(portfolio.total)}원`}<small className="settings-summary-note">예수금+평가</small></> : '평가 불가'}</dd>
        </div>
        <div>
          <dt>주식·ETF 평가액</dt>
          <dd>{portfolio && portfolio.invested !== null ? `${won(portfolio.invested)}원` : '평가 불가'}</dd>
        </div>
        <div>
          <dt>보유 평가손익</dt>
          <dd className={portfolioProfit.tone}>{portfolioProfit.text}</dd>
        </div>
        <div>
          <dt>KIS 총평가액 (참고)</dt>
          <dd>{`${won(balance.totalEquity)}원`}<small className="settings-summary-note">API 기준</small></dd>
        </div>
      </dl>
      {balance.positions.length ? <>
        <h3>보유 종목 <span>{balance.positions.length}개</span></h3>
        <ul className="settings-holdings">{balance.positions.map(p => {
          const priced = p.price !== null && p.price > 0;
          const posProfit = formatProfit(priced ? p.qty * (p.price! - p.average) : null);
          return <li key={p.code}>
            <div className="settings-stock">
              <strong>{p.name}</strong>
              <small>{p.code}</small>
              <Link className="text-link settings-stock-link" to={'/paper?code=' + encodeURIComponent(p.code)}>모의 매매 ↗</Link>
            </div>
            <dl>
              <div><dt>보유 수량</dt><dd>{p.qty.toLocaleString('ko-KR')}주</dd></div>
              <div><dt>평균 매입가</dt><dd>{`${p.average.toLocaleString('ko-KR', { maximumFractionDigits: 20 })}원`}</dd></div>
              <div><dt>현재가</dt><dd>{p.price === null ? '평가 불가' : `${won(p.price)}원`}</dd></div>
              <div><dt>평가액</dt><dd>{priced ? `${won(p.qty * p.price!)}원` : '평가 불가'}</dd></div>
              <div><dt>평가손익</dt><dd className={posProfit.tone}>{posProfit.text}</dd></div>
              {p.sellable !== undefined && <div><dt>주문가능 수량</dt><dd>{p.sellable.toLocaleString('ko-KR')}주</dd></div>}
            </dl>
          </li>;
        })}</ul></> : <p className="settings-no-holdings">{currentBalance ? '보유 종목 없음' : '이전 조회 시 보유 종목 없음'}</p>}
      <div className="settings-balance-links">
        <Link className="text-link" to="/portfolio">포트폴리오 상세 ↗</Link>
        <Link className="text-link" to="/paper">KIS 주문 대조 ↗</Link>
      </div>
    </Panel>}
    <Panel title="워크스페이스 연결·운영 설정 현황" className="settings-hub">
      <div className="settings-hub-grid">
        <section className="settings-hub-card" aria-label="KIS 실시간 및 토큰 상태">
          <h3>KIS 실시간 · 인증 유효성</h3>
          <dl className="settings-hub-list">
            <div><dt>토큰 상태</dt><dd>{available ? authLabel : '서버 상태 확인 필요'}</dd></div>
            <div><dt>토큰 재확인 기한</dt><dd>{available ? time(authentication.validUntil) : '미확인'}</dd></div>
            <div><dt>실시간 WebSocket</dt><dd>{realtimePhaseLabel}</dd></div>
            <div><dt>구독 종목 / 주문 허용</dt><dd>{!available || !realtime ? '미확인' : `${realtime.code ?? '구독 없음'} · ${realtime.ordersAllowed ? '실시간 주문 허용' : '실시간 주문 차단'}`}</dd></div>
          </dl>
          <div className="settings-hub-links">
            <Link className="text-link" to="/paper">KIS 모의 매매 · 실시간 대조 ↗</Link>
          </div>
        </section>
        <section className="settings-hub-card" aria-label="공통 주문 및 위험 한도 현황">
          <h3>공통 주문 · 위험 한도</h3>
          <dl className="settings-hub-list">
            <div><dt>신규 주문 제어</dt><dd>{!available ? '상태 미확인' : state.risk.halted ? '긴급정지 켜짐 (신규 주문 정지)' : '긴급정지 꺼짐 (정상)'}</dd></div>
            <div><dt>1회 주문 / 종목별 한도</dt><dd>{available ? `${won(state.risk.maxOrder)}원 / ${won(state.risk.maxPosition)}원` : '미확인'}</dd></div>
            <div><dt>공통 일일 손실 한도</dt><dd>{available ? `${won(state.risk.dailyLoss)}원` : '미확인'}</dd></div>
            <div><dt>KIS 수동 주문 상한 / 불명 건수</dt><dd>{available ? `1회 ${state.paperManualMaxQty ?? DEFAULT_PAPER_MAX_QTY}주 · ${paperRisk ? `불명·전송 중 ${paperRisk.unresolvedCount}건` : '불명·전송 중 미확인'}` : '미확인'}</dd></div>
          </dl>
          <div className="settings-hub-links">
            <Link className="text-link" to="/settings/trading/general">일반 한도·수량 설정 ↗</Link>
            <Link className="text-link" to="/risk">위험관리·긴급정지 ↗</Link>
          </div>
        </section>
        <section className="settings-hub-card" aria-label="전략 계약 및 데이터 운영 현황">
          <h3>전략 계약 · 데이터 운영</h3>
          <dl className="settings-hub-list">
            <div><dt>KIS 모의 전략</dt><dd>{available ? `저장 ${kisStrategies.length}개 · 실행 중 ${kisStrategies.filter(s => s.active).length}개` : '미확인'}</dd></div>
            <div><dt>로컬 DEMO 전략</dt><dd>{available ? `저장 ${demoStrategies.length}개 · 실행 중 ${demoStrategies.filter(s => s.active).length}개` : '미확인'}</dd></div>
            <div><dt>당일 KIS 주문 대조</dt><dd>{available && paperRisk?.orders ? time(paperRisk.orders.observedAt) : '미대조'}</dd></div>
          </dl>
          <div className="settings-hub-links">
            <Link className="text-link" to="/settings/trading">매매 설정 · 전용 계약 ↗</Link>
            <Link className="text-link" to="/strategies?environment=kis-paper">KIS 전략 스튜디오 ↗</Link>
            <Link className="text-link" to="/data">데이터 상태 · 동기화 ↗</Link>
          </div>
        </section>
      </div>
    </Panel>
    <details className="settings-technical">
      <summary><Server size={17} aria-hidden="true" />서버·인증 상세 정보<ChevronDown size={16} aria-hidden="true" /></summary>
      <div className="settings-technical-body">
        <div><h3>실행 서버</h3>
          <dl className="settings-server" aria-label="실행 서버 식별">
            <dt>모의 API</dt><dd><code>openapivts.koreainvestment.com</code></dd>
            <dt>비밀정보 경로</dt><dd>Infisical · dev /kis</dd>
            <dt>자동 주입·공시 경로</dt><dd>Universal Auth (.secrets/infisical-dev.json) · 공시 dev /stock</dd>
            <dt>서버 시작 (한국시간)</dt><dd>{server ? time(server.startedAt) : '미확인'}</dd>
            <dt>인스턴스</dt><dd>{server?.instanceId.slice(0, 8) ?? '미확인'}</dd>
          </dl>
          <p>필수 값과 계좌 형식만 검사합니다. 주입 출처 미확인. 키를 바꾸면 서버를 다시 실행하세요.</p>
        </div>
        <div><h3>마지막 관측 기록 (한국시간)</h3>
          <dl className="settings-server">
            <dt>토큰 발급</dt><dd>{time(authentication.lastSuccessAt)}</dd><dt>토큰 재확인</dt><dd>{time(authentication.validUntil)}</dd>
            <dt>잔고 전체 조회</dt><dd>{time(connection.status.lastSuccessAt)}</dd><dt>확인한 페이지</dt><dd>{connection.status.pages}</dd>
            <dt>최근 잔고 관측</dt><dd>{time(connection.status.observedAt)}</dd>
            <dt>잔고 신선도·제한시간</dt><dd>60초 유효 · 조회 제한 {connection.balanceSeconds ?? 120}초</dd>
          </dl>
          {available && connection.status.error && !loading && <p>{connection.status.error}</p>}
          {failure && failure.message !== connection.status.error && <p>{failure.message}</p>}
          <p>이 화면은 KIS 모의 계좌만 조회합니다. 로컬 데모 잔고와 별개이며 실전 전환은 지원하지 않습니다.</p>
        </div>
      </div>
    </details>
  </div>;
}
