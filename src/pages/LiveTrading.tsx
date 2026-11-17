import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { z } from 'zod';
import { useWorkbench } from '../context';
import { Badge, Change, Chart, Empty, Panel } from '../components/ui';
import { MARKET_REFRESH_MS, MARKET_STALE_MS, marketDate, marketQuoteSchema } from '../../shared/market-data';
import { won } from '../../shared/model';

const marketSnapshot = z.object({
  quote: marketQuoteSchema,
  bars: z.array(z.object({ date: marketDate, close: z.number().positive() })).min(2).max(100)
    .refine(bars => bars.every((bar, i) => i === 0 || bars[i - 1].date < bar.date)),
});
const dateLabel = (date: string) => `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;

export function LiveTrading({ code }: { code: string }) {
  const { state, available } = useWorkbench();
  const [, setParams] = useSearchParams();
  const [inputCode, setInputCode] = useState(code), [range, setRange] = useState(60);
  const [data, setData] = useState<z.infer<typeof marketSnapshot> | null>(null);
  const [reading, setReading] = useState(false), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(Date.now), [visible, setVisible] = useState(document.visibilityState === 'visible');
  const validCode = /^\d{6}$/.test(code);
  const instrument = state.instruments.find(row => row.code === code);

  useEffect(() => {
    const visibility = () => { setVisible(document.visibilityState === 'visible'); setNow(Date.now()); };
    document.addEventListener('visibilitychange', visibility);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, []);

  useEffect(() => {
    setReading(false);
    if (!validCode || !available || !visible) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function read() {
      setReading(true); setError('');
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
        setData(parsed.data); setNow(Date.now());
        timer = setTimeout(read, MARKET_REFRESH_MS);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error && failure.name === 'Error' ? failure.message : '현재가·일봉을 조회하지 못했습니다. 연결·설정을 확인한 뒤 다시 조회하세요.');
      } finally { if (!controller.signal.aborted) setReading(false); }
    }
    timer = setTimeout(read, 200);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [code, validCode, available, visible, refresh]);

  const stale = data && (!available || Boolean(error) || now - Date.parse(data.quote.receivedAt) >= MARKET_STALE_MS);
  const status = !validCode ? '종목코드 확인 필요' : !visible ? '자동 조회 일시정지 · 이전 수신값'
    : !available ? '로컬 서버 연결 대기'
    : error && !data ? '시세 조회 실패 · 수신값 없음'
    : error || stale ? '이전 수신값 · 최신 아님'
    : reading ? (data ? '조회 중 · 이전 수신값' : '조회 중') : data ? '수신 완료' : '수신 대기';
  const bars = data?.bars.slice(-range) ?? [];
  return <div className="trade-page live-trade">
    <div className="notice compact"><div><strong>실제 주가 · KIS 모의 서버의 KRX 시세</strong><br />조회 완료 {MARKET_REFRESH_MS / 1000}초 후 갱신합니다. 수신 시각은 체결 시각이 아니며, 장외에는 마지막 시세가 표시됩니다.</div></div>
    <div className="trade-grid top-gap">
      <Panel title={instrument ? `${instrument.name} · ${code}` : `종목 ${code || '미입력'}`} action={<Badge tone="teal">KIS · REST</Badge>}>
        <div className="live-trade-selection">
          <label className="field">실제 시세 종목<select aria-label="실제 시세 종목" value={code} onChange={e => setParams({ code: e.target.value })}>
            {!instrument && <option value={code}>{code || '종목 선택'}</option>}
            {state.instruments.map(row => <option key={row.code} value={row.code}>{row.name} · {row.code}</option>)}
          </select></label>
          <form className="button-row" onSubmit={e => { e.preventDefault(); setParams({ code: inputCode.trim() }); }}>
            <label className="field">종목코드<input aria-label="실제 시세 종목코드" value={inputCode} onChange={e => setInputCode(e.target.value)} pattern="[0-9]{6}" maxLength={6} required inputMode="numeric" /></label>
            <button className="button secondary" type="submit">종목 조회</button>
          </form>
        </div>
        {!validCode && <p role="alert">숫자 6자리 종목코드를 입력하세요.</p>}
        <div className="toolbar"><p role="group" aria-label="실제 시세 상태">{status}</p><button className="button secondary" disabled={reading || !available || !validCode} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15} />시세 다시 조회</button></div>
        {error && <p className="notice warning" role="alert">{error} <Link className="text-link" to="/settings">연결·설정</Link></p>}
        {data ? <>
          <div className="quote"><strong role="group" aria-label="실제 현재가">{won(data.quote.price)}<small>원</small></strong><Change value={data.quote.change} />{data.quote.stopped && <Badge tone="amber">거래정지</Badge>}{data.quote.liquidation && <Badge tone="amber">정리매매 · 주의</Badge>}</div>
          <p className="muted tiny">시세 수신 {new Date(data.quote.receivedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST · {stale ? '이전 수신값' : 'KIS 조회값'}</p>
          <div className="chart-toolbar"><div className="tabs">{[20, 60, 100].map(n => <button key={n} className={range === n ? 'active' : ''} aria-pressed={range === n} onClick={() => setRange(n)}>{n}일봉</button>)}</div><span className="muted">수정 종가 · {bars.length}개 거래일</span></div>
          <Chart values={bars.map(bar => bar.close)} height={290} label={`${code} KIS 수정 일봉 종가 ${bars.length}개`} />
          <div className="chart-axis"><span>{dateLabel(bars[0].date)}</span><span>거래일 · 원</span><span>{dateLabel(bars.at(-1)!.date)}</span></div>
          <div className="trade-facts"><div><span>거래량</span><strong>{data.quote.volume === undefined ? '미제공' : `${won(data.quote.volume)}주`}</strong></div><div><span>업종</span><strong>{data.quote.sector || '미제공'}</strong></div><div><span>가격 출처</span><strong>KIS · KRX</strong></div></div>
        </> : <Empty title={reading ? '실제 시세를 조회하고 있습니다' : '실제 시세 미수신'}>조회 전에는 가격과 차트를 표시하지 않습니다. 연결·설정과 종목코드를 확인하세요.</Empty>}
      </Panel>
      <Panel title="KIS 모의 주문" action={<Badge>별도 확인</Badge>}>
        <p className="prose">선택한 종목의 시세와 모의 계좌를 확인한 뒤 주문할 수 있습니다.</p>
        {validCode && <Link className="button primary wide top-gap" to={`/paper?code=${code}`}>KIS 모의 주문 화면<ArrowRight size={16} /></Link>}
        <p className="muted tiny top-gap">이 화면의 자동 갱신은 시세 조회만 수행합니다. 주문·취소·계좌 조회는 자동 실행하지 않습니다.</p>
        <p className="muted tiny top-gap">DEMO 연습은 별도 합성 가격과 자산을 사용합니다. 실제 시세를 DEMO 체결 가격으로 사용하지 않습니다.</p>
      </Panel>
    </div>
  </div>;
}
