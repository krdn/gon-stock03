import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, ClipboardList, SlidersHorizontal, Workflow } from 'lucide-react';
import { DEFAULT_PAPER_MAX_QTY } from '../../shared/contracts';
import {
  tradingTerms,
  planLimits,
  type PlanKind,
  type PlanRecord,
  type PlanVersion,
  type TradingSettingsData,
  type TradingTerms,
} from '../../shared/trading-plan';
import { won, type Strategy } from '../../shared/model';
import { assertRealtimeRule, isBasicRealtimeSma, type StrategyRule } from '../../shared/strategy-rules';
import { formatRuleSummary } from './research-rule-form';
import { Panel } from '../components/ui';
import { PaperQuantitySetting } from '../components/PaperQuantitySetting';
import { RiskLimitSettings } from '../components/RiskLimitSettings';
import { useWorkbench } from '../context';

import { defaultOncePolicy, defaultStrategyPolicy, krxHours, validOncePolicy } from '../../shared/trading-policy';
import { NumberField, priceNames, TradingPolicyFields } from '../components/TradingPolicyFields';
import './trading-settings-v2.css';

const home = '/settings/trading';
const titles = { general: '일반 주문·위험', once: '다음 한정 실행', strategy: '다음 전략 계약' };

/** 확정 일봉 기반 KIS 모의 계약 고정 시 전용 원장 복사·비자동 반영 안내 문구. */
const CONFIRMED_DAILY_CONTRACT_NOTICE =
  '고정 시점의 검증 완료 일봉을 전용 원장에 복사하여 세션 직전 개장일 봉과 일치할 때 당일 1회 집행하며, 고정 이후 추가 수집한 일봉은 기존 전용 원장에 자동 반영되지 않습니다.';

/** KIS 모의 계약 차단 사유를 반환한다(`shared/strategy-rules` `assertRealtimeRule`과 동일 기준). */
function kisContractBlockReason(strategy: Pick<Strategy, 'rule' | 'overlay' | 'slow'>): string {
  try {
    assertRealtimeRule(strategy.rule, strategy.overlay, strategy.slow);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : '선택한 전략은 KIS 모의 계약 대상이 아닙니다.';
  }
}

/** KIS 모의 계약(`assertRealtimeRule`) 지원 여부. */
function isKisContractSupported(strategy: Pick<Strategy, 'rule' | 'overlay' | 'slow'>): boolean {
  return kisContractBlockReason(strategy) === '';
}

/** 확정 일봉 기반 KIS 모의 전략(종가 확정형 10종 + 선택 샹들리에) 여부. */
function isKisConfirmedDaily(strategy: Pick<Strategy, 'rule' | 'overlay' | 'slow'>): boolean {
  return isKisContractSupported(strategy) && !isBasicRealtimeSma(strategy.rule, strategy.overlay, strategy.slow);
}

/** 저장된 계획 스냅샷에서 규칙·오버레이·기간 조건을 복원한다(레거시 기본 SMA 스냅샷을 현재 전략으로 덮어쓰지 않음). */
function snapshotStrategyConditions(
  plan: PlanVersion | undefined,
  fallback: Strategy | undefined,
): Pick<Strategy, 'rule' | 'overlay' | 'fast' | 'slow'> | undefined {
  if (plan?.fast && plan.slow) {
    return { rule: plan.rule, overlay: plan.overlay, fast: plan.fast, slow: plan.slow };
  }
  if (plan?.rule) {
    return { rule: plan.rule, overlay: plan.overlay, fast: fallback?.fast ?? 5, slow: fallback?.slow ?? 20 };
  }
  return fallback;
}

/** 저장 전략의 실제 규칙·파라미터·오버레이 요약을 반환한다(다중 규칙을 5/20 교차로 오표시하지 않음). */
function formatTradingStrategyRule(strategy: Pick<Strategy, 'rule' | 'overlay' | 'fast' | 'slow'>): string {
  if (isBasicRealtimeSma(strategy.rule, strategy.overlay, strategy.slow)) {
    const fast = strategy.rule?.kind === 'ma_crossover' ? strategy.rule.fast : strategy.fast;
    const slow = strategy.rule?.kind === 'ma_crossover' ? strategy.rule.slow : strategy.slow;
    return `${fast}/${slow} 교차`;
  }
  const rule: StrategyRule = strategy.rule ?? {
    kind: 'ma_crossover',
    maType: 'sma',
    fast: strategy.fast,
    slow: strategy.slow,
  };
  return formatRuleSummary(rule, strategy.overlay);
}
const stages = ['대상·기간', '한도·조건', '검토·고정'];
const kst = (value: string) =>
  Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 16) : '';
const instant = (value: string) => {
  const time = Date.parse(value + '+09:00');
  return Number.isFinite(time) ? new Date(time).toISOString() : '';
};
const localTime = (value: string) => {
  const time = kst(value);
  return time ? time.replace('T', ' ') + ' KST' : '미입력';
};
function defaults(kind: PlanKind, strategy?: Strategy): TradingTerms {
  const start = new Date().toISOString(),
    end = new Date(Date.now() + 600000).toISOString();
  return kind === 'once'
    ? {
        kind,
        date: kst(start).slice(0, 10),
        policy: defaultOncePolicy(kst(start).slice(0, 10)),
        code: '005930',
        orderType: 'limit',
        maxQty: 1,
        maxAmount: 100000,
        allowExistingHolding: false,
        cancelProbe: false,
      }
    : {
        kind,
        strategyId: strategy?.id ?? '',
        revision: strategy?.revision ?? 1,
        startsAt: start,
        endsAt: end,
        maxOrderAmount: 100000,
        maxAttempts: 1,
        maxTotalAmount: 100000,
        sellPolicy: 'deny',
        policy: defaultStrategyPolicy(),
      };
}
function description(t: TradingTerms, ruleSummary?: string): [string, string][] {
  const p = t.policy;
  const rows: [string, string][] =
    t.kind === 'once'
      ? [
          ['실행일', t.date],
          ['종목', t.code],
          [
            '주문 방식',
            (t.orderType === 'market' ? '시장가 ' : '지정가 ') + (t.policy?.side === 'sell' ? '매도' : '매수'),
          ],
          ['수량 상한', t.maxQty + '주'],
          ['금액 상한', won(t.maxAmount) + '원'],
          ['기존 보유 종목 매수', t.policy?.side === 'sell' ? '매도 시 미적용' : t.allowExistingHolding ? '허용' : '차단'],
          ['잔량 취소', t.cancelProbe ? '한정 API 1회' : '모의 앱 수동 대응'],
        ]
      : [
          ['저장 전략', t.strategyId + ' · revision ' + t.revision],
          ...(ruleSummary ? [['신호 규칙', ruleSummary] as [string, string]] : []),
          ['시작', localTime(t.startsAt)],
          ['종료', localTime(t.endsAt)],
          ['주문당 금액', won(t.maxOrderAmount) + '원'],
          ['총 시도', t.maxAttempts + '회'],
          ['누적 금액', won(t.maxTotalAmount) + '원'],
          [
            '매도 범위',
            t.sellPolicy === 'account'
              ? '기존 계좌 보유 포함'
              : t.sellPolicy === 'contract'
                ? '계약 체결분만'
                : '매수만',
          ],
        ];
  if (p) {
    rows.push(
      ['KIS 응답 대기', p.requestSeconds + '초'],
      ['잔고 전체 조회', p.balanceSeconds + '초'],
      ['호출 간 추가 대기', p.extraSpacingMs + 'ms'],
      ['종목 마스터', p.masterDays + '일 이내'],
      ['실행 시간창', p.session.open + '~' + p.session.close + ' KST'],
      ['시세 유효시간', p.quoteSeconds + '초'],
      ['시세 재연결', p.reconnects + '회'],
      ['실시간 수신 대기', p.silenceSeconds + '초'],
      ['복구 근거 유효시간', p.recoverySeconds + '초'],
    );
    if (p.exchangeNotice)
      rows.push(
        ['공식 공지 거래일', p.exchangeNotice.date],
        ['공지 정규장', p.exchangeNotice.open + '~' + p.exchangeNotice.close],
        ['공지 출처', p.exchangeNotice.source],
      );
    if ('signalSeconds' in p)
      rows.push(
        ['원 신호 유효시간', p.signalSeconds + '초'],
        ['전략 주문 방식', p.orderType === 'market' ? '시장가 · 상한가로 예약' : '신호 가격 지정가'],
      );
    else {
      if (t.kind === 'once' && t.orderType === 'limit')
        rows.push(
          ['지정가 기준', priceNames[p.priceMode]],
          [
            p.priceMode === 'cappedCurrent' ? '매수 단가 상한' : '고정 단가',
            p.limitPrice ? won(p.limitPrice) + '원' : '재조회 현재가',
          ],
        );
      rows.push(
        ['기존 미체결', p.allowPending ? '예약 반영 후 허용' : '차단'],
        ['매수 후 남길 현금', won(p.cashReserve) + '원'],
        ['승인 소진', p.consumeAt === 'validated' ? '사전검사 통과 후' : '사전검사 시작 시'],
        ['조회·잔량 대응', p.observationSeconds + '초'],
      );
    }
  }
  return rows;
}
function Comparison({
  next,
  previous,
  source = '이전 고정본',
  nextRuleSummary,
  previousRuleSummary,
}: {
  next: TradingTerms;
  previous?: TradingTerms;
  source?: string;
  nextRuleSummary?: string;
  previousRuleSummary?: string;
}) {
  const before = new Map(previous ? description(previous, previousRuleSummary) : []);
  const rows = new Map(description(next, nextRuleSummary));
  const primary = new Set([
    '실행일', '종목', '주문 방식', '수량 상한', '금액 상한', '기존 보유 종목 매수', '잔량 취소', '지정가 기준',
    '고정 단가', '매수 단가 상한', '저장 전략', '신호 규칙', '시작', '종료', '주문당 금액', '총 시도', '누적 금액',
    '매도 범위', '전략 주문 방식', '실행 시간창', '원 신호 유효시간', '시세 유효시간',
  ]);
  const standard = new Map(description(next.kind === 'once'
    ? { ...next, policy: defaultOncePolicy(next.date) }
    : { ...next, policy: defaultStrategyPolicy() }, nextRuleSummary));
  const keys = [...new Set([...rows.keys(), ...before.keys()])];
  const emphasized = [...primary].filter(key => rows.has(key) || before.has(key));
  emphasized.push(...keys.filter(key => !primary.has(key) && (
    (previous && before.get(key) !== rows.get(key)) || (next.policy && standard.get(key) !== rows.get(key))
  )));
  const other = keys.filter(key => !emphasized.includes(key));
  function table(items: string[], caption: string) {
    return <table className="plan-comparison">
      <caption className="sr-only">{caption}</caption>
      <thead><tr><th scope="col">항목</th>{previous && <th scope="col">{source}</th>}<th scope="col">다음 설정</th></tr></thead>
      <tbody>{items.map(key => <tr key={key}>
        <th scope="row">{key}</th>
        {previous && <td>{before.get(key) ?? '없음'}</td>}
        <td>{rows.get(key) ?? '해제'}</td>
      </tr>)}</tbody>
    </table>;
  }
  return <>
    {table(emphasized, '대상·주문 한도와 변경 조건')}
    {other.length > 0 && <details className="plan-more">
      <summary>나머지 실행 조건 {other.length}개</summary>
      {table(other, '추가 실행 조건')}
    </details>}
  </>;
}
function initialEdit(key: string, base: string | null, fallback: TradingTerms) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (
      cached &&
      cached.base === base &&
      cached.terms?.kind === fallback.kind &&
      Object.entries(fallback).every(([field, value]) => typeof cached.terms[field] === typeof value)
    )
      return cached.terms as TradingTerms;
  } catch {
    /* Optional, tab-scoped navigation draft. */
  }
  return fallback;
}
function Editor({
  kind,
  step,
  data,
  update,
  refresh,
  checking,
}: {
  kind: PlanKind;
  step: number;
  data: TradingSettingsData;
  update: (p: PlanRecord) => void;
  refresh: () => void;
  checking: boolean;
}) {
  const { state, act, available, busy, server } = useWorkbench();
  const navigationState = useLocation().state;
  const [params] = useSearchParams(),
    go = useNavigate();
  const record = data.plans[kind],
    initial = record?.draft,
    id = initial?.id ?? null;
  const requestedId = kind === 'strategy' ? params.get('strategy') : null;
  const key = 'trading-draft-' + server?.instanceId + '-' + kind + (requestedId ? ':' + requestedId : '');
  const strategies = state.strategies.filter(s => s.environment === 'kis-paper');
  const [base, setBase] = useState(id);
  const [terms, setTerms] = useState<TradingTerms>(() => {
    let fallback = initial?.terms ?? defaults(kind, strategies[0]);
    if (requestedId && fallback.kind === 'strategy' && fallback.strategyId !== requestedId) {
      const requested = strategies.find(s => s.id === requestedId);
      fallback = { ...fallback, strategyId: requested?.id ?? '', revision: requested?.revision ?? 1 };
    }
    return initialEdit(key, id, fallback);
  });
  const [error, setError] = useState(''),
    errorRef = useRef<HTMLParagraphElement>(null);
  const [copied, setCopied] = useState<TradingTerms | undefined>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key + '-comparison') ?? 'null');
      if (saved?.base === base) return tradingTerms.parse(saved.terms);
    } catch {
      /* No valid comparison for this revision. */
    }
    return undefined;
  });
  const [importText, setImportText] = useState('');
  const [newStrategy, setNewStrategy] = useState<{
    name: string;
    code: string;
    qty: number;
    fast: number;
    slow: number;
  } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fixedRef = useRef<HTMLParagraphElement>(null);
  const policyRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);
  const locked = busy || checking || !available || base !== id;
  const selected = terms.kind === 'strategy' ? strategies.find((s) => s.id === terms.strategyId) : undefined;
  const selectedBlockReason = selected ? kisContractBlockReason(selected) : '';
  const selectedUnsupported = Boolean(selectedBlockReason);
  const selectedConfirmedDaily = Boolean(selected && isKisConfirmedDaily(selected));
  const savedStrategyId = initial?.terms.kind === 'strategy' ? initial.terms.strategyId : undefined;
  const savedStrategy = savedStrategyId ? strategies.find((s) => s.id === savedStrategyId) : undefined;
  const savedConditions = snapshotStrategyConditions(initial, savedStrategy ?? selected);
  const previousPlan = record?.previous;
  const previousStrategyId = previousPlan?.terms.kind === 'strategy' ? previousPlan.terms.strategyId : undefined;
  const previousFallback = previousStrategyId ? strategies.find((s) => s.id === previousStrategyId) : undefined;
  const previousConditions = snapshotStrategyConditions(previousPlan, previousFallback);
  const studioDraftState = selected
    ? {
        backtestDraft: {
          code: selected.code,
          rule: selected.rule ?? {
            kind: 'ma_crossover' as const,
            maType: 'sma' as const,
            fast: selected.fast,
            slow: selected.slow,
          },
          ...(selected.overlay ? { overlay: selected.overlay } : {}),
        },
      }
    : undefined;
  const mismatch = available && terms.kind === 'strategy' && (!selected || selected.revision !== terms.revision);
  const parsedTerms = tradingTerms.safeParse(terms);
  const saved = !!initial && parsedTerms.success &&
    JSON.stringify(tradingTerms.safeParse(initial.terms).data) === JSON.stringify(parsedTerms.data);
  const limitsChanged =
    available && !!initial && !initial.fixed && JSON.stringify(initial.limits) !== JSON.stringify(planLimits(state));
  const reviewConditions = saved && savedConditions ? savedConditions : selected;
  const reviewConfirmedDaily = Boolean(reviewConditions && isKisConfirmedDaily(reviewConditions));
  const nextRuleSummary =
    terms.kind === 'strategy' && reviewConditions ? formatTradingStrategyRule(reviewConditions) : undefined;
  const previousTerms = copied ?? record?.previous?.terms;
  const copiedStrategy =
    copied?.kind === 'strategy' ? strategies.find((s) => s.id === copied.strategyId) : undefined;
  const previousRuleSummary =
    previousTerms?.kind === 'strategy'
      ? copied
        ? copiedStrategy
          ? formatTradingStrategyRule(copiedStrategy)
          : undefined
        : previousConditions
          ? formatTradingStrategyRule(previousConditions)
          : undefined
      : undefined;
  function edit(t: TradingTerms) {
    if (!t.policy)
      t = t.kind === 'once' ? { ...t, policy: defaultOncePolicy(t.date) } : { ...t, policy: defaultStrategyPolicy() };
    setTerms(t);
    setError('');
    try {
      sessionStorage.setItem(key, JSON.stringify({ base, terms: t }));
    } catch {
      /* Saving to the server remains available. */
    }
  }
  function goto(s: number) {
    setError('');
    go(home + '/' + kind + '/' + s + locationSearch(), { state: navigationState });
  }
  function locationSearch() {
    return params.size ? '?' + params.toString() : '';
  }
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  async function advance(e: FormEvent) {
    e.preventDefault();
    if (locked) return;
    if (selectedUnsupported) {
      setError(`${selectedBlockReason} KIS 모의 계약으로 진행하거나 저장할 수 없습니다.`);
      return;
    }
    if (mismatch) {
      setError('현재 revision의 저장 전략을 다시 선택하세요.');
      return;
    }
    if (step === 1) {
      if (terms.kind === 'strategy' && !(Date.parse(terms.startsAt) < Date.parse(terms.endsAt))) {
        setError('종료 시각은 시작 시각보다 늦어야 합니다.');
        return;
      }
      goto(2);
      return;
    }
    if (!parsedTerms.success) {
      if (policyRef.current) policyRef.current.open = true;
      setError(parsedTerms.error.issues.map((i) => i.message).join(' · '));
      return;
    }
    try {
      if (step === 2 && saved && !limitsChanged) {
        goto(3);
        return;
      }
      const fixing = step === 3;
      if (fixing && (!saved || initial?.fixed || !data.canFix || limitsChanged)) {
        setError('먼저 지원되는 초안을 저장하고 검토하세요.');
        return;
      }
      const result = await act<{ plan: PlanRecord }>(
        fixing ? 'trading-settings/fix' : 'trading-settings/draft',
        fixing ? { kind, expectedId: base } : { expectedId: base, terms: parsedTerms.data },
      );
      if (copied) {
        try {
          sessionStorage.setItem(key + '-comparison', JSON.stringify({ base: result.plan.draft.id, terms: copied }));
        } catch {
          /* Optional cache. */
        }
      }
      update(result.plan);
      setBase(result.plan.draft.id);
      setTerms(result.plan.draft.terms);
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* Optional cache. */
      }
      if (!fixing) goto(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
      refresh();
    }
  }
  const fixed = initial?.fixed && saved;
  const wasFixed = useRef(fixed);
  useEffect(() => {
    if (fixed && !wasFixed.current && step === 3) {
      setError('');
      fixedRef.current?.focus();
    }
    wasFixed.current = fixed;
  }, [fixed, step]);
  return (
    <Panel className="plan-editor">
      <header className="panel-head">
        <h2 tabIndex={-1} ref={headingRef}>{stages[step - 1]}</h2>
        <span>{step} / 3</span>
      </header>
      {error && (
        <p role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      )}
      {!available && <p role="status">로컬 상태 미확인 · 최신 한도와 전략을 확인할 때까지 편집이 잠깁니다.</p>}
      {checking && step !== 3 && <p role="status">저장 상태를 원장에서 다시 확인하는 중입니다.</p>}
      {base !== id && !checking && (<>
        <p role="alert">다른 화면에서 초안이 변경됐습니다. 최신 저장본을 확인하세요.</p>
        <button
          className="button secondary"
          onClick={() => {
            setCopied(undefined);
            setBase(id);
            setTerms(initial?.terms ?? defaults(kind));
            setError('');
            goto(1);
          }}
        >
          최신 저장본 다시 열기
        </button>
      </>)}
      <form onSubmit={advance}>
        <fieldset className="plan-fields" disabled={locked}>
          {step > 1 && mismatch && <p role="alert">저장 전략을 확인할 수 없거나 revision이 변경됐습니다. 대상·기간에서 다시 선택하세요.</p>}
          {step === 2 && selected && !selectedUnsupported && !isBasicRealtimeSma(selected.rule, selected.overlay, selected.slow) && (
            <p>{selected.name} · {formatTradingStrategyRule(selected)}</p>
          )}
          {step > 1 && selectedUnsupported && selected && (
            <div role="alert" className="plan-phase">
              <p>
                선택한 전략({selected.name} · {formatTradingStrategyRule(selected)})은 KIS 모의 계약 대상이 아닙니다.{' '}
                {selectedBlockReason}
              </p>
              <p>
                <Link to={home + '/strategy/1' + locationSearch()}>대상·기간(1단계)으로 돌아가기</Link>
              </p>
            </div>
          )}
          {step === 1 && terms.kind === 'once' && (
            <>
              <label className="field">
                실행일 (KST)
                <input
                  type="date"
                  required
                  value={terms.date}
                  onChange={(e) => {
                    const policy = terms.policy ?? defaultOncePolicy(terms.date);
                    const previous = krxHours(terms.date, policy.exchangeNotice);
                    const defaultWindow =
                      policy.session.open === previous.open && policy.session.close === previous.close;
                    edit({
                      ...terms,
                      date: e.target.value,
                      policy: {
                        ...policy,
                        exchangeNotice: undefined,
                        session: defaultWindow ? krxHours(e.target.value) : policy.session,
                      },
                    });
                  }}
                />
              </label>
              <label className="field">
                주문 방식
                <select
                  value={terms.orderType}
                  onChange={(e) =>
                    edit({
                      ...terms,
                      orderType: e.target.value as 'market' | 'limit',
                      cancelProbe: false,
                      policy: {
                        ...(terms.policy ?? defaultOncePolicy(terms.date)),
                        priceMode: 'current',
                        limitPrice: undefined,
                      },
                    })
                  }
                >
                  <option value="limit">지정가</option>
                  <option value="market">시장가</option>
                </select>
              </label>
              <label className="field">
                대상 종목
                <input
                  list="plan-symbols"
                  required
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={terms.code}
                  onChange={(e) => edit({ ...terms, code: e.target.value })}
                />
                <datalist id="plan-symbols">
                  <option value="005930">삼성전자</option>
                  <option value="069500">KODEX 200</option>
                </datalist>
              </label>
              <p className="muted">
                다른 국내 주식·ETF는 6자리 종목코드를 입력하고 <Link to="/data">데이터</Link>에서 종목 마스터를
                갱신하세요.
              </p>
              <label className="field">
                주문 방향
                <select
                  value={terms.policy?.side ?? 'buy'}
                  onChange={(e) =>
                    edit({
                      ...terms,
                      cancelProbe: false,
                      policy: {
                        ...(terms.policy ?? defaultOncePolicy(terms.date)),
                        side: e.target.value as 'buy' | 'sell',
                        ...(e.target.value === 'sell' &&
                          terms.policy?.priceMode === 'cappedCurrent' && {
                            priceMode: 'current' as const,
                            limitPrice: undefined,
                          }),
                      },
                    })
                  }
                >
                  <option value="buy">매수</option>
                  <option value="sell">매도</option>
                </select>
              </label>
            </>
          )}
          {step === 1 && terms.kind === 'strategy' && (
            <>
              <label className="field">
                저장 KIS 전략
                <select
                  required
                  value={terms.strategyId}
                  onChange={(e) => {
                    const s = strategies.find((v) => v.id === e.target.value);
                    if (s) {
                      if (!isBasicRealtimeSma(s.rule, s.overlay, s.slow)) setNewStrategy(null);
                      edit({ ...terms, strategyId: s.id, revision: s.revision ?? 1 });
                    }
                  }}
                >
                  <option value="">전략 선택</option>
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.code}
                    </option>
                  ))}
                </select>
              </label>
              {available && selected && (
                <>
                  <p>
                    {selected.code} · revision {selected.revision} · {formatTradingStrategyRule(selected)} ·{' '}
                    {selected.qty}주
                  </p>
                  {selectedConfirmedDaily && (
                    <p role="status">
                      확정 일봉 기반 계약 · {CONFIRMED_DAILY_CONTRACT_NOTICE}
                    </p>
                  )}
                  {selectedUnsupported && (
                    <p role="status">
                      이 전략은 KIS 모의 계약 대상이 아닙니다. {selectedBlockReason} 이 설정을 바탕으로 새 전략을
                      만들려면{' '}
                      <Link to="/strategies?environment=kis-paper#strategy-editor" state={studioDraftState}>
                        전략 스튜디오에서 이 설정으로 새 전략 만들기
                      </Link>
                      를 이용하세요.
                    </p>
                  )}
                </>
              )}
              {mismatch && (
                <p role="status">
                  {selected ? `초안 revision ${terms.revision} · 현재 revision ${selected.revision}` : strategies.length ? '계약에 사용할 저장 전략을 선택하세요.' : '저장된 KIS 전략이 없습니다.'}{' '}
                  <Link to="/strategies?environment=kis-paper">전략 스튜디오</Link>
                  {selected && (
                    <button type="button" onClick={() => edit({ ...terms, revision: selected.revision ?? 1 })}>
                      현재 revision 사용
                    </button>
                  )}
                </p>
              )}
              {selected && !isBasicRealtimeSma(selected.rule, selected.overlay, selected.slow) ? (
                <p className="muted">
                  다중 규칙·오버레이 전략은 기본 SMA 빠른 복사 대상이 아닙니다.{' '}
                  <Link to="/strategies?environment=kis-paper#strategy-editor" state={studioDraftState}>
                    전략 스튜디오에서 이 설정으로 새 전략 만들기
                  </Link>
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() =>
                      setNewStrategy(
                        newStrategy
                          ? null
                          : {
                              name: selected ? selected.name + ' 복사' : '모의 교차 전략',
                              code: selected?.code ?? '005930',
                              qty: selected?.qty ?? 1,
                              fast: selected?.fast ?? 2,
                              slow: selected?.slow ?? 3,
                            },
                      )
                    }
                  >
                    {newStrategy ? '전략 입력 닫기' : '종목·수량·교차 주기로 새 전략 만들기'}
                  </button>
                  {newStrategy && (
                    <fieldset className="plan-fields">
                      <legend>새 KIS 전략</legend>
                      <label className="field">
                        전략 이름
                        <input
                          value={newStrategy.name}
                          onChange={(e) => setNewStrategy({ ...newStrategy, name: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        전략 종목코드
                        <input
                          maxLength={6}
                          value={newStrategy.code}
                          onChange={(e) => setNewStrategy({ ...newStrategy, code: e.target.value })}
                        />
                      </label>
                      {(['qty', 'fast', 'slow'] as const).map((k, i) => (
                        <NumberField
                          key={k}
                          label={['신호당 수량 (주)', '단기 주기', '장기 주기'][i]}
                          value={newStrategy[k]}
                          min={[1, 2, 3][i]}
                          max={[10000, 60, 100][i]}
                          onChange={(value) => setNewStrategy({ ...newStrategy, [k]: value })}
                        />
                      ))}
                      <button
                        type="button"
                        className="button secondary"
                        onClick={async () => {
                          try {
                            const result = await act<{ id: string; revision: number }>('strategies', {
                              ...newStrategy,
                              environment: 'kis-paper',
                            });
                            edit({ ...terms, strategyId: result.id, revision: result.revision });
                            setNewStrategy(null);
                          } catch (e) {
                            setError(e instanceof Error ? e.message : '전략 저장 실패');
                          }
                        }}
                      >
                        정지 상태로 저장하고 선택
                      </button>
                    </fieldset>
                  )}
                </>
              )}
              {(['startsAt', 'endsAt'] as const).map((field, i) => (
                <label className="field" key={field}>
                  {i ? '종료' : '시작'} (KST)
                  <input
                    type="datetime-local"
                    required
                    value={kst(terms[field])}
                    onChange={(e) => edit({ ...terms, [field]: instant(e.target.value) })}
                  />
                </label>
              ))}
            </>
          )}
          {step === 1 && (
            <details>
              <summary>실행 모드에서 복사한 설정 가져오기</summary>
              <label className="field">
                복사한 설정
                <textarea value={importText} onChange={(e) => setImportText(e.target.value)} />
              </label>
              <button
                type="button"
                onClick={() => {
                  try {
                    const t = tradingTerms.parse(JSON.parse(importText));
                    if (t.kind !== kind) throw Error();
                    edit(t);
                    setCopied(t);
                    try {
                      sessionStorage.setItem(key + '-comparison', JSON.stringify({ base, terms: t }));
                    } catch {
                      /* Optional cache. */
                    }
                  } catch {
                    setError('이 화면에 맞는 설정 형식을 확인하세요.');
                  }
                }}
              >
                입력에 반영
              </button>
              {copied && <span> 반영됨</span>}
            </details>
          )}
          {step === 2 && terms.kind === 'once' && (
            <>
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  edit({
                    ...terms,
                    code: '005930',
                    orderType: 'limit',
                    maxQty: 2,
                    maxAmount: 300000,
                    allowExistingHolding: true,
                    cancelProbe: false,
                    policy: {
                      ...defaultOncePolicy(terms.date),
                      priceMode: 'lower',
                      limitPrice: 136300,
                      consumeAt: 'validated',
                      observationSeconds: 600,
                    },
                  })
                }
              >
                11월 19일 하한가 2주 예시 불러오기
              </button>
              <small>
                당시 단가 136,300원 · 합계 272,600원. 실행일의 실제 하한가를 확인하고 고정 단가를 수정하세요.
              </small>
              <NumberField
                label="승인 최대 수량 (주)"
                max={100000}
                value={terms.maxQty}
                onChange={(maxQty) => edit({ ...terms, maxQty })}
              />
              <NumberField
                label="승인 주문대금 (원)"
                max={100000000}
                value={terms.maxAmount}
                onChange={(maxAmount) => edit({ ...terms, maxAmount })}
              />
              <label className="check-row">
                <input
                  type="checkbox"
                  disabled={terms.policy?.side === 'sell'}
                  checked={terms.allowExistingHolding}
                  onChange={(e) => edit({ ...terms, allowExistingHolding: e.target.checked })}
                />
                기존 보유 종목 매수 허용{terms.policy?.side === 'sell' && ' (매도 시 미적용)'}
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  disabled={
                    !terms.cancelProbe &&
                    !validOncePolicy(
                      terms.policy ?? defaultOncePolicy(terms.date),
                      terms.orderType,
                      terms.code,
                      terms.maxAmount,
                      true,
                    )
                  }
                  checked={terms.cancelProbe}
                  onChange={(e) => edit({ ...terms, cancelProbe: e.target.checked })}
                />
                승인 원주문 잔량 취소 1회 허용 (기존 두 종목·현재가 매수·승인액 20만원 이내)
              </label>
              <details className="plan-more" ref={policyRef}>
                <summary>지정가·시간·응답 정책</summary>
                <TradingPolicyFields terms={terms} edit={edit} />
              </details>
              <p className="muted">
                {available ? <>공통 수동 {state.paperManualMaxQty ?? DEFAULT_PAPER_MAX_QTY}주 · 주문당 {won(state.risk.maxOrder)}원 ·
                종목별 {won(state.risk.maxPosition)}원.</> : '현재 공통 한도 미확인'}{' '}<Link to={home + '/general'}>일반 한도 수정</Link>
              </p>
              <p>
                시장가는 상한가 × 전체 수량으로 검사합니다. 하한가·시장가 주문의 잔량은 KIS 모의 앱에서 직접 취소하고
                원장으로 대조하세요.
              </p>
            </>
          )}
          {step === 2 && terms.kind === 'strategy' && (
            <>
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  edit({
                    ...terms,
                    policy: { ...(terms.policy ?? defaultStrategyPolicy()), quoteSeconds: 15, signalSeconds: 15 },
                  })
                }
              >
                지연 재현용 시세·신호 15초 적용
              </button>
              <NumberField
                label="주문당 최대 금액 (원)"
                value={terms.maxOrderAmount}
                onChange={(maxOrderAmount) => edit({ ...terms, maxOrderAmount })}
              />
              <NumberField
                label="총 전송 시도 횟수"
                value={terms.maxAttempts}
                onChange={(maxAttempts) => edit({ ...terms, maxAttempts })}
              />
              <NumberField
                label="매수·매도 합산 한도 (원)"
                value={terms.maxTotalAmount}
                onChange={(maxTotalAmount) => edit({ ...terms, maxTotalAmount })}
              />
              <label className="field">
                매도 범위
                <select
                  value={terms.sellPolicy}
                  onChange={(e) => edit({ ...terms, sellPolicy: e.target.value as 'account' | 'deny' | 'contract' })}
                >
                  <option value="deny">매수만</option>
                  <option value="account">기존 계좌 보유 포함</option>
                  <option value="contract">이 계약에서 체결된 순매수 수량만</option>
                </select>
              </label>
              <details className="plan-more" ref={policyRef}>
                <summary>주문 방식·신호·응답 정책</summary>
                <TradingPolicyFields terms={terms} edit={edit} />
              </details>
              <p>
                {selectedConfirmedDaily
                  ? '확정 일봉 신호가 없거나 규칙을 바꾸려면 전략 스튜디오에서 새 전략을 저장한 뒤 대상 단계에서 다시 선택하세요.'
                  : '교차 신호가 없으면 대상 단계에서 종목·수량·교차 주기를 바꾼 새 전략을 저장하고 선택하세요.'}
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <div className={fixed ? 'plan-phase fixed' : 'plan-phase'}>
                {fixed ? <>
                  <p role="status" tabIndex={-1} ref={fixedRef}>고정 완료 · 실행 대기</p>
                  <span>별도 서버를 이 고정 파일로 시작할 때 조건이 적용됩니다.</span>
                  <details><summary>다음 실행에 사용할 고정 파일</summary>
                    <p>다음 서버의 <code>{kind === 'once' ? 'KIS_PAPER_APPROVAL_FILE' : 'KIS_STRATEGY_CONTRACT_FILE'}</code>에
                      일반 원장 폴더 기준의 파일을 지정하세요.</p>
                    <code>trading-runs/{kind === 'once' ? 'approval' : 'strategy'}-{initial.id}/
                      {kind === 'once' ? 'approval' : 'strategy'}-{initial.runId}.json</code>
                  </details>
                </> : <>
                  <p role="status">{checking ? '저장 결과 확인 중' : saved ? '초안 저장됨 · 고정 전' : '편집 중 · 초안 재저장 필요'}</p>
                  <span>{checking ? '원장 확인 후 고정 여부를 표시합니다.' : saved ? '고정하면 다음 실행용 파일이 만들어집니다. 주문과 전략은 시작되지 않습니다.' : '한도·조건에서 저장한 뒤 다시 검토하세요.'}</span>
                </>}
              </div>
              {saved && initial?.symbol && (
                <p>
                  저장 대상 {initial.symbol} ·{' '}
                  {savedConditions && !isBasicRealtimeSma(savedConditions.rule, savedConditions.overlay, savedConditions.slow)
                    ? formatTradingStrategyRule(savedConditions)
                    : `${initial.fast}/${initial.slow}`}{' '}
                  · {initial.qty}주
                </p>
              )}
              {terms.kind === 'strategy' && !selectedUnsupported && reviewConfirmedDaily && (
                <p role="status">
                  확정 일봉 기반 계약 · {CONFIRMED_DAILY_CONTRACT_NOTICE}
                </p>
              )}
              {initial?.limits && (
                <div className="plan-snapshot">
                  {saved && terms.kind === 'once' && <p><strong>적용 상한</strong> {Math.min(initial.limits.manualQty, terms.maxQty)}주
                    · 주문당 {won(Math.min(initial.limits.maxOrder, terms.maxAmount))}원</p>}
                  <p>저장 시 긴급정지 {initial.limits.halted ? '켜짐' : '꺼짐'} · 종목별 {won(initial.limits.maxPosition)}원
                    · 일일 손실 {won(initial.limits.dailyLoss)}원</p>
                  <details><summary>저장한 공통 한도</summary>
                    <p>수동 {initial.limits.manualQty}주 · 주문당 {won(initial.limits.maxOrder)}원.
                      종목별 투자금과 KIS 가능수량은 전송 전에 다시 검사합니다.</p>
                  </details>
                </div>
              )}
              {!data.canFix && <p role="status">고정은 전용 파일을 만들 수 있는 일반 디스크 원장에서 가능합니다.</p>}
              {limitsChanged && <p role="alert">공통 한도가 변경됐습니다. 한도·조건 단계에서 다시 저장하세요.</p>}
              <Comparison
                next={terms}
                previous={previousTerms}
                source={copied ? '복사한 실행 조건' : '이전 고정본'}
                nextRuleSummary={nextRuleSummary}
                previousRuleSummary={previousRuleSummary}
              />
            </>
          )}
          <div className="button-row">
            {step > 1 && (
              <button type="button" className="button secondary" onClick={() => goto(step - 1)}>
                {step === 3 ? '한도·조건 수정' : '이전 단계'}
              </button>
            )}
            {step === 3 && <button type="button" className="text-link" onClick={() => goto(1)}>대상·기간 수정</button>}
            {(step < 3 || !initial?.fixed || !saved) && (
              <button
                className="button primary"
                disabled={mismatch || selectedUnsupported || (step === 3 && (!data.canFix || !saved || limitsChanged))}
              >
                {['한도·조건으로', '초안 저장 및 검토', '다음 실행 고정'][step - 1]}
              </button>
            )}
          </div>
        </fieldset>
      </form>
      {params.get('from') === 'paper' && (
        <Link
          className="button secondary"
          state={{ paperReturn: navigationState?.paperKey }}
          to={'/paper?code=' + encodeURIComponent(params.get('code') ?? '005930')}
        >
          주문 입력으로 돌아가기
        </Link>
      )}
    </Panel>
  );
}

export function TradingSettings() {
  const { state, available, server } = useWorkbench();
  const loc = useLocation(),
    [params] = useSearchParams();
  const riskReturn = params.get('env') === 'kis' ? '/risk?env=kis' : '/risk';
  const [, , , section, stage, ...extra] = loc.pathname.split('/');
  const [data, setData] = useState<TradingSettingsData | null>(null),
    [failed, setFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  const loadSequence = useRef(0);
  const [copy, setCopy] = useState(false),
    [refreshKey, refresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController(),
      seq = ++loadSequence.current;
    setFailed(false);
    fetch('/api/trading-settings', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((v) => {
        if (!controller.signal.aborted && seq === loadSequence.current) {
          setData(v);
          setChecking(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && seq === loadSequence.current) {
          setFailed(true);
          setChecking(false);
          setData(null);
        }
      });
    return () => controller.abort();
  }, [server?.instanceId, refreshKey, section]);
  const update = (plan: PlanRecord) => {
    loadSequence.current++;
    setChecking(false);
    setData((old) => old && { ...old, plans: { ...old.plans, [plan.draft.terms.kind]: plan } });
  };
  if (loc.pathname.endsWith('/'))
    return <Navigate replace to={loc.pathname.replace(/\/+$/, '') + loc.search + loc.hash} state={loc.state} />;
  if (failed)
    return (
      <div role="alert">
        매매 설정 조회 실패 <button onClick={() => refresh((n) => n + 1)}>다시 조회</button>
      </div>
    );
  if (!data) return <p role="status">매매 설정 조회 중</p>;
  if (
    extra.length ||
    (section && !Object.hasOwn(titles, section)) ||
    (stage && (!['1', '2', '3'].includes(stage) || section === 'general'))
  )
    return <Navigate replace to={home} />;
  if (!data.active && (section === 'once' || section === 'strategy') && stage === '3' && !data.plans[section])
    return <Navigate replace to={home + '/' + section + '/1' + loc.search} state={loc.state} />;
  if (data.active) {
    const activeStrategyId = data.active.kind === 'strategy' ? data.active.strategyId : undefined;
    const activeStrategy = activeStrategyId
      ? state.strategies.find((s) => s.id === activeStrategyId && s.environment === 'kis-paper')
      : undefined;
    const activeRuleSummary = activeStrategy ? formatTradingStrategyRule(activeStrategy) : undefined;
    const activeConfirmedDaily = Boolean(activeStrategy && isKisConfirmedDaily(activeStrategy));
    return (
      <Panel title="현재 실행 조건">
        <p>전용 실행 원장 · 읽기 전용</p>
        {activeConfirmedDaily && (
          <p className="muted">확정 일봉 기반 계약 · {CONFIRMED_DAILY_CONTRACT_NOTICE}</p>
        )}
        {data.active.kind === 'once' && !data.active.policy && (
          <p className="muted">
            {data.active.orderType === 'limit'
              ? '지정가는 재조회 현재가와 일치해야 합니다.'
              : '시장가는 삼성전자 1주 상한가 기준으로 검사합니다.'}
          </p>
        )}
        {params.get('from') === 'paper' && (
          <Link
            className="text-link"
            state={{ paperReturn: loc.state?.paperKey }}
            to={'/paper?code=' + encodeURIComponent(params.get('code') ?? '005930')}
          >
            주문 입력으로 돌아가기
          </Link>
        )}
        {params.get('from') === 'risk' && (
          <Link className="text-link" to={riskReturn}>
            위험관리로 돌아가기
          </Link>
        )}
        <dl>
          {description(data.active, activeRuleSummary).map(([k, v]) => (
            <div className="check-row" key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {data.usage && (
          <p>
            사용 {data.usage.attempts}회 · {won(data.usage.amount)}원
          </p>
        )}
        <button className="button secondary" aria-expanded={copy} onClick={() => setCopy((v) => !v)}>
          다음 실행용 설정 보기
        </button>
        {copy && (
          <label className="field">
            일반 앱의 대상 단계에서 가져올 설정
            <textarea readOnly value={JSON.stringify(data.active)} onFocus={(e) => e.target.select()} />
          </label>
        )}
      </Panel>
    );
  }
  if (!section)
    return (
      <div className="plan-menu">
        {(['general', 'once', 'strategy'] as const).map((k, i) => {
          const Icon = [SlidersHorizontal, ClipboardList, Workflow][i];
          const plan = k === 'general' ? null : data.plans[k]?.draft;
          const destination = plan ? k + '/3' : k;
          const planStrategyId = plan?.terms.kind === 'strategy' ? plan.terms.strategyId : undefined;
          const planStrategy = planStrategyId
            ? state.strategies.find((s) => s.id === planStrategyId && s.environment === 'kis-paper')
            : undefined;
          const planConditions = snapshotStrategyConditions(plan ?? undefined, planStrategy);
          const planRuleSummary = planConditions ? formatTradingStrategyRule(planConditions) : '';
          return (
            <Link className="panel plan-link" key={k} to={home + '/' + destination}>
              <Icon size={22} />
              <span>
                <strong>{titles[k]}</strong>
                <small>
                  {k === 'general'
                    ? available
                      ? `저장 즉시 적용 · 수동 ${state.paperManualMaxQty ?? DEFAULT_PAPER_MAX_QTY}주 · 주문당 ${won(state.risk.maxOrder)}원`
                      : '현재 한도 미확인'
                    : `${plan?.fixed ? '고정 완료 · 실행 대기' : plan ? '저장된 초안 · 고정 전' : '초안 없음'} · ${plan?.terms.kind === 'once' ? plan.terms.code + ' · ' + plan.terms.maxQty + '주 · ' + won(plan.terms.maxAmount) + '원' : plan?.terms.kind === 'strategy' ? (planRuleSummary ? planRuleSummary + ' · ' : '') + plan.terms.maxAttempts + '회 · 합산 ' + won(plan.terms.maxTotalAmount) + '원' : '다음 실행 조건 준비'}`}
                </small>
              </span>
              <ChevronRight size={18} />
            </Link>
          );
        })}
        <details className="panel">
          <summary>테스트 중단 사유와 조치</summary>
          <p>
            가격·수량·금액·시간창은 다음 한정 실행에서, 신호 만료·재연결 소진은 다음 전략 계약에서 변경하세요. 고정은 새
            원장에 조건만 저장합니다.
          </p>
          <p>
            거래정지·미수 없는 매수 가능수량·계좌 매도 가능수량은 KIS가 결정합니다. 인증과 잔고는{' '}
            <Link to="/settings">연결 설정</Link>, 긴급정지는 <Link to="/risk">위험관리</Link>, 불명 주문과 체결·잔량은{' '}
            <Link to="/paper">모의 주문</Link>에서 확인하세요.
          </p>
          <p>
            부분체결은 증권사의 체결 결과입니다. 실증에는 같은 주문의 일부 체결·양수 잔량, 잔량 취소 시도, 최종
            체결·취소확인·잔량 기록이 필요합니다.
          </p>
        </details>
      </div>
    );
  const from = params.get('from'),
    code = params.get('code') ?? '005930';
  return (
    <div className="plan-page">
      <Link className="text-link" to={home}>
        ← 매매 설정 목차
      </Link>
      {section === 'general' ? (
        <>
          <PaperQuantitySetting saved={state.paperManualMaxQty ?? DEFAULT_PAPER_MAX_QTY} />
          {from === 'paper' && (
            <Link
              className="button secondary plan-return"
              state={{ paperReturn: loc.state?.paperKey }}
              to={'/paper?code=' + encodeURIComponent(code)}
            >
              주문 입력으로 돌아가기
            </Link>
          )}
          <RiskLimitSettings />
          {from === 'risk' && (
            <Link className="button secondary" to={riskReturn}>
              위험관리로 돌아가기
            </Link>
          )}
        </>
      ) : (
        <Editor
          key={section === 'strategy' ? section + ':' + (params.get('strategy') ?? '') : section}
          kind={section as PlanKind}
          step={Number(stage ?? 1)}
          data={data}
          update={update}
          checking={checking}
          refresh={() => {
            setChecking(true);
            refresh(n => n + 1);
          }}
        />
      )}
    </div>
  );
}
