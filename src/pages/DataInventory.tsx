import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Empty, Panel, Stat } from '../components/ui';
import { useWorkbench } from '../context';
import { addDays, masterDataSchema, type DailyRun, type MasterDataSnapshot, type StoredBar } from '../../shared/market-data';
import { dailyDetailSchema, dailyRunsSchema } from '../../shared/data-inventory';
import { freshness } from '../../shared/status';

const date = (value: string) => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
const time = (value: string | null) => value ? <time dateTime={value}>{value}</time> : '없음';

function DailyDetail({ id, revision, runs }: { id: string; revision: number; runs: DailyRun[] }) {
  const [detail, setDetail] = useState<{ run: DailyRun; bars: StoredBar[] } | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    void (async () => {
      try {
        const response = await fetch(`/api/data/daily/${id}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (!response.ok) throw new Error();
        const next = dailyDetailSchema.parse(await response.json());
        if (next.run.id !== id || next.bars.some(bar => bar.code !== next.run.code || bar.adjustment !== next.run.adjustment)) throw new Error();
        if (!controller.signal.aborted) setDetail(next);
      } catch { if (!controller.signal.aborted) setError('상세 조회 실패 · 이전 표시는 최신 확인값이 아닙니다. 저장 상태 새로고침으로 다시 확인하세요.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [id, revision]);
  const run = detail?.run;
  const lastSuccess = run && [...runs, run].filter(row => row.code === run.code && row.adjustment === run.adjustment && row.status.lastSuccessAt).map(row => row.status.lastSuccessAt!).sort().at(-1);
  return <section aria-label="일봉 수집 상세" className="top-gap data-detail" aria-busy={loading}>
    {loading && <p role="status">상세 조회 중 · 이전 표시가 있을 수 있습니다.</p>}
    {error && <p role="alert" className="soft-note">{error}</p>}
    {run && <>
      <h3>{run.code} · {run.adjustment === 'adjusted' ? '수정주가' : '원주가'} · KRX</h3>
      <div className="toolbar"><Badge>{run.coverageComplete ? '구간 수집 종료' : run.status.pages ? '일부 수집' : '수집 전'}</Badge><Badge>{({ pending: '대조 대기', unverified: '달력 미검증', passed: '입력 달력 대조 통과', failed: '입력 달력 불일치' })[run.quality.state]}</Badge><Badge>{run.status.error ? (detail.bars.length ? '수집 실패 · 이전 저장분' : '수집 실패 · 저장 없음') : run.status.phase === 'loading' ? '수집 중' : !detail.bars.length ? '저장 없음' : freshness(run.status).phase === 'stale' ? '수집 후 오래됨' : '저장 스냅샷'}</Badge></div>
      {run.status.error && <p role="alert" className="soft-note">{run.status.error}</p>}
      <dl className="data-facts">
        <div><dt>요청 기간</dt><dd>{date(run.from)} ~ {date(run.to)}</dd></div>
        <div><dt>저장 범위</dt><dd>저장 {detail.bars.length}봉{detail.bars.length > 0 && <> · {date(detail.bars[0].date)} ~ {date(detail.bars.at(-1)!.date)}</>}<small>첫·마지막 거래일 사이의 모든 날짜가 있다는 뜻은 아닙니다.</small></dd></div>
        <div><dt>응답 저장 구간</dt><dd>{run.status.pages}구간{run.status.pages > 0 && <> · {date(run.from)} ~ {date(run.nextDate ? addDays(run.nextDate, -1) : run.to)}</>}</dd></div>
        <div><dt>미수집 구간</dt><dd>{run.nextDate ? `${date(run.nextDate)} ~ ${date(run.to)}` : '없음 · 품질 판정은 별도'}</dd></div>
        <div><dt>최근 수집 시도</dt><dd>{time(run.status.observedAt)}</dd></div>
        <div><dt>이번 기록 전체 성공</dt><dd>{time(run.status.lastSuccessAt)}</dd></div>
        <div><dt>동일 종목·정책 마지막 전체 성공</dt><dd data-testid="daily-last-success">{time(lastSuccess ?? null)}<small>다른 수집 ID·요청 기간의 성공일 수 있습니다.</small></dd></div>
        <div><dt>출처·수집 기준일</dt><dd>KIS 모의 REST · {date(run.captureDate)}<small>현재 시세·PIT 인증 아님. 시각은 UTC입니다.</small></dd></div>
        <div><dt>달력</dt><dd>{run.calendar ? <>{run.calendar.source}<small>입력 달력과 대조 · 출처 진위·공식 달력 인증 아님</small></> : '미제공 · 휴장·상장 전·정지를 판정하지 않습니다.'}</dd></div>
      </dl>
      <p>누락 {run.quality.missingDates.length}일 · 예상 밖 거래일 {run.quality.unexpectedDates.length}일 · 평일 누락 후보 {run.quality.candidateMissingDates.length}일 · 중복 제거 {run.quality.duplicates}건 · 빈 응답 {run.quality.emptyWindows.length}구간</p>
      {run.quality.state === 'pending' && <p className="muted">누락 대조 전입니다. 0일 표시를 누락 없음으로 판단하지 마세요.</p>}
      <details><summary>품질 상세 펼치기</summary><p>입력 달력상 누락: {run.quality.missingDates.map(date).join(', ') || '기록 없음'}</p><p>예상 밖 거래일: {run.quality.unexpectedDates.map(date).join(', ') || '기록 없음'}</p><p>평일 누락 후보: {run.quality.candidateMissingDates.map(date).join(', ') || '기록 없음'}</p><p>빈 응답 구간: {run.quality.emptyWindows.map(window => `${date(window.from)} ~ ${date(window.to)}`).join(', ') || '없음'}</p></details>
      <details><summary>저장 거래일 펼치기</summary>{detail.bars.length ? <div className="table-scroll"><table><thead><tr><th>거래일</th><th>종가</th><th>거래량</th><th>수집 시각 (UTC)</th></tr></thead><tbody>{detail.bars.map(bar => <tr key={bar.date}><td>{date(bar.date)}</td><td>{bar.close.toLocaleString('ko-KR')}</td><td>{bar.volume.toLocaleString('ko-KR')}</td><td>{time(bar.collectedAt)}</td></tr>)}</tbody></table></div> : <p>저장된 거래일이 없습니다. 합성 봉이나 0원으로 채우지 않습니다.</p>}</details>
    </>}
  </section>;
}

export function DataStatus() {
  const { state } = useWorkbench();
  const [master, setMaster] = useState<MasterDataSnapshot | null>(null), [runs, setRuns] = useState<DailyRun[] | null>(null);
  const [masterError, setMasterError] = useState(''), [runsError, setRunsError] = useState('');
  const [loading, setLoading] = useState(true), [revision, setRevision] = useState(0), [selected, setSelected] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setMasterError(''); setRunsError('');
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
    void Promise.allSettled([
      (async () => {
        try { const response = await fetch('/api/data/master', { signal }); if (!response.ok) throw new Error(); const next = masterDataSchema.parse(await response.json()); if (!controller.signal.aborted) setMaster(next); }
        catch { if (!controller.signal.aborted) setMasterError('마스터 조회 실패 · 이전 표시는 최신 확인값이 아닙니다.'); }
      })(),
      (async () => {
        try { const response = await fetch('/api/data/daily', { signal }); if (!response.ok) throw new Error(); const next = dailyRunsSchema.parse(await response.json()); if (!controller.signal.aborted) { setRuns(next.runs); setSelected(previous => next.runs.some(run => run.id === previous) ? previous : next.runs[0]?.id ?? ''); } }
        catch { if (!controller.signal.aborted) setRunsError('일봉 목록 조회 실패 · 이전 표시는 최신 확인값이 아닙니다.'); }
      })(),
    ]).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  return <div className="data-inventory">
    <div className="toolbar"><p className="prose">저장된 자료의 범위와 품질을 확인하세요. 새로고침은 저장소 조회이며 KIS 수집을 실행하지 않습니다.</p><button className="button secondary" disabled={loading} onClick={() => setRevision(value => value + 1)}>저장 상태 새로고침</button></div>
    {loading && <p role="status">저장 상태 조회 중 · 이전 표시는 최신 확인 전입니다.</p>}
    <section aria-label="공개 마스터 상태"><Panel title="국내 주식·ETF 마스터" eyebrow="KIS PUBLIC MASTER" action={<Link className="text-link" to="/market">시장 탐색·마스터 갱신 →</Link>}>
      {masterError && <p role="alert" className="soft-note">{masterError}</p>}
      {master?.sources.map(source => <div className="data-source" key={source.exchange}><h3>{source.exchange} · {source.count.toLocaleString('ko-KR')}종목 <Badge>{({ ready: '저장 스냅샷', loading: '수집 중', error: source.lastSuccessAt ? '수집 실패 · 이전 목록' : '수집 실패 · 저장 없음' })[source.phase]}</Badge></h3><p>마지막 성공: {time(source.lastSuccessAt)} · 최근 시도: {time(source.observedAt)}</p><p className="muted">출처: {source.source} · 기준 거래일 미확인 · 수집시각은 거래일이 아닙니다.</p>{source.error && <p role="alert">{source.error}</p>}</div>)}
      {master && !master.sources.length && !masterError && !loading && <Empty title="저장된 마스터가 없습니다">시장 탐색에서 공식 마스터를 수집할 수 있습니다.</Empty>}
    </Panel></section>
    <section className="top-gap" aria-label="KIS 저장 일봉"><Panel title="기간별 일봉 수집 기록" eyebrow="KIS PAPER · REST · KRX">
      {runsError && <p role="alert" className="soft-note">{runsError}</p>}
      {runs && runs.length > 0 && <><label className="field">일봉 수집 기록<select value={selected} onChange={event => setSelected(event.target.value)}>{runs.map(run => <option key={run.id} value={run.id}>{run.code} · {run.adjustment === 'adjusted' ? '수정주가' : '원주가'} · {date(run.from)} ~ {date(run.to)} · {run.id}</option>)}</select></label><DailyDetail key={selected} id={selected} revision={revision} runs={runs} /></>}
      {runs?.length === 0 && !runsError && !loading && <Empty title="저장된 KIS 일봉이 없습니다">합성 봉은 여기에 포함하지 않습니다. 기존 수집 API로 저장한 기록이 표시됩니다.</Empty>}
    </Panel></section>
    <section className="top-gap" aria-label="DEMO 합성 데이터"><Panel title="합성 데이터 인벤토리" eyebrow="DEMO · 실제 과거 아님"><div className="stats-grid three"><Stat label="예시 종목" value={`${state.instruments.length}개`} sub="실제 마스터와 별도" /><Stat label="재생한 봉" value={`${state.tick}개`} sub="기본 120봉 + 로컬 재생" /><Stat label="실제 거래일·수정주가" value="해당 없음" sub="기능 검증용 합성 시나리오" /></div><div className="table-scroll"><table><thead><tr><th>종목</th><th>출처</th><th>봉 수</th><th>실제 거래일</th><th>수정주가</th></tr></thead><tbody>{state.instruments.map(instrument => <tr key={instrument.code}><td>{instrument.name}<small className="cell-small">{instrument.code}</small></td><td>합성</td><td>{instrument.history.length}</td><td>미부여</td><td>해당 없음</td></tr>)}</tbody></table></div></Panel></section>
    <div className="two-columns top-gap"><Panel title="수집·검증 순서"><ol className="plain-list"><li>공식 마스터에서 국내 종목을 확인합니다.</li><li>기존 일봉 API로 기간·수정주가 정책을 고정해 수집합니다.</li><li>누락·중복·입력 거래일 달력과 출처를 검토합니다.</li><li>검증된 자료를 백테스트 입력으로 연결합니다.</li></ol><Link className="text-link" to="/design?tab=screens&screen=data">데이터 화면 계약 보기 →</Link></Panel><Panel title="분봉·검증의 한계"><p className="prose">KIS 당일 분봉은 전일 데이터를 제공하지 않습니다. 이 화면은 저장된 기간별 일봉을 조회합니다. 달력 대조 통과는 가격 정확성·과거 시점 데이터 인증이 아니며, 실제 장중 전체 수용은 별도입니다.</p><Link className="text-link" to="/design?tab=sources">공식 근거와 제약 보기 ↗</Link></Panel></div>
  </div>;
}
