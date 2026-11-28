import { useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

/** 주문·체결 사용방법 도움말 탭 식별자. */
export type OrdersHelpTabId = 'workflow' | 'status-fill' | 'ledger-safety' | 'faq';

/** 4탭 WAI-ARIA 주문·체결 도움말 탭 목록. */
export const ORDERS_HELP_TABS: { id: OrdersHelpTabId; label: string }[] = [
  { id: 'workflow', label: '처음부터 따라하기' },
  { id: 'status-fill', label: '상태·수량·체결 사전' },
  { id: 'ledger-safety', label: '원장 대조·안전장치 사전' },
  { id: 'faq', label: '환경별 차이·FAQ' },
];

/**
 * `/orders` 상단에서 열고 닫는 4탭 WAI-ARIA 대화형 주문·체결 도움말 패널.
 * `DEMO 주문`, `KIS 모의 원장`, `지난 KIS 실행 기록`의 조회·필터·대조·복구 원칙을 안내한다.
 */
export function OrdersHelpPanel({
  panelId,
  onClose,
}: {
  panelId: string;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<OrdersHelpTabId>('workflow');
  const tabRefs = useRef<Partial<Record<OrdersHelpTabId, HTMLButtonElement | null>>>({});

  function moveTab(nextIndex: number) {
    const normalized = (nextIndex + ORDERS_HELP_TABS.length) % ORDERS_HELP_TABS.length;
    const nextTab = ORDERS_HELP_TABS[normalized].id;
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
      moveTab(ORDERS_HELP_TABS.length - 1);
    }
  }

  return (
    <section
      id={panelId}
      className="panel orders-help"
      role="region"
      aria-label="주문·체결 사용방법 도움말"
    >
      <div className="orders-help-head">
        <div>
          <h2>주문·체결 사용방법</h2>
          <p className="orders-help-sub">
            DEMO 주문과 KIS 모의 원장, 지난 실행 기록을 안전하게 조회·필터링하고 미확인 요청을 대조하는 핵심 절차를 정리했습니다.
          </p>
        </div>
        <button type="button" className="button secondary small-button" onClick={onClose}>
          <X size={14} aria-hidden="true" />
          닫기
        </button>
      </div>

      <div className="orders-help-tabs" role="tablist" aria-label="주문·체결 도움말 분류">
        {ORDERS_HELP_TABS.map((tab, index) => {
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
              className={'orders-help-tab' + (selected ? ' active' : '')}
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
        className="orders-help-body"
      >
        <ol className="orders-help-steps">
          <li>
            <span className="orders-help-step-no">1단계</span>
            <h3>3대 원장 환경 선택</h3>
            <p>
              상단 환경 탭에서 <strong>DEMO 주문</strong>(로컬 합성 원장), <strong>KIS 모의 원장</strong>(현재 실행
              저장 원장), <strong>지난 KIS 실행 기록</strong>(읽기 전용 아카이브) 중 확인할 범위를 먼저 고릅니다.
            </p>
          </li>
          <li>
            <span className="orders-help-step-no">2단계</span>
            <h3>다차원 필터 · 개인 식별자 검색</h3>
            <p>
              종목명·6자리 코드와 상태 필터에 더해 하단 세부 필터에서 매매 방향(매수·매도)과 주문 출처(수동·전략)를
              조합합니다. 지난 실행 기록에서는 <code>requestId</code>, <code>brokerId</code>, 거래일(<code>YYYY-MM-DD</code>)로
              검색하면 해당 주문 상세가 자동으로 펼쳐집니다.
            </p>
          </li>
          <li>
            <span className="orders-help-step-no">3단계</span>
            <h3>DEMO 미체결 취소 · 봉 재생 · 보존 요청 대조</h3>
            <p>
              DEMO 미체결 주문은 취소 버튼으로 예약 현금·수량을 즉시 해제할 수 있고, <strong>다음 데모 봉 재생</strong>으로
              체결 조건을 평가합니다. 브라우저에 보존된 미확인 요청(<code>demo-order-pending</code>)이 있으면 하단 대조
              배너에서 원장 접수 여부를 자동 확인합니다.
            </p>
          </li>
          <li>
            <span className="orders-help-step-no">4단계</span>
            <h3>KIS 확인 시각 판독 및 /paper 복구 이동</h3>
            <p>
              KIS 모의 원장에서는 각 주문의 <code>주문별 KIS 확인 (KST)</code> 시각과 상세 정보를 점검합니다. 불명·전송 중
              주문의 실제 증권사 대조와 취소·복구 실행은 각 행의 링크 또는 하단 허브에서 <code>/paper</code>로 이동해
              진행합니다.
            </p>
          </li>
        </ol>
      </div>

      <div
        id={`${panelId}-panel-status-fill`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-status-fill`}
        tabIndex={activeTab === 'status-fill' ? 0 : undefined}
        hidden={activeTab !== 'status-fill'}
        className="orders-help-body"
      >
        <div className="orders-help-grid">
          <article className="orders-help-card">
            <h3>주문 / 체결 / 잔량 수량 불변식</h3>
            <p>
              모든 주문은 <code>filled + remaining &lt;= qty</code> 수량 불변식을 만족해야 원장에 반영됩니다. 전량
              체결은 잔량이 0주이며, 부분체결 후 잔량 취소가 확정되면 체결 수량은 유지되고 잔량만 0주로 정리됩니다.
            </p>
          </article>
          <article className="orders-help-card">
            <h3>DEMO 지정가 체결 · 단가 차액 · 수수료 · 예약금</h3>
            <p>
              DEMO 지정가는 다음 봉에서 매수는 지정가 이하, 매도는 지정가 이상일 때 체결되며 체결 금액의{' '}
              <code>0.015%</code>를 올림해 수수료로 반영합니다. 미체결 매수는 예상 수수료 포함 현금을 예약 잠금하고,
              체결 후에는 지정가 대비 유리·불리 차액을 상세와 하단 허브에서 함께 집계합니다.
            </p>
          </article>
          <article className="orders-help-card">
            <h3>KIS 7종 주문 상태 · 시장가 · 상한 지정가 캡</h3>
            <p>
              KIS 모의 원장은 <strong>전송 중</strong>, <strong>접수 · 미체결</strong>, <strong>부분체결</strong>,{' '}
              <strong>체결</strong>, <strong>취소</strong>, <strong>응답 불명 · 대조 필요</strong>,{' '}
              <strong>거부 · 미접수</strong> 7종 상태를 구분합니다. 시장가 주문은 가격을 비워 표기하고, 상한 지정 현재가
              주문은 최대 허용 단가(<code>priceCeiling</code>)를 함께 표시합니다.
            </p>
          </article>
          <article className="orders-help-card">
            <h3>주문 출처 (수동 주문 vs 전략 자동 주문)</h3>
            <p>
              수동 입력 주문과 전략 엔진이 생성한 자동 주문을 구분해 표시합니다. KIS 전략 자동 주문은{' '}
              <code>strategy</code> 메타데이터(전략 ID, 리비전, 매수·매도 신호, 기준일)를 주문 상세에 보존해 사후 감사를
              지원합니다.
            </p>
          </article>
        </div>
      </div>

      <div
        id={`${panelId}-panel-ledger-safety`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-ledger-safety`}
        tabIndex={activeTab === 'ledger-safety' ? 0 : undefined}
        hidden={activeTab !== 'ledger-safety'}
        className="orders-help-body"
      >
        <div className="orders-help-grid">
          <article className="orders-help-card">
            <h3>읽기 전용 무부작용(Zero-Mutation Read) 원칙</h3>
            <p>
              <code>/orders</code> 화면에 진입하거나 탭·필터·페이지를 전환해도 증권사 주문 전송, 취소, 자동 대조
              <code>POST</code> 요청을 절대 발생시키지 않습니다. KIS 원장 확인은 오직 로컬 저장소 읽기(<code>GET</code>)로만
              동작합니다.
            </p>
          </article>
          <article className="orders-help-card">
            <h3>주문별 KIS 확인(KST) vs 로컬 원장 읽기 완료(KST)</h3>
            <p>
              <code>주문별 KIS 확인 (KST)</code>(<code>lastMatchedAt</code>)은 해당 주문이 실제 증권사 응답과 마지막으로
              일치한 시각입니다. 반면 <code>로컬 원장 읽기 완료 (KST)</code>(<code>readAt</code>)는 브라우저가 로컬
              파일을 읽은 시각일 뿐 최신 증권사 상태 확인을 뜻하지 않습니다.
            </p>
          </article>
          <article className="orders-help-card">
            <h3>읽기 실패 · 스키마 오류 시 이전 원장 보존</h3>
            <p>
              네트워크 장애나 손상된 응답 스키마로 다시 읽기가 실패하면 마지막 정상 스냅샷을 유지하고 오류 경고를
              표시합니다. 조회 실패를 빈 원장으로 오인하지 않도록 빈 목록 안내를 차단해 상태를 투명하게 구분합니다.
            </p>
          </article>
          <article className="orders-help-card">
            <h3>실시간 WebSocket 체결통보와 REST 대조 보호</h3>
            <p>
              현재 실행 KIS 원장은 실시간 체결통보나 REST 대조(<code>reconciledAt</code>)가 갱신될 때 자동으로 최신
              저장본을 다시 읽습니다. 반면 <strong>지난 KIS 실행 기록</strong>은 과거 감사 스냅샷이므로 현재 세션
              실시간 갱신에 영향을 받지 않습니다.
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
        className="orders-help-body"
      >
        <div className="orders-help-faq">
          <article className="orders-help-card">
            <h3>Q. KIS 모의 원장에 직접 취소 버튼 대신 /paper 링크만 둔 이유는 무엇인가요?</h3>
            <p>
              KIS 모의 주문 취소와 불명 복구는 당일 증권사 원장 대조, 실시간 연결 상태, 증거 스냅샷 확인을 거쳐야
              중복 취소나 오연결을 막을 수 있습니다. 읽기 화면인 <code>/orders</code>에서는 실수 클릭을 원천 차단하고
              전용 복구·취소 절차가 있는 <code>/paper</code>로 안전하게 연결합니다.
            </p>
          </article>
          <article className="orders-help-card">
            <h3>Q. &apos;주문별 KIS 확인 (KST)&apos;이 &apos;미확인&apos;으로 표시되는 이유와 대조 방법은 무엇인가요?</h3>
            <p>
              주문 전송 직후 응답이 지연·단절되었거나 아직 당일 증권사 원장 대조를 거치지 않은 주문은 확인 시각이
              기록되지 않아 <strong>미확인</strong>으로 표시됩니다. <code>/paper</code> 화면에서 <strong>계좌·주문 조회</strong>로
              당일 원장을 대조하면 확인 시각과 최종 상태가 반영됩니다.
            </p>
          </article>
          <article className="orders-help-card">
            <h3>Q. KIS 원장에서 평균 체결가·수수료가 &apos;미제공&apos;으로 표시되는 이유는 무엇인가요?</h3>
            <p>
              현재 로컬 KIS 저장 원장 스키마는 주문 단가, 체결·잔량 수량, 증권사 주문번호와 대조 시각을 보존하며
              체결별 평균 단가와 수수료 필드를 별도로 저장하지 않습니다. 실제 평가손익과 보유 평균 매입가는 계좌
              잔고 조회(<code>/settings</code> · <code>/paper</code>)에서 확인하세요.
            </p>
          </article>
          <article className="orders-help-card">
            <h3>Q. /trade?mode=demo 미확인 요청(demo-order-pending)을 /orders에서 어떻게 대조하나요?</h3>
            <p>
              <code>/trade?mode=demo</code>에서 주문 응답이 끊기면 브라우저 <code>sessionStorage</code>(
              <code>demo-order-pending</code>)에 요청 ID가 보존됩니다. <code>/orders</code> DEMO 탭을 열면 하단{' '}
              <strong>보존된 DEMO 요청 원장 대조</strong> 배너가 로컬 원장과 자동 비교해 접수 완료 여부와 재시도 가능
              여부를 즉시 알려줍니다.
            </p>
          </article>
          <article className="orders-help-card">
            <h3>Q. &apos;지난 KIS 실행 기록&apos;의 &apos;일부 원장을 읽지 못했습니다&apos; 경고는 무엇을 의미하나요?</h3>
            <p>
              연결된 과거 실행 원장 파일 중 일부가 이동·삭제되었거나 손상되어 읽지 못했을 때 나타납니다. 정상적으로
              읽힌 나머지 실행 원장의 주문은 계속 확인할 수 있으며, 누락된 원장 이름은 경고 배너에 표시되므로 파일
              경로와 권한을 점검한 뒤 <strong>원장 다시 읽기</strong>를 실행하세요.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
