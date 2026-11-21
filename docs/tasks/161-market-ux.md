# 시장 탐색에서 종목을 찾아 트레이딩 열기

[배정 #161](https://github.com/krdn/gon-stock03/issues/161) · [전체 #149](https://github.com/krdn/gon-stock03/issues/149) · [기존 시장 탐색 #10](10-market-explorer.md) · [안내 지도 #143](https://github.com/krdn/gon-stock03/issues/143) · [주문 UX 비교 사례](147-orders-ux.md)

기준 main은 `04434fdbd44b3eb7cc169e651fdd537086f7e568`이다. [PR #146](https://github.com/krdn/gon-stock03/pull/146)과 [PR #148](https://github.com/krdn/gon-stock03/pull/148)의 병합·CI를 확인했다. 이 작업의 브랜치는 `krdn/ux2-161-market`이다.

## 같은 종목으로 확인한 변경 전후

전용 포트의 같은 SQLite 예시 마스터 10종목에서 ‘예시 지수’를 입력하고 ETF를 선택했다. 결과 ‘예시 지수 ETF’의 상세를 열어 트레이딩의 실제 시세 종목코드까지 확인했다. 변경 전에는 트레이딩 메뉴가 기본 코드 005930을 열어 069500을 다시 입력하고 조회했다. 변경 후에는 상세의 ‘트레이딩에서 시세 보기’ 한 번으로 069500에 도달했다.

| Chromium 화면 | 검색창 y | 첫 결과 행 y | 필터링한 첫 행의 상세 버튼 x, y | 트레이딩 도달 행동 |
| --- | --- | --- | --- | --- |
| PC 1440×900 | 743 → 451 | 880 → 573 | (1277, 918) → (294, 607) | 6 → 4 |
| 모바일 390×844 | 895 → 510 | 1064 → 636 | (449, 1123) → (35, 644) | 7 → 4 |

좌표는 문서 시작 기준 CSS 픽셀이다. 검색어 입력 전체, 필터 선택, 상세 열기, 링크·메뉴 열기, 코드 재입력, 조회를 각각 한 행동으로 셌다. 스크롤과 개별 키 입력은 제외했다. 변경 전 모바일에서는 메뉴 열기가 한 번 더 필요했다. 사용자 체감 시간은 미측정이다.

- [PC 변경 전](../verification/assets/161-market/before-desktop-list.png) · [변경 후](../verification/assets/161-market/after-desktop-list.png) · [이전 상세](../verification/assets/161-market/before-desktop-detail.png) · [현재 상세](../verification/assets/161-market/after-desktop-detail.png)
- [모바일 변경 전](../verification/assets/161-market/before-mobile-list.png) · [변경 후](../verification/assets/161-market/after-mobile-list.png) · [이전 상세](../verification/assets/161-market/before-mobile-detail.png) · [현재 상세](../verification/assets/161-market/after-mobile-detail.png)
- [변경 전 단계·좌표](../verification/assets/161-market/before.json) · [변경 후 단계·좌표와 뒤로가기·새로고침](../verification/assets/161-market/after.json)

## 화면에서 내린 결정

| 구분 | 결정과 이유 |
| --- | --- |
| 유지 | 현재 페이지 최대 8종목 순차 조회, 숨긴 탭 일시정지, 지연·미수신·정지·정리매매·마스터 제외와 이전 수신 시각을 유지했다. 가격을 확인할 수 없을 때는 ‘—’를 표시한다. |
| 개선 | 검색·필터 바로 아래에 결과를 표시한다. 종목명 버튼이 상세를 연다. 모바일 표는 한 줄 폭에 맞춰 종목과 가격·상태가 보인다. 정상적인 빈 결과, 전체 마스터 확인 전, 수집 오류와 이전 목록을 구별하고 조건 지우기와 재시도를 제공한다. |
| 상세로 이동 | 3개 시장 분류별 건수와 거래소별 수집 시각·갱신 주기는 ‘마스터 출처와 시세 갱신 기준’에 모았다. 상세에서 업종·상태·수신 시각·거래량을 보고 트레이딩으로 간다. 모바일에서 숨긴 등락률과 거래량도 여기에서 읽을 수 있다. |
| 제거 | 목록 위의 분류 요약 카드 3개와 중복 ‘보기’ 버튼을 제거했다. ‘마스터 갱신’은 수집 오류·부분 상태에서 펼침 없이 접근한다. |

관측 검토에서 Gemini가 제안한 짧은 목록, 단일 DOM, URL 복원과 포커스 복귀를 채택했다. 입력·필터·페이지는 현재 이력을 갱신하고 상세 최초 열기는 이력을 추가한다. 숫자 6자리 종목은 정지·정리매매여도 시세를 읽을 수 있으므로 해당 거래 상태와 함께 시세 링크를 유지했다. 영숫자 코드는 트레이딩의 숫자 6자리 제약을 안내하고, 마스터 제외 종목은 제외 시각과 사유 확인 안내를 남긴다. 상세는 문서의 영역으로 제공하고 Enter·Space 또는 닫기 버튼·Escape로 조작한다. 공통 환경 상태에 이미 있는 계좌 미연결 표시를 시장 요약에 반복하지 않았다.

## 경로와 검증

Graphify에서 `Market→MarketExplorer→useWorkbench`, `makeServer→Store.masterData`, `Trade→LiveTrading`을 찾았다. MarketExplorer에서 Store까지의 방향 경로 검색은 HTTP 경계를 연결하지 못했다. 원문에서 `GET /api/data/master`가 SQLite의 `market_master`, `market_instruments`, `market_removed`를 읽고, 시세는 `POST /api/market/quote`가 현재 마스터 코드만 `kis.quote`로 전달하는 것을 확인했다. 시세는 화면 상태에 보관한다. 트레이딩은 `/trade?code=069500`의 값을 직접 받아 시세를 조회한다. [시장 페이지](../../src/pages/MarketExplorer.tsx) · [요청 처리](../../server/http.ts) · [SQLite 읽기](../../server/store.ts) · [트레이딩](../../src/pages/Trading.tsx)

[4454 검토 화면](http://127.0.0.1:4454/market)에서는 합성 마스터와 실제 KIS 미연결 상태를 본다. 기존 서버와 빌드 산출물, 외부 fetch 차단, 빈 자격 환경과 작업 전용 임시 DB를 사용한다. 캡처의 종목은 모두 ‘예시’이며 가격은 미수신이다. 정상 수신·지연·부분 실패는 분리된 브라우저 fixture로 재현했다. 사용자 직접 수용과 장중 시세는 미확인이다.

모바일에서 [거래소와 검색이 맞지 않는 빈 결과](../verification/assets/161-market/empty-mobile.png), [한 거래소만 응답한 미확인 상태](../verification/assets/161-market/partial-mobile.png), [초기 마스터 요청 실패와 재시도](../verification/assets/161-market/error-mobile.png)를 별도로 관측했다. 뒤 두 경우는 브라우저가 통제한 응답이다.

## 검사와 검토 기록

- 전용 설정으로 실행한 `market.spec.ts` 24건과 시장·마스터 단위 검사 17건, TypeScript·Vite 빌드가 통과했다. 초기 검사에서 필터 직후 입력이 이전 필터를 복원하는 문제를 재현해 연속 입력을 수정했다. 별도 실행에서 임시 서버 종료로 접속 실패가 발생해 예시 서버를 사용자 서비스 `gon-stock03-market161-preview`로 띄우고 최종 24건을 다시 검증했다.
- Gemini 4 Neon High의 관측 검토는 응답을 받았다. 최초 구현 검토는 스트림 중단·5분 제한으로 본문 없이 실패했다. 같은 모델에 핵심 구현 발췌로 다시 요청해 모바일 포커스와 숨김 열 헤더 지적을 받았다. 종목 상세 → 관심 버튼 순서, 모바일에서 등락률·거래량 헤더/셀 동시 숨김, 가격의 접근성 라벨, 이전 목록·마스터 제외 안내를 수정했다. CSS 적용 범위와 제외 종목이 실제 검색 목록에 들어가는지는 원문에서 대조했다. 관심종목 전용 Escape·제외 종목 추가 안내는 해당 페이지 담당 검토 사항이다.
- 요청 모델과 CLI 초기화 모델은 `gemini-4-neon-high`로 확인했다. 서버 내부 모델과 추론 강도는 독립 미확인이다. 수정분에 대한 같은 모델의 최종 응답과 원격 CI는 [이슈 #161](https://github.com/krdn/gon-stock03/issues/161)에서 확인한다.
- 기준 main에서 `ready`, 작업 브랜치에서 `implementation-ready`와 원격 작업 문서·두 선행 PR의 `resume`을 확인했다. Graphify 갱신 후 그래프 1,555노드·3,619연결을 생성했다. 실측은 Chromium 예시 환경에 한정하며 보조기기 이용자 실측은 미확인이다.

## 11월 21일 종목 목록 출처 재검증

기준 main `9323577`에서 4454의 전용 SQLite에 기존 미리보기와 같은 출처 `https://example.test/master`로 예시 ETF를 저장했다. 실제 `GET /api/data/master`는 이 값을 보존했지만, PC·모바일은 ‘공식 마스터’로 표시했다. 4455에서는 4303 저장 마스터 3,966종목을 읽기 전용으로 복사해 같은 코드 069500을 비교했다. 두 서버의 KIS 자격은 비어 있고 외부 fetch는 차단했다. [이슈 재현 기록](https://github.com/krdn/gon-stock03/issues/161#issuecomment-7061278807)

| Chromium | 4454 합성 예시 목록 | 4455 KIS 공개 종목 마스터 |
| --- | --- | --- |
| 1440×900 | [수정 전](../verification/assets/161-market/source/before-4454-1440.png) · [수정 후](../verification/assets/161-market/source/after-4454-1440.png) | [저장된 공개 목록](../verification/assets/161-market/source/after-4455-1440.png) |
| 390×844 | [수정 전](../verification/assets/161-market/source/before-4454-390.png) · [수정 후](../verification/assets/161-market/source/after-4454-390.png) | [저장된 공개 목록](../verification/assets/161-market/source/after-4455-390.png) |

두 화면 크기에서 목록 행·거래소별 펼침·선택 상세가 같은 출처를 표시했다. 각 환경에서 트레이딩으로 069500을 전달했고 뒤로가기 후 상세와 검색어를 복원했다. 가로 넘침은 네 경우 모두 0px였다. 거래소별 저장 출처를 갱신 중과 실패 후에도 유지한다. 제외 이력에는 당시 출처가 없어 ‘목록 출처 미확인’으로 표시한다. 장중 시세와 사용자 직접 수용은 미확인이다.

[선택 ETF와 같은 거래소의 API 출처·목록 행 실측](../verification/assets/161-market/source/measurements.json). 단위 277건, 시장·관심종목 브라우저 35건과 빌드가 통과했다. Gemini 4 Neon High는 제공한 diff와 DOM 근거를 검토해 PASS로 응답했다. 출력의 초기화 모델은 `gemini-4-neon-high`였고 서버 내부 모델은 독립 미확인이다. 미확인 출처 문구는 단위 검사로 검증했다.
