import { useId, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { z } from 'zod';
import { useWorkbench } from '../../context';
import {
  costsOf,
  defaultCosts,
  defaultRuleForm,
  formFromRule,
  parseTransferDraft,
  ruleFromExperimentInput,
  type BacktestSelection,
  type CostAssumptions,
  type RuleFormState,
} from '../../pages/research-rule-form';
import { DemoBacktest } from './DemoBacktest';
import { ResearchHelpPanel } from './ResearchHelpPanel';
import { StoredBacktest } from './StoredBacktest';

/** 백테스트 최상위 페이지 (`/backtest`). */
export function Backtest() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const transfer = useRef<{ key: string; selection: BacktestSelection } | null>(null);
  const { busy } = useWorkbench();
  const [helpOpen, setHelpOpen] = useState(false);
  const helpPanelId = useId();
  const helpToggleRef = useRef<HTMLButtonElement>(null);
  const source = params.get('source') ?? 'stored';
  const runId = params.get('run');
  const valid =
    params.getAll('source').length <= 1 &&
    params.getAll('run').length <= 1 &&
    (source === 'stored' || source === 'demo') &&
    (runId === null || (params.get('source') === 'stored' && z.uuid().safeParse(runId).success));
  const locState = location.state as { backtestSelection?: string; strategyDraft?: unknown } | null;
  const strategyDraft = parseTransferDraft(locState?.strategyDraft);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(() =>
    strategyDraft ? formFromRule(strategyDraft.rule, strategyDraft.overlay) : defaultRuleForm(),
  );
  const [costs, setCosts] = useState<CostAssumptions>(defaultCosts);

  function invalidateTransfer() {
    transfer.current = null;
  }

  function handleRuleFormChange(next: RuleFormState) {
    transfer.current = null;
    setRuleForm(next);
  }

  function handleCostsChange(next: CostAssumptions) {
    transfer.current = null;
    setCosts(next);
  }

  function select(nextSource: string, nextRun?: string, selection?: BacktestSelection) {
    if (valid && nextSource === source && nextRun === undefined && !selection) return;
    if (selection && 'saved' in selection) {
      const savedInput = selection.saved.snapshot.input;
      setCosts(costsOf(savedInput));
      setRuleForm(
        formFromRule(ruleFromExperimentInput(savedInput), 'overlay' in savedInput ? savedInput.overlay : undefined),
      );
    }
    const next = new URLSearchParams(params);
    next.set('source', nextSource);
    next.delete('run');
    if (nextRun) next.set('run', nextRun);
    transfer.current = selection ? { key: crypto.randomUUID(), selection } : null;
    const nextState: Record<string, unknown> = { backtestSelection: transfer.current?.key };
    if (strategyDraft) nextState.strategyDraft = strategyDraft;
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
          strategyDraft={strategyDraft}
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
          strategyDraft={strategyDraft}
          ruleForm={ruleForm}
          setRuleForm={handleRuleFormChange}
          costs={costs}
          setCosts={handleCostsChange}
          onInvalidateTransfer={invalidateTransfer}
          select={(id, selection) => select('stored', id, selection)}
        />
      )}
    </div>
  );
}
