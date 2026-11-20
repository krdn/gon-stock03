import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { z } from 'zod';
import { useWorkbench } from '../context';
import { Badge, Change, Chart, Empty } from '../components/ui';
import { MARKET_REFRESH_MS, MARKET_STALE_MS, marketDate, marketQuoteSchema } from '../../shared/market-data';
import { won } from '../../shared/model';
import './trade-v2.css';

const marketSnapshot = z.object({
  quote: marketQuoteSchema,
  bars: z.array(z.object({ date: marketDate, close: z.number().positive() })).min(2).max(100)
    .refine(bars => bars.every((bar, i) => i === 0 || bars[i - 1].date < bar.date)),
});
const dateLabel = (date: string) => `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;

export function LiveTrading({ code }: { code: string }) {
  const { state } = useWorkbench();
  const [params, setParams] = useSearchParams();
  const [inputCode, setInputCode] = useState(code);
  const validCode = /^\d{6}$/.test(code);
  const instrument = state.instruments.find(row => row.code === code);
  useEffect(() => setInputCode(code), [code]);
  function choose(next: string) {
    if (next === code) return;
    const selection = new URLSearchParams(params);
    selection.set('code', next);
    setParams(selection);
  }
  return <section className="panel trade-page live-trade trade-quote-panel" aria-label="실제 시세">
    <div className="trade-stock-picker">
      <label className="field">실제 시세 종목
        <select aria-label="실제 시세 종목" value={code} onChange={e => choose(e.target.value)}>
          {!instrument && <option value={code}>{code || '종목 선택'}</option>}
          {state.instruments.map(row => <option key={row.code} value={row.code}>{row.name} · {row.code}</option>)}
        </select>
      </label>
      <details open={!validCode || undefined}>
        <summary>종목코드 직접 입력</summary>
        <form className="button-row" onSubmit={e => { e.preventDefault(); choose(inputCode.trim()); }}>
          <label className="field">종목코드<input aria-label="실제 시세 종목코드" value={inputCode} onChange={e => setInputCode(e.target.value)} pattern="[0-9]{6}" maxLength={6} required inputMode="numeric" /></label>
          <button className="button secondary" type="submit" disabled={inputCode.trim() === code}>종목 조회</button>
        </form>
      </details>
    </div>
    {!validCode && <p role="alert">숫자 6자리 종목코드를 입력하세요.</p>}
    <LiveQuote key={code} code={code} validCode={validCode} />
  </section>;
}

function LiveQuote({ code, validCode }: { code: string; validCode: boolean }) {
  const { available, serverNow } = useWorkbench();
  const [params, setParams] = useSearchParams();
  const requested = params.get('range');
  const range = requested === '20' ? 20 : requested === '100' ? 100 : 60;
  const [data, setData] = useState<z.infer<typeof marketSnapshot> | null>(null);
  const [reading, setReading] = useState(false), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const [visible, setVisible] = useState(document.visibilityState === 'visible');

  useEffect(() => {
    const visibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);

  useEffect(() => {
    setReading(false);
    if (!validCode || !available || !visible) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function read() {
      setReading(true);
      try {
        const response = await fetch('/api/kis/market', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workbench': 'local' }, body: JSON.stringify({ code }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(40_000)]),
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const failure = z.object({ error: z.string().min(1).max(500) }).safeParse(body);
          throw new Error(response.status < 500 && failure.success ? failure.data.error : '현재가·일봉을 조회하지 못했습니다. 연결·설정을 확인한 뒤 다시 조회하세요.');
        }
        const parsed = marketSnapshot.safeParse(body);
        if (!parsed.success || parsed.data.quote.code !== code) throw new Error('시세 응답의 종목·가격·일봉을 확인하지 못했습니다. 다시 조회하세요.');
        if (controller.signal.aborted) return;
        setData(parsed.data); setError('');
        timer = setTimeout(read, MARKET_REFRESH_MS);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error && failure.name === 'Error' ? failure.message : '현재가·일봉을 조회하지 못했습니다. 연결·설정을 확인한 뒤 다시 조회하세요.');
      } finally { if (!controller.signal.aborted) setReading(false); }
    }
    timer = setTimeout(read, 200);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [code, validCode, available, visible, refresh]);

  const stale = data && (!available || !visible || Boolean(error) || serverNow - Date.parse(data.quote.receivedAt) >= MARKET_STALE_MS);
  const status = !validCode ? '종목코드 확인 필요' : !visible ? '자동 조회 일시정지'
    : !available ? '로컬 서버 연결 대기'
    : reading ? (data ? '조회 중 · 이전 수신값' : '조회 중')
    : error && !data ? '시세 조회 실패 · 수신값 없음'
    : stale ? '이전 수신값 · 최신 아님' : data ? '수신 완료' : '수신 대기';
  const bars = data?.bars.slice(-range) ?? [];
  function selectRange(n: number) {
    if (requested === String(n) || (requested === null && n === 60)) return;
    const selection = new URLSearchParams(params);
    selection.set('range', String(n));
    setParams(selection, { replace: true });
  }
  return <>
    <div className="trade-quote-source">
      <strong>KIS 모의 · KRX 시세</strong>
      <span role="group" aria-label="실제 시세 상태" className={stale || error ? 'trade-quote-warning' : ''}>{status}</span>
    </div>
    {data && <>
      <div className="quote"><strong role="group" aria-label="실제 현재가">{won(data.quote.price)}<small>원</small></strong><Change value={data.quote.change} />{stale && <Badge tone="amber">이전 수신값</Badge>}{data.quote.stopped && <Badge tone="amber">거래정지</Badge>}{data.quote.liquidation && <Badge tone="amber">정리매매 · 주의</Badge>}</div>
      <p className="trade-quote-time">서버 시세 수신 <time dateTime={data.quote.receivedAt}>{new Date(data.quote.receivedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST</time> · 체결 시각 미제공</p>
    </>}
    {error && <p className="notice warning" role="alert">{error} <Link className="text-link" to="/settings">연결·설정</Link></p>}
    <div className="trade-quote-actions">
      <button className="button secondary" disabled={reading || !visible || !available || !validCode} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15} />시세 다시 조회</button>
      {validCode && <Link className="text-link" to={`/paper?code=${code}`}>KIS 모의 주문 화면<ArrowRight size={15} /></Link>}
    </div>
    {data ? <>
      <div className="chart-toolbar">
        <div className="tabs" role="group" aria-label="일봉 범위">{[20, 60, 100].map(n => <button key={n} className={range === n ? 'active' : ''} aria-pressed={range === n} onClick={() => selectRange(n)}>{n}일봉</button>)}</div>
        <p className="trade-bars-caption">KIS 수정 종가 · {bars.length}개 거래일{bars.length < range && ` (선택 ${range}일)`} · 마지막 거래일 {dateLabel(bars.at(-1)!.date)}</p>
      </div>
      <Chart values={bars.map(bar => bar.close)} height={240} label={`${code} KIS 수정 일봉 종가 ${bars.length}개`} />
      <div className="chart-axis"><span>{dateLabel(bars[0].date)}</span><span>거래일 · 원</span><span>{dateLabel(bars.at(-1)!.date)}</span></div>
    </> : <Empty title={reading ? '실제 시세를 조회하고 있습니다' : '실제 시세 미수신'}>종목의 현재가와 일봉을 함께 수신하면 표시합니다.</Empty>}
    <details className="trade-data-details">
      <summary>시세 출처와 자동 갱신</summary>
      <p>KIS 모의 서버의 KRX 현재가와 수정 일봉을 조회합니다. 완료 {MARKET_REFRESH_MS / 1000}초 후 다시 조회하며, 실패하면 직접 다시 조회할 수 있습니다. 장외에는 마지막 시세가 표시됩니다.</p>
      {data && <div className="trade-facts"><div><span>거래량</span><strong>{data.quote.volume === undefined ? '미제공' : `${won(data.quote.volume)}주`}</strong></div><div><span>업종</span><strong>{data.quote.sector || '미제공'}</strong></div></div>}
    </details>
  </>;
}
