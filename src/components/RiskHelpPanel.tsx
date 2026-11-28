import { useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

/** 위험관리 사용방법 도움말 탭 식별자. */
export type RiskHelpTabId = 'workflow' | 'limits-math' | 'halt-recovery' | 'faq';

/** 4탭 WAI-ARIA 위험관리 도움말 탭 목록. */
export const RISK_HELP_TABS: { id: RiskHelpTabId; label: string }[] = [
  { id: 'workflow', label: '처음부터 따라하기' },
  { id: 'limits-math', label: '3대 한도·손실·노출 산식 사전' },
  { id: 'halt-recovery', label: '긴급정지·재개 조건·차단 게이트 사전' },
  { id: 'faq', label: '환경별 차이·전략 연동·FAQ' },
];

/**
 * `/risk` 상단에서 열고 닫는 4탭 WAI-ARIA 대화형 위험관리 도움말 패널.
 * DEMO·KIS 모의 공통 3대 한도, 손실·노출 산식, 긴급정지·재개 조건 및 무결성 게이트를 안내한다.
 */
export function RiskHelpPanel({
  panelId,
  onClose,
}: {
  panelId: string;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<RiskHelpTabId>('workflow');
  const tabRefs = useRef<Partial<Record<RiskHelpTabId, HTMLButtonElement | null>>>({});

  function moveTab(nextIndex: number) {
    const normalized = (nextIndex + RISK_HELP_TABS.length) % RISK_HELP_TABS.length;
    const nextTab = RISK_HELP_TABS[normalized].id;
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveTab(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveTab(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      moveTab(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      moveTab(RISK_HELP_TABS.length - 1);
    }
  }

  return (
    <section
      id={panelId}
      className="risk-help"
      role="region"
      aria-label="위험관리 사용방법 도움말"
    >
      <div className="risk-help-head">
        <div>
          <h2>위험관리 사용방법</h2>
          <p className="risk-help-sub">
            DEMO와 KIS 모의 계좌의 공통 3대 한도, 손실 한도 소진율 게이지, 종목별 노출 판독, 긴급정지·재개 조건을
            정리했습니다.
          </p>
        </div>
        <button type="button" className="button secondary small-button" onClick={onClose}>
          <X size={14} aria-hidden="true" />
          닫기
        </button>
      </div>

      <div className="risk-help-tabs" role="tablist" aria-label="위험관리 도움말 분류">
        {RISK_HELP_TABS.map((tab, index) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={el => {
                tabRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              id={`${panelId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${panelId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={'risk-help-tab' + (selected ? ' active' : '')}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={event => handleTabKeyDown(event, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id={`${panelId}-panel-workflow`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-workflow`}
        tabIndex={activeTab === 'workflow' ? 0 : undefined}
        hidden={activeTab !== 'workflow'}
        className="risk-help-body"
      >
        <ol className="risk-help-steps">
          <li>
            <span className="risk-help-step-no">1단계</span>
            <h3>환경 선택 및 무부작용 읽기 원칙</h3>
            <p>
              상단 <strong>DEMO 사용량</strong>과 <strong>KIS 모의 사용량</strong> 버튼으로 점검할 환경을 전환합니다.
              화면 진입·환경 전환·도움말 열기·종목 검색/필터/정렬·이벤트 분류 전환은 브로커 호출이나 상태 변경{' '}
              <code>POST</code> 요청을 발생시키지 않는 읽기 전용 동작입니다.
            </p>
          </li>
          <li>
            <span className="risk-help-step-no">2단계</span>
            <h3>손실 게이지 · 3대 공통 한도 · 노출률 판독</h3>
            <p>
              <strong>손실 한도 소진율 게이지</strong>에서 안전 범위(&lt;80%)·주의(80% 이상)·한도 도달 차단(100% 이상)
              상태를 확인하고, 우측 제어 패널의 3대 공통 한도와 하단 종목별 <strong>노출률 · 잔여 한도</strong>를
              함께 대조합니다.
            </p>
          </li>
          <li>
            <span className="risk-help-step-no">3단계</span>
            <h3>종목별 검색 · 위험 필터 · 정렬 및 매매 화면 이동</h3>
            <p>
              종목별 사용량 상단에서 종목명·코드 검색, 위험 상태 필터(전체·주의·한도 도달·매수 예약 있음·여유), 5종
              다기준 정렬로 한도 임박 종목을 우선 확인합니다. 종목 링크를 누르면 DEMO는 <code>/trade?mode=demo</code>,
              KIS 모의는 <code>/paper</code>로 바로 이동합니다.
            </p>
          </li>
          <li>
            <span className="risk-help-step-no">4단계</span>
            <h3>긴급정지 발동 · 무결성 게이트 확인 · 재개 및 전략 재시작</h3>
            <p>
              위험 상황에서는 <strong>신규 주문 긴급정지</strong>로 신규 주문과 자동매매 전략을 즉시 멈춥니다. 재개
              전에는 KIS 3대 무결성 게이트(전체 잔고·60초 내 주문 대조·불명·전송 중 0건)를 확인하고, 허용 후 정지된
              전략은 전략 화면에서 직접 다시 시작합니다.
            </p>
          </li>
        </ol>
      </div>

      <div
        id={`${panelId}-panel-limits-math`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-limits-math`}
        tabIndex={activeTab === 'limits-math' ? 0 : undefined}
        hidden={activeTab !== 'limits-math'}
        className="risk-help-body"
      >
        <div className="risk-help-grid">
          <article className="risk-help-card">
            <h3>1회 주문 한도 (maxOrder)</h3>
            <p>
              지정가 주문은 <code>지정가 × 수량</code>, KIS 시장가 주문은 <code>상한가(quote.upper) × 수량</code>으로
              주문 금액을 계산해 <code>maxOrder</code> 초과 시 즉시 차단합니다. 기존 미체결 매수 예약액은 1회 주문
              한도에는 합산하지 않습니다.
            </p>
          </article>
          <article className="risk-help-card">
            <h3>종목별 한도 (maxPosition)</h3>
            <p>
              신규 매수 검증 시 <code>보유 평가액 + 미체결 매수 예약액 + 신규 매수 금액</code> 합계가{' '}
              <code>maxPosition</code>을 넘으면 차단합니다. KIS 미체결 매수 단가가 0원이거나 미확정이면 0원으로
              가정하지 않고 <strong>예약액 미확인</strong>으로 표시하며 주문 검증에서도 차단합니다.
            </p>
          </article>
          <article className="risk-help-card">
            <h3>공통 손실 한도 (dailyLoss)</h3>
            <p>
              <strong>일반 주문</strong>의 손실 사용량은 <code>Math.max(0, 기준 자산 − 현재 평가자산)</code>으로
              계산합니다. 손실이 <code>risk.dailyLoss</code> 이상(<code>loss &gt;= dailyLoss</code> 정확 경계값 포함)에
              도달하면 일반 주문의 신규 <strong>매수·매도 모두 차단</strong>됩니다. 단, 장전 운용 계획 매도는
              매도가능수량 내 허용됩니다.
            </p>
          </article>
          <article className="risk-help-card">
            <h3>장전 운용 계획(Morning) 활성 시 손실 한도</h3>
            <p>
              KIS 모의 계좌에서 당일 승인·무장된 장전 운용 계획(<code>approvedAt</code>, <code>run.armed</code>,{' '}
              <code>run.buyId === report.id</code>)이 활성화되어 있으면 실효 한도{' '}
              <code>Math.min(risk.dailyLoss, morning.report.dailyLoss)</code>와 당일 기준 자산(
              <code>morning.report.equity ?? baselineEquity</code>)을 적용합니다. 실효 한도에 당일 1회 도달하면 거래일
              종료까지 정지 래치(<code>morningStopped</code>)가 유지되어 평가자산이 회복되어도{' '}
              <strong>장전 신규 매수 차단</strong>이 계속되며, <strong>장전 매도는 매도가능수량 내 허용</strong>
              됩니다.
            </p>
          </article>
        </div>
      </div>

      <div
        id={`${panelId}-panel-halt-recovery`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-halt-recovery`}
        tabIndex={activeTab === 'halt-recovery' ? 0 : undefined}
        hidden={activeTab !== 'halt-recovery'}
        className="risk-help-body"
      >
        <div className="risk-help-grid">
          <article className="risk-help-card">
            <h3>긴급정지 영구 저장 및 즉각 중단 범위</h3>
            <p>
              긴급정지(<code>risk.halted = true</code>)는 로컬 저장소에 영구 기록되어 서버를 재시작해도 유지됩니다.
              발동 즉시 신규 주문과 모든 활성 전략·DEMO 자동 재생이 중단되지만, 이미 접수된 미체결 주문과 보유자산은
              자동 취소·청산되지 않습니다.
            </p>
          </article>
          <article className="risk-help-card">
            <h3>재개 게이트 (원장 확인 &amp; 불명·전송 중 0건)</h3>
            <p>
              긴급정지를 해제(<strong>신규 주문 허용</strong>)하려면 로컬 주문 원장(<code>paperRisk</code>) 상태가
              확인되어 있어야 하며, 응답 불명(<code>unknown</code>) 또는 전송 중(<code>sending</code>) KIS 주문 건수(
              <code>unresolvedCount</code>)가 반드시 <code>0건</code>이어야 합니다.
            </p>
          </article>
          <article className="risk-help-card">
            <h3>KIS 3대 무결성 게이트 (사용량 확정 조건)</h3>
            <p>
              KIS 모의 사용량과 종목별 노출 표는 ① 전체 잔고 연결 완료(<code>connected &amp;&amp; complete</code>), ②
              60초 이내 최신 주문 대조, ③ 불명·전송 중 <code>0건</code>이 모두 충족될 때만 확정 수치로 표시합니다.
            </p>
          </article>
          <article className="risk-help-card">
            <h3>재개 후 지속 검사 및 전략 수동 재시작</h3>
            <p>
              긴급정지를 해제하더라도 공통 손실 한도와 종목별·1회 주문 한도 검사는 계속 적용됩니다. 긴급정지로 멈춘
              전략은 자동으로 재가동되지 않으므로 전략 스튜디오에서 상태를 점검한 뒤 수동으로 시작해야 합니다.
            </p>
          </article>
        </div>
      </div>

      <div
        id={`${panelId}-panel-faq`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-faq`}
        tabIndex={activeTab === 'faq' ? 0 : undefined}
        hidden={activeTab !== 'faq'}
        className="risk-help-body"
      >
        <div className="risk-help-faq">
          <article className="risk-help-card">
            <h3>Q. DEMO와 KIS 모의의 손실 계산 기준은 어떻게 다른가요?</h3>
            <p>
              DEMO는 <code>startingEquity − equity(state)</code>로 계산하며 일별 자동 초기화가 없고, 틱 진행(
              <code>advanceTick</code>) 중 손실이 한도에 도달하면 자동으로 긴급정지(<code>halt(state, true)</code>)가
              걸립니다. 반면 KIS 모의는 KST 거래일(<code>paperRisk.day</code>) 첫 주문 검증 시점의{' '}
              <code>baselineEquity − totalEquity</code>를 사용하며 입출금은 보정하지 않습니다.
            </p>
          </article>
          <article className="risk-help-card">
            <h3>Q. 종목별 표에서 매수 예약액이 &apos;예약액 미확인&apos;, 노출률이 &apos;산출 불가&apos;로 나오는 이유는?</h3>
            <p>
              KIS 미체결 매수 주문의 단가가 <code>0원</code> 이하이거나 미확정 상태일 때 이를 0원으로 계산하면 종목
              노출이 과소 표시됩니다. 안전 불변식에 따라 사용량은 <strong>미확인</strong>, 노출률 · 잔여 한도는{' '}
              <strong>산출 불가</strong>로 표시해 잘못된 여유 한도를 안내하지 않습니다.
            </p>
          </article>
          <article className="risk-help-card">
            <h3>Q. &apos;KIS 사용량 미확인&apos; 상태는 어떻게 해소하나요?</h3>
            <p>
              ① 설정 화면에서 KIS 모의 전체 잔고 조회를 완료하고, ② <code>/paper</code> 화면에서 당일 주문 대조를
              실행해 60초 이내 최신 기록을 확보하며, ③ 불명·전송 중 주문이 있다면 복구를 끝내야 KIS 사용량과 종목별
              노출 표가 표시됩니다.
            </p>
          </article>
          <article className="risk-help-card">
            <h3>Q. &apos;신규 주문 허용&apos; 버튼이 비활성화되어 눌리지 않는 이유는 무엇인가요?</h3>
            <p>
              로컬 서버와 연결이 끊어졌거나, 주문 원장 상태(<code>paperRisk</code>)가 확인되지 않았거나, KIS
              불명·전송 중 주문이 1건 이상 남아 있으면 재개가 차단됩니다. 서버 상태를 새로고침하거나{' '}
              <code>/paper</code>에서 불명 주문을 대조·복구하면 재개 버튼이 활성화됩니다.
            </p>
          </article>
          <article className="risk-help-card">
            <h3>Q. 긴급정지를 해제했는데 자동매매 전략이 다시 돌지 않거나 주문이 계속 차단되는 이유는?</h3>
            <p>
              긴급정지 발동 시 모든 자동매매 전략이 안전하게 정지되므로 재개 후 전략 스튜디오에서 직접 다시 켜야
              합니다. 또한 현재 손실이 여전히 공통 손실 한도(<code>dailyLoss</code>) 이상이라면 긴급정지를 해제해도
              손실 한도 차단 상태는 유지됩니다.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
