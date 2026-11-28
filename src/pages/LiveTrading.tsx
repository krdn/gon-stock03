import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, RefreshCw, Star } from 'lucide-react';
import { z } from 'zod';
import { useWorkbench } from '../context';
import { Badge, Change, Chart, Empty } from '../components/ui';
import { DEFAULT_PAPER_MAX_QTY } from '../../shared/contracts';
import { MARKET_REFRESH_MS, MARKET_STALE_MS, marketDate, marketQuoteSchema } from '../../shared/market-data';
import { won } from '../../shared/model';
import './trade-v2.css';

const marketSnapshot = z.object({
  quote: marketQuoteSchema,
  bars: z.array(z.object({ date: marketDate, close: z.number().positive() })).min(2).max(100)
    .refine(bars => bars.every((bar, i) => i === 0 || bars[i - 1].date < bar.date)),
});
const dateLabel = (date: string) => `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;

const realtimePhaseLabels = {
  stopped: '실시간 미연결',
  connecting: '실시간 연결 중',
  reconciling: 'REST 대조 필요',
  ready: '실시간 정상',
  disconnected: '실시간 수신 중단',
  error: '실시간 오류',
} as const;

/** 손익/차이 금액을 `-0원` 없이 부호·색상과 함께 포맷한다. */
function formatSignedWon(value: number): { text: string; tone: '' | 'up' | 'down' } {
  if (!Number.isFinite(value)) return { text: '평가 불가', tone: '' };
  const rounded = Math.round(value);
  if (rounded > 0) return { text: `+${rounded.toLocaleString('ko-KR')}원`, tone: 'up' };
  if (rounded < 0) return { text: `${rounded.toLocaleString('ko-KR')}원`, tone: 'down' };
  return { text: '0원', tone: '' };
}

/** 비율(%)을 `-0.00%` 없이 부호·색상과 함께 포맷한다. */
function formatSignedPct(value: number): { text: string; tone: '' | 'up' | 'down' } {
  if (!Number.isFinite(value)) return { text: '—', tone: '' };
  const rounded = Math.round(value * 100) / 100;
  if (rounded > 0) return { text: `+${rounded.toFixed(2)}%`, tone: 'up' };
  if (rounded < 0) return { text: `${rounded.toFixed(2)}%`, tone: 'down' };
  return { text: '0.00%', tone: '' };
}

/** 실제 KIS 모의 시세 조회 및 종목 진단 화면 (`/trade` 기본 모드). */
export function LiveTrading({ code }: { code: string }) {
  const { state, available, busy, act } = useWorkbench();
  const [params, setParams] = useSearchParams();
  const [inputCode, setInputCode] = useState(code);
  const validCode = /^\d{6}$/.test(code);
  const instrument = state.instruments.find(row => row.code === code);
  const inWatchlist = state.watchlist.includes(code);
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
      {validCode && <button
        type="button"
        className={`button secondary small-button trade-watch-toggle${inWatchlist ? ' active' : ''}`}
        aria-pressed={inWatchlist}
        disabled={!available || busy || !validCode}
        onClick={() => { void act('watchlist', { code }).catch(() => {}); }}
      >
        <Star size={14} aria-hidden="true" />
        {inWatchlist ? '관심종목 해제' : '관심종목 등록'}
      </button>}
    </div>
    {state.watchlist.length > 0 && <div className="trade-watchlist-bar" role="group" aria-label="관심종목 빠른 선택">
      <span className="trade-watchlist-label">관심종목</span>
      <div className="trade-watchlist-chips">
        {state.watchlist.map(wCode => {
          const item = state.instruments.find(row => row.code === wCode);
          const isNumericCode = /^\d{6}$/.test(wCode);
          const active = wCode === code;
          return <button
            key={wCode}
            type="button"
            className={`trade-watch-chip${active ? ' active' : ''}`}
            aria-pressed={active}
            disabled={!isNumericCode}
            title={!isNumericCode ? '실제 시세는 숫자 6자리 종목코드만 조회할 수 있습니다.' : undefined}
            onClick={() => { if (isNumericCode) choose(wCode); }}
          >
            <span>{item ? item.name : wCode}</span>
            {item && <small>{wCode}</small>}
            {!isNumericCode && <small>숫자 코드만 조회</small>}
          </button>;
        })}
      </div>
    </div>}
    {!validCode && <p role="alert">숫자 6자리 종목코드를 입력하세요.</p>}
    <LiveQuote key={code} code={code} validCode={validCode} />
  </section>;
}

function LiveQuote({ code, validCode }: { code: string; validCode: boolean }) {
  const { state, available, serverNow, connection, realtime, paperRisk } = useWorkbench();
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

  // 호가·가격제한폭 요약 계산
  const quote = data?.quote;
  const validBand = Boolean(quote && quote.lower > 0 && quote.upper > quote.lower && quote.price > 0);
  const upperRoom = validBand && quote ? formatSignedPct(((quote.upper - quote.price) / quote.price) * 100) : null;
  const lowerRoom = validBand && quote ? formatSignedPct(((quote.lower - quote.price) / quote.price) * 100) : null;
  const bandPct = validBand && quote
    ? Math.min(100, Math.max(0, Math.round(((quote.price - quote.lower) / (quote.upper - quote.lower)) * 100)))
    : null;
  const tradeStateLabel = !quote
    ? '미제공'
    : quote.stopped
      ? '거래정지'
      : quote.liquidation === true
        ? '정리매매 주의'
        : quote.liquidation === false
          ? '정상 거래'
          : '정리매매 미제공';

  // 선택 구간 일봉 추세 및 SMA 20/60 계산
  const trendSummary = (() => {
    if (!data || bars.length === 0) return null;
    const firstClose = bars[0].close;
    const lastClose = bars[bars.length - 1].close;
    const diff = formatSignedWon(lastClose - firstClose);
    const pct = firstClose > 0 ? formatSignedPct(((lastClose - firstClose) / firstClose) * 100) : { text: '0.00%', tone: '' as const };
    let maxBar = bars[0];
    let minBar = bars[0];
    for (const bar of bars) {
      if (bar.close > maxBar.close) maxBar = bar;
      if (bar.close < minBar.close) minBar = bar;
    }
    const allBars = data.bars;
    const latestClose = allBars[allBars.length - 1].close;
    const computeSma = (period: number) => {
      if (allBars.length < period) return null;
      const avg = allBars.slice(-period).reduce((sum, bar) => sum + bar.close, 0) / period;
      const disparity = avg > 0 ? formatSignedPct(((latestClose - avg) / avg) * 100) : { text: '0.00%', tone: '' as const };
      return { avg, disparity };
    };
    return { diff, pct, maxBar, minBar, sma20: computeSma(20), sma60: computeSma(60) };
  })();

  // 선택 종목 KIS 모의 보유·위험·연계 허브 계산 (DEMO 현금/가격 미사용)
  const kisPosition = available && connection.balance
    ? connection.balance.positions.find(p => p.code === code && p.qty > 0)
    : undefined;
  const kisPositionProfit = kisPosition && quote
    ? formatSignedWon((quote.price - kisPosition.average) * kisPosition.qty)
    : null;
  const realtimeLabel = available && realtime ? realtimePhaseLabels[realtime.phase] : '실시간 미확인';
  const kisStrategies = state.strategies.filter(s => (s.environment ?? 'demo') === 'kis-paper' && s.code === code);
  const activeKisStrategies = kisStrategies.filter(s => s.active).length;
  const journalCount = state.journal.filter(j => j.code === code).length;
  const paperTarget = validCode ? `/paper?code=${encodeURIComponent(code)}` : '/paper';

  return <>
    <div className="trade-quote-source">
      <strong>KIS 모의 · KRX 시세</strong>
      <span role="group" aria-label="실제 시세 상태" className={stale || error ? 'trade-quote-warning' : ''}>{status}</span>
    </div>
    {data && quote && <>
      <div className="quote"><strong role="group" aria-label="실제 현재가">{won(quote.price)}<small>원</small></strong><Change value={quote.change} />{stale && <Badge tone="amber">이전 수신값</Badge>}{quote.stopped && <Badge tone="amber">거래정지</Badge>}{quote.liquidation && <Badge tone="amber">정리매매 · 주의</Badge>}</div>
      <p className="trade-quote-time">서버 시세 수신 <time dateTime={quote.receivedAt}>{new Date(quote.receivedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST</time> · 체결 시각 미제공</p>
    </>}
    {error && <p className="notice warning" role="alert">{error} <Link className="text-link" to="/settings">연결·설정</Link></p>}
    <div className="trade-quote-actions">
      <button className="button secondary" disabled={reading || !visible || !available || !validCode} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15} />시세 다시 조회</button>
      {validCode && <Link className="text-link" to={`/paper?code=${code}`}>KIS 모의 주문 화면<ArrowRight size={15} /></Link>}
    </div>
    {data && quote && <dl className="trade-quote-metrics" aria-label="실제 호가 및 가격제한폭 요약">
      <div>
        <dt>상한가</dt>
        <dd>{quote.upper > 0 ? <>{won(quote.upper)}원{upperRoom !== null && <small className={upperRoom.tone}> 상단 여유 {upperRoom.text}</small>}</> : '계산 불가'}</dd>
      </div>
      <div>
        <dt>하한가</dt>
        <dd>{quote.lower > 0 ? <>{won(quote.lower)}원{lowerRoom !== null && <small className={lowerRoom.tone}> 하단 여유 {lowerRoom.text}</small>}</> : '계산 불가'}</dd>
      </div>
      <div>
        <dt>호가 단위</dt>
        <dd>{won(quote.tickSize)}원</dd>
      </div>
      <div>
        <dt>가격제한폭 위치</dt>
        <dd>
          {validBand && bandPct !== null ? <>
            <span>{bandPct}%</span>
            <div className="trade-band-meter" aria-hidden="true"><span style={{ width: `${bandPct}%` }} /></div>
          </> : <span>계산 불가</span>}
        </dd>
      </div>
      <div>
        <dt>누적 거래량</dt>
        <dd>{quote.volume === undefined ? '미제공' : `${won(quote.volume)}주`}</dd>
      </div>
      <div>
        <dt>업종 · 거래 상태</dt>
        <dd>{quote.sector || '미제공'} · {tradeStateLabel}</dd>
      </div>
    </dl>}
    {data ? <>
      <div className="chart-toolbar">
        <div className="tabs" role="group" aria-label="일봉 범위">{[20, 60, 100].map(n => <button key={n} className={range === n ? 'active' : ''} aria-pressed={range === n} onClick={() => selectRange(n)}>{n}일봉</button>)}</div>
        <p className="trade-bars-caption">KIS 수정 종가 · {bars.length}개 거래일{bars.length < range && ` (선택 ${range}일)`} · 마지막 거래일 {dateLabel(bars.at(-1)!.date)}</p>
      </div>
      <Chart values={bars.map(bar => bar.close)} height={240} label={`${code} KIS 수정 일봉 종가 ${bars.length}개`} />
      <div className="chart-axis"><span>{dateLabel(bars[0].date)}</span><span>거래일 · 원</span><span>{dateLabel(bars.at(-1)!.date)}</span></div>
      {trendSummary && <section className="trade-trend-summary" aria-label="선택 구간 일봉 추세 요약">
        <dl className="trade-trend-grid">
          <div>
            <dt>선택 구간 수익률</dt>
            <dd className={trendSummary.pct.tone}>{trendSummary.pct.text} <small>({trendSummary.diff.text})</small></dd>
          </div>
          <div>
            <dt>구간 최고 / 최저 종가</dt>
            <dd>{`최고 ${won(trendSummary.maxBar.close)}원 (${dateLabel(trendSummary.maxBar.date)} 기준) · 최저 ${won(trendSummary.minBar.close)}원 (${dateLabel(trendSummary.minBar.date)} 기준)`}</dd>
          </div>
          <div>
            <dt>20일 이동평균 (SMA 20)</dt>
            <dd>{trendSummary.sma20
              ? <>{won(trendSummary.sma20.avg)}원 <small className={trendSummary.sma20.disparity.tone}>이격 {trendSummary.sma20.disparity.text}</small></>
              : '표본 부족 (20거래일 미만)'}</dd>
          </div>
          <div>
            <dt>60일 이동평균 (SMA 60)</dt>
            <dd>{trendSummary.sma60
              ? <>{won(trendSummary.sma60.avg)}원 <small className={trendSummary.sma60.disparity.tone}>이격 {trendSummary.sma60.disparity.text}</small></>
              : '표본 부족 (60거래일 미만)'}</dd>
          </div>
        </dl>
      </section>}
    </> : <Empty title={reading ? '실제 시세를 조회하고 있습니다' : '실제 시세 미수신'}>종목의 현재가와 일봉을 함께 수신하면 표시합니다.</Empty>}
    <section className="trade-hub" aria-label="선택 종목 KIS 모의 매매 및 워크스페이스 현황">
      <div className="trade-hub-grid">
        <article className="trade-hub-card">
          <h3>선택 종목 KIS 모의 보유</h3>
          <dl className="trade-hub-list">
            <div>
              <dt>보유 요약</dt>
              <dd>{!available
                ? '상태 미확인'
                : !connection.balance
                  ? 'KIS 잔고 미조회 (연결·설정에서 조회)'
                  : !kisPosition
                    ? '해당 종목 KIS 모의 보유 없음'
                    : `보유 ${kisPosition.qty.toLocaleString('ko-KR')}주 · 주문가능 ${kisPosition.sellable !== undefined ? `${kisPosition.sellable.toLocaleString('ko-KR')}주` : '미확인'} · 평단 ${kisPosition.average.toLocaleString('ko-KR', { maximumFractionDigits: 20 })}원`}</dd>
            </div>
            {kisPosition && <div>
              <dt>현재 수신가 기준 평가손익</dt>
              <dd className={kisPositionProfit?.tone ?? ''}>{kisPositionProfit ? kisPositionProfit.text : '현재가 수신 후 계산'}</dd>
            </div>}
          </dl>
        </article>
        <article className="trade-hub-card">
          <h3>KIS 주문 · 위험 준비 상태</h3>
          <dl className="trade-hub-list">
            <div>
              <dt>신규 주문 제어</dt>
              <dd>{!available ? '상태 미확인' : state.risk.halted ? '긴급정지 켜짐 (신규 주문 정지)' : '긴급정지 꺼짐 (정상)'}</dd>
            </div>
            <div>
              <dt>KIS 수동 주문 상한</dt>
              <dd>{available ? `1회 ${state.paperManualMaxQty ?? DEFAULT_PAPER_MAX_QTY}주` : '미확인'}</dd>
            </div>
            <div>
              <dt>공통 한도</dt>
              <dd>{available ? `1회 ${won(state.risk.maxOrder)}원 / 종목별 ${won(state.risk.maxPosition)}원` : '미확인'}</dd>
            </div>
            <div>
              <dt>실시간 · 불명 상태</dt>
              <dd>{!available ? '상태 미확인' : `${realtimeLabel} · ${paperRisk ? `불명·전송 중 ${paperRisk.unresolvedCount}건` : '불명·전송 중 미확인'}`}</dd>
            </div>
          </dl>
        </article>
        <article className="trade-hub-card">
          <h3>연계 전략 · 연구 · 일지 허브</h3>
          <dl className="trade-hub-list">
            <div>
              <dt>선택 종목 KIS 모의 전략</dt>
              <dd>{available ? `저장 ${kisStrategies.length}개 · 실행 중 ${activeKisStrategies}개` : '미확인'}</dd>
            </div>
            <div>
              <dt>선택 종목 매매일지</dt>
              <dd>{available ? `기록 ${journalCount}건` : '미확인'}</dd>
            </div>
          </dl>
          <div className="trade-hub-links">
            <Link className="text-link" to={paperTarget}>KIS 모의 매매·원장 대조 ↗</Link>
            <Link className="text-link" to="/strategies?environment=kis-paper">KIS 전략 스튜디오 ↗</Link>
            <Link className="text-link" to="/backtest">일봉 백테스트 ↗</Link>
            <Link className="text-link" to="/journal">매매일지 기록 ↗</Link>
          </div>
        </article>
      </div>
    </section>
    <details className="trade-data-details">
      <summary>시세 출처와 자동 갱신</summary>
      <p>KIS 모의 서버의 KRX 현재가와 수정 일봉을 조회합니다. 완료 {MARKET_REFRESH_MS / 1000}초 후 다시 조회하며, 실패하면 직접 다시 조회할 수 있습니다. 장외에는 마지막 시세가 표시됩니다.</p>
      {data && quote && <div className="trade-facts"><div><span>거래량</span><strong>{quote.volume === undefined ? '미제공' : `${won(quote.volume)}주`}</strong></div><div><span>업종</span><strong>{quote.sector || '미제공'}</strong></div></div>}
    </details>
  </>;
}
