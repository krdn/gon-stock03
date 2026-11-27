import { useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, Plus } from 'lucide-react';
import { useWorkbench } from '../../context';
import {
  defaultEditorDraft,
  editorDraftFromTransfer,
  evaluationLabels,
  evaluationTime,
  parseTransferDraft,
  signalLabels,
  type StrategyEditorDraft,
  type StrategyEnvironment,
} from '../../pages/research-rule-form';
import { ResearchHelpPanel } from './ResearchHelpPanel';
import { StrategyCard } from './StrategyCard';
import { StrategyEditor } from './StrategyEditor';

/** 전략 스튜디오 최상위 페이지 (`/strategies`). */
export function Strategies() {
  const [params, setParams] = useSearchParams();
  const { busy, available } = useWorkbench();
  const environment = params.get('environment') === 'kis-paper' ? 'kis-paper' : 'demo';
  const location = useLocation();
  const routerDraft = parseTransferDraft((location.state as { backtestDraft?: unknown } | null)?.backtestDraft);
  const [editorDraft, setEditorDraft] = useState<StrategyEditorDraft>(() =>
    routerDraft ? editorDraftFromTransfer(routerDraft) : defaultEditorDraft(),
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const helpPanelId = useId();
  const helpToggleRef = useRef<HTMLButtonElement>(null);
  const consumedDraftKey = useRef(routerDraft ? location.key : '');

  useEffect(() => {
    if (!routerDraft || consumedDraftKey.current === location.key) return;
    consumedDraftKey.current = location.key;
    setEditorDraft(editorDraftFromTransfer(routerDraft));
  }, [routerDraft, location.key]);

  function closeHelp() {
    setHelpOpen(false);
    helpToggleRef.current?.focus();
  }

  return (
    <section className="strategy-studio" aria-label="전략 작업">
      <div className="studio-tools">
        <label className="field">
          전략 환경
          <select
            value={environment}
            disabled={!available || busy}
            onChange={e => {
              const next = new URLSearchParams(params);
              next.set('environment', e.target.value);
              setEditorDraft(prev => ({ ...prev, attempted: false, formError: '' }));
              setParams(next);
            }}
          >
            <option value="demo">DEMO 합성 봉</option>
            <option value="kis-paper">KIS 모의 체결가 이벤트</option>
          </select>
        </label>
        <div className="studio-tools-actions">
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
          <Link className="button secondary" to={{ search: location.search, hash: '#strategy-editor' }}>
            <Plus size={15} />새 전략 만들기
          </Link>
        </div>
      </div>
      {helpOpen && <ResearchHelpPanel panelId={helpPanelId} onClose={closeHelp} />}
      <StrategyStudio
        key={environment}
        environment={environment}
        editorDraft={editorDraft}
        setEditorDraft={setEditorDraft}
      />
    </section>
  );
}

/** 환경별 저장 전략 목록·최근 평가·DEMO 재생과 전략 에디터를 조합하는 스튜디오 본문. */
export function StrategyStudio({
  environment,
  editorDraft,
  setEditorDraft,
}: {
  environment: StrategyEnvironment;
  editorDraft: StrategyEditorDraft;
  setEditorDraft: Dispatch<SetStateAction<StrategyEditorDraft>>;
}) {
  const kis = environment === 'kis-paper';
  const { state, act, busy, available, server, status } = useWorkbench();
  const { search, hash, key } = useLocation();
  const navigate = useNavigate();
  const strategies = server ? state.strategies.filter(s => (s.environment ?? 'demo') === environment) : [];
  const latest = strategies
    .filter(s => s.evaluations?.length)
    .sort((a, b) => Date.parse(b.evaluations![0].at) - Date.parse(a.evaluations![0].at))[0];
  const evaluation = latest?.evaluations?.[0];
  const [savedId, setSavedId] = useState('');
  useEffect(() => {
    if (savedId) {
      setSavedId('');
      navigate({ search, hash: '#strategy-' + savedId }, { replace: true });
    }
  }, [savedId, navigate, search]);
  const loading = status.phase === 'loading';
  const rechecking = loading && Boolean(server);
  let emptyList = '새 규칙을 저장하면 여기에 표시합니다.';
  let evaluationNotice = '';
  let replayStatus = `합성 봉 #${state.tick} · ${state.playing ? '3초마다 자동 평가 중' : state.risk.halted ? '긴급정지로 재생 시작 차단' : '재생 정지'}`;
  if (!available) {
    if (loading) emptyList = rechecking ? '저장 전략 재확인 중 · 마지막 조회는 0건입니다.' : '저장 전략을 불러오는 중입니다.';
    else emptyList = server ? '마지막 조회는 0건입니다. 최신 목록은 미확인입니다.' : '로컬 조회 실패 · 저장 전략 미확인';
    if (server) {
      const previous = evaluation ? '마지막 조회 기록' : '마지막 조회에서 평가 기록 없음';
      evaluationNotice = (rechecking ? '최신 평가 재확인 중' : '최신 평가 미확인') + ' · ' + previous;
    } else {
      evaluationNotice = loading ? '저장된 평가 불러오는 중' : '로컬 조회 실패 · 평가 미확인';
    }
    replayStatus = rechecking ? '재생 상태 재확인 중' : loading ? '재생 상태 조회 중' : '재생 상태 미확인';
  }
  const targetId = hash.slice(1);
  const targetExists =
    targetId === 'strategy-editor' ||
    (kis && targetId === 'strategy-evaluations') ||
    strategies.some(s => targetId === 'strategy-' + s.id);
  useEffect(() => {
    if (!targetExists) return;
    const target = document.getElementById(targetId);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start' });
  }, [targetId, targetExists, key]);
  return (
    <div className="studio-grid">
      <div className="studio-results">
        {kis ? (
          <section className="panel studio-recent" aria-labelledby="strategy-evaluations">
            <h2 id="strategy-evaluations" tabIndex={-1}>
              최근 KIS 평가
            </h2>
            {evaluationNotice && <p className={loading ? 'studio-meta' : 'studio-warning'}>{evaluationNotice}</p>}
            {latest && evaluation ? (
              <>
                <div className="studio-result-line">
                  <span className={'studio-outcome ' + evaluation.status}>{evaluationLabels[evaluation.status]}</span>
                  <strong>{evaluation.reason}</strong>
                </div>
                <p className="studio-meta">
                  {latest.name} · revision {evaluation.revision} · {signalLabels[evaluation.signal]}
                </p>
                <p className="studio-meta">
                  <time dateTime={evaluation.at}>{evaluationTime.format(new Date(evaluation.at))} KST</time> · 로컬 저장 기록
                </p>
                <Link className="text-link" to={{ search, hash: '#strategy-' + latest.id }}>
                  해당 전략 보기
                </Link>
              </>
            ) : (
              available && (
                <p>
                  {strategies.length
                    ? '평가 기록 없음 · 시작 후 새 체결가 이벤트가 필요합니다.'
                    : '저장된 KIS 전략이 없습니다.'}
                </p>
              )
            )}
          </section>
        ) : (
          <div className="studio-replay">
            <div>
              <strong>DEMO 봉 재생</strong>
              <p className="studio-meta">{replayStatus}</p>
            </div>
            <button
              className="button secondary"
              disabled={busy || !available || (!state.playing && state.risk.halted)}
              onClick={() => void act('playback').catch(() => {})}
            >
              {!available ? '자동 재생 제어' : state.playing ? '자동 재생 정지' : '자동 재생 시작'}
            </button>
          </div>
        )}
        <div className="studio-list-title">
          <h2>저장 전략</h2>
          <span className="studio-meta">
            {server ? `${strategies.length}개${available ? '' : ' · 이전 조회'}` : loading ? '조회 중' : '미확인'}
          </span>
        </div>
        {!strategies.length && <p className="studio-meta">{emptyList}</p>}
        {strategies.map(strategy => (
          <StrategyCard key={strategy.id} strategy={strategy} kis={kis} />
        ))}
        <details className="panel studio-rules">
          <summary>실행 규칙</summary>
          {kis ? (
            <>
              <p>
                검증된 KRX 체결가 이벤트의 이동평균 교차를 평가합니다. 분봉·일봉 계산과 단위가 다릅니다. 표본 부족과
                교차 없음도 기록합니다.
              </p>
              <p>
                계좌 보유 매도가 계약에서 허용되면 수동 보유분도 매도 가능 수량에 포함됩니다. 공통 금액·종목·손실 한도와
                승인 검사를 거치며, 거절된 주문의 예약 횟수와 금액도 사용량에 남습니다. 응답 불명은 재전송하지 말고
                원장을 대조하세요.
              </p>
              <p>
                정지·재시작·연결 중단 후에는 직접 다시 시작해야 합니다. 시작 전에 받은 이벤트는 다시 실행하지 않습니다.
              </p>
            </>
          ) : (
            <p>
              이동평균의 상향 교차는 매수, 하향 교차는 보유 범위의 매도입니다. 수동 매수 보유분도 포함합니다. 같은 봉을
              두 번 평가하지 않습니다. 신규 주문은 다음 봉에서 체결 여부를 판단하며 미체결분은 그 봉에서 만료됩니다.
              서버 재시작 시 전략은 정지합니다.
            </p>
          )}
        </details>
      </div>
      <StrategyEditor
        environment={environment}
        onSaved={setSavedId}
        draft={editorDraft}
        setDraft={setEditorDraft}
      />
    </div>
  );
}
