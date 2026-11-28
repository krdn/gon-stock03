import { useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

/** 포트폴리오 사용방법 도움말 탭 식별자. */
export type PortfolioHelpTabId = 'workflow' | 'valuation-math' | 'integrity-safety' | 'faq';

/** 4탭 WAI-ARIA 포트폴리오 도움말 탭 목록. */
export const PORTFOLIO_HELP_TABS: { id: PortfolioHelpTabId; label: string }[] = [
  { id: 'workflow', label: '처음부터 따라하기' },
  { id: 'valuation-math', label: '평가·손익·비중 산식 사전' },
  { id: 'integrity-safety', label: '데이터 완전성·안전장치 사전' },
  { id: 'faq', label: '환경별 차이·장전 계획·FAQ' },
];

/**
 * `/portfolio` 상단에서 열고 닫는 4탭 WAI-ARIA 대화형 포트폴리오 도움말 패널.
 * `KIS 모의` 잔고와 `로컬 DEMO` 자산의 판독·산식·무결성·장전 계획 연동 원칙을 안내한다.
 */
export function PortfolioHelpPanel({
  panelId,
  onClose,
}: {
  panelId: string;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<PortfolioHelpTabId>('workflow');
  const tabRefs = useRef<Partial<Record<PortfolioHelpTabId, HTMLButtonElement | null>>>({});

  function moveTab(nextIndex: number) {
    const normalized = (nextIndex + PORTFOLIO_HELP_TABS.length) % PORTFOLIO_HELP_TABS.length;
    const nextTab = PORTFOLIO_HELP_TABS[normalized].id;
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
      moveTab(PORTFOLIO_HELP_TABS.length - 1);
    }
  }

  return (
    <section
      id={panelId}
      className="portfolio-help"
      role="region"
      aria-label="포트폴리오 사용방법 도움말"
    >
      <div className="portfolio-help-head">
        <div>
          <h2>포트폴리오 사용방법</h2>
          <p className="portfolio-help-sub">
            KIS 모의 잔고와 로컬 DEMO 보유자산의 평가·수익률·비중 계산, 데이터 완전성 보호, 진단 허브 활용 절차를 정리했습니다.
          </p>
        </div>
        <button type="button" className="button secondary small-button" onClick={onClose}>
          <X size={14} aria-hidden="true" />
          닫기
        </button>
      </div>

      <div className="portfolio-help-tabs" role="tablist" aria-label="포트폴리오 도움말 분류">
        {PORTFOLIO_HELP_TABS.map((tab, index) => {
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
              className={'portfolio-help-tab' + (selected ? ' active' : '')}
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
        className="portfolio-help-body"
      >
        <ol className="portfolio-help-steps">
          <li>
            <span className="portfolio-help-step-no">1단계</span>
            <h3>환경 선택 및 KIS 잔고 수동 조회</h3>
            <p>
              상단 환경 버튼에서 <strong>KIS 모의</strong>(증권사 REST 잔고) 또는 <strong>로컬 DEMO</strong>(로컬 합성
              계좌)를 선택합니다. KIS 모의 잔고는 자동 주문이나 배경 쓰기 없이 <strong>KIS 잔고 새로고침</strong> 버튼으로
              직접 최신 전체 잔고를 확인하는 수동 조회 원칙을 따릅니다.
            </p>
          </li>
          <li>
            <span className="portfolio-help-step-no">2단계</span>
            <h3>4대 요약 지표와 수익률·비중 판독</h3>
            <p>
              상단 요약 카드에서 <strong>총 평가자산</strong>, <strong>예수금/보유 현금</strong>,{' '}
              <strong>보유 평가손익</strong>, <strong>주식·ETF 평가액</strong>을 먼저 점검합니다. 보유자산 표에서는
              종목별 <strong>평균 매입가</strong>, <strong>평가손익</strong>, <strong>수익률</strong>,{' '}
              <strong>비중</strong>을 한눈에 대조할 수 있습니다.
            </p>
          </li>
          <li>
            <span className="portfolio-help-step-no">3단계</span>
            <h3>보유종목 검색·필터·정렬 및 상세 이동</h3>
            <p>
              보유자산 상단 제어 바에서 종목명·코드 검색, 손익 상태 필터(전체·수익·손실·보합·평가불가), 6종 다기준
              정렬을 조합해 핵심 보유종목을 추려냅니다. 종목명을 클릭하면 KIS 모의는 <code>/paper</code>, 로컬 DEMO는{' '}
              <code>/trade?mode=demo</code>로 즉시 이동합니다.
            </p>
          </li>
          <li>
            <span className="portfolio-help-step-no">4단계</span>
            <h3>오늘의 운용 계획 및 진단 허브 활용</h3>
            <p>
              KIS 모의 상단의 <strong>오늘의 운용 계획</strong>에서 당일 장전 보고서 승인과 장후 결과 확인을 점검하고,
              하단 <strong>포트폴리오 분석 및 위험·배분 진단 허브</strong>에서 자산 구성 비율 바, 손익 기여도, 종목별
              한도 노출, 매도 가능 수량을 통합 확인합니다.
            </p>
          </li>
        </ol>
      </div>

      <div
        id={`${panelId}-panel-valuation-math`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-valuation-math`}
        tabIndex={activeTab === 'valuation-math' ? 0 : undefined}
        hidden={activeTab !== 'valuation-math'}
        className="portfolio-help-body"
      >
        <div className="portfolio-help-grid">
          <article className="portfolio-help-card">
            <h3>총 평가자산 vs KIS 계좌 총평가액(totalEquity)</h3>
            <p>
              화면의 <strong>총 평가자산</strong>은 <code>예수금 + 양수 보유 평가액 합계</code>로 일관 계산합니다. KIS API가
              내려주는 <code>totalEquity</code>(총평가액)는 결제·미수 반영 기준이 다를 수 있어 <strong>평가 기준과 자산
              배분</strong> 상세와 진단 허브에 참고값으로 분리 대조합니다.
            </p>
          </article>
          <article className="portfolio-help-card">
            <h3>종목 평가액 · 매입금액 · 평가손익 · 수익률</h3>
            <p>
              종목 평가액은 <code>현재가 × 보유수량</code>, 매입금액은 <code>원본 평균 매입가 × 보유수량</code>입니다.
              평가손익(<code>평가액 - 매입금액</code>)은 원 단위 반올림 시 <code>-0원</code>을 중립 <code>0원</code>으로
              정규화하며, 수익률은 <code>평가손익 ÷ 매입금액 × 100</code>(소수 2자리, <code>-0.00%</code> 방지)으로 산출합니다.
            </p>
          </article>
          <article className="portfolio-help-card">
            <h3>현금 · 주식·ETF · 종목 비중 100% 합산 불변식</h3>
            <p>
              현금 비중(<code>예수금 ÷ 총 평가자산</code>)과 각 종목 비중(<code>종목 평가액 ÷ 총 평가자산</code>)은 동일한
              분모(화면 총 평가자산)를 사용해 합계가 항상 100%에 수렴합니다. 하단 자산 구성 비율 바와 도넛 차트가 같은
              비중 값을 공유합니다.
            </p>
          </article>
          <article className="portfolio-help-card">
            <h3>소수점 평균 매입가 보존 및 0수량 잔고 제외(S5)</h3>
            <p>
              분할 매수로 소수점이 생긴 평균 매입가는 정수 정밀도를 잃지 않으면서 최대 소수 4자리까지 표시해 평가손익
              검산을 돕습니다. S5 연속조회 규약에 따라 보유수량이 <code>0</code>인 잔고 행은 평가·비중·표에서 자동 제외합니다.
            </p>
          </article>
        </div>
      </div>

      <div
        id={`${panelId}-panel-integrity-safety`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-integrity-safety`}
        tabIndex={activeTab === 'integrity-safety' ? 0 : undefined}
        hidden={activeTab !== 'integrity-safety'}
        className="portfolio-help-body"
      >
        <div className="portfolio-help-grid">
          <article className="portfolio-help-card">
            <h3>읽기 전용 무부작용(Zero-Mutation Read) 원칙</h3>
            <p>
              <code>/portfolio</code> 화면 진입, KIS/DEMO 환경 전환, 도움말 열기, 보유종목 검색·필터·정렬, 종목 상세
              링크 이동 과정에서는 자동 주문이나 상태 변경 <code>POST</code> 요청을 단 한 건도 발생시키지 않습니다.
            </p>
          </article>
          <article className="portfolio-help-card">
            <h3>전체 연속조회(complete) 완료 전 부분 합산 차단</h3>
            <p>
              다중 페이지 잔고 조회 중 일부 페이지만 성공한 <code>partial</code> 상태(<code>complete: false</code>)에서는
              부분 보유 합계를 절대 표시하지 않습니다. 기존에 확인된 전체 성공 스냅샷이 있으면 <strong>이전 전체 성공값 ·
              최신 아님</strong> 경고와 함께 보존합니다.
            </p>
          </article>
          <article className="portfolio-help-card">
            <h3>현재가 누락·총자산 0원 시 가짜 금액 대체 금지</h3>
            <p>
              보유종목 중 1개라도 현재가가 없거나(<code>price === null</code> 또는 <code>&lt;= 0</code>) 유효하지 않으면
              0원이나 가짜 손실로 채우지 않고 <strong>평가 불가</strong>·<strong>산출 불가</strong>로 표시합니다. 총 평가자산이
              0원일 때도 0 나누기를 막기 위해 비중을 산출하지 않습니다.
            </p>
          </article>
          <article className="portfolio-help-card">
            <h3>KST 관측 시각(observedAt) vs 최종 전체 성공(lastSuccessAt)</h3>
            <p>
              모든 기준 시각은 한국표준시(KST)로 통일해 표시합니다. <code>lastSuccessAt</code>은 전체 잔고 페이지가
              빠짐없이 확인된 마지막 시각이고, <code>observedAt</code>은 최근 조회 시도(실패·부분실패 포함)가 관측된
              시각으로 둘을 명확히 구분해 신선도를 판정합니다.
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
        className="portfolio-help-body"
      >
        <div className="portfolio-help-faq">
          <article className="portfolio-help-card">
            <h3>Q. 화면의 &apos;총 평가자산&apos;과 KIS API &apos;총평가액&apos;이 다를 수 있는 이유는 무엇인가요?</h3>
            <p>
              화면의 총 평가자산은 현재 조회된 예수금과 보유종목 평가액 합계를 직접 더해 비중 100% 일관성을 보장합니다.
              반면 KIS API <code>totalEquity</code>는 D+2 결제 예정금, 미수·대용금 등 증권사 내부 정산 항목을 포함할 수
              있어 참고값으로 별도 표기합니다.
            </p>
          </article>
          <article className="portfolio-help-card">
            <h3>Q. &apos;예수금/보유 현금&apos;과 실제 주문 가능 금액은 왜 다른가요?</h3>
            <p>
              KIS 모의 예수금은 결제 대기 자금이나 당일 미체결 매수 예약이 반영되기 전 금액일 수 있어 실제 주문 가능
              금액과 다릅니다. 로컬 DEMO 역시 보유 현금은 체결 시 차감되므로, 주문 시에는 미체결 매수 예약액과 예상
              수수료를 뺀 <strong>예약 제외 가용 현금</strong>을 기준으로 확인해야 합니다.
            </p>
          </article>
          <article className="portfolio-help-card">
            <h3>Q. 1종목만 현재가가 누락되어도 전체 평가 합계와 비중을 &apos;평가 불가·산출 불가&apos;로 표시하는 이유는 무엇인가요?</h3>
            <p>
              누락 종목을 0원으로 가정해 합산하면 전체 자산과 평가손익이 실제보다 과소 표시되고, 다른 종목 비중이
              왜곡됩니다. 잘못된 수치를 정상 합계처럼 보여주는 대신 누락 사실을 명시하고 전체 합계·비중을 보류합니다.
            </p>
          </article>
          <article className="portfolio-help-card">
            <h3>Q. KIS 모의 상단 &apos;오늘의 운용 계획&apos;과 &apos;장후 결과 확인&apos;은 어떻게 연동되나요?</h3>
            <p>
              KIS 모의 탭 상단에는 장전 보고서 패널이 연동되어 서버 규칙 판단, 공개 원문 브리핑, 당일 승인 차단 사유를
              확인하고 모의 운용을 승인할 수 있습니다. 장 마감 후에는 <strong>장후 결과 확인</strong> 버튼으로 계좌 변동과
              예측 대조 기록을 수동 마감할 수 있습니다.
            </p>
          </article>
          <article className="portfolio-help-card">
            <h3>Q. 보유종목을 클릭할 때 KIS 모의는 /paper, 로컬 DEMO는 /trade?mode=demo로 이동하는 이유는 무엇인가요?</h3>
            <p>
              환경 혼선을 막기 위해 실제 KIS 모의 주문·원장 대조·취소는 전용 화면(<code>/paper</code>)으로, 로컬 합성
              시세 기반 지정가 연습 주문은 DEMO 트레이딩(<code>/trade?mode=demo</code>)으로 이동 경로를 엄격히 분리했습니다.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
