import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, ClipboardList, SlidersHorizontal, Workflow } from 'lucide-react';
import { DEFAULT_PAPER_MAX_QTY } from '../../shared/contracts';
import {
  tradingTerms,
  planLimits,
  type PlanKind,
  type PlanRecord,
  type TradingSettingsData,
  type TradingTerms,
} from '../../shared/trading-plan';
import { won, type Strategy } from '../../shared/model';
import { Panel } from '../components/ui';
import { PaperQuantitySetting } from '../components/PaperQuantitySetting';
import { RiskLimitSettings } from '../components/RiskLimitSettings';
import { useWorkbench } from '../context';

import { defaultOncePolicy, defaultStrategyPolicy, krxHours, validOncePolicy } from '../../shared/trading-policy';
import { NumberField, priceNames, TradingPolicyFields } from '../components/TradingPolicyFields';

const home = '/settings/trading';
const titles = { general: '일반 주문·위험', once: '다음 한정 실행', strategy: '다음 전략 계약' };
const stages = ['대상·기간', '한도·조건', '검토·고정'];
const kst = (value: string) =>
  Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 16) : '';
const instant = (value: string) => (value ? new Date(value + ':00+09:00').toISOString() : '');
const localTime = (value: string) => kst(value).replace('T', ' ') + ' KST';
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
function description(t: TradingTerms): [string, string][] {
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
          ['기존 보유', t.allowExistingHolding ? '허용' : '차단'],
          ['잔량 취소', t.cancelProbe ? '한정 API 1회' : '모의 앱 수동 대응'],
        ]
      : [
          ['저장 전략', t.strategyId + ' · revision ' + t.revision],
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
          ['고정 단가', p.limitPrice ? won(p.limitPrice) + '원' : '재조회 현재가'],
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
}: {
  next: TradingTerms;
  previous?: TradingTerms;
  source?: string;
}) {
  const before = new Map(previous ? description(previous) : []);
  return (
    <div className="table-scroll">
      <table>
        <caption className="sr-only">기존 고정본과 다음 설정</caption>
        <thead>
          <tr>
            <th>항목</th>
            <th>{source}</th>
            <th>다음 설정</th>
          </tr>
        </thead>
        <tbody>
          {description(next).map(([key, value]) => (
            <tr key={key}>
              <th scope="row">{key}</th>
              <td>{before.get(key) ?? '없음'}</td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
}: {
  kind: PlanKind;
  step: number;
  data: TradingSettingsData;
  update: (p: PlanRecord) => void;
  refresh: () => void;
}) {
  const { state, act, available, busy, server } = useWorkbench();
  const navigationState = useLocation().state;
  const [params] = useSearchParams(),
    go = useNavigate();
  const record = data.plans[kind],
    initial = record?.draft,
    id = initial?.id ?? null;
  const key = 'trading-draft-' + server?.instanceId + '-' + kind;
  const strategies = state.strategies.filter((s) => s.environment === 'kis-paper');
  const requested = strategies.find((s) => s.id === params.get('strategy'));
  const [base, setBase] = useState(id);
  const [terms, setTerms] = useState<TradingTerms>(() =>
    initialEdit(
      key,
      id,
      requested && kind === 'strategy'
        ? ({
            ...(initial?.terms.kind === 'strategy' ? initial.terms : defaults('strategy', requested)),
            kind: 'strategy',
            strategyId: requested.id,
            revision: requested.revision ?? 1,
          } as TradingTerms)
        : (initial?.terms ?? defaults(kind, strategies[0])),
    ),
  );
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
  const locked = busy || !available || base !== id;
  const selected = terms.kind === 'strategy' ? strategies.find((s) => s.id === terms.strategyId) : undefined;
  const mismatch = terms.kind === 'strategy' && (!selected || selected.revision !== terms.revision);
  const saved = id !== null && JSON.stringify(initial?.terms) === JSON.stringify(tradingTerms.safeParse(terms).data);
  const limitsChanged =
    !!initial && !initial.fixed && JSON.stringify(initial.limits) !== JSON.stringify(planLimits(state));
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
    if (mismatch) {
      setError('현재 revision의 저장 전략을 다시 선택하세요.');
      return;
    }
    if (step === 1) {
      goto(2);
      return;
    }
    const parsed = tradingTerms.safeParse(terms);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(' · '));
      return;
    }
    try {
      if (step === 2 && saved && !limitsChanged) {
        goto(3);
        return;
      }
      const fixing = step === 3;
      if (fixing && (!saved || initial?.fixed || !data.canFix)) {
        setError('먼저 지원되는 초안을 저장하고 검토하세요.');
        return;
      }
      const result = await act<{ plan: PlanRecord }>(
        fixing ? 'trading-settings/fix' : 'trading-settings/draft',
        fixing ? { kind, expectedId: base } : { expectedId: base, terms: parsed.data },
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
  return (
    <Panel title={stages[step - 1]}>
      <p className="muted">
        {step}/3 · {titles[kind]}
      </p>
      {error && (
        <p role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      )}
      {base !== id && (
        <button
          className="button secondary"
          onClick={() => {
            setBase(id);
            setTerms(initial?.terms ?? defaults(kind));
            setError('');
            goto(1);
          }}
        >
          최신 저장본 다시 열기
        </button>
      )}
      <form onSubmit={advance}>
        <fieldset className="plan-fields" disabled={locked}>
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
                    if (s) edit({ ...terms, strategyId: s.id, revision: s.revision ?? 1 });
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
              {selected && (
                <p>
                  {selected.code} · revision {selected.revision} · {selected.fast}/{selected.slow} 교차 · {selected.qty}
                  주
                </p>
              )}
              {mismatch && (
                <p role="status">
                  저장 전략과 revision을 확인하세요. <Link to="/strategies?environment=kis-paper">전략 스튜디오</Link>
                  {selected && (
                    <button type="button" onClick={() => edit({ ...terms, revision: selected.revision ?? 1 })}>
                      현재 revision 사용
                    </button>
                  )}
                </p>
              )}
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
                  checked={terms.allowExistingHolding}
                  onChange={(e) => edit({ ...terms, allowExistingHolding: e.target.checked })}
                />
                기존 보유 종목 매수 허용
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
              <TradingPolicyFields terms={terms} edit={edit} />
              <p className="muted">
                공통 수동 {state.paperManualMaxQty ?? DEFAULT_PAPER_MAX_QTY}주 · 주문당 {won(state.risk.maxOrder)}원 ·
                종목별 {won(state.risk.maxPosition)}원. <Link to={home + '/general'}>일반 한도 수정</Link>
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
              <TradingPolicyFields terms={terms} edit={edit} />
              <p>교차 신호가 없으면 대상 단계에서 종목·수량·교차 주기를 바꾼 새 전략을 저장하고 선택하세요.</p>
            </>
          )}
          {step === 3 && (
            <>
              {mismatch && <p role="alert">저장 전략 revision 불일치 · 대상 단계를 다시 확인하세요.</p>}
              {initial?.symbol && (
                <p>
                  고정 대상 {initial.symbol} · {initial.fast}/{initial.slow} · {initial.qty}주
                </p>
              )}
              {initial?.limits && (
                <p>
                  공통 한도 · 주문당 {won(initial.limits.maxOrder)}원 · 종목별 {won(initial.limits.maxPosition)}원 ·
                  손실 {won(initial.limits.dailyLoss)}원 · 수동 {initial.limits.manualQty}주 · 긴급정지{' '}
                  {initial.limits.halted ? '켜짐' : '꺼짐'}
                </p>
              )}
              {initial?.limits && terms.kind === 'once' && (
                <p>
                  실제 적용 상한 · 수량 {Math.min(initial.limits.manualQty, terms.maxQty)}주 · 주문당{' '}
                  {won(Math.min(initial.limits.maxOrder, terms.maxAmount))}원. 종목별 투자금과 KIS 가능수량을 전송 전에
                  다시 검사합니다.
                </p>
              )}
              {limitsChanged && <p role="alert">공통 한도가 변경됐습니다. 한도·조건 단계에서 다시 저장하세요.</p>}
              <Comparison
                next={terms}
                previous={copied ?? record?.previous?.terms}
                source={copied ? '복사한 실행 조건' : '이전 고정본'}
              />
              <div className="button-row">
                <button type="button" className="text-link" onClick={() => goto(1)}>
                  대상·기간 수정
                </button>
                <button type="button" className="text-link" onClick={() => goto(2)}>
                  한도·조건 수정
                </button>
              </div>
              <p>
                일반 원장의 공통 위험 한도를 전용 원장에 복사합니다. 고정 후에는 해당 실행의 조건을 변경할 수 없습니다.
              </p>
              {initial?.fixed && saved && (
                <div role="status">
                  <p>고정 완료 · 실행 대기</p>
                  <p className="tiny">
                    다음 서버의 {kind === 'once' ? 'KIS_PAPER_APPROVAL_FILE' : 'KIS_STRATEGY_CONTRACT_FILE'}에 이 파일을
                    지정하세요. 경로는 일반 원장 폴더 기준입니다.
                  </p>
                  <code>
                    trading-runs/{kind === 'once' ? 'approval' : 'strategy'}-{initial.id}/
                    {kind === 'once' ? 'approval' : 'strategy'}-{initial.runId}.json
                  </code>
                </div>
              )}
            </>
          )}
          <div className="button-row">
            {step > 1 && (
              <button type="button" className="button secondary" onClick={() => goto(step - 1)}>
                이전 단계
              </button>
            )}
            {(step < 3 || !initial?.fixed || !saved) && (
              <button
                className="button primary"
                disabled={mismatch || (step === 3 && (!data.canFix || !saved || limitsChanged))}
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
      {step === 3 && !data.canFix && <p>고정은 전용 파일을 만들 수 있는 일반 디스크 원장에서 가능합니다.</p>}
    </Panel>
  );
}

export function TradingSettings() {
  const { state, available, server } = useWorkbench();
  const loc = useLocation(),
    [params] = useSearchParams();
  const [, , , section, stage, ...extra] = loc.pathname.split('/');
  const [data, setData] = useState<TradingSettingsData | null>(null),
    [failed, setFailed] = useState(false);
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
        if (!controller.signal.aborted && seq === loadSequence.current) setData(v);
      })
      .catch(() => {
        if (!controller.signal.aborted && seq === loadSequence.current) {
          setFailed(true);
          setData(null);
        }
      });
    return () => controller.abort();
  }, [server?.instanceId, refreshKey, section]);
  const update = (plan: PlanRecord) => {
    loadSequence.current++;
    setData((old) => old && { ...old, plans: { ...old.plans, [plan.draft.terms.kind]: plan } });
  };
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
    return <Navigate replace to={home + '/' + section + '/1'} />;
  if (data.active)
    return (
      <Panel title="현재 실행 조건">
        <p>전용 실행 원장 · 읽기 전용</p>
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
          <Link className="text-link" to="/risk">
            위험관리로 돌아가기
          </Link>
        )}
        <dl>
          {description(data.active).map(([k, v]) => (
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
        <button className="button secondary" onClick={() => setCopy((v) => !v)}>
          다음 계약으로 복사
        </button>
        {copy && (
          <label className="field">
            일반 앱의 대상 단계에서 가져올 설정
            <textarea readOnly value={JSON.stringify(data.active)} onFocus={(e) => e.target.select()} />
          </label>
        )}
      </Panel>
    );
  if (!section)
    return (
      <div className="plan-menu">
        {(['general', 'once', 'strategy'] as const).map((k, i) => {
          const Icon = [SlidersHorizontal, ClipboardList, Workflow][i];
          const plan = k === 'general' ? null : data.plans[k]?.draft;
          return (
            <Link className="panel plan-link" key={k} to={home + '/' + k}>
              <Icon size={22} />
              <span>
                <strong>{titles[k]}</strong>
                <small>
                  {k === 'general'
                    ? available
                      ? `수동 ${state.paperManualMaxQty ?? 5}주 · 주문당 ${won(state.risk.maxOrder)}원`
                      : '현재 한도 미확인'
                    : `${plan?.fixed ? '고정 완료' : plan ? '저장된 초안' : '초안 없음'} · ${plan?.terms.kind === 'once' ? plan.terms.code + ' · ' + plan.terms.maxQty + '주 · ' + won(plan.terms.maxAmount) + '원' : plan?.terms.kind === 'strategy' ? plan.terms.maxAttempts + '회 · 합산 ' + won(plan.terms.maxTotalAmount) + '원' : '다음 전용 실행에 적용'}`}
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
          <RiskLimitSettings />
          {from === 'paper' && (
            <Link
              className="button secondary"
              state={{ paperReturn: loc.state?.paperKey }}
              to={'/paper?code=' + encodeURIComponent(code)}
            >
              주문 입력으로 돌아가기
            </Link>
          )}
          {from === 'risk' && (
            <Link className="button secondary" to="/risk">
              위험관리로 돌아가기
            </Link>
          )}
        </>
      ) : (
        <Editor
          key={section}
          kind={section as PlanKind}
          step={Number(stage ?? 1)}
          data={data}
          update={update}
          refresh={() => refresh((n) => n + 1)}
        />
      )}
    </div>
  );
}
