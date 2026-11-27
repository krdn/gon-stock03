import { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { z } from 'zod';
import { isPortfolioRule } from '../../../shared/portfolio-rules';
import { useWorkbench } from '../../context';
import {
  costsOf,
  defaultCosts,
  defaultRuleForm,
  defaultStoredBacktestDraft,
  formFromRule,
  formPortfolioCodes,
  isPortfolioKind,
  parseTransferDraft,
  ruleFromExperimentInput,
  type BacktestSelection,
  type CostAssumptions,
  type RuleFormState,
  type StoredBacktestDraft,
  type StrategyTransferDraft,
} from '../../pages/research-rule-form';
import { DemoBacktest } from './DemoBacktest';
import { ResearchHelpPanel } from './ResearchHelpPanel';
import { StoredBacktest } from './StoredBacktest';

/** 두 다종목 바스켓 코드 집합(순서 무관)이 동일한지 비교한다. */
function sameCodeSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every(code => setB.has(code));
}

/** 백테스트 최상위 페이지 (`/backtest`). */
export function Backtest() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const transfer = useRef<{ key: string; selection: BacktestSelection } | null>(null);
  const { state, busy } = useWorkbench();
  const [helpOpen, setHelpOpen] = useState(false);
  const helpPanelId = useId();
  const helpToggleRef = useRef<HTMLButtonElement>(null);
  const source = params.get('source') ?? 'stored';
  const runId = params.get('run');
  const strategyIdParam = params.get('strategyId');
  const valid =
    params.getAll('source').length <= 1 &&
    params.getAll('run').length <= 1 &&
    params.getAll('strategyId').length <= 1 &&
    (source === 'stored' || source === 'demo') &&
    (runId === null || (params.get('source') === 'stored' && z.uuid().safeParse(runId).success));
  const locState = location.state as { backtestSelection?: string; strategyDraft?: unknown } | null;
  const strategyDraft = parseTransferDraft(locState?.strategyDraft);
  const [hydratedDraft, setHydratedDraft] = useState<StrategyTransferDraft | null>(null);
  const hydratedStrategyRef = useRef<string | null>(strategyDraft ? `state:${location.key}` : null);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(() =>
    strategyDraft ? formFromRule(strategyDraft.rule, strategyDraft.overlay) : defaultRuleForm(),
  );
  const [costs, setCosts] = useState<CostAssumptions>(defaultCosts);
  const [storedDraft, setStoredDraft] = useState<StoredBacktestDraft>(defaultStoredBacktestDraft);

  useEffect(() => {
    if (strategyDraft || !strategyIdParam) return;
    if (hydratedStrategyRef.current === strategyIdParam) return;
    const matched = state.strategies.find(item => item.id === strategyIdParam);
    if (!matched) return;
    hydratedStrategyRef.current = strategyIdParam;
    const rule = matched.rule ?? {
      kind: 'ma_crossover' as const,
      maType: 'sma' as const,
      fast: matched.fast,
      slow: matched.slow,
    };
    const nextDraft: StrategyTransferDraft = {
      code: isPortfolioRule(rule) ? rule.assets[0] : matched.code,
      rule,
      ...(!isPortfolioRule(rule) && matched.overlay ? { overlay: matched.overlay } : {}),
      ...(matched.evidence ? { evidence: matched.evidence } : {}),
    };
    transfer.current = null;
    setHydratedDraft(nextDraft);
    setRuleForm(formFromRule(nextDraft.rule, isPortfolioRule(nextDraft.rule) ? undefined : nextDraft.overlay));
    setStoredDraft(defaultStoredBacktestDraft());
  }, [strategyDraft, strategyIdParam, state.strategies]);

  const effectiveDraft = strategyDraft ?? hydratedDraft;

  function invalidateTransfer() {
    transfer.current = null;
  }

  function handleRuleFormChange(next: RuleFormState) {
    transfer.current = null;
    const modeChanged = isPortfolioKind(ruleForm.kind) !== isPortfolioKind(next.kind);
    const basketChanged =
      isPortfolioKind(next.kind) && !sameCodeSet(formPortfolioCodes(ruleForm), formPortfolioCodes(next));
    if (modeChanged || basketChanged) {
      setStoredDraft(prev => ({ ...prev, dateEdited: false }));
    }
    setRuleForm(next);
  }

  function handleCostsChange(next: CostAssumptions) {
    transfer.current = null;
    setCosts(next);
  }

  function updateStoredDraft(patch: Partial<StoredBacktestDraft>, options?: { invalidate?: boolean }) {
    if (options?.invalidate !== false) {
      transfer.current = null;
    }
    setStoredDraft(prev => ({ ...prev, ...patch }));
  }

  function select(nextSource: string, nextRun?: string, selection?: BacktestSelection) {
    if (valid && nextSource === source && nextRun === undefined && !selection) return;
    if (selection && 'saved' in selection) {
      const savedInput = selection.saved.snapshot.input;
      setCosts(costsOf(savedInput));
      setRuleForm(
        formFromRule(ruleFromExperimentInput(savedInput), 'overlay' in savedInput ? savedInput.overlay : undefined),
      );
      setStoredDraft({
        from: savedInput.from,
        to: savedInput.to,
        dateEdited: true,
        portfolioPolicy: 'runs' in savedInput ? savedInput.adjustment : null,
        portfolioRunOverrides:
          'runs' in savedInput ? Object.fromEntries(savedInput.runs.map(item => [item.code, item.runId])) : {},
      });
    } else if (selection && 'focus' in selection) {
      setStoredDraft(prev => ({
        ...prev,
        from: '',
        to: '',
        dateEdited: false,
        portfolioPolicy: null,
      }));
    }
    const next = new URLSearchParams(params);
    next.set('source', nextSource);
    next.delete('run');
    next.delete('strategyId');
    if (nextRun) next.set('run', nextRun);
    transfer.current = selection ? { key: crypto.randomUUID(), selection } : null;
    const nextState: Record<string, unknown> = { backtestSelection: transfer.current?.key };
    if (effectiveDraft) nextState.strategyDraft = effectiveDraft;
    setParams(next, { state: nextState });
  }

  function closeHelp() {
    setHelpOpen(false);
    helpToggleRef.current?.focus();
  }

  const initial =
    transfer.current && transfer.current.key === locState?.backtestSelection ? transfer.current.selection : null;

  return (
    <div className="bt-page">
      <div className="bt-toolbar">
        <label className="field bt-source">
          데이터 출처
          <select disabled={busy} value={valid ? source : ''} onChange={event => select(event.target.value)}>
            {!valid && (
              <option value="" disabled>
                출처를 다시 선택하세요
              </option>
            )}
            <option value="stored">KIS 저장 일봉 · 과거 구간 실험</option>
            <option value="demo">DEMO 합성 · 기능 검증</option>
          </select>
        </label>
        <button
          ref={helpToggleRef}
          type="button"
          className={'button ' + (helpOpen ? 'primary' : 'secondary')}
          aria-expanded={helpOpen}
          aria-controls={helpOpen ? helpPanelId : undefined}
          onClick={() => setHelpOpen(open => !open)}
        >
          <BookOpen size={15} aria-hidden="true" />
          사용방법 도움말
        </button>
      </div>
      {helpOpen && <ResearchHelpPanel panelId={helpPanelId} onClose={closeHelp} />}
      {!valid ? (
        <p className="bt-warning" role="alert">
          백테스트 주소의 출처 또는 수집 ID가 올바르지 않습니다. 데이터 출처를 직접 선택하세요.
        </p>
      ) : source === 'demo' ? (
        <DemoBacktest
          strategyDraft={effectiveDraft}
          ruleForm={ruleForm}
          setRuleForm={handleRuleFormChange}
          costs={costs}
          setCosts={handleCostsChange}
        />
      ) : (
        <StoredBacktest
          key={runId ?? 'default'}
          requested={runId}
          initial={initial}
          strategyDraft={effectiveDraft}
          ruleForm={ruleForm}
          setRuleForm={handleRuleFormChange}
          costs={costs}
          setCosts={handleCostsChange}
          storedDraft={storedDraft}
          updateStoredDraft={updateStoredDraft}
          onInvalidateTransfer={invalidateTransfer}
          select={(id, selection) => select('stored', id, selection)}
        />
      )}
    </div>
  );
}
