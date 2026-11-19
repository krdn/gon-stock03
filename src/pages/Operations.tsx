import { RealtimeStatus } from '../components/RealtimeStatus';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, ChevronDown, Link2, RefreshCw, ShieldCheck, Square } from 'lucide-react';
import { useWorkbench } from '../context';
import { Badge, Empty, Panel, Stat } from '../components/ui';
import { equity, won, type ConnectionFailure } from '../../shared/model';
import { authenticationStatus } from '../../shared/status';

export function Risk() {
  const { state, act, busy, available, connection, paperRisk } = useWorkbench();
  const [maxOrder, setMaxOrder] = useState(state.risk.maxOrder), [maxPosition, setMaxPosition] = useState(state.risk.maxPosition), [dailyLoss, setDailyLoss] = useState(state.risk.dailyLoss);
  const [dirty, setDirty] = useState(false), [environment, setEnvironment] = useState<'demo' | 'kis'>('demo');
  const editVersion = useRef(0);
  useEffect(() => { if (!dirty && available) { setMaxOrder(state.risk.maxOrder); setMaxPosition(state.risk.maxPosition); setDailyLoss(state.risk.dailyLoss); } }, [dirty, available, state.risk.maxOrder, state.risk.maxPosition, state.risk.dailyLoss]);
  const demo = environment === 'demo';
  const ordersAge = paperRisk?.orders ? Date.now() - Date.parse(paperRisk.orders.observedAt) : Infinity;
  const known = available && (demo || (connection.connected && connection.status.complete && connection.balance && paperRisk?.orders && ordersAge >= 0 && ordersAge < 60000 && paperRisk.unresolvedCount === 0));
  const positions = demo ? state.positions.map(p => ({ ...p, price: state.instruments.find(s => s.code === p.code)?.price ?? p.average })) : connection.balance?.positions ?? [];
  const orders = demo ? state.orders.filter(o => o.status === 'pending').map(o => ({ ...o, remaining: o.qty, cancelled: false })) : paperRisk?.orders?.rows ?? [];
  const codes = [...new Set([...positions.map(p => p.code), ...orders.filter(o => !o.cancelled && o.remaining > 0).map(o => o.code)])];
  const baseline = demo ? state.startingEquity : paperRisk?.baselineEquity;
  const currentEquity = demo ? equity(state) : connection.balance?.totalEquity;
  const loss = baseline != null && currentEquity != null ? Math.max(0, baseline - currentEquity) : null;
  const resumeBlocked = state.risk.halted && (!paperRisk || paperRisk.unresolvedCount > 0);
  const changes = state.events.filter(e => ['위험 한도 변경', '신규 주문 긴급정지', '신규 주문 허용', '위험관리 요청 차단', '주문 요청 차단', '전략 주문 차단'].includes(e.title)).slice(0, 5);
  async function save(e: React.FormEvent) {
    e.preventDefault(); const submittedVersion = editVersion.current;
    try { await act('risk', { maxOrder, maxPosition, dailyLoss }); if (editVersion.current === submittedVersion) setDirty(false); } catch { /* Workspace displays the failure. */ }
  }
  const edit = () => { editVersion.current++; setDirty(true); };
  return <>
    <div className="stats-grid three"><Stat label="1회 주문 한도" value={available ? `${won(state.risk.maxOrder)}원` : '미확인'} sub="주문 1건의 지정가 × 수량" /><Stat label="종목별 한도" value={available ? `${won(state.risk.maxPosition)}원` : '미확인'} sub="보유 평가액 + 미체결 매수 + 신규 매수" /><Stat label="공통 손실 한도" value={available ? `${won(state.risk.dailyLoss)}원` : '미확인'} sub="매수·매도 모두 검사 · 환경별 기준 분리" /></div>
    <div className="grid-main"><Panel title="매매 한도" action={<ShieldCheck size={20} />}><form onSubmit={save}>
      <label className="field">1회 주문 한도 (원)<input type="number" min="10000" max="100000000" step="1" required disabled={!available} value={maxOrder} onChange={e => { edit(); setMaxOrder(Number(e.target.value)); }} /></label>
      <label className="field">종목별 최대 투자금 (원)<input type="number" min="10000" max="100000000" step="1" required disabled={!available} value={maxPosition} onChange={e => { edit(); setMaxPosition(Number(e.target.value)); }} /></label>
      <label className="field">공통 손실 한도 (원)<input type="number" min="1000" max="100000000" step="1" required disabled={!available} value={dailyLoss} onChange={e => { edit(); setDailyLoss(Number(e.target.value)); }} /></label>
      <p className="muted prose">금액 한도는 DEMO 수동·전략과 KIS 모의 수동·전략 주문에 공통 적용됩니다. KIS 전략은 실시간·승인 검사도 통과해야 합니다. 이미 접수된 주문은 한도 변경으로 취소되지 않습니다.</p>
      {dirty && <p role="status">저장하지 않은 변경이 있습니다.</p>}<button className="button primary" disabled={!available || busy}>한도 저장</button>
    </form></Panel><Panel title="긴급정지" className="risk-panel"><div className="risk-symbol"><AlertTriangle size={32} /></div><h3>{state.risk.halted ? '신규 주문 정지 중' : '신규 주문을 멈출 수 있어요'}</h3>
      <p className="prose">정지하면 수동·전략의 신규 주문을 차단하고 모든 전략을 정지합니다. 보유자산을 매도하거나 접수된 주문을 취소하지는 않습니다. 정지 상태는 서버를 다시 시작해도 유지됩니다.</p>
      {paperRisk && paperRisk.unresolvedCount > 0 && <p role="alert">KIS 불명·전송 중 {paperRisk.unresolvedCount}건 · 대조 전 재개 금지</p>}
      {state.risk.halted && !paperRisk && <p role="status">주문 원장 상태 미확인 · 새로고침 후 재개하세요.</p>}
      <button className={`button wide ${state.risk.halted ? 'secondary' : 'danger'}`} disabled={busy || !available || resumeBlocked} onClick={() => void act('risk/halt', { halted: !state.risk.halted }).catch(() => {})}><Square size={15} />{state.risk.halted ? '신규 주문 허용' : '신규 주문 긴급정지'}</button>
      <Link to="/orders" className="subtle-link">DEMO 미체결 주문 확인 →</Link><Link to="/paper" className="subtle-link">KIS 주문 대조·불명 복구 →</Link>
      <div className="soft-note">미체결과 한도를 확인한 뒤 재개하세요. 손실 한도에 도달하면 주문 허용 후에도 매수·매도가 차단됩니다. 재개해도 전략은 자동 시작되지 않습니다. KIS 취소는 공식 모의 앱에서 처리하고 대조해야 합니다.</div>
    </Panel></div>
    <Panel title="환경별 사용량과 차단 이유" className="top-gap" action={<div className="tabs"><button aria-pressed={demo} className={demo ? 'active' : ''} onClick={() => setEnvironment('demo')}>DEMO 사용량</button><button aria-pressed={!demo} className={!demo ? 'active' : ''} onClick={() => setEnvironment('kis')}>KIS 모의 사용량</button></div>}>
      <p className="prose">{demo ? 'DEMO 시작 자산 − 현재 평가자산, 최솟값 0' : 'KIS 당일 첫 주문 전 총평가금액 − 조회 총평가금액, 최솟값 0'}</p>
      <p className="muted prose">{demo ? 'DEMO는 일별 자동 초기화가 없습니다. 미체결 매수 금액은 현금·종목 한도에 예약되며 1회 주문 한도에는 합산하지 않습니다.' : 'KST 거래일별 기준이며 입출금을 보정하지 않습니다. 기준 미설정이면 첫 주문 검증 때 고정합니다. 조회 시점의 참고값이며 주문 때 최신 시세·미수 없는 가능수량으로 다시 검사합니다.'}</p>
      {!known ? <Empty title={demo ? 'DEMO 사용량 미확인' : 'KIS 사용량 미확인'}>{demo ? '로컬 서버의 최신 상태를 확인하세요.' : '최신 전체 잔고·당일 주문 대조와 불명 해소가 필요합니다. 이 화면은 API를 호출하지 않습니다.'}</Empty> : <>
        <div className="check-row"><span>손실 사용량 / 한도</span><strong>{loss === null ? '기준 미설정' : `${won(loss)}원 / ${won(state.risk.dailyLoss)}원`}</strong></div>
        <div className="check-row"><span>기준 자산 / 현재 평가자산</span><span>{baseline == null ? '미설정' : `${won(baseline)}원`} / {currentEquity == null ? '미확인' : `${won(currentEquity)}원`}</span></div>
        <p role="status">{state.risk.halted ? '긴급정지로 신규 주문 차단' : loss != null && loss >= state.risk.dailyLoss ? '손실 한도 도달 · 신규 매수·매도 차단' : '주문별 금액·현금·보유 수량을 추가 검사합니다.'}</p>
        {!demo && <p className="muted">기준일 {paperRisk?.day} · 잔고 {connection.status.lastSuccessAt ? new Date(connection.status.lastSuccessAt).toLocaleString('ko-KR') : '미확인'} · 주문 {paperRisk?.orders ? new Date(paperRisk.orders.observedAt).toLocaleString('ko-KR') : '미확인'}</p>}
        {codes.length ? <div className="table-scroll"><table><thead><tr><th>종목</th><th>보유 평가액</th><th>매수 예약액</th><th>종목 한도 사용량</th><th>한도</th><th>매도 가능 보유</th></tr></thead><tbody>{codes.map(code => {
          const p = positions.find(p => p.code === code), qty = p?.qty ?? 0;
          const held = qty === 0 ? 0 : p?.price == null ? null : qty * p.price;
          const pendingBuy = orders.filter(o => o.code === code && o.side === 'buy' && !o.cancelled).reduce((sum, o) => sum + o.remaining * o.price, 0);
          const reservedSell = orders.filter(o => o.code === code && o.side === 'sell' && !o.cancelled).reduce((sum, o) => sum + o.remaining, 0);
          const used = held === null ? null : held + pendingBuy;
          return <tr key={code}><td>{demo ? state.instruments.find(i => i.code === code)?.name : connection.balance?.positions.find(p => p.code === code)?.name} <small>{code}</small></td><td>{held === null ? '평가 불가' : won(held)}</td><td>{won(pendingBuy)}</td><td>{used === null ? '미확인' : won(used)}{used !== null && used >= state.risk.maxPosition && <Badge>추가 매수 한도 도달</Badge>}</td><td>{won(state.risk.maxPosition)}</td><td>{Math.max(0, qty - reservedSell)}주 / 보유 {qty}주</td></tr>;
        })}</tbody></table></div> : <Empty title="보유·미체결 없음">조회한 환경에 보유와 미체결 주문이 없습니다.</Empty>}
      </>}
    </Panel>
    <Panel title="최근 위험관리 이벤트" className="top-gap">{changes.length ? changes.map(e => <article className="event" key={e.id}><div><h3>{e.title}</h3><p>{e.detail}</p><time>{new Date(e.time).toLocaleString('ko-KR')}</time></div></article>) : <Empty title="위험관리 이벤트 없음">한도 변경·정지·재개·주문 차단을 이곳에서 확인합니다.</Empty>}</Panel>
  </>;
}
export function Journal() {
  const { state, act, busy, available } = useWorkbench(); const [code, setCode] = useState('005930'), [text, setText] = useState(''), [query, setQuery] = useState('');
  async function save(e: React.FormEvent) { e.preventDefault(); try { await act('journal', { code, text }); setText(current => current === text ? '' : current); } catch { /* Workspace displays the failure. */ } }
  const entries = state.journal.filter(j => j.text.includes(query) || j.code.includes(query));
  return <div className="grid-main"><Panel title="나의 기록" action={<input className="compact-input" aria-label="일지 검색" placeholder="일지 검색" value={query} onChange={e => setQuery(e.target.value)} />}>{entries.length ? entries.map(j => <article className="journal-entry" key={j.id}><div><Badge>{state.instruments.find(s => s.code === j.code)?.name}</Badge><time>{new Date(j.date).toLocaleString('ko-KR')}</time></div><p>{j.text}</p></article>) : query ? <Empty title="검색 결과가 없습니다">다른 본문이나 종목코드로 검색하거나 검색어를 지워보세요.</Empty> : <Empty title="기록이 쌓이면 원칙이 보입니다">진입 이유, 지킨 규칙, 다음에 바꿀 행동을 남겨보세요.</Empty>}</Panel><Panel title="기록 작성"><form onSubmit={save}><label className="field">종목<select value={code} onChange={e => setCode(e.target.value)}>{state.instruments.map(s => <option value={s.code} key={s.code}>{s.name}</option>)}</select></label><label className="field">매매 메모<textarea rows={8} value={text} required maxLength={2000} onChange={e => setText(e.target.value)} placeholder="왜 이 종목을 관찰했나요? 어떤 조건에서 진입하고 청산할까요?" /></label><span className="muted tiny">{text.length} / 2,000</span><button className="button primary wide" disabled={!available || busy}>일지 저장</button></form></Panel></div>;
}
export function Alerts() {
  const { state, act, available, busy } = useWorkbench(); const [filter, setFilter] = useState('all');
  const rows = state.events.filter(e => filter === 'all' || e.level === filter);
  const unread = state.events.filter(e => !e.read).length;
  return <Panel title="워크스페이스 이벤트" action={<button className="button secondary" disabled={!available || busy || unread === 0} onClick={() => void act('events/read', { ids: state.events.filter(e => !e.read).map(e => e.id) }).catch(() => {})}><Check size={16} />모두 읽음</button>}>
    <div className="toolbar"><div className="tabs">{[['all', '전체'], ['info', '안내'], ['warning', '주의'], ['error', '오류']].map(([id, label]) => <button key={id} aria-pressed={filter === id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div><span className="muted">미읽음 {unread}건 · 최근 최대 1,000건 · 외부 발송 없음</span></div>
    <RealtimeStatus /><p className="muted tiny">KIS REST 이력과 실시간 연결·수신 중단·대조 이벤트를 표시합니다. 실제 장중 복구 검증은 별도입니다.</p>
    {rows.length ? rows.map(e => <article className={`event ${e.read ? 'read' : ''}`} key={e.id}>
      <span className={`event-icon ${e.level}`}><AlertTriangle size={18} /></span><div>
        <h3>{e.title}{!e.read && <span className="unread-dot" aria-hidden="true" />}</h3>
        <p>{e.detail}</p><p className="tiny muted">{e.environment === 'kis-paper' ? 'KIS 모의' : e.environment === 'shared' ? '공통 위험' : 'DEMO'} · {e.read ? '읽음' : '미읽음'}{e.requestId && <> · 요청 {e.requestId}</>}</p>
        <time dateTime={e.time}>{new Date(e.time).toLocaleString('ko-KR')}</time>{e.target && <p><Link to={`/${e.target}`} className="text-link">원인 화면</Link></p>}
      </div><Badge>{e.level === 'info' ? '안내' : e.level === 'warning' ? '주의' : '오류'}</Badge>
    </article>) : <Empty title={state.events.length ? '해당 중요도의 이벤트가 없습니다' : '아직 이벤트가 없습니다'}>주문·전략·위험관리 동작이 이곳에 기록됩니다.</Empty>}
  </Panel>;
}
export { DataStatus } from './DataInventory';
const connectionRecovery: Record<ConnectionFailure['kind'], { label: string; action: string }> = {
  missing: { label: '필수 설정 미주입', action: '안전한 연결 안내를 열어 Infisical에 모의 계좌 정보를 등록한 뒤 서버를 다시 실행하세요.' },
  invalid: { label: '설정 형식 오류', action: 'Infisical에서 계좌번호 앞 8자리와 상품코드 2자리를 확인하고 서버를 다시 실행하세요.' },
  expired: { label: '만료·갱신 필요', action: '인증 갱신 대기 시각 이후 다시 조회하세요. 토큰은 서버에서 갱신하며 잔고 응답까지 확인합니다.' },
  permission: { label: '인증·권한 거부', action: '모의투자 API 서비스 신청, 모의 전용 키와 계좌 권한을 확인하세요. 키를 바꿨다면 서버를 다시 실행하세요.' },
  'rate-limit': { label: '호출 제한', action: '연속 클릭을 멈추고 잠시 기다린 뒤 다시 조회하세요. 인증 발급은 1분 간격으로 제한합니다.' },
  network: { label: '네트워크 오류', action: '네트워크와 KIS 모의 서버 연결을 확인한 뒤 다시 조회하세요. 실전 서버로 전환하지 않습니다.' },
  upstream: { label: 'KIS 서비스 오류', action: 'KIS 서비스 상태와 점검 공지를 확인하고 잠시 후 다시 조회하세요.' },
  contract: { label: '응답 확인 불가', action: '전체 잔고를 확정하지 못했습니다. 다시 조회해도 반복되면 응답 계약을 점검하세요. 이전 값은 최신 잔고가 아닙니다.' },
  rejected: { label: '요청 거부', action: '모의 계좌·키·서비스 이용 가능 시간을 확인한 뒤 다시 조회하세요.' },
};
export function Settings() {
  const { act, busy, available, connection, refresh, server, serverNow, status } = useWorkbench();
  const [checking, setChecking] = useState(false), [showGuide, setShowGuide] = useState(false);
  const [refreshState, setRefreshState] = useState<'idle' | 'pending' | 'done'>('idle');
  const authentication = authenticationStatus(connection.authentication, serverNow);
  const retrySeconds = authentication.retryAt ? Math.max(0, Math.ceil((Date.parse(authentication.retryAt) - serverNow) / 1000)) : 0;
  const elapsed = connection.checkStartedAt ? Math.max(0, Math.floor((serverNow - Date.parse(connection.checkStartedAt)) / 1000)) : 0;
  const loading = checking || connection.status.phase === 'loading';
  const currentBalance = available && connection.connected && !loading;
  const time = (value: string | null) => value ? new Date(value).toLocaleString('ko-KR') : '없음';
  const injectionLabel = { unverified: '미확인', missing: '미주입', invalid: '설정 형식 오류', present: '필수 값 있음' }[connection.injection.phase];
  const authLabel = { unverified: '미확인', loading: '인증 중', ready: '토큰 발급 확인', expired: '만료·갱신 필요', error: '인증 실패' }[authentication.phase];
  const balanceLabel = { disconnected: '미조회', loading: '조회 중', ready: '전체 조회 확인', stale: '오래됨', partial: '부분실패', error: '조회 실패' }[connection.status.phase];
  const injectionFailure: ConnectionFailure | null = connection.injection.phase === 'missing' || connection.injection.phase === 'invalid' ? { kind: connection.injection.phase, message: '서버 필수 환경변수와 계좌 형식을 확인하세요.' } : null;
  const setupBlocked = available && injectionFailure !== null;
  const failure = available && !loading ? injectionFailure ?? connection.failure ?? authentication.failure : null;
  const summary = !available ? (status.phase === 'loading' ? '로컬 서버 확인 중' : '로컬 서버 연결 필요')
    : loading ? '모의 잔고 조회 중'
    : failure ? connectionRecovery[failure.kind].label
    : retrySeconds > 0 ? '인증 갱신 대기'
    : currentBalance ? '조회 확인' : balanceLabel;
  let guidance = '모의 잔고를 조회하면 예수금과 보유 종목을 확인할 수 있습니다.';
  if (!available) guidance = status.phase === 'loading' ? '서버에서 설정 상태를 읽고 있습니다.' : '로컬 서버가 실행 중인지 확인한 뒤 연결 상태를 새로고침하세요.';
  else if (loading) guidance = '잔고 전체를 확인하고 있습니다. 진행 상황은 아래 연결 진단에서 확인하세요.';
  else if (failure) guidance = connectionRecovery[failure.kind].action;
  else if (connection.status.phase === 'stale') guidance = '이전 잔고의 유효 시간이 지났습니다. 현재 잔고를 다시 조회하세요.';
  else if (currentBalance) guidance = '아래 계좌 조회 결과에서 예수금과 보유 종목을 확인하세요.';

  async function check() {
    setChecking(true);
    try { await act('kis/check'); } catch { /* App displays the request error. */ } finally { setChecking(false); }
  }
  async function refreshStatus() {
    setRefreshState('pending');
    try { await refresh(); } finally { setRefreshState('done'); }
  }
  const guideButton = <button key="guide" className={`button ${setupBlocked ? 'primary' : 'secondary'}`} aria-expanded={showGuide}
    aria-controls="connection-guide" onClick={() => setShowGuide(open => !open)}>안전한 연결 안내<ChevronDown size={16} /></button>;

  return <div className="settings-page">
    <Panel title="한국투자증권 연결" action={<Badge tone="teal">모의투자 전용</Badge>}>
      <div className={`settings-summary ${failure || (!available && status.phase !== 'loading') ? 'attention' : ''}`}>
        <span className="settings-symbol" aria-hidden="true">{failure ? <AlertTriangle /> : <Link2 />}</span>
        <div role="status" aria-label={failure ? '연결 복구 안내' : '현재 연결 상태'}>
          <strong>{summary}</strong><p>{guidance}</p>
          {failure && !setupBlocked && <p>{failure.message}</p>}
        </div>
      </div>
      {available && retrySeconds > 0 && <p id="settings-retry">인증 갱신까지 {retrySeconds}초 · {time(authentication.retryAt)} 이후 다시 조회하세요.</p>}
      <div className="settings-actions">
        {setupBlocked && guideButton}
        <button className={`button ${setupBlocked ? 'secondary' : 'primary'}`} disabled={!available || setupBlocked || busy || loading || retrySeconds > 0}
          aria-describedby={available && retrySeconds > 0 ? 'settings-retry' : undefined} onClick={() => void check()}><Link2 size={16} />KIS 모의 연결·잔고 확인</button>
        <button className="button secondary" disabled={refreshState === 'pending'} onClick={() => void refreshStatus()}><RefreshCw size={16} />연결 상태 새로고침</button>
        {!setupBlocked && guideButton}
      </div>
      <p className="settings-hint">잔고 확인은 KIS 모의 계좌를 조회합니다. 연결 상태 새로고침은 로컬 서버의 기록만 읽습니다.</p>
      <p className="settings-feedback" role="status" aria-label="새로고침 결과">{refreshState === 'pending' ? '로컬 서버 상태를 읽고 있습니다.' : refreshState === 'done' && (available ? '로컬 서버 상태를 확인했습니다. 외부 KIS 호출 없음.' : '로컬 서버 상태를 확인할 수 없습니다. 서버 연결을 확인하세요.')}</p>
      <div id="connection-guide" className="settings-guide" hidden={!showGuide}>
        <h3>모의 계좌 연결 방법</h3>
        <ol className="plain-list">
          <li>모의투자 API 서비스를 신청하고 모의 전용 키와 계좌를 준비하세요.</li>
          <li>Infisical 프로젝트의 <code>dev /kis</code>에 <code>KIS_APP_KEY</code>, <code>KIS_APP_SECRET</code>, <code>KIS_CANO</code>, <code>KIS_ACNT_PRDT_CD</code>를 등록하세요. 계좌번호는 앞 8자리, 상품코드는 2자리입니다.</li>
          <li>로그인이 만료되면 터미널에서 다시 인증하세요. 권한 오류가 나면 프로젝트·환경·경로의 읽기 권한을 확인하세요.</li>
          <li>아래 명령으로 서버를 실행한 뒤 연결 상태를 새로고침하고 모의 잔고를 조회하세요.</li>
        </ol>
        <code className="connection-command">infisical secrets-manager run --env dev --path /kis -- npm run dev</code>
        <p>키·토큰·계좌번호는 서버에서만 사용하세요. 채팅·브라우저·Git에 입력하지 마세요.</p>
      </div>
    </Panel>
    {connection.balance && <Panel title="KIS 모의 계좌 조회 결과" className="top-gap" action={<Badge>{currentBalance ? '전체 조회 성공값' : '이전 전체 성공값 · 최신 아님'}</Badge>}><p className="muted">기준 시각: {time(connection.status.lastSuccessAt)} · KIS 모의 / REST</p><div className="check-row"><span>예수금</span><strong>{won(connection.balance.cash)}원</strong></div>{connection.balance.positions.length ? <div className="table-scroll"><table><thead><tr><th>종목</th><th>수량</th><th>평균 매입가</th><th>현재가</th></tr></thead><tbody>{connection.balance.positions.map(p => <tr key={p.code}><td>{p.name} · {p.code}</td><td>{p.qty}</td><td>{won(p.average)}</td><td>{p.price === null ? '평가 불가' : won(p.price)}</td></tr>)}</tbody></table></div> : <Empty title="보유 종목 없음">{currentBalance ? '조회한 모의 계좌에 수량이 있는 잔고가 없습니다.' : '이전 전체 조회 시 보유 종목이 없었습니다. 현재 잔고는 다시 확인하세요.'}</Empty>}</Panel>}
    <div className="grid-main settings-diagnostics">
      <Panel title="연결 진단">
        <ol className="connection-steps" aria-label="연결 확인 단계">
          <li><div role="group" aria-label="서버 필수 설정 상태">
            <div className="settings-step-title"><strong>서버 필수 설정</strong><Badge>{available ? injectionLabel : '서버 상태 확인 필요'}</Badge></div>
            <p>환경변수 존재와 계좌 형식 검사 · 주입 출처 미확인</p>
            {available && connection.injection.missing.length > 0 && <p>미주입 항목: {connection.injection.missing.join(', ')}</p>}
          </div></li>
          <li><div role="group" aria-label="KIS 인증 상태">
            <div className="settings-step-title"><strong>KIS 모의 인증</strong><Badge tone={available && authentication.phase === 'ready' ? 'teal' : 'neutral'}>{available ? authLabel : '서버 상태 확인 필요'}</Badge></div>
            <p>최근 토큰 발급 확인: {time(authentication.lastSuccessAt)} · 토큰 재확인 시각: {time(authentication.validUntil)}</p>
            {available && retrySeconds > 0 && <p>인증 갱신 대기: {retrySeconds}초</p>}
          </div></li>
          <li><div role="group" aria-label="모의 잔고 조회 상태">
            <div className="settings-step-title"><strong>모의 잔고 전체 조회</strong><Badge tone={currentBalance ? 'teal' : 'neutral'}>{!available ? '서버 상태 확인 필요' : loading ? '조회 중' : balanceLabel}</Badge></div>
            <p>확인한 페이지: {connection.status.pages}{loading && <> · 경과 {elapsed}초</>} · 최종 전체 성공: {time(connection.status.lastSuccessAt)}</p>
            {connection.status.error && !loading && <p>{connection.status.error}</p>}
          </div></li>
        </ol>
      </Panel>
      <Panel title="서버 정보">
        <dl className="settings-server" aria-label="실행 서버 식별">
          <dt>실전 환경 전환</dt><dd>미지원</dd>
          <dt>모의 API 서버</dt><dd><code>openapivts.koreainvestment.com</code></dd>
          <dt>비밀정보 관리 경로</dt><dd>Infisical · dev /kis</dd>
          <dt>서버 시작</dt><dd>{server ? time(server.startedAt) : '미확인'}</dd>
          <dt>인스턴스</dt><dd>{server?.instanceId.slice(0, 8) ?? '미확인'}</dd>
        </dl>
        <p className="settings-hint">키를 변경한 뒤에는 다시 주입해 서버를 실행하고 시작 시각과 인스턴스를 확인하세요.</p>
      </Panel>
    </div>
    <Panel title="데이터와 운영 경계" className="top-gap"><div className="two-columns"><div><h3>로컬 데모</h3><p className="prose">합성 시세·가상 현금으로 수동/전략 주문을 검증합니다. SQLite에 저장하므로 서버를 다시 시작해도 일지·주문·한도가 남습니다.</p></div><div><h3>KIS 모의투자</h3><p className="prose">연결 확인은 모의 API 인증·잔고 조회에 한정합니다. 주문·체결·취소·연속 전략과 장중 전체 흐름은 별도로 검증합니다.</p></div></div></Panel>
  </div>;
}
