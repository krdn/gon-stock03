# 2차 UI/UX 화면 검토

[전체 진행 #149](https://github.com/krdn/gon-stock03/issues/149) · [기존 Project 25](https://github.com/users/krdn/projects/25) · [기존 지도 #143](https://github.com/krdn/gon-stock03/issues/143) · [주문 사례](147-orders-ux.md)

사용자가 화면에서 가능한 행동을 찾고, 데이터의 환경·출처·시각과 버튼의 결과를 설명할 수 있는지 확인한다. 최초 배정 기준은 `04434fdbd44b3eb7cc169e651fdd537086f7e568`이다. 당시 GitHub main과 4303 웹·4304 API를 제공하는 `/home/gon/llm-projects/gon-stock03`의 HEAD가 일치했고 [PR #146](https://github.com/krdn/gon-stock03/pull/146)과 [PR #148](https://github.com/krdn/gon-stock03/pull/148)이 병합됐다. 해당 main의 앱·구성 CI가 성공했다. 원래 안내 지도 [PR #144](https://github.com/krdn/gon-stock03/pull/144)는 초안으로 별도 검토 중이다.

## 첫 배정과 실제 화면

4303에서 대시보드의 ‘KIS 전략 평가 확인’을 눌렀을 때 1440×900와 390×844 모두 전략 환경 선택값이 `demo`였다. 화면 상단을 기준으로 KIS 계좌 제목은 PC 754px, 모바일 1,041px, 해당 링크는 PC 1,178px, 모바일 1,713px였다. 모바일은 링크를 화면 가운데로 스크롤한 뒤 눌렀다. 출발 환경이 다음 화면에서 바뀌는 문제와 진입까지의 거리를 첫 배정 근거로 삼았다. Graphify의 Dashboard → useWorkbench·portfolioValue 경로를 Workspace.tsx와 대조하고, 링크에 환경 파라미터가 없고 Strategies가 DEMO를 기본으로 삼는 코드도 확인했다.

실제 지난 기록 화면에는 두 뷰포트 모두 3건과 주문별 확인 시각 3개가 표시됐다. 첫 결과/확인 시각의 상단은 모바일 365/459px, PC 402/423px였다. 직접 수용은 별도이며, 사용자 체감 소요 시간은 미측정이다. [대시보드](http://127.0.0.1:4303/dashboard) · [현재 KIS 원장](http://127.0.0.1:4303/orders?view=kis) · [지난 실행 기록](http://127.0.0.1:4303/orders?view=history) · [매매 설정](http://127.0.0.1:4303/settings/trading)

Orca Run `run_083cd1245215`. 작업자의 착수 메시지·실제 worktree·브랜치와 기준 SHA를 확인했다. 작업 루트는 `/home/gon/orca/workspaces/gon-stock03/`이며 Orca 브랜치는 `krdn/<worktree>`다. 포트는 작업자에게 배정한 예시 앱 주소이며 실제 연결 확인 후 검토 링크로 게시한다.

|페이지·착수 기록|Codex 세션|worktree|예시 포트|검토할 동작|
|---|---|---|---:|---|
|[대시보드 #150](https://github.com/krdn/gon-stock03/issues/150#issuecomment-7036979751)|`01a1f874-ee1b-7f71-a2b6-ac9cdf804ff8`|`ux2-150-dashboard`|4451|계좌 요약 → 원인 화면의 환경|
|[주문·체결 #151](https://github.com/krdn/gon-stock03/issues/151#issuecomment-7036979759)|`01a1f874-ee20-7ac2-a5d9-2499faed498b`|`ux2-151-orders`|4452|DEMO와 현재 KIS 목록·복구, 지난 기록 회귀|
|[매매 설정 #152](https://github.com/krdn/gon-stock03/issues/152#issuecomment-7036981305)|`01a1f874-ef23-79b0-bd38-41c23071a172`|`ux2-152-trading-settings`|4453|일반 한도 저장·복귀. 한정 실행과 전략 계약 각각 대상 → 한도 → 검토, 초안·고정·적용|
|[설정 왕복 시 주문 입력 복원 #154](https://github.com/krdn/gon-stock03/issues/154#issuecomment-7037090642)|`01a1f87a-0d83-7e92-83f3-66917882dd22`|`ux2-154-paper-return`|4470|일반 설정 저장 → 새로고침 → 뒤로·앞으로 → 주문 입력 복귀|
|[공통 상태 시각 #157](https://github.com/krdn/gon-stock03/issues/157#issuecomment-7037344427)|`01a1f885-d6bc-7d32-b944-7e94423ecaed`|`ux2-157-app-time`|4471|서버 시각 기준 표시·행동 직전 신선도·실제 만료|
|[시장 탐색 #161](https://github.com/krdn/gon-stock03/issues/161#issuecomment-7037510045)|`01a1f88d-91c8-7181-b70a-1ba2e4289568`|`ux2-161-market`|4454|공개 마스터·합성 목록 검색 → 종목 상세 → 트레이딩. 검색·거래소 필터와 빈 결과, 시세 출처, 선택 코드 전달|
|[트레이딩 #158](https://github.com/krdn/gon-stock03/issues/158#issuecomment-7037441623)|`01a1f88a-5f9c-7972-b6c4-a9cd82622f8d`|`ux2-158-trade`|4455|종목과 20/60/100 일봉의 출처·기준 시각·조회 실패, DEMO 입력과 확인 후 원장 이동, 모의 매매로 종목 전달|
|[연결·설정 #162](https://github.com/krdn/gon-stock03/issues/162#issuecomment-7037537016)|`01a1f88e-f161-7c42-992b-061f51942b6d`|`ux2-162-settings`|4456|키 주입·인증·잔고를 구별하고 오류 후 다음 행동 찾기, 저장 상태/새로고침 효과와 매매 설정 복귀|
|[관심종목 #169](https://github.com/krdn/gon-stock03/issues/169#issuecomment-7037993739)|`01a1f8a4-2c74-7a81-a52d-7cbb6af3a63f`|`ux2-169-watchlist`|4457|관심 등록·해제·재접속, 시세 미확인, 종목 상세·코드 복사·키보드 초점 복귀 및 트레이딩 전달|
|[KIS 모의 매매 #166](https://github.com/krdn/gon-stock03/issues/166#issuecomment-7037873381)|`01a1f89e-cb7e-7dd0-9282-3892bc8aef16`|`ux2-166-paper`|4458|종목·매매 입력→일반 설정 왕복, 시세/대조·접수/불명·복구/잔량취소, 식별자는 합성 fixture, 실제 API 차단|
|[위험관리 #168](https://github.com/krdn/gon-stock03/issues/168#issuecomment-7037908801)|`01a1f8a0-48be-7033-abad-643fc955f63d`|`ux2-168-risk`|4459|DEMO/KIS 사용량·차단 이유, 일반 한도 편집/복귀, 기존 주문과 신규 정지·재개 차이 및 미확인|
|[포트폴리오 #174](https://github.com/krdn/gon-stock03/issues/174#issuecomment-7038440788)|`01a1f8b9-12dd-7af2-88de-c062682b12b5`|`ux2-174-portfolio`|4460|KIS/DEMO 환경별 보유·예수금·손익 출처와 기준 시각, 부분/미조회 상태, 원인 화면/종목으로 이동|
|[전략 스튜디오 #175](https://github.com/krdn/gon-stock03/issues/175#issuecomment-7038486937)|`01a1f8bb-3dc7-75d3-a618-905769990fa1`|`ux2-175-strategies`|4461|DEMO/KIS 환경 전달, 규칙 편집·revision·저장→계약 검토와 평가/차단 원인. 실행은 격리 예시|
|[데이터 상태 #173](https://github.com/krdn/gon-stock03/issues/173#issuecomment-7038407616)|`01a1f8b7-9629-7541-8bc9-9d0d6dbd16f6`|`ux2-173-data`|4462|마스터 마지막 성공/부분, KIS 저장 일봉 목록·상세/누락, 합성 인벤토리 → 시장 및 백테스트 출처 추적|

#152의 예시 주문은 설정 왕복 뒤 4주·72,500원이 1주·빈 가격으로 바뀌었다. [#154](https://github.com/krdn/gon-stock03/issues/154)에서 Paper.tsx 복원 수명을 전담한다. #152는 TradingSettings.tsx와 기존 복귀 계약을 담당하며 메인이 두 후보를 함께 검증한다. 이후 /paper 전체 화면 검토는 이 결과를 재사용한다.

[대시보드 예시](http://127.0.0.1:4451/dashboard)에서 메인이 PC·모바일 모두 한 번에 KIS 전략 환경으로 이동하는 것을 확인했다. 브라우저 시계가 120초 빠르면 두 크기 모두 정상 응답 직후 공통 상태가 ‘오래됨’으로 표시됐다. 지정 Gemini의 [PR #156](https://github.com/krdn/gon-stock03/pull/156) 재검토 판정은 FAIL이다. 메인이 #157에 App.tsx의 표시·act 직전 판정과 기존 DEMO 만료/재시도 회귀 두 건의 시계 주입을 배정했다. #156과 #157의 결합 후보에서 편차·실제 만료·오류 경계를 재검증한다.

[현재 KIS 예시](http://127.0.0.1:4452/orders?view=kis)의 주문 상세는 두 크기에서 키보드 Enter로 열렸고 쓰기 요청은 0건이었다. [주문 PR #155](https://github.com/krdn/gon-stock03/pull/155) · [대시보드 지도](http://127.0.0.1:4328/guide.html#dashboard) · [주문 지도](http://127.0.0.1:4328/guide.html#orders).

## 병합 검토와 결합 예시

- 주문·체결 [PR #155](https://github.com/krdn/gon-stock03/pull/155) `f45ad2b`는 CI 4개, 단위 276·브라우저 183건, 지정 Gemini 구현·수정분 검토가 통과했다. 모바일 첫 KIS 확인 시각이 935→459px, DEMO 취소 버튼은 1,266→726px로 올라왔다. [주문별 보기](http://127.0.0.1:4452/orders)에서 직접 검토할 수 있다.
- 설정 복귀 [PR #159](https://github.com/krdn/gon-stock03/pull/159) `af44cd5`와 매매 설정 [PR #160](https://github.com/krdn/gon-stock03/pull/160) `bb0477c`를 격리된 후보 `7975d6a`에 결합했다. 충돌한 Graphify 산출물 2개는 결합 소스에서 다시 생성했다. 두 PR의 최종 CI 각 4건, 결합 빌드와 관련 브라우저 35건이 통과했다. [최종 결합 예시](http://127.0.0.1:4475/paper?code=069500)에서도 PC·모바일 각 1건으로 069500 매도 4주·72,500원, 수량 한도 8주, 주문 전송 0건을 확인했다. 저장·새로고침·뒤로·앞으로·명시 복귀를 수행한 뒤 예시 한도를 5주로 되돌렸다. 확정 거부는 입력을 수정할 수 있고, 최초 전송 결과가 불명인 요청은 재시도 거부 후에도 원래 ID로 대조하도록 #14 계약을 유지했다. 실제 통합 시 둘째 PR의 그래프는 병합할 소스에서 재생성하고 그 커밋으로 검사한다. [매매 설정 지도](http://127.0.0.1:4328/guide.html#limits)
- 대시보드 [PR #156](https://github.com/krdn/gon-stock03/pull/156) `28e0cdd`는 CI 4개를 통과했다. 공통 시각은 아래 결합 검증에서 통과했다. 전략 목적지에서 최근 평가 사유까지 스크롤하는 동작은 전략 페이지가 검토한다.

## 대시보드·주문·트레이딩·설정 결합 검증

[주문 #155](https://github.com/krdn/gon-stock03/pull/155) `f45ad2b`, [대시보드 #156](https://github.com/krdn/gon-stock03/pull/156) `28e0cdd`, [공통 시각 #163](https://github.com/krdn/gon-stock03/pull/163) `9ddd657`, [트레이딩 #164](https://github.com/krdn/gon-stock03/pull/164) `ed4418b`, [연결·설정 #165](https://github.com/krdn/gon-stock03/pull/165) `04fba00` 순서의 로컬 결합 후보는 `b4183d2`이다. 각 PR의 CI 4건이 성공했다. 결합 소스에서 Graphify를 재생성하고 빌드·Chromium 122건이 통과했다. 첫 예비 검사에서는 메인의 고정 시계가 차트의 200ms 조회 지연을 진행시키지 않아 새 검사 여섯 건이 실패했다. 단조 경과를 진행하도록 검사기를 수정하고 기본 로컬 10초·계좌 60초 임계값에서 다시 확인했다.

- 1440×900·390×844와 단말 −120/0/+120초를 조합한 6건에서 정상 로컬·계좌, KIS 환경 전달, 새 시세와 45초 지난 시세를 구분했다. 만료 후 행동 차단, 부분·오류·복귀와 거부 경로도 관련 회귀에 포함했다.
- [4476 결합 예시](http://127.0.0.1:4476/trade?code=000660&range=100)에서 두 크기 모두 +120초에 KIS 전략 선택, 100일봉과 종목의 주문 화면 전달·뒤로가기, [연결 설정](http://127.0.0.1:4476/settings?guide=setup)의 수동 로컬 조회 실패 피드백을 재현했다. 모바일에서 DEMO 주문 1건을 예시 메모리 원장에 접수하고 한 번에 [결과](http://127.0.0.1:4476/orders?view=demo)를 열었다. 외부 시세 연결을 차단한 합성 예시이며 실제 KIS 주문은 0회다.
- 지정 Gemini 4 Neon High 통합 재검토에서 벽시계 편차와 수동 GET 실패 안내 두 항목 모두 PASS였다. CLI 초기화 모델만 확인했다. 단말 시간대가 UTC이면 대시보드 확인 시각이 지역 시각으로 나오는 P3를 4476에서 재현했다. 포트폴리오 #174에서 Workspace.tsx 대시보드 및 공용 DataStatusLine의 관측·최종 성공 표기를 KST로 맞추고 서울/UTC를 비교한다. 공통 상태 영역을 일괄 접을지는 보류하며 첫 계좌 결과·행동 위치를 확인한다. ‘시세 수신시각이 추정 서버 현재보다 조금이라도 앞서면 오래됨’이라는 일괄 판정은 시세 응답이 상태 스냅샷보다 늦게 생성될 수 있어 적용하지 않았다. 수동 조회와 더 최신 폴링이 겹치면 설정 피드백은 최신 로컬 상태 기준이다. 첫 응답의 절대 나이와 무이벤트 실기기 절전은 미측정이다.
- [시장 탐색 #167](https://github.com/krdn/gon-stock03/pull/167) `da1d5ef`는 별도 CI 4개와 지정 리뷰를 통과했다. [4454 ETF 상세](http://127.0.0.1:4454/market?market=ETF&detail=069500)에서 메인이 두 크기 모두 트레이딩 069500 전달, 뒤로가기·재접속 후 069500 상세 복원을 확인했다.

## 시장·관심, 모의 매매·위험관리까지 결합

[11개 PR을 포함한 검증 커밋 `fd01717`](https://github.com/krdn/gon-stock03/commit/fd0171763b034996e78517f945eb571c423abf18)과 [사용자용 합성 예시](http://127.0.0.1:4477/watchlist)는 같은 제품 코드를 사용한다. 앞선 일곱 PR(#155·#156·#159·#160·#163·#164·#165)에 [시장 #167](https://github.com/krdn/gon-stock03/pull/167) `da1d5ef`, [모의 매매 #170](https://github.com/krdn/gon-stock03/pull/170) `54c4799`, [위험관리 #171](https://github.com/krdn/gon-stock03/pull/171) `938114d`, [관심종목 #172](https://github.com/krdn/gon-stock03/pull/172) `e233c34`를 결합했다. #170의 선행은 #159, #172의 선행은 #167이다. 원격 검증 브랜치는 main과 별도다.

- 시장·관심 공용 이력에서 시장 검색 → 상세 → 트레이딩 → 뒤로 → 새로고침 → Escape → 다시 상세 → 빠른 뒤로가기를 확인했다. 기존 시장 후보 4454는 URL만 목록으로 돌아가고 상세가 열린 채 남은 경우가 PC 2/5·모바일 4/5회였다. #172 수정 후 4457 및 최종 4477에서는 각 포트의 PC·모바일 10회마다 불일치가 0회였다. 처음의 단순 상세 복원 검증을 확장했으며 시장·관심은 #167과 #172를 함께 검토한다.
- [모의 매매 예시](http://127.0.0.1:4477/paper?code=005930&sample=166)의 취소 확인창은 PC와 모바일에서 각각 다섯 번 닫고 즉시 다시 열어도 유지됐다. 합성 시나리오에서만 확인 버튼을 누른 뒤 체결 1주·취소확인 2주·잔량 0주를 확인했다. 브라우저 밖으로 나간 거래 POST는 0건이다. [위험관리](http://127.0.0.1:4477/risk?env=kis)에서는 일반 한도 설정을 왕복해도 KIS 환경을 유지했고 읽기 동선의 쓰기 요청은 0건이었다.
- 중간 결합에서 브라우저 246/247건이 통과했다. 가격 없는 미체결 매수 검사에 미연결 계좌와 정상 잔고가 혼재했다. #171에서 연결·전체 잔고 조건을 명시해 가격을 모르는 주문의 예약액이 ‘미확인’이 되도록 검증했고, 연결이 없는 대조군은 전체 미확인으로 표시됐다. Operations.tsx에서 충돌한 두 CSS import를 모두 보존하고 결합 그래프를 재생성했다.
- 최종 로컬 빌드, 단위/API 276건, 전체 Chromium 260건 통과. 로컬 단위 검사 중 기존 지도 서버와 겹치는 데이터 인벤토리 검사 한 건의 포트만 4328→4478로 대체했다. GitHub의 동일 커밋에서는 저장소 기본 설정 그대로 단위 276·Chromium 260건, 빌드와 구성 검사가 성공했다. [원격 앱 CI](https://github.com/krdn/gon-stock03/actions/runs/44729067057) · [원격 구성 CI](https://github.com/krdn/gon-stock03/actions/runs/44729067147). 직접 화면 수용과 실제 4303 반영은 대기 중이다.

## 다음 배정

src/specs.ts의 15개 화면, App.tsx의 매매 설정 추가 경로와 4303 주 메뉴 16개가 일치했다. 아래 13개는 Orca에 등록한 후속 화면이다. 착수 확인을 받은 화면에는 2차 이슈를 연결한다. 권장 순서는 탐색·거래 → 설정·위험·계좌 → 전략·연구·데이터 → 운영 기록·설계다. 같은 파일을 만지는 페이지와 환경 전달을 검증할 양쪽을 고려해 독립 배정을 진행한다. 먼저 반환된 작업 줄에서 독립 세션을 이어서 연다. Paper.tsx를 공유하는 #166은 #159의 af44cd5에서, MarketExplorer.tsx를 공유하는 #169는 #167의 da1d5ef에서 시작했다. #168은 변경한 일반·전용 설정의 위험관리 복귀 링크 두 곳을 #160과 함께 검사한다.

|화면|사용자 행동과 확인 결과|기존 기록|대기 작업|
|---|---|---|---|
|[시장 탐색](http://127.0.0.1:4303/market)|공개 마스터·합성 목록 검색 → 종목 상세 → 트레이딩. 검색·거래소 필터와 빈 결과, 시세 출처, 선택 코드 전달|[#10](https://github.com/krdn/gon-stock03/issues/10)|[161번 작업](https://github.com/krdn/gon-stock03/issues/161) · `task_05d1c5081709`|
|[트레이딩](http://127.0.0.1:4303/trade)|종목과 20/60/100 일봉의 출처·기준 시각·조회 실패와 브라우저 시계 편차, DEMO 입력과 확인 후 원장 이동, 모의 매매로 종목 전달|[#12](https://github.com/krdn/gon-stock03/issues/12)|[158번 작업](https://github.com/krdn/gon-stock03/issues/158) · `task_368706006902`|
|[연결·설정](http://127.0.0.1:4303/settings)|키 주입·인증·잔고를 구별하고 오류 후 다음 행동 찾기, 저장 상태/새로고침 효과와 매매 설정 복귀|[#8](https://github.com/krdn/gon-stock03/issues/8), [#113](https://github.com/krdn/gon-stock03/issues/113)|[162번 작업](https://github.com/krdn/gon-stock03/issues/162) · `task_1eff32bf0737`|
|[관심종목](http://127.0.0.1:4303/watchlist)|관심 등록·해제·재접속, 시세 미확인, 종목 상세·코드 복사·키보드 초점 복귀 및 트레이딩 전달|[#20](https://github.com/krdn/gon-stock03/issues/20)|[169번 작업](https://github.com/krdn/gon-stock03/issues/169) · `task_d7787e831cb7`|
|[KIS 모의 매매](http://127.0.0.1:4303/paper)|종목·매매 입력→일반 설정 왕복, 시세/대조·접수/불명·복구/잔량취소, 식별자는 합성 fixture, 실제 API 차단|[#14](https://github.com/krdn/gon-stock03/issues/14), [#116](https://github.com/krdn/gon-stock03/issues/116)|[166번 작업](https://github.com/krdn/gon-stock03/issues/166) · `task_e08af9e521b1`|
|[위험관리](http://127.0.0.1:4303/risk)|DEMO/KIS 사용량·차단 이유, 일반 한도 편집/복귀, 기존 주문과 신규 정지·재개 차이 및 미확인|[#11](https://github.com/krdn/gon-stock03/issues/11)|[168번 작업](https://github.com/krdn/gon-stock03/issues/168) · `task_b864a6cdc943`|
|[포트폴리오](http://127.0.0.1:4303/portfolio)|KIS/DEMO 보유·예수금·손익과 시각, 부분/미조회, 원인 화면·종목 전달. 대시보드 확인 시각의 KST 표기를 서울/UTC에서 비교|[#16](https://github.com/krdn/gon-stock03/issues/16)|[174번 작업](https://github.com/krdn/gon-stock03/issues/174) · `task_cba9a21f608f`|
|[전략 스튜디오](http://127.0.0.1:4303/strategies)|DEMO/KIS 환경 전달, 모바일에서 KIS 최근 평가 사유를 찾는 거리·직접 이동, 규칙 편집·revision·저장→계약과 차단 원인. 실행은 격리 예시|[#22](https://github.com/krdn/gon-stock03/issues/22)|[175번 작업](https://github.com/krdn/gon-stock03/issues/175) · `task_b2eaad633318`|
|[데이터 상태](http://127.0.0.1:4303/data)|마스터 마지막 성공/부분, KIS 저장 일봉 목록·상세/누락, 합성 인벤토리 → 시장 및 백테스트 출처 추적|[#15](https://github.com/krdn/gon-stock03/issues/15)|[173번 작업](https://github.com/krdn/gon-stock03/issues/173) · `task_8fbd736c9f7e`|
|[백테스트](http://127.0.0.1:4303/backtest)|데이터 화면의 source=demo 또는 source=stored와 수집 ID를 검증해 전달. 저장 일봉 실험·재현, 합성 실험과 실패 상태 구별|[#21](https://github.com/krdn/gon-stock03/issues/21)|`task_05be3cdd3bd4`|
|[알림·이벤트](http://127.0.0.1:4303/alerts)|중요도/환경·읽음과 원인 링크, 읽음 저장 영향과 실패·현재 표시 범위. 환경이 목적지에 유지되는지 확인|[#17](https://github.com/krdn/gon-stock03/issues/17)|`task_c0139aaecc2a`|
|[매매일지](http://127.0.0.1:4303/journal)|종목 메모 저장→검색→새로고침, 최초 빈 목록과 검색 0건, 저장 실패/편집 중 초안 보존|[#23](https://github.com/krdn/gon-stock03/issues/23)|`task_8d886c660444`|
|[설계실](http://127.0.0.1:4303/design)|전체 설계·화면별 상세·시스템 구조·주문 흐름·개발 단계·리서치/API, 직접 링크·화면별 의견 경로 확인|[#24](https://github.com/krdn/gon-stock03/issues/24), [#143](https://github.com/krdn/gon-stock03/issues/143)|`task_9860662dd447`|

## 결과 회수와 통합

- 각 담당자가 수정 전후 같은 PC·모바일 행동의 결과와 위치를 기록한다. 빈 결과·오류·부분·미확인, 키보드, 새로고침·뒤로가기와 인접 화면의 종목·환경·입력 전달도 해당 시나리오에서 검증한다. Graphify에서 찾은 경로는 소스에서 확인한다. 지정한 Gemini 4 Neon High의 설계 판단과 구현 검토, 주요 지적 처리 및 호출 한계는 각각 기록한다.
- 작업자는 전용 포트·DB와 식별 정보가 없는 예시 자료를 사용한다. 4303은 메인이 읽기 전용으로 확인한다. 실제 주문·정정·취소·전략·예약·원장 초기화는 승인 대상에서 제외한다.
- App.tsx·specs.ts·공통 CSS·공용 컴포넌트·API 계약·STATE·지도는 메인 소유다. 작업자는 페이지 파일의 담당 함수, 페이지 전용 CSS와 검사·근거 자산을 소유한다. 같은 파일의 다음 담당자는 반환된 변경을 확인하고 작업한다. 메인은 실제 결합 커밋에서 Graphify 산출물을 재생성한다.
- 작업 반환 시 원래 문제, 결정과 이유, 바뀐 동작, 검증 근거, 남은 한계, PR과 열리는 preview를 확인한다. 기존 Archify 지도에 확인된 화면·버튼·결과·이슈를 연결한다. 페이지별 준비·결과를 #149와 보드에 기록하고 검토 가능한 묶음을 제시한다.
- 병합을 기다리는 동안 다음 독립 작업을 진행한다. 사용자가 지정해 병합한 PR의 main CI·4303 checkout·같은 시나리오를 확인한다. 직접 수용한 화면·환경·뷰포트는 별도로 남긴다.
