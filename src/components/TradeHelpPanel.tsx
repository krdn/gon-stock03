import { useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { MARKET_REFRESH_MS, MARKET_STALE_MS } from '../../shared/market-data';

/** 트레이딩 사용방법 도움말 탭 식별자. */
export type TradeHelpTabId = 'workflow' | 'quote-chart' | 'order-risk' | 'faq';

/** 4탭 WAI-ARIA 도움말 탭 목록. */
export const TRADE_HELP_TABS: { id: TradeHelpTabId; label: string }[] = [
  { id: 'workflow', label: '처음부터 따라하기' },
  { id: 'quote-chart', label: '시세·호가·차트 사전' },
  { id: 'order-risk', label: '주문·한도·체결 사전' },
  { id: 'faq', label: '환경별 차이·FAQ' },
];

/**
 * `/trade` 상단에서 열고 닫는 4탭 WAI-ARIA 대화형 트레이딩 도움말 패널.
 * `실제 시세` 조회와 `DEMO 연습` 지정가 주문의 절차·지표·안전장치를 안내한다.
 */
export function TradeHelpPanel({
  panelId,
  onClose,
}: {
  panelId: string;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TradeHelpTabId>('workflow');
  const tabRefs = useRef<Partial<Record<TradeHelpTabId, HTMLButtonElement | null>>>({});

  function moveTab(nextIndex: number) {
    const normalized = (nextIndex + TRADE_HELP_TABS.length) % TRADE_HELP_TABS.length;
    const nextTab = TRADE_HELP_TABS[normalized].id;
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
      moveTab(TRADE_HELP_TABS.length - 1);
    }
  }

  return (
    <section
      id={panelId}
      className="panel trade-help"
      role="region"
      aria-label="트레이딩 사용방법 도움말"
    >
      <div className="trade-help-head">
        <div>
          <h2>트레이딩 사용방법</h2>
          <p className="trade-help-sub">
            실제 KIS 시세·호가·일봉 판독부터 DEMO 지정가 주문, 한도 사전 점검, 원장 복구까지 핵심 절차를 정리했습니다.
          </p>
        </div>
        <button type="button" className="button secondary small-button" onClick={onClose}>
          <X size={14} aria-hidden="true" />
          닫기
        </button>
      </div>

      <div className="trade-help-tabs" role="tablist" aria-label="트레이딩 도움말 분류">
        {TRADE_HELP_TABS.map((tab, index) => {
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
              className={'trade-help-tab' + (selected ? ' active' : '')}
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
        className="trade-help-body"
      >
        <ol className="trade-help-steps">
          <li>
            <span className="trade-help-step-no">1단계</span>
            <h3>환경 선택 (실제 시세 vs DEMO 연습)</h3>
            <p>
              <strong>실제 시세</strong>는 KIS 모의 서버의 KRX 현재가·호가·수정 일봉을 읽는 조회 전용 화면이며
              자동 주문을 보내지 않습니다. <strong>DEMO 연습</strong>은 로컬 합성 시세와 가상 현금으로 지정가
              주문과 위험 한도 검사를 안전하게 연습하는 환경입니다.
            </p>
          </li>
          <li>
            <span className="trade-help-step-no">2단계</span>
            <h3>종목 조회 · 호가 · 일봉 범위 판독</h3>
            <p>
              관심종목 빠른 선택 칩, 종목 목록, 또는 6자리 종목코드 직접 입력으로 종목을 전환합니다. 상·하한가와
              호가 단위, 가격제한폭 내 위치, 거래량·거래 상태, 20·60·100일 수정 일봉 추세와 이동평균(SMA 20/60)을
              함께 판독합니다.
            </p>
          </li>
          <li>
            <span className="trade-help-step-no">3단계</span>
            <h3>위험 한도 · 계좌 맥락 · 주문 영향 점검</h3>
            <p>
              <strong>실제 시세</strong>에서는 선택 종목 KIS 모의 보유·긴급정지·공통 한도·실시간 상태를 먼저
              확인합니다. <strong>DEMO 연습</strong>에서는 가격 빠른 조정과 최대 가능 수량, 체결 후 예상 보유·평단
              또는 예상 실현손익, 종목별 투자금 노출을 주문 전에 시뮬레이션합니다.
            </p>
          </li>
          <li>
            <span className="trade-help-step-no">4단계</span>
            <h3>KIS 모의 원장 대조 또는 DEMO 주문 확인</h3>
            <p>
              실제 KIS 모의 주문 실행과 원장 대조·불명 복구는 전용 화면(<code>/paper</code>)에서 진행합니다. DEMO
              지정가 주문은 확인 모달에서 시세와 금액을 재확인해 접수하며, 응답이 끊긴 요청은 멱등 대조로 중복
              주문을 막습니다.
            </p>
          </li>
        </ol>
      </div>

      <div
        id={`${panelId}-panel-quote-chart`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-quote-chart`}
        tabIndex={activeTab === 'quote-chart' ? 0 : undefined}
        hidden={activeTab !== 'quote-chart'}
        className="trade-help-body"
      >
        <div className="trade-help-grid">
          <article className="trade-help-card">
            <h3>KIS 현재가 · 등락률 · 수신 시각(KST)</h3>
            <p>
              표시 시각은 한국투자증권 모의 API 응답을 로컬 서버가 수신한 한국표준시(KST) 기준입니다. 개별 체결
              시각은 API가 제공하지 않으므로 수신 시각과 상태 배지를 함께 확인해야 합니다.
            </p>
          </article>
          <article className="trade-help-card">
            <h3>상한가 · 하한가 · 호가 단위 · 가격제한폭 위치</h3>
            <p>
              <code>upper</code>(상한가)와 <code>lower</code>(하한가)는 당일 허용 가격 범위이며, 현재가가 하한가~상한가
              구간 어디에 있는지 백분율(%) 게이지로 보여줍니다. <code>tickSize</code>는 해당 가격대에서 지정가 주문을
              입력할 때 맞춰야 하는 최소 호가 단위입니다.
            </p>
          </article>
          <article className="trade-help-card">
            <h3>거래량 · 업종 · 거래정지 · 정리매매</h3>
            <p>
              누적 거래량과 업종 분류를 표시하며, 거래정지(<code>stopped</code>) 또는 정리매매(
              <code>liquidation</code>) 플래그가 감지되면 상단 주의 배지와 상태 요약에 즉시 경고해 비정상 종목
              진입을 방지합니다.
            </p>
          </article>
          <article className="trade-help-card">
            <h3>자동 갱신 · 신선도 · 탭 숨김 일시정지</h3>
            <p>
              수신 완료 후 {MARKET_REFRESH_MS / 1000}초마다(<code>MARKET_REFRESH_MS</code>) 최신 시세를 다시 조회하며,
              서버 기준 수신 경과가 {MARKET_STALE_MS / 1000}초(<code>MARKET_STALE_MS</code>)를 넘거나 오류가 나면
              오래된 값으로 표시합니다. 브라우저 탭을 숨기면 자동 조회를 일시정지하고, 복귀 시 즉시 재조회합니다.
            </p>
          </article>
          <article className="trade-help-card">
            <h3>KIS 수정 일봉(20·60·100일) · 추세 · 이동평균</h3>
            <p>
              권리락·액면분할이 반영된 KIS 수정 종가 일봉을 최대 100거래일까지 조회해 20·60·100일 구간으로 잘라
              보여줍니다. 선택 구간 수익률, 최고·최저 종가와 기준일, 최근 20거래일(SMA 20)·60거래일(SMA 60) 단순
              이동평균과 이격도를 함께 산출합니다.
            </p>
          </article>
        </div>
      </div>

      <div
        id={`${panelId}-panel-order-risk`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-order-risk`}
        tabIndex={activeTab === 'order-risk' ? 0 : undefined}
        hidden={activeTab !== 'order-risk'}
        className="trade-help-body"
      >
        <div className="trade-help-grid">
          <article className="trade-help-card">
            <h3>DEMO 지정가 · 수수료 · 가격 조정 · 최대 수량</h3>
            <p>
              DEMO 지정가 주문은 다음 데모 봉에서 체결 조건(매수는 지정가 이하, 매도는 이상)을 평가하며 체결 금액의
              <code>0.015%</code>를 올림해 예상 수수료로 계산합니다. <code>-1%</code>/<code>현재가 적용</code>/
              <code>+1%</code> 버튼으로 가격을 빠르게 맞추고, <code>최대 가능</code> 버튼은 수수료·가용 현금·위험
              한도(또는 예약 제외 매도 가능 수량)를 모두 만족하는 최대 정수 수량을 자동 계산합니다.
            </p>
          </article>
          <article className="trade-help-card">
            <h3>예약 제외 현금 · 예약 제외 매도 가능 수량</h3>
            <p>
              미체결 매수 주문 금액과 예상 수수료는 가용 현금에서 먼저 차감(예약)되고, 미체결 매도 주문 수량은 보유
              수량에서 차감됩니다. 중복 매수나 보유 초과 매도를 막기 위해 항상 예약 제외 잔여분 기준으로 검사합니다.
            </p>
          </article>
          <article className="trade-help-card">
            <h3>공통 4대 위험 한도</h3>
            <p>
              1회 주문 한도(<code>maxOrder</code>), 종목별 최대 투자금(<code>maxPosition</code>), 일일 손실 한도(
              <code>dailyLoss</code>), 긴급정지(<code>halted</code>) 4가지 규칙은 DEMO와 KIS 모의 모두에 공통
              적용됩니다. 화면 사전 검사뿐 아니라 서버 접수 단계에서도 동일하게 재검증합니다.
            </p>
          </article>
          <article className="trade-help-card">
            <h3>확인 모달 시세 변동 재확인</h3>
            <p>
              주문 확인 모달이 열린 동안 DEMO 합성 시세가 바뀌면 접수 버튼이 자동으로 잠깁니다. 지정가는 그대로
              유지되며, 바뀐 현재 시세를 확인한 뒤 <code>변경된 시세 재확인</code> 버튼을 눌러야 다시 접수할 수
              있습니다.
            </p>
          </article>
          <article className="trade-help-card">
            <h3>미확인 요청 보존 · 멱등 복구</h3>
            <p>
              주문 전송 직전 요청 고유 ID를 브라우저 <code>sessionStorage</code>(<code>demo-order-pending</code>)에
              저장합니다. 네트워크 단절 등으로 응답을 받지 못하면 새 주문을 차단하고, 원장 대조 또는 시세 확인 후
              같은 요청 ID로 멱등 재시도해 중복 체결을 예방합니다.
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
        className="trade-help-body"
      >
        <div className="trade-help-faq">
          <article className="trade-help-card">
            <h3>Q. 실제 시세 화면에 주문 입력창이 없고 /paper로 분리된 이유는 무엇인가요?</h3>
            <p>
              실제 KIS 모의 주문은 잔고 조회 신선도, 당일 원장 대조, 실시간 WebSocket 상태, 불명·전송 중 주문 복구
              확인까지 함께 검증해야 안전합니다. 시세 탐색 중 실수로 주문이 나가는 사고를 막기 위해 조회는
              <code>/trade</code>에, 실제 모의 주문과 원장 대조는 <code>/paper</code>에 분리했습니다.
            </p>
          </article>
          <article className="trade-help-card">
            <h3>Q. KIS 시세 조회에 실패하면 왜 DEMO 합성 가격으로 대신 보여주지 않나요?</h3>
            <p>
              실제 시세 화면에 가상 가격이 섞이면 사용자가 실제 KRX 시세로 오인해 잘못된 판단을 내릴 수 있습니다.
              Zero-Synthetic-Fallback 원칙에 따라 KIS 조회 실패 시 합성 가격·가상 현금을 절대 대체 표시하지 않고
              오류 안내와 수동 재조회만 제공합니다.
            </p>
          </article>
          <article className="trade-help-card">
            <h3>Q. &apos;이전 수신값 · 최신 아님&apos; 상태는 언제 나타나며 어떻게 복구하나요?</h3>
            <p>
              마지막 KIS 시세 수신 후 서버 기준 {MARKET_STALE_MS / 1000}초가 지났거나, 주기 갱신 중 오류가 발생했거나,
              로컬 서버 연결이 끊어졌을 때 나타납니다. 로컬 서버와 KIS 연결 상태를 확인한 뒤 <strong>시세 다시 조회</strong>
              버튼을 누르면 최신 시세로 복구됩니다.
            </p>
          </article>
          <article className="trade-help-card">
            <h3>Q. DEMO 주문 확인 버튼이 비활성화되는 원인과 해결 방법은 무엇인가요?</h3>
            <p>
              긴급정지 켜짐, 로컬 서버 미연결·오래된 상태, 손실·1회·종목 한도 초과, 수수료 포함 현금 부족, 예약 제외
              매도 수량 부족, 미확인 요청 대기, 또는 <code>sessionStorage</code> 접근 오류 중 하나가 원인입니다. 버튼
              위 상태 문구에서 차단 사유를 확인하고 수량·가격 조정, 원장 대조, 또는 위험관리 설정으로 해결하세요.
            </p>
          </article>
          <article className="trade-help-card">
            <h3>Q. 상·하한가와 호가 단위는 주문 가격을 정할 때 어떻게 활용하나요?</h3>
            <p>
              KRX 지정가 주문은 당일 하한가와 상한가 사이에서 해당 종목의 호가 단위(<code>tickSize</code>) 배수로
              입력해야 정상 접수됩니다. 호가 요약 카드의 상·하한가 여유율과 호가 단위를 먼저 확인한 뒤{' '}
              <code>/paper</code>에서 지정가를 입력하면 가격 거부 오류를 줄일 수 있습니다.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
