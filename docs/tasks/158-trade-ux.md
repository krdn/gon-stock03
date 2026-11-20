# 트레이딩에서 시세 확인과 DEMO 주문

[작업 #158](https://github.com/krdn/gon-stock03/issues/158) · [상위 #149](https://github.com/krdn/gon-stock03/issues/149) · [1차 수용 #12](12-trading.md) · [주문 UX 사례](147-orders-ux.md)

기준 main `04434fdbd44b3eb7cc169e651fdd537086f7e568`. [시세 예시](http://127.0.0.1:4455/trade?code=000660&range=100)에서 100일봉을 선택하고 모의 주문 화면으로 이동하면 같은 종목이 열린다. 뒤로가거나 새로고침해도 선택한 범위가 남는다. [DEMO 입력](http://127.0.0.1:4455/trade?mode=demo&code=000660)에서는 합성 가격과 수량을 확인한 뒤 [DEMO 원장](http://127.0.0.1:4455/orders?view=demo)을 연다. 4455의 가격·잔고·일봉·주문은 모두 격리 예시다. 실행 중인 검토본은 페이지 제목 옆에 ‘격리 예시’를 표시한다.

## 변경 전후

같은 예시 가격·100개 일봉·한국 시각을 제공한 Chromium에서 삼성전자 → SK하이닉스 선택, 20·60·100일봉, 새로고침, 모의 매매 이동과 뒤로가기, 갱신 실패, DEMO 65,000원 × 2주 확인 → 원장 열기를 수행했다. 숫자는 문서 위에서 잰 요소의 상단 좌표(px)다. 모바일·PC 모두 지정가와 수량을 먼저 읽고 입력 순서대로 Tab을 누를 수 있다.

|항목|PC 1440×900 전 → 후|모바일 390×844 전 → 후|
|---|---:|---:|
|현재가 / 서버 수신 시각|747 → 566 / 813 → 616|909 → 624 / 971 → 670|
|일봉 선택 / 모의 주문 화면 링크|864 → 717 / 656 → 650|1,022 → 792 / 1,619 → 726|
|DEMO 지정가 / 수량|778 → 689 / 861 → 689|1,748 → 798 / 1,831 → 798|
|DEMO 주문 확인 버튼|1,320 → 1,072|2,290 → 1,181|
|접수 뒤 DEMO 원장 열기|메뉴 1회 → 직접 링크 1회|메뉴 2회 → 직접 링크 1회|

- PC 시세 [전](../verification/assets/158-trade/before-desktop-live.png) · [후](../verification/assets/158-trade/after-desktop-live.png), DEMO 입력 [전](../verification/assets/158-trade/before-desktop-demo.png) · [후](../verification/assets/158-trade/after-desktop-demo.png), 확인창 [전](../verification/assets/158-trade/before-desktop-confirm.png) · [후](../verification/assets/158-trade/after-desktop-confirm.png).
- 모바일 시세 [전](../verification/assets/158-trade/before-mobile-live.png) · [후](../verification/assets/158-trade/after-mobile-live.png), DEMO 입력 [전](../verification/assets/158-trade/before-mobile-demo.png) · [후](../verification/assets/158-trade/after-mobile-demo.png), 확인창 [전](../verification/assets/158-trade/before-mobile-confirm.png) · [후](../verification/assets/158-trade/after-mobile-confirm.png).

## 설계 판단과 근거

- **유지** — 선택 종목을 `/paper?code=…`로 넘기는 읽기 링크, 종목별 요청 취소, DEMO 시세 재확인·한도·미확인 요청 보존. 첫 조회 실패에는 가격이 비고, 갱신 실패에는 이전 가격과 복구 동작이 보인다. 주문 확정 전에 Esc로 닫고 다시 열어도 입력과 초점이 유지된다.
- **개선** — KRX 현재가 옆에 서버 시세 수신 시각(KST)과 체결 시각 미제공을 표시한다. 일봉에는 실제 반환 건수와 마지막 거래일을 표시한다. 100일을 선택하고 3건만 받으면 3개로 표시한다. 범위 변경은 현재 URL을 교체하며 추가 시세 요청은 0건이다. DEMO 주문 입력과 결과·원장 링크를 합성 차트 앞에 놓았다.
- **상세로 이동** — 종목코드 직접 입력(유효하지 않은 코드에서는 펼침), 부가 시세 정보·자동 갱신 주기, DEMO 보유수량·한도·비용 설명. 실패 원인과 미확인 경고, 실제 매도 가능 수량은 계속 본문에서 확인한다.
- **제거** — 선택 종목·가격 출처의 반복 표시와 한 가지 옵션만 있던 비활성 주문유형 선택기. 지정가와 로컬 접수 사실은 입력·확인창에 남겼다.
- **설계 리뷰 이견** — Gemini가 제기한 단말 시각 오판은 ±120초에서 재현했다. 개별 화면은 공통 `serverNow`를 재사용한다. 공통 시계는 서버 관측 후 경과를 갱신하고, 로컬 상태가 부분 실패하면 이전 가격과 재조회 차단을 함께 표시한다. Gemini가 우려한 오래된 값의 주문 전송 경로를 원문에서 확인했다. 실제 시세 화면의 링크는 종목만 전달하고, KIS 주문 검토는 모의 매매 페이지에서 시작한다.

## 확인 경로와 한계

Graphify의 `path Trade LiveTrading`, `explain LiveTrading`, `explain TradeForm`, `explain placeOrder`와 원문을 대조했다. `TradeForm → placeOrder` 전체는 방향 그래프에 나타나지 않았다. 실제 시세는 `LiveTrading → POST /api/kis/market → KisClient.quote/bars`에서 현재가 수신 시각과 거래일을 구분하고 화면에 보관한다. DEMO는 `TradeForm → act('orders') → POST /api/orders → Store.update(placeOrder) → /api/state → /orders?view=demo`로 로컬 원장에 남는다.

- Chromium 페이지 회귀 40건, 공통 상태·가격 보존 관련 회귀 13건, TypeScript·Vite 빌드 통과. 코드 불일치·빈 가격과 일봉·오류/재조회·부분 상태·응답 유실, 선택/입력/대화상자 키보드, URL/새로고침/뒤로가기, 종목 전달을 검사했다. 첫 테스트에서 종목 선택의 접근 가능한 이름을 수정했고 Esc 직후 재열림 실패를 수정한 뒤 해당 검사를 연속 4회 통과했다.
- 시세 판정만 격리하도록 로컬 상태 만료를 길게 한 예시에서 단말 −120/0/+120초 모두 새 시세는 정상, 45초 전 값은 이전 수신값이었다. 기존 제품은 −120초에서 이전 값을 정상, +120초에서 새 값을 오래됨으로 표시했다. 30초 시세 만료 경과도 별도로 확인했다.
- 기준 main의 공통 상태 만료(10초)를 그대로 적용하면 −120/0초에서는 시세 조회 1회, +120초에서는 공통 상태가 먼저 만료되어 조회 0회다. 공통 시계 변경과 결합한 기본 설정의 전체 동선은 [#157](https://github.com/krdn/gon-stock03/issues/157) 통합 검증 대상으로 남긴다.
- 4455의 별도 메모리 DB에 화면에서 로컬 DEMO 주문 한 건(000660, 65,000원 × 2주)을 접수했다. 요청은 `POST /api/orders` 1회였고 원장 새로고침 후 미체결 1건, 재생 꺼짐, KIS 연결·자격증명 미설정이었다. [시세 조회 실패 예시](http://127.0.0.1:4455/trade?code=999999). 서버 교체 시 재현하려면 빌드 후 빈 환경에서 `STOCK_DB=:memory:`, `STOCK_PORT=4455`와 [예시 진입점](../verification/assets/158-trade/preview.ts)을 사용한다.
- Gemini 4 Neon High의 관측 설계 검토와 구현 검토를 각각 격리 디렉터리에서 수행했다. 구현 검토는 PASS와 경미한 2건을 반환했다. DEMO 차트의 표본 수·빈 상태와 주문 버튼에 연결되는 저장소/미확인 차단 사유를 수정하고 회귀로 확인했으며 같은 모델의 수정분 재검토도 PASS였다. 미사용 import 지적은 같은 파일의 Orders에서 사용됨을 확인해 유지했다. 호출 초기 메타데이터의 모델은 `gemini-4-neon-high`이고 최종 응답은 SUCCESS였다. 별도의 서버측 실행 모델·effort는 결과에 제공되지 않았다.
- 4303 적용, 실제 KIS 관측, 사용자 직접 수용, 체감 시간은 미검증이다.
