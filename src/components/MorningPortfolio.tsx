import { useEffect, useState } from 'react';
import {
  isIndependentCounter,
  reportApprovalBlocked,
  resolveViewCandidateCodes,
  type MorningApprovalState,
  type MorningCloseWarning,
  type MorningReport,
  type SourcedView,
} from '../../shared/morning';
import { won } from '../../shared/model';
import { useWorkbench } from '../context';
import { Badge, Chart, Panel, confirmedAt } from './ui';

interface View {
  run?: { armed: boolean; buyId: string | null; subscriptions: number; phase: string; session: string | null };
  approval?: MorningApprovalState;
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
  closeWarning?: MorningCloseWarning | null;
  scan?: { running: boolean; checked: number; total: number; message: string };
  additions?: { candidate: MorningReport['candidates'][number]; expires: number; approved: string | null }[];
  signals: { at: string; code: string; side: string; price: number; outcome: string }[];
}

function safeExternalUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function SourceLink({ url, label }: { url: string; label: string }) {
  const safe = safeExternalUrl(url);
  if (!safe) return <span>{label}</span>;
  return (
    <a href={safe} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

function EvidenceBlock({
  view,
  roleLabel,
  tone = 'neutral',
  matchedNames = [],
}: {
  view: SourcedView;
  roleLabel: string;
  tone?: 'neutral' | 'teal';
  matchedNames?: string[];
}) {
  return (
    <article className="morning-contrast-card">
      <header className="morning-card-meta">
        <Badge tone={tone}>{roleLabel}</Badge>
        <strong>{view.publisher}</strong>
        <span className="muted">{confirmedAt(view.publishedAt)}</span>
      </header>
      <p className="morning-finding">{view.finding}</p>
      <blockquote className="morning-quote">“{view.quote}”</blockquote>
      <footer className="morning-card-foot">
        <SourceLink url={view.url} label={`${view.publisher} 원문`} />
        {matchedNames.length > 0 && (
          <span className="morning-match-tags">
            {matchedNames.map((name) => (
              <Badge key={name} tone="neutral">
                원문 일치 · {name}
              </Badge>
            ))}
          </span>
        )}
      </footer>
    </article>
  );
}

export function MorningPortfolio({ hideEmpty = false }: { hideEmpty?: boolean }) {
  const { act, busy, available, server, serverNow } = useWorkbench();
  const [view, setView] = useState<View>({ report: null, signals: [] });
  const [loaded, setLoaded] = useState(false);
  // 조회 실패(loadError)와 사용자 액션 실패(actionError)를 분리해 10초 폴링 성공이 액션 오류를 지우지 않게 한다.
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
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
            setLoadError('');
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setLoadError('장전 계획을 읽지 못했습니다.');
        });
    const timer = available ? window.setTimeout(() => setVersion((v) => v + 1), 10000) : undefined;
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [available, server?.instanceId, version, day]);
  async function action(path: string, body?: unknown) {
    setActionError('');
    try {
      await act('morning/' + path, body);
      setVersion((v) => v + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '요청을 처리하지 못했습니다.');
    }
  }
  const r = view.report;
  if (hideEmpty && !r) return null;

  const reportBlock = r ? reportApprovalBlocked(r) : { blocked: false, reasons: [] };
  const approvalBlocked = r ? (view.approval ? !view.approval.allowed : reportBlock.blocked) : false;
  const approvalBlockReasons = r ? (view.approval ? view.approval.reasons : reportBlock.reasons) : [];
  const needsResume = Boolean(!day && r?.approvedAt && view.run && view.run.buyId !== r.id);
  const showBlockNotice = Boolean(!day && r && approvalBlocked && approvalBlockReasons.length > 0 && (!r.approvedAt || needsResume));
  const closeWarning = view.closeWarning ?? null;
  // 서버가 수동 마감 불가(canClose: false)로 판정한 경우 자동 호출·수동 요청을 모두 막는다.
  const closeBlocked = Boolean(closeWarning && !closeWarning.canClose);
  const displayedBlockReasons = showBlockNotice ? new Set(approvalBlockReasons) : new Set<string>();
  const detailGaps = r ? r.gaps.filter((g) => !displayedBlockReasons.has(g)) : [];
  const analysisCoverage = r ? (r.analysisCoverage ?? r.analysis?.coverage) : undefined;
  const hasIndependentCounter = Boolean(
    r?.analysis?.counter && r.analysis.views.length > 0 && isIndependentCounter(r.analysis.views, r.analysis.counter),
  );
  const candidateNameByCode = new Map(r?.candidates.map((c) => [c.code, c.name]) ?? []);
  const allAnalysisViews: { kind: 'view' | 'counter'; view: SourcedView; matchedCodes: string[] }[] = r?.analysis
    ? [
        ...r.analysis.views.map((item) => ({
          kind: 'view' as const,
          view: item,
          matchedCodes: resolveViewCandidateCodes(item, r.candidates, r.news),
        })),
        ...(r.analysis.counter
          ? [
              {
                kind: 'counter' as const,
                view: r.analysis.counter,
                matchedCodes: resolveViewCandidateCodes(r.analysis.counter, r.candidates, r.news),
              },
            ]
          : []),
      ]
    : [];

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
              setLoadError('');
              setActionError('');
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
          {loadError
            ? '보고서 상태 미확인'
            : !loaded
              ? '장전 계획을 확인하고 있어.'
              : '저장된 계획이 없어. 장전 자료를 모아 보자.'}
        </p>
      ) : (
        <div className="morning-layout">
          {showBlockNotice && (
            <section
              className="morning-block-notice"
              role="status"
              aria-label={needsResume ? '감시 재개 차단 사유' : '당일 승인 차단 사유'}
            >
              <header className="morning-card-meta">
                <Badge tone="neutral">{needsResume ? '감시 재개 차단' : '당일 승인 차단'}</Badge>
                <strong>
                  {needsResume
                    ? '아래 조건이 충족되기 전에는 승인한 계획 감시를 재개할 수 없어.'
                    : '아래 조건이 충족되기 전에는 모의 운용을 승인할 수 없어.'}
                </strong>
              </header>
              <ul>
                {approvalBlockReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </section>
          )}
          {closeWarning && (
            <section
              id="morning-close-warning"
              className="morning-close-warn"
              role="status"
              aria-label="장후 마감 상태"
            >
              <header className="morning-card-meta">
                <Badge tone="neutral">
                  {closeWarning.reason === 'incomplete' ? '장후 마감 미완성' : '장후 마감 누락'}
                </Badge>
                <strong>
                  {closeWarning.canClose ? '장후 마감이 필요합니다.' : '수동 마감할 수 없습니다.'}
                </strong>
              </header>
              {closeWarning.reasons.length > 0 && (
                <ul>
                  {closeWarning.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="morning-rule-card" aria-label="서버 규칙 판단">
            <header className="morning-card-meta">
              <Badge tone="teal">서버 규칙 판단</Badge>
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
            </header>
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
          </section>

          {!r.analysis && analysisCoverage && analysisCoverage.attempted > 0 && (
            <section className="morning-coverage-warn" role="status" aria-label="공개 원문 수집 상태">
              <strong>
                {analysisCoverage.collected === 0 ? '공개 원문 수집 전부 실패' : '공개 원문 분석 미완료'}
              </strong>{' '}
              · 선택 원문 {analysisCoverage.attempted}개 중 {analysisCoverage.collected}개 수집
              {analysisCoverage.failed > 0 && (
                <>
                  {' '}
                  ({analysisCoverage.failed}개 미수집
                  {analysisCoverage.failedPublishers?.length
                    ? `: ${analysisCoverage.failedPublishers.join(', ')}`
                    : ''}
                  )
                </>
              )}
            </section>
          )}

          {r.analysis && (
            <section className="morning-briefing" aria-label="AI 공개 원문 브리핑">
              <header className="morning-card-meta">
                <Badge tone="neutral">AI 원문 요약 · 원문 대조됨</Badge>
                <span className="muted">모델 {r.analysis.model} · 매매 지시 아님</span>
                {analysisCoverage && analysisCoverage.failed === 0 && (
                  <span className="muted">
                    공개 원문 {analysisCoverage.collected}/{analysisCoverage.attempted}개 대조
                  </span>
                )}
              </header>
              {analysisCoverage && analysisCoverage.failed > 0 && (
                <div className="morning-coverage-warn" role="status">
                  <strong>원문 수집 일부 실패</strong> · 선택 원문 {analysisCoverage.attempted}개 중{' '}
                  {analysisCoverage.collected}개만 분석 ({analysisCoverage.failed}개 미수집
                  {analysisCoverage.failedPublishers?.length
                    ? `: ${analysisCoverage.failedPublishers.join(', ')}`
                    : ''}
                  )
                </div>
              )}
              <p className="morning-takeaway">{r.analysis.takeaway}</p>
              {hasIndependentCounter && r.analysis.counter && (
                <section className="morning-contrast-grid" aria-label="주요 근거와 반대 관점 대비">
                  <EvidenceBlock
                    view={r.analysis.views[0]}
                    roleLabel="주요 근거"
                    tone="teal"
                    matchedNames={resolveViewCandidateCodes(r.analysis.views[0], r.candidates, r.news)
                      .map((code) => candidateNameByCode.get(code))
                      .filter((name): name is string => Boolean(name))}
                  />
                  <EvidenceBlock
                    view={r.analysis.counter}
                    roleLabel="반대 관점"
                    tone="neutral"
                    matchedNames={resolveViewCandidateCodes(r.analysis.counter, r.candidates, r.news)
                      .map((code) => candidateNameByCode.get(code))
                      .filter((name): name is string => Boolean(name))}
                  />
                </section>
              )}
            </section>
          )}

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
            {r.candidates.map((p) => {
              const matchedEvidence = allAnalysisViews.filter((entry) => entry.matchedCodes.includes(p.code));
              return (
                <section key={p.code} className="morning-candidate-card">
                  <h4>
                    {p.name} · {p.code}
                  </h4>
                  <Chart values={p.closes} height={50} label={p.name + ' 최근 종가'} />
                  <p>
                    {p.asOf} 종가 기준 · 평균 대비 거래량 {p.relativeVolume.toFixed(2)}배. {won(p.reference)}원 위로
                    돌파하면 1주 매수, {won(p.exit)}원 아래로 내려가면 1주 매도. 하루 누적 매수 한도 {won(p.limit)}
                    원.
                  </p>
                  {matchedEvidence.length > 0 && (
                    <section className="morning-candidate-evidence" aria-label={`${p.name} 관련 공개 원문`}>
                      <header className="morning-card-meta">
                        <Badge tone="neutral">관련 공개 원문 · 종목명 일치 · 투자 추천 아님</Badge>
                      </header>
                      {matchedEvidence.map((entry) => (
                        <p key={entry.kind + entry.view.url + entry.view.quote}>
                          <strong>
                            {entry.kind === 'counter'
                              ? hasIndependentCounter
                                ? '반대 관점'
                                : '추가 관점 · 동일 출처'
                              : '주요 근거'}
                          </strong>{' '}
                          · {entry.view.finding}{' '}
                          <SourceLink url={entry.view.url} label={`${entry.view.publisher} 원문`} /> · “
                          {entry.view.quote}”
                        </p>
                      ))}
                    </section>
                  )}
                </section>
              );
            })}
            {r.analysis && (
              <section className="morning-analysis-list" aria-label="전체 공개 원문 분석 근거">
                {r.analysis.views.map((v, idx) => (
                  <EvidenceBlock
                    key={`${v.url}-${idx}-${v.quote}`}
                    view={v}
                    roleLabel={`근거 ${idx + 1}`}
                    tone="teal"
                    matchedNames={resolveViewCandidateCodes(v, r.candidates, r.news)
                      .map((code) => candidateNameByCode.get(code))
                      .filter((name): name is string => Boolean(name))}
                  />
                ))}
                {r.analysis.counter && (
                  <EvidenceBlock
                    view={r.analysis.counter}
                    roleLabel={hasIndependentCounter ? '다른 관점' : '추가 관점 · 동일 출처'}
                    tone="neutral"
                    matchedNames={resolveViewCandidateCodes(r.analysis.counter, r.candidates, r.news)
                      .map((code) => candidateNameByCode.get(code))
                      .filter((name): name is string => Boolean(name))}
                  />
                )}
              </section>
            )}
            {r.sectors?.map((s) => (
              <p key={s.sector}>
                {s.sector} 노출 · 현재 {won(s.held)}원 → 계획 상한 {won(s.planned)}원
              </p>
            ))}
            {detailGaps.map((g) => (
              <p key={g}>{g}</p>
            ))}
            {r.indicators.map((i) => (
              <p key={i.id}>
                <SourceLink url={i.url} label={i.name} /> ·{' '}
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
                  <SourceLink url={n.url} label={n.title} /> · {n.publisher} ·{' '}
                  {new Date(n.publishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST
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
        </div>
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
      {loadError && (
        <p className="morning-error-alert" role="alert">
          {loadError}
        </p>
      )}
      {actionError && (
        <p className="morning-error-alert" role="alert">
          {actionError}
        </p>
      )}
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
          {r && !r.approvedAt && !approvalBlocked && (
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
              disabled={busy || !available || closeBlocked}
              aria-describedby={closeWarning ? 'morning-close-warning' : undefined}
              onClick={() => {
                if (!closeBlocked) void action('close', { id: r.id });
              }}
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
          {needsResume && (
            <button disabled={busy || !available || approvalBlocked} onClick={() => void action('approve', { id: r!.id })}>
              승인한 계획 감시 재개
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}
