import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Plus } from 'lucide-react';
import { z } from 'zod';
import { experimentListSchema, experimentSchema, type Experiment } from '../../../shared/backtest';
import { dailyRunsSchema } from '../../../shared/data-inventory';
import { addDays, marketDate, masterCodeSchema, type DailyRun } from '../../../shared/market-data';
import { won } from '../../../shared/model';
import { PORTFOLIO_CATALOG, isPortfolioRule, portfolioCodes, portfolioWarmup } from '../../../shared/portfolio-rules';
import { STRATEGY_CATALOG, warmup } from '../../../shared/strategy-rules';
import { useWorkbench } from '../../context';
import { Chart, Panel } from '../ui';
import {
  badNumberMessage,
  buildRuleAndOverlay,
  costsOf,
  dateInput,
  findBadNumberInput,
  formatRuleSummary,
  formFromRule,
  isLegacySma,
  isPortfolioKind,
  isSameRuleForm,
  pricePolicy,
  replayResultSchemaFor,
  ruleFromExperimentInput,
  validateCosts,
  type BacktestSelection,
  type CostAssumptions,
  type RuleFormState,
  type StoredBacktestDraft,
  type StrategyTransferDraft,
} from '../../pages/research-rule-form';
import { CostFields, Rebalances, ResultSummary, Trades, useResultFocus } from './BacktestShared';
import { RuleConfigSection } from './RuleConfigSection';

/** 저장 일봉 수집 기록이 백테스트 실행 적격 조건을 충족하는지 판정한다. */
function isEligibleDailyRun(run: DailyRun | undefined): boolean {
  return Boolean(
    run &&
      run.source === 'kis-rest' &&
      run.coverageComplete &&
      run.nextDate === null &&
      run.status.complete &&
      !run.status.error &&
      run.quality.state === 'passed' &&
      Boolean(run.calendar),
  );
}

/** 특정 종목·수정주가 정책의 적격 수집 기록을 `to` 내림차순 → `startedAt` 내림차순으로 정렬 반환한다. */
function eligibleRunsFor(runs: DailyRun[] | null, code: string, adjustment: 'adjusted' | 'raw'): DailyRun[] {
  if (!runs) return [];
  return runs
    .filter(row => row.code === code && row.adjustment === adjustment && isEligibleDailyRun(row))
    .sort((a, b) => b.to.localeCompare(a.to, 'en') || b.startedAt.localeCompare(a.startedAt, 'en'));
}

/** 수집 기록의 실행 가능 최대 종료일(`min(to, captureDate - 1)`)을 반환한다. */
function maxEffectiveTo(run: DailyRun): string {
  const beforeCapture = addDays(run.captureDate, -1);
  return run.to < beforeCapture ? run.to : beforeCapture;
}

/** KIS 저장 일봉 백테스트 패널 (v1 하위 호환 + v2 단일 다중 규칙 + v3 다종목 자산배분). */
export function StoredBacktest({
  requested,
  initial,
  strategyDraft,
  ruleForm,
  setRuleForm,
  costs,
  setCosts,
  storedDraft,
  updateStoredDraft,
  blockedReason,
  onInvalidateTransfer,
  select,
}: {
  requested: string | null;
  initial: BacktestSelection | null;
  strategyDraft: StrategyTransferDraft | null;
  ruleForm: RuleFormState;
  setRuleForm: (next: RuleFormState) => void;
  costs: CostAssumptions;
  setCosts: (next: CostAssumptions) => void;
  storedDraft: StoredBacktestDraft;
  updateStoredDraft: (patch: Partial<StoredBacktestDraft>, options?: { invalidate?: boolean }) => void;
  blockedReason?: string;
  onInvalidateTransfer: () => void;
  select: (id: string, selection: BacktestSelection) => void;
}) {
  const { state, act, available, busy } = useWorkbench();
  const navigate = useNavigate();
  const { singleRunId, singleRunEdited, from, to, dateEdited, portfolioPolicy, portfolioRunOverrides } = storedDraft;
  const rawSaved = initial && 'saved' in initial ? initial.saved : null;
  const savedRunsMatch =
    rawSaved === null ||
    ('runs' in rawSaved.snapshot.input
      ? (portfolioPolicy === null || portfolioPolicy === rawSaved.snapshot.input.adjustment) &&
        rawSaved.snapshot.input.runs.every(
          item => !portfolioRunOverrides[item.code] || portfolioRunOverrides[item.code] === item.runId,
        )
      : requested === null || requested === rawSaved.snapshot.input.runId);
  const savedDatesMatch =
    rawSaved === null ||
    !dateEdited ||
    (!('runs' in rawSaved.snapshot.input) && singleRunId !== rawSaved.snapshot.input.runId) ||
    (from === rawSaved.snapshot.input.from && to === rawSaved.snapshot.input.to);
  const savedMatchesForm =
    rawSaved !== null &&
    savedRunsMatch &&
    savedDatesMatch &&
    costs.capital === rawSaved.snapshot.input.capital &&
    costs.feeBps === rawSaved.snapshot.input.feeBps &&
    costs.slippageBps === rawSaved.snapshot.input.slippageBps &&
    isSameRuleForm(
      ruleForm,
      formFromRule(
        ruleFromExperimentInput(rawSaved.snapshot.input),
        'overlay' in rawSaved.snapshot.input ? rawSaved.snapshot.input.overlay : undefined,
      ),
    );
  const saved = savedMatchesForm ? rawSaved : null;
  const focusTarget = initial && 'focus' in initial ? initial.focus : undefined;
  const input = saved?.snapshot.input;
  const [runs, setRuns] = useState<DailyRun[] | null>(null);
  const [experiments, setExperiments] = useState<z.infer<typeof experimentListSchema>['experiments']>([]);
  const [selected, setSelected] = useState<string | null>(requested);
  const [savedId, setSavedId] = useState(saved?.id ?? '');
  const [experiment, setExperiment] = useState<Experiment | null>(saved);
  const [replay, setReplay] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [listError, setListError] = useState('');
  const [revision, setRevision] = useState(0);
  const [replayError, setReplayError] = useState('');
  const loader = useRef<AbortController | null>(null);
  const resultRef = useResultFocus(experiment);
  const policySelect = useRef<HTMLSelectElement>(null);
  const runSelect = useRef<HTMLSelectElement>(null);
  const focusAfterSelection = useRef(focusTarget);

  useEffect(() => {
    if (!loading && !listError && focusAfterSelection.current) {
      (focusAfterSelection.current === 'policy' ? policySelect : runSelect).current?.focus();
      focusAfterSelection.current = undefined;
    }
  }, [loading, listError]);
  useEffect(() => () => loader.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setListError('');
    setLoadError('');
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
    void (async () => {
      try {
        const [dailyResponse, savedResponse] = await Promise.all([
          fetch('/api/data/daily', { signal }),
          fetch('/api/backtest/experiments', { signal }),
        ]);
        if (!dailyResponse.ok || !savedResponse.ok) throw new Error();
        const daily = dailyRunsSchema.parse(await dailyResponse.json());
        const savedList = experimentListSchema.parse(await savedResponse.json());
        if (controller.signal.aborted) return;
        const restoredSingleRun =
          selected === null && singleRunEdited && singleRunId && !isPortfolioKind(ruleForm.kind)
            ? daily.runs.find(row => row.id === singleRunId && isEligibleDailyRun(row))
            : undefined;
        const preferredRun =
          selected === null && !restoredSingleRun && strategyDraft
            ? (daily.runs.find(row => row.code === strategyDraft.code && isEligibleDailyRun(row)) ??
                daily.runs.find(row => row.code === strategyDraft.code) ??
                daily.runs[0])
            : undefined;
        const id = selected ?? restoredSingleRun?.id ?? preferredRun?.id ?? daily.runs[0]?.id;
        const match = daily.runs.find(row => row.id === id);
        setRuns(daily.runs);
        setExperiments(savedList.experiments);
        setSavedId(previous =>
          savedList.experiments.some(row => row.id === previous)
            ? previous
            : (savedList.experiments.find(row =>
                'runs' in row.input ? row.input.runs.some(item => item.runId === id) : row.input.runId === id,
              ) ??
                (requested === null ? savedList.experiments[0] : undefined))?.id ?? '',
        );
        if (match && (!runs || selected === null)) {
          setSelected(match.id);
          if (!isPortfolioKind(ruleForm.kind)) {
            const keepEditedDates = dateEdited && singleRunId === match.id;
            const isExplicitRun = Boolean(
              requested || restoredSingleRun || (preferredRun && strategyDraft && match.code === strategyDraft.code),
            );
            if (!keepEditedDates) {
              updateStoredDraft(
                {
                  singleRunId: match.id,
                  singleRunEdited: isExplicitRun,
                  from: input?.from ?? match.from,
                  to: input?.to ?? match.to,
                  dateEdited: Boolean(input),
                },
                { invalidate: false },
              );
            }
          }
        }
      } catch {
        if (!controller.signal.aborted) {
          setListError(
            runs === null
              ? '실험 목록 조회 실패 · 저장 일봉과 실험 목록을 확인하지 못했습니다.'
              : '실험 목록 조회 실패 · 이전 목록은 최신 확인값이 아닙니다.',
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [revision]);

  const portfolioMode = isPortfolioKind(ruleForm.kind);
  const run = runs?.find(row => row.id === selected);
  const policy: 'adjusted' | 'raw' = portfolioMode
    ? portfolioPolicy ?? run?.adjustment ?? runs?.[0]?.adjustment ?? 'adjusted'
    : run?.adjustment ?? runs?.[0]?.adjustment ?? 'adjusted';
  const eligible = isEligibleDailyRun(run);
  const locked = busy || pending || loading;

  // 단일 종목 strategyId 비동기 복원 완료 시 일치하는 수집 기록으로 자동 선택 (기본 폴백 daily.runs[0]은 덮어씀)
  const syncedDraftCode = useRef<string | null>(null);
  useEffect(() => {
    if (portfolioMode || !runs || requested !== null || !strategyDraft) return;
    if (singleRunEdited && singleRunId && runs.some(row => row.id === singleRunId && isEligibleDailyRun(row))) return;
    if (syncedDraftCode.current === strategyDraft.code) return;
    syncedDraftCode.current = strategyDraft.code;
    const preferred =
      runs.find(row => row.code === strategyDraft.code && isEligibleDailyRun(row)) ??
      runs.find(row => row.code === strategyDraft.code);
    if (preferred) {
      setSelected(preferred.id);
      updateStoredDraft(
        {
          singleRunId: preferred.id,
          singleRunEdited: true,
          from: preferred.from,
          to: preferred.to,
          dateEdited: false,
        },
        { invalidate: false },
      );
    }
  }, [portfolioMode, runs, requested, strategyDraft, singleRunEdited, singleRunId, updateStoredDraft]);

  const basketEntries = useMemo(() => {
    if (!portfolioMode) return [];
    const entries: { code: string; role: string }[] = [];
    const seen = new Set<string>();
    ruleForm.portfolioAssets.forEach((raw, idx) => {
      const code = raw.trim().toUpperCase();
      if (!code || seen.has(code) || !masterCodeSchema.safeParse(code).success) return;
      seen.add(code);
      entries.push({ code, role: `위험 자산 ${idx + 1}` });
    });
    const safeCode = ruleForm.portfolioSafeAsset.trim().toUpperCase();
    if (safeCode && !seen.has(safeCode) && masterCodeSchema.safeParse(safeCode).success) {
      seen.add(safeCode);
      entries.push({ code: safeCode, role: '안전자산' });
    }
    return entries;
  }, [portfolioMode, ruleForm.portfolioAssets, ruleForm.portfolioSafeAsset]);

  const basketMappings = useMemo(() => {
    return basketEntries.map(entry => {
      const candidates = eligibleRunsFor(runs, entry.code, policy);
      const overrideId = portfolioRunOverrides[entry.code];
      const chosen = candidates.find(item => item.id === overrideId) ?? candidates[0] ?? null;
      return { ...entry, candidates, chosen };
    });
  }, [basketEntries, runs, policy, portfolioRunOverrides]);

  const missingBasketCodes = basketMappings.filter(item => !item.chosen).map(item => item.code);
  const commonRange = useMemo(() => {
    if (!portfolioMode || basketMappings.length < 2 || missingBasketCodes.length > 0) return null;
    let commonFrom = '';
    let commonTo = '';
    for (const item of basketMappings) {
      const chosen = item.chosen!;
      const effTo = maxEffectiveTo(chosen);
      if (!commonFrom || chosen.from > commonFrom) commonFrom = chosen.from;
      if (!commonTo || effTo < commonTo) commonTo = effTo;
    }
    return { from: commonFrom, to: commonTo, valid: commonFrom <= commonTo };
  }, [portfolioMode, basketMappings, missingBasketCodes.length]);

  useEffect(() => {
    if (portfolioMode || !run) return;
    if (dateEdited && singleRunId === run.id) return;
    if (saved && !('runs' in saved.snapshot.input) && saved.snapshot.input.runId === run.id) return;
    if (!dateEdited && from === run.from && to === run.to && singleRunId === run.id) return;
    updateStoredDraft(
      {
        singleRunId: run.id,
        singleRunEdited: singleRunEdited && singleRunId === run.id,
        from: run.from,
        to: run.to,
        dateEdited: false,
      },
      { invalidate: false },
    );
  }, [portfolioMode, dateEdited, run, from, to, singleRunId, singleRunEdited, saved, updateStoredDraft]);

  useEffect(() => {
    if (!portfolioMode || dateEdited || !commonRange || !commonRange.valid) return;
    if (from === commonRange.from && to === commonRange.to) return;
    updateStoredDraft({ from: commonRange.from, to: commonRange.to }, { invalidate: false });
  }, [portfolioMode, dateEdited, commonRange, from, to, updateStoredDraft]);

  const restoredRangeWarning =
    portfolioMode &&
    dateEdited &&
    commonRange?.valid &&
    marketDate.safeParse(from).success &&
    marketDate.safeParse(to).success &&
    (from > to || from < commonRange.from || to > commonRange.to)
      ? `설정한 조회 기간(${dateInput(from)} ~ ${dateInput(to)})이 현재 선택된 바스켓의 공통 가능 기간(${dateInput(commonRange.from)} ~ ${dateInput(commonRange.to)})을 벗어났습니다.`
      : '';

  const codeOptions = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const inst of state.instruments) map.set(inst.code, inst.name);
    for (const row of runs ?? []) {
      if (!map.has(row.code)) map.set(row.code, undefined);
    }
    return [...map.entries()].map(([code, name]) => ({ code, name }));
  }, [state.instruments, runs]);

  const { availableCommonBars, calendarMismatchWarning } = useMemo(() => {
    if (!portfolioMode || basketMappings.length < 2 || missingBasketCodes.length > 0) {
      return { availableCommonBars: null as number | null, calendarMismatchWarning: '' };
    }
    if (!marketDate.safeParse(from).success || !marketDate.safeParse(to).success || from > to) {
      return { availableCommonBars: null as number | null, calendarMismatchWarning: '' };
    }
    const normalize = (value: string) => value.replaceAll('-', '');
    const legDateLists: { code: string; dates: string[] }[] = [];
    for (const item of basketMappings) {
      const dates = item.chosen?.calendar?.dates;
      if (!dates) return { availableCommonBars: null as number | null, calendarMismatchWarning: '' };
      const sortedInRange = dates
        .map(normalize)
        .filter(date => date >= from && date <= to)
        .sort((a, b) => a.localeCompare(b, 'en'));
      legDateLists.push({ code: item.code, dates: sortedInRange });
    }

    const ref = legDateLists[0];
    let mismatchWarning = '';
    for (const row of legDateLists.slice(1)) {
      const maxLen = Math.max(ref.dates.length, row.dates.length);
      for (let i = 0; i < maxLen; i++) {
        if (ref.dates[i] !== row.dates[i]) {
          const mismatchDate = [ref.dates[i], row.dates[i]]
            .filter((value): value is string => Boolean(value))
            .sort((a, b) => a.localeCompare(b, 'en'))[0];
          mismatchWarning = `선택 기간 내 바스켓 종목의 거래일 달력이 일치하지 않습니다 (${ref.code} / ${row.code} · ${mismatchDate}).`;
          break;
        }
      }
      if (mismatchWarning) break;
    }

    const commonDates = new Set(ref.dates);
    for (const row of legDateLists.slice(1)) {
      const rowSet = new Set(row.dates);
      for (const date of commonDates) {
        if (!rowSet.has(date)) commonDates.delete(date);
      }
    }
    return { availableCommonBars: commonDates.size, calendarMismatchWarning: mismatchWarning };
  }, [portfolioMode, basketMappings, missingBasketCodes.length, from, to]);

  const previewRule = buildRuleAndOverlay(ruleForm);
  const requiredBars =
    previewRule.ok && isPortfolioRule(previewRule.rule) ? portfolioWarmup(previewRule.rule) + 1 : null;
  const portfolioBarsShortage =
    portfolioMode && availableCommonBars !== null && requiredBars !== null && availableCommonBars < requiredBars;
  const minBarsHint = previewRule.ok
    ? isPortfolioRule(previewRule.rule)
      ? availableCommonBars !== null && requiredBars !== null
        ? `보유 공통 거래일 ${availableCommonBars}봉 / 현재 규칙 최소 필요 ${requiredBars}봉(판정 ${requiredBars - 1}봉 + 다음 봉 시가 체결 1봉, 바스켓 전 종목 거래일 달력 100% 일치 필요). 실행하면 규칙·비용 가정과 결과를 함께 저장합니다.`
        : `선택 공통 기간에 판정·체결용 최소 ${portfolioWarmup(previewRule.rule) + 1}봉 이상이 필요합니다(바스켓 전 종목 거래일 달력 100% 일치 필요). 실행하면 규칙·비용 가정과 결과를 함께 저장합니다.`
      : !isLegacySma(previewRule.rule, previewRule.overlay)
        ? `선택 기간에 판정·체결용 최소 ${warmup(previewRule.rule, previewRule.overlay) + 1}봉 이상이 필요합니다. 실행하면 규칙·비용 가정과 결과를 함께 저장합니다.`
        : '선택 기간에 장기 기간 + 2봉 이상이 필요합니다. 실행하면 입력·비용 가정과 결과를 함께 저장합니다.'
    : '선택 기간에 규칙별 최소 준비 봉 이상이 필요합니다. 실행하면 입력·비용 가정과 결과를 함께 저장합니다.';

  function chooseRun(id: string | undefined, focus: 'policy' | 'run') {
    if (id && id !== selected) select(id, { focus });
  }
  function clearResult() {
    onInvalidateTransfer();
    setExperiment(null);
    setReplay('');
    setReplayError('');
    setError('');
  }

  async function execute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || listError || !available) return;
    if (blockedReason) {
      clearResult();
      setError(blockedReason);
      return;
    }
    if (!portfolioMode && (!run || !eligible)) return;
    clearResult();
    const fromInput = event.currentTarget.querySelector<HTMLInputElement>('input[name="from"]');
    const toInput = event.currentTarget.querySelector<HTMLInputElement>('input[name="to"]');
    if (fromInput?.validity.badInput || !marketDate.safeParse(from).success) {
      setError('시작일을 올바르게 입력하세요.');
      fromInput?.focus();
      return;
    }
    if (toInput?.validity.badInput || !marketDate.safeParse(to).success) {
      setError('종료일을 올바르게 입력하세요.');
      toInput?.focus();
      return;
    }
    if (from > to) {
      setError('시작일은 종료일보다 늦을 수 없습니다.');
      fromInput?.focus();
      return;
    }
    const badInput = findBadNumberInput(event.currentTarget);
    if (badInput) {
      setError(badNumberMessage(badInput));
      badInput.focus();
      return;
    }
    const built = buildRuleAndOverlay(ruleForm);
    if (!built.ok) {
      setError(built.error);
      if (built.focusName) {
        event.currentTarget.querySelector<HTMLElement>(`[name="${built.focusName}"]`)?.focus();
      }
      return;
    }
    const costError = validateCosts(costs);
    if (costError) {
      setError(costError.message);
      event.currentTarget.querySelector<HTMLInputElement>(`[name="${costError.focusName}"]`)?.focus();
      return;
    }

    if (isPortfolioRule(built.rule)) {
      if (missingBasketCodes.length > 0) {
        setError(`수집 필요 종목(${missingBasketCodes.join(', ')})이 있어 다종목 백테스트를 실행할 수 없습니다.`);
        return;
      }
      if (!commonRange || !commonRange.valid) {
        setError('선택한 바스켓 종목들의 공통 가능 기간이 없어 실행할 수 없습니다.');
        fromInput?.focus();
        return;
      }
      if (from < commonRange.from || from > commonRange.to) {
        setError(`시작일은 공통 가능 기간(${dateInput(commonRange.from)} ~ ${dateInput(commonRange.to)}) 안에서 선택하세요.`);
        fromInput?.focus();
        return;
      }
      if (to < commonRange.from || to > commonRange.to) {
        setError(`종료일은 공통 가능 기간(${dateInput(commonRange.from)} ~ ${dateInput(commonRange.to)}) 안에서 선택하세요.`);
        toInput?.focus();
        return;
      }
      if (calendarMismatchWarning) {
        setError(calendarMismatchWarning);
        return;
      }
      const chosenByCode = new Map(basketMappings.map(item => [item.code, item.chosen!]));
      const portfolioRuns = portfolioCodes(built.rule).map(code => ({
        code,
        runId: chosenByCode.get(code)!.id,
      }));
      try {
        const body = {
          runs: portfolioRuns,
          source: 'kis-rest' as const,
          from,
          to,
          adjustment: policy,
          capital: costs.capital,
          feeBps: costs.feeBps,
          slippageBps: costs.slippageBps,
          rule: built.rule,
        };
        const response = await act<{ experiment: unknown }>('backtest/daily', body);
        const created = experimentSchema.parse(response.experiment);
        setExperiment(created);
        setSavedId(created.id);
        setExperiments(items =>
          items.some(item => item.id === created.id)
            ? items
            : [
                {
                  id: created.id,
                  createdAt: created.createdAt,
                  input: created.snapshot.input,
                  bars:
                    created.snapshot.engineVersion === 'daily-portfolio-next-open-v3'
                      ? (created.snapshot.legs[0]?.bars.length ?? 0)
                      : created.snapshot.bars.length,
                },
                ...items,
              ],
        );
      } catch (err) {
        setError(
          err instanceof z.ZodError
            ? '실험 응답 형식이 올바르지 않습니다.'
            : err instanceof Error
              ? err.message
              : '다종목 실험 실행 실패',
        );
      }
      return;
    }

    if (!run || !eligible) return;
    if (from < run.from || from > run.to) {
      setError(`시작일은 수집 구간(${dateInput(run.from)} ~ ${dateInput(run.to)}) 안에서 선택하세요.`);
      fromInput?.focus();
      return;
    }
    if (to < run.from || to > run.to) {
      setError(`종료일은 수집 구간(${dateInput(run.from)} ~ ${dateInput(run.to)}) 안에서 선택하세요.`);
      toInput?.focus();
      return;
    }
    try {
      const { rule, overlay } = built;
      const body = isLegacySma(rule, overlay)
        ? {
            ...costs,
            fast: rule.fast,
            slow: rule.slow,
            runId: run.id,
            source: run.source,
            code: run.code,
            from,
            to,
            adjustment: policy,
          }
        : {
            ...costs,
            runId: run.id,
            source: run.source,
            code: run.code,
            from,
            to,
            adjustment: policy,
            rule,
            ...(overlay ? { overlay } : {}),
          };
      const response = await act<{ experiment: unknown }>('backtest/daily', body);
      const created = experimentSchema.parse(response.experiment);
      setExperiment(created);
      setSavedId(created.id);
      setExperiments(items =>
        items.some(item => item.id === created.id)
          ? items
          : [
              {
                id: created.id,
                createdAt: created.createdAt,
                input: created.snapshot.input,
                bars:
                  created.snapshot.engineVersion === 'daily-portfolio-next-open-v3'
                    ? (created.snapshot.legs[0]?.bars.length ?? 0)
                    : created.snapshot.bars.length,
              },
              ...items,
            ],
      );
    } catch (err) {
      setError(
        err instanceof z.ZodError
          ? '실험 응답 형식이 올바르지 않습니다.'
          : err instanceof Error
            ? err.message
            : '실험 실행 실패',
      );
    }
  }

  async function load() {
    setPending(true);
    setLoadError('');
    clearResult();
    const controller = new AbortController();
    loader.current = controller;
    try {
      const response = await fetch(`/api/backtest/experiments/${savedId}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) throw new Error();
      const loaded = experimentSchema.parse((await response.json()).experiment);
      if (controller.signal.aborted) return;
      if (loaded.id !== savedId) throw new Error();
      const fixed = loaded.snapshot.input;
      const targetRunId =
        'runs' in fixed
          ? (fixed.runs.find(item => item.code === fixed.rule.assets[0])?.runId ?? fixed.runs[0].runId)
          : fixed.runId;
      if (targetRunId !== selected) {
        select(targetRunId, { saved: loaded });
        return;
      }
      setCosts(costsOf(fixed));
      setRuleForm(formFromRule(ruleFromExperimentInput(fixed), 'overlay' in fixed ? fixed.overlay : undefined));
      updateStoredDraft(
        {
          singleRunId: 'runs' in fixed ? null : fixed.runId,
          singleRunEdited: !('runs' in fixed),
          from: fixed.from,
          to: fixed.to,
          dateEdited: true,
          portfolioPolicy: 'runs' in fixed ? fixed.adjustment : null,
          portfolioRunOverrides:
            'runs' in fixed ? Object.fromEntries(fixed.runs.map(item => [item.code, item.runId])) : {},
        },
        { invalidate: false },
      );
      setExperiment(loaded);
    } catch {
      if (!controller.signal.aborted) setLoadError('저장 실험 조회 실패 · 다시 불러오세요.');
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  async function verify() {
    if (!experiment) return;
    setReplay('');
    setReplayError('');
    try {
      const resultSchema = replayResultSchemaFor(experiment.snapshot.engineVersion);
      const response = z
        .object({ result: resultSchema, matches: z.boolean(), inputHash: z.string() })
        .parse(await act('backtest/replay', { id: experiment.id }));
      if (response.inputHash !== experiment.inputHash) throw new Error('실험 입력이 일치하지 않습니다.');
      if (response.matches) setReplay('재현 일치 · 고정 입력과 저장 결과가 같습니다.');
      else setReplayError('재현 불일치 · 엔진·저장 결과를 점검하세요.');
    } catch (err) {
      setReplayError(
        err instanceof z.ZodError
          ? '재현 응답 형식이 올바르지 않습니다.'
          : err instanceof Error
            ? err.message
            : '재현 결과를 확인하지 못했습니다.',
      );
    }
  }

  function createStrategyFromExperiment() {
    if (!experiment) return;
    const expInput = experiment.snapshot.input;
    const rule = ruleFromExperimentInput(expInput);
    const backtestDraft: StrategyTransferDraft = {
      code: 'runs' in expInput ? expInput.rule.assets[0] : expInput.code,
      rule,
      ...('overlay' in expInput && expInput.overlay ? { overlay: expInput.overlay } : {}),
      evidence: { experimentId: experiment.id, inputHash: experiment.inputHash },
    };
    navigate('/strategies#strategy-editor', { state: { backtestDraft } });
  }

  const portfolioCanExecute =
    !loading &&
    missingBasketCodes.length === 0 &&
    (commonRange === null || commonRange.valid);
  const submitDisabled = !available || (portfolioMode ? !portfolioCanExecute : !eligible);
  const isV3Experiment = experiment?.snapshot.engineVersion === 'daily-portfolio-next-open-v3';

  return (
    <>
      <div className="bt-nav">
        <span>KIS 저장 일봉 · 종가 신호 → 다음 봉 시가 체결 (변동성 돌파: 당일 목표가 매수 · 다종목: 리밸런싱 시가)</span>
        <a className="text-link" href="#backtest-history">
          저장된 실험으로 이동 ↓
        </a>
      </div>
      {loading && <p role="status">저장 일봉·실험 목록 조회 중</p>}
      {listError && (
        <p className="bt-warning" role="alert">
          {listError}{' '}
          <button className="text-link" onClick={() => setRevision(v => v + 1)}>
            다시 조회
          </button>
        </p>
      )}
      <div className="bt-grid">
        <Panel title="저장 일봉 실험 설정">
          {strategyDraft && (
            <p className="bt-draft-banner" role="status">
              전략 스튜디오 초안 적용 · {formatRuleSummary(strategyDraft.rule, strategyDraft.overlay)}
              {!portfolioMode &&
                run &&
                run.code !== strategyDraft.code &&
                ` · 저장 일봉에 ${strategyDraft.code}가 없어 ${run.code} 선택`}
            </p>
          )}
          <form
            onSubmit={execute}
            noValidate
            onChange={event => {
              const control = event.nativeEvent.target;
              if (control !== runSelect.current && control !== policySelect.current) clearResult();
            }}
          >
            <fieldset className="backtest-fields" disabled={locked || !!listError}>
              {!portfolioMode && !loading && !listError && selected && !run && (
                <p className="bt-warning" role="alert">
                  요청한 수집 기록을 찾을 수 없습니다. 데이터 상태를 확인하거나 기록을 직접 선택하세요.
                </p>
              )}
              {!loading && !listError && !runs?.length && <p>저장된 KIS 일봉이 없습니다</p>}
              <div className={portfolioMode ? 'bt-pickers bt-pickers-single' : 'bt-pickers'}>
                <label className="field">
                  수정주가 정책
                  <select
                    ref={policySelect}
                    value={policy}
                    onChange={event => {
                      const nextPolicy = event.target.value as 'adjusted' | 'raw';
                      if (portfolioMode) {
                        updateStoredDraft({
                          portfolioPolicy: nextPolicy,
                          portfolioRunOverrides: {},
                          dateEdited: false,
                        });
                        clearResult();
                      } else if (run?.adjustment !== nextPolicy) {
                        chooseRun(
                          runs?.find(row => row.adjustment === nextPolicy)?.id,
                          'policy',
                        );
                      }
                    }}
                  >
                    <option value="adjusted" disabled={!runs?.some(row => row.adjustment === 'adjusted')}>
                      수정주가 · 수집 시점 기준
                    </option>
                    <option value="raw" disabled={!runs?.some(row => row.adjustment === 'raw')}>
                      원주가 · 기업행사 미반영
                    </option>
                  </select>
                </label>
                {!portfolioMode && (
                  <label className="field">
                    일봉 수집 기록
                    <select
                      ref={runSelect}
                      value={run?.id ?? ''}
                      onChange={event => chooseRun(event.target.value, 'run')}
                    >
                      <option value="" disabled>
                        수집 기록 선택
                      </option>
                      {runs
                        ?.filter(row => row.adjustment === policy)
                        .map(row => (
                          <option key={row.id} value={row.id}>
                            {row.code} · {dateInput(row.from)} ~ {dateInput(row.to)} · {row.id.slice(0, 8)}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
              {!portfolioMode && run && (
                <p className={eligible ? 'bt-note' : 'bt-warning'}>
                  {eligible
                    ? `입력 달력 대조 통과 · 수집 기준일 ${dateInput(run.captureDate)}`
                    : !run.coverageComplete || run.nextDate
                      ? '부분 수집 · 수집 구간이 끝나지 않아 실행할 수 없습니다.'
                      : !run.calendar || run.quality.state === 'unverified'
                        ? '입력 달력 미대조 · 실행할 수 없습니다.'
                        : '수집 상태·품질 확인 필요 · 실행할 수 없습니다.'}
                </p>
              )}
              {portfolioMode && (
                <div className="bt-basket-runs" aria-label="바스켓 종목별 일봉 수집 기록">
                  <strong className="bt-basket-title">바스켓 종목별 일봉 수집 기록</strong>
                  {basketMappings.map(item => (
                    <div key={item.code} className="bt-basket-row">
                      <label className="field">
                        <span>
                          {item.role} · <code>{item.code}</code>
                        </span>
                        {item.candidates.length > 0 ? (
                          <select
                            aria-label={`${item.code} 일봉 수집 기록`}
                            value={item.chosen?.id ?? ''}
                            onChange={event => {
                              updateStoredDraft({
                                portfolioRunOverrides: {
                                  ...portfolioRunOverrides,
                                  [item.code]: event.target.value,
                                },
                              });
                              clearResult();
                            }}
                          >
                            {item.candidates.map(candidate => (
                              <option key={candidate.id} value={candidate.id}>
                                {dateInput(candidate.from)} ~ {dateInput(candidate.to)} · 기준일{' '}
                                {dateInput(candidate.captureDate)} · {candidate.id.slice(0, 8)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="bt-warning" role="status">
                            수집 필요 · {item.code}의 적격 {pricePolicy(policy)} 일봉 기록이 없습니다.
                          </p>
                        )}
                      </label>
                    </div>
                  ))}
                  {missingBasketCodes.length > 0 && (
                    <p className="bt-warning" role="status">
                      수집 필요 종목({missingBasketCodes.join(', ')})이 있어 실행을 차단했습니다.{' '}
                      <Link className="text-link" to="/data#inventory-daily">
                        데이터 상태
                      </Link>
                      에서 일봉을 수집하세요.
                    </p>
                  )}
                  {commonRange && commonRange.valid && (
                    <p className="bt-note">
                      공통 가능 기간: <strong>{dateInput(commonRange.from)}</strong> ~{' '}
                      <strong>{dateInput(commonRange.to)}</strong> (각 종목 수집일 전일까지)
                    </p>
                  )}
                  {commonRange && !commonRange.valid && (
                    <p className="bt-warning" role="status">
                      선택한 종목별 수집 기록에 겹치는 공통 가능 기간이 없습니다. 다른 수집 기록을 선택하세요.
                    </p>
                  )}
                  {restoredRangeWarning && (
                    <p className="bt-warning" role="status">
                      {restoredRangeWarning}
                    </p>
                  )}
                </div>
              )}
              <div className="form-grid">
                <label className="field">
                  시작일
                  <input
                    name="from"
                    type="date"
                    required
                    value={dateInput(from)}
                    min={portfolioMode ? (commonRange?.valid ? dateInput(commonRange.from) : undefined) : run && dateInput(run.from)}
                    max={portfolioMode ? (commonRange?.valid ? dateInput(commonRange.to) : undefined) : run && dateInput(run.to)}
                    onChange={event => {
                      updateStoredDraft({
                        from: event.target.value.replaceAll('-', ''),
                        dateEdited: true,
                        ...(!portfolioMode && run ? { singleRunId: run.id, singleRunEdited: true } : {}),
                      });
                    }}
                  />
                </label>
                <label className="field">
                  종료일
                  <input
                    name="to"
                    type="date"
                    required
                    value={dateInput(to)}
                    min={portfolioMode ? (commonRange?.valid ? dateInput(commonRange.from) : undefined) : run && dateInput(run.from)}
                    max={portfolioMode ? (commonRange?.valid ? dateInput(commonRange.to) : undefined) : run && dateInput(run.to)}
                    onChange={event => {
                      updateStoredDraft({
                        to: event.target.value.replaceAll('-', ''),
                        dateEdited: true,
                        ...(!portfolioMode && run ? { singleRunId: run.id, singleRunEdited: true } : {}),
                      });
                    }}
                  />
                </label>
              </div>
              <RuleConfigSection
                form={ruleForm}
                onChange={next => {
                  setRuleForm(next);
                  clearResult();
                }}
                disabled={locked || !!listError}
                mode="stored"
                unit="봉"
                codeOptions={codeOptions}
              />
              <CostFields values={costs} change={setCosts} />
              <p className="bt-note">{minBarsHint}</p>
              {calendarMismatchWarning && (
                <p className="bt-warning" role="status">
                  {calendarMismatchWarning}
                </p>
              )}
              {portfolioBarsShortage && requiredBars !== null && availableCommonBars !== null && (
                <p className="bt-warning" role="status">
                  준비 봉 부족 · 선택 기간 공통 거래일({availableCommonBars}봉)이 현재 규칙의 최소 필요 봉 수(
                  {requiredBars}봉 = 판정 {requiredBars - 1}봉 + 다음 봉 시가 체결 1봉)보다 부족합니다. 조회 기간을
                  넓히거나 관측·추세 기간을 줄이세요.
                </p>
              )}
              {error && (
                <p className="bt-warning" role="alert">
                  저장 일봉 실험 실패 · {error}
                </p>
              )}
              <button className="button primary wide" disabled={submitDisabled}>
                <Play size={15} />저장 일봉 실험 실행
              </button>
            </fieldset>
          </form>
          <Link className="text-link" to={!portfolioMode && run ? `/data?run=${run.id}#inventory-daily` : '/data#inventory-daily'}>
            데이터 상태 확인 →
          </Link>
        </Panel>
        <div className="bt-output">
          {experiment && (
            <section ref={resultRef} tabIndex={-1} className="bt-result" aria-label="저장 일봉 실험 결과">
              <Panel title="저장 일봉 실험 결과">
                {experiment.snapshot.engineVersion === 'daily-portfolio-next-open-v3' ? (
                  <>
                    <strong>
                      {portfolioCodes(experiment.snapshot.input.rule).join(' / ')} ·{' '}
                      {pricePolicy(experiment.snapshot.input.adjustment)} ·{' '}
                      {experiment.snapshot.legs[0]?.bars.length ?? 0}봉
                    </strong>
                    <p>
                      {dateInput(experiment.snapshot.input.from)} ~ {dateInput(experiment.snapshot.input.to)} · 다종목
                      자산배분 ({experiment.snapshot.legs.length}종목)
                    </p>
                    <p>
                      {formatRuleSummary(experiment.snapshot.input.rule)} · 초기{' '}
                      {won(experiment.snapshot.input.capital)}원 · 수수료 {experiment.snapshot.input.feeBps}bp ·
                      슬리피지 {experiment.snapshot.input.slippageBps}bp
                    </p>
                  </>
                ) : (
                  <>
                    <strong>
                      {experiment.snapshot.input.code} · {pricePolicy(experiment.snapshot.input.adjustment)} ·{' '}
                      {experiment.snapshot.bars.length}봉
                    </strong>
                    <p>
                      {dateInput(experiment.snapshot.input.from)} ~ {dateInput(experiment.snapshot.input.to)} · 수집
                      기준일 {dateInput(experiment.snapshot.collection.captureDate)}
                    </p>
                    <p>
                      {'rule' in experiment.snapshot.input
                        ? formatRuleSummary(experiment.snapshot.input.rule, experiment.snapshot.input.overlay)
                        : `단기 ${experiment.snapshot.input.fast} / 장기 ${experiment.snapshot.input.slow}`}{' '}
                      · 초기 {won(experiment.snapshot.input.capital)}원 · 수수료 {experiment.snapshot.input.feeBps}bp ·
                      슬리피지 {experiment.snapshot.input.slippageBps}bp
                    </p>
                  </>
                )}
                <ResultSummary result={experiment.result} label="저장 구간 수익률" portfolio={isV3Experiment} />
                {(() => {
                  if (
                    !isV3Experiment ||
                    !('runs' in experiment.snapshot.input) ||
                    !('rebalances' in experiment.result) ||
                    experiment.result.rebalances.length === 0 ||
                    experiment.result.trades.length > 0
                  ) {
                    return null;
                  }
                  const safeAssetCode = experiment.snapshot.input.rule.safeAsset;
                  const rebalances = experiment.result.rebalances;
                  const hasRiskTarget = rebalances.some(r =>
                    r.targets.some(t => t.code !== safeAssetCode && t.weight > 0),
                  );
                  const hasAnyPositiveTarget = rebalances.some(r => r.targets.some(t => t.weight > 0));
                  const message =
                    !hasRiskTarget && !hasAnyPositiveTarget
                      ? '준비 봉 충족 · 리밸런싱 판정 완료 (적격 위험 자산 없음으로 현금/안전자산 유지)'
                      : !hasRiskTarget && hasAnyPositiveTarget
                        ? '준비 봉 충족 · 리밸런싱 판정 완료 (적격 위험 자산 없음 · 안전자산 배정 예산이 수수료·슬리피지 포함 1주 시가 미만이어서 체결 0건)'
                        : '준비 봉 충족 · 리밸런싱 판정 완료 (적격 위험 자산이 선정되었으나 배정 예산이 수수료·슬리피지 포함 1주 시가 미만이어서 체결 0건)';
                  return (
                    <p className="bt-note" role="status">
                      {message}
                    </p>
                  );
                })()}
                <div className="button-row bt-actions">
                  <button className="button secondary" disabled={locked || !available} onClick={() => void verify()}>
                    고정 입력으로 재현 검증
                  </button>
                  <button type="button" className="button primary" onClick={createStrategyFromExperiment}>
                    <Plus size={15} />이 설정으로 전략 만들기
                  </button>
                </div>
                {replay && <p role="status">{replay}</p>}
                {replayError && (
                  <p role="alert" className="bt-warning">
                    재현 검증 실패 · {replayError}
                  </p>
                )}
                <details>
                  <summary>재현 입력·출처 확인</summary>
                  <p>
                    실험 입력 SHA256 <code data-testid="experiment-hash">{experiment.inputHash}</code>
                  </p>
                  <p>
                    엔진 {experiment.snapshot.engineVersion} · 저장 {experiment.createdAt}
                  </p>
                  {experiment.snapshot.engineVersion === 'daily-portfolio-next-open-v3' ? (
                    <ul className="bt-leg-list">
                      {experiment.snapshot.legs.map(leg => (
                        <li key={leg.code}>
                          <code>{leg.code}</code> · 수집 ID {leg.collection.id} · 기준일{' '}
                          {dateInput(leg.collection.captureDate)} · 달력 {leg.collection.calendar?.source ?? '미기록'}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <>
                      <p>
                        수집 ID {experiment.snapshot.collection.id} · 출처 {experiment.snapshot.collection.endpoint}
                      </p>
                      <p>
                        입력 달력 {experiment.snapshot.collection.calendar?.source ?? '미기록'} · 공식 출처 진위 미검증
                      </p>
                    </>
                  )}
                  <a
                    className="text-link"
                    href={`/api/backtest/experiments/${experiment.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    고정 입력·결과 JSON 보기 ↗
                  </a>
                </details>
              </Panel>
              <Panel title="자산 곡선">
                <Chart values={experiment.result.equity} height={230} label="저장 일봉 백테스트 평가자산 곡선" />
                <p>{experiment.result.source}</p>
              </Panel>
              {experiment.snapshot.engineVersion === 'daily-portfolio-next-open-v3' &&
                'rebalances' in experiment.result && <Rebalances rebalances={experiment.result.rebalances} />}
              <Trades result={experiment.result} daily />
            </section>
          )}
          <section id="backtest-history" tabIndex={-1}>
            <Panel
              title="저장된 실험"
              action={
                <button className="button secondary" disabled={locked} onClick={() => setRevision(v => v + 1)}>
                  실험 목록 새로고침
                </button>
              }
            >
              {!loading && !listError && experiments.length === 0 ? (
                <p>저장된 실험이 없습니다. 실행에 성공하면 입력과 결과가 함께 보존됩니다.</p>
              ) : (
                <>
                  <label className="field">
                    저장 실험
                    <select
                      value={savedId}
                      disabled={locked || !!listError}
                      onChange={event => {
                        setSavedId(event.target.value);
                        setLoadError('');
                      }}
                    >
                      <option value="">실험 선택</option>
                      {experiments.map(item => (
                        <option key={item.id} value={item.id}>
                          {'runs' in item.input
                            ? `${portfolioCodes(item.input.rule).join('/')} · ${PORTFOLIO_CATALOG[item.input.rule.kind].title}`
                            : `${item.input.code}${'rule' in item.input ? ` · ${STRATEGY_CATALOG[item.input.rule.kind].title}` : ''}`}{' '}
                          · {dateInput(item.input.from)} ~ {dateInput(item.input.to)} ·{' '}
                          {pricePolicy(item.input.adjustment)} · {item.bars}봉 · {item.id.slice(0, 10)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button secondary"
                    disabled={!savedId || locked || !!listError}
                    onClick={() => void load()}
                  >
                    저장 실험 불러오기
                  </button>
                </>
              )}
              {loadError && (
                <p role="alert" className="bt-warning">
                  {loadError}
                </p>
              )}
            </Panel>
          </section>
          <Panel title="계산 가정과 한계">
            <p>
              세금·배당·기업행사를 반영하지 않습니다. ETF 분배금·입력 달력의 공식성·가격 정확성·과거 시점 정보(PIT)·현재
              상장 종목 선택에 따른 생존 편향과 실제 수익성은 미검증입니다.
            </p>
            <details>
              <summary>체결·비용·평가 방식</summary>
              <p>
                종가 신호 후 다음 봉 시가에 전액 매수·전량 매도합니다(윌리엄스 변동성 돌파는 당일 목표가 매수·이후 시가
                청산, 변동성 패리티 사용 시 목표 변동성 비중으로 수량 제한). 다종목 자산배분(v3)은 리밸런싱일 시가
                총평가액 기준으로 목표 정수 수량을 산출해 매도를 선행한 뒤 가용 현금 내 정수 수량만 매수하며 잔여 현금을
                보유합니다. 동일 비중을 유지하는 리밸런싱에서도 슬리피지·수수료를 포함한 목표 수량 재산정으로 소폭 축소
                매도가 발생할 수 있으며, 매수 현금이 부족하면 위험 자산(assets) 입력 순서 뒤쪽 종목의 체결 수량이 줄어들
                수 있습니다. 수수료는 체결금액 × bp / 10,000을 원 단위 올림합니다. 슬리피지는 매수 시 더하고 매도 시
                뺍니다.
              </p>
              <p>
                낙폭은 초기자금을 포함한 최고 평가자산 대비 하락률입니다. 마지막 보유분은 종가로 평가합니다. 원주가
                분할·병합과 수정주가 사후 조정에 유의하세요. 호가단위·유동성·가격제한·미체결은 모델링하지 않습니다.
              </p>
            </details>
          </Panel>
        </div>
      </div>
    </>
  );
}
