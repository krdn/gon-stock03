import './paper.css';
import { PaperCancellationPanel } from '../components/PaperCancellation';
import { RealtimeStatus } from '../components/RealtimeStatus';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { RefreshCw, ShieldCheck, X } from 'lucide-react';
import { DEFAULT_PAPER_MAX_QTY, configuredPaperOrderInput, samePaperIntent, paperLedgerSchema, paperCancellationSchema, type PaperCancellation, type PaperOrderInput } from '../../shared/contracts';
import { useWorkbench } from '../context';
import { Badge, Change, Chart, DataStatusLine, Empty, Panel, Stat } from '../components/ui';
import { emptyStatus, freshness, QUOTE_REFRESH_MS } from '../../shared/status';
import { won, type KisQuote, type KisBar, type PaperOrder, type BrokerOrder } from '../../shared/model';

const pendingKey = 'kis-paper-pending';
type Recovery = { order: PaperOrder; evidenceId: string; evidence: { observedAt: string; tradeDate: string }; candidates: BrokerOrder[] };
const statusLabel: Record<PaperOrder['status'], string> = { sending: '전송 중', accepted: '접수', unknown: '응답 불명', rejected: '거부', partial: '부분체결', filled: '체결', cancelled: '취소' };
type SettingsInput = { code: string; side: 'buy' | 'sell'; qty: string; price: string };
const inputPrefix = 'paper-settings-input:';

function readSettingsInput(returnKey: unknown, requestedCode: string | null) {
  try {
    const local = window.history.state?.paperSettingsInput;
    const entry = local?.href === window.location.href ? local : null;
    const key = entry?.key ?? returnKey;
    if (typeof key !== 'string') return null;
    const snapshot = JSON.parse(sessionStorage.getItem(inputPrefix + key) ?? 'null');
    if (!snapshot || (!entry && snapshot.code !== requestedCode)) return null;
    const input = entry?.input ?? snapshot;
    if (typeof input.code !== 'string' || !['buy', 'sell'].includes(input.side) ||
        typeof input.qty !== 'string' || typeof input.price !== 'string') return null;
    return { key, input: input as SettingsInput };
  } catch { return null; }
}

function rememberEntry(locationKey: string, key: string, input: SettingsInput) {
  if ((window.history.state?.key ?? 'default') !== locationKey) return;
  window.history.replaceState({ ...window.history.state, paperSettingsInput: { key, href: window.location.href, input } }, '');
}

export function Paper() {
  const location = useLocation();
  return <PaperForm key={location.key} />;
}

function PaperForm() {
  const { state, act, busy, available, connection, realtime } = useWorkbench();
  const [params] = useSearchParams();
  const location = useLocation();
  const [savedInput] = useState(() => readSettingsInput(location.state?.paperReturn, params.get('code')));
  const restored = savedInput?.input;
  const [formKey, setFormKey] = useState<string | null>(() => crypto.randomUUID());
  const entryKey = useRef(savedInput?.key);
  function rememberInput() {
    if (!formKey) return;
    try {
      const input = { code, side, qty, price };
      sessionStorage.setItem(inputPrefix + formKey, JSON.stringify(input));
      rememberEntry(location.key, formKey, input);
      entryKey.current = formKey;
    } catch { /* Settings navigation also works without draft storage. */ }
  }
  const [code, setCode] = useState(() => restored?.code ?? params.get('code') ?? '005930'), [quote, setQuote] = useState<KisQuote | null>(null), [bars, setBars] = useState<KisBar[]>([]);
  const [ordersCheckedAt, setOrdersCheckedAt] = useState<string | null>(null), [orders, setOrders] = useState<PaperOrder[]>([]), [brokerOrders, setBrokerOrders] = useState<BrokerOrder[]>([]);
  const [side, setSide] = useState<'buy' | 'sell'>(restored?.side ?? 'buy'), [price, setPrice] = useState(restored?.price ?? ''), [qty, setQty] = useState(restored?.qty ?? '1'), [confirmed, setConfirmed] = useState(false), [draft, setDraft] = useState<PaperOrderInput | null>(null);
  useEffect(() => {
    // A field change starts a new editable input after submission.
    setFormKey(current => current ?? crypto.randomUUID());
    // Edits after returning belong to this entry. Other settings links keep their snapshot.
    if (entryKey.current) {
      try { rememberEntry(location.key, entryKey.current, { code, side, qty, price }); } catch { /* Optional navigation memory. */ }
    }
  }, [location.key, code, side, qty, price]);
  const [pending, setPending] = useState<PaperOrderInput | null>(null), [storageError, setStorageError] = useState(false);
  const [recovery, setRecovery] = useState<Recovery | null>(null), [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [cancelInfo, setCancelInfo] = useState<PaperCancellation | null>(null);
  const [approval, setApproval] = useState<Extract<NonNullable<ReturnType<typeof paperLedgerSchema.parse>['minimumRun']>, {active:true}> | null>(null);
  const marketOrder = approval?.orderType === 'market';
  const cappedCurrent = approval?.policy?.priceMode === 'cappedCurrent';
  const pinnedSide = approval?.policy?.side ?? (approval ? 'buy' : undefined);
  const manualLimit = state.paperManualMaxQty ?? DEFAULT_PAPER_MAX_QTY;
  const effectiveLimit = Math.min(manualLimit, approval?.maxQty ?? manualLimit);
  const overLimit = Number(qty) > effectiveLimit;
  const [priceBlocked, setPriceBlocked] = useState(false);
  const [marketState, setMarketState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [ordersState, setOrdersState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const ordersError = ordersState === 'error';
  const submitting = useRef(false), marketVersion = useRef(0), priceEdited = useRef(Boolean(restored?.price));
  useEffect(() => {
    try { const raw = sessionStorage.getItem(pendingKey); if (raw) setPending(configuredPaperOrderInput.parse(JSON.parse(raw))); } catch { setStorageError(true); }
  }, []);
  const [ledger, setLedger] = useState<'loading' | 'ready' | 'error'>('loading');
  async function loadLedger(signal?: AbortSignal) {
    try {
      const response = await fetch('/api/kis/ledger', { signal });
      if (!response.ok) throw new Error('원장 조회 실패');
      const result: { orders: PaperOrder[]; cancellation?: unknown } = await response.json();
      const { minimumRun } = paperLedgerSchema.parse(result);
      if (signal?.aborted) return;
      setApproval(minimumRun?.active ? minimumRun : null);
      if (minimumRun?.active) {
        if (minimumRun.code) setCode(minimumRun.code);
        setSide(minimumRun.policy?.side ?? 'buy');
        if (minimumRun.orderType === 'market') setPrice('0');
        else if (minimumRun.policy?.limitPrice) setPrice(String(minimumRun.policy.limitPrice));
      }
      setOrders(result.orders); setLedger('ready');
      setCancelInfo(paperCancellationSchema.safeParse(result.cancellation).data ?? null);
      const raw = sessionStorage.getItem(pendingKey);
      if (raw) {
        const saved = configuredPaperOrderInput.parse(JSON.parse(raw));
        if (result.orders.some(o => samePaperIntent(o, saved))) {
          sessionStorage.removeItem(pendingKey); setPending(null); setDraft(null); setConfirmed(false);
        }
      }
    } catch { if (!signal?.aborted) setLedger('error'); }
  }
  useEffect(() => {
    if (!available) return;
    const controller = new AbortController(); void loadLedger(controller.signal);
    return () => controller.abort();
  }, [available, realtime?.reconciledAt]);
  const confirmation = pending ?? draft;
  const checkedCode = pending?.code ?? (confirmed ? confirmation?.code : null) ?? code;
  const realtimeBlocked = Boolean(realtime?.required && (!realtime.ordersAllowed || !realtime.fresh || realtime.code !== checkedCode));
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (confirmed) dialog.current?.showModal(); else dialog.current?.close(); }, [confirmed]);
  async function market(e?: React.FormEvent) {
    e?.preventDefault(); const version = ++marketVersion.current; setQuote(null); setBars([]); setMarketState('loading');
    try {
      const result = await act<{ quote: KisQuote; bars: KisBar[] }>('kis/market', { code });
      if (version !== marketVersion.current) return;
      setMarketState('idle'); setQuote(result.quote); setBars(result.bars); if (!priceEdited.current) setPrice(String(marketOrder ? 0 : approval?.policy?.limitPrice ?? result.quote.price));
    } catch { if (version === marketVersion.current) setMarketState('error'); }
  }
  async function refresh() {
    setOrdersState('loading'); setRecoveryMessage('');
    setRecovery(null); setRecoveryConfirmed(false);
    try {
      const result = await act<{ orders: PaperOrder[]; brokerOrders: BrokerOrder[]; cancellation?: unknown }>('kis/orders');
      paperLedgerSchema.parse(result);
      if (!Array.isArray(result.brokerOrders)) throw new Error('당일 주문 목록 미확인');
      setCancelInfo(paperCancellationSchema.safeParse(result.cancellation).data ?? null); setOrdersCheckedAt(new Date().toISOString()); setOrders(result.orders); setLedger('ready'); setBrokerOrders(result.brokerOrders); setOrdersState('idle');
      return result;
    } catch { setCancelInfo(null); setOrdersState('error'); }
  }
  async function submit() {
    const input = pending ?? draft;
    if (!input || submitting.current || !available || busy || storageError || realtimeBlocked) return;
    submitting.current = true;
    const originalKey = entryKey.current;
    let originalSnapshot: string | null = null;
    try {
      try { sessionStorage.setItem(pendingKey, JSON.stringify(input)); } catch { setStorageError(true); return; }
      if (!pending) {
        try {
          if (originalKey) {
            originalSnapshot = sessionStorage.getItem(inputPrefix + originalKey);
            sessionStorage.removeItem(inputPrefix + originalKey);
          }
        } catch { /* Optional input history. */ }
        entryKey.current = undefined;
        setFormKey(null);
      }
      setPending(input); setPriceBlocked(false);
      const result = await act<{ order: PaperOrder }>('kis/order', input);
      paperLedgerSchema.parse({ orders: [result.order] });
      if (result.order.requestId !== input.requestId) throw new Error('요청 ID 불일치');
      setOrders(old => [result.order, ...old.filter(o => o.requestId !== result.order.requestId)]); setConfirmed(false);
      sessionStorage.removeItem(pendingKey); setPending(null); setDraft(null);
      await loadLedger();
    } catch (error) {
      setPriceBlocked(error instanceof Error && error.message.includes('승인 지정가 불일치'));
      if (!pending && error instanceof Error && 'definitive' in error && error.definitive) {
        try { sessionStorage.removeItem(pendingKey); setPending(null); } catch { setStorageError(true); }
        if (originalKey && originalSnapshot) {
          try {
            sessionStorage.setItem(inputPrefix + originalKey, originalSnapshot);
            entryKey.current = originalKey;
          } catch { /* Optional input history. */ }
        }
        setFormKey(current => current ?? formKey ?? crypto.randomUUID());
      }
    }
    finally { submitting.current = false; }
  }
  async function inspect(id: string) {
    setRecovery(null); setRecoveryConfirmed(false);
    setRecoveryMessage('복구 후보 조회 중…');
    try {
      setRecovery(await act<Recovery>('kis/recovery/inspect', { id }));
      setRecoveryMessage('');
    } catch { setRecoveryMessage('복구 후보 조회 실패 · 불명 상태를 유지합니다. 다시 조회하세요.'); }
  }
  async function recover() {
    if (!recovery || !recoveryConfirmed || recovery.candidates.length !== 1 || submitting.current || busy || !available) return;
    submitting.current = true;
    setRecoveryMessage('선택 주문을 대조하고 있습니다.');
    try {
      const candidate = recovery.candidates[0];
      const result = await act<{ order: PaperOrder }>('kis/recovery/confirm', { id: recovery.order.requestId, evidenceId: recovery.evidenceId, brokerId: candidate.brokerId, organization: candidate.organization, confirmed: true });
      paperLedgerSchema.parse({ orders: [result.order] });
      setOrders(old => old.map(o => o.requestId === result.order.requestId ? result.order : o)); setRecovery(null); setRecoveryConfirmed(false);
      setRecoveryMessage(''); ledgerHeading.current?.focus();
    } catch { setRecoveryMessage('연결 결과 미확인 · 원장과 복구 후보를 다시 조회하세요.'); setRecoveryConfirmed(false); } finally { submitting.current = false; }
  }
  useEffect(() => () => { marketVersion.current++; }, []);
  const recoveryButton = useRef<HTMLButtonElement>(null);
  const reconcileButton = useRef<HTMLButtonElement>(null);
  const evidenceHeading = useRef<HTMLHeadingElement>(null);
  const ledgerHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (recovery) evidenceHeading.current?.focus(); }, [recovery]);

  const realtimeSection = useRef<HTMLDivElement>(null);
  const unknown = orders.some(o => o.status === 'sending' || o.status === 'unknown');
  const orderBlocked = overLimit || realtimeBlocked || Boolean(pending) || storageError || !available || busy ||
    !quote || quote.code !== code || quote.stopped || state.risk.halted || unknown || ledger !== 'ready';
  const recoverable = orders.find(o => o.status === 'unknown' && !o.brokerId);
  const realtimeActive = Boolean(realtime?.required || (realtime && realtime.phase !== 'stopped'));
  const cancelReason = !available ? '서버 연결 미확인 · 취소 대상 확인 전입니다.'
    : ledger === 'error' || ordersError ? '원장 또는 당일 대조 실패 · 취소 결과를 다시 조회하세요.' : null;
  return (
    <div className="paper-page">
      {storageError && (
        <div className="notice warning" role="alert">
          요청 보존 저장소를 확인할 수 없어 주문을 차단했습니다. 저장된 요청과 서버 원장을 확인하세요.
        </div>
      )}
      {pending && (
        <div className="notice warning" role="status">
          <div>
            <strong>전송 결과 미확인</strong>
            <p>
              요청 {pending.requestId} · {pending.code} · {pending.qty}주 ×{' '}
              {'orderType' in pending
                ? '시장가'
                : 'priceMode' in pending
                  ? '재조회 현재가 (최대 ' + won(pending.price) + '원)'
                  : won(pending.price) + '원'}
              . 새 주문은 차단하며 자동 재전송하지 않습니다. 같은 요청을 다시 보내면 기존 접수를 반환하거나, 서버에 미접수된 경우
              새로 접수할 수 있습니다.
            </p>
            <button className="button secondary" disabled={!available || busy || storageError} onClick={() => setConfirmed(true)}>
              동일 요청 확인
            </button>
            <button className="button secondary" disabled={!available || busy} onClick={() => void loadLedger()}>
              저장 원장 다시 읽기
            </button>
          </div>
        </div>
      )}
      {!/^\d{6}$/.test(code) && (
        <div className="notice warning" role="status">
          현재 주문 화면은 숫자 6자리 종목만 지원합니다. 코드 {code}는 이 화면에서 조회·주문할 수 없습니다.{' '}
          <Link to="/watchlist">관심종목으로 돌아가기</Link>
        </div>
      )}
      {unknown && ledger === 'ready' && (
        <div className="notice warning paper-unresolved" role="status">
          <div>
            <strong>주문 결과 확인 필요 · 신규 전송 차단</strong>
            <p>
              {recoverable ? '응답 불명 주문을 KIS 앱과 대조하세요.' : '진행 중인 주문의 상태를 계좌·당일 주문에서 대조하세요.'}{' '}
              자동 재전송하지 않습니다.
            </p>
          </div>
          <button
            className="button small secondary"
            disabled={!available || busy}
            onClick={() => (recoverable ? recoveryButton : reconcileButton).current?.focus()}
          >
            {recoverable ? '불명 주문 보기' : '당일 주문 대조로 이동'}
          </button>
        </div>
      )}
      {realtimeActive && <div className="notice compact" role="status">
        <div><strong>KIS 실시간 · {realtimeBlocked ? '현재 주문 차단' : '수신 상태'}</strong><p>{realtime?.message}</p></div>
        <button className="button small secondary" onClick={() => realtimeSection.current?.focus()}>실시간 상태 및 조작 보기</button>
      </div>}
      <p className="paper-environment">
        <ShieldCheck size={17} aria-hidden="true" />
        KIS 모의 계좌 전용 · 조회와 주문은 모의 서버에 전달됩니다.
      </p>
      <div className="paper-entry">
        <Panel title="KIS 종목 조회" action={<Badge>REST · 수동 갱신</Badge>}>
          <form className="button-row market-query" onSubmit={market}>
            <label className="field">
              국내 종목코드 (6자리)
              <input
                aria-label="KIS 종목코드"
                readOnly={!!approval?.code}
                value={code}
                required
                pattern="[0-9]{6}"
                maxLength={6}
                onChange={(e) => {
                  marketVersion.current++;
                  priceEdited.current = false;
                  setCode(e.target.value);
                  setMarketState('idle');
                  setQuote(null);
                  setBars([]);
                  setPrice('');
                }}
              />
            </label>
            <button className="button secondary" disabled={!available || busy}>
              <RefreshCw size={15} aria-hidden="true" />
              시세·일봉 조회
            </button>
          </form>
          {quote ? (
            <>
              <div className="quote">
                <strong>
                  {won(quote.price)}
                  <small>KRW</small>
                </strong>
                <Change value={quote.change} />
                <Badge>{quote.stopped ? '거래정지' : '종목코드 ' + quote.code}</Badge>
              </div>
              <DataStatusLine
                label="KIS 현재가 상태"
                status={freshness({
                  ...emptyStatus('kis-paper'),
                  phase: 'ready',
                  complete: true,
                  observedAt: quote.receivedAt,
                  lastSuccessAt: quote.receivedAt,
                  staleAfterMs: QUOTE_REFRESH_MS,
                })}
              />
              {bars.length ? (
                <details className="paper-bars">
                  <summary>수정 일봉 {bars.length}개</summary>
                  <Chart values={bars.map((b) => b.close)} height={240} label={`KIS ${code} 수정 일봉 종가`} />
                  <div className="chart-axis">
                    <span>{bars[0]?.date}</span>
                    <span>최대 100개 · 수정 일봉</span>
                    <span>{bars.at(-1)?.date}</span>
                  </div>
                </details>
              ) : (
                <p className="muted tiny">조회된 일봉 없음</p>
              )}
              <p className="muted tiny">
                현재가 수신 시각은 마지막 거래 시각이 아닙니다. 장외에는 마지막 시세가 표시될 수 있습니다.
              </p>
            </>
          ) : (
            <p className="muted" role="status">
              {marketState === 'error'
                ? '시세 조회 실패 · 종목과 연결을 확인한 뒤 다시 조회하세요.'
                : marketState === 'loading'
                  ? '현재가와 수정 일봉을 조회하고 있습니다.'
                  : '6자리 종목코드로 KIS 현재가와 수정 일봉을 조회하세요.'}
            </p>
          )}
        </Panel>
        <Panel title="KIS 모의 주문" action={<Badge>{marketOrder ? '시장가' : '지정가'} · 현금</Badge>}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (orderBlocked) return;
              setDraft({
                code,
                side,
                price: marketOrder ? 0 : Number(price),
                ...(marketOrder && { orderType: 'market' as const }),
                ...(cappedCurrent && { side: 'buy' as const, priceMode: 'cappedCurrent' as const }),
                qty: Number(qty),
                requestId: approval?.requestId ?? crypto.randomUUID(),
              });
              setConfirmed(true);
            }}
          >
            <div className="side-tabs">
              <button
                type="button"
                className={side === 'buy' ? 'buy active' : ''}
                aria-pressed={side === 'buy'}
                disabled={pinnedSide === 'sell'}
                onClick={() => setSide('buy')}
              >
                매수
              </button>
              <button
                type="button"
                className={side === 'sell' ? 'sell active' : ''}
                aria-pressed={side === 'sell'}
                disabled={pinnedSide === 'buy'}
                onClick={() => setSide('sell')}
              >
                매도
              </button>
            </div>
            <label className="field">
              대상 종목
              <input readOnly value={quote?.code ?? '먼저 종목 조회'} />
            </label>
            <label className="field">
              {marketOrder ? '시장가 주문단가 (원)' : cappedCurrent ? '매수 단가 상한 (원)' : '지정가 (원)'}
              <input
                type="number"
                required
                readOnly={marketOrder || !!approval?.policy?.limitPrice}
                min={marketOrder ? 0 : 1}
                max="10000000"
                step="1"
                value={price}
                onFocus={() => {
                  priceEdited.current = true;
                }}
                onChange={(e) => {
                  priceEdited.current = true;
                  setPrice(e.target.value);
                }}
              />
            </label>
            <label className="field">
              수량 (주)
              <input
                type="number"
                required
                min="1"
                max={effectiveLimit}
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </label>
            <p className="tiny muted">
              수동 한도 {manualLimit}주{approval && ` · 이번 1회 승인 상한 ${approval.maxQty}주 · 적용 한도 ${effectiveLimit}주`}{' '}
              ·{' '}
              <Link
                className="text-link"
                onClick={rememberInput}
                state={{ paperKey: formKey }}
                to={`/settings/trading/general?from=paper&code=${encodeURIComponent(code)}`}
              >
                {approval ? '적용 한도 보기' : '수량 한도 변경'}
              </Link>
            </p>
            {overLimit && <p role="alert">이 주문은 최대 {effectiveLimit}주까지 입력할 수 있습니다.</p>}
            {ledger === 'error' && <p role="status">저장 원장을 읽지 못해 새 주문을 차단했습니다. 페이지를 새로고침하세요.</p>}
            {realtimeBlocked && <p role="status">현재 종목의 실시간 시세와 주문 허용 상태를 확인한 뒤 주문하세요.</p>}
            <div className="order-total">
              <span>{marketOrder ? '상한가 기준 검사 금액' : cappedCurrent ? '최대 주문 금액' : '주문 금액'}</span>
              <strong>
                {won((marketOrder ? (quote?.upper ?? 0) : Number(price)) * Number(qty))}
                <small>원</small>
              </strong>
            </div>
            <p className="tiny muted top-gap">
              서버가 현재 계좌·미체결·매수 가능 수량·한도를 다시 검사합니다. 주문 접수는 체결 완료가 아닙니다.
            </p>
            <button
              className={`button wide ${side === 'buy' ? 'buy-button' : 'sell-button'}`}
              disabled={orderBlocked}
            >
              KIS 모의 주문 확인
            </button>
          </form>
        </Panel>
      </div>
      <Panel
        title="KIS 계좌·당일 주문 대조"
        className="paper-broker"
        action={
          <button ref={reconcileButton} className="button secondary" disabled={!available || busy} onClick={() => void refresh()}>
            <RefreshCw size={15} aria-hidden="true" />
            계좌·주문 조회
          </button>
        }
      >
        <div className="stats-grid three">
          <Stat
            label="KIS 모의 예수금"
            value={connection.balance ? `${won(connection.balance.cash)}원` : '조회 전'}
            sub={
              !connection.balance
                ? '전체 조회 전'
                : connection.connected
                  ? '모의 계좌 전체 성공값'
                  : '이전 전체 성공값 · 최신 아님'
            }
          />
          <Stat
            label="KIS 보유 종목"
            value={connection.balance ? `${connection.balance.positions.length}개` : '조회 전'}
            sub={!connection.balance ? '전체 조회 전' : connection.connected ? '수량 0 제외' : '이전 전체 성공값 · 최신 아님'}
          />
          <Stat
            label="당일 주문"
            value={ordersCheckedAt ? `${brokerOrders.length}건` : '조회 전'}
            sub={
              ordersCheckedAt
                ? `조회 ${new Date(ordersCheckedAt).toLocaleTimeString('ko-KR')} · ${ordersError ? '이전 조회값' : '수동 갱신'}`
                : 'KIS 당일 전체 조회 전'
            }
          />
        </div>
        {ordersState === 'loading' && <p role="status">계좌와 당일 주문을 대조하고 있습니다.</p>}
        {ordersError && (
          <p className="notice warning" role="alert">
            {ordersCheckedAt ? '계좌·주문 조회 실패. 이전 조회값은 최신이 아닙니다.' : '계좌·주문 조회 실패. 수량을 확인하지 못했습니다. 다시 조회하세요.'}
          </p>
        )}
        {ordersCheckedAt ? (
          <>
            <p className="muted tiny">
              확인 시각 {new Date(ordersCheckedAt).toLocaleString('ko-KR')}. 다른 매체에서 생성한 당일 주문도 포함합니다. 이 표는
              계좌·주문 조회 시점의 결과이며 실시간 REST 대조 결과는 자동 반영하지 않습니다.
            </p>
            {brokerOrders.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>종목 / 주문번호</th>
                      <th>방향</th>
                      <th>주문</th>
                      <th>체결</th>
                      <th>잔량</th>
                      <th>취소확인</th>
                      <th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brokerOrders.map((o) => (
                      <tr key={`${o.date}-${o.brokerId}`}>
                        <td>
                          <span>{o.name}</span>
                          <small className="cell-small">{o.brokerId}</small>
                        </td>
                        <td>{o.side === 'buy' ? '매수' : '매도'}</td>
                        <td>{o.qty}</td>
                        <td>{o.filled}</td>
                        <td>{o.remaining}</td>
                        <td>{o.confirmedCancelQty === undefined ? '미제공' : o.confirmedCancelQty + '주'}</td>
                        <td>{o.cancelled ? '취소' : o.filled >= o.qty ? '체결' : o.filled > 0 ? '부분체결' : '접수'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="당일 주문 없음">KIS 모의 계좌에 조회되는 당일 주문이 없습니다.</Empty>
            )}
          </>
        ) : (
          ordersState === 'idle' && <p className="muted">계좌·주문을 아직 조회하지 않았습니다.</p>
        )}
      </Panel>
      <section className="panel paper-ledger">
        <header className="panel-head">
          <h2 ref={ledgerHeading} tabIndex={-1}>
            이 앱에서 전송한 KIS 모의 주문
          </h2>
          <Link className="text-link" to="/design?screen=paper">
            처리 계약 보기
          </Link>
        </header>
        {ledger !== 'ready' ? (
          <Empty
            title={!available ? '로컬 서버 연결 대기' : ledger === 'loading' ? '저장된 주문 원장 조회 중' : '주문 원장 조회 실패'}
          >
            {ledger === 'error' ? '원장 확인 전에는 새 주문을 전송하지 않습니다. 연결을 확인한 후 페이지를 새로고침하세요.' : '원장 확인 후 주문 가능 여부를 표시합니다.'}
          </Empty>
        ) : orders.length ? (
          <table className="paper-orders" aria-label="이 앱의 KIS 주문 원장">
            <thead>
              <tr>
                <th scope="col">종목 · 주문</th>
                <th scope="col">처리 상태</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.requestId}>
                  <td>
                    <strong>
                      {o.code} · {o.side === 'buy' ? '매수' : '매도'}
                    </strong>
                    <span className="cell-small">
                      {o.orderType === 'market' ? '시장가' : won(o.price) + '원'} × {o.qty}주
                    </span>
                    <details>
                      <summary>주문 식별 정보</summary>
                      <span className="cell-small">거래일 {o.tradeDate}</span>
                      <span className="cell-small">증권사 주문번호 {o.brokerId ?? '미확정'}</span>
                      <span className="cell-small">
                        앱 요청 ID <span>{o.requestId}</span>
                      </span>
                    </details>
                  </td>
                  <td>
                    <Badge tone={o.status === 'filled' ? 'teal' : 'neutral'}>{statusLabel[o.status]}</Badge>
                    <span className="cell-small">
                      {(o.status === 'unknown' || o.status === 'sending') && '미확정 · '}체결 {o.filled}주 · 잔량 {o.remaining}주
                    </span>
                    {o.message && <span className="cell-small">{o.message}</span>}
                    {o.status === 'unknown' && !o.brokerId && (
                      <button
                        ref={o === recoverable ? recoveryButton : undefined}
                        className="button small secondary"
                        disabled={!available || busy}
                        onClick={() => void inspect(o.requestId)}
                      >
                        불명 복구 조회
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title="앱의 KIS 주문 기록 없음">로컬 데모 주문은 이 목록에 포함되지 않습니다.</Empty>
        )}
      </section>
      {recoveryMessage && <p className="notice compact" role="status">{recoveryMessage}</p>}
      {recovery && (
        <section className="panel paper-recovery">
          <header className="panel-head">
            <h2 ref={evidenceHeading} tabIndex={-1}>
              불명 주문 연결 확인
            </h2>
          </header>
          <p>
            요청 {recovery.order.requestId} · 원래 거래일 {recovery.evidence.tradeDate} · 조회{' '}
            {new Date(recovery.evidence.observedAt).toLocaleString('ko-KR')}
          </p>
          <p>
            조회는 주문 전송이 아닙니다. 후보가 없거나 여러 건이면 불명을 유지합니다. 고정한 복구 유효시간 안에 연결해야 하며
            서버가 다시 조회합니다.
          </p>
          {recovery.candidates.map((c) => (
            <p key={`${c.date}-${c.brokerId}`}>
              주문번호 {c.brokerId} · 조직번호 {c.organization} · {c.date} · {c.code} · {c.side === 'buy' ? '매수' : '매도'} ·{' '}
              {c.qty}주 × {c.orderType === 'market' ? '시장가' : `${won(c.price)}원`} · 체결 {c.filled} / 잔량 {c.remaining}
            </p>
          ))}
          {recovery.candidates.length === 1 ? (
            <label className="check-row">
              <input type="checkbox" checked={recoveryConfirmed} onChange={(e) => setRecoveryConfirmed(e.target.checked)} />
              KIS 앱의 주문번호·거래일·종목·방향·수량·가격을 확인했습니다
            </label>
          ) : (
            <p role="status">유일한 후보 없음 · 불명 유지</p>
          )}
          <button
            className="button secondary"
            disabled={!available || busy || !recoveryConfirmed || recovery.candidates.length !== 1}
            onClick={() => void recover()}
          >
            선택 주문 연결
          </button>
        </section>
      )}
      <PaperCancellationPanel
        info={cancelReason ? { candidate: null, reason: cancelReason } : ledger === 'ready' ? cancelInfo : null}
        orders={orders}
        refreshOrders={refresh}
      />
      <div ref={realtimeSection} role="group" aria-label="실시간 수신 및 대조 조작" tabIndex={-1}>
        <RealtimeStatus code={code} />
      </div>
      <Link to="/orders?view=kis">주문 관리에서 KIS 모의 원장 보기</Link>
      <dialog
        ref={dialog}
        className="order-dialog"
        aria-labelledby="kis-order-confirm-title"
        onCancel={() => setConfirmed(false)}
        onClose={() => setConfirmed(false)}
      >
        <div className="panel-head">
          <h2 id="kis-order-confirm-title">KIS 모의 계좌로 전송</h2>
          <button className="icon-button" aria-label="KIS 주문 확인 닫기" onClick={() => setConfirmed(false)}>
            <X size={18} />
          </button>
        </div>
        <Badge tone="teal">실제 KIS 모의 서버</Badge>
        <p>
          종목 {confirmation?.code} · {confirmation?.side === 'buy' ? '매수' : '매도'}
          <br />
          {confirmation?.qty}주 ×{' '}
          {confirmation && 'orderType' in confirmation
            ? '시장가'
            : confirmation && 'priceMode' in confirmation
              ? '재조회 현재가 (최대 ' + won(confirmation.price) + '원)'
              : won(confirmation?.price ?? 0) + '원'}
          <br />
          요청 ID {confirmation?.requestId}
        </p>
        <p>모의 계좌에 주문을 접수합니다. 취소 가능 여부는 접수 후 미체결 잔량 취소에서 확인하세요.</p>
        {priceBlocked && (
          <Link
            onClick={rememberInput}
            state={{ paperKey: formKey }}
            to={`/settings/trading/once/2?from=paper&code=${encodeURIComponent(code)}`}
            className="text-link"
          >
            지정가 적용 조건 확인
          </Link>
        )}
        {realtimeBlocked && <p role="status">요청 종목 {checkedCode}의 실시간 시세·대조 상태를 확인해야 전송할 수 있습니다.</p>}
        <div className="button-row">
          <button className="button secondary" onClick={() => setConfirmed(false)}>
            돌아가기
          </button>
          <button
            className="button primary"
            disabled={realtimeBlocked || busy || !available || storageError || (!pending && state.risk.halted)}
            onClick={() => void submit()}
          >
            KIS 모의 주문 전송
          </button>
        </div>
      </dialog>
    </div>
  );
}
