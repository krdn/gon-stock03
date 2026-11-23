import { RealtimeStatus } from '../components/RealtimeStatus';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './DataInventory.css';
import { Badge, Empty, Panel } from '../components/ui';
import { useWorkbench } from '../context';
import { addDays, masterDataSchema, type DailyRun, type MasterDataSnapshot, type StoredBar } from '../../shared/market-data';
import { dailyDetailSchema, dailyRunsSchema } from '../../shared/data-inventory';
import { freshness } from '../../shared/status';

const date = (value: string) => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
const kst = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'medium' });
const time = (value: string | null) => value ? <time dateTime={value}>{kst.format(new Date(value))} KST</time> : '없음';
const policy = (run: DailyRun) => run.adjustment === 'adjusted' ? '수정주가' : '원주가';
const qualityLabels = { pending: '대조 대기', unverified: '달력 미검증', passed: '입력 달력 대조 통과', failed: '입력 달력 불일치' };

function DailyDetail({ id, revision, runs, onSettled }: {
  id: string; revision: number; runs: DailyRun[]; onSettled: (id: string | null) => void;
}) {
  const { serverNow } = useWorkbench();
  const [detail, setDetail] = useState<{ run: DailyRun; bars: StoredBar[] } | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); onSettled(null);
    void (async () => {
      try {
        const response = await fetch(`/api/data/daily/${id}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (!response.ok) throw new Error();
        const next = dailyDetailSchema.parse(await response.json());
        if (next.run.id !== id || next.bars.some(bar => bar.code !== next.run.code || bar.adjustment !== next.run.adjustment)) throw new Error();
        if (!controller.signal.aborted) setDetail(next);
      } catch { if (!controller.signal.aborted) setError('상세 조회 실패'); }
      finally { if (!controller.signal.aborted) { setLoading(false); onSettled(id); } }
    })();
    return () => controller.abort();
  }, [id, revision, onSettled]);
  const run = detail?.run;
  const lastSuccess = run && [...runs, run].filter(row => row.code === run.code && row.adjustment === run.adjustment && row.status.lastSuccessAt).map(row => row.status.lastSuccessAt!).sort().at(-1);
  return <section aria-label="일봉 수집 상세" className="top-gap data-detail" aria-busy={loading}>
    {loading && <p role="status">상세 조회 중{detail && ' · 이전 표시를 확인 중입니다.'}</p>}
    {error && <p role="alert" className="soft-note">{error}{detail && ' · 이전 표시는 최신 확인값이 아닙니다.'} 저장 상태 새로고침으로 다시 확인하세요.</p>}
    {run && <>
      <h3>{run.code} · {policy(run)} · KRX</h3>
      <div className="toolbar"><Badge>{run.coverageComplete ? '구간 수집 종료' : run.status.pages ? '일부 수집' : '수집 전'}</Badge><Badge>{qualityLabels[run.quality.state]}</Badge><Badge>{run.status.error ? (detail.bars.length ? '수집 실패 · 이전 저장분' : '수집 실패 · 저장 없음') : run.status.phase === 'loading' ? '수집 중' : !detail.bars.length ? '저장 없음' : freshness(run.status, Number.isFinite(serverNow) ? serverNow : Date.now()).phase === 'stale' ? '수집 후 오래됨' : '저장 스냅샷'}</Badge></div>
      {run.status.error && <p role="alert" className="soft-note">{run.status.error}</p>}
      <dl className="data-facts inventory-range">
        <div><dt>저장 범위</dt><dd><strong>저장 {detail.bars.length}봉</strong>{detail.bars.length > 0 && <small>{date(detail.bars[0].date)} ~ {date(detail.bars.at(-1)!.date)}</small>}</dd></div>
        <div><dt>미수집 구간</dt><dd>{run.nextDate ? `${date(run.nextDate)} ~ ${date(run.to)}` : '없음 · 품질 판정은 별도'}</dd></div>
      </dl>
      <p className="inventory-quality">{run.quality.state === 'pending' ? '누락 일수 미확인 · 수집이 끝나면 대조합니다.' : run.quality.state === 'unverified'
        ? `누락 일수 미확인 · 평일 누락 후보 ${run.quality.candidateMissingDates.length}일`
        : `입력 달력상 누락 ${run.quality.missingDates.length}일 · 예상 밖 거래일 ${run.quality.unexpectedDates.length}일`}</p>
      <details><summary>품질 상세 펼치기</summary>
        {run.calendar ? <p>입력 달력 {run.calendar.source} · 출처 진위·공식 달력 인증 아님</p> : <p>달력 미제공 · 휴장·상장 전·정지를 판정하지 않습니다.</p>}
        {['passed', 'failed'].includes(run.quality.state) && <><p>입력 달력상 누락: {run.quality.missingDates.map(date).join(', ') || '없음'}</p><p>예상 밖 거래일: {run.quality.unexpectedDates.map(date).join(', ') || '없음'}</p></>}
        {run.quality.state === 'unverified' && <p>평일 누락 후보: {run.quality.candidateMissingDates.map(date).join(', ') || '없음'}</p>}
        <p>저장 응답에서 중복 제거 {run.quality.duplicates}건 · 빈 응답 {run.quality.emptyWindows.length}구간</p>
        {run.quality.emptyWindows.map(window => <p key={window.from}>{date(window.from)} ~ {date(window.to)}</p>)}
      </details>
      <details><summary>수집 시각·출처·기록 ID</summary><dl className="data-facts">
        <div><dt>요청 기간</dt><dd>{date(run.from)} ~ {date(run.to)}</dd></div>
        <div><dt>응답 저장 구간</dt><dd>{run.status.pages}구간{run.status.pages > 0 && <> · {date(run.from)} ~ {date(run.nextDate ? addDays(run.nextDate, -1) : run.to)}</>}<small>저장 구간 안에도 누락 거래일이 있을 수 있습니다.</small></dd></div>
        <div><dt>최근 수집 시도</dt><dd>{time(run.status.observedAt)}</dd></div>
        <div><dt>이번 기록 전체 성공</dt><dd>{time(run.status.lastSuccessAt)}</dd></div>
        <div><dt>동일 종목·정책 마지막 전체 성공</dt><dd data-testid="daily-last-success">{time(lastSuccess ?? null)}<small>다른 수집 ID·요청 기간의 성공일 수 있습니다.</small></dd></div>
        <div><dt>출처·수집 기준일</dt><dd>KIS 모의 REST · {date(run.captureDate)}<small>현재 시세·PIT 인증 아님</small></dd></div>
        <div><dt>수집 ID</dt><dd>{run.id}</dd></div>
      </dl></details>
      <details><summary>저장 거래일 펼치기</summary>{detail.bars.length ? <div className="table-scroll"><table><thead><tr><th>거래일</th><th>종가</th><th>거래량</th><th>수집 시각 (KST)</th></tr></thead><tbody>{detail.bars.map(bar => <tr key={bar.date}><td>{date(bar.date)}</td><td>{bar.close.toLocaleString('ko-KR')}</td><td>{bar.volume.toLocaleString('ko-KR')}</td><td>{time(bar.collectedAt)}</td></tr>)}</tbody></table></div> : <p>저장된 거래일이 없습니다. 합성 봉이나 0원으로 채우지 않습니다.</p>}</details>
      <p className="inventory-caption">백테스트에서 수집 기록의 종목·기간·정책을 확인하세요.</p>
      <Link className="text-link inventory-next" to={`/backtest?source=stored&run=${run.id}`}>백테스트에서 저장 일봉 확인 →</Link>
    </>}
  </section>;
}

export function DataStatus() {
  const { state, server, available, status } = useWorkbench();
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search);
  const navigate = useNavigate();
  const [master, setMaster] = useState<MasterDataSnapshot | null>(null), [runs, setRuns] = useState<DailyRun[] | null>(null);
  const [masterError, setMasterError] = useState(''), [runsError, setRunsError] = useState('');
  const [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setMasterError(''); setRunsError('');
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
    void Promise.allSettled([
      (async () => {
        try { const response = await fetch('/api/data/master', { signal }); if (!response.ok) throw new Error(); const next = masterDataSchema.parse(await response.json()); if (!controller.signal.aborted) setMaster(next); }
        catch { if (!controller.signal.aborted) setMasterError('마스터 조회 실패'); }
      })(),
      (async () => {
        try { const response = await fetch('/api/data/daily', { signal }); if (!response.ok) throw new Error(); const next = dailyRunsSchema.parse(await response.json()); if (!controller.signal.aborted) setRuns(next.runs); }
        catch { if (!controller.signal.aborted) setRunsError('일봉 목록 조회 실패'); }
      })(),
    ]).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const requested = params.get('run');
  const selected = requested === null ? runs?.[0] : runs?.find(run => run.id === requested);
  const [settledDetail, setSettledDetail] = useState<string | null>(null);
  const waitingForDetail = hash === '#inventory-demo' && selected && settledDetail !== selected.id;
  const picker = useRef<HTMLSelectElement>(null);
  const alignedHash = useRef('');
  useEffect(() => {
    if (!hash) { alignedHash.current = ''; return; }
    if (loading || waitingForDetail || alignedHash.current === hash || !['#inventory-master', '#inventory-daily', '#inventory-demo'].includes(hash)) return;
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      alignedHash.current = hash;
      const active = document.activeElement;
      const trigger = active instanceof HTMLAnchorElement && active.hash === hash;
      if (active !== document.body && active !== target && !trigger) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, loading, waitingForDetail]);
  function choose(id: string) {
    const next = new URLSearchParams(params);
    next.set('run', id);
    navigate({ search: next.toString(), hash });
  }
  return <div className="data-inventory">
    <div className="inventory-tools"><nav aria-label="저장 자료 바로가기">
      <a href="#inventory-master">마스터</a><a href="#inventory-daily">KIS 일봉</a><a href="#inventory-demo">DEMO 합성</a>
    </nav><button className="button secondary" disabled={loading} onClick={() => setRevision(value => value + 1)}>저장 상태 새로고침</button></div>
    <p className="inventory-caption" role="status">{loading ? (master?.sources.length || runs?.length ? '저장 상태 조회 중 · 이전 표시는 최신 확인 전입니다.' : '저장 상태 조회 중') : '새로고침은 저장 자료만 다시 읽습니다.'}</p>
    <div className="inventory-layout">
      <section id="inventory-master" tabIndex={-1} aria-label="공개 마스터 상태"><Panel title="국내 주식·ETF 마스터" eyebrow="KIS PUBLIC MASTER">
        {!master && loading && !masterError && <p role="status">저장 마스터 확인 중</p>}
        {masterError && <p role="alert" className="soft-note">{masterError}{master?.sources.length ? ' · 이전 표시는 최신 확인값이 아닙니다.' : ' · 저장 상태 새로고침으로 다시 확인하세요.'}</p>}
        {master?.sources.map(source => <div className="inventory-source" key={source.exchange}>
          <h3>{source.exchange} · {source.count.toLocaleString('ko-KR')}종목 <Badge>{({ ready: '저장 스냅샷', loading: '수집 중', error: source.lastSuccessAt ? '수집 실패 · 이전 목록' : '수집 실패 · 저장 없음' })[source.phase]}</Badge></h3>
          <p>마지막 성공 {time(source.lastSuccessAt)}</p>
          {source.error && <p role="alert" className="inventory-warning">{source.error}</p>}
        </div>)}
        {master && master.sources.length > 0 && <>{(['KOSPI', 'KOSDAQ'] as const).filter(exchange => !master.sources.some(source => source.exchange === exchange)).map(exchange => <p key={exchange} className="inventory-warning">{exchange} · 저장 상태 미확인</p>)}
          <details><summary>최근 시도·출처</summary>{master.sources.map(source => <p key={source.exchange}>{source.exchange} · {time(source.observedAt)}<br />{source.source}</p>)}<p>기준 거래일 미확인 · 수집 시각은 거래일이 아닙니다.</p></details></>}
        {master && !master.sources.length && !masterError && !loading && <Empty title="저장된 마스터가 없습니다">시장 탐색에서 공식 마스터를 수집할 수 있습니다.</Empty>}
        <Link className="text-link inventory-next" to="/market">시장 탐색에서 마스터 확인 →</Link>
      </Panel></section>
      <section id="inventory-daily" tabIndex={-1} aria-label="KIS 저장 일봉"><Panel title="기간별 일봉 수집 기록" eyebrow="KIS PAPER · REST · KRX">
        {!runs && loading && !runsError && <p role="status">일봉 목록 확인 중</p>}
        {runsError && <p role="alert" className="soft-note">{runsError}{runs?.length ? ' · 이전 표시는 최신 확인값이 아닙니다.' : ' · 저장 상태 새로고침으로 다시 확인하세요.'}</p>}
        {requested !== null && runs && !selected && !runsError && !loading && <p role="status" className="inventory-warning">요청한 수집 기록을 찾을 수 없습니다. {runs[0] && <button className="text-link" onClick={() => { choose(runs[0].id); picker.current?.focus(); }}>최근 기록 보기</button>}</p>}
        {runs && runs.length > 0 && <><label className="field">일봉 수집 기록<select ref={picker} value={selected?.id ?? ''} onChange={event => choose(event.target.value)}>
          {!selected && <option disabled value="">기록 선택</option>}
          {runs.map((run, index) => <option key={run.id} value={run.id}>기록 {runs.length - index} · {run.code} · {policy(run)} · {date(run.from)} ~ {date(run.to)}</option>)}
        </select></label>{selected && <DailyDetail key={selected.id} id={selected.id} revision={revision} runs={runs} onSettled={setSettledDetail} />}</>}
        {runs?.length === 0 && !runsError && !loading && <Empty title="저장된 KIS 일봉이 없습니다">합성 봉은 여기에 포함하지 않습니다. 기존 수집 API로 저장한 기록이 표시됩니다.</Empty>}
      </Panel></section>
      <section id="inventory-demo" tabIndex={-1} aria-label="DEMO 합성 데이터"><Panel title="합성 데이터 인벤토리" eyebrow="DEMO · 실제 과거 아님">
        {!server ? <p role="status">{status.phase === 'loading' ? '로컬 합성 자료 확인 중' : '로컬 합성 자료 미확인'}</p> : <>
          {!available && <p role="status" className="inventory-warning">로컬 합성 자료 재확인 전 · 이전 저장 상태</p>}
          <p><strong>예시 {state.instruments.length}종목</strong> · 추가 재생 {state.tick}회</p>
          <details><summary>종목별 합성 봉 보기</summary><div className="table-scroll"><table><thead><tr><th>예시 종목</th><th>코드</th><th>합성 봉 수</th></tr></thead><tbody>{state.instruments.map(instrument => <tr key={instrument.code}><td>{instrument.name}</td><td>{instrument.code}</td><td>{instrument.history.length}</td></tr>)}</tbody></table></div></details>
        </>}
        <p className="inventory-caption">실제 거래일·수정주가 미부여. 백테스트의 데이터 출처에서 DEMO 합성을 선택하세요.</p>
        <div className="inventory-links">
          <Link className="text-link inventory-next" to="/backtest?source=demo">백테스트에서 합성 출처 확인 →</Link>
          <Link className="text-link inventory-next" to="/market">시장 탐색에서 공식 종목 대조 →</Link>
        </div>
      </Panel></section>
    </div>
    <details className="inventory-reference"><summary>수집 기준과 검증 한계</summary>
      <p>공개 마스터로 종목을 확인하고, 기간·수정주가 정책을 고정해 수집한 일봉을 입력 달력과 대조합니다. 달력 대조 통과만으로 가격 정확성·과거 시점 데이터를 인증할 수 없습니다. KIS 당일 분봉은 전일 데이터를 제공하지 않습니다.</p>
      <Link className="text-link" to="/design?tab=screens&screen=data">데이터 화면 계약 보기 →</Link> · <Link className="text-link" to="/design?tab=sources">공식 근거와 제약 보기 →</Link>
    </details>
    <RealtimeStatus />
  </div>;
}
