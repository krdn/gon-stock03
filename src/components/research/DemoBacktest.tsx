import { useState, type FormEvent } from 'react';
import { Play } from 'lucide-react';
import { z } from 'zod';
import { won } from '../../../shared/model';
import { isPortfolioRule } from '../../../shared/portfolio-rules';
import { useWorkbench } from '../../context';
import { Chart, Panel } from '../ui';
import {
  badNumberMessage,
  buildRuleAndOverlay,
  demoFormBlockReason,
  findBadNumberInput,
  flexibleResultSchema,
  formatRuleSummary,
  isDemoRuleSupported,
  isLegacySma,
  isPortfolioKind,
  validateCosts,
  type CostAssumptions,
  type FlexibleBacktestResult,
  type RuleFormState,
  type StrategyTransferDraft,
} from '../../pages/research-rule-form';
import { CostFields, ResultSummary, Trades, useResultFocus } from './BacktestShared';
import { RuleConfigSection } from './RuleConfigSection';

/** DEMO 합성 봉 백테스트 패널 (v1 SMA 및 v2 종가 기반 다중 규칙 지원, 다종목은 차단). */
export function DemoBacktest({
  strategyDraft,
  ruleForm,
  setRuleForm,
  costs,
  setCosts,
}: {
  strategyDraft: StrategyTransferDraft | null;
  ruleForm: RuleFormState;
  setRuleForm: (next: RuleFormState) => void;
  costs: CostAssumptions;
  setCosts: (next: CostAssumptions) => void;
}) {
  const { state, act, available, busy } = useWorkbench();
  const [selection, setSelection] = useState<string | null>(() => strategyDraft?.code ?? null);
  const [calculation, setCalculation] = useState<{
    code: string;
    summary: string;
    result: FlexibleBacktestResult;
  } | null>(null);
  const [error, setError] = useState('');
  const portfolioMode = isPortfolioKind(ruleForm.kind);
  const instrument =
    selection === null
      ? state.instruments.find(row => row.code === '069500') ?? state.instruments[0]
      : state.instruments.find(row => row.code === selection);
  const code = instrument?.code ?? '';
  const result = calculation?.code === code ? calculation : null;
  const resultRef = useResultFocus(result);
  const demoUnsupported = !isDemoRuleSupported(ruleForm);

  function clearCalc() {
    setCalculation(null);
    setError('');
  }

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearCalc();
    if ((!portfolioMode && !code) || busy || !available) return;
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
    if (!isDemoRuleSupported(ruleForm) || isPortfolioRule(built.rule)) {
      setError(demoFormBlockReason(ruleForm));
      return;
    }
    try {
      const { rule, overlay } = built;
      const legacy = isLegacySma(rule, overlay);
      const body = legacy
        ? { code, fast: rule.fast, slow: rule.slow, ...costs }
        : { code, ...costs, rule, ...(overlay ? { overlay } : {}) };
      const response = await act<{ result: unknown }>('backtest', body);
      const parsed = flexibleResultSchema.parse(response.result);
      const summary = legacy
        ? `단기 ${rule.fast} / 장기 ${rule.slow} · 초기 ${won(costs.capital)}원 · 수수료 ${costs.feeBps}bp · 슬리피지 ${costs.slippageBps}bp`
        : `${formatRuleSummary(rule, overlay)} · 초기 ${won(costs.capital)}원 · 수수료 ${costs.feeBps}bp · 슬리피지 ${costs.slippageBps}bp`;
      setCalculation({ code, summary, result: parsed });
    } catch (err) {
      setError(
        err instanceof z.ZodError
          ? '실험 응답 형식이 올바르지 않습니다.'
          : err instanceof Error
            ? err.message
            : '합성 실험 계산 실패',
      );
    }
  }

  return (
    <div className="bt-grid">
      <Panel title="합성 실험 설정">
        <p className="bt-note">
          현재 저장된 합성 봉으로 계산하는 기능 검증입니다. 다음 봉 종가에 체결한다고 가정합니다. 실제 과거 성과는
          미측정입니다.
        </p>
        {strategyDraft && (
          <p className="bt-draft-banner" role="status">
            전략 스튜디오 초안 적용 · {formatRuleSummary(strategyDraft.rule, strategyDraft.overlay)}
          </p>
        )}
        <form onSubmit={run} onChange={clearCalc} noValidate>
          <fieldset className="backtest-fields" disabled={busy}>
            {!portfolioMode && (
              <>
                <label className="field">
                  대상
                  <select value={code} onChange={event => setSelection(event.target.value)}>
                    {!code && (
                      <option value="" disabled>
                        {state.instruments.length ? '종목을 다시 선택하세요' : '합성 종목 없음'}
                      </option>
                    )}
                    {state.instruments.map(item => (
                      <option value={item.code} key={item.code}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                {!code && (
                  <p role="status">
                    {state.instruments.length
                      ? '선택한 합성 종목을 찾을 수 없습니다. 대상을 다시 선택하세요.'
                      : '계산할 합성 종목이 없습니다.'}
                  </p>
                )}
              </>
            )}
            <RuleConfigSection
              form={ruleForm}
              onChange={next => {
                setRuleForm(next);
                clearCalc();
              }}
              disabled={busy}
              mode="demo"
              unit="봉"
              codeOptions={state.instruments.map(i => ({ code: i.code, name: i.name }))}
            />
            <CostFields values={costs} change={setCosts} />
            {demoUnsupported && (
              <p className="bt-warning" role="status">
                {demoFormBlockReason(ruleForm)}
              </p>
            )}
            <p className="bt-note">비용은 검증용 가정이며 세금은 포함하지 않습니다. 결과는 이 화면에서 확인합니다.</p>
            {error && (
              <p role="alert" className="bt-warning">
                합성 실험 입력·계산 확인 · {error}
              </p>
            )}
            <button className="button primary wide" disabled={!available || (!portfolioMode && !code)}>
              <Play size={15} />백테스트 실행
            </button>
          </fieldset>
        </form>
      </Panel>
      {result && (
        <section aria-label="합성 실험 결과" ref={resultRef} tabIndex={-1} className="bt-result">
          <Panel title="합성 실험 결과">
            <strong>
              {code} · {result.result.source}
            </strong>
            <p>{result.summary}</p>
            <ResultSummary result={result.result} label="합성 구간 수익률" />
          </Panel>
          <Panel title="자산 곡선">
            <Chart values={result.result.equity} height={230} label="합성 데이터 백테스트 평가자산 곡선" />
            <p className="bt-note">마지막 보유분은 평가하며 강제 청산하지 않습니다.</p>
          </Panel>
          <Trades result={result.result} />
        </section>
      )}
    </div>
  );
}
