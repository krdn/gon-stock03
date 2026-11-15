import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, ArrowLeftRight, Bell, BookOpen, ChartNoAxesCombined, Check, ChevronRight, CircleHelp, Database, FlaskConical, LayoutDashboard, Menu, Network, Search, Settings2, ShieldCheck, Square, Star, Wallet, X, Zap, Link2 } from 'lucide-react';
import { initialState } from '../shared/fixtures';
import type { StateSnapshot, DataStatus as DataStatusContract } from '../shared/model';
import { stateSnapshotSchema, storageErrorMessage } from '../shared/contracts';
import { disconnectedConnection, emptyStatus, freshness } from '../shared/status';
import { screens } from './specs';
import { WorkbenchContext } from './context';
import { Badge, DataStatusLine } from './components/ui';
import { Dashboard, Market, Portfolio } from './pages/Workspace';
import { Trade, Orders } from './pages/Trading';
import { Strategies, Backtest } from './pages/Research';
import { Risk, Journal, Alerts, DataStatus, Settings } from './pages/Operations';
import { Design } from './pages/Design';
import { Paper } from './pages/Paper';

const icons = [LayoutDashboard, Search, Star, ChartNoAxesCombined, ArrowLeftRight, Wallet, Zap, FlaskConical, ShieldCheck, BookOpen, Bell, Database, Settings2, Network, Link2];
function WatchlistPage() { return <Market watchOnly />; }
export default function App() {
  const [state, setState] = useState(initialState);
  const [localStatus, setLocalStatus] = useState<DataStatusContract>({ ...emptyStatus('demo'), phase: 'loading' });
  const [connectionState, setConnection] = useState(disconnectedConnection);
  const [now, setNow] = useState(Date.now);
  const snapshot = useRef<StateSnapshot | null>(null);
  const requests = useRef({ issued: 0, applied: 0 });
  const status = freshness(localStatus, now);
  const accountStatus = freshness(connectionState.status, now);
  const connection = { ...connectionState, status: accountStatus, connected: accountStatus.phase === 'ready' };
  const available = status.phase === 'ready';
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const current = screens.find(s => location.pathname === '/' + s.id) ?? screens[0];
  const refresh = useCallback(async () => {
    const sequence = ++requests.current.issued;
    const atStart = snapshot.current;
    const invalidateConnection = () => setConnection(old => ({ ...old, connected: false, status: { ...old.status, phase: old.status.lastSuccessAt ? 'stale' : 'disconnected', complete: false, error: '로컬 상태를 신뢰할 수 없어 KIS 상태를 다시 확인해야 합니다.' } }));
    try {
      const response = await fetch('/api/state', { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('서버를 연결하지 못했습니다.');
      const result = stateSnapshotSchema.parse(await response.json());
      if (sequence < requests.current.applied) return;
      requests.current.applied = sequence;
      const previous = snapshot.current;
      if (previous && previous.instanceId === result.instanceId && result.revision < previous.revision) {
        if (atStart !== previous) return;
        invalidateConnection();
        setLocalStatus(old => ({ ...old, phase: 'error', complete: false, error: '저장 상태가 이전 버전으로 바뀌었습니다. 페이지를 새로고침해 다시 확인하세요.' })); return;
      }
      if (previous && previous.instanceId !== result.instanceId) setNotice({ text: '서버가 다시 시작되어 저장 상태를 새로 불러왔습니다. 주문과 한도를 다시 확인하세요.', error: true });
      snapshot.current = result; setState(result); setLocalStatus(result.status); setConnection(result.connection); setNow(Date.now());
    } catch {
      if (sequence < requests.current.applied) return;
      requests.current.applied = sequence;
      setLocalStatus(old => ({ ...old, phase: old.lastSuccessAt ? 'stale' : 'disconnected', complete: false, error: '로컬 상태를 확인하지 못했습니다. 연결과 서버 버전을 확인하세요.' }));
      invalidateConnection();
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { const timer = window.setInterval(() => void refresh(), 3000); return () => window.clearInterval(timer); }, [refresh]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { setMenu(false); document.title = `${current.title} · GON Stock`; window.scrollTo(0, 0); }, [location.pathname, current.title]);
  async function act<T>(path: string, body?: unknown): Promise<T> {
    if (freshness(localStatus).phase !== 'ready') {
      const message = '최신 로컬 상태를 확인한 뒤 다시 시도하세요.';
      setNotice({ text: message, error: true }); throw new Error(message);
    }
    setBusy(true);
    if (path === 'kis/check' || path === 'kis/orders') setConnection(old => ({ ...old, connected: false, status: { ...old.status, phase: 'loading', complete: false, error: null } }));
    let message = '요청을 처리하지 못했습니다. 잠시 후 다시 확인하세요.';
    try {
      const response = await fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workbench': 'local' }, body: JSON.stringify(body ?? {}) });
      const result = await response.json();
      if (!result || typeof result !== 'object') throw new Error(message);
      if (!response.ok) { if ((response.status < 500 || result.error === storageErrorMessage) && typeof result.error === 'string') message = result.error; throw new Error(message); }
      await refresh(); setNotice({ text: result.message ?? '변경 사항을 저장했습니다.', error: Boolean(result.warning) });
      return result as T;
    } catch { setNotice({ text: message, error: true }); await refresh(); throw new Error(message); }
    finally { setBusy(false); }
  }
  const routes = [Dashboard, Market, WatchlistPage, Trade, Orders, Portfolio, Strategies, Backtest, Risk, Journal, Alerts, DataStatus, Settings, Design, Paper];
  return <WorkbenchContext.Provider value={{ state, status, connection, busy, available, act, refresh }}><a className="skip-link" href="#main">본문으로 이동</a><div className="app-shell">
    {menu && <button className="scrim" aria-label="메뉴 닫기" onClick={() => setMenu(false)} />}
    <aside className={`sidebar ${menu ? 'open' : ''}`}><Link to="/dashboard" className="brand"><span className="brand-symbol"><Activity size={22} /></span><div>GON<span className="brand-light"> STOCK</span><small>PERSONAL TRADING WORKSPACE</small></div></Link><div className="workspace-label"><span className="avatar">G</span><div>나의 워크스페이스<small>국내 주식 · ETF</small></div><Badge tone="dark">LOCAL</Badge></div><nav aria-label="주 메뉴">{screens.map((screen, i) => { const Icon = icons[i]; return <div key={screen.id}>{(i === 0 || screen.group !== screens[i - 1].group) && <p className="nav-group">{screen.group}</p>}<NavLink to={'/' + screen.id}><Icon size={18} /><span>{screen.title}</span>{screen.id === 'alerts' && <small className="nav-count">{state.events.filter(e => !e.read).length}</small>}{screen.id === 'design' && <small className="nav-new">GUIDE</small>}</NavLink></div>; })}</nav><div className="sidebar-bottom"><span className="status-dot" /><div>로컬 데모 환경<small>KIS 모의투자 별도 연결</small></div><CircleHelp size={17} /></div></aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="메뉴 열기" onClick={() => setMenu(!menu)}><Menu size={20} /></button><span>워크스페이스</span><ChevronRight size={14} /><strong>{current.title}</strong></div><div className="top-actions"><Badge tone={current.id === 'paper' ? 'neutral' : 'teal'}>{current.id === 'paper' ? 'KIS 실제 모의 계좌' : current.id === 'portfolio' ? 'DEMO / KIS 모의 · 환경 선택' : current.id === 'backtest' ? 'KIS 저장 일봉 / DEMO 실험' : current.id === 'data' ? '공개 마스터 / KIS 일봉 / 합성' : current.id === 'market' || current.id === 'watchlist' ? '공식 마스터 · KIS 모의 시세' : '합성 데이터 · 로컬 데모'}</Badge><Link to="/settings" className="connection-link"><span className={`status-dot ${available ? '' : 'amber'}`} />{available ? '로컬 서버 연결' : '화면 미리보기'}</Link><Link className="icon-button" to="/alerts" aria-label="알림 열기"><Bell size={18} /></Link><span className="avatar small">G</span></div></header>
      <main id="main" tabIndex={-1}><div className="page-title"><div><span className="eyebrow">{current.group === '프로젝트' ? 'BUILD WITH UNDERSTANDING' : 'YOUR EDGE, YOUR RULES'}</span><h1>{current.title}<span className="title-dot">.</span></h1><p>{current.subtitle}</p></div><div className="title-actions">{current.id !== 'design' && <Link className="button secondary" to={`/design?screen=${current.id}`}><Network size={16} />화면 설계</Link>}<Link to="/risk" className={`button ${state.risk.halted ? 'danger' : 'quiet'}`}><Square size={13} />{state.risk.halted ? '신규 주문 정지 중' : '긴급정지 관리'}</Link></div></div>
      <section className="status-strip" aria-label="환경과 데이터 상태"><DataStatusLine label="로컬 상태" status={status} /><DataStatusLine label="KIS 계좌 상태" status={connection.status} showPages /></section>
      {!available && <div className="notice warning" role="status">{status.lastSuccessAt ? '마지막 확인값입니다. 최신 상태 확인 전에는 새 작업을 진행할 수 없습니다.' : '화면 미리보기입니다. 로컬 서버가 연결되면 저장·주문·전략 기능을 사용할 수 있습니다.'} <button onClick={() => void refresh()}>다시 확인</button></div>}
      <div className={`notice ${state.risk.halted || !available ? 'warning' : ''}`} role="status" aria-label="긴급정지 상태">{!available ? '긴급정지 상태 미확인 · 신규 작업 차단' : state.risk.halted ? '긴급정지 켜짐 · DEMO·KIS 모의 신규 주문 정지' : '긴급정지 꺼짐 · DEMO·KIS 모의 공통 적용'} · 이미 접수한 주문은 별도로 취소해야 합니다.</div>
      <Routes key={snapshot.current?.instanceId ?? 'preview'}><Route path="/" element={<Navigate replace to="/dashboard" />} />{screens.map((s, i) => { const Page = routes[i]; return <Route key={s.id} path={'/' + s.id} element={<Page />} />; })}<Route path="*" element={<div className="empty"><h2>페이지를 찾을 수 없습니다</h2><Link to="/dashboard">대시보드로 돌아가기</Link></div>} /></Routes>
      <footer className="footer"><span>GON Stock · 개인 트레이딩 연구실</span><span>로컬 데모는 합성 데이터 · KIS 모의 매매는 실제 모의 API</span><Link to="/design?tab=sources">조사 근거 ↗</Link></footer></main>
    </div>{notice && <div className={`toast ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.error ? <CircleHelp size={18} /> : <Check size={18} />}<span>{notice.text}</span><button className="icon-button" aria-label="알림 닫기" onClick={() => setNotice(null)}><X size={16} /></button></div>}
  </div></WorkbenchContext.Provider>;
}
