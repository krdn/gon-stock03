# 현재 주문·체결 조회

모바일에서 미체결 DEMO 주문의 잔량과 취소 버튼, 현재 KIS 원장의 부분체결 수량과 저장된 확인 시각을 첫 화면에서 확인할 수 있다. 로컬 서버에 처음 연결하지 못한 경우 DEMO 주문 수를 미확인으로 표시한다. [이슈 #151](https://github.com/krdn/gon-stock03/issues/151) · [상위 #149](https://github.com/krdn/gon-stock03/issues/149) · [지난 주문 기준 #147](147-orders-ux.md)

## 같은 주문으로 비교한 결과

기준 main `04434fdb`와 변경 빌드를 Chromium에서 열었다. 4452의 전용 SQLite에 합성 DEMO 2건, 현재 KIS 2건, 지난 실행 1건을 구성했다. 아래 숫자는 첫 화면 위에서부터의 CSS px다. 취소·복구 위치는 버튼이나 링크의 윗변이다.

| 대표 작업 | PC 1440×900 전 → 후 | 모바일 390×844 전 → 후 |
| --- | --- | --- |
| 삼성전자 DEMO 미체결 2주 첫 행 / 취소 | 899 → 610 / 916 → 626 | 1,222 → 632 / 1,266 → 726 |
| 현재 KIS 부분체결 1주·잔량 2주 첫 행 / KIS 확인 | 661 → 461 / 696 → 488 | 710 → 386 / 935 → 459 |
| 현재 KIS 원장·복구 링크 | 696 → 478 | 995 → 480 |
| 정상 0건에서 DEMO 연습 / 현재 KIS의 지난 실행 버튼 | 1,016 → 637 / 643 → 489 | 1,319 → 677 / 673 → 431 |
| 지난 실행 KODEX 200 첫 행 / KIS 확인 | 402 → 402 / 440 → 440 | 365 → 365 / 459 → 459 |

DEMO 취소 버튼을 볼 때 PC는 세로 스크롤 1회에서 0회, 모바일은 세로 1회와 표 안 가로 1회에서 각각 0회가 됐다. 모바일 KIS 복구 링크는 세로 1회에서 0회가 됐다. 휠 입력당 600px로 비교했다. 현재 원장 다시 읽기는 1회 클릭으로 로컬 GET 1회, 지난 주문 식별자 확인은 주문 상세 열기 1회다. 상태 필터는 버튼 1회에서 기본 선택 상자 열기와 항목 선택 2단계로 바뀌었다. 사용자 체감 시간은 미측정이다.

| 보기 | PC 전 / 후 | 모바일 전 / 후 |
| --- | --- | --- |
| DEMO | [전](../verification/assets/151-orders/before-desktop-demo.png) / [후](../verification/assets/151-orders/after-desktop-demo.png) | [전](../verification/assets/151-orders/before-mobile-demo.png) / [후](../verification/assets/151-orders/after-mobile-demo.png) |
| 현재 KIS | [전](../verification/assets/151-orders/before-desktop-kis.png) / [후](../verification/assets/151-orders/after-desktop-kis.png) | [전](../verification/assets/151-orders/before-mobile-kis.png) / [후](../verification/assets/151-orders/after-mobile-kis.png) |
| 지난 실행 | [전](../verification/assets/151-orders/before-desktop-history.png) / [후](../verification/assets/151-orders/after-desktop-history.png) | [전](../verification/assets/151-orders/before-mobile-history.png) / [후](../verification/assets/151-orders/after-mobile-history.png) |

## 판정과 동작

- **개선.** 세로 통계 카드 3개를 한 줄로 줄이고, 핵심 열은 PC 표와 모바일 행에서 같은 순서로 읽는다. DEMO 첫 연결 실패와 확인된 0건을 구분한다. 성공 후 연결이 끊기면 이전 주문을 표시하고 취소와 다음 봉 재생을 비활성화한다.
- **상세로 이동.** DEMO 주문 시각·ID·수수료·출처와 KIS 주문일·식별자를 키보드로 여는 주문 상세에 넣었다. KIS 미제공 항목과 확인 시각의 정의는 원장 정보에서 읽을 수 있다.
- **제거.** 첫 주문 위의 긴 설명과 상태 버튼 묶음을 걷어냈다. 종목 검색과 모든 기존 상태는 유지한다. 정상 읽기 완료 시각은 목록 아래에 한 번 표시하고, 읽기 실패와 이전 원장 경고는 행 위에 표시한다.
- **유지.** 미체결 DEMO의 취소, 다음 봉 재생, KIS의 읽기 전용 목록 및 원장·복구 이동을 보존했다. 재생 동작은 조건에 따라 주문 상태를 바꾸므로 목록 아래에서 효과를 설명한다. KIS 목록의 재조회는 브로커 확인 시각을 갱신하지 않는다.
- **관측 검토와 이견.** Gemini는 두 화면의 첫 결과 압축과 식별자 상세 이동을 지지했다. 운영자의 상태 전환은 기존 버튼이 한 단계 빠르다. 좁은 폭과 8개 상태의 탭 이동을 고려해 기본 선택 상자를 채택했다. 복구 링크는 정상 행에서도 한 번에 이동하도록 유지하고 높이를 PC 16→36px, 모바일 24→36px로 늘렸다.

## 검증과 미리보기

Graphify에서 `Orders → OrderList → useWorkbench`, `makeServer → Store.displayPaperOrders → displayOrders`, `orderHistory → displayOrders`를 조회했다. UI에서 DB까지 HTTP 경계를 넘는 방향 경로는 그래프에 없어 원문으로 대조했다. DEMO는 `GET /api/state`의 `workspace`, KIS는 `GET /api/kis/ledger`의 `paper_orders`와 주문별 대조 근거, 지난 기록은 `GET /api/kis/history`의 등록 예시 원장을 읽었다. [UI](../../src/pages/Trading.tsx) · [HTTP](../../server/http.ts) · [저장 원장과 대조 시각](../../server/order-history.ts)

Chromium에서 최초 실패, 0건, 부분체결, 미확인과 불명, 실패 후 이전 행, 응답 경합, 필터 조합, 키보드 상세, URL·새로고침·뒤로가기를 검사했다. KODEX 200 전량 체결·잔량 0주 예시의 10:20:55 KST는 다시 읽은 후에도 같았고 식별자 검색 원문은 URL에 남지 않았다. 두 환경 및 지난 실행의 조회·이동·상세 흐름에서는 로컬 GET 세 경로만 관찰했다. DEMO 취소 경합 테스트의 쓰기는 브라우저 내 예시 응답으로 처리했다. [주문 브라우저 검사](../../tests/browser/orders.spec.ts)

[DEMO 미리보기](http://127.0.0.1:4452/orders) · [현재 KIS](http://127.0.0.1:4452/orders?view=kis) · [지난 실행](http://127.0.0.1:4452/orders?view=history). 이 호스트의 전용 fixture로 제공한다. 계좌 자격 증명과 실행 승인 없이 기존 서버와 빌드 산출물을 사용했다. 실제 거래와 사용자 직접 화면 수용은 미검증이다.

Gemini 4 Neon High의 관측 검토와 구현 검토가 응답했고, 구현 판정은 PASS였다. 지적된 두 상태 경계를 반영했다. DEMO 최초 로딩과 실패 문구를 나눴고, 이전에 0건이었던 KIS 원장을 다시 읽지 못하면 이전 0건과 현재 미확인을 함께 표시한다. 모바일 상세를 펼쳐도 버튼 위치가 유지되도록 조정했으며 키보드 포커스 대비와 모바일 열 이름의 CSS 호환성을 보완했다. 날짜 검색의 빈 주문일 방어 제안은 입력 스키마에서 8자리를 검증하므로 추가하지 않았다. 호출 초기화 모델은 `gemini-4-neon-high`였다. 서버 내부 모델·추론 강도는 미확인이다. 수정분 모델 판정과 원격 CI는 [이슈 #151](https://github.com/krdn/gon-stock03/issues/151)에 기록한다.

로컬 최종 결과는 타입 검사·빌드, 관련 Chromium 20건과 주문 단위 3건 통과다. 현재 두 보기에서 320~1440px 사이 12개 폭에 대해 상세를 열고 닫아 문서와 표의 가로 넘침이 없는 것도 확인했다.
