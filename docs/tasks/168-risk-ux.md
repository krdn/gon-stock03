# 위험관리에서 사용량 확인과 신규 주문 제어

[페이지 이슈 #168](https://github.com/krdn/gon-stock03/issues/168) · [전체 진행 #149](https://github.com/krdn/gon-stock03/issues/149) · [기존 계약](11-risk-management.md) · [주문 UX 비교](147-orders-ux.md)

기준 main `04434fdb`, 작업 브랜치 `krdn/ux2-168-risk`. 4459의 독립 예시로 1440×900과 390×844에서 사용량·차단 이유 찾기, 일반 한도 변경과 위험관리 복귀, 신규 정지·재개 및 기존 주문 상태를 같은 조건으로 확인한다. 검토와 수용은 #168에서 추적한다.

## 대표 작업과 실측

브라우저 첫 화면에서 KIS 선택과 손실 결과가 보이지 않았고, KIS 보기에서 일반 한도를 저장한 뒤 명시적 복귀와 새로고침을 하면 DEMO로 돌아갔다. 같은 Chromium 예시로 측정했다. DEMO 보유 3종·삼성전자 미체결 매수 2주(14만원), KIS 미연결·당일 대조 기록 없음이다. 값은 문서 맨 위부터 대상 상단까지의 CSS px다.

| 대상 | PC 1440×900 전 → 후 | 모바일 390×844 전 → 후 |
|---|---:|---:|
| DEMO 첫 손실 사용량 | 1,281 → 502 | 1,767 → 551 |
| KIS 전환 버튼 | 1,166 → 445 | 1,605 → 496 |
| 전환 후 KIS 미확인 결과 | 1,384 → 499 | 1,899 → 548 |
| 일반 한도 편집 링크 | 617 → 412 | 921 → 718 |
| 신규 주문 정지 버튼 | 863 → 476 | 1,277 → 799 |

DEMO 결과는 진입 직후, KIS 결과는 전환 1회에 표시된다. 편집 링크 1회 → 금액 입력 1회 → 저장 1회 → 명시적 복귀 1회는 전후 동일하다. 변경 전에는 KIS로 다시 전환해야 했고, 변경 후에는 80만원으로 저장한 값과 KIS 선택을 함께 유지한다. 정지·재개는 각 1회다. 모바일 변경 후 버튼 하단은 843px이었다. PC·모바일의 문서 가로 넘침은 모두 0px였다. 사용자 체감 시간은 미측정이다. [행동·위치 측정값](../verification/assets/168-risk/measurements.json)

| 예시 화면 | 변경 전 | 변경 후 |
|---|---|---|
| PC | [DEMO](../verification/assets/168-risk/before-desktop-demo.png) · [KIS](../verification/assets/168-risk/before-desktop-kis.png) | [DEMO](../verification/assets/168-risk/after-desktop-demo.png) · [KIS](../verification/assets/168-risk/after-desktop-kis.png) |
| 모바일 | [DEMO](../verification/assets/168-risk/before-mobile-demo.png) · [KIS](../verification/assets/168-risk/before-mobile-kis.png) | [DEMO](../verification/assets/168-risk/after-mobile-demo.png) · [KIS](../verification/assets/168-risk/after-mobile-kis.png) |

## 결정과 근거

- **개선** — 손실과 환경 선택을 앞으로 옮겼다. 선택은 버튼의 눌림 상태와 URL로 표현한다. KIS는 `/risk?env=kis`, 기본·알 수 없는 값은 DEMO다. 일반/전용 설정의 두 복귀 링크는 `from=risk`에서 `env=kis`만 허용한다. 메인이 배정한 두 링크는 #160에서도 고정 `/risk`였으며 통합 후보 확인은 메인이 맡는다.
- **유지** — 전역 경고, 서버의 공통 한도·정지 검사, 기존 주문 보존, 불명·전송 중 재개 금지, 재개 후 전략 개별 시작, 종목 표와 최근 이벤트. 선택한 환경과 공통 제어의 제목을 나눴다. KIS 시세나 미체결 매수 가격이 없으면 해당 금액은 미확인이다.
- **상세로 이동** — 손실 산식 1줄은 수치 곁에 두고, 기준 자산·마지막 전체 잔고/주문 대조 시각·예약액 산입 및 한도 적용 방식은 키보드로 여는 상세에 담았다.
- **제거** — 편집 링크만 있는 큰 공간과 미확인 사유를 한 문장으로 뭉친 안내. 잔고 상태·주문 대조 시각·불명 주문에 따라 설정 또는 대조 경로를 표시한다. 기존 주문과 정지 효과를 설명하고 KIS 화면에서 주문 상태를 확인하도록 연결했다.
- **설계 리뷰 이견** — Gemini는 원장·잔고·주문 시세가 불완전할 때 재개 조건을 서버와 맞추라고 지적했다. 서버는 불명·전송 중을 검사한다. 잔고 일부 수신·과거 대조는 사용량을 숨기고, 로컬 원장 부재·불명은 재개를 막는 기존 계약을 보존했다. URL에 연결된 환경 스위치는 Tab과 Space/Enter를 지원하는 버튼 그룹으로 유지했다. 타 페이지의 취소 문구는 그 페이지 소유자가 검토한다.

Graphify의 `src_pages_operations_risk`와 `server_paper_paperbroker_risksnapshot`에서 연결을 찾고 원문을 대조했다. App은 `GET /api/state`를 읽어 Workbench에 제공하고, HTTP 서버는 Store의 작업 상태 및 PaperBroker의 주문 캐시·불명 건수·날짜별 저장 기준을 돌려준다. 한도 저장과 정지는 `POST /api/risk` 및 `/api/risk/halt`에서 검사하고 Store.update가 SQLite workspace에 기록한다. 위험관리 화면을 읽는 중 KIS 요청은 0건이었다. [UI](../../src/pages/Operations.tsx) · [상태 조회·변경](../../server/http.ts) · [대조 결과](../../server/paper.ts) · [저장](../../server/store.ts)

## 검증과 수용

4459의 실행 앱과 전용 예시 SQLite에서 키보드 전환, URL 직접 진입, 새로고침, 뒤로·앞으로, 한도 100만 → 80만 → 100만원 저장과 KIS 복귀, 정지 → 새로고침 → 재개를 두 화면 크기로 확인했다. 최종 한도 100만원·정지 해제·전략 비활성·예시 미체결 주문 1건을 확인했다. 실제 거래 요청은 0건이다. [DEMO 예시 열기](http://127.0.0.1:4459/risk) · [KIS 예시 열기](http://127.0.0.1:4459/risk?env=kis)

지정 Gemini 4 Neon High의 설계 리뷰는 완결 응답 SUCCESS를 수신했다. 설계 실행기의 종료 코드는 143이었다. 코드와 예시만 별도 임시 디렉터리에서 검토했고 CLI 초기화 모델은 `gemini-4-neon-high`였다. 제공자 내부 실행 모델과 강도는 별도 미확인이다. 실계좌·실제 장중 동작은 미측정이며 이번 변경의 사용자 직접 수용은 대기 중이다.

구현 리뷰 첫 호출은 init 후 종료 코드 143으로 완결 응답이 없었다. 같은 모델로 재호출해 SUCCESS 응답과 **FAIL** 판정(P1 1건·P2 5건)을 받았다. 재개 버튼에 정지 설명이 붙는 문제, 초기 로딩과 실패 혼동, 보유하지 않은 종목의 이름, 동시 손실·정지 사유, 버튼 크기와 읽기 범위를 수정했다. 400 응답은 App.act가 이미 전역 경고로 표시하는 것을 브라우저에서 재현해 확인했다. 주문 가격 누락은 상태 스키마에서 거부하고, 가격 0은 예약액 미확인으로 표시한다.

최종 로컬 빌드(TypeScript 포함), Chromium 위험관리 13건·공통 상태 12건, 전용 DB 동작 확인이 통과했다. 중간 실행에서 임시 서버가 종료돼 7건이 연결 거부로 실패했다. 4459 예시 서버를 사용자 서비스로 띄운 후 같은 검사를 통과했다. Graphify는 코드에서 1,553노드·3,611연결로 재생성했다. CSS 파일은 Graphify 분석기가 분류하지 않아 브라우저에서 검증했다.

같은 지정 모델의 수정분 리뷰는 **PASS**, 잔여 차단 지적 0건이었다. [검토 응답 요약](../verification/assets/168-risk/review.json) · 초안 PR과 최종 원격 CI는 [페이지 이슈 #168](https://github.com/krdn/gon-stock03/issues/168)에서 확인한다.
