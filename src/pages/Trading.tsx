import './orders-current-v2.css';
import { LiveTrading } from './LiveTrading';
import { TradeHelpPanel } from '../components/TradeHelpPanel';
import { OrdersHelpPanel } from '../components/OrdersHelpPanel';
import { HistoryOrder, paperStatus, type LedgerOrder } from '../components/HistoryOrder';
import { RealtimeStatus } from '../components/RealtimeStatus';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ArrowRight, BookOpen, X } from 'lucide-react';
import { useWorkbench } from '../context';
import { Badge, Change, Chart, Empty, Panel, phaseLabels } from '../components/ui';
import { DEFAULT_PAPER_MAX_QTY, orderInput, paperLedgerSchema, orderHistorySchema, type OrderInput, type PaperLedger } from '../../shared/contracts';
import { orderStatus, won, equity, type Instrument } from '../../shared/model';

/** 손익 금액을 `-0원` 없이 부호·색상과 함께 포맷한다. */
function formatSignedWon(value: number): { text: string; tone: '' | 'up' | 'down' } {
  if (!Number.isFinite(value)) return { text: '—', tone: '' };
  const rounded = Math.round(value);
  if (rounded > 0) return { text: `+${rounded.toLocaleString('ko-KR')}원`, tone: 'up' };
  if (rounded < 0) return { text: `${rounded.toLocaleString('ko-KR')}원`, tone: 'down' };
  return { text: '0원', tone: '' };
}

/** 등락률(%)을 `-0.00%` 없이 부호·색상과 함께 포맷한다. */
function formatSignedPct(value: number): { text: string; tone: '' | 'up' | 'down' } {
  if (!Number.isFinite(value)) return { text: '—', tone: '' };
  const rounded = Math.round(value * 100) / 100;
  if (rounded > 0) return { text: `+${rounded.toFixed(2)}%`, tone: 'up' };
  if (rounded < 0) return { text: `${rounded.toFixed(2)}%`, tone: 'down' };
  return { text: '0.00%', tone: '' };
}

/** DEMO 지정가 예상 수수료(0.015% 올림) 계산. */
const calcDemoFee = (amt: number) => Math.ceil((amt * 1.5) / 10000);

export function Trade() {
  const [params, setParams] = useSearchParams();
  const code = params.get('code') ?? '005930';
  const demo = params.get('mode') === 'demo';
  const [helpOpen, setHelpOpen] = useState(false);
  const helpPanelId = useId();
  const helpToggleRef = useRef<HTMLButtonElement>(null);

  function closeHelp() {
    setHelpOpen(false);
    helpToggleRef.current?.focus();
  }

  return <>
    <div className="trade-top-bar">
      <div className="tabs trade-mode" role="group" aria-label="트레이딩 환경">
        <button className={!demo ? 'active' : ''} aria-pressed={!demo} onClick={() => { if (demo) setParams({ code }); }}>실제 시세</button>
        <button className={demo ? 'active' : ''} aria-pressed={demo} onClick={() => { if (!demo) setParams({ code, mode: 'demo' }); }}>DEMO 연습</button>
      </div>
      <button
        ref={helpToggleRef}
        type="button"
        className={`button small-button ${helpOpen ? 'primary' : 'secondary'} trade-help-toggle`}
        aria-expanded={helpOpen}
        aria-controls={helpOpen ? helpPanelId : undefined}
        onClick={() => setHelpOpen(open => !open)}
      >
        <BookOpen size={14} aria-hidden="true" />
        사용방법 도움말
      </button>
    </div>
    {helpOpen && <TradeHelpPanel panelId={helpPanelId} onClose={closeHelp} />}
    {demo ? <DemoTrade /> : <LiveTrading code={code} />}
  </>;
}

function DemoTrade() {
  const { state, server, status } = useWorkbench();
  const [params] = useSearchParams();
  const code = params.get('code') ?? '005930';
  const instrument = state.instruments.find(s => s.code === code);
  if (!server) return <Panel><Empty title={status.phase === 'loading' ? 'DEMO 상태를 확인하고 있습니다' : 'DEMO 상태를 확인하지 못했습니다'}>로컬 서버 상태 확인 후 시세·자산과 주문 입력을 표시합니다.</Empty></Panel>;
  if (!instrument) return <Panel><Empty title={state.instruments.length ? '지원하지 않는 DEMO 종목입니다' : 'DEMO 종목이 없습니다'}>요청 종목: {code || '미입력'}. 다른 종목으로 자동 변경하지 않습니다.</Empty><div className="button-row">{state.instruments.map(s => <Link className="button secondary" key={s.code} to={`/trade?mode=demo&code=${s.code}`}>{s.name} · {s.code}</Link>)}{/^\d{6}$/.test(code) && <Link className="button secondary" to={`/paper?code=${code}`}>선택 종목 KIS 모의 매매<ArrowRight size={16} /></Link>}</div></Panel>;
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
  const numQty = Number(qty);
  const numPrice = Number(price);
  const amount = numQty * numPrice;
  const position = state.positions.find(p => p.code === instrument.code);
  const holding = position?.qty ?? 0;
  const holdingAvg = position?.average ?? 0;
  const pendingBuy = state.orders.filter(o => o.status === 'pending' && o.side === 'buy').reduce((a, o) => a + o.qty * o.price + calcDemoFee(o.qty * o.price), 0);
  const sellable = holding - state.orders.filter(o => o.status === 'pending' && o.side === 'sell' && o.code === instrument.code).reduce((sum, o) => sum + o.qty, 0);
  const validPrice = Number.isSafeInteger(numPrice) && numPrice >= 1 && numPrice <= 10_000_000;
  const validNumbers = Number.isSafeInteger(numQty) && numQty >= 1 && numQty <= 100_000 && validPrice;
  const estimatedFee = validNumbers ? calcDemoFee(amount) : 0;
  const pendingExposure = state.orders.filter(o => o.status === 'pending' && o.side === 'buy' && o.code === instrument.code).reduce((sum, o) => sum + o.qty * o.price, 0);
  const currentDailyLoss = Math.max(0, state.startingEquity - equity(state));
  const dailyLossRemaining = Math.max(0, state.risk.dailyLoss - currentDailyLoss);
  const lossLimitHit = currentDailyLoss >= state.risk.dailyLoss;
  const inputError = !validNumbers ? '가격은 1~10,000,000원, 수량은 1~100,000주의 정수로 입력하세요.'
    : lossLimitHit ? '손실 한도를 초과했습니다.'
    : amount > state.risk.maxOrder ? '1회 주문 한도를 초과합니다.'
    : side === 'buy' && amount + estimatedFee > state.cash - pendingBuy ? '수수료를 포함한 주문 금액이 예약 제외 현금을 초과합니다.'
    : side === 'buy' && holding * instrument.price + pendingExposure + amount > state.risk.maxPosition ? '종목별 최대 투자금을 초과합니다.'
    : side === 'sell' && numQty > sellable ? '예약 제외 매도 가능 수량을 초과합니다.' : '';
  const quoteChanged = instrument.price !== reviewedQuote;
  const blocked = !available || state.risk.halted || storageError;

  // 현재 입력가 및 위험 한도·수수료 기준 최대 가능 수량 계산
  const maxOrderableQty = (() => {
    if (!available || state.risk.halted || !validPrice || lossLimitHit) return 0;
    const byMaxOrder = Math.floor(state.risk.maxOrder / numPrice);
    if (side === 'sell') return Math.max(0, Math.min(100_000, sellable, byMaxOrder));
    const remPosition = Math.max(0, state.risk.maxPosition - holding * instrument.price - pendingExposure);
    const byPosition = Math.floor(remPosition / numPrice);
    const availCash = Math.max(0, state.cash - pendingBuy);
    let byCash = Math.min(100_000, Math.floor(availCash / numPrice));
    while (byCash > 0 && byCash * numPrice + calcDemoFee(byCash * numPrice) > availCash) byCash -= 1;
    return Math.max(0, Math.min(100_000, byMaxOrder, byPosition, byCash));
  })();

  function adjustPrice(factor: number) {
    const base = Number.isFinite(numPrice) && numPrice > 0 ? numPrice : instrument.price;
    const next = Math.min(10_000_000, Math.max(1, Math.round(base * factor)));
    setPriceEdited(true);
    setPrice(String(next));
  }

  // 주문 영향 사전 시뮬레이션
  const projectedHolding = holding + (validNumbers ? numQty : 0);
  const projectedBuyAvg = side === 'buy' && validNumbers && projectedHolding > 0
    ? Math.round(((holding * holdingAvg + amount) / projectedHolding) * 100) / 100
    : null;
  const projectedSellPnl = side === 'sell'
    ? (holding <= 0 ? { text: '보유 없음', tone: '' as const }
      : validNumbers && numQty > 0 ? formatSignedWon((numPrice - holdingAvg) * numQty - estimatedFee)
      : { text: '—', tone: '' as const })
    : null;
  const nextHolding = side === 'sell' ? Math.max(0, holding - (validNumbers ? numQty : 0)) : holding;
  const projectedExposure = side === 'sell'
    ? nextHolding * instrument.price + pendingExposure
    : holding * instrument.price + pendingExposure + (validNumbers ? amount : 0);
  const exposurePct = state.risk.maxPosition > 0
    ? Math.round((projectedExposure / state.risk.maxPosition) * 100)
    : 0;

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
    await send({ code: instrument.code, side, qty: numQty, price: numPrice, requestId });
  }
  const history = instrument.history.slice(-range);
  const historyStats = (() => {
    if (history.length === 0) return null;
    const high = Math.max(...history);
    const low = Math.min(...history);
    const avg = history.reduce((sum, v) => sum + v, 0) / history.length;
    const first = history[0];
    const last = history[history.length - 1];
    const changePct = first > 0 ? formatSignedPct(((last - first) / first) * 100) : { text: '0.00%', tone: '' as const };
    return { high, low, avg, changePct };
  })();
  const buyPendingCount = state.orders.filter(o => o.status === 'pending' && o.side === 'buy' && o.code === instrument.code).length;
  const sellPendingCount = state.orders.filter(o => o.status === 'pending' && o.side === 'sell' && o.code === instrument.code).length;
  const holdingEval = holding * instrument.price;
  const holdingProfit = holding > 0 ? formatSignedWon((instrument.price - holdingAvg) * holding) : null;

  const blockedReason = !available ? '최신 로컬 상태 확인 전 주문을 차단합니다.'
    : state.risk.halted ? '신규 주문 정지 상태입니다.'
    : storageError ? '요청 보존 저장소를 확인한 뒤 주문할 수 있습니다.'
    : unresolved ? '미확인 DEMO 요청을 원장과 대조하세요.'
    : busy ? '진행 중인 요청을 처리하고 있습니다.' : inputError;
  return <div className="trade-page">{storageError && <div className="notice warning" role="alert">요청 보존 저장소를 확인할 수 없어 신규 주문을 차단했습니다. 저장소 접근 실패 또는 저장값 손상을 해결하기 전에 <Link className="text-link" to="/orders?view=demo">원장 확인</Link>에서 보존 요청을 대조하세요. 접근을 복구한 경우 새로고침하세요. 저장값을 임의로 삭제하거나 새 요청으로 재전송하지 마세요.</div>}{unresolved && <Panel title={storageError ? "DEMO 요청 보존 확인 필요" : "DEMO 주문 응답 미확인"}><p>{storageError ? '저장된 요청을 보존했습니다. DEMO 주문 대조로 원장을 확인하세요. 저장소 문제를 해결하기 전에는 같은 요청 재시도도 차단합니다.' : '새 요청을 차단했습니다. 로컬 원장을 대조하세요. 같은 요청 재시도는 기존 접수를 돌려주거나 미접수 요청을 접수하며 KIS에는 전송하지 않습니다.'}</p><p>{unresolved.code} · {unresolved.side === 'buy' ? '매수' : '매도'} · {unresolved.qty}주 × {won(unresolved.price)}원</p>{!storageError && <p>현재 DEMO 합성 시세: {retryInstrument ? won(retryInstrument.price) + '원' : '미확인'} · 원래 지정가와 현재 시세를 확인한 뒤 같은 요청을 재시도하세요.</p>}<div className="button-row"><button className="button secondary" disabled={busy} onClick={() => void refresh()}>DEMO 주문 대조</button><button className="button secondary" disabled={busy || blocked || !retryInstrument} onClick={() => setRetryQuote(retryInstrument!.price)}>재시도 시세 확인</button><button className="button secondary" disabled={busy || blocked || !retryInstrument || retryQuote !== retryInstrument.price} onClick={() => { if (retryInstrument && retryQuote === retryInstrument.price) void send(unresolved); }}>같은 DEMO 요청 재시도</button></div></Panel>}
    <div className="demo-trade-layout">
      <section className="panel demo-ticket" aria-label="DEMO 지정가 주문">
        <div className="stock-heading">
          <label className="field">트레이딩 종목
            <select aria-label="트레이딩 종목" value={instrument.code} onChange={e => setParams({ code: e.target.value, mode: 'demo' })}>
              {state.instruments.map(s => <option value={s.code} key={s.code}>{s.name} · {s.code}</option>)}
            </select>
          </label>
          <Badge>{instrument.market}</Badge>
        </div>
        <div className="quote"><strong>{won(instrument.price)}<small>원</small></strong><Change value={instrument.change} /><span className="muted">DEMO 합성 시세 · 봉 #{state.tick}</span></div>
        <p className="trade-ticket-note">로컬 DEMO 지정가 주문 · 다음 데모 봉에서 체결을 평가합니다.</p>
        <form onSubmit={review}>
          <div className="side-tabs" role="group" aria-label="DEMO 매매 방향">{(['buy', 'sell'] as const).map(value =>
            <button type="button" key={value} className={side === value ? value + ' active' : ''} aria-pressed={side === value} onClick={() => setSide(value)}>{value === 'buy' ? '매수' : '매도'}</button>
          )}</div>
          <div className="demo-ticket-inputs">
            <label className="field">주문 가격 (원)<input required type="number" min="1" max="10000000" step="1" value={price} onChange={e => { setPriceEdited(true); setPrice(e.target.value); }} /></label>
            <label className="field">주문 수량 (주)<input required type="number" min="1" max="100000" step="1" value={qty} onChange={e => setQty(e.target.value)} /></label>
          </div>
          <div className="trade-price-adjust" role="group" aria-label="주문 가격 빠른 조정">
            <button type="button" onClick={() => adjustPrice(0.99)}>-1%</button>
            <button type="button" onClick={() => { setPrice(String(instrument.price)); setPriceEdited(false); }}>현재가 적용</button>
            <button type="button" onClick={() => adjustPrice(1.01)}>+1%</button>
          </div>
          <div className="quantity-buttons">
            {[1, 5, 10].map(n => <button key={n} type="button" onClick={() => setQty(String(n))}>{n}주</button>)}
            <button type="button" className="trade-max-qty" disabled={maxOrderableQty < 1} onClick={() => setQty(String(maxOrderableQty))}>최대 가능 ({maxOrderableQty.toLocaleString('ko-KR')}주)</button>
          </div>
          <div className="order-total"><span>주문 금액</span><strong>{validNumbers ? won(amount) : '—'}<small>원</small></strong></div>
          <div className="check-row"><span>지정가 기준 예상 수수료</span><strong>{validNumbers ? won(estimatedFee) : '—'}원</strong></div>
          <div className="check-row"><span>예약 제외 현금</span><strong>{won(state.cash - pendingBuy)}원</strong></div>
          <div className="check-row" role="group" aria-label="매도 가능 수량"><span>예약 제외 매도 가능 수량</span><strong>{sellable}주</strong></div>
          <dl className="demo-order-impact" aria-label="DEMO 주문 영향 및 한도 진단">
            {side === 'buy' ? <>
              <div>
                <dt>체결 후 예상 보유</dt>
                <dd>{holding.toLocaleString('ko-KR')}주 → {projectedHolding.toLocaleString('ko-KR')}주</dd>
              </div>
              <div>
                <dt>체결 후 예상 평균 매입가</dt>
                <dd>{projectedBuyAvg !== null ? `${projectedBuyAvg.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원` : '—'}</dd>
              </div>
            </> : <div className="demo-impact-wide">
              <dt>예상 실현손익 (수수료 반영)</dt>
              <dd className={projectedSellPnl?.tone ?? ''}>{projectedSellPnl?.text ?? '—'}</dd>
            </div>}
            <div>
              <dt>종목별 최대 투자금 노출</dt>
              <dd className={projectedExposure > state.risk.maxPosition ? 'trade-limit-over' : ''}>{won(projectedExposure)}원 / {won(state.risk.maxPosition)}원 ({exposurePct}%)</dd>
            </div>
            <div>
              <dt>일일 손실 한도 여유액</dt>
              <dd className={lossLimitHit ? 'trade-limit-over' : ''}>{won(dailyLossRemaining)}원 / {won(state.risk.dailyLoss)}원</dd>
            </div>
          </dl>
          <details className="trade-data-details">
            <summary>보유수량·주문 한도·비용 기준</summary>
            <div className="check-row"><span>보유수량</span><strong>{holding}주</strong></div>
            <div className="check-row"><span>1회 주문 한도</span><strong>{won(state.risk.maxOrder)}원</strong></div>
            <p>서버에서 잔고와 위험 한도를 검사합니다. 데모 수수료는 체결 금액의 0.015%를 올림합니다.</p>
          </details>
          <p id="demo-order-validation" role="status" className="trade-validation">{blockedReason}</p>
          <button aria-describedby="demo-order-validation" className={`button wide ${side === 'buy' ? 'buy-button' : 'sell-button'}`} disabled={blocked || busy || Boolean(unresolved) || Boolean(inputError)} type="submit">{side === 'buy' ? '매수' : '매도'} 주문 확인<ArrowRight size={16} /></button>
        </form>
        <div className="demo-ticket-result">
          {orderNotice && <p role="status">{orderNotice}</p>}
          <Link className="text-link" to="/orders?view=demo">DEMO 주문 원장<ArrowRight size={15} /></Link>
        </div>
      </section>
      <Panel title="DEMO 합성 차트">
        <div className="chart-toolbar"><div className="tabs" role="group" aria-label="합성 차트 범위">{[30, 60, 120].map(n => <button key={n} className={range === n ? 'active' : ''} aria-pressed={range === n} onClick={() => setRange(n)}>{n}봉</button>)}</div><span className="muted">합성 종가 · {history.length}개 봉</span></div>
        {history.length >= 2
          ? <Chart values={history} height={240} label={`${instrument.name} 합성 ${history.length}봉 종가`} />
          : <Empty title="합성 종가 표본이 부족합니다">차트를 그리려면 2개 이상의 봉이 필요합니다.</Empty>}
        <div className="chart-axis"><span>과거 표본</span><span>원 · 실제 거래일 미부여</span><span>현재 데모 봉</span></div>
        {historyStats && <dl className="demo-chart-stats" aria-label="합성 차트 구간 통계">
          <div><dt>구간 최고가</dt><dd>{won(historyStats.high)}원</dd></div>
          <div><dt>구간 최저가</dt><dd>{won(historyStats.low)}원</dd></div>
          <div><dt>구간 등락률</dt><dd className={historyStats.changePct.tone}>{historyStats.changePct.text}</dd></div>
          <div><dt>구간 평균가</dt><dd>{won(historyStats.avg)}원</dd></div>
        </dl>}
        <section className="demo-position-summary" aria-label="선택 종목 DEMO 보유 및 미체결 현황">
          <div className="demo-position-head">
            <h3>선택 종목 DEMO 보유 · 미체결</h3>
            <button type="button" className="button secondary small-button" disabled={busy || !available} onClick={() => { void act('tick').catch(() => {}); }}>다음 데모 봉 재생</button>
          </div>
          <dl className="demo-position-grid">
            <div>
              <dt>보유 수량</dt>
              <dd>{holding.toLocaleString('ko-KR')}주</dd>
            </div>
            <div>
              <dt>평균 매입가</dt>
              <dd>{holding > 0 ? `${holdingAvg.toLocaleString('ko-KR', { maximumFractionDigits: 20 })}원` : '미보유'}</dd>
            </div>
            <div>
              <dt>현재 평가액 · 손익</dt>
              <dd>{holding > 0 && holdingProfit
                ? <>{won(holdingEval)}원 <small className={holdingProfit.tone}>({holdingProfit.text})</small></>
                : '미보유'}</dd>
            </div>
            <div>
              <dt>미체결 대기 현황</dt>
              <dd>매수 대기 {buyPendingCount}건 · 매도 대기 {sellPendingCount}건</dd>
            </div>
          </dl>
        </section>
        <details className="trade-data-details">
          <summary>종목 정보와 DEMO 체결 기준</summary>
          <div className="trade-facts"><div><span>구분</span><strong>{instrument.sector}</strong></div><div><span>데모 거래량</span><strong>{won(instrument.volume)}</strong></div></div>
          <p>매수는 다음 가격이 지정가 이하일 때, 매도는 이상일 때 체결합니다. 합성 주문은 KIS로 전송되지 않습니다.</p>
        </details>
        <Link className="text-link demo-paper-link" to={`/paper?code=${instrument.code}`}>선택 종목 KIS 모의 매매<ArrowRight size={15} /></Link>
      </Panel>
    </div>
    <dialog ref={dialog} className="order-dialog" aria-labelledby="demo-order-confirm-title" onCancel={event => { event.preventDefault(); setConfirm(false); }}><div className="panel-head"><h2 id="demo-order-confirm-title">로컬 데모 주문 확인</h2><button className="icon-button" aria-label="주문 확인 닫기" onClick={() => setConfirm(false)}><X size={18} /></button></div><p>환경: DEMO · 합성 시세 {won(instrument.price)}원</p><p>{instrument.name} · {side === 'buy' ? '매수' : '매도'}</p><h3>{qty}주 × {won(numPrice)}원</h3><p>주문 금액 {won(amount)}원. KIS로 전송되지 않습니다.</p>{quoteChanged && <div className="notice warning"><p>시세가 변경되었습니다. 지정가는 유지됩니다. 현재 시세와 주문 가격을 다시 확인하세요.</p><button onClick={() => setReviewedQuote(instrument.price)}>변경된 시세 재확인</button></div>}{inputError && <p role="status">{inputError}</p>}{blocked && <p role="status">{state.risk.halted ? '신규 주문 정지 상태입니다.' : '최신 로컬 상태 확인 전 접수를 차단합니다.'}</p>}<div className="button-row"><button className="button secondary" onClick={() => setConfirm(false)}>돌아가기</button><button className="button primary" disabled={busy || blocked || quoteChanged || Boolean(unresolved) || Boolean(inputError)} onClick={() => void submit()}>데모 주문 접수</button></div></dialog></div>;
}
type OrderView = 'demo' | 'kis' | 'history';
type SideFilter = 'all' | 'buy' | 'sell';
type SourceFilter = 'all' | 'manual' | 'strategy';
type PageSizeOption = '20' | '50' | 'all';
type LedgerView = {
  orders: PaperLedger['orders'] | null;
  minimumRun?: PaperLedger['minimumRun'];
  phase: 'loading' | 'ready' | 'error';
  readAt: string | null;
  unavailable: string[];
  sourceCount: number;
};
const emptyLedger: LedgerView = { orders: null, minimumRun: undefined, phase: 'loading', readAt: null, unavailable: [], sourceCount: 0 };
const localTime = (at: string) => new Date(at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
const formatTradeDate = (tradeDate: string) => tradeDate.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');

/** sessionStorage에 보존된 DEMO 미확인 요청을 안전하게 읽는다. */
function readPendingDemoOrder(): OrderInput | null {
  try {
    const raw = sessionStorage.getItem('demo-order-pending');
    if (raw === null) return null;
    return orderInput.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

const demoFilters = [['all', '전체'], ['pending', '미체결'], ['filled', '체결'], ['cancelled', '취소']];
const kisFilters = [['all', '전체'], ['sending', '전송 중'], ['accepted', '미체결'], ['partial', '부분체결'], ['filled', '체결'], ['cancelled', '취소'], ['unknown', '불명'], ['rejected', '거부']];
const views: [OrderView, string][] = [['demo', 'DEMO 주문'], ['kis', 'KIS 모의 원장'], ['history', '지난 KIS 실행 기록']];

export function Orders() {
  const [params, navigate] = useSearchParams();
  const environment = views.find(([id]) => id === params.get('view'))?.[0] ?? 'demo';
  const filters = environment === 'demo' ? demoFilters : kisFilters;
  const filter = filters.find(([id]) => id === params.get('status'))?.[0] ?? 'all';
  const [helpOpen, setHelpOpen] = useState(false);
  const helpPanelId = useId();
  const helpToggleRef = useRef<HTMLButtonElement>(null);

  function closeHelp() {
    setHelpOpen(false);
    helpToggleRef.current?.focus();
  }

  function choose(view: OrderView, status: string) {
    const next = new URLSearchParams(params);
    if (view === 'demo') next.delete('view'); else next.set('view', view);
    if (status === 'all') next.delete('status'); else next.set('status', status);
    navigate(next);
  }

  return <>
    <div className="tabs order-views" role="group" aria-label="주문 환경">{views.map(([id, label]) =>
      <button key={id} className={environment === id ? 'active' : ''} aria-pressed={environment === id}
        onClick={() => { if (environment !== id) choose(id, 'all'); }}>{label}</button>)}</div>
    <OrderList
      key={environment}
      environment={environment}
      filter={filter}
      filters={filters}
      setFilter={status => choose(environment, status)}
      showHistory={() => choose('history', 'all')}
      helpOpen={helpOpen}
      helpPanelId={helpPanelId}
      helpToggleRef={helpToggleRef}
      onToggleHelp={() => setHelpOpen(open => !open)}
      onCloseHelp={closeHelp}
    />
  </>;
}

function OrderList({
  environment,
  filter,
  filters,
  setFilter,
  showHistory,
  helpOpen,
  helpPanelId,
  helpToggleRef,
  onToggleHelp,
  onCloseHelp,
}: {
  environment: OrderView;
  filter: string;
  filters: string[][];
  setFilter: (id: string) => void;
  showHistory: () => void;
  helpOpen: boolean;
  helpPanelId: string;
  helpToggleRef: RefObject<HTMLButtonElement | null>;
  onToggleHelp: () => void;
  onCloseHelp: () => void;
}) {
  const { state, status, connection, paperRisk, act, busy, available, realtime } = useWorkbench();
  const [query, setQuery] = useState('');
  const [sideFilter, setSideFilter] = useState<SideFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [pageSize, setPageSize] = useState<PageSizeOption>('20');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [ledger, setLedger] = useState<LedgerView>(emptyLedger);
  const [pendingDemoRequest] = useState<OrderInput | null>(() => (environment === 'demo' ? readPendingDemoOrder() : null));
  const history = environment === 'history';
  const liveReconciliation = environment === 'kis' ? realtime?.reconciledAt : undefined;
  const searchField = useRef<HTMLInputElement>(null);
  const cancelling = useRef(false);

  useEffect(() => {
    setPage(1);
  }, [query, filter, sideFilter, sourceFilter, pageSize]);

  useEffect(() => {
    if (environment === 'demo') return;
    const controller = new AbortController(); let active = true;
    setLedger(old => ({ ...old, phase: 'loading' }));
    void (async () => {
      try {
        const response = await fetch(history ? '/api/kis/history' : '/api/kis/ledger', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (!response.ok) throw new Error('ledger');
        const data = await response.json();
        const result = history ? orderHistorySchema.parse(data) : { ...paperLedgerSchema.parse(data), unavailable: [], sourceCount: 1 };
        if (active) {
          setLedger({
            orders: result.orders,
            minimumRun: result.minimumRun,
            unavailable: result.unavailable,
            sourceCount: result.sourceCount,
            phase: 'ready',
            readAt: new Date().toISOString(),
          });
        }
      } catch { if (active) setLedger(old => ({ ...old, phase: 'error' })); }
    })();
    return () => { active = false; controller.abort(); };
  }, [environment, history, reload, liveReconciliation]);

  function clearConditions() {
    setQuery('');
    setSideFilter('all');
    setSourceFilter('all');
    setPage(1);
    if (filter !== 'all') setFilter('all');
    searchField.current?.focus();
  }

  async function cancel(id: string) {
    if (cancelling.current || busy || !available) return;
    cancelling.current = true;
    try { await act('orders/cancel', { id }); } catch {} finally { cancelling.current = false; }
  }

  const needle = query.trim().toLowerCase();
  const nameOf = (code: string) => state.instruments.find(s => s.code === code)?.name ?? code;
  const matches = (code: string) => `${code} ${nameOf(code)}`.toLowerCase().includes(needle);
  const identifierMatch = (o: LedgerOrder) => Boolean(needle && [o.requestId, o.brokerId].some(id => id?.toLowerCase().includes(needle)));
  const dateDigits = /^\d{4}[-./]?\d{2}[-./]?\d{2}$/.test(needle) ? needle.replace(/\D/g, '') : '';
  const rows = state.orders.filter(o =>
    (filter === 'all' || o.status === filter) &&
    (sideFilter === 'all' || o.side === sideFilter) &&
    (sourceFilter === 'all' || (sourceFilter === 'manual' ? o.source === 'manual' : o.source !== 'manual')) &&
    matches(o.code),
  );
  const paperRows = ledger.orders?.filter(o =>
    (filter === 'all' || o.status === filter) &&
    (sideFilter === 'all' || o.side === sideFilter) &&
    (sourceFilter === 'all' || (sourceFilter === 'manual' ? !o.strategy : Boolean(o.strategy))) &&
    (matches(o.code) || (history && (o.tradeDate === dateDigits || identifierMatch(o)))),
  ) ?? [];
  const urgentRealtime = realtime?.phase === 'error' || realtime?.phase === 'disconnected' ||
    Boolean(realtime?.required && !realtime.ordersAllowed);
  const filtered = Boolean(needle || filter !== 'all' || sideFilter !== 'all' || sourceFilter !== 'all');
  const clearButton = <button type="button" className="text-link" onClick={clearConditions}>조건 지우기</button>;
  const demo = environment === 'demo';
  const resultCount = demo ? rows.length : paperRows.length;
  const total = demo ? state.orders.length : ledger.orders?.length;
  const hasSnapshot = demo ? available || Boolean(status.lastSuccessAt) : ledger.orders !== null;
  const showControls = history || Boolean(total) || (hasSnapshot && filtered);
  const numericPageSize = pageSize === 'all' ? Number.POSITIVE_INFINITY : Number(pageSize);
  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(resultCount / numericPageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = pageSize === 'all' ? 0 : (currentPage - 1) * numericPageSize;
  const pagedRows = pageSize === 'all' || resultCount <= numericPageSize
    ? rows
    : rows.slice(startIndex, startIndex + numericPageSize);
  const pagedPaperRows = pageSize === 'all' || resultCount <= numericPageSize
    ? paperRows
    : paperRows.slice(startIndex, startIndex + numericPageSize);
  const rangeStart = resultCount === 0 ? 0 : startIndex + 1;
  const rangeEnd = pageSize === 'all' ? resultCount : Math.min(resultCount, startIndex + numericPageSize);

  const pendingOrders = state.orders.filter(o => o.status === 'pending');
  const filledOrders = state.orders.filter(o => o.status === 'filled');
  const pricedFilledOrders = filledOrders.filter(
    (o): o is typeof o & { filledPrice: number } => typeof o.filledPrice === 'number',
  );
  const unpricedFilledCount = filledOrders.length - pricedFilledOrders.length;
  const pending = pendingOrders.length;
  const filled = filledOrders.length;
  const cancelled = state.orders.filter(o => o.status === 'cancelled').length;
  const demoBuyCount = state.orders.filter(o => o.side === 'buy').length;
  const demoSellCount = state.orders.length - demoBuyCount;
  const demoManualCount = state.orders.filter(o => o.source === 'manual').length;
  const demoStrategyCount = state.orders.length - demoManualCount;
  const pendingBuyReserved = pendingOrders
    .filter(o => o.side === 'buy')
    .reduce((sum, o) => sum + o.qty * o.price + calcDemoFee(o.qty * o.price), 0);
  const pendingSellQty = pendingOrders
    .filter(o => o.side === 'sell')
    .reduce((sum, o) => sum + o.qty, 0);
  const filledBuyAmt = pricedFilledOrders
    .filter(o => o.side === 'buy')
    .reduce((sum, o) => sum + o.qty * o.filledPrice, 0);
  const filledSellAmt = pricedFilledOrders
    .filter(o => o.side === 'sell')
    .reduce((sum, o) => sum + o.qty * o.filledPrice, 0);
  const totalDemoFees = state.orders.reduce((sum, o) => sum + o.fee, 0);
  const totalDemoImprovement = Math.round(pricedFilledOrders.reduce((sum, o) => {
    const unitDiff = o.side === 'buy' ? o.price - o.filledPrice : o.filledPrice - o.price;
    return sum + unitDiff * o.qty;
  }, 0));
  const improvementText = totalDemoImprovement > 0
    ? `유리 차액 +${won(totalDemoImprovement)}원`
    : totalDemoImprovement < 0
      ? `불리 차액 -${won(Math.abs(totalDemoImprovement))}원`
      : '차액 0원';
  const currentDailyLoss = Math.max(0, state.startingEquity - equity(state));
  const demoDailyLossRemaining = Math.max(0, state.risk.dailyLoss - currentDailyLoss);
  const lossLimitHit = currentDailyLoss >= state.risk.dailyLoss;
  const activeDemoStrategies = state.strategies.filter(s => s.active && (s.environment ?? 'demo') === 'demo').length;

  const kisOrders = ledger.orders ?? [];
  const kisBuy = kisOrders.filter(o => o.side === 'buy').length;
  const kisSell = kisOrders.length - kisBuy;
  const kisAccepted = kisOrders.filter(o => o.status === 'accepted').length;
  const kisPartial = kisOrders.filter(o => o.status === 'partial').length;
  const kisOpen = kisAccepted + kisPartial;
  const kisFilled = kisOrders.filter(o => o.status === 'filled').length;
  const kisClosed = kisOrders.filter(o => o.status === 'cancelled' || o.status === 'rejected').length;
  const kisUnknown = kisOrders.filter(o => o.status === 'unknown').length;
  const kisSending = kisOrders.filter(o => o.status === 'sending').length;
  const kisTotalQty = kisOrders.reduce((sum, o) => sum + o.qty, 0);
  const kisFilledQty = kisOrders.reduce((sum, o) => sum + o.filled, 0);
  const kisRemQty = kisOrders.reduce((sum, o) => sum + o.remaining, 0);
  const kisFillPct = kisTotalQty > 0 ? Math.round((kisFilledQty / kisTotalQty) * 100) : 0;
  const kisMatched = kisOrders.filter(o => Boolean(o.lastMatchedAt)).length;
  const kisUnmatched = kisOrders.length - kisMatched;
  const latestMatchedAt = kisOrders.reduce<string | null>((latest, o) => {
    if (!o.lastMatchedAt) return latest;
    return !latest || Date.parse(o.lastMatchedAt) > Date.parse(latest) ? o.lastMatchedAt : latest;
  }, null);
  const kisStrategy = kisOrders.filter(o => Boolean(o.strategy)).length;
  const kisManual = kisOrders.length - kisStrategy;
  const kisMarket = kisOrders.filter(o => o.orderType === 'market').length;
  const kisLimit = kisOrders.length - kisMarket;
  const kisCapped = kisOrders.filter(o => o.priceCeiling !== undefined).length;
  const sortedHistoryDates = [...new Set(kisOrders.map(o => o.tradeDate).filter(d => /^\d{8}$/.test(d)))].sort();
  const historyDateRangeText = sortedHistoryDates.length === 0
    ? '기록 없음'
    : sortedHistoryDates.length === 1
      ? `${formatTradeDate(sortedHistoryDates[0])} (1거래일)`
      : `${formatTradeDate(sortedHistoryDates[0])} ~ ${formatTradeDate(sortedHistoryDates[sortedHistoryDates.length - 1])} (${sortedHistoryDates.length}거래일)`;
  const distinctArchiveSources = new Set(kisOrders.map(o => o.sourceId ?? o.sourceLabel ?? 'default')).size;

  const subToolbar = showControls && (Boolean(total) || filtered) && (
    <div className="orders-sub-toolbar" role="region" aria-label="주문 세부 필터 및 표시 제어">
      <div className="orders-sub-filters">
        <div className="orders-chip-group" role="group" aria-label="매매 방향 필터">
          {([['all', '전체'], ['buy', '매수'], ['sell', '매도']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`orders-chip${sideFilter === id ? ' active' : ''}`}
              aria-pressed={sideFilter === id}
              onClick={() => setSideFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="orders-chip-group" role="group" aria-label="주문 출처 필터">
          {([['all', '전체'], ['manual', '수동 주문'], ['strategy', '전략 주문']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`orders-chip${sourceFilter === id ? ' active' : ''}`}
              aria-pressed={sourceFilter === id}
              onClick={() => setSourceFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {resultCount > 20 && (
        <div className="orders-pagination">
          <span className="orders-page-range">{rangeStart}–{rangeEnd} / 총 {resultCount}건</span>
          <div className="orders-page-actions">
            <button
              type="button"
              className="button secondary small-button"
              disabled={pageSize === 'all' || currentPage <= 1}
              onClick={() => setPage(Math.max(1, currentPage - 1))}
            >
              이전 페이지
            </button>
            <button
              type="button"
              className="button secondary small-button"
              disabled={pageSize === 'all' || currentPage >= totalPages}
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            >
              다음 페이지
            </button>
            <select
              aria-label="페이지당 표시 건수"
              value={pageSize}
              onChange={e => setPageSize(e.target.value as PageSizeOption)}
            >
              <option value="20">20건씩</option>
              <option value="50">50건씩</option>
              <option value="all">전체 보기</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );

  const noMatch = <Empty title="검색 조건에 맞는 주문이 없습니다">{clearButton}</Empty>;
  return <>
    {environment === 'kis' && urgentRealtime && <RealtimeStatus />}
    <Panel
      className={history ? 'history-panel' : 'current-orders'}
      title={demo ? 'DEMO 주문 내역' : history ? '지난 주문' : '현재 KIS 저장 원장'}
      action={
        <div className="orders-panel-actions">
          {!demo && (
            <button
              type="button"
              className="button secondary small-button"
              disabled={ledger.phase === 'loading'}
              onClick={() => setReload(value => value + 1)}
            >
              원장 다시 읽기
            </button>
          )}
          <button
            ref={helpToggleRef}
            type="button"
            className={`button small-button ${helpOpen ? 'primary' : 'secondary'} orders-help-toggle`}
            aria-expanded={helpOpen}
            aria-controls={helpOpen ? helpPanelId : undefined}
            onClick={onToggleHelp}
          >
            <BookOpen size={14} aria-hidden="true" />
            사용방법 도움말
          </button>
        </div>
      }
    >
      {helpOpen && <OrdersHelpPanel panelId={helpPanelId} onClose={onCloseHelp} />}
      {demo && status.phase === 'loading' && <p role="status">DEMO 주문 확인 중…</p>}
      {demo && !available && status.phase !== 'loading' && <p role="status" className="notice warning">{status.lastSuccessAt ? '이전에 확인한 DEMO 주문입니다. 최신 주문 상태를 확인할 수 없습니다.' : 'DEMO 주문 내역 미확인 · 로컬 상태를 확인해야 합니다.'}</p>}
      {demo && (available || status.lastSuccessAt) && <p className="order-counts">로컬 DEMO · 전체 {state.orders.length}건 · 미체결 {pending}건 · 체결 {filled}건</p>}
      {environment === 'kis' && <p className="order-scope">읽기 전용 · 로컬 읽기 성공은 최신 KIS 상태 확인이 아닙니다.</p>}
      {showControls && <div className="history-controls">
        <label className="field">{history ? '지난 주문 검색' : '주문 종목 검색'}<input ref={searchField} type="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder={history ? '종목·코드·주문일·번호' : '종목명 또는 코드'} /></label>
        <label className="field">상태 필터<select value={filter} onChange={e => setFilter(e.target.value)}>
          {filters.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      </div>}
      {filtered && Boolean(total) && <p className="order-counts" role="status">검색 결과 {resultCount}건 / 전체 {total}건{resultCount > 0 && <> · {clearButton}</>}</p>}
      {!demo && <>
        {ledger.phase === 'loading' && <p role="status">로컬 원장 읽는 중…</p>}
        {ledger.phase === 'error' && <p role="alert">원장을 읽지 못했습니다. 연결을 확인하고 다시 읽으세요.</p>}
        {ledger.unavailable.length > 0 && <p role="alert">일부 원장을 읽지 못했습니다 · {ledger.unavailable.join(', ')}</p>}
        {ledger.phase !== 'ready' && ledger.orders !== null && <p className="notice warning">{ledger.orders.length ? '이전에 읽은 원장' : '이전에 읽은 범위는 0건입니다. 현재 건수는 미확인입니다.'}</p>}
      </>}
      {demo && <>
        {rows.length ? <CurrentOrderTable demo>{pagedRows.map(o => <tr role="row" key={o.id}>
          <td role="cell" className="order-symbol"><Link className="stock-name" to={`/trade?mode=demo&code=${o.code}`}>{nameOf(o.code)}</Link>
            <small>{o.code} · {o.side === 'buy' ? '매수' : '매도'} · 지정가 {won(o.price)}원</small></td>
          <td role="cell" className="order-status"><Badge tone={o.status === 'filled' ? 'teal' : 'neutral'}>{orderStatus[o.status]}</Badge></td>
          <td role="cell" className="order-quantity">{o.qty} / {o.status === 'filled' ? o.qty : 0} / {o.status === 'pending' ? o.qty : 0}주</td>
          <td role="cell" className="order-observation">{o.status === 'filled' && typeof o.filledPrice === 'number' ? `${won(o.filledPrice)}원` : '—'}</td>
          <td role="cell" className="order-management">{o.status === 'pending'
            ? <button className="button small secondary" disabled={busy || !available} onClick={() => void cancel(o.id)}>취소</button>
            : <span className="muted">취소 불가</span>}</td>
          <td role="cell" className="order-detail"><details><summary aria-label={`${nameOf(o.code)} DEMO 주문 상세`}>주문 상세</summary>
            <dl>
              <dt>주문 ID</dt><dd>{o.id}</dd>
              <dt>접수 (KST)</dt><dd>{localTime(o.createdAt)}</dd>
              {o.filledAt && <><dt>체결 (KST)</dt><dd>{localTime(o.filledAt)}</dd></>}
              <dt>수수료</dt><dd>{won(o.fee)}원</dd>
              <dt>출처</dt><dd>{o.source === 'manual' ? '수동 주문' : state.strategies.find(s => s.id === o.source)?.name ?? '전략'}</dd>
              <dt>앱 요청 ID</dt><dd>{o.requestId}</dd>
              <dt>주문 금액</dt><dd>{won(o.qty * o.price)}원</dd>
              {o.status === 'filled' && typeof o.filledPrice === 'number' && (() => {
                const filledPrice = o.filledPrice;
                const unitDiff = o.side === 'buy' ? o.price - filledPrice : filledPrice - o.price;
                const diff = Math.round(unitDiff * o.qty);
                const unitLabel = Math.abs(unitDiff).toLocaleString('ko-KR', { maximumFractionDigits: 20 });
                const diffText = diff > 0
                  ? `+${won(diff)}원 유리 (주당 ${unitLabel}원)`
                  : diff < 0
                    ? `-${won(Math.abs(diff))}원 불리 (주당 ${unitLabel}원)`
                    : '지정가 일치 (0원)';
                return <>
                  <dt>체결 금액</dt><dd>{won(o.qty * filledPrice)}원</dd>
                  <dt>지정가 대비 체결 차액</dt><dd>{diffText}</dd>
                </>;
              })()}
            </dl>
          </details></td>
        </tr>)}</CurrentOrderTable> : state.orders.length && filtered ? noMatch : available && <Empty title="아직 주문이 없습니다"><Link to="/trade?mode=demo">DEMO 연습</Link>에서 DEMO 주문을 확인하세요.</Empty>}
        {subToolbar}
        <div className="order-playback"><span>미체결 취소는 DEMO 예약을 해제합니다. 다음 봉을 재생하면 체결 조건을 평가합니다.</span>
          <button disabled={busy || !available} className="button secondary" onClick={() => void act('tick').catch(() => {})}>다음 데모 봉 재생</button></div>
        {pendingDemoRequest && (() => {
          const matchedPendingOrder = state.orders.find(o => o.requestId === pendingDemoRequest.requestId);
          const exactPendingMatch = Boolean(
            matchedPendingOrder &&
            matchedPendingOrder.code === pendingDemoRequest.code &&
            matchedPendingOrder.side === pendingDemoRequest.side &&
            matchedPendingOrder.qty === pendingDemoRequest.qty &&
            matchedPendingOrder.price === pendingDemoRequest.price,
          );
          const reconcileText = matchedPendingOrder
            ? exactPendingMatch
              ? `원장 접수 확인됨 · 상태: ${orderStatus[matchedPendingOrder.status]}`
              : `요청 ID 충돌 (주문 조건 불일치) · 원장: ${matchedPendingOrder.code} ${matchedPendingOrder.side === 'buy' ? '매수' : '매도'} ${matchedPendingOrder.qty}주 × ${won(matchedPendingOrder.price)}원`
            : available
              ? '원장 미접수 확인 · 트레이딩 화면에서 재시도 가능'
              : '로컬 상태 연결 후 원장 대조 가능';
          return (
            <section className="orders-pending-reconcile" role="region" aria-label="보존된 DEMO 요청 원장 대조">
              <div className="orders-pending-head">
                <h3>보존된 DEMO 요청 원장 대조</h3>
                <Badge tone={exactPendingMatch ? 'teal' : 'amber'}>
                  {matchedPendingOrder ? (exactPendingMatch ? '원장 일치' : '조건 불일치') : available ? '미접수' : '대조 대기'}
                </Badge>
              </div>
              <p className="orders-pending-meta">
                {pendingDemoRequest.code} · {pendingDemoRequest.side === 'buy' ? '매수' : '매도'} · {pendingDemoRequest.qty}주 × {won(pendingDemoRequest.price)}원 · 요청 ID <code>{pendingDemoRequest.requestId}</code>
              </p>
              <div className="orders-pending-foot">
                <p role="status">{reconcileText}</p>
                <Link className="text-link" to={`/trade?mode=demo&code=${encodeURIComponent(pendingDemoRequest.code)}`}>
                  DEMO 연습 주문 화면으로 이동
                </Link>
              </div>
            </section>
          );
        })()}
        {(available || Boolean(status.lastSuccessAt)) && (
          <section className="orders-hub" role="region" aria-label="주문·체결 분석 및 원장 진단 허브">
            <div className="orders-hub-grid">
              <article className="orders-hub-card">
                <h3>DEMO 주문 구성 요약</h3>
                <dl className="orders-hub-list">
                  <div><dt>총 주문 · 현재 일치</dt><dd>총 주문 {state.orders.length}건 · 현재 일치 {rows.length}건</dd></div>
                  <div><dt>상태별 분포</dt><dd>미체결 {pending}건 · 체결 {filled}건 · 취소 {cancelled}건</dd></div>
                  <div><dt>매매 방향별</dt><dd>매수 {demoBuyCount}건 · 매도 {demoSellCount}건</dd></div>
                  <div><dt>주문 출처별</dt><dd>수동 {demoManualCount}건 · 전략 {demoStrategyCount}건</dd></div>
                </dl>
              </article>
              <article className="orders-hub-card">
                <h3>DEMO 예약 및 체결 자금 분석</h3>
                <dl className="orders-hub-list">
                  <div><dt>미체결 매수 예약 잠금 현금</dt><dd>{won(pendingBuyReserved)}원 · 예약 제외 가용 현금 {won(Math.max(0, state.cash - pendingBuyReserved))}원</dd></div>
                  <div><dt>미체결 매도 예약 잠금 수량</dt><dd>{pendingSellQty.toLocaleString('ko-KR')}주</dd></div>
                  <div><dt>누적 체결 총액</dt><dd>매수 체결 {won(filledBuyAmt)}원 · 매도 체결 {won(filledSellAmt)}원{unpricedFilledCount > 0 ? ` (체결가 미확인 ${unpricedFilledCount}건 제외)` : ''}</dd></div>
                  <div><dt>누적 수수료 및 단가 개선</dt><dd>누적 수수료 {won(totalDemoFees)}원 · 지정가 대비 {improvementText}</dd></div>
                </dl>
              </article>
              <article className="orders-hub-card">
                <h3>DEMO 위험 한도 및 연계 화면</h3>
                <dl className="orders-hub-list">
                  <div><dt>신규 주문 제어</dt><dd>{!available
                    ? '로컬 상태 미확인 (차단)'
                    : state.risk.halted
                      ? '긴급정지 켜짐 (차단)'
                      : lossLimitHit
                        ? '일일 손실 한도 도달 (차단)'
                        : '정상 (주문 가능)'}</dd></div>
                  <div><dt>공통 한도</dt><dd>1회 {won(state.risk.maxOrder)}원 · 종목별 {won(state.risk.maxPosition)}원</dd></div>
                  <div><dt>일일 손실 한도 여유액</dt><dd>{won(demoDailyLossRemaining)}원 / {won(state.risk.dailyLoss)}원</dd></div>
                  <div><dt>데모 봉 · 전략</dt><dd>봉 #{state.tick} · 활성 DEMO 전략 {activeDemoStrategies}개</dd></div>
                </dl>
                <div className="orders-hub-links">
                  <Link className="text-link" to="/trade?mode=demo">DEMO 연습 주문</Link>
                  <Link className="text-link" to="/portfolio">포트폴리오</Link>
                  <Link className="text-link" to="/strategies">자동매매 전략</Link>
                  <Link className="text-link" to="/risk">위험관리</Link>
                </div>
              </article>
            </div>
          </section>
        )}
      </>}
      {!demo && <>
        {paperRows.length && history ? <ul className="history-list" aria-label="지난 주문 목록">
          {pagedPaperRows.map(o => <HistoryOrder key={JSON.stringify([o.sourceId, o.requestId])} order={o} name={nameOf(o.code)}
            reveal={identifierMatch(o) && !matches(o.code) && o.tradeDate !== dateDigits} />)}
        </ul> : paperRows.length ? <CurrentOrderTable demo={false}>{pagedPaperRows.map(o => <tr role="row" key={o.requestId}>
          <td role="cell" className="order-symbol"><strong>{nameOf(o.code)}</strong>
            <small>
              {o.code} · {o.side === 'buy' ? '매수' : '매도'} · {o.orderType === 'market' ? '시장가' : `지정가 ${won(o.price)}원`}
              {o.priceCeiling !== undefined ? ` · 상한 캡 ${won(o.priceCeiling)}원` : ''}
              {o.strategy ? ` · 전략 ${o.strategy.id}` : ''}
            </small></td>
          <td role="cell" className="order-status"><Badge tone={['partial','unknown','rejected'].includes(o.status) ? 'amber' : o.status === 'filled' ? 'teal' : 'neutral'}>{paperStatus[o.status]}</Badge></td>
          <td role="cell" className="order-quantity">{o.qty} / {o.filled} / {o.remaining}주</td>
          <td role="cell" className="order-observation">{o.lastMatchedAt ? <time dateTime={o.lastMatchedAt}>{localTime(o.lastMatchedAt)}</time> : <strong className="history-unknown">미확인</strong>}</td>
          <td role="cell" className="order-management"><Link to={`/paper?code=${o.code}`}>KIS 원장·복구 화면</Link></td>
          <td role="cell" className="order-detail"><details><summary aria-label={`${nameOf(o.code)} KIS 주문 상세`}>주문 상세</summary>
            <dl>
              <dt>주문일</dt><dd>{o.tradeDate}</dd>
              <dt>요청 생성 (KST)</dt><dd>{localTime(o.createdAt)}</dd>
              <dt>앱 요청 ID</dt><dd>{o.requestId}</dd>
              <dt>증권사 주문번호</dt><dd>{o.brokerId ?? '미확인'}</dd>
              {o.priceCeiling !== undefined && <><dt>상한 지정가 캡</dt><dd>{won(o.priceCeiling)}원</dd></>}
              {o.orderType !== 'market' && o.price > 0 && <><dt>주문 기준 금액</dt><dd>{won(o.qty * o.price)}원</dd></>}
              <dt>체결 진행률</dt><dd>{o.qty > 0 ? Math.round((o.filled / o.qty) * 100) : 0}% ({o.filled}/{o.qty}주 체결 · 잔량 {o.remaining}주)</dd>
              <dt>주문 출처</dt><dd>{o.strategy
                ? `전략 ${o.strategy.id} (rev.${o.strategy.revision} · ${o.strategy.signal === 'buy' ? '매수' : '매도'} 신호${o.strategy.signalBarDate ? ` · 기준일 ${o.strategy.signalBarDate}` : ''})`
                : '수동·일반 모의 주문'}</dd>
            </dl>
          </details></td>
        </tr>)}</CurrentOrderTable> : ledger.orders?.length && filtered ? noMatch : ledger.phase === 'ready' && (
          <Empty title={history ? ledger.unavailable.length ? '읽을 수 있는 과거 주문이 없습니다' : '등록된 지난 실행에 저장된 주문이 없습니다' : '저장된 KIS 주문이 없습니다'}>
            {history ? '이 PC에 연결한 실행 원장 범위입니다.' : <>현재 실행 원장 범위입니다. <button className="text-link" onClick={showHistory}>지난 실행 기록 보기</button></>}
          </Empty>)}
        {subToolbar}
        {!history && ledger.readAt && <p className="order-read-at" role="status">{ledger.phase === 'ready' ? '로컬 원장 읽기 완료' : '마지막 로컬 읽기'} (KST) · {localTime(ledger.readAt)}</p>}
        <details className="history-info"><summary>원장 정보{history && ledger.readAt && ` · 읽은 실행 원장 ${ledger.sourceCount}개`}</summary>
          <p>{history ? '지난 실행은 읽기 전용입니다.' : '현재 실행의 주문 대조와 복구는 KIS 모의 매매에서 진행합니다.'} 주문별 KIS 확인은 원주문과 증권사 응답이 일치한 마지막 저장 시각입니다.</p>
          {history && ledger.readAt && <p>마지막 로컬 읽기 (KST) · {localTime(ledger.readAt)}</p>}
          <p>평균 체결가·수수료는 현재 원장에 미제공</p>
        </details>
        {environment === 'kis' && ledger.orders !== null && (
          <section className="orders-hub" role="region" aria-label="주문·체결 분석 및 원장 진단 허브">
            <div className="orders-hub-grid">
              <article className="orders-hub-card">
                <h3>KIS 저장 원장 체결 요약</h3>
                <dl className="orders-hub-list">
                  <div><dt>원장 총계</dt><dd>총 주문 {kisOrders.length}건 · 매수 {kisBuy}건 · 매도 {kisSell}건</dd></div>
                  <div><dt>진행 상태</dt><dd>열린 주문(미체결·부분) {kisOpen}건 · 체결 {kisFilled}건 · 취소·거부 {kisClosed}건</dd></div>
                  <div><dt>대조 필요</dt><dd>불명 {kisUnknown}건 · 전송 중 {kisSending}건</dd></div>
                  <div><dt>누적 수량 · 체결률</dt><dd>주문 {kisTotalQty}주 / 체결 {kisFilledQty}주 / 잔량 {kisRemQty}주 ({kisFillPct}%)</dd></div>
                </dl>
              </article>
              <article className="orders-hub-card">
                <h3>KIS 대조 및 실행 계약 진단</h3>
                <dl className="orders-hub-list">
                  <div><dt>주문별 KIS 확인</dt><dd>확인 완료 {kisMatched}건 / 미확인 {kisUnmatched}건</dd></div>
                  <div><dt>최근 주문별 KIS 확인 시각</dt><dd>{latestMatchedAt ? localTime(latestMatchedAt) : '확인 기록 없음'}</dd></div>
                  <div><dt>위험 스냅샷 미결 상태</dt><dd>{!available || !paperRisk ? '불명·전송 중 미확인' : `불명·전송 중 ${paperRisk.unresolvedCount}건`}</dd></div>
                  <div><dt>다음 한정 실행 계약</dt><dd>{ledger.minimumRun === undefined
                    ? '미확인'
                    : ledger.minimumRun.active
                      ? `활성 (${ledger.minimumRun.code ?? '종목 미지정'} · 상한 ${ledger.minimumRun.maxQty}주)`
                      : '비활성'}</dd></div>
                </dl>
              </article>
              <article className="orders-hub-card">
                <h3>KIS 모의 운영 및 복구 허브</h3>
                <dl className="orders-hub-list">
                  <div><dt>계좌 · 긴급정지</dt><dd>KIS 계좌 {phaseLabels[connection.status.phase]} · {!available ? '긴급정지 미확인' : state.risk.halted ? '긴급정지 켜짐' : '긴급정지 꺼짐'}</dd></div>
                  <div><dt>수동 주문 수량 상한</dt><dd>{available ? `1회 최대 ${state.paperManualMaxQty ?? DEFAULT_PAPER_MAX_QTY}주` : '미확인'}</dd></div>
                  <div><dt>출처 분포</dt><dd>수동·일반 {kisManual}건 · 전략 자동 {kisStrategy}건</dd></div>
                </dl>
                <div className="orders-hub-links">
                  <Link className="text-link" to="/paper">KIS 모의 매매·복구 이동</Link>
                  <Link className="text-link" to="/settings/trading">매매 설정</Link>
                  <Link className="text-link" to="/settings">연결·설정</Link>
                  <Link className="text-link" to="/alerts">알림·이벤트</Link>
                </div>
              </article>
            </div>
          </section>
        )}
        {history && ledger.orders !== null && (
          <section className="orders-hub" role="region" aria-label="주문·체결 분석 및 원장 진단 허브">
            <div className="orders-hub-grid">
              <article className="orders-hub-card">
                <h3>지난 실행 아카이브 요약</h3>
                <dl className="orders-hub-list">
                  <div><dt>연결된 실행 원장</dt><dd>읽은 원장 {ledger.sourceCount}개{ledger.unavailable.length ? ` · 읽기 실패 ${ledger.unavailable.length}개` : ' · 전체 정상'}</dd></div>
                  <div><dt>보존 주문 총계</dt><dd>총 주문 {kisOrders.length}건 · 매수 {kisBuy}건 · 매도 {kisSell}건</dd></div>
                  <div><dt>종결 분포</dt><dd>전량 체결 {kisFilled}건 · 부분체결 {kisPartial}건 · 취소·거부 {kisClosed}건 · 불명·미체결 {kisUnknown + kisAccepted + kisSending}건</dd></div>
                  <div><dt>누적 체결 수량</dt><dd>주문 {kisTotalQty}주 중 체결 {kisFilledQty}주 ({kisFillPct}%)</dd></div>
                </dl>
              </article>
              <article className="orders-hub-card">
                <h3>아카이브 거래일 및 유형 분석</h3>
                <dl className="orders-hub-list">
                  <div><dt>기록된 거래일 범위</dt><dd>{historyDateRangeText}</dd></div>
                  <div><dt>KIS 확인 시각 보존</dt><dd>확인 시각 보존 {kisMatched}건 / 미확인 {kisUnmatched}건</dd></div>
                  <div><dt>주문 유형 분포</dt><dd>지정가 {kisLimit}건 (상한 캡 {kisCapped}건) · 시장가 {kisMarket}건</dd></div>
                  <div><dt>아카이브 출처 분포</dt><dd>{distinctArchiveSources}개 실행 세션 아카이브</dd></div>
                </dl>
              </article>
              <article className="orders-hub-card">
                <h3>아카이브 감사 및 연계 화면</h3>
                <dl className="orders-hub-list">
                  <div><dt>식별자 검색 안내</dt><dd>앱 요청 ID·증권사 주문번호 검색 시 해당 주문 상세 자동 펼침</dd></div>
                  <div><dt>거래일 검색 안내</dt><dd>YYYY-MM-DD 또는 YYYYMMDD 입력으로 거래일 필터링</dd></div>
                </dl>
                <div className="orders-hub-links">
                  <Link className="text-link" to="/paper">KIS 모의 매매·복구 이동</Link>
                  <Link className="text-link" to="/settings/trading">매매 설정</Link>
                  <Link className="text-link" to="/journal">매매일지</Link>
                </div>
              </article>
            </div>
          </section>
        )}
      </>}
    </Panel>
    {environment === 'kis' && !urgentRealtime && <RealtimeStatus />}
  </>;
}

function CurrentOrderTable({ demo, children }: { demo: boolean; children: React.ReactNode }) {
  const headers = ['종목 / 주문', '상태', '주문 / 체결 / 잔량', demo ? '평균 체결가' : '주문별 KIS 확인 (KST)', '관리', '상세'];
  return <div className={`current-order-table ${demo ? 'demo-orders' : 'kis-orders'}`}>
    <table role="table" aria-label={demo ? 'DEMO 주문 목록' : '현재 KIS 주문 목록'}>
      <thead role="rowgroup"><tr role="row">{headers.map(label => <th key={label} role="columnheader" scope="col">{label}</th>)}</tr></thead>
      <tbody role="rowgroup">{children}</tbody>
    </table>
  </div>;
}
