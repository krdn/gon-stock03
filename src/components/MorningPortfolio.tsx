import { useEffect, useState } from 'react';
import type { MorningReport } from '../../shared/morning';
import { won } from '../../shared/model';
import { useWorkbench } from '../context';
import { Chart, Panel } from './ui';

interface View {
  run?: { armed: boolean; buyId: string | null; subscriptions: number; phase: string; session: string | null };
  report: MorningReport | null;
  pendingCarry?: boolean;
  carry?: { code: string; remaining: number }[];
  days?: string[];
  close?: {
    change: number;
    contribution?: { gross: number; estimatedCost: number | null; net: number | null; fills: number } | null;
    difference: number | null;
    predictions: { code: string; reference: number; close: number | null }[];
  } | null;
  scan?: { running: boolean; checked: number; total: number; message: string };
  additions?: { candidate: MorningReport['candidates'][number]; expires: number; approved: string | null }[];
  signals: { at: string; code: string; side: string; price: number; outcome: string }[];
}
export function MorningPortfolio({ hideEmpty = false }: { hideEmpty?: boolean }) {
  const { act, busy, available, server, serverNow } = useWorkbench();
  const [view, setView] = useState<View>({ report: null, signals: [] });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [day, setDay] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (available)
      void fetch('/api/morning' + (day ? '?day=' + encodeURIComponent(day) : ''), { signal: controller.signal })
        .then(async (r) => {
          if (!r.ok) throw new Error();
          const data: View = await r.json();
          if (!controller.signal.aborted) {
            setView(data);
            setLoaded(true);
            setError('');
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setError('장전 계획을 읽지 못했습니다.');
        });
    const timer = available ? window.setTimeout(() => setVersion((v) => v + 1), 10000) : undefined;
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [available, server?.instanceId, version, day]);
  async function action(path: string, body?: unknown) {
    try {
      await act('morning/' + path, body);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청을 처리하지 못했습니다.');
    }
  }
  const r = view.report;
  if (hideEmpty && !r) return null;
  return (
    <Panel title={day ? day + ' 운용 계획' : '오늘의 운용 계획'}>
      {!!view.days?.length && (
        <label>
          보고서 날짜{' '}
          <select
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              setLoaded(false);
              setView({ report: null, signals: [] });
            }}
          >
            <option value="">오늘</option>
            {view.days.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
      )}
      {!r ? (
        <p>
          {error
            ? '보고서 상태 미확인'
            : !loaded
              ? '장전 계획을 확인하고 있어.'
              : '저장된 계획이 없어. 장전 자료를 모아 보자.'}
        </p>
      ) : (
        <>
          <p>
            <strong>
              {r.cash === null
                ? '장전 잔고를 확인할 수 없어 새 매수를 기다려.'
                : !r.candidates.length
                  ? '오늘은 새로 살 후보가 없어.'
                  : r.candidates
                      .filter((p) => p.limit > p.reference)
                      .map((p) => p.name)
                      .join(' · ') || '투자 한도 안에서 살 종목이 없어.'}
            </strong>
          </p>
          {r.analysis && <p>{r.analysis.takeaway}</p>}
          <p>{r.evaluated ? r.conclusion : '판단에 쓸 최근 가격과 거래량이 아직 없어.'}</p>
          <p>
            가격과 거래량을 확인한 종목 {r.evaluated.toLocaleString()}개 / 공식 목록 {r.universe.toLocaleString()}
            개{r.retainedCash !== null && ' · 남겨둘 현금 ' + won(r.retainedCash) + '원'}
          </p>
          <p>
            하루 손실이 {won(r.dailyLoss)}원이 되면 추가 매수를 멈춰.{' '}
            {r.research?.fraction
              ? '기간을 나눠 검증한 기준과 계좌 한도 중 더 작은 금액이야.'
              : r.research?.verified
                ? '추가 중단 규칙 없이 기존 계좌 한도를 적용해.'
                : '연구 최적값은 미측정이라 기존 계좌 한도를 적용해.'}
          </p>
          {view.additions
            ?.filter((a) => a.approved || a.expires > serverNow)
            .map((a) => (
              <p key={a.candidate.code}>
                {a.candidate.name} · 장중 고점 돌파 · 남겨둔 현금에서 최대 {won(a.candidate.limit)}원 편입
                {a.approved ? (
                  ' · 승인됨'
                ) : (
                  <button
                    disabled={busy || !available}
                    onClick={() => void action('add', { id: r.id, code: a.candidate.code, expires: a.expires })}
                  >
                    이 종목 추가 승인
                  </button>
                )}
              </p>
            ))}
          <details>
            <summary>근거와 종목별 매매 조건 보기</summary>
            <p>
              자료 기준 {new Date(r.cutoff).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST · 최근
              20거래일 고점과 평균 거래량을 모두 넘긴 종목을 거래량 증가 순서로 확인해. 수익성은 미측정이야.
            </p>
            <p>
              보유 종목{' '}
              {r.holdings.map((h) => h.name + ' ' + h.qty + '주').join(', ') ||
                (r.cash === null ? '미확인' : '없음')}
            </p>
            {r.candidates.map((p) => (
              <section key={p.code}>
                <h4>
                  {p.name} · {p.code}
                </h4>
                <Chart values={p.closes} height={50} label={p.name + ' 최근 종가'} />
                <p>
                  {p.asOf} 종가 기준 · 평균 대비 거래량 {p.relativeVolume.toFixed(2)}배. {won(p.reference)}원 위로
                  돌파하면 1주 매수, {won(p.exit)}원 아래로 내려가면 1주 매도. 하루 누적 매수 한도 {won(p.limit)}
                  원.
                </p>
              </section>
            ))}
            {r.analysis?.views.map((v) => (
              <p key={v.url + v.finding}>
                {v.finding}{' '}
                <a href={v.url} target="_blank" rel="noreferrer">
                  {v.publisher} 원문
                </a>{' '}
                · “{v.quote}”
              </p>
            ))}
            {r.analysis?.counter && (
              <p>
                다른 관점 · {r.analysis.counter.finding}{' '}
                <a href={r.analysis.counter.url} target="_blank" rel="noreferrer">
                  근거 원문
                </a>
              </p>
            )}
            {r.sectors?.map((s) => (
              <p key={s.sector}>
                {s.sector} 노출 · 현재 {won(s.held)}원 → 계획 상한 {won(s.planned)}원
              </p>
            ))}
            {r.gaps.map((g) => (
              <p key={g}>{g}</p>
            ))}
            {r.indicators.map((i) => (
              <p key={i.id}>
                <a href={i.url} target="_blank" rel="noreferrer">
                  {i.name}
                </a>{' '}
                ·{' '}
                {i.latest === null || i.previous === null
                  ? '최근 관측 미확인'
                  : i.date + ' 기준 ' + i.previous + ' → ' + i.latest}
              </p>
            ))}
            <p>
              입출금이나 별도 주문도 계좌 손익에 반영돼. 업종 분류가 확인된 종목은 ETF 안의 보유분까지 합쳐 기존
              종목 한도를 업종에도 적용해.
            </p>
            <p>개별 공시와 시장 자료를 확인해. 원문 의견이 어느 정도 일치하는지는 미측정이야.</p>
            <ul>
              {r.news.map((n, i) => (
                <li key={n.url + i}>
                  <a href={n.url} target="_blank" rel="noreferrer">
                    {n.title}
                  </a>{' '}
                  · {n.publisher} · {new Date(n.publishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}{' '}
                  KST
                  {n.summary && n.summary !== n.title && <p>{n.summary}</p>}
                </li>
              ))}
            </ul>
            <p>실시간 구독·계좌 대조를 마친 종목에서만 평가해. 승인 전 신호는 가상 기록으로 남겨.</p>
            {view.signals.map((s) => (
              <p key={s.at + s.code + s.price}>
                {s.code} · {s.side === 'buy' ? '매수' : '매도'} {won(s.price)}원 · {s.outcome}
              </p>
            ))}
          </details>
        </>
      )}
      {view.close && (
        <p>
          장후 계좌 변동 {won(view.close.change)}원 · 그대로 보유했을 때와 차이{' '}
          {view.close.difference === null ? '미측정' : won(view.close.difference) + '원'} · 입출금과 별도 주문의
          영향이 포함될 수 있어.
        </p>
      )}
      {view.close && (
        <details>
          <summary>장후 종목별 결과</summary>
          <p>
            승인한 매매의 비용 차감 기여{' '}
            {view.close.contribution?.net == null ? '미측정' : won(view.close.contribution.net) + '원'} · 모의 체결
            금액과 당일 종가, 장전에 저장한 추정 비용률 기준
          </p>
          {view.close.predictions.map((p) => (
            <p key={p.code}>
              {p.code} · 기준 {won(p.reference)}원 · 종가 {p.close === null ? '미확인' : won(p.close) + '원'}
            </p>
          ))}
        </details>
      )}
      {error && <p role="alert">{error}</p>}
      {!day && (
        <div className="portfolio-toolbar">
          {!r?.approvedAt && (
            <button
              className="button secondary"
              disabled={busy || !available || view.scan?.running}
              onClick={() => void action('scan')}
            >
              시장 전체 일봉 수집
            </button>
          )}
          {view.scan?.message && (
            <span role="status">
              {view.scan.message} {view.scan.checked}/{view.scan.total}
            </span>
          )}
          {!r?.approvedAt && (
            <button
              className="button secondary"
              disabled={busy || !available}
              onClick={() => void action('generate')}
            >
              {r ? '자료 다시 확인' : '운용 계획 보기'}
            </button>
          )}
          {r && !r.approvedAt && r.equity !== null && !r.gaps.some((g) => g.includes('당일 승인 불가')) && (
            <button
              className="button primary"
              disabled={busy || !available}
              onClick={() => void action('approve', { id: r.id })}
            >
              오늘 모의 운용 승인
            </button>
          )}
          {r && (!view.close || view.close.difference === null) && (
            <button
              className="button secondary"
              disabled={busy || !available}
              onClick={() => void action('close', { id: r.id })}
            >
              장후 결과 확인
            </button>
          )}
          {r?.approvedAt && view.close && (
            <button disabled={busy || !available} onClick={() => void action('carry', { id: r.id })}>
              다음 거래일 보유분 매도 조건 승인
            </button>
          )}
          {(view.pendingCarry || !!view.carry?.length) && (
            <button disabled={busy || !available} onClick={() => void action('carry/start')}>
              승인된 이월 매도 감시
            </button>
          )}
          {r?.approvedAt && <span>오늘 계획 승인됨</span>}
          {r?.approvedAt && view.run?.buyId === r.id && (
            <span role="status">
              {view.run.phase === 'ready' ? '실시간 감시 중' : '구독·계좌 대조 대기'} · {view.run.subscriptions}
              종목
            </span>
          )}
          {r?.approvedAt && view.run && view.run.buyId !== r.id && (
            <button disabled={busy || !available} onClick={() => void action('approve', { id: r.id })}>
              승인한 계획 감시 재개
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}
