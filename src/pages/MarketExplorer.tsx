import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Search, Star } from 'lucide-react';
import { useWorkbench } from '../context';
import { Badge, Change, Empty, Panel } from '../components/ui';
import { won, type KisQuote, type Market } from '../../shared/model';
import { MARKET_PAGE_SIZE, MARKET_REFRESH_MS, MARKET_STALE_MS, masterDataSchema, marketQuoteSchema, type MasterDataSnapshot, type MasterInstrument, type RemovedInstrument } from '../../shared/market-data';

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
  const [search, setSearch] = useState(''), [market, setMarket] = useState('전체'), [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null), [quotes, setQuotes] = useState<Record<string, QuoteState>>({});
  const detailSection = useRef<HTMLElement | null>(null), detailTrigger = useRef<HTMLButtonElement | null>(null);
  const [now, setNow] = useState(Date.now()), [visible, setVisible] = useState(document.visibilityState === 'visible');
  const [refresh, setRefresh] = useState(0), [reading, setReading] = useState(false);
  const query = search.trim().toLocaleUpperCase('ko-KR');
  const filtered = useMemo(() => {
    const masterRows: Row[] = [...data.instruments, ...data.removed];
    const saved = new Set(watchlist);
    const knownCodes = new Set(masterRows.map(row => row.code));
    const list: Row[] = watchOnly ? [...masterRows.filter(row => saved.has(row.code)), ...[...saved].filter(code => !knownCodes.has(code)).map(code => ({ code, name: state.instruments.find(row => row.code === code)?.name ?? code, unverified: true as const }))] : masterRows;
    return list.filter(row => (market === '전체' || category(row) === market) && (row.code.includes(query) || row.name.toLocaleUpperCase('ko-KR').includes(query)));
  }, [data, market, query, watchOnly, watchlist, state.instruments]);
  const lastPage = Math.max(0, Math.ceil(filtered.length / MARKET_PAGE_SIZE) - 1), currentPage = Math.min(page, lastPage);
  const rows = filtered.slice(currentPage * MARKET_PAGE_SIZE, (currentPage + 1) * MARKET_PAGE_SIZE);
  const codes = rows.filter(row => !removed(row) && !unverified(row)).map(row => row.code).join(',');
  const detail = rows.find(row => row.code === selected);
  const exactCode = [...data.instruments, ...data.removed].find(row => row.code === query);
  const masterComplete = data.sources.length === 2 && data.sources.every(source => source.phase === 'ready' && source.lastSuccessAt);
  const emptyMessage = loadingMaster ? '마스터 확인 후 검색 결과를 판단할 수 있습니다.'
    : masterError ? '마스터 확인 후 검색 결과를 판단할 수 있습니다. 다시 갱신하세요.'
    : watchOnly && exactCode && !watchlist.includes(exactCode.code) ? '관심목록에 없는 종목입니다. 시장 탐색에서 추가하세요.'
    : exactCode ? `다른 시장 필터에 있는 종목입니다. 전체 또는 ${category(exactCode)}를 선택하세요.`
    : masterComplete && /^\d[0-9A-Z]{5}$/.test(query) ? '현재 마스터에 없는 코드입니다. 미등록·상장폐지 여부를 확인하세요. 상장폐지로 단정할 수 없습니다.'
    : data.instruments.length ? '검색 조건과 시장 필터를 바꿔보세요.' : '마스터 갱신으로 공식 종목 목록을 수집하세요. 예시 가격으로 대체하지 않습니다.';

  function focusDetail() {
    detailSection.current?.focus();
    detailSection.current?.scrollIntoView({ block: 'nearest' });
  }
  function openDetail(code: string, trigger: HTMLButtonElement) {
    detailTrigger.current = trigger;
    if (selected === code) focusDetail();
    else setSelected(code);
  }
  useEffect(() => { if (selected) focusDetail(); }, [selected]);

  async function loadMaster(update: boolean) {
    masterRequest.current?.abort(); const controller = new AbortController(); masterRequest.current = controller;
    setLoadingMaster(true); setMasterError('');
    try {
      const response = await fetch(update ? '/api/data/master/refresh' : '/api/data/master', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]), ...(update ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workbench': 'local' }, body: '{}' } : {}) });
      if (!response.ok) throw new Error();
      const next = masterDataSchema.parse(await response.json());
      if (controller.signal.aborted) return;
      setData(next); setPage(0); setSelected(null);
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
    setSaveError('');
    try { await act('watchlist', { code }); }
    catch { setSaveError('관심목록 저장 실패 · 마지막 확인 목록을 표시합니다. 연결과 저장 상태를 확인한 뒤 다시 시도하세요.'); }
  }
  function changeFilter(value: string) { setMarket(value); setPage(0); setSelected(null); }
  const masterOld = data.sources.some(source => source.lastSuccessAt && now - Date.parse(source.lastSuccessAt) >= 86_400_000);

  return <>
    <div className="notice compact"><div><strong>국내 주식·ETF · KIS 모의 서버 시세</strong><br />현재 페이지 최대 {MARKET_PAGE_SIZE}종목을 순차 조회하고 완료 {MARKET_REFRESH_MS / 1000}초 후 갱신합니다. 수신 시각은 체결 시각이 아닙니다. 실시간 시세·거래 가능 확정을 뜻하지 않습니다.</div></div>
    {!watchOnly && <div className="market-summary">{(['KOSPI', 'KOSDAQ', 'ETF'] as const).map(m => <div key={m}><span className="eyebrow">{m}</span><h3>{data.instruments.filter(row => category(row) === m).length}<small>개 마스터 종목</small></h3><p>{m === 'ETF' ? '상장시장과 별도 분류' : 'ETF 제외 · 국내 주식'}</p></div>)}</div>}
    {watchOnly && <div className="button-row"><Link className="button secondary" to="/market">시장 탐색에서 추가</Link><span className="muted">{server ? `저장된 관심종목 ${watchlist.length}개 · 시장 탐색과 같은 목록` : '저장된 관심종목 수 미확인'}</span></div>}
    <Panel title={watchOnly ? "나의 관심종목" : "종목 마스터"} action={<button className="button secondary" disabled={loadingMaster} onClick={() => void loadMaster(true)}><RefreshCw size={15} />{loadingMaster ? '마스터 확인 중' : '마스터 갱신'}</button>}>
      {saveError && <div role="alert" className="notice warning">{saveError}</div>}
      {masterError && <div role="alert" className="notice warning">{masterError}</div>}
      {masterOld && <div className="notice warning">마스터 수집 후 24시간이 지났습니다. 최신 목록과 거래 상태를 확인하세요.</div>}
      <div className="market-sources">{data.sources.map(source => <span key={source.exchange}>{source.exchange} · {source.phase === 'loading' ? '수집 중 · 이전 목록' : source.phase === 'error' ? '갱신 실패' : '수집 완료'} · {source.lastSuccessAt ? time(source.lastSuccessAt) : '성공 기록 없음'}</span>)}</div>
      <div className="toolbar"><div className="tabs">{['전체', 'KOSPI', 'KOSDAQ', 'ETF'].map(m => <button aria-pressed={market === m} className={market === m ? 'active' : ''} onClick={() => changeFilter(m)} key={m}>{m}</button>)}</div><label className="search-field"><Search size={17} /><input aria-label="종목명 또는 코드 검색" placeholder="종목명 또는 코드 검색" value={search} onChange={event => { setSearch(event.target.value); setPage(0); setSelected(null); }} /></label></div>
      <div className="button-row market-refresh"><button className="button secondary" disabled={reading || !codes || !visible} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15} />{reading ? '표시 종목 조회 중' : '표시 종목 시세 갱신'}</button><span className="muted tiny">{visible ? '현재 페이지 자동 갱신' : '숨겨진 화면 · 갱신 중단'} · 30초 경과 또는 실패 시 지연 표시</span></div>
      {watchOnly && !server ? <Empty title={status.phase === 'loading' ? '관심목록을 확인하고 있습니다' : '관심목록을 확인하지 못했습니다'}>로컬 서버 연결 후 저장된 목록을 표시합니다.</Empty> : rows.length ? <div className="table-scroll"><table className="market-table"><thead><tr><th>관심</th><th>종목명 / 코드</th><th>현재가</th><th>등락률</th><th>거래량</th><th>수신 상태 / 거래 상태</th><th>{watchOnly ? '상세 / 주문' : '상세'}</th></tr></thead><tbody>{rows.map(row => {
        const value = removed(row) || unverified(row) ? undefined : quotes[row.code], quote = value?.quote;
        return <tr key={row.code}><td><button className={`star-button ${watchlist.includes(row.code) ? 'selected' : ''}`} aria-label={`${row.name} 관심 ${watchlist.includes(row.code) ? '해제' : '등록'}`} disabled={busy || !available || ((removed(row) || unverified(row)) && !watchlist.includes(row.code))} onClick={() => void toggleWatch(row.code)}><Star size={17} /></button></td><td><button className="market-name" aria-controls="market-detail" onClick={event => openDetail(row.code, event.currentTarget)}>{row.name}<small>{row.code} · {row.exchange ?? '마스터 미확인'}{row.kind === 'etf' ? ' · ETF' : ''}</small></button></td><td className="number">{quote ? won(quote.price) : '—'}</td><td>{quote ? <Change value={quote.change} /> : '—'}</td><td className="number">{quote?.volume === undefined ? '—' : won(quote.volume)}</td><td className="market-row-status"><strong>{quoteLabel(row)}</strong><span>{tradingLabel(row)}</span><small>{quote ? `수신 ${time(quote.receivedAt)}` : '수신 시각 없음'}</small>{value?.error && <small className="down">{value.error}</small>}</td><td><button className="button quiet" aria-label={`${row.name} 상세`} aria-controls="market-detail" onClick={event => openDetail(row.code, event.currentTarget)}>보기</button>{watchOnly && !removed(row) && !unverified(row) && <Link className="table-action" aria-label={`${row.name} KIS 주문 화면`} to={`/paper?code=${encodeURIComponent(row.code)}`}>주문 화면 ↗</Link>}</td></tr>;
      })}</tbody></table></div> : <Empty title={watchOnly && !watchlist.length ? '관심종목이 없습니다' : loadingMaster ? '종목 마스터를 확인하고 있습니다' : '표시할 종목이 없습니다'}>{watchOnly && !watchlist.length ? '시장 탐색에서 관심종목을 추가하세요.' : emptyMessage}</Empty>}
      {(!watchOnly || server) && <div className="table-foot"><span>총 {filtered.length}개 종목 · {currentPage + 1} / {lastPage + 1}페이지</span><div className="button-row"><button className="button quiet" disabled={currentPage === 0} onClick={() => { setPage(currentPage - 1); setSelected(null); }}>이전 페이지</button><button className="button quiet" disabled={currentPage === lastPage} onClick={() => { setPage(currentPage + 1); setSelected(null); }}>다음 페이지</button></div></div>}
    </Panel>
    {detail && <section id="market-detail" ref={detailSection} tabIndex={-1} aria-label="종목 상세"><Panel title={`${detail.name} · ${detail.code}`} action={<button className="button quiet" onClick={() => { setSelected(null); detailTrigger.current?.focus(); }}>상세 닫기</button>}>{watchOnly && <CopyStockCode key={detail.code} code={detail.code} />}<div className="check-row"><span>시장 / 종류</span><strong>{detail.exchange ?? '마스터 미확인'} / {unverified(detail) ? '확인 필요' : detail.kind === 'etf' ? 'ETF' : '주식'}</strong></div><div className="check-row"><span>업종</span><strong>{removed(detail) ? '확인 필요' : quotes[detail.code]?.quote?.sector || '미수신'}</strong></div><div className="check-row"><span>거래 상태</span><Badge>{tradingLabel(detail)}</Badge></div><div className="check-row"><span>시세 상태</span><strong>{quoteLabel(detail)}</strong></div><p className="muted prose">{unverified(detail) ? '저장된 코드의 마스터 정보를 확인하지 못했습니다. 마스터 갱신 후 다시 확인하세요.' : removed(detail) ? `마스터 제외 확인: ${time(detail.removedAt)}. 제외 사유와 상장폐지 여부는 별도 확인이 필요합니다.` : '가격·업종·거래량은 KIS REST 응답 기준입니다. 거래정지 해제·주문 가능 여부는 주문 전 별도 검사가 필요합니다.'}</p><Link className="subtle-link" to="/settings">KIS 연결 상태 확인 ↗</Link></Panel></section>}
  </>;
}
