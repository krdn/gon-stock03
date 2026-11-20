import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ChevronRight, RefreshCw, Search, Star } from 'lucide-react';
import { useWorkbench } from '../context';
import { Badge, Change, Empty, Panel } from '../components/ui';
import { won, type KisQuote, type Market } from '../../shared/model';
import { MARKET_PAGE_SIZE, MARKET_REFRESH_MS, MARKET_STALE_MS, masterDataSchema, marketQuoteSchema, type MasterDataSnapshot, type MasterInstrument, type RemovedInstrument } from '../../shared/market-data';

import './market-explorer.css';
import './watchlist.css';

const markets = ['전체', 'KOSPI', 'KOSDAQ', 'ETF'];

type Row = MasterInstrument | RemovedInstrument | (Partial<MasterInstrument> & { code: string; name: string; unverified: true });
type QuoteState = { quote?: KisQuote; error?: string };
const category = (row: Row): Market | '미확인' => row.kind === 'etf' ? 'ETF' : row.exchange ?? '미확인';
const unverified = (row: Row) => 'unverified' in row;
const removed = (row: Row): row is RemovedInstrument => 'removedAt' in row;
const time = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

function CopyStockCode({ code }: { code: string }) {
  const [result, setResult] = useState<'idle' | 'copied' | 'error'>('idle');
  async function copy() {
    setResult('idle');
    try {
      await navigator.clipboard.writeText(code);
      setResult('copied');
    } catch {
      setResult('error');
    }
  }
  return <div>
    <button type="button" className="button secondary" onClick={copy}>종목코드 복사</button>
    {result === 'copied' && <p role="status">종목코드 {code}를 복사했습니다.</p>}
    {result === 'error' && <p role="alert">종목코드 복사에 실패했습니다. {code}를 직접 복사하세요.</p>}
  </div>;
}

export function MarketExplorer({ watchOnly = false }: { watchOnly?: boolean }) {
  const { state, act, busy, available, server, status } = useWorkbench();
  const watchlist = useMemo(() => server ? state.watchlist : [], [state.watchlist, server?.instanceId]);
  const [data, setData] = useState<MasterDataSnapshot>({ instruments: [], removed: [], sources: [] });
  const [saveError, setSaveError] = useState('');
  const [masterError, setMasterError] = useState(''), [loadingMaster, setLoadingMaster] = useState(true);
  const masterRequest = useRef<AbortController | null>(null);
  const [urlView, setUrlView] = useSearchParams();
  const location = useLocation(), navigate = useNavigate();
  const [view, setView] = useState(() => new URLSearchParams(urlView));
  useLayoutEffect(() => {
    function syncLocation() {
      const latest = new URLSearchParams(window.location.search);
      setView(current => current.toString() === latest.toString() ? current : latest);
    }
    syncLocation();
    // A fast Back can return to the same router snapshot while the detail is still open locally.
    if (watchOnly) {
      window.addEventListener('popstate', syncLocation);
      return () => window.removeEventListener('popstate', syncLocation);
    }
  }, [urlView, watchOnly]);
  const search = view.get('q') ?? '', selected = view.get('detail');
  const market = markets.find(value => value === view.get('market')) ?? '전체';
  const requestedPage = Number(view.get('page'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage - 1 : 0;
  const searchInput = useRef<HTMLInputElement>(null);
  const [quotes, setQuotes] = useState<Record<string, QuoteState>>({});
  const detailSection = useRef<HTMLElement | null>(null);
  const [now, setNow] = useState(Date.now()), [visible, setVisible] = useState(document.visibilityState === 'visible');
  const [refresh, setRefresh] = useState(0), [reading, setReading] = useState(false);
  const query = search.trim().toLocaleUpperCase('ko-KR');
  const waitingForWatchMaster = watchOnly && loadingMaster && !data.sources.length && !data.instruments.length && !data.removed.length;
  const filtered = useMemo(() => {
    if (waitingForWatchMaster) return [];
    const masterRows: Row[] = [...data.instruments, ...data.removed];
    const saved = new Set(watchlist);
    const knownCodes = new Set(masterRows.map(row => row.code));
    const list: Row[] = watchOnly ? [...masterRows.filter(row => saved.has(row.code)), ...[...saved].filter(code => !knownCodes.has(code)).map(code => ({ code, name: state.instruments.find(row => row.code === code)?.name ?? code, unverified: true as const }))] : masterRows;
    return list.filter(row => (market === '전체' || category(row) === market) && (row.code.includes(query) || row.name.toLocaleUpperCase('ko-KR').includes(query)));
  }, [data, market, query, watchOnly, watchlist, state.instruments, waitingForWatchMaster]);
  const lastPage = Math.max(0, Math.ceil(filtered.length / MARKET_PAGE_SIZE) - 1);
  const selectedIndex = selected ? filtered.findIndex(row => row.code === selected) : -1;
  const currentPage = selectedIndex < 0 ? Math.min(page, lastPage) : Math.floor(selectedIndex / MARKET_PAGE_SIZE);
  const rows = filtered.slice(currentPage * MARKET_PAGE_SIZE, (currentPage + 1) * MARKET_PAGE_SIZE);
  const codes = rows.filter(row => !removed(row) && !unverified(row)).map(row => row.code).join(',');
  const detail = rows.find(row => row.code === selected);
  const exactCode = [...data.instruments, ...data.removed].find(row => row.code === query);
  const masterComplete = data.sources.length === 2 && data.sources.every(source => source.phase === 'ready' && source.lastSuccessAt);
  const emptyMessage = loadingMaster ? '마스터 확인 후 검색 결과를 판단할 수 있습니다.'
    : masterError ? '마스터 확인 후 검색 결과를 판단할 수 있습니다. 다시 갱신하세요.'
    : watchOnly && exactCode && removed(exactCode) && !watchlist.includes(exactCode.code) ? '현재 마스터에서 제외된 종목은 관심종목으로 추가할 수 없습니다.'
    : watchOnly && exactCode && !watchlist.includes(exactCode.code) ? '관심목록에 없는 종목입니다. 시장 탐색에서 추가하세요.'
    : !watchOnly && exactCode && removed(exactCode) ? '현재 마스터에서 제외된 종목입니다. 전체 필터에서 이전 종목 상세를 확인하세요.'
    : exactCode ? `다른 시장 필터에 있는 종목입니다. 전체 또는 ${category(exactCode)}를 선택하세요.`
    : masterComplete && /^\d[0-9A-Z]{5}$/.test(query) ? '현재 마스터에 없는 코드입니다. 미등록·상장폐지 여부를 확인하세요. 상장폐지로 단정할 수 없습니다.'
    : !masterComplete ? '전체 마스터를 확인하지 못했습니다. 마스터 갱신 후 다시 확인하세요.'
    : data.instruments.length ? '검색 조건과 시장 필터를 바꿔보세요.' : '마스터 갱신으로 공식 종목 목록을 수집하세요. 예시 가격으로 대체하지 않습니다.';

  function updateView(changes: Record<string, string | null>, replace = true) {
    const next = new URLSearchParams(view);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (next.toString() === view.toString()) return;
    setView(next);
    setUrlView(next, {
      replace, preventScrollReset: true,
      state: changes.detail ? { marketDetailFromList: !selected || location.state?.marketDetailFromList === true } : null,
    });
  }
  function closeDetail() {
    const trigger = document.getElementById('market-open-' + selected);
    if (location.state?.marketDetailFromList === true) navigate(-1);
    else updateView({ detail: null, page: currentPage ? String(currentPage + 1) : null });
    (trigger ?? searchInput.current)?.focus();
  }
  function focusDetail() {
    detailSection.current?.focus();
    detailSection.current?.scrollIntoView({ block: 'nearest' });
  }
  function openDetail(code: string) {
    if (selected === code) focusDetail();
    else updateView({ detail: code }, Boolean(selected));
  }
  const detailCode = detail?.code;
  const previousDetail = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (detailCode) focusDetail();
    else if (previousDetail.current && document.activeElement === document.body) {
      (document.getElementById('market-open-' + previousDetail.current) ?? searchInput.current)?.focus();
    }
    previousDetail.current = detailCode;
  }, [detailCode]);

  async function loadMaster(update: boolean) {
    masterRequest.current?.abort(); const controller = new AbortController(); masterRequest.current = controller;
    setLoadingMaster(true); setMasterError('');
    try {
      const response = await fetch(update ? '/api/data/master/refresh' : '/api/data/master', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]), ...(update ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workbench': 'local' }, body: '{}' } : {}) });
      if (!response.ok) throw new Error();
      const next = masterDataSchema.parse(await response.json());
      if (controller.signal.aborted) return;
      setData(next);
      if (next.sources.some(source => source.phase === 'error')) setMasterError('마스터 갱신 실패 · 이전 목록을 표시합니다. 연결을 확인하고 다시 갱신하세요.');
    } catch { if (!controller.signal.aborted) setMasterError('종목 마스터를 불러오지 못했습니다. 이전 목록이 있으면 보존합니다. 다시 갱신하세요.'); }
    finally { if (!controller.signal.aborted) setLoadingMaster(false); }
  }

  useEffect(() => {
    void loadMaster(false);
    const visibility = () => { setVisible(document.visibilityState === 'visible'); setNow(Date.now()); };
    document.addEventListener('visibilitychange', visibility);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { masterRequest.current?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, []);

  useEffect(() => {
    setReading(false);
    if (!visible || !codes) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const requested = codes.split(',');
    setQuotes(previous => Object.fromEntries(requested.filter(code => previous[code]).map(code => [code, previous[code]])));
    async function read() {
      if (controller.signal.aborted) return;
      setReading(true);
      for (const code of requested) {
        if (controller.signal.aborted) break;
        try {
          const response = await fetch('/api/market/quote', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workbench': 'local' }, body: JSON.stringify({ code }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) });
          const body = await response.json();
          if (!response.ok) throw new Error(response.status < 500 && typeof body?.error === 'string' ? body.error : '현재가 조회에 실패했습니다. 연결을 확인하세요.');
          const quote = marketQuoteSchema.parse(body?.quote);
          if (quote.code !== code) throw new Error('현재가 응답의 종목코드가 일치하지 않습니다.');
          if (!controller.signal.aborted) setQuotes(previous => ({ ...previous, [code]: { quote } }));
        } catch (error) {
          if (!controller.signal.aborted) setQuotes(previous => ({ ...previous, [code]: { quote: previous[code]?.quote, error: error instanceof Error && error.name === 'Error' ? error.message : '현재가 응답을 확인하지 못했습니다. 다시 조회하세요.' } }));
        }
      }
      if (!controller.signal.aborted) { setReading(false); timer = setTimeout(read, MARKET_REFRESH_MS); }
    }
    timer = setTimeout(read, 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [codes, visible, refresh]);

  function quoteLabel(row: Row) {
    if (unverified(row)) return '미수신 · 마스터 미확인';
    if (removed(row)) return '조회 대상 제외';
    const value = quotes[row.code];
    if (!value?.quote) return value?.error ? '미수신 · 조회 실패' : '미수신';
    if (value.error) return '지연 · 갱신 실패';
    return now - Date.parse(value.quote.receivedAt) >= MARKET_STALE_MS ? '지연 · 이전 수신값' : '수신 완료';
  }
  function tradingLabel(row: Row) {
    if (unverified(row)) return '마스터 갱신 후 확인 필요';
    if (removed(row)) return '마스터 제외 · 상장폐지 확인 필요';
    const quote = quotes[row.code]?.quote;
    if (quote?.stopped || row.tradingHalted) return '거래정지 · 거래불가';
    if (quote?.liquidation || row.liquidation) return '정리매매 · 주의';
    return '거래 가능 여부 별도 확인';
  }
  async function toggleWatch(code: string) {
    if (watchOnly) removalFocus.current = { code, index: rows.findIndex(row => row.code === code) };
    setSaveError('');
    try { await act('watchlist', { code }); }
    catch { setSaveError('관심목록 저장 실패 · 마지막 확인 목록을 표시합니다. 연결과 저장 상태를 확인한 뒤 다시 시도하세요.'); }
  }
  const removalFocus = useRef<{ code: string; index: number } | null>(null);
  useLayoutEffect(() => {
    const pending = removalFocus.current;
    if (busy || !pending) return;
    removalFocus.current = null;
    if (selected === pending.code && !watchlist.includes(pending.code)) {
      if (location.state?.marketDetailFromList === true) navigate(-1);
      else updateView({ detail: null, page: currentPage ? String(currentPage + 1) : null });
    }
    if (document.activeElement !== document.body) return;
    const target = rows.find(row => row.code === pending.code) ?? rows[Math.min(pending.index, rows.length - 1)];
    ((target && document.getElementById('market-open-' + target.code)) ?? searchInput.current)?.focus();
  }, [busy, rows]);
  function changeFilter(value: string) {
    updateView({ market: value === '전체' ? null : value, page: null, detail: null });
  }
  const masterOld = data.sources.some(source => source.lastSuccessAt && now - Date.parse(source.lastSuccessAt) >= 86_400_000);

  const masterRefresh = <button className="button secondary" disabled={loadingMaster} onClick={() => void loadMaster(true)}>
    <RefreshCw size={15} />{loadingMaster ? '마스터 확인 중' : '마스터 갱신'}
  </button>;
  const sources = <div className="market-sources">{data.sources.map(source => <span key={source.exchange}>
    {source.exchange} · {source.phase === 'loading' ? '수집 중 · 이전 목록' : source.phase === 'error' ? '갱신 실패' : '수집 완료'} · {source.lastSuccessAt ? time(source.lastSuccessAt) : '성공 기록 없음'}
  </span>)}</div>;
  const quoteRefresh = <button className="button secondary" disabled={reading || !codes || !visible} onClick={() => setRefresh(value => value + 1)}>
    <RefreshCw size={15} />{reading ? '표시 종목 조회 중' : '표시 종목 시세 갱신'}
  </button>;
  const refreshStatus = <span className="muted tiny">{visible ? '현재 페이지 자동 갱신' : '숨겨진 화면 · 갱신 중단'} · 30초 경과 또는 실패 시 지연 표시</span>;
  const detailValue = detail && !removed(detail) && !unverified(detail) ? quotes[detail.code] : undefined;
  const detailQuote = detailValue?.quote;
  const missingMaster = !loadingMaster && !masterError && !masterComplete;
  const listStatus = loadingMaster ? '마스터 확인 중'
    : masterError && data.sources.some(source => source.lastSuccessAt) ? `갱신 실패 · 이전 목록 ${filtered.length}개`
    : masterComplete && !masterError ? `검색 결과 ${filtered.length}개`
    : `현재 목록 ${filtered.length}개 · 전체 미확인`;
  const hasFilters = Boolean(search || market !== '전체');
  const emptyWatchlist = watchOnly && !watchlist.length;
  const showReset = hasFilters && (watchOnly || (!loadingMaster && !masterError));
  const marketTabs = <div className="tabs" role="group" aria-label="시장 필터">{markets.map(m =>
      <button aria-pressed={market === m} className={market === m ? 'active' : ''} onClick={() => changeFilter(m)} key={m}>{m}</button>)}</div>;
  const searchBox = <label className="search-field"><Search size={17} /><input ref={searchInput} aria-label="종목명 또는 코드 검색" placeholder="종목명 또는 코드 검색" value={search}
      onChange={event => updateView({ q: event.target.value, page: null, detail: null })} /></label>;

  return <>
    <Panel className={watchOnly ? 'market-explorer watchlist-explorer' : 'market-explorer'} title={watchOnly ? '나의 관심종목' : '종목 검색'} action={watchOnly
      ? <Link className="button secondary" to={exactCode && !removed(exactCode) && !watchlist.includes(exactCode.code) ? `/market?q=${exactCode.code}` : '/market'}>시장 탐색에서 추가</Link>
      : <span className="market-source-tag">KIS 모의 · REST 시세</span>}>
      {saveError && <div role="alert" className="notice warning">{saveError}</div>}
      {masterError && <div role="alert" className="notice warning">{masterError}</div>}
      {masterOld && <div className="notice warning">마스터 수집 후 24시간이 지났습니다. 최신 목록과 거래 상태를 확인하세요.</div>}
      {missingMaster && <p className="notice warning">종목 마스터 전체 확인 전 · 두 시장의 수집 상태를 확인하세요.</p>}
      {(masterError || missingMaster) && masterRefresh}
      <div className="toolbar">{searchBox}{marketTabs}</div>
      <div className="market-list-meta"><span role="status">{watchOnly
        ? server ? `저장된 관심종목 ${watchlist.length}개${waitingForWatchMaster ? ' · 마스터 확인 중' : hasFilters ? ' · 표시 ' + filtered.length + '개' : ''}` : '저장된 관심종목 수 미확인'
        : listStatus}</span>{quoteRefresh}</div>
      {selected && (!watchOnly || server) && !loadingMaster && !detail && <p role="status">이 목록에서 선택한 상세 종목을 확인하지 못했습니다. <button className="text-link" onClick={closeDetail}>목록으로</button></p>}
      {watchOnly && !server ? <Empty title={status.phase === 'loading' ? '관심목록을 확인하고 있습니다' : '관심목록을 확인하지 못했습니다'}>로컬 서버 연결 후 저장된 목록을 표시합니다.</Empty> : rows.length ? <div className="table-scroll"><table className="market-table"><thead><tr>
        <th scope="col">종목명 / 코드</th><th scope="col">현재가</th>
        <th scope="col" className="market-change">등락률</th><th scope="col" className="market-volume">거래량</th>
        <th scope="col">관심</th><th scope="col">수신 상태 / 거래 상태</th>{watchOnly && <th scope="col">주문 화면</th>}
      </tr></thead><tbody>{rows.map(row => {
        const value = removed(row) || unverified(row) ? undefined : quotes[row.code], quote = value?.quote;
        return <tr key={row.code}>
          <td className="market-identity"><button id={'market-open-' + row.code} className="market-name" aria-label={`${row.name} 상세`} aria-controls={detail?.code === row.code ? 'market-detail' : undefined} aria-expanded={detail?.code === row.code} onClick={() => openDetail(row.code)}>
            {row.name}<ChevronRight size={14} aria-hidden="true" /><small>{row.code} · {row.exchange ?? '마스터 미확인'}{row.kind === 'etf' ? ' · ETF' : ''}</small></button></td>
          <td className="number market-price"><small aria-hidden="true">현재가 </small>{quote ? won(quote.price) : '—'}</td>
          <td className="market-change">{quote ? <Change value={quote.change} /> : '—'}</td>
          <td className="number market-volume">{quote?.volume === undefined ? '—' : won(quote.volume)}</td>
          <td className="market-star"><button className={`star-button ${watchlist.includes(row.code) ? 'selected' : ''}`} aria-label={`${row.name} 관심 ${watchlist.includes(row.code) ? '해제' : '등록'}`} disabled={busy || !available || ((removed(row) || unverified(row)) && !watchlist.includes(row.code))} onClick={() => void toggleWatch(row.code)}><Star size={17} /></button></td>
          <td className="market-row-status"><strong>{quoteLabel(row)}</strong><span>{tradingLabel(row)}</span><small>{quote ? `수신 ${time(quote.receivedAt)}` : '수신 시각 없음'}</small>{!watchOnly && value?.error && <small className="down">{value.error}</small>}</td>
          {watchOnly && <td className="watchlist-order">{!removed(row) && !unverified(row) && <Link className="table-action" aria-label={`${row.name} KIS 주문 화면`} to={`/paper?code=${encodeURIComponent(row.code)}`}>주문 화면 ↗</Link>}</td>}
        </tr>;
      })}</tbody></table></div> : <Empty title={emptyWatchlist ? '관심종목이 없습니다' : loadingMaster ? '종목 마스터를 확인하고 있습니다' : (masterError || missingMaster) ? '검색 결과 확인 전' : '표시할 종목이 없습니다'}>
        {emptyWatchlist && !exactCode ? '시장 탐색에서 관심종목을 추가하세요.' : emptyMessage}
        {showReset && <button className="button secondary market-reset" onClick={() => { updateView({ q: null, market: null, page: null, detail: null }); searchInput.current?.focus(); }}>검색 조건 지우기</button>}
      </Empty>}
      {(!watchOnly || (server && lastPage > 0)) && <div className="table-foot"><span>{currentPage + 1} / {lastPage + 1}페이지</span><div className="button-row"><button className="button quiet" disabled={currentPage === 0} onClick={() => updateView({ page: currentPage === 1 ? null : String(currentPage), detail: null })}>이전 페이지</button><button className="button quiet" disabled={currentPage === lastPage} onClick={() => updateView({ page: String(currentPage + 2), detail: null })}>다음 페이지</button></div></div>}
      <details className="market-provenance"><summary>마스터 출처와 시세 갱신 기준</summary>
        <p>KIS 공개 종목 마스터 · KOSPI·KOSDAQ 주식과 ETF를 분류합니다.</p>
        {sources}
        <p>{data.sources.length ? ['KOSPI', 'KOSDAQ', 'ETF'].map(m => `${m} ${data.instruments.filter(row => category(row) === m).length}개`).join(' · ') : '수집 기록 없음'}</p>
        {!masterError && !missingMaster && masterRefresh}
        <p>표시된 최대 {MARKET_PAGE_SIZE}종목을 순차 조회하고 완료 {MARKET_REFRESH_MS / 1000}초 후 갱신합니다. 수신 시각과 거래소 체결 시각은 다릅니다.</p>{refreshStatus}
      </details>
    </Panel>
    {detail && <section id="market-detail" ref={detailSection} tabIndex={-1} aria-label="종목 상세" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); closeDetail(); }
    }}><Panel title={`${detail.name} · ${detail.code}`} action={<button className="button quiet" onClick={closeDetail}>상세 닫기</button>}>
      <div className={watchOnly ? "market-detail-action watchlist-actions" : "market-detail-action"}>
        {watchOnly && <CopyStockCode key={detail.code} code={detail.code} />}
        {!removed(detail) && !unverified(detail) && /^\d{6}$/.test(detail.code) ? <Link className="button primary" to={`/trade?code=${detail.code}`}>트레이딩에서 시세 보기 <ArrowRight size={15} /></Link>
          : <p>{unverified(detail) ? '마스터 확인 후 트레이딩에서 시세를 볼 수 있습니다.' : removed(detail) ? '마스터에서 제외된 종목입니다.' : '트레이딩 시세 조회는 숫자 6자리 종목을 지원합니다.'}</p>}
      </div>
      <div className="check-row"><span>시장 / 종류</span><strong>{detail.exchange ?? '마스터 미확인'} / {unverified(detail) ? '확인 필요' : detail.kind === 'etf' ? 'ETF' : '주식'}</strong></div>
      <div className="check-row"><span>업종</span><strong>{removed(detail) ? '확인 필요' : detailQuote?.sector || '미수신'}</strong></div>
      <div className="check-row"><span>거래 상태</span><Badge>{tradingLabel(detail)}</Badge></div>
      <div className="check-row"><span>시세 상태</span><strong>{quoteLabel(detail)}</strong></div>
      <div className="check-row"><span>KIS 모의 REST 수신 시각</span><strong>{detailQuote ? time(detailQuote.receivedAt) : '수신 시각 없음'}</strong></div>
      <div className="check-row"><span>현재가 / 등락률 / 거래량</span><strong>{detailQuote ? won(detailQuote.price) + '원' : '—'} / {detailQuote ? <Change value={detailQuote.change} /> : '—'} / {detailQuote?.volume === undefined ? '—' : won(detailQuote.volume) + '주'}</strong></div>
      {detailValue?.error && <p className="notice warning">{detailValue.error}</p>}
      <p className="muted prose">{unverified(detail) ? '저장된 코드의 마스터 정보를 확인하지 못했습니다. 마스터 갱신 후 다시 확인하세요.' : removed(detail) ? `마스터 제외 확인: ${time(detail.removedAt)}. 제외 사유와 상장폐지 여부는 별도 확인이 필요합니다.` : '가격·업종·거래량은 KIS REST 응답 기준입니다. 거래정지 해제·주문 가능 여부는 주문 전 별도 검사가 필요합니다.'}</p>
      <Link className="subtle-link" to="/settings">KIS 연결 상태 확인 ↗</Link></Panel></section>}
  </>;
}
