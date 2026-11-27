import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Plus } from 'lucide-react';
import { z } from 'zod';
import { won } from '../../../shared/model';
import { dailyRunsSchema } from '../../../shared/data-inventory';
import { marketDate, type DailyRun } from '../../../shared/market-data';
import { experimentListSchema, experimentSchema, type Experiment } from '../../../shared/backtest';
import { STRATEGY_CATALOG, warmup } from '../../../shared/strategy-rules';
import { useWorkbench } from '../../context';
import { Chart, Panel } from '../ui';
import {
  badNumberMessage,
  buildRuleAndOverlay,
  costsOf,
  dateInput,
  findBadNumberInput,
  flexibleResultSchema,
  formatRuleSummary,
  formFromRule,
  isLegacySma,
  isSameRuleForm,
  pricePolicy,
  ruleFromExperimentInput,
  validateCosts,
  type BacktestSelection,
  type CostAssumptions,
  type RuleFormState,
  type StrategyTransferDraft,
} from '../../pages/research-rule-form';
import { CostFields, ResultSummary, Trades, useResultFocus } from './BacktestShared';
import { RuleConfigSection } from './RuleConfigSection';

/** KIS 저장 일봉 백테스트 패널 (v1 하위 호환 + v2 다중 규칙·벤치마크·전략 연결). */
export function StoredBacktest({
  requested,
  initial,
  strategyDraft,
  ruleForm,
  setRuleForm,
  costs,
  setCosts,
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
  onInvalidateTransfer: () => void;
  select: (id: string, selection: BacktestSelection) => void;
}) {
  const { act, available, busy } = useWorkbench();
  const navigate = useNavigate();
  const rawSaved = initial && 'saved' in initial ? initial.saved : null;
  const savedMatchesForm =
    rawSaved !== null &&
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
  const [from, setFrom] = useState(input?.from ?? '');
  const [to, setTo] = useState(input?.to ?? '');
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
        const preferredRun =
          selected === null && strategyDraft
            ? daily.runs.find(row => row.code === strategyDraft.code) ?? daily.runs[0]
            : undefined;
        const id = selected ?? preferredRun?.id ?? daily.runs[0]?.id;
        const match = daily.runs.find(row => row.id === id);
        setRuns(daily.runs);
        setExperiments(savedList.experiments);
        setSavedId(previous =>
          savedList.experiments.some(row => row.id === previous)
            ? previous
            : (savedList.experiments.find(row => row.input.runId === id) ??
                (requested === null ? savedList.experiments[0] : undefined))?.id ?? '',
        );
        if (match && (!runs || selected === null)) {
          setSelected(match.id);
          setFrom(input?.from ?? match.from);
          setTo(input?.to ?? match.to);
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

  const run = runs?.find(row => row.id === selected);
  const policy = run?.adjustment ?? runs?.[0]?.adjustment ?? 'adjusted';
  const eligible =
    run?.coverageComplete &&
    run.nextDate === null &&
    run.status.complete &&
    !run.status.error &&
    run.quality.state === 'passed' &&
    !!run.calendar;
  const locked = busy || pending || loading;

  const previewRule = buildRuleAndOverlay(ruleForm);
  const minBarsHint =
    previewRule.ok && !isLegacySma(previewRule.rule, previewRule.overlay)
      ? `선택 기간에 판정·체결용 최소 ${warmup(previewRule.rule, previewRule.overlay) + 1}봉 이상이 필요합니다. 실행하면 규칙·비용 가정과 결과를 함께 저장합니다.`
      : '선택 기간에 장기 기간 + 2봉 이상이 필요합니다. 실행하면 입력·비용 가정과 결과를 함께 저장합니다.';

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
    if (!run || !eligible || locked || listError || !available) return;
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
        event.currentTarget.querySelector<HTMLInputElement>(`[name="${built.focusName}"]`)?.focus();
      }
      return;
    }
    const costError = validateCosts(costs);
    if (costError) {
      setError(costError.message);
      event.currentTarget.querySelector<HTMLInputElement>(`[name="${costError.focusName}"]`)?.focus();
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
                bars: created.snapshot.bars.length,
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
      if (fixed.runId !== selected) {
        select(fixed.runId, { saved: loaded });
        return;
      }
      setFrom(fixed.from);
      setTo(fixed.to);
      setCosts(costsOf(fixed));
      setRuleForm(formFromRule(ruleFromExperimentInput(fixed), 'overlay' in fixed ? fixed.overlay : undefined));
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
      const response = z
        .object({ result: flexibleResultSchema, matches: z.boolean(), inputHash: z.string() })
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
    const backtestDraft: StrategyTransferDraft = {
      code: expInput.code,
      rule: ruleFromExperimentInput(expInput),
      ...('overlay' in expInput && expInput.overlay ? { overlay: expInput.overlay } : {}),
      evidence: { experimentId: experiment.id, inputHash: experiment.inputHash },
    };
    navigate('/strategies#strategy-editor', { state: { backtestDraft } });
  }

  return (
    <>
      <div className="bt-nav">
        <span>KIS 저장 일봉 · 종가 신호 → 다음 봉 시가 체결</span>
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
              {run && run.code !== strategyDraft.code && ` · 저장 일봉에 ${strategyDraft.code}가 없어 ${run.code} 선택`}
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
              {!loading && !listError && selected && !run && (
                <p className="bt-warning" role="alert">
                  요청한 수집 기록을 찾을 수 없습니다. 데이터 상태를 확인하거나 기록을 직접 선택하세요.
                </p>
              )}
              {!loading && !listError && !runs?.length && <p>저장된 KIS 일봉이 없습니다</p>}
              <div className="bt-pickers">
                <label className="field">
                  수정주가 정책
                  <select
                    ref={policySelect}
                    value={policy}
                    onChange={event => {
                      if (run?.adjustment !== event.target.value) {
                        chooseRun(
                          runs?.find(row => row.adjustment === event.target.value)?.id,
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
              </div>
              {run && (
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
              <div className="form-grid">
                <label className="field">
                  시작일
                  <input
                    name="from"
                    type="date"
                    required
                    value={dateInput(from)}
                    min={run && dateInput(run.from)}
                    max={run && dateInput(run.to)}
                    onChange={event => setFrom(event.target.value.replaceAll('-', ''))}
                  />
                </label>
                <label className="field">
                  종료일
                  <input
                    name="to"
                    type="date"
                    required
                    value={dateInput(to)}
                    min={run && dateInput(run.from)}
                    max={run && dateInput(run.to)}
                    onChange={event => setTo(event.target.value.replaceAll('-', ''))}
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
              />
              <CostFields values={costs} change={setCosts} />
              <p className="bt-note">{minBarsHint}</p>
              {error && (
                <p className="bt-warning" role="alert">
                  저장 일봉 실험 실패 · {error}
                </p>
              )}
              <button className="button primary wide" disabled={!available || !eligible}>
                <Play size={15} />저장 일봉 실험 실행
              </button>
            </fieldset>
          </form>
          <Link className="text-link" to={run ? `/data?run=${run.id}#inventory-daily` : '/data#inventory-daily'}>
            데이터 상태 확인 →
          </Link>
        </Panel>
        <div className="bt-output">
          {experiment && (
            <section ref={resultRef} tabIndex={-1} className="bt-result" aria-label="저장 일봉 실험 결과">
              <Panel title="저장 일봉 실험 결과">
                <strong>
                  {experiment.snapshot.input.code} · {pricePolicy(experiment.snapshot.input.adjustment)} ·{' '}
                  {experiment.snapshot.bars.length}봉
                </strong>
                <p>
                  {dateInput(experiment.snapshot.input.from)} ~ {dateInput(experiment.snapshot.input.to)} · 수집 기준일{' '}
                  {dateInput(experiment.snapshot.collection.captureDate)}
                </p>
                <p>
                  {'rule' in experiment.snapshot.input
                    ? formatRuleSummary(experiment.snapshot.input.rule, experiment.snapshot.input.overlay)
                    : `단기 ${experiment.snapshot.input.fast} / 장기 ${experiment.snapshot.input.slow}`}{' '}
                  · 초기 {won(experiment.snapshot.input.capital)}원 · 수수료 {experiment.snapshot.input.feeBps}bp ·
                  슬리피지 {experiment.snapshot.input.slippageBps}bp
                </p>
                <ResultSummary result={experiment.result} label="저장 구간 수익률" />
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
                  <p>
                    수집 ID {experiment.snapshot.collection.id} · 출처 {experiment.snapshot.collection.endpoint}
                  </p>
                  <p>입력 달력 {experiment.snapshot.collection.calendar?.source ?? '미기록'} · 공식 출처 진위 미검증</p>
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
                          {item.input.code}
                          {'rule' in item.input ? ` · ${STRATEGY_CATALOG[item.input.rule.kind].title}` : ''} ·{' '}
                          {dateInput(item.input.from)} ~ {dateInput(item.input.to)} ·{' '}
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
              세금·배당·기업행사를 반영하지 않습니다. 입력 달력의 공식성·가격 정확성·과거 시점 정보(PIT)와 실제 수익성은
              미검증입니다.
            </p>
            <details>
              <summary>체결·비용·평가 방식</summary>
              <p>
                종가 신호 후 다음 봉 시가에 전액 매수·전량 매도합니다. 수수료는 체결금액 × bp / 10,000을 원 단위
                올림합니다. 슬리피지는 매수 시 더하고 매도 시 뺍니다.
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
