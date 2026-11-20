# 관심종목에서 시세를 확인하고 트레이딩으로 이동

[배정 #169](https://github.com/krdn/gon-stock03/issues/169) · [전체 #149](https://github.com/krdn/gon-stock03/issues/149) · [기존 관심종목 #20](20-watchlist.md) · [안내 지도 #143](https://github.com/krdn/gon-stock03/issues/143) · [주문 UX 비교](147-orders-ux.md)

공유 페이지의 기준은 [시장 탐색 PR #167](https://github.com/krdn/gon-stock03/pull/167)의 `da1d5ef`다. 작업 브랜치는 `krdn/ux2-169-watchlist`, PR 대상은 `krdn/ux2-161-market`이다. 상위 기준 main은 `04434fd`이며 주문 비교 사례 [PR #146](https://github.com/krdn/gon-stock03/pull/146)과 [#148](https://github.com/krdn/gon-stock03/pull/148)은 병합됐다.

## 전후 실측

4457의 같은 전용 SQLite에서 예시 반도체 005930과 마스터 미확인 888888을 저장한 상태로 시작했다. 두 해상도에서 시장 탐색으로 이동해 예시 지수 ETF 069500을 등록하고, 관심목록에 다시 들어와 새로고침으로 3개를 확인했다. 선택한 코드 복사와 트레이딩 전달을 확인한 후 해제하고 새로고침해 2개를 확인했다. 코드 복사 결과는 전후 모두 `069500`이었다.

| 작업 | PC 1440×900 | 모바일 390×844 |
| --- | --- | --- |
| 첫 행 y / 행 높이 | 770 / 112 → 588 / 91px | 1001 / 156 → 651 / 136px |
| 069500 검색 후 상세 버튼 x, y | 1146, 797 → 294, 611px | 423, 1026 → 35, 659px |
| 가로로 숨은 표 영역 | 0 → 0px | 150 → 0px |
| 상세에서 선택한 코드의 트레이딩까지 | 메뉴·코드 입력·조회 3회 → 링크 1회 | 메뉴 열기 포함 4회 → 링크 1회 |
| 코드 복사 / 닫기 버튼 | 각 1회 → 1회 | 각 1회 → 1회 |

좌표는 문서 시작점 기준 CSS 픽셀이다. 스크롤과 개별 글자 입력은 행동 수에서 제외했다. 등록은 ‘시장 탐색에서 추가’, 코드 입력, 별표 선택의 3개 행동이며 해제는 별표 선택 1회다. 변경 전에는 Escape가 동작하지 않았고 새로고침 시 상세와 검색이 사라졌다. 변경 후 트레이딩에서 뒤로가면 선택한 상세에 초점이 돌아오며, 새로고침 뒤 Escape를 눌러도 원래 종목으로 복귀한다.

- [PC 목록 전](../verification/assets/169-watchlist/before-desktop-list.png) · [후](../verification/assets/169-watchlist/after-desktop-list.png) · [상세 전](../verification/assets/169-watchlist/before-desktop-detail.png) · [후](../verification/assets/169-watchlist/after-desktop-detail.png)
- [모바일 목록 전](../verification/assets/169-watchlist/before-mobile-list.png) · [후](../verification/assets/169-watchlist/after-mobile-list.png) · [상세 전](../verification/assets/169-watchlist/before-mobile-detail.png) · [후](../verification/assets/169-watchlist/after-mobile-detail.png)
- [실측 원본 전](../verification/assets/169-watchlist/before.json) · [후](../verification/assets/169-watchlist/after.json) · [빈 목록](../verification/assets/169-watchlist/empty-mobile.png) · [부분 수집](../verification/assets/169-watchlist/partial-mobile.png) · [최초 연결 실패](../verification/assets/169-watchlist/unconfirmed-mobile.png) · [저장 실패](../verification/assets/169-watchlist/save-error-mobile.png)

## 결정

| 구분 | 근거와 화면 동작 |
| --- | --- |
| 유지 | 확정된 관심목록·코드 복사 피드백·표시 종목 순차 조회·마지막 수신 시각과 실패 시 지연 표시를 유지했다. 미확인·제외 종목은 이전 캐시가 있어도 가격을 숨긴다. |
| 개선 | 종목명 버튼에 선택 표시와 펼침 상태를 제공한다. 검색·필터·페이지는 현재 URL을 바꾸고 상세를 처음 열 때 이력을 추가한다. 빈 목록, 현재 조건에서 결과 없음, 제외 코드, 마스터 부분 수집, 로컬 저장 미확인을 구분한다. |
| 상세로 이동 | 종목명으로 연 상세에서 복사, 수신 시각, 시세 실패 원인·거래량과 트레이딩을 확인한다. 마스터 출처·갱신 주기는 목록 아래 펼침에 모으고 마스터 오류·부분 수집 재시도는 펼치지 않아도 보인다. |
| 제거 | 중복 ‘보기’ 버튼과 1페이지뿐일 때의 양쪽 비활성 페이지 버튼을 없앴다. 모바일에서는 행을 화면 폭에 맞춰 상세·시세 상태·관심 해제에 가로 스크롤이 필요 없게 했다. |

Gemini 4 Neon High 관측 검토의 모바일 재배치·Escape·누락된 트리거 복귀·제외 코드 안내·신선도 즉시 표시를 채택했다. 주문 링크를 상세로 옮기는 안은 기존 1회 이동을 늘리므로 행에 두었다. 영숫자 코드 복사는 보존하고 트레이딩의 숫자 6자리 조건은 상세에 안내한다. 미확인·제외 코드에는 트레이딩과 주문 링크를 제공하지 않는다. Escape는 상세 안에서만 처리해 검색 입력을 방해하지 않는다.

## 코드와 검증 경계

Graphify에서 `MarketExplorer → useWorkbench`, `makeServer → masterData`, `Trade → LiveTrading`을 찾았다. UI에서 저장 트랜잭션으로 가는 방향 경로는 HTTP 경계에서 끊겨 원문으로 확인했다. 관심 별표가 `act('watchlist')`를 호출하면 `POST /api/watchlist`가 SQLite의 `workspace.body.watchlist`를 트랜잭션으로 갱신한다. 화면은 `GET /api/state`에서 확인한 목록을 표시한다. 마스터는 저장된 `market_instruments`, `market_removed`, `market_master`에서 읽고 시세는 별도 조회한다. 트레이딩은 `/trade?code=069500`의 값을 시세 입력에 반영한다. [화면](../../src/pages/MarketExplorer.tsx) · [상태 재조회](../../src/App.tsx) · [HTTP](../../server/http.ts) · [SQLite](../../server/store.ts) · [트레이딩](../../src/pages/LiveTrading.tsx)

[검토 화면](http://127.0.0.1:4457/watchlist)에는 예시 반도체와 마스터 미확인 종목 2개가 있다. 영구 저장하는 독립 예시 DB를 사용하고 서버를 재시작한 뒤 같은 2개가 남는 것을 확인했다. 정상 시장 2개·예시 마스터 4종목이며 KIS 미연결, 외부 fetch 차단, 주문 0건·실행 전략 0개다. 오류·부분·빈 화면 캡처에는 같은 미리보기의 브라우저 응답 대체를 사용했다. [상태별 관측](../verification/assets/169-watchlist/states.json) · [독립 회귀](../../tests/browser/watchlist-169.spec.ts)

브라우저 회귀는 시장·기존 관심종목 24건과 이슈 전용 6건, 총 30건이 통과했다. 최초 실행에서 빠른 뒤로가기 후 URL만 목록으로 돌아가고 상세가 남는 현상을 재현했다. 브라우저 이력 변경을 관심 화면에 반영한 뒤 같은 PC 시나리오를 10회 연속 통과했다. 초기 마스터가 지연된 경우에는 분류 판정을 보류하고, 해제에 성공하면 열린 종목의 URL을 정리하며, 저장 0개와 마스터 실패·검색 필터를 각각 표시한다. 이 세 가지는 Gemini 구현 리뷰 지적을 반영한 결과다. 관측 검토와 구현 리뷰의 CLI 초기화 모델은 `gemini-4-neon-high`였고 서버 내부 모델·강도는 별도 미확인이다. 수정분 검토·CI는 이슈에 연결한다.

빌드에서 TypeScript와 Vite가 통과했다. Graphify 갱신 결과는 1,567노드와 3,641연결이다. Orca의 이 작업 공간에도 검토 화면을 열어 저장 2개와 ‘미수신 · 조회 실패’ 및 ‘마스터 미확인’을 확인했다.

사용자 직접 화면 수용, 장중 시세·주문과 보조기기 이용자의 실측은 미확인이다. 기술 검증과 원격 CI 결과는 [이슈 #169](https://github.com/krdn/gon-stock03/issues/169)에 기록한다.
