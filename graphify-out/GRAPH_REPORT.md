# Graph Report - gon-stock03-192  (2026-11-21)

## Corpus Check
- 361 files · ~377,635 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 25 file(s) not represented in the graph (top: .css 17, (none) 2, .zip 2)

## Summary
- 1807 nodes · 4017 edges · 143 communities (130 shown, 13 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 199 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `12e2f61d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- shared/market-data.ts
- kis.ts
- trading-plans.ts
- Realtime
- shared/backtest.ts
- 147-orders-ux.md
- package.json
- 작업: #48 KIS 요청 간격 CI 실패
- snapshot
- 13-18-integration.md
- steps
- files
- 관심종목 검증
- workflow-config.yml
- compilerOptions
- 시장 탐색 검증
- #16 포트폴리오 검증
- http.ts
- interface-sessions-2026-11.md
- 작업: 국내 종목 마스터·일봉 수집
- 2026-11-17-consolidated-status.md
- PaperBroker
- 9-kis-orders-recovery.md
- 후속 개발의 기준선 확정
- 작업: #9 KIS 주문·복구
- body
- #9 최소 모의 실행 절차
- model.ts
- 작업: Graphify 활용과 자동 인수인계 복구
- 화면별 개발 세션 계획
- secrets-management
- inventory.ts
- order-history.ts
- Infisical 연결과 운영
- model.ts
- #24 설계실 검증
- screen-guide-settings.cjs
- updates
- 기술 스택 현황, 채택 근거 및 아키텍처 추천
- #9 KIS 주문·복구 계약
- 삼성전자 모의 주문 시도: 가격 변경으로 전송 차단
- #6 공통 상태 계약
- paper.test.ts
- server/market-data.ts
- #6 공통 상태 검증
- useWorkbench
- replay.py
- 모의 전량취소 검증 후보
- trading-plan.ts
- plans/agent-evolution.md
- #9 조건부 모의 실행 준비 검증
- 삼성전자 모의 주문·취소 실증
- 로컬 실행과 복구
- .submit
- #123 한정 지정가와 매매 정책 검증
- StateSnapshot
- trading-policy.ts
- pull_request_template.md
- GitHub 개발 운영
- ui.tsx
- 2026-11-16-orders.md
- gon-stock03 기능 검증과 코딩 에이전트 자기개선 설계
- useWorkbench
- 168-risk-ux.md
- 2차 UI/UX 화면 검토
- 연결·설정 복구 구현 검증
- 작업: #25 장중 통합 실증
- http.ts
- 11월 18일 장중 주문 전환
- 작업: 연결·설정 복구
- store.ts
- agent-evolution.md
- 저장 일봉 선택과 백테스트 재현
- 작업: 연결·설정
- replay.mjs
- 전체 브랜치 통합 검증 — 2026-11-16
- trading-plans.ts
- 개인 PC용 KIS 모의 버전 최종 수용
- paper.ts
- KIS 연결·설정 화면
- #98 KIS 모의 연속전략 계약
- 2026-11-17-ws-apply.md
- 연결·설정 복구 구현안
- TradingSettings.tsx
- 12-trading.md
- 85-consolidation.md
- #22 KIS 전략 검증
- Trading.tsx
- #8 연결·설정 검증
- #25 장중 실증 준비
- .submit
- Store
- App.tsx
- .confirmRecovery
- 2026-11-17-ui-acceptance.md
- #106 원 신호 시각과 모의 주문 사전검사
- 화면별 세션 계획 검증
- 알림·이벤트의 필터와 읽음 저장 범위
- 2026-11-14 검증 기록
- WORKFLOW.md
- #9 주문·복구 검증
- replay-entry.sh
- store.ts
- .riskSnapshot
- Orca ‘2차 UI/UX 업그레이드 총괄’ 제작 기록과 업그레이드 방법
- 개인 PC용 KIS 모의 버전 최종 수용
- 작업: #64 SQLite 원장 파일 권한 보호
- KIS 트레이딩 웹앱 조사
- GitHub 기능 적용
- README.md
- #21 저장 일봉 백테스트 검증
- watchlist-169.spec.ts
- 71-settings-recovery.md
- #6 공통 상태 계약
- 1차 화면 이해와 2차 수정 의견
- 삼성전자 시장가 모의 1회 검증
- 포트폴리오 계좌 출처와 조회 시각
- 트레이딩 실제 주가 연동
- 작업: #50 전체 브랜치 통합
- 접속키 실행 경로 실제 적용
- 매매 제한을 어디서 바꿀 것인가
- 11월 19일 장중 정상 전략 실증
- #106 원 신호 시각과 모의 주문 사전검사
- zod
- 연결·설정 동작 점검
- 작업: 제목
- #48 KIS 요청 간격 검증
- 모의 전량취소 검증 후보
- FakeSocket
- 25-validation.md
- 작업: #21 저장 일봉 백테스트
- 작업: #23 매매일지
- 작업: #65 정적 파일 오류의 내부 경로 보호
- 삼성전자 모의 주문·취소 실증
- #65 정적 파일 오류의 내부 경로 보호
- #25 장중 실증 준비
- #9 주문·복구 검증
- #64 SQLite 파일 권한 검증
- .riskSnapshot

## God Nodes (most connected - your core abstractions)
1. `Store` - 82 edges
2. `makeServer()` - 72 edges
3. `KisClient` - 64 edges
4. `useWorkbench()` - 43 edges
5. `PaperBroker` - 39 edges
6. `snapshot()` - 39 edges
7. `files` - 37 edges
8. `Panel()` - 35 edges
9. `won()` - 33 edges
10. `Badge()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `계약과 저장` --references--> `KisClient`  [INFERRED]
  docs/operations/market-data.md → server/kis.ts
- `실제 연결` --references--> `KisClient`  [INFERRED]
  docs/verification/2026-11-15-settings.md → server/kis.ts
- `실행 당일 원장·서버 준비` --references--> `Store`  [INFERRED]
  docs/operations/kis-minimum-paper-run.md → server/store.ts
- `11월 20일 CI 후속` --references--> `snapshot()`  [INFERRED]
  docs/tasks/12-trading.md → tests/snapshot.ts
- `리뷰 재개와 수정` --references--> `act()`  [INFERRED]
  docs/verification/2026-11-16-realtime.md → src/App.tsx

## Import Cycles
- None detected.

## Communities (143 total, 13 thin omitted)

### Community 0 - "shared/market-data.ts"
Cohesion: 0.11
Nodes (20): MARKET_PAGE_SIZE, masterDataSchema, MasterDataSnapshot, Market, category(), CopyStockCode(), MarketExplorer(), changeFilter() (+12 more)

### Community 1 - "kis.ts"
Cohesion: 0.10
Nodes (14): kis, port, server, sources, store, amount, balanceSchema, BeforeSend (+6 more)

### Community 2 - "trading-plans.ts"
Cohesion: 0.31
Nodes (6): archiveEntry, displayOrders(), milliseconds(), observedTime, orderHistory(), registeredArchives()

### Community 3 - "Realtime"
Cohesion: 0.24
Nodes (3): Realtime, State, fixture()

### Community 4 - "shared/backtest.ts"
Cohesion: 0.09
Nodes (21): 1차 화면 함께 보기 {#workbench-guide}, KIS 모의 매매 · 조회와 주문 전송은 어디서 갈릴까? {#paper}, 같이 짚어볼 지점이 있나요? {#feedback}, 관심종목 · 내가 고른 종목을 다시 보려면? {#watchlist}, 대시보드 · 장 시작 전에 무엇을 확인할까? {#dashboard}, 데이터 상태 · 어떤 종목과 날짜의 자료가 들어 있나? {#data}, 매매 설정 · 수량을 바꾸면 어느 주문에 적용될까? {#limits}, 매매일지 · 내가 그때 생각한 이유를 어디에 남길까? {#journal} (+13 more)

### Community 5 - "147-orders-ux.md"
Cohesion: 0.07
Nodes (23): 지난 KIS 주문 조회 화면, 같은 입력으로 측정한 위치, 데이터와 검증, 매매 설정의 한도 저장과 다음 실행 검토, 화면과 판정, 변경 전후, 설계 판단과 근거, 트레이딩에서 시세 확인과 DEMO 주문 (+15 more)

### Community 6 - "package.json"
Cohesion: 0.05
Nodes (44): dependencies, lucide-react@1.73.0, react@19.3.1, react-dom@19.3.1, react-router-dom@7.18.5, ws@^8.23.0, zod@4.6.7, devDependencies (+36 more)

### Community 7 - "작업: #48 KIS 요청 간격 CI 실패"
Cohesion: 0.18
Nodes (8): 다음 행동, 독립 전달 당시 결과 (통합 전), 먼저 읽을 자료, 새 세션 시작 문구, 작업: #48 KIS 요청 간격 CI 실패, 착수 시 인계 근거, credentials, samples

### Community 8 - "snapshot"
Cohesion: 0.12
Nodes (15): @playwright/test, expectedIssues, dashboardState(), local(), accepted, scenarios, available, blocked (+7 more)

### Community 9 - "13-18-integration.md"
Cohesion: 0.07
Nodes (16): 작업: PR58·59 결합 후보, 작업: #13 주문·체결, 작업: #14 KIS 모의 매매 화면, 검증과 검토, 대시보드의 계좌별 첫 판단과 이동, 격리 검증, 바뀐 동작, 설정 왕복 후 모의 주문 입력 복원 (+8 more)

### Community 10 - "steps"
Cohesion: 0.20
Nodes (10): runs-on, steps, timeout-minutes, jobs, application, run, uses, with (+2 more)

### Community 11 - "files"
Cohesion: 0.05
Nodes (39): files, connection/design-desktop.png, connection/design-mobile.png, connection/paper-desktop.png, connection/paper-mobile.png, connection/settings-desktop.png, connection/settings-mobile.png, core/dashboard-desktop-settled.png (+31 more)

### Community 12 - "관심종목 검증"
Cohesion: 0.22
Nodes (8): 공식 출처·경계, 관심종목 검증, 변경과 확인 방법, 실제 조회·화면, 이번 계속 진행 지시와 수용·통합, 인계, 자동 검사, 지정 모델 확인

### Community 13 - "workflow-config.yml"
Cohesion: 0.13
Nodes (14): runs-on, steps, timeout-minutes, jobs, configuration, name, on, pull_request (+6 more)

### Community 14 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, jsx, lib, module, moduleResolution, noEmit, resolveJsonModule (+6 more)

### Community 15 - "시장 탐색 검증"
Cohesion: 0.10
Nodes (17): 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: 시장 탐색, 현재 결과, 같은 종목으로 확인한 변경 전후, 검사와 검토 기록, 경로와 검증 (+9 more)

### Community 16 - "#16 포트폴리오 검증"
Cohesion: 0.14
Nodes (12): 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: #16 포트폴리오, 현재 결과, #16 포트폴리오 검증, 결과와 계산 기준, 독립 리뷰와 수용 경계 (+4 more)

### Community 17 - "http.ts"
Cohesion: 0.15
Nodes (23): MARKET_REFRESH_MS, MARKET_STALE_MS, marketQuoteSchema, won(), portfolioValue(), Badge(), Change(), Chart() (+15 more)

### Community 18 - "interface-sessions-2026-11.md"
Cohesion: 0.14
Nodes (9): 2차 로컬 기능과 KIS 모의 연결, 1차 화면·설계 시각화, 2026-11-15 세션별 실행 관리, GitHub 기능 적용, 이번 구현의 적용, screens, ScreenSpec, sourceRoot (+1 more)

### Community 19 - "작업: 국내 종목 마스터·일봉 수집"
Cohesion: 0.05
Nodes (32): 계약과 저장, 국내 종목·일봉 수집 API, 마스터 정책과 한계, 실행, 품질 판정, 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구 (+24 more)

### Community 20 - "2026-11-17-consolidated-status.md"
Cohesion: 0.11
Nodes (22): dailyRunsSchema, Assumptions, assumptions(), Backtest(), BacktestSelection, dateInput(), defaultAssumptions, DemoBacktest() (+14 more)

### Community 23 - "후속 개발의 기준선 확정"
Cohesion: 0.20
Nodes (8): 검증과 통합, 수용 근거와 범위, 후속 개발의 기준선 확정, 후속 실행, 검증 근거, 검토 한계, 기준선 수용과 Opus 검증, 비차단 P2 이관

### Community 24 - "작업: #9 KIS 주문·복구"
Cohesion: 0.20
Nodes (10): 2026-11-16 API 전량취소 후보, 2026-11-16 위임 수용 검증, 2026-11-16 정규장 확대와 실제 테스트 지시, 구현 전달 당시 결과 (통합 전), 다음 행동, 먼저 읽을 자료, 삼성전자 실증과 후속 요청, 새 세션 시작 문구 (+2 more)

### Community 25 - "body"
Cohesion: 0.20
Nodes (9): label, body, attributes, id, type, validations, description, name (+1 more)

### Community 26 - "#9 최소 모의 실행 절차"
Cohesion: 0.22
Nodes (9): 2026-11-16 실행 지시 갱신, #9 최소 모의 실행 절차, 삼성전자 새 테스트 승인, 수동 시작과 대조, 승인 범위, 승인과 남은 실행 조건, 실행 당일 원장·서버 준비, 실행 전후 절차 (+1 more)

### Community 27 - "model.ts"
Cohesion: 0.21
Nodes (4): Store, StrategyContract, PaperAudit, setup()

### Community 29 - "화면별 개발 세션 계획"
Cohesion: 0.25
Nodes (8): 15개 화면, Project 운영, 검증 경계, 공통·기준선·실증, 근거와 관리 방식, 이슈와 선후관계, 한 세션의 시작과 종료, 화면별 개발 세션 계획

### Community 30 - "secrets-management"
Cohesion: 0.25
Nodes (7): general, domain, secrets-management, environment, project-id, secret-path, version

### Community 31 - "inventory.ts"
Cohesion: 0.13
Nodes (25): AstNode, Check, checks, child(), children(), eachChild(), features, gaps (+17 more)

### Community 32 - "order-history.ts"
Cohesion: 0.40
Nodes (5): 다음 작업 체크리스트, 실패와 보존, 실행 결과, 연결 준비와 공식 근거, 장 마감 후 연결 준비와 복구 점검

### Community 33 - "Infisical 연결과 운영"
Cohesion: 0.25
Nodes (8): GitHub Actions, Infisical 연결과 운영, WebSocket 접속키 자동 발급, 앱과 AI 실행, 연결 검증, 연결·설정 화면, 인증서와 권한 접근, 프로젝트 연결

### Community 34 - "model.ts"
Cohesion: 0.15
Nodes (14): BacktestResult, Connection, DataStatus, Instrument, Journal, KisBar, Order, orderStatus (+6 more)

### Community 35 - "#24 설계실 검증"
Cohesion: 0.14
Nodes (12): 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: #24 설계실, 현재 결과, #24 설계실 검증, 수용·후속, 실행 근거 (+4 more)

### Community 36 - "screen-guide-settings.cjs"
Cohesion: 0.40
Nodes (5): 남은 작업 순서, 새 세션 시작, 완료·관측 범위, 완료 작업과 다음 세션 기준, 현재 로컬 실행과 보존

### Community 37 - "updates"
Cohesion: 0.29
Nodes (6): interval, updates, directory, package-ecosystem, schedule, version

### Community 38 - "기술 스택 현황, 채택 근거 및 아키텍처 추천"
Cohesion: 0.29
Nodes (6): 1. 현재 사용 중인 기술 스택, 2. 왜 이 기술들을 선택했는가? (채택 근거와 추론 사슬), 3.1 1단계 추천: 현재 로컬 워크스페이스 범위 유지 시 (현행 스택 유지 + 3가지 보강), 3.2 2단계 추천: 운영 서버(`192.168.0.5`) 상시 배포 및 본격 자동매매 확장 시, 3. 판단 및 추천 사항 (단계별 아키텍처 제안), 기술 스택 현황, 채택 근거 및 아키텍처 추천

### Community 39 - "#9 KIS 주문·복구 계약"
Cohesion: 0.33
Nodes (6): 2026-11-16 전량취소 규격 재조사, #9 KIS 주문·복구 계약, 공식 계약과 판단, 공식 문의 초안 — 미발송, 공통 서비스 계약, 차단 범위와 대안 결정

### Community 40 - "삼성전자 모의 주문 시도: 가격 변경으로 전송 차단"
Cohesion: 0.50
Nodes (4): 15개 화면의 표시·배치 부분 수용, 검토와 격리, 남은 작업, 수용한 자료

### Community 41 - "#6 공통 상태 계약"
Cohesion: 0.13
Nodes (18): checkApprovedLimit(), configuredApproval, kospiStockTick(), krxSession, lowerLimitApprovalSchema, normalizeId(), paperCapabilities, preparedApprovalSchema (+10 more)

### Community 42 - "paper.test.ts"
Cohesion: 0.09
Nodes (21): initial(), RealtimeConfig, sessionSchema, Socket, codeSchema, configuredPaperOrderInput, connectionFailureSchema, eventReadInput (+13 more)

### Community 43 - "server/market-data.ts"
Cohesion: 0.11
Nodes (23): KisDataError, downloadMaster(), MarketData, masterUrl(), parseMaster(), quality(), unzip, addDays() (+15 more)

### Community 44 - "#6 공통 상태 검증"
Cohesion: 0.33
Nodes (5): #6 공통 상태 검증, 외부 리뷰, 원격 증거, 재현과 결과, 통합 후 확인 — 2026-11-15

### Community 45 - "useWorkbench"
Cohesion: 0.13
Nodes (15): createExperiment(), backtestResultSchema, dailyBacktestInput, DailyBacktestInput, Experiment, experimentListSchema, experimentSchema, ExperimentSnapshot (+7 more)

### Community 46 - "replay.py"
Cohesion: 0.16
Nodes (6): render(), claim(), digest(), file_digest(), main(), tree_digest()

### Community 47 - "모의 전량취소 검증 후보"
Cohesion: 0.25
Nodes (7): clock, connectionTiming, exchangeNotice, OncePolicy, seconds, sessionWindow, StrategyPolicy

### Community 48 - "trading-plan.ts"
Cohesion: 0.12
Nodes (21): PaperCancellation, samePaperIntent(), BrokerOrder, BALANCE_STALE_MS, freshness(), LOCAL_STALE_MS, QUOTE_REFRESH_MS, PaperCancellationPanel() (+13 more)

### Community 49 - "plans/agent-evolution.md"
Cohesion: 0.12
Nodes (15): 자동진화 파일럿 총괄·재개, gon-stock03 기능 검증과 코딩 에이전트 자기개선 설계, 기능별 검증표, 실행 권한과 실패 처리, 에이전트가 다음 세대로 넘어가는 조건, 연구에서 선택한 방법, 제품 변경 한 건의 흐름, 첫 실험과 도입 순서 (+7 more)

### Community 50 - "#9 조건부 모의 실행 준비 검증"
Cohesion: 0.50
Nodes (3): 구현·검증, 작업: #80 WebSocket 접속키 메모리 발급, 통합·실제 적용 완료

### Community 51 - "삼성전자 모의 주문·취소 실증"
Cohesion: 0.20
Nodes (10): DEFAULT_PAPER_MAX_QTY, MAX_ORDER_QTY, amount, instant, onceTerms, PlanVersion, strategyTerms, TradingSettingsData (+2 more)

### Community 52 - "로컬 실행과 복구"
Cohesion: 0.40
Nodes (5): 검사, 로컬 실행과 복구, 사용 순서, 저장·중지·복구, 지난 KIS 실행 원장

### Community 53 - ".submit"
Cohesion: 0.15
Nodes (5): checkSession(), KisNotSent, withinApproval(), ConnectionFailure, ExchangeNotice

### Community 54 - "#123 한정 지정가와 매매 정책 검증"
Cohesion: 0.25
Nodes (8): 11월 19일 최종 확인, #123 한정 지정가와 매매 정책 검증, 136,300원 주문이 갈리는 지점, #25와의 연결, 검증과 설계 리뷰, 나머지 정책의 집행 조건, 매매설정에서 새 테스트 계약 구성, 첫 격리 검증 당시의 범위

### Community 55 - "StateSnapshot"
Cohesion: 0.25
Nodes (8): 공통 상태 계약 (#6), 구현 경계, 기술 결정, 전략과 백테스트, 주문과 복구, 책임과 데이터 흐름, 트레이딩 워크스페이스 설계, StateSnapshot

### Community 56 - "trading-policy.ts"
Cohesion: 0.25
Nodes (8): 11월 18일 장중 결과, 검증과 다음 행동, 공식 근거와 선택, 변경 계약, 실제 실행과 현재 상태, 작업: 삼성전자 시장가 모의 1회, 장외 재개 점검, 최신 main 결합 검증

### Community 57 - "pull_request_template.md"
Cohesion: 0.50
Nodes (3): 검증 근거, 문제와 변경, 인수인계

### Community 58 - "GitHub 개발 운영"
Cohesion: 0.25
Nodes (8): GitHub 개발 운영, Graphify 코드 구조 조회와 기록, 비밀정보와 인프라 접근, 세션별 작업과 재개, 시작, 업데이트와 복구, 작업, 협업과 GitHub 기능

### Community 59 - "ui.tsx"
Cohesion: 0.09
Nodes (21): react, connectionSchema, authenticationStatus(), disconnectedConnection(), App(), act(), currentStatus(), icons (+13 more)

### Community 63 - "gon-stock03 기능 검증과 코딩 에이전트 자기개선 설계"
Cohesion: 0.09
Nodes (14): 작업 인수인계, #107 전용 KIS 모의 주문 테스트, #116 KIS 모의 매매 페이지 잔량 취소, 주문당 수량 설정 · 11월 19일, 매매 설정과 다음 실행 고정, #128 기능 검증과 Astra 에이전트 자기개선 설계, 먼저 읽을 자료, 확인과 다음 행동 (+6 more)

### Community 64 - "useWorkbench"
Cohesion: 0.13
Nodes (19): 화면에서 확인한 차이, equity(), PaperQuantitySetting(), RiskLimitSettings(), Panel(), useWorkbench(), LiveTrading(), Risk() (+11 more)

### Community 65 - "168-risk-ux.md"
Cohesion: 0.17
Nodes (9): 결과와 검증, 다음 행동, 작업: #11 위험관리, 전달 대상, 검증과 수용, 결정과 근거, 대표 작업과 실측, 위험관리에서 사용량 확인과 신규 주문 제어 (+1 more)

### Community 66 - "2차 UI/UX 화면 검토"
Cohesion: 0.17
Nodes (12): 11월 21일 병합, 13개 화면 결합 검토, 2차 UI/UX 화면 검토, 검토 당시 기준, 결과 회수와 통합, 계좌·전략·데이터 화면 연동, 다음 배정, 대시보드·주문·트레이딩·설정 결합 검증 (+4 more)

### Community 67 - "연결·설정 복구 구현 검증"
Cohesion: 0.33
Nodes (6): STE 복구, 변경, 연결·설정 복구 구현 검증, 외부 리뷰와 한계, 원격 전달, 재현과 검사

### Community 68 - "작업: #25 장중 통합 실증"
Cohesion: 0.12
Nodes (17): 11월 18일 Argon 종결 검토, 11월 18일 오후 실제 주문 전환, 11월 18일 읽기 전용 후속 관측, 11월 18일 장중 화면 수용 대기, 14:02 후속 실증, 2026-11-17 당시 실증 경계, 기존 주문 기록과 격리 전환 검증, 다음 정규장 재개 (+9 more)

### Community 69 - "http.ts"
Cohesion: 0.16
Nodes (24): replayExperiment(), advanceTick(), backtest(), backtestDaily(), cancelOrder(), fee(), halt(), mean() (+16 more)

### Community 70 - "11월 18일 장중 주문 전환"
Cohesion: 0.33
Nodes (6): 11월 18일 장중 주문 전환, 15:12 조건부 전략 종료, 실제 신호에서 전송 직전까지, 실제 주문과 같은 시점의 PC·모바일 화면, 실제 지정가 주문의 통제된 응답 유실, 전략 전송 지연 측정

### Community 71 - "작업: 연결·설정 복구"
Cohesion: 0.25
Nodes (8): STE 검사 복구, 결과와 다음 행동, 다음 작업 점검, 소유권 인계 증거, 실제 연결 검증과 마감, 작업: 연결·설정 복구, 통합 완료, 필수 자료

### Community 72 - "store.ts"
Cohesion: 0.27
Nodes (7): action, paperEvent(), presentEvent(), status, PaperKrxSession, MasterInstrument, RemovedInstrument

### Community 73 - "agent-evolution.md"
Cohesion: 0.29
Nodes (5): KIS 모의 매매 화면 2차 검증, 같은 작업의 전후 실측, 결정과 근거, 리뷰와 검증 범위, 직접 확인할 화면

### Community 74 - "저장 일봉 선택과 백테스트 재현"
Cohesion: 0.25
Nodes (5): 검토 화면, 결합 검사에서 발견한 재선택 회귀, 리뷰와 검증, 변경과 측정, 저장 일봉 선택과 백테스트 재현

### Community 75 - "작업: 연결·설정"
Cohesion: 0.33
Nodes (6): 2026-11-17 세부 동작 재점검, 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: 연결·설정, 현재 결과

### Community 76 - "replay.mjs"
Cohesion: 0.15
Nodes (5): result, codes, instruments, results, runtime

### Community 77 - "전체 브랜치 통합 검증 — 2026-11-16"
Cohesion: 0.25
Nodes (6): 독립 리뷰, 실행 결과, 원격 브랜치 대조 정정, 원격 통합, 전체 브랜치 통합 검증 — 2026-11-16, 통합 경계

### Community 78 - "trading-plans.ts"
Cohesion: 0.12
Nodes (27): koreaDate(), assertStrategyIdentity(), activeTerms(), assetKind(), fixInput, fixTradingDraft(), inspectPreparedRun(), kindSchema (+19 more)

### Community 79 - "개인 PC용 KIS 모의 버전 최종 수용"
Cohesion: 0.15
Nodes (8): #157 브라우저 시차와 공통 상태 만료, 4471 전후 비교, 검토와 인계, 시각 근거와 한계, epoch, fixture(), iso(), poll()

### Community 80 - "paper.ts"
Cohesion: 0.22
Nodes (9): 11월 19일 최종 확인, 11월 20일 CI 후속, 2026-11-16 통합 진행 승인, 2026-11-17 후속 화면 수정, 다음 행동, 먼저 읽을 자료, 실제 주가 연동, 작업: #12 트레이딩 (+1 more)

### Community 81 - "KIS 연결·설정 화면"
Cohesion: 0.29
Nodes (6): 4303 실측, KIS 연결·설정 화면, Opus 5.5 병합 리뷰, 인증된 계좌의 잔고 갱신 동선, 일반 개발 서버의 자동 주입, 회귀와 리뷰

### Community 82 - "#98 KIS 모의 연속전략 계약"
Cohesion: 0.33
Nodes (5): #25 격리 테스트 계약, #98 KIS 모의 연속전략 계약, 검증 기록, 계약 입력과 시작, 상태 전이와 실패 처리

### Community 83 - "2026-11-17-ws-apply.md"
Cohesion: 0.18
Nodes (7): paperOrderInput, PaperOrderInput, defaults, expectOrder(), readOrder(), sample, views

### Community 84 - "연결·설정 복구 구현안"
Cohesion: 0.22
Nodes (8): 1. 실행 환경 진단, 2. 조회 시간 제한과 복구, 3. 재시도·진행 표시, 검증과 인수, 구현 순서와 완료 조건, 방향, 연결·설정 복구 구현안, 출처와 제한

### Community 85 - "TradingSettings.tsx"
Cohesion: 0.18
Nodes (23): planLimits(), tradingTerms, TradingTerms, defaultOncePolicy(), defaultStrategyPolicy(), krxHours(), NumberField(), priceNames (+15 more)

### Community 86 - "12-trading.md"
Cohesion: 0.33
Nodes (6): 14시 장중 재시작·단절 복구, #25 잔여 판단, #25 장중 화면 수용 자료 · 2026-11-18, Opus 5.5 위임 수용 판정, 체결 원장과 13:45 잔고, 후속 화면 · 기존 앱의 저장 주문과 잔고

### Community 87 - "85-consolidation.md"
Cohesion: 0.29
Nodes (6): name, on, pull_request, push, permissions, contents

### Community 88 - "#22 KIS 전략 검증"
Cohesion: 0.40
Nodes (5): #9 조건부 모의 실행 준비 검증, 기준과 변경, 로컬 구성과 남은 사실, 실행한 검사, 지정 리뷰와 한계

### Community 89 - "Trading.tsx"
Cohesion: 0.12
Nodes (17): lucide-react, PaperLedger, paperLedgerSchema, formatKst, HistoryOrder(), LedgerOrder, paperStatus, CurrentOrderTable() (+9 more)

### Community 90 - "#8 연결·설정 검증"
Cohesion: 0.33
Nodes (5): #8 연결·설정 검증, 경계, 구현과 검사, 실제 연결, 위임된 수용과 통합

### Community 91 - "#25 장중 실증 준비"
Cohesion: 0.12
Nodes (13): 같은 과업의 변경 전후, 검증 범위, 결정과 근거, 전략 스튜디오의 규칙 저장과 평가 사유, 작업: #19 실시간 수신·재연결·장중 실행 기반, 구현과 검증, 작업: #22 KIS 모의 전략 스튜디오, 후속 진행 수용 (2026-11-16) (+5 more)

### Community 92 - ".submit"
Cohesion: 0.13
Nodes (12): 변경 전후, 설계 판단과 검증, 연결·설정에서 조회 상태 확인과 매매 설정 복귀, KisAuthExpired, KisClient, KisFailure, KisRejected, safeFailure() (+4 more)

### Community 93 - "Store"
Cohesion: 0.17
Nodes (10): instruction, main(), summary(), testOrder(), evidence(), matches(), reconciled(), recoveryCandidates() (+2 more)

### Community 94 - "App.tsx"
Cohesion: 0.25
Nodes (7): #19 실시간 기반 검증, 검증, 공식 계약과 구현 선택, 기술 수용·통합, 리뷰 재개와 수정, 설정과 실행 경계, 최초 독립 리뷰 시도 (후속 결과는 아래)

### Community 95 - ".confirmRecovery"
Cohesion: 0.38
Nodes (5): instruments, master(), quote(), removed, setup()

### Community 96 - "2026-11-17-ui-acceptance.md"
Cohesion: 0.14
Nodes (14): react-router-dom, Event, RealtimeStatus(), DailyDetail(), DataStatus(), date(), kst, policy() (+6 more)

### Community 97 - "#106 원 신호 시각과 모의 주문 사전검사"
Cohesion: 0.33
Nodes (4): 완료 결과와 보존 한계, 작업: 전체 브랜치 통합과 새 세션 재개, 통합 검증, #75 원본 fixture 캡처 보존

### Community 99 - "알림·이벤트의 필터와 읽음 저장 범위"
Cohesion: 0.50
Nodes (4): 같은 예시 4건으로 확인한 변화, 검증과 수용, 알림·이벤트의 필터와 읽음 저장 범위, 화면과 저장 동작

### Community 100 - "2026-11-14 검증 기록"
Cohesion: 0.17
Nodes (7): inventory(), latest, { run }, bars, master, run(), setup()

### Community 102 - "#9 주문·복구 검증"
Cohesion: 0.40
Nodes (4): 삼성전자 모의 주문 시도: 가격 변경으로 전송 차단, 승인과 준비, 실제 관측, 조회 오류와 남은 작업

### Community 104 - "store.ts"
Cohesion: 0.10
Nodes (16): fixture, original, PaperApproval, SocketFactory, stateSnapshotSchema, headers, headers, credentials (+8 more)

### Community 105 - ".riskSnapshot"
Cohesion: 0.29
Nodes (7): 11월 19일 최종 확인, 2026-11-17 후속 화면 수정, 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: #20 관심종목, 현재 결과

### Community 106 - "Orca ‘2차 UI/UX 업그레이드 총괄’ 제작 기록과 업그레이드 방법"
Cohesion: 0.29
Nodes (7): 1. 출발점 — 코드를 몰라도 수정할 곳을 가리킬 수 있게, 2. 원문이 바뀐 네 단계, 3. Orca에 무엇을 어떻게 저장했나, 4. 다음 버전 만들기, 5. 다음 리뷰에서 먼저 볼 두 가지, Orca ‘2차 UI/UX 업그레이드 총괄’ 제작 기록과 업그레이드 방법, 리뷰에서 채택한 것과 조정한 것

### Community 107 - "개인 PC용 KIS 모의 버전 최종 수용"
Cohesion: 0.40
Nodes (5): 개인 PC용 KIS 모의 버전 최종 수용, 검증 결과, 격리 검증, 실제 KIS에서 확인한 범위, 적용 경계

### Community 108 - "작업: #64 SQLite 원장 파일 권한 보호"
Cohesion: 0.29
Nodes (7): 구현·전달 상태, 다음 행동, 먼저 읽을 자료, 목표와 경계, 인수인계, 작업: #64 SQLite 원장 파일 권한 보호, 통합 후 상태

### Community 109 - "KIS 트레이딩 웹앱 조사"
Cohesion: 0.29
Nodes (5): 같은 주문으로 비교한 결과, 검증과 미리보기, 판정과 동작, 현재 주문·체결 조회, paper

### Community 110 - "GitHub 기능 적용"
Cohesion: 0.40
Nodes (4): 계획 리뷰, 실패와 한계, 화면별 세션 계획 검증, 확인 결과

### Community 111 - "README.md"
Cohesion: 0.14
Nodes (10): KIS 트레이딩 웹앱 조사, 공식 자료에서 확인한 제약, 필요한 화면, 확인 범위와 다음 조사, 주문 원장 출처와 KIS 확인 시각, 2026-11-14 검증 기록, 독립 리뷰와 회귀 수정, 보조 검사와 도구 한계 (+2 more)

### Community 112 - "#21 저장 일봉 백테스트 검증"
Cohesion: 0.29
Nodes (7): #21 저장 일봉 백테스트 검증, PR·인계 상태, 공식 출처와 미검증, 입력과 계산, 지정 모델 경계 리뷰, 통합 확인, 확인 결과

### Community 113 - "watchlist-169.spec.ts"
Cohesion: 0.29
Nodes (6): search(), expectDetail(), expectList(), fixture(), instruments, removed

### Community 114 - "71-settings-recovery.md"
Cohesion: 0.24
Nodes (5): House list of words to replace, 문서 작성 기준과 STE 검사, 실행과 판정, 작성 규칙, 적용 범위

### Community 115 - "#6 공통 상태 계약"
Cohesion: 0.33
Nodes (6): #6 공통 상태 계약, 구현 당시 원격 전달, 다음 행동, 먼저 읽을 자료, 통합·완료 — 2026-11-15, 현재 결과

### Community 116 - "1차 화면 이해와 2차 수정 의견"
Cohesion: 0.50
Nodes (4): 1차 화면 이해와 2차 수정 의견, 2차 화면 검토, GitHub에서 바로 둘러보기, 지도 근거와 재개

### Community 119 - "삼성전자 시장가 모의 1회 검증"
Cohesion: 0.50
Nodes (4): 삼성전자 시장가 모의 1회 검증, 새 실행 승인과 시간창 종료, 첫 한정 실행, 코드 검증

### Community 120 - "포트폴리오 계좌 출처와 조회 시각"
Cohesion: 0.40
Nodes (5): 검사와 남은 범위, 검토용 실행 화면, 결정과 근거, 포트폴리오 계좌 출처와 조회 시각, 화면에서 확인한 차이

### Community 121 - "트레이딩 실제 주가 연동"
Cohesion: 0.40
Nodes (4): 검증, 실제 실행 근거, 완료 경계 재확인, 트레이딩 실제 주가 연동

### Community 122 - "작업: #50 전체 브랜치 통합"
Cohesion: 0.33
Nodes (6): 검증과 남은 행동, 다음 행동, 대조와 통합 결정, 먼저 읽을 자료, 병합 근거, 작업: #50 전체 브랜치 통합

### Community 123 - "접속키 실행 경로 실제 적용"
Cohesion: 0.50
Nodes (4): 관측, 남은 순서, 보존·실행 위치, 접속키 실행 경로 실제 적용

### Community 124 - "매매 제한을 어디서 바꿀 것인가"
Cohesion: 0.33
Nodes (6): 구현 결정 후 검증할 것, 매매 제한을 어디서 바꿀 것인가, 세 가지 구조 비교, 세 가지 대표 동선, 제안하는 화면 지도, 현재 화면에서 확인한 문제

### Community 125 - "11월 19일 장중 정상 전략 실증"
Cohesion: 0.50
Nodes (4): 10:33 별도 부분체결 관측, 11월 19일 장중 정상 전략 실증, 14:52 실제 부분체결과 14:59 현재가 변동, 접수·체결 대조

### Community 126 - "#106 원 신호 시각과 모의 주문 사전검사"
Cohesion: 0.67
Nodes (3): #106 원 신호 시각과 모의 주문 사전검사, 부분체결과 잔량 취소, 적용한 개선과 실증 경계

### Community 127 - "zod"
Cohesion: 0.22
Nodes (6): zod, children, kisVariables, realtime, serverEnv, webEnv

### Community 128 - "연결·설정 동작 점검"
Cohesion: 0.40
Nodes (4): 검증 결과, 결론, 연결·설정 동작 점검, 추가 발견

### Community 129 - "작업: 제목"
Cohesion: 0.33
Nodes (5): 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: 제목, 현재 결과

### Community 130 - "#48 KIS 요청 간격 검증"
Cohesion: 0.33
Nodes (6): #48 KIS 요청 간격 검증, 검사와 전달, 수정과 보존, 원격 전달, 원인과 재현, 이번 지정 리뷰

### Community 131 - "모의 전량취소 검증 후보"
Cohesion: 0.40
Nodes (5): 검증, 구현 범위, 근거와 결정, 모의 전량취소 검증 후보, 실행 전 남은 작업

### Community 133 - "25-validation.md"
Cohesion: 0.20
Nodes (4): 11월 18일 장중 검증 (KST), #92 모의 실시간 구독 경로, 통합 SHA 장중 재검증, 관심종목 실접속 후속 수정

### Community 134 - "작업: #21 저장 일봉 백테스트"
Cohesion: 0.40
Nodes (5): 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: #21 저장 일봉 백테스트, 현재 결과

### Community 135 - "작업: #23 매매일지"
Cohesion: 0.40
Nodes (5): 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: #23 매매일지, 현재 결과

### Community 136 - "작업: #65 정적 파일 오류의 내부 경로 보호"
Cohesion: 0.40
Nodes (5): 구현·검증 및 다음 행동, 기준선과 인수인계, 먼저 읽을 자료, 목표와 경계, 작업: #65 정적 파일 오류의 내부 경로 보호

### Community 137 - "삼성전자 모의 주문·취소 실증"
Cohesion: 0.40
Nodes (5): 검증과 한계, 삼성전자 모의 주문·취소 실증, 승인과 사전조건, 실제 관측, 후속 사용자 지시

### Community 138 - "#65 정적 파일 오류의 내부 경로 보호"
Cohesion: 0.40
Nodes (4): #65 정적 파일 오류의 내부 경로 보호, 격리 검증, 근거와 한계, 지정 외부 리뷰

### Community 139 - "#25 장중 실증 준비"
Cohesion: 0.40
Nodes (5): #25 장중 실증 준비, #2 P2 격리 재현, 별도 시작 때 적용할 실행안, 이번 검증과 한계, 증거와 남은 관측

### Community 140 - "#9 주문·복구 검증"
Cohesion: 0.50
Nodes (4): #9 주문·복구 검증, 수용 범위, 실행 결과, 재현과 수정

### Community 141 - "#64 SQLite 파일 권한 검증"
Cohesion: 0.50
Nodes (4): #64 SQLite 파일 권한 검증, 격리 결과, 보호와 보존, 지정 검토와 문서 검사

## Knowledge Gaps
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `KisClient` connect `.submit` to `연결·설정 동작 점검`, `kis.ts`, `화면별 세션 계획 검증`, `Realtime`, `http.ts`, `작업: #48 KIS 요청 간격 CI 실패`, `store.ts`, `#6 공통 상태 계약`, `server/market-data.ts`, `useWorkbench`, `trading-plans.ts`, `작업: 국내 종목 마스터·일봉 수집`, `연결·설정 복구 구현안`, `#8 연결·설정 검증`, `model.ts`, `Store`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Are the 31 inferred relationships involving `makeServer()` (e.g. with `.refreshMaster()` and `.start()`) actually correct?**
  _`makeServer()` has 31 INFERRED edges - model-reasoned connections that need verification._
- **Should `shared/market-data.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10582010582010581 - nodes in this community are weakly interconnected._
- **Why does `Store` connect `model.ts` to `kis.ts`, `trading-plans.ts`, `Realtime`, `2026-11-14 검증 기록`, `http.ts`, `store.ts`, `#6 공통 상태 계약`, `paper.test.ts`, `server/market-data.ts`, `store.ts`, `useWorkbench`, `trading-plans.ts`, `.riskSnapshot`, `PaperBroker`, `.submit`, `#9 최소 모의 실행 절차`, `Store`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `KisClient` (e.g. with `계약과 저장` and `실제 공개 마스터`) actually correct?**
  _`KisClient` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `kis.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Why does `PaperBroker` connect `PaperBroker` to `model.ts`, `Realtime`, `http.ts`, `store.ts`, `agent-evolution.md`, `#6 공통 상태 계약`, `paper.test.ts`, `.riskSnapshot`, `trading-plans.ts`, `.submit`, `model.ts`, `Store`, `App.tsx`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._