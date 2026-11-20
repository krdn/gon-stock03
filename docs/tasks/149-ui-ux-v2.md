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

#152의 예시 주문은 설정 왕복 뒤 4주·72,500원이 1주·빈 가격으로 바뀌었다. [#154](https://github.com/krdn/gon-stock03/issues/154)에서 Paper.tsx 복원 수명을 전담한다. #152는 TradingSettings.tsx와 기존 복귀 계약을 담당하며 메인이 두 후보를 함께 검증한다. 이후 /paper 전체 화면 검토는 이 결과를 재사용한다.

[대시보드 예시](http://127.0.0.1:4451/dashboard)에서 메인이 PC·모바일 모두 한 번에 KIS 전략 환경으로 이동하는 것을 확인했다. 브라우저 시계가 120초 빠르면 두 크기 모두 정상 응답 직후 공통 상태가 ‘오래됨’으로 표시됐다. 지정 Gemini의 [PR #156](https://github.com/krdn/gon-stock03/pull/156) 재검토 판정은 FAIL이다. 메인이 #157에 App.tsx의 표시·act 직전 판정과 기존 DEMO 만료/재시도 회귀 두 건의 시계 주입을 배정했다. #156과 #157의 결합 후보에서 편차·실제 만료·오류 경계를 재검증한다.

[현재 KIS 예시](http://127.0.0.1:4452/orders?view=kis)의 주문 상세는 두 크기에서 키보드 Enter로 열렸고 쓰기 요청은 0건이었다. [주문 PR #155](https://github.com/krdn/gon-stock03/pull/155) · [대시보드 지도](http://127.0.0.1:4328/guide.html#dashboard) · [주문 지도](http://127.0.0.1:4328/guide.html#orders).

## 다음 배정

src/specs.ts의 15개 화면, App.tsx의 매매 설정 추가 경로와 4303 주 메뉴 16개가 일치했다. 아래 13개는 Orca에 등록된 대기 작업이다. 권장 순서는 탐색·거래 → 설정·위험·계좌 → 전략·연구·데이터 → 운영 기록·설계다. 같은 파일을 만지는 페이지와 환경 전달을 검증할 양쪽을 고려해 독립 배정을 진행한다. 먼저 반환된 작업 줄에서 독립 세션을 이어서 열 수 있다.

|화면|사용자 행동과 확인 결과|기존 기록|대기 작업|
|---|---|---|---|
|[시장 탐색](http://127.0.0.1:4303/market)|공개 마스터·합성 목록 검색 → 종목 상세 → 트레이딩. 검색·거래소 필터와 빈 결과, 시세 출처, 선택 코드 전달|[#10](https://github.com/krdn/gon-stock03/issues/10)|`task_05d1c5081709`|
|[트레이딩](http://127.0.0.1:4303/trade)|종목과 20/60/100 일봉의 출처·기준 시각·조회 실패와 브라우저 시계 편차, DEMO 입력과 확인 후 원장 이동, 모의 매매로 종목 전달|[#12](https://github.com/krdn/gon-stock03/issues/12)|`task_368706006902`|
|[연결·설정](http://127.0.0.1:4303/settings)|키 주입·인증·잔고를 구별하고 오류 후 다음 행동 찾기, 저장 상태/새로고침 효과와 매매 설정 복귀|[#8](https://github.com/krdn/gon-stock03/issues/8), [#113](https://github.com/krdn/gon-stock03/issues/113)|`task_1eff32bf0737`|
|[관심종목](http://127.0.0.1:4303/watchlist)|관심 등록·해제·재접속, 시세 미확인, 종목 상세·코드 복사·키보드 초점 복귀 및 트레이딩 전달|[#20](https://github.com/krdn/gon-stock03/issues/20)|`task_d7787e831cb7`|
|[KIS 모의 매매](http://127.0.0.1:4303/paper)|종목·매매 입력→일반 설정 왕복, 시세/대조·접수/불명·복구/잔량취소, 식별자는 합성 fixture, 실제 API 차단|[#14](https://github.com/krdn/gon-stock03/issues/14), [#116](https://github.com/krdn/gon-stock03/issues/116)|`task_e08af9e521b1`|
|[위험관리](http://127.0.0.1:4303/risk)|DEMO/KIS 사용량·차단 이유, 일반 한도 편집/복귀, 기존 주문과 신규 정지·재개 차이 및 미확인|[#11](https://github.com/krdn/gon-stock03/issues/11)|`task_b864a6cdc943`|
|[포트폴리오](http://127.0.0.1:4303/portfolio)|KIS/DEMO 환경별 보유·예수금·손익 출처와 기준 시각, 부분/미조회 상태, 원인 화면/종목으로 이동|[#16](https://github.com/krdn/gon-stock03/issues/16)|`task_cba9a21f608f`|
|[전략 스튜디오](http://127.0.0.1:4303/strategies)|DEMO/KIS 환경 전달, 모바일에서 KIS 최근 평가 사유를 찾는 거리·직접 이동, 규칙 편집·revision·저장→계약과 차단 원인. 실행은 격리 예시|[#22](https://github.com/krdn/gon-stock03/issues/22)|`task_b2eaad633318`|
|[데이터 상태](http://127.0.0.1:4303/data)|마스터 마지막 성공/부분, KIS 저장 일봉 목록·상세/누락, 합성 인벤토리 → 시장 및 백테스트 출처 추적|[#15](https://github.com/krdn/gon-stock03/issues/15)|`task_8fbd736c9f7e`|
|[백테스트](http://127.0.0.1:4303/backtest)|저장 KIS 일봉→입력·실험 결과→불러오기·재현, DEMO 합성 실험과 비용·데이터 기준 및 입력 실패 구별|[#21](https://github.com/krdn/gon-stock03/issues/21)|`task_05be3cdd3bd4`|
|[알림·이벤트](http://127.0.0.1:4303/alerts)|중요도/환경·읽음과 원인 링크, 읽음 저장 영향과 실패·현재 표시 범위. 환경이 목적지에 유지되는지 확인|[#17](https://github.com/krdn/gon-stock03/issues/17)|`task_c0139aaecc2a`|
|[매매일지](http://127.0.0.1:4303/journal)|종목 메모 저장→검색→새로고침, 최초 빈 목록과 검색 0건, 저장 실패/편집 중 초안 보존|[#23](https://github.com/krdn/gon-stock03/issues/23)|`task_8d886c660444`|
|[설계실](http://127.0.0.1:4303/design)|전체 설계·화면별 상세·시스템 구조·주문 흐름·개발 단계·리서치/API, 직접 링크·화면별 의견 경로 확인|[#24](https://github.com/krdn/gon-stock03/issues/24), [#143](https://github.com/krdn/gon-stock03/issues/143)|`task_9860662dd447`|

## 결과 회수와 통합

- 각 담당자가 수정 전후 같은 PC·모바일 행동의 결과와 위치를 기록한다. 빈 결과·오류·부분·미확인, 키보드, 새로고침·뒤로가기와 인접 화면의 종목·환경·입력 전달도 해당 시나리오에서 검증한다. Graphify에서 찾은 경로는 소스에서 확인한다. 지정한 Gemini 4 Neon High의 설계 판단과 구현 검토, 주요 지적 처리 및 호출 한계는 각각 기록한다.
- 작업자는 전용 포트·DB와 식별 정보가 없는 예시 자료를 사용한다. 4303은 메인이 읽기 전용으로 확인한다. 실제 주문·정정·취소·전략·예약·원장 초기화는 승인 대상에서 제외한다.
- App.tsx·specs.ts·공통 CSS·공용 컴포넌트·API 계약·STATE·지도는 메인 소유다. 작업자는 페이지 파일의 담당 함수, 페이지 전용 CSS와 검사·근거 자산을 소유한다. 같은 파일의 다음 담당자는 반환된 변경을 확인하고 작업한다. 메인은 실제 결합 커밋에서 Graphify 산출물을 재생성한다.
- 작업 반환 시 원래 문제, 결정과 이유, 바뀐 동작, 검증 근거, 남은 한계, PR과 열리는 preview를 확인한다. 기존 Archify 지도에 확인된 화면·버튼·결과·이슈를 연결한다. 페이지별 준비·결과를 #149와 보드에 기록하고 검토 가능한 묶음을 제시한다.
- 병합을 기다리는 동안 다음 독립 작업을 진행한다. 사용자가 지정해 병합한 PR의 main CI·4303 checkout·같은 시나리오를 확인한다. 직접 수용한 화면·환경·뷰포트는 별도로 남긴다.
