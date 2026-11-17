import { RealtimeStatus } from '../components/RealtimeStatus';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ArrowRight, Info, ShieldCheck, X } from 'lucide-react';
import { useWorkbench } from '../context';
import { Badge, Change, Chart, Empty, Panel, Stat } from '../components/ui';
import { orderInput, paperLedgerSchema, type OrderInput, type PaperLedger } from '../../shared/contracts';
import { orderStatus, won, equity, type Instrument } from '../../shared/model';

export function Trade() {
  const { state, server, status } = useWorkbench();
  const [params] = useSearchParams();
  const code = params.get('code') ?? '005930';
  const instrument = state.instruments.find(s => s.code === code);
  if (!server) return <Panel><Empty title={status.phase === 'loading' ? 'DEMO 상태를 확인하고 있습니다' : 'DEMO 상태를 확인하지 못했습니다'}>로컬 서버 상태 확인 후 시세·자산과 주문 입력을 표시합니다.</Empty></Panel>;
  if (!instrument) return <Panel><Empty title={state.instruments.length ? '지원하지 않는 DEMO 종목입니다' : 'DEMO 종목이 없습니다'}>요청 종목: {code || '미입력'}. 다른 종목으로 자동 변경하지 않습니다.</Empty><div className="button-row">{state.instruments.map(s => <Link className="button secondary" key={s.code} to={`/trade?code=${s.code}`}>{s.name} · {s.code}</Link>)}{/^\d{6}$/.test(code) && <Link className="button secondary" to={`/paper?code=${code}`}>선택 종목 KIS 모의 매매<ArrowRight size={16} /></Link>}</div></Panel>;
  return <TradeForm instrument={instrument} />;
}

function TradeForm({ instrument }: { instrument: Instrument }) {
  const { state, act, busy, available, refresh } = useWorkbench();
  const [, setParams] = useSearchParams();
  const [side, setSide] = useState<'buy' | 'sell'>('buy'), [qty, setQty] = useState('1'), [price, setPrice] = useState(String(instrument.price)), [range, setRange] = useState(60);
  const [confirm, setConfirm] = useState(false), [requestId, setRequestId] = useState(''); const dialog = useRef<HTMLDialogElement>(null);
  const [priceEdited, setPriceEdited] = useState(false);
  const [reviewedQuote, setReviewedQuote] = useState(0);
  const sending = useRef(false);
  const [savedRequest] = useState(() => {
    try {
      const raw = sessionStorage.getItem('demo-order-pending');
      return { pending: raw === null ? null : orderInput.parse(JSON.parse(raw)), error: false };
    } catch { return { pending: null, error: true }; }
  });
  const [unresolved, setUnresolved] = useState<OrderInput | null>(savedRequest.pending);
  const [storageError, setStorageError] = useState(savedRequest.error);
  function clearPending() {
    try { sessionStorage.removeItem('demo-order-pending'); setUnresolved(null); }
    catch { setStorageError(true); }
  }
  const [orderNotice, setOrderNotice] = useState('');
  const [retryQuote, setRetryQuote] = useState<number | null>(null);
  const retryInstrument = state.instruments.find(i => i.code === unresolved?.code);
  const reconciled = unresolved && available ? state.orders.find(o => o.requestId === unresolved.requestId) : undefined;
  useEffect(() => {
    if (reconciled && !storageError) {
      clearPending();
      setOrderNotice(orderStatus[reconciled.status]);
    }
  }, [reconciled, storageError]);
  useEffect(() => { setPriceEdited(false); setPrice(String(instrument.price)); setConfirm(false); }, [instrument.code]);
  useEffect(() => { if (!priceEdited && !confirm) setPrice(String(instrument.price)); }, [instrument.price, priceEdited, confirm]);
  useEffect(() => { if (confirm) dialog.current?.showModal(); else dialog.current?.close(); }, [confirm]);
  const amount = Number(qty) * Number(price); const holding = state.positions.find(p => p.code === instrument.code)?.qty ?? 0;
  const pendingBuy = state.orders.filter(o => o.status === 'pending' && o.side === 'buy').reduce((a, o) => a + o.qty * o.price + Math.ceil(o.qty * o.price * 1.5 / 10000), 0);
  const sellable = holding - state.orders.filter(o => o.status === 'pending' && o.side === 'sell' && o.code === instrument.code).reduce((sum, o) => sum + o.qty, 0);
  const validNumbers = Number.isSafeInteger(Number(qty)) && Number(qty) >= 1 && Number(qty) <= 100000 && Number.isSafeInteger(Number(price)) && Number(price) >= 1 && Number(price) <= 10000000;
  const estimatedFee = validNumbers ? Math.ceil(amount * 1.5 / 10000) : 0;
  const pendingExposure = state.orders.filter(o => o.status === 'pending' && o.side === 'buy' && o.code === instrument.code).reduce((sum, o) => sum + o.qty * o.price, 0);
  const inputError = !validNumbers ? '가격은 1~10,000,000원, 수량은 1~100,000주의 정수로 입력하세요.'
    : state.startingEquity - equity(state) >= state.risk.dailyLoss ? '손실 한도를 초과했습니다.'
    : amount > state.risk.maxOrder ? '1회 주문 한도를 초과합니다.'
    : side === 'buy' && amount + estimatedFee > state.cash - pendingBuy ? '수수료를 포함한 주문 금액이 예약 제외 현금을 초과합니다.'
    : side === 'buy' && holding * instrument.price + pendingExposure + amount > state.risk.maxPosition ? '종목별 최대 투자금을 초과합니다.'
    : side === 'sell' && Number(qty) > sellable ? '예약 제외 매도 가능 수량을 초과합니다.' : '';
  const quoteChanged = instrument.price !== reviewedQuote;
  const blocked = !available || state.risk.halted || storageError;
  function review(e: React.FormEvent) {
    e.preventDefault(); if (blocked || busy || unresolved || sending.current || inputError) return;
    setRequestId(crypto.randomUUID()); setReviewedQuote(instrument.price); setConfirm(true); setOrderNotice('');
  }
  async function send(input: OrderInput) {
    if (sending.current || busy || blocked) return;
    sending.current = true;
    const retry = unresolved?.requestId === input.requestId;
    try { sessionStorage.setItem('demo-order-pending', JSON.stringify(input)); }
    catch { setStorageError(true); setConfirm(false); sending.current = false; return; }
    try {
      setUnresolved(input); setRetryQuote(null); setConfirm(false);
      const result = await act<{ order: { status: keyof typeof orderStatus } }>('orders', input);
      clearPending();
      setOrderNotice(orderStatus[result.order.status]);
    } catch (error) {
      if (error instanceof Error && 'definitive' in error && error.definitive === true && !(retry && 'notSent' in error && error.notSent === true)) {
        clearPending();
      }
      setOrderNotice(error instanceof Error ? error.message : '주문 결과를 확인하지 못했습니다.');
    } finally { sending.current = false; }
  }
  async function submit() {
    if (!confirm || quoteChanged || unresolved || inputError) return;
    await send({ code: instrument.code, side, qty: Number(qty), price: Number(price), requestId });
  }
  return <div className="trade-page">{storageError && <div className="notice warning" role="alert">요청 보존 저장소를 확인할 수 없어 신규 주문을 차단했습니다. 저장소 접근 실패 또는 저장값 손상을 해결하기 전에 <Link className="text-link" to="/orders">DEMO 주문 원장</Link>과 보존 요청을 대조하세요. 접근을 복구한 경우 새로고침하세요. 저장값을 임의로 삭제하거나 새 요청으로 재전송하지 마세요.</div>}{unresolved && <Panel title={storageError ? "DEMO 요청 보존 확인 필요" : "DEMO 주문 응답 미확인"}><p>{storageError ? '저장된 요청을 보존했습니다. DEMO 주문 대조로 원장을 확인하세요. 저장소 문제를 해결하기 전에는 같은 요청 재시도도 차단합니다.' : '새 요청을 차단했습니다. 로컬 원장을 대조하세요. 같은 요청 재시도는 기존 접수를 돌려주거나 미접수 요청을 접수하며 KIS에는 전송하지 않습니다.'}</p><p>{unresolved.code} · {unresolved.side === 'buy' ? '매수' : '매도'} · {unresolved.qty}주 × {won(unresolved.price)}원</p>{!storageError && <p>현재 DEMO 합성 시세: {retryInstrument ? won(retryInstrument.price) + '원' : '미확인'} · 원래 지정가와 현재 시세를 확인한 뒤 같은 요청을 재시도하세요.</p>}<div className="button-row"><button className="button secondary" disabled={busy} onClick={() => void refresh()}>DEMO 주문 대조</button><button className="button secondary" disabled={busy || blocked || !retryInstrument} onClick={() => setRetryQuote(retryInstrument!.price)}>재시도 시세 확인</button><button className="button secondary" disabled={busy || blocked || !retryInstrument || retryQuote !== retryInstrument.price} onClick={() => { if (retryInstrument && retryQuote === retryInstrument.price) void send(unresolved); }}>같은 DEMO 요청 재시도</button></div></Panel>}{orderNotice && <p role="status">{orderNotice}</p>}<div className="notice compact"><Info size={16} />로컬 데모 지정가 주문입니다. KIS 모의 계좌에 전송되지 않습니다. 접수 후 다음 데모 봉에서 체결 조건을 평가합니다.</div><p><Link className="button secondary" to={`/paper?code=${instrument.code}`}>선택 종목 KIS 모의 매매<ArrowRight size={16} /></Link></p><div className="trade-grid"><div><Panel><div className="stock-heading"><label><span className="sr-only">트레이딩 종목</span><select value={instrument.code} onChange={e => setParams({ code: e.target.value })}>{state.instruments.map(s => <option value={s.code} key={s.code}>{s.name} · {s.code}</option>)}</select></label><Badge>{instrument.market}</Badge></div><div className="quote"><strong>{won(instrument.price)}<small>KRW</small></strong><Change value={instrument.change} /><span className="muted">합성 데이터 · 봉 #{state.tick}</span></div><div className="chart-toolbar"><div className="tabs">{[30, 60, 120].map(n => <button key={n} className={range === n ? 'active' : ''} aria-pressed={range === n} onClick={() => setRange(n)}>{n}봉</button>)}</div><span className="muted">종가 선형 차트</span></div><Chart values={instrument.history.slice(-range)} height={290} label={`${instrument.name} 합성 ${range}봉 종가`} /><div className="chart-axis"><span>과거 표본</span><span>단위: 원 · 실제 거래일 미부여</span><span>현재 데모 봉</span></div><div className="trade-facts"><div><span>구분</span><strong>{instrument.sector}</strong></div><div><span>데모 거래량</span><strong>{won(instrument.volume)}</strong></div><div><span>내 보유수량</span><strong>{holding}주</strong></div></div></Panel><Panel title="주문은 이렇게 처리돼요" className="top-gap"><div className="inline-flow"><span>입력</span><ArrowRight size={15} /><span>한도 검증</span><ArrowRight size={15} /><span>접수</span><ArrowRight size={15} /><span>다음 봉 체결 판단</span></div><p className="muted prose">매수는 다음 가격이 지정가 이하일 때, 매도는 이상일 때 데모 체결합니다. 실제 시장의 호가 잔량·부분체결·거래소 규칙은 재현하지 않습니다.</p></Panel></div><Panel title="주문하기" action={<Badge tone="teal">로컬 데모</Badge>}><form onSubmit={review}><div className="side-tabs"><button type="button" className={side === 'buy' ? 'buy active' : ''} aria-pressed={side === 'buy'} onClick={() => setSide('buy')}>매수</button><button type="button" className={side === 'sell' ? 'sell active' : ''} aria-pressed={side === 'sell'} onClick={() => setSide('sell')}>매도</button></div><label className="field">주문 유형<select disabled><option>지정가</option></select></label><label className="field">주문 가격 (원)<input required type="number" min="1" max="10000000" step="1" value={price} onChange={e => { setPriceEdited(true); setPrice(e.target.value); }} /></label><label className="field">주문 수량 (주)<input required type="number" min="1" max="100000" step="1" value={qty} onChange={e => setQty(e.target.value)} /></label><div className="quantity-buttons">{[1, 5, 10].map(n => <button key={n} type="button" onClick={() => setQty(String(n))}>{n}주</button>)}</div><div className="order-total"><span>주문 금액</span><strong>{validNumbers ? won(amount) : '—'}<small>원</small></strong></div><div className="check-row"><span>지정가 기준 예상 수수료</span><strong>{validNumbers ? won(estimatedFee) : '—'}원</strong></div><div className="check-row"><span>예약 제외 현금</span><strong>{won(state.cash - pendingBuy)}원</strong></div><div className="check-row"><span>보유수량</span><strong>{holding}주</strong></div><div className="check-row" role="group" aria-label="매도 가능 수량"><span>예약 제외 매도 가능 수량</span><strong>{sellable}주</strong></div><div className="check-row"><span>1회 주문 한도</span><strong>{won(state.risk.maxOrder)}원</strong></div><p className="muted tiny">데모 비용 가정: 체결 금액의 0.015% (올림). 실제 계좌 수수료·세금과 다릅니다.</p><p id="demo-order-validation" role="status" className="trade-validation">{!available ? '최신 로컬 상태 확인 전 주문을 차단합니다.' : state.risk.halted ? '신규 주문 정지 상태입니다.' : inputError}</p><button aria-describedby="demo-order-validation" className={`button wide ${side === 'buy' ? 'buy-button' : 'sell-button'}`} disabled={blocked || busy || Boolean(unresolved) || Boolean(inputError)} type="submit">{side === 'buy' ? '매수' : '매도'} 주문 확인<ArrowRight size={16} /></button><p className="secure-note"><ShieldCheck size={14} />서버에서 잔고와 위험 한도를 검사합니다</p></form></Panel></div>
    <dialog ref={dialog} className="order-dialog" aria-labelledby="demo-order-confirm-title" onCancel={() => setConfirm(false)} onClose={() => setConfirm(false)}><div className="panel-head"><h2 id="demo-order-confirm-title">로컬 데모 주문 확인</h2><button className="icon-button" aria-label="주문 확인 닫기" onClick={() => setConfirm(false)}><X size={18} /></button></div><p>환경: DEMO · 합성 시세 {won(instrument.price)}원</p><p>{instrument.name} · {side === 'buy' ? '매수' : '매도'}</p><h3>{qty}주 × {won(Number(price))}원</h3><p>주문 금액 {won(amount)}원. KIS로 전송되지 않습니다.</p>{quoteChanged && <div className="notice warning"><p>시세가 변경되었습니다. 지정가는 유지됩니다. 현재 시세와 주문 가격을 다시 확인하세요.</p><button onClick={() => setReviewedQuote(instrument.price)}>변경된 시세 재확인</button></div>}{inputError && <p role="status">{inputError}</p>}{blocked && <p role="status">{state.risk.halted ? '신규 주문 정지 상태입니다.' : '최신 로컬 상태 확인 전 접수를 차단합니다.'}</p>}<div className="button-row"><button className="button secondary" onClick={() => setConfirm(false)}>돌아가기</button><button className="button primary" disabled={busy || blocked || quoteChanged || Boolean(unresolved) || Boolean(inputError)} onClick={() => void submit()}>데모 주문 접수</button></div></dialog></div>;
}
export function Orders() {
  const { state, act, busy, available, realtime } = useWorkbench();
  const [environment, setEnvironment] = useState<'demo' | 'kis'>('demo'), [filter, setFilter] = useState('all'), [query, setQuery] = useState('');
  const [reload, setReload] = useState(0);
  const [ledger, setLedger] = useState<{ orders: PaperLedger['orders'] | null; phase: 'loading' | 'ready' | 'error'; readAt: string | null }>({ orders: null, phase: 'loading', readAt: null });
  const cancelling = useRef(false);
  useEffect(() => {
    if (environment !== 'kis') return;
    const controller = new AbortController(); let active = true;
    setLedger(old => ({ ...old, phase: 'loading' }));
    void (async () => {
      try {
        const response = await fetch('/api/kis/ledger', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (!response.ok) throw new Error('ledger');
        const result = paperLedgerSchema.parse(await response.json());
        if (active) setLedger({ orders: result.orders, phase: 'ready', readAt: new Date().toISOString() });
      } catch { if (active) setLedger(old => ({ ...old, phase: 'error' })); }
    })();
    return () => { active = false; controller.abort(); };
  }, [environment, reload, realtime?.reconciledAt]);
  function changeEnvironment(next: 'demo' | 'kis') { setEnvironment(next); setFilter('all'); }
  async function cancel(id: string) {
    if (cancelling.current || busy || !available) return;
    cancelling.current = true;
    try { await act('orders/cancel', { id }); } catch {} finally { cancelling.current = false; }
  }
  const matches = (code: string) => `${code} ${state.instruments.find(s => s.code === code)?.name ?? ''}`.toLowerCase().includes(query.trim().toLowerCase());
  const rows = state.orders.filter(o => (filter === 'all' || o.status === filter) && matches(o.code));
  const paperRows = ledger.orders?.filter(o => (filter === 'all' || o.status === filter) && matches(o.code)) ?? [];
  const paperStatus = { sending: '전송 중', accepted: '접수 · 미체결', unknown: '응답 불명 · 대조 필요', rejected: '거부 · 미접수', partial: '부분체결', filled: '체결', cancelled: '취소' };
  const filters = environment === 'demo' ? [['all', '전체'], ['pending', '미체결'], ['filled', '체결'], ['cancelled', '취소']] : [['all', '전체'], ['sending', '전송 중'], ['accepted', '미체결'], ['partial', '부분체결'], ['filled', '체결'], ['cancelled', '취소'], ['unknown', '불명'], ['rejected', '거부']];
  return <><div className="tabs" aria-label="주문 환경"><button className={environment === 'demo' ? 'active' : ''} aria-pressed={environment === 'demo'} onClick={() => changeEnvironment('demo')}>DEMO 주문</button><button className={environment === 'kis' ? 'active' : ''} aria-pressed={environment === 'kis'} onClick={() => changeEnvironment('kis')}>KIS 모의 원장</button></div>
    <p className="notice compact">{environment === 'demo' ? '합성 데이터 · 로컬 DEMO 주문입니다. 취소는 예약을 해제하며 실제 KIS 주문에 영향을 주지 않습니다.' : '저장된 KIS 모의 원장입니다. 이 화면은 KIS에 조회·주문·취소를 전송하지 않습니다. 대조·불명 복구는 KIS 모의 매매 화면에서 직접 진행하세요.'}</p>
    {environment === 'kis' && <RealtimeStatus />}
    {environment === 'demo' && <div className="stats-grid three"><Stat label="전체 주문" value={`${state.orders.length}건`} sub="저장된 DEMO 누적" /><Stat label="미체결" value={`${state.orders.filter(o => o.status === 'pending').length}건`} sub="다음 봉에서 조건 평가" /><Stat label="체결 완료" value={`${state.orders.filter(o => o.status === 'filled').length}건`} sub="현금·보유수량 반영" /></div>}
    <Panel title={environment === 'demo' ? '주문 내역' : 'KIS 저장 원장'} action={environment === 'demo' ? <button disabled={busy || !available} className="button secondary" onClick={() => void act('tick').catch(() => {})}>다음 데모 봉 재생</button> : <button className="button secondary" disabled={ledger.phase === 'loading'} onClick={() => setReload(value => value + 1)}>원장 다시 읽기</button>}>
      <label className="field">주문 종목 검색<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="종목명 또는 코드" /></label>
      <div className="toolbar"><div className="tabs">{filters.map(([id, label]) => <button key={id} onClick={() => setFilter(id)} className={filter === id ? 'active' : ''} aria-pressed={filter === id}>{label}</button>)}</div><span className="muted">{environment === 'demo' ? '최신 주문순' : '로컬 저장 원장'}</span></div>
      {environment === 'demo' ? rows.length ? <div className="table-scroll"><table><thead><tr><th>시각 / ID</th><th>종목</th><th>구분</th><th>주문 / 체결 / 잔량</th><th>지정가 / 평균 체결가</th><th>상태</th><th>수수료</th><th>출처</th><th>관리</th></tr></thead><tbody>{rows.map(o => <tr key={o.id}><td><span>{new Date(o.createdAt).toLocaleString('ko-KR')}</span><small className="cell-small">{o.id}</small>{o.filledAt && <small className="cell-small">체결 {new Date(o.filledAt).toLocaleString('ko-KR')}</small>}</td><td><Link className="stock-name" to={`/trade?code=${o.code}`}>{state.instruments.find(s => s.code === o.code)?.name ?? o.code}</Link><small className="cell-small">{o.code}</small></td><td className={o.side === 'buy' ? 'up' : 'down'}>{o.side === 'buy' ? '매수' : '매도'}</td><td>{o.qty} / {o.status === 'filled' ? o.qty : 0} / {o.status === 'pending' ? o.qty : 0}주</td><td className="number">{won(o.price)} / {o.filledPrice === undefined ? '—' : won(o.filledPrice)}</td><td><Badge tone={o.status === 'filled' ? 'teal' : 'neutral'}>{orderStatus[o.status]}</Badge></td><td>{won(o.fee)}원</td><td>{o.source === 'manual' ? '수동 주문' : state.strategies.find(s => s.id === o.source)?.name ?? '전략'}</td><td>{o.status === 'pending' ? <button className="button small secondary" disabled={busy || !available} onClick={() => void cancel(o.id)}>취소</button> : '—'}</td></tr>)}</tbody></table></div> : <Empty title={state.orders.length ? '검색 조건에 맞는 주문이 없습니다' : '아직 주문이 없습니다'}><Link to="/trade">트레이딩</Link>에서 DEMO 주문을 확인하세요.</Empty> : <>
        <p className="muted tiny">평균 체결가·수수료는 현재 원장에 미제공</p>
        <p className="muted">KIS 대조 시각은 이 원장에 미제공입니다. 로컬 읽기 성공은 최신 KIS 상태 확인이 아닙니다. 재시작·다음 거래일에도 원래 주문일 기준으로 대조해야 합니다. 실시간 수신·대조 상태는 위 표시를 확인하세요.</p>
        {ledger.phase === 'loading' && <p role="status">로컬 원장 읽는 중…</p>}
        {ledger.phase === 'error' && <p role="alert">원장을 읽지 못했습니다. 연결을 확인하고 다시 읽으세요.</p>}
        {ledger.readAt && <p role="status">{ledger.phase === 'ready' ? '로컬 원장 읽기 완료' : '마지막 로컬 읽기'} · {new Date(ledger.readAt).toLocaleString('ko-KR')}</p>}
        {ledger.phase !== 'ready' && ledger.orders !== null && <p className="notice warning">이전에 읽은 원장</p>}
        {paperRows.length ? <div className="table-scroll"><table><thead><tr><th>주문일 / 요청 ID</th><th>종목</th><th>방향 / 주문가격</th><th>주문 / 체결 / 잔량</th><th>상태</th><th>증권사 주문번호</th><th>관리</th></tr></thead><tbody>{paperRows.map(o => <tr key={o.requestId}><td>{o.tradeDate}<small className="cell-small">{new Date(o.createdAt).toLocaleString('ko-KR')}</small><small className="cell-small">{o.requestId}</small></td><td>{state.instruments.find(s => s.code === o.code)?.name ?? o.code}<small className="cell-small">{o.code}</small></td><td>{o.side === 'buy' ? '매수' : '매도'} · {o.orderType === 'market' ? '시장가' : `${won(o.price)}원`}</td><td>{o.qty} / {o.filled} / {o.remaining}주</td><td><Badge tone={o.status === 'unknown' ? 'amber' : o.status === 'filled' ? 'teal' : 'neutral'}>{paperStatus[o.status]}</Badge></td><td>{o.brokerId ?? '미확인'}</td><td><Link to={`/paper?code=${o.code}`}>KIS 원장·복구 화면</Link></td></tr>)}</tbody></table></div> : ledger.phase === 'ready' && <Empty title={ledger.orders?.length ? '검색 조건에 맞는 주문이 없습니다' : '저장된 KIS 주문이 없습니다'}>로컬 원장에 없는 주문의 미접수·미체결을 뜻하지 않습니다. <Link to="/paper">KIS 모의 매매</Link>에서 별도로 확인하세요.</Empty>}
      </>}
    </Panel></>;
}
