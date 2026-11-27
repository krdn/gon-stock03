import { useRef, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, Link2 } from 'lucide-react';
import { codeSchema } from '../../../shared/contracts';
import { masterCodeSchema } from '../../../shared/market-data';
import { useWorkbench } from '../../context';
import { Panel } from '../ui';
import {
  badNumberMessage,
  buildRuleAndOverlay,
  findBadNumberInput,
  isDemoRuleSupported,
  isKisBasicSmaSlowExceeded,
  isKisRealtimeFormSupported,
  isSameRuleForm,
  type RuleFormState,
  type StrategyEditorDraft,
  type StrategyEnvironment,
  type StrategyTransferDraft,
} from '../../pages/research-rule-form';
import { RuleConfigSection } from './RuleConfigSection';

/** 다중 전략 규칙·프리셋·오버레이 작성 및 `/backtest` 초안 전달 에디터. */
export function StrategyEditor({
  environment,
  onSaved,
  draft,
  setDraft,
}: {
  environment: StrategyEnvironment;
  onSaved: (id: string) => void;
  draft: StrategyEditorDraft;
  setDraft: Dispatch<SetStateAction<StrategyEditorDraft>>;
}) {
  const { state, act, busy, available, server, status } = useWorkbench();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const { name, code, ruleForm, evidence, qty, attempted, formError, draftSourceCode } = draft;

  const instruments = server ? state.instruments : [];
  const noSelection = !available
    ? status.phase === 'loading'
      ? '종목 목록 조회 중'
      : '종목 목록 미확인'
    : instruments.length
      ? '종목을 선택하세요'
      : '저장 가능한 종목 없음';
  const validCode = instruments.some(i => i.code === code);
  const invalidPeriods =
    attempted &&
    ruleForm.kind === 'ma_crossover' &&
    ruleForm.fast !== '' &&
    ruleForm.slow !== '' &&
    Number(ruleForm.fast) >= Number(ruleForm.slow);
  const unit = environment === 'kis-paper' ? '이벤트' : '봉';
  const demoUnsupported = environment === 'demo' && !isDemoRuleSupported(ruleForm);
  const kisUnsupported = environment === 'kis-paper' && !isKisRealtimeFormSupported(ruleForm);
  const kisSlowExceeded = environment === 'kis-paper' && isKisBasicSmaSlowExceeded(ruleForm);
  const alphanumericDraftCode = Boolean(draftSourceCode && !codeSchema.safeParse(draftSourceCode).success);

  function focusField(fieldName?: string) {
    if (!fieldName) return;
    formRef.current?.querySelector<HTMLInputElement>(`[name="${fieldName}"]`)?.focus();
  }

  function handleRuleChange(next: RuleFormState) {
    setDraft(prev => {
      if (isSameRuleForm(prev.ruleForm, next)) return prev;
      return { ...prev, ruleForm: next, formError: '', evidence: undefined };
    });
  }

  function handleCodeChange(nextCode: string) {
    setDraft(prev => ({
      ...prev,
      code: nextCode,
      formError: '',
      evidence: prev.evidence && prev.draftSourceCode !== nextCode ? undefined : prev.evidence,
    }));
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDraft(prev => ({ ...prev, attempted: true, formError: '' }));
    if (!name.trim()) {
      setDraft(prev => ({ ...prev, formError: '전략 이름을 입력하세요.' }));
      focusField('name');
      return;
    }
    const badInput = findBadNumberInput(e.currentTarget);
    if (badInput) {
      setDraft(prev => ({ ...prev, formError: badNumberMessage(badInput) }));
      badInput.focus();
      return;
    }
    if (
      ruleForm.kind === 'ma_crossover' &&
      ruleForm.fast !== '' &&
      ruleForm.slow !== '' &&
      Number(ruleForm.fast) >= Number(ruleForm.slow)
    ) {
      focusField('fast');
      return;
    }
    const built = buildRuleAndOverlay(ruleForm);
    if (!built.ok) {
      setDraft(prev => ({ ...prev, formError: built.error }));
      focusField(built.focusName);
      return;
    }
    if (environment === 'demo' && !isDemoRuleSupported(ruleForm)) {
      setDraft(prev => ({
        ...prev,
        formError:
          'DEMO는 종가만 제공합니다. 고저가·거래량이 필요한 규칙이나 샹들리에 청산·변동성 패리티 오버레이는 저장 일봉 백테스트에서 사용하세요.',
      }));
      return;
    }
    const parsedQty = Number(qty);
    if (qty.trim() === '' || !Number.isInteger(parsedQty) || parsedQty < 1 || parsedQty > 10000) {
      setDraft(prev => ({ ...prev, formError: '회당 수량은 1-10000 사이의 정수로 입력하세요.' }));
      focusField('qty');
      return;
    }
    const compatFast = built.rule.kind === 'ma_crossover' ? built.rule.fast : 5;
    const compatSlow = built.rule.kind === 'ma_crossover' ? built.rule.slow : 20;
    const payload: Record<string, unknown> = {
      name,
      code,
      fast: compatFast,
      slow: compatSlow,
      qty: parsedQty,
      environment,
      rule: built.rule,
    };
    if (built.overlay) payload.overlay = built.overlay;
    if (evidence) payload.evidence = evidence;
    try {
      const saved = await act<{ id: string }>('strategies', payload);
      setDraft(prev => ({
        ...prev,
        evidence: undefined,
        draftSourceCode: undefined,
        attempted: false,
        formError: '',
      }));
      onSaved(saved.id);
    } catch {
      /* 워크스페이스 상단 알림이 서버 오류를 표시하고 초안을 유지합니다. */
    }
  }

  function openInBacktest() {
    setDraft(prev => ({ ...prev, attempted: true, formError: '' }));
    const badInput = findBadNumberInput(formRef.current);
    if (badInput) {
      setDraft(prev => ({ ...prev, formError: badNumberMessage(badInput) }));
      badInput.focus();
      return;
    }
    if (
      ruleForm.kind === 'ma_crossover' &&
      ruleForm.fast !== '' &&
      ruleForm.slow !== '' &&
      Number(ruleForm.fast) >= Number(ruleForm.slow)
    ) {
      focusField('fast');
      return;
    }
    const built = buildRuleAndOverlay(ruleForm);
    if (!built.ok) {
      setDraft(prev => ({ ...prev, formError: built.error }));
      focusField(built.focusName);
      return;
    }
    const targetCode = validCode
      ? code
      : masterCodeSchema.safeParse(code).success
        ? code
        : instruments[0]?.code ?? code;
    const strategyDraft: StrategyTransferDraft = {
      code: targetCode,
      rule: built.rule,
      ...(built.overlay ? { overlay: built.overlay } : {}),
      ...(evidence ? { evidence } : {}),
    };
    navigate('/backtest', { state: { strategyDraft } });
  }

  return (
    <Panel className="studio-editor">
      <h2 id="strategy-editor" tabIndex={-1}>
        새 전략 만들기
      </h2>
      <p className="studio-meta">
        {environment === 'kis-paper' ? 'KIS 모의' : 'DEMO'} · 새 전략은 revision 1, 정지 상태로 저장됩니다.
      </p>
      <form ref={formRef} onSubmit={save} noValidate>
        <label className="field">
          전략 이름
          <input
            name="name"
            value={name}
            onChange={e => setDraft(prev => ({ ...prev, name: e.target.value, formError: '' }))}
            required
            maxLength={60}
          />
        </label>
        <label className="field">
          대상 종목
          <select
            required
            disabled={!available || busy}
            value={validCode ? code : ''}
            onChange={e => handleCodeChange(e.target.value)}
          >
            {!validCode && <option value="">{noSelection}</option>}
            {instruments.map(i => (
              <option key={i.code} value={i.code}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        {available && draftSourceCode && !validCode && (
          <p className="studio-warning" role="status">
            {alphanumericDraftCode
              ? `백테스트 종목(${draftSourceCode})은 영숫자 코드로 전략 저장(숫자 6자리 종목) 대상이 아닙니다. 규칙·오버레이 설정은 유지되므로 대상 종목을 선택해 저장하세요.`
              : `백테스트 종목(${draftSourceCode})이 현재 전략 목록에 없어 대상 종목을 다시 선택해야 합니다.`}
          </p>
        )}

        <RuleConfigSection
          form={ruleForm}
          onChange={handleRuleChange}
          disabled={busy}
          mode="strategy"
          unit={unit}
          periodError={invalidPeriods}
          periodErrorId="strategy-period-error"
        />

        {evidence && (
          <div className="studio-evidence" role="status">
            <Link2 size={14} />
            <span>
              <strong>검증 실험 연결</strong> · <code>{evidence.experimentId.slice(0, 8)}</code>
            </span>
            <button
              type="button"
              className="text-link"
              onClick={() => setDraft(prev => ({ ...prev, evidence: undefined }))}
            >
              연결 해제
            </button>
          </div>
        )}

        {demoUnsupported && (
          <p className="studio-warning" role="status">
            DEMO는 종가만 제공합니다. 고저가·거래량이 필요한 규칙이나 샹들리에 청산·변동성 패리티 오버레이는 DEMO에
            저장할 수 없으며, 아래 버튼으로 저장 일봉 백테스트에서 검증할 수 있습니다.
          </p>
        )}
        {kisUnsupported && (
          <p className="studio-warning" role="status">
            신규 다중 전략 규칙과 오버레이(샹들리에 청산·변동성 패리티)는 KIS 모의 저장은 가능하지만, 장중 실시간 평가는
            장전 레벨 트리거 계약 연결 후 활성화됩니다.
          </p>
        )}
        {kisSlowExceeded && (
          <p className="studio-warning" role="status">
            KIS 모의 기본 SMA 계약은 장기 기간 100 이하만 실시간 시작을 지원합니다. 101-120 구간은 정지 상태로 저장하거나
            저장 일봉 백테스트로 검증할 수 있습니다.
          </p>
        )}
        {formError && !invalidPeriods && (
          <p className="studio-warning" role="alert">
            {formError}
          </p>
        )}

        <label className="field">
          회당 수량 (주)
          <input
            name="qty"
            type="number"
            min="1"
            max="10000"
            value={qty}
            onChange={e => setDraft(prev => ({ ...prev, qty: e.target.value, formError: '' }))}
            required
          />
        </label>

        <button disabled={!available || busy || !validCode} className="button primary wide">
          전략 저장
        </button>
        <button type="button" disabled={busy} className="button secondary wide" onClick={openInBacktest}>
          <FlaskConical size={15} />이 설정으로 백테스트
        </button>
      </form>
    </Panel>
  );
}
