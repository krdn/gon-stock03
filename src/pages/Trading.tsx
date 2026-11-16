import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ArrowRight, Info, ShieldCheck, X } from 'lucide-react';
import { useWorkbench } from '../context';
import { Badge, Change, Chart, Empty, Panel, Stat } from '../components/ui';
import { orderInput, type OrderInput } from '../../shared/contracts';
import { orderStatus, won } from '../../shared/model';

export function Trade() {
  const { state, act, busy, available, refresh } = useWorkbench(); const [params, setParams] = useSearchParams();
  const code = params.get('code') ?? '005930'; const instrument = state.instruments.find(s => s.code === code) ?? state.instruments[0];
  const [side, setSide] = useState<'buy' | 'sell'>('buy'), [qty, setQty] = useState('1'), [price, setPrice] = useState(String(instrument.price)), [range, setRange] = useState(60);
  const [confirm, setConfirm] = useState(false), [requestId, setRequestId] = useState(''); const dialog = useRef<HTMLDialogElement>(null);
  const [priceEdited, setPriceEdited] = useState(false);
  const [reviewedQuote, setReviewedQuote] = useState(0);
  const sending = useRef(false);
  const [unresolved, setUnresolved] = useState<OrderInput | null>(() => {
    try { const parsed = orderInput.safeParse(JSON.parse(sessionStorage.getItem('demo-order-pending') ?? 'null')); return parsed.success ? parsed.data : null; } catch { return null; }
  });
  const [orderNotice, setOrderNotice] = useState('');
  const [retryQuote, setRetryQuote] = useState<number | null>(null);
  const retryInstrument = state.instruments.find(i => i.code === unresolved?.code);
  const reconciled = unresolved && available ? state.orders.find(o => o.requestId === unresolved.requestId) : undefined;
  useEffect(() => {
    if (reconciled) {
      sessionStorage.removeItem('demo-order-pending'); setUnresolved(null);
      setOrderNotice(orderStatus[reconciled.status]);
    }
  }, [reconciled]);
  useEffect(() => { setPriceEdited(false); setPrice(String(instrument.price)); setConfirm(false); }, [instrument.code]);
  useEffect(() => { if (!priceEdited && !confirm) setPrice(String(instrument.price)); }, [instrument.price, priceEdited, confirm]);
  useEffect(() => { if (confirm) dialog.current?.showModal(); else dialog.current?.close(); }, [confirm]);
  const amount = Number(qty) * Number(price); const holding = state.positions.find(p => p.code === instrument.code)?.qty ?? 0;
  const pendingBuy = state.orders.filter(o => o.status === 'pending' && o.side === 'buy').reduce((a, o) => a + o.qty * o.price + Math.ceil(o.qty * o.price * .00015), 0);
  const sellable = holding - state.orders.filter(o => o.status === 'pending' && o.side === 'sell' && o.code === instrument.code).reduce((sum, o) => sum + o.qty, 0);
  const quoteChanged = instrument.price !== reviewedQuote;
  const blocked = !available || state.risk.halted;
  function review(e: React.FormEvent) {
    e.preventDefault(); if (blocked || busy || unresolved || sending.current) return;
    setRequestId(crypto.randomUUID()); setReviewedQuote(instrument.price); setConfirm(true); setOrderNotice('');
  }
  async function send(input: OrderInput) {
    if (sending.current || busy || blocked) return;
    sending.current = true;
    const retry = unresolved?.requestId === input.requestId;
    try {
      sessionStorage.setItem('demo-order-pending', JSON.stringify(input));
      setUnresolved(input); setRetryQuote(null); setConfirm(false);
      const result = await act<{ order: { status: keyof typeof orderStatus } }>('orders', input);
      sessionStorage.removeItem('demo-order-pending'); setUnresolved(null);
      setOrderNotice(orderStatus[result.order.status]);
    } catch (error) {
      if (error instanceof Error && 'definitive' in error && error.definitive === true && !(retry && 'notSent' in error && error.notSent === true)) {
        sessionStorage.removeItem('demo-order-pending'); setUnresolved(null);
      }
      setOrderNotice(error instanceof Error ? error.message : '주문 결과를 확인하지 못했습니다.');
    } finally { sending.current = false; }
  }
  async function submit() {
    if (!confirm || quoteChanged || unresolved) return;
    await send({ code: instrument.code, side, qty: Number(qty), price: Number(price), requestId });
  }
  return <>{unresolved && <Panel title="DEMO 주문 응답 미확인"><p>새 요청을 차단했습니다. 로컬 원장을 대조하세요. 같은 요청 재시도는 기존 접수를 돌려주거나 미접수 요청을 접수하며 KIS에는 전송하지 않습니다.</p><p>{unresolved.code} · {unresolved.side === 'buy' ? '매수' : '매도'} · {unresolved.qty}주 × {won(unresolved.price)}원</p><p>현재 DEMO 합성 시세: {retryInstrument ? won(retryInstrument.price) + '원' : '미확인'} · 원래 지정가와 현재 시세를 확인한 뒤 같은 요청을 재시도하세요.</p><div className="button-row"><button className="button secondary" disabled={busy} onClick={() => void refresh()}>DEMO 주문 대조</button><button className="button secondary" disabled={busy || blocked || !retryInstrument} onClick={() => setRetryQuote(retryInstrument!.price)}>재시도 시세 확인</button><button className="button secondary" disabled={busy || blocked || !retryInstrument || retryQuote !== retryInstrument.price} onClick={() => { if (retryInstrument && retryQuote === retryInstrument.price) void send(unresolved); }}>같은 DEMO 요청 재시도</button></div></Panel>}{orderNotice && <p role="status">{orderNotice}</p>}<div className="notice compact"><Info size={16} />로컬 데모 지정가 주문입니다. KIS 모의 계좌에 전송되지 않습니다. 접수 후 다음 데모 봉에서 체결 조건을 평가합니다.</div><p><Link className="button secondary" to={`/paper?code=${instrument.code}`}>선택 종목 KIS 모의 매매<ArrowRight size={16} /></Link></p><div className="trade-grid"><div><Panel><div className="stock-heading"><label><span className="sr-only">트레이딩 종목</span><select value={instrument.code} onChange={e => setParams({ code: e.target.value })}>{state.instruments.map(s => <option value={s.code} key={s.code}>{s.name} · {s.code}</option>)}</select></label><Badge>{instrument.market}</Badge></div><div className="quote"><strong>{won(instrument.price)}<small>KRW</small></strong><Change value={instrument.change} /><span className="muted">합성 데이터 · 봉 #{state.tick}</span></div><div className="chart-toolbar"><div className="tabs">{[30, 60, 120].map(n => <button key={n} className={range === n ? 'active' : ''} onClick={() => setRange(n)}>{n}봉</button>)}</div><span className="muted">종가 선형 차트</span></div><Chart values={instrument.history.slice(-range)} height={290} label={`${instrument.name} 합성 ${range}봉 종가`} /><div className="chart-axis"><span>과거 표본</span><span>단위: 원 · 실제 거래일 미부여</span><span>현재 데모 봉</span></div><div className="trade-facts"><div><span>구분</span><strong>{instrument.sector}</strong></div><div><span>데모 거래량</span><strong>{won(instrument.volume)}</strong></div><div><span>내 보유수량</span><strong>{holding}주</strong></div></div></Panel><Panel title="주문은 이렇게 처리돼요" className="top-gap"><div className="inline-flow"><span>입력</span><ArrowRight size={15} /><span>한도 검증</span><ArrowRight size={15} /><span>접수</span><ArrowRight size={15} /><span>다음 봉 체결 판단</span></div><p className="muted prose">매수는 다음 가격이 지정가 이하일 때, 매도는 이상일 때 데모 체결합니다. 실제 시장의 호가 잔량·부분체결·거래소 규칙은 재현하지 않습니다.</p></Panel></div><Panel title="주문하기" action={<Badge tone="teal">로컬 데모</Badge>}><form onSubmit={review}><div className="side-tabs"><button type="button" className={side === 'buy' ? 'buy active' : ''} onClick={() => setSide('buy')}>매수</button><button type="button" className={side === 'sell' ? 'sell active' : ''} onClick={() => setSide('sell')}>매도</button></div><label className="field">주문 유형<select disabled><option>지정가</option></select></label><label className="field">주문 가격 (원)<input required type="number" min="1" max="10000000" step="1" value={price} onChange={e => { setPriceEdited(true); setPrice(e.target.value); }} /></label><label className="field">주문 수량 (주)<input required type="number" min="1" max="100000" step="1" value={qty} onChange={e => setQty(e.target.value)} /></label><div className="quantity-buttons">{[1, 5, 10].map(n => <button key={n} type="button" onClick={() => setQty(String(n))}>{n}주</button>)}</div><div className="order-total"><span>주문 금액</span><strong>{Number.isFinite(amount) ? won(amount) : '—'}<small>원</small></strong></div><div className="check-row"><span>예약 제외 현금</span><strong>{won(state.cash - pendingBuy)}원</strong></div><div className="check-row"><span>보유수량</span><strong>{holding}주</strong></div><div className="check-row"><span>예약 제외 매도 가능 수량</span><strong aria-label="매도 가능 수량">{sellable}주</strong></div><div className="check-row"><span>1회 주문 한도</span><strong>{won(state.risk.maxOrder)}원</strong></div><p className="muted tiny">데모 비용 가정: 체결 금액의 0.015% (올림). 실제 계좌 수수료·세금과 다릅니다.</p><button className={`button wide ${side === 'buy' ? 'buy-button' : 'sell-button'}`} disabled={blocked || busy || Boolean(unresolved)} type="submit">{side === 'buy' ? '매수' : '매도'} 주문 확인<ArrowRight size={16} /></button><p className="secure-note"><ShieldCheck size={14} />서버에서 잔고와 위험 한도를 검사합니다</p></form></Panel></div>
    <dialog ref={dialog} className="order-dialog" aria-labelledby="demo-order-confirm-title" onCancel={() => setConfirm(false)} onClose={() => setConfirm(false)}><div className="panel-head"><h2 id="demo-order-confirm-title">로컬 데모 주문 확인</h2><button className="icon-button" aria-label="주문 확인 닫기" onClick={() => setConfirm(false)}><X size={18} /></button></div><p>환경: DEMO · 합성 시세 {won(instrument.price)}원</p><p>{instrument.name} · {side === 'buy' ? '매수' : '매도'}</p><h3>{qty}주 × {won(Number(price))}원</h3><p>주문 금액 {won(amount)}원. KIS로 전송되지 않습니다.</p>{quoteChanged && <div className="notice warning"><p>시세가 변경되었습니다. 지정가는 유지됩니다. 현재 시세와 주문 가격을 다시 확인하세요.</p><button onClick={() => setReviewedQuote(instrument.price)}>변경된 시세 재확인</button></div>}{blocked && <p role="status">{state.risk.halted ? '신규 주문 정지 상태입니다.' : '최신 로컬 상태 확인 전 접수를 차단합니다.'}</p>}<div className="button-row"><button className="button secondary" onClick={() => setConfirm(false)}>돌아가기</button><button className="button primary" disabled={busy || blocked || quoteChanged || Boolean(unresolved)} onClick={() => void submit()}>데모 주문 접수</button></div></dialog></>;
}
export function Orders() {
  const { state, act, busy, available } = useWorkbench(); const [filter, setFilter] = useState('all');
  const rows = state.orders.filter(o => filter === 'all' || o.status === filter);
  return <><div className="stats-grid three"><Stat label="전체 주문" value={`${state.orders.length}건`} sub="현재 데모 세션 누적" /><Stat label="미체결" value={`${state.orders.filter(o => o.status === 'pending').length}건`} sub="다음 봉에서 조건 평가" /><Stat label="체결 완료" value={`${state.orders.filter(o => o.status === 'filled').length}건`} sub="현금·보유수량 반영" /></div><Panel title="주문 내역" action={<button disabled={busy || !available} className="button secondary" onClick={() => void act('tick').catch(() => {})}>다음 데모 봉 재생</button>}><div className="toolbar"><div className="tabs">{[['all', '전체'], ['pending', '미체결'], ['filled', '체결'], ['cancelled', '취소']].map(([id, label]) => <button key={id} onClick={() => setFilter(id)} className={filter === id ? 'active' : ''}>{label}</button>)}</div><span className="muted">최신 주문순</span></div>{rows.length ? <div className="table-scroll"><table><thead><tr><th>시각 / ID</th><th>종목</th><th>구분</th><th>수량</th><th>가격</th><th>상태</th><th>출처</th><th>관리</th></tr></thead><tbody>{rows.map(o => <tr key={o.id}><td><span>{new Date(o.createdAt).toLocaleTimeString('ko-KR')}</span><small className="cell-small">{o.id.slice(0, 8)}</small></td><td><Link className="stock-name" to={`/trade?code=${o.code}`}>{state.instruments.find(s => s.code === o.code)?.name}</Link></td><td className={o.side === 'buy' ? 'up' : 'down'}>{o.side === 'buy' ? '매수' : '매도'}</td><td>{o.qty}주</td><td className="number">{won(o.filledPrice ?? o.price)}</td><td><Badge tone={o.status === 'filled' ? 'teal' : 'neutral'}>{orderStatus[o.status]}</Badge></td><td>{o.source === 'manual' ? '수동' : '전략'}</td><td>{o.status === 'pending' ? <button className="button small-button secondary" disabled={busy} onClick={() => void act('orders/cancel', { id: o.id }).catch(() => {})}>취소</button> : '—'}</td></tr>)}</tbody></table></div> : <Empty title="아직 주문이 없습니다"><Link to="/trade">트레이딩</Link>에서 데모 주문을 접수해 보세요.</Empty>}</Panel></>;
}
