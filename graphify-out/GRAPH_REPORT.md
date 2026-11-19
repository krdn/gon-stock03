# Graph Report - graph  (2026-11-19)

## Corpus Check
- 283 files · ~280,145 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: .zip 2, .toml 1, .example 1)

## Summary
- 1491 nodes · 3482 edges · 112 communities (106 shown, 6 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 180 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6e88f877`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- MarketExplorer.tsx
- 작업: #64 SQLite 원장 파일 권한 보호
- Realtime
- engine.ts
- 작업: #11 위험관리
- PaperBroker
- package.json
- #21 저장 일봉 백테스트 검증
- snapshot
- 13-18-integration.md
- steps
- files
- 관심종목 검증
- workflow-config.yml
- compilerOptions
- 시장 탐색 검증
- #16 포트폴리오 검증
- contracts.ts
- interface-sessions-2026-11.md
- 작업: 국내 종목 마스터·일봉 수집
- 작업: 삼성전자 시장가 모의 1회
- .submit
- 9-kis-orders-recovery.md
- 후속 개발의 기준선 확정
- 작업: #9 KIS 주문·복구
- body
- #9 최소 모의 실행 절차
- inventory.ts
- 작업: Graphify 활용과 자동 인수인계 복구
- 화면별 개발 세션 계획
- secrets-management
- 12-trading.md
- replay.py
- Infisical 연결과 운영
- model.ts
- #24 설계실 검증
- Store
- updates
- 기술 스택 현황, 채택 근거 및 아키텍처 추천
- #9 KIS 주문·복구 계약
- 삼성전자 모의 주문 시도: 가격 변경으로 전송 차단
- #6 공통 상태 계약
- events.ts
- shared/market-data.ts
- #6 공통 상태 검증
- paper.test.ts
- #22 KIS 전략 검증
- 모의 전량취소 검증 후보
- paper.ts
- 화면별 세션 계획 검증
- #9 조건부 모의 실행 준비 검증
- 삼성전자 모의 주문·취소 실증
- 로컬 실행과 복구
- KIS 트레이딩 웹앱 조사
- server/realtime.ts
- #9 주문·복구 검증
- GitHub 기능 적용
- pull_request_template.md
- GitHub 개발 운영
- Trading.tsx
- 2026-11-16-orders.md
- kis.ts
- KisNotSent
- WORKFLOW.md
- 71-settings-recovery.md
- 연결·설정 복구 구현 검증
- 작업: #25 장중 통합 실증 준비
- 25-validation.md
- 11월 18일 장중 주문 전환
- 작업: 연결·설정 복구
- 작업: 제목
- #123 한정 지정가와 매매 정책 검증
- Paper
- shared/backtest.ts
- 2026-11-16-validation-prep.md
- 2026-11-17-ws-apply.md
- gon-stock03 기능 검증과 코딩 에이전트 자기개선 설계
- trading-plans.ts
- replay.mjs
- KIS 연결·설정 화면
- #98 KIS 모의 연속전략 계약
- 25-validation.md
- 연결·설정 복구 구현안
- TradingSettings.tsx
- #25 장중 화면 수용 자료 · 2026-11-18
- 85-consolidation.md
- 작업: #20 관심종목
- 2026-11-14 검증 기록
- #8 연결·설정 검증
- trading-plan.ts
- #19 실시간 기반 검증
- 매매 제한을 어디서 바꿀 것인가
- App.tsx
- dev.ts
- Paper.tsx
- 트레이딩 워크스페이스 설계
- useWorkbench
- .constructor
- FakeSocket
- 작업: 연결·설정
- 연결·설정 동작 점검
- 2026-11-17-ui-acceptance.md
- store.ts
- 트레이딩 실제 주가 연동
- 11월 19일 장중 정상 전략 실증
- replay-entry.sh
- #106 원 신호 시각과 모의 주문 사전검사
- #128 기능 검증과 Astra 에이전트 자기개선 설계
- #92 모의 실시간 구독 경로
- on

## God Nodes (most connected - your core abstractions)
1. `Store` - 77 edges
2. `makeServer()` - 70 edges
3. `KisClient` - 63 edges
4. `useWorkbench()` - 39 edges
5. `PaperBroker` - 38 edges
6. `files` - 37 edges
7. `Panel()` - 36 edges
8. `snapshot()` - 30 edges
9. `Badge()` - 30 edges
10. `won()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `계약과 저장` --references--> `KisClient`  [INFERRED]
  docs/operations/market-data.md → server/kis.ts
- `실제 연결` --references--> `KisClient`  [INFERRED]
  docs/verification/2026-11-15-settings.md → server/kis.ts
- `실행 당일 원장·서버 준비` --references--> `Store`  [INFERRED]
  docs/operations/kis-minimum-paper-run.md → server/store.ts
- `공식 계약과 구현 선택` --references--> `PaperBroker`  [INFERRED]
  docs/verification/2026-11-16-realtime.md → server/paper.ts
- `공통 상태 계약 (#6)` --references--> `StateSnapshot`  [INFERRED]
  docs/architecture/workbench.md → shared/model.ts

## Import Cycles
- None detected.

## Communities (112 total, 6 thin omitted)

### Community 0 - "MarketExplorer.tsx"
Cohesion: 0.22
Nodes (9): category(), MarketExplorer(), focusDetail(), openDetail(), quoteLabel(), tradingLabel(), removed(), time() (+1 more)

### Community 1 - "작업: #64 SQLite 원장 파일 권한 보호"
Cohesion: 0.29
Nodes (7): 구현·전달 상태, 다음 행동, 먼저 읽을 자료, 목표와 경계, 인수인계, 작업: #64 SQLite 원장 파일 권한 보호, 통합 후 상태

### Community 2 - "Realtime"
Cohesion: 0.24
Nodes (3): Realtime, State, fixture()

### Community 3 - "engine.ts"
Cohesion: 0.20
Nodes (23): replayExperiment(), advanceTick(), backtest(), backtestDaily(), cancelOrder(), fee(), halt(), mean() (+15 more)

### Community 4 - "작업: #11 위험관리"
Cohesion: 0.29
Nodes (5): 결과와 검증, 다음 행동, 작업: #11 위험관리, 전달 대상, 위험관리 검증

### Community 5 - "PaperBroker"
Cohesion: 0.13
Nodes (10): 먼저 읽을 자료, main(), summary(), evidence(), normalizeId(), PaperBroker, recoveryCandidates(), sameId() (+2 more)

### Community 6 - "package.json"
Cohesion: 0.05
Nodes (44): dependencies, lucide-react@1.73.0, react@19.3.1, react-dom@19.3.1, react-router-dom@7.18.5, ws@^8.23.0, zod@4.6.7, devDependencies (+36 more)

### Community 7 - "#21 저장 일봉 백테스트 검증"
Cohesion: 0.05
Nodes (36): 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: #21 저장 일봉 백테스트, 현재 결과, 다음 행동, 독립 전달 당시 결과 (통합 전), 먼저 읽을 자료 (+28 more)

### Community 8 - "snapshot"
Cohesion: 0.07
Nodes (27): @playwright/test, storageErrorMessage, dashboardState(), bars, master, run(), setup(), local() (+19 more)

### Community 9 - "13-18-integration.md"
Cohesion: 0.10
Nodes (11): 작업: PR58·59 결합 후보, 작업: #13 주문·체결, 작업: #14 KIS 모의 매매 화면, 2026-11-16 통합 진행 승인, 작업: #17 알림·이벤트, 작업: #18 대시보드, #17 알림·이벤트 검증, #18 대시보드 검증 (+3 more)

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
Cohesion: 0.14
Nodes (12): 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: 시장 탐색, 현재 결과, 공식 근거, 구현과 검사, 롤백 범위 (+4 more)

### Community 16 - "#16 포트폴리오 검증"
Cohesion: 0.14
Nodes (12): 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: #16 포트폴리오, 현재 결과, #16 포트폴리오 검증, 결과와 계산 기준, 독립 리뷰와 수용 경계 (+4 more)

### Community 17 - "contracts.ts"
Cohesion: 0.14
Nodes (12): codeSchema, connectionFailureSchema, eventReadInput, haltInput, idInput, journalInput, paperCancellationSchema, PaperLedger (+4 more)

### Community 18 - "interface-sessions-2026-11.md"
Cohesion: 0.18
Nodes (6): 2차 로컬 기능과 KIS 모의 연결, 1차 화면·설계 시각화, GON Stock, ScreenSpec, sourceRoot, sources

### Community 19 - "작업: 국내 종목 마스터·일봉 수집"
Cohesion: 0.06
Nodes (27): 계약과 저장, 국내 종목·일봉 수집 API, 마스터 정책과 한계, 실행, 품질 판정, 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구 (+19 more)

### Community 20 - "작업: 삼성전자 시장가 모의 1회"
Cohesion: 0.25
Nodes (8): 11월 18일 장중 결과, 검증과 다음 행동, 공식 근거와 선택, 변경 계약, 실제 실행과 현재 상태, 작업: 삼성전자 시장가 모의 1회, 장외 재개 점검, 최신 main 결합 검증

### Community 21 - ".submit"
Cohesion: 0.16
Nodes (6): matches(), reconciled(), withinApproval(), PaperOrderInput, PaperAudit, PaperOrder

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

### Community 27 - "inventory.ts"
Cohesion: 0.13
Nodes (25): AstNode, Check, checks, child(), children(), eachChild(), features, gaps (+17 more)

### Community 29 - "화면별 개발 세션 계획"
Cohesion: 0.25
Nodes (8): 15개 화면, Project 운영, 검증 경계, 공통·기준선·실증, 근거와 관리 방식, 이슈와 선후관계, 한 세션의 시작과 종료, 화면별 개발 세션 계획

### Community 30 - "secrets-management"
Cohesion: 0.25
Nodes (7): general, domain, secrets-management, environment, project-id, secret-path, version

### Community 31 - "12-trading.md"
Cohesion: 0.17
Nodes (9): 2026-11-16 통합 진행 승인, 2026-11-17 후속 화면 수정, 다음 행동, 먼저 읽을 자료, 실제 주가 연동, 작업: #12 트레이딩, 현재 결과, #12 트레이딩 검증 (+1 more)

### Community 32 - "replay.py"
Cohesion: 0.21
Nodes (5): claim(), digest(), file_digest(), main(), tree_digest()

### Community 33 - "Infisical 연결과 운영"
Cohesion: 0.25
Nodes (8): GitHub Actions, Infisical 연결과 운영, WebSocket 접속키 자동 발급, 앱과 AI 실행, 연결 검증, 연결·설정 화면, 인증서와 권한 접근, 프로젝트 연결

### Community 34 - "model.ts"
Cohesion: 0.16
Nodes (13): PaperCancellation, BacktestInput, BacktestResult, BrokerOrder, Connection, Journal, Market, Order (+5 more)

### Community 35 - "#24 설계실 검증"
Cohesion: 0.14
Nodes (12): 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: #24 설계실, 현재 결과, #24 설계실 검증, 수용·후속, 실행 근거 (+4 more)

### Community 36 - "Store"
Cohesion: 0.11
Nodes (16): createExperiment(), downloadMaster(), MarketData, masterUrl(), parseMaster(), quality(), unzip, Store (+8 more)

### Community 37 - "updates"
Cohesion: 0.29
Nodes (6): interval, updates, directory, package-ecosystem, schedule, version

### Community 38 - "기술 스택 현황, 채택 근거 및 아키텍처 추천"
Cohesion: 0.33
Nodes (6): 1. 현재 사용 중인 기술 스택, 2. 왜 이 기술들을 선택했는가? (채택 근거와 추론 사슬), 3.1 1단계 추천: 현재 로컬 워크스페이스 범위 유지 시 (현행 스택 유지 + 3가지 보강), 3.2 2단계 추천: 운영 서버(`192.168.0.5`) 상시 배포 및 본격 자동매매 확장 시, 3. 판단 및 추천 사항 (단계별 아키텍처 제안), 기술 스택 현황, 채택 근거 및 아키텍처 추천

### Community 39 - "#9 KIS 주문·복구 계약"
Cohesion: 0.33
Nodes (6): 2026-11-16 전량취소 규격 재조사, #9 KIS 주문·복구 계약, 공식 계약과 판단, 공식 문의 초안 — 미발송, 공통 서비스 계약, 차단 범위와 대안 결정

### Community 40 - "삼성전자 모의 주문 시도: 가격 변경으로 전송 차단"
Cohesion: 0.40
Nodes (4): 삼성전자 모의 주문 시도: 가격 변경으로 전송 차단, 승인과 준비, 실제 관측, 조회 오류와 남은 작업

### Community 41 - "#6 공통 상태 계약"
Cohesion: 0.33
Nodes (6): #6 공통 상태 계약, 구현 당시 원격 전달, 다음 행동, 먼저 읽을 자료, 통합·완료 — 2026-11-15, 현재 결과

### Community 42 - "events.ts"
Cohesion: 0.29
Nodes (6): action, paperEvent(), presentEvent(), status, Event, headers

### Community 43 - "shared/market-data.ts"
Cohesion: 0.15
Nodes (18): lucide-react, Exchange, isoDate(), MARKET_PAGE_SIZE, MARKET_REFRESH_MS, MARKET_STALE_MS, marketDate, marketQuoteInput (+10 more)

### Community 44 - "#6 공통 상태 검증"
Cohesion: 0.33
Nodes (5): #6 공통 상태 검증, 외부 리뷰, 원격 증거, 재현과 결과, 통합 후 확인 — 2026-11-15

### Community 45 - "paper.test.ts"
Cohesion: 0.11
Nodes (16): kis, port, server, sources, store, paperApprovalSchema, activeTerms(), readPreparedRun() (+8 more)

### Community 46 - "#22 KIS 전략 검증"
Cohesion: 0.17
Nodes (9): 작업: #19 실시간 수신·재연결·장중 실행 기반, 구현과 검증, 작업: #22 KIS 모의 전략 스튜디오, 후속 진행 수용 (2026-11-16), #22 KIS 전략 검증, 구현 결정, 리뷰와 전달, 실패와 수정 (+1 more)

### Community 47 - "모의 전량취소 검증 후보"
Cohesion: 0.40
Nodes (5): 검증, 구현 범위, 근거와 결정, 모의 전량취소 검증 후보, 실행 전 남은 작업

### Community 48 - "paper.ts"
Cohesion: 0.12
Nodes (17): checkApprovedLimit(), configuredApproval, kospiStockTick(), krxSession, lowerLimitApprovalSchema, paperCapabilities, preparedApprovalSchema, sessionTime (+9 more)

### Community 49 - "화면별 세션 계획 검증"
Cohesion: 0.40
Nodes (4): 계획 리뷰, 실패와 한계, 화면별 세션 계획 검증, 확인 결과

### Community 50 - "#9 조건부 모의 실행 준비 검증"
Cohesion: 0.40
Nodes (5): #9 조건부 모의 실행 준비 검증, 기준과 변경, 로컬 구성과 남은 사실, 실행한 검사, 지정 리뷰와 한계

### Community 51 - "삼성전자 모의 주문·취소 실증"
Cohesion: 0.40
Nodes (5): 검증과 한계, 삼성전자 모의 주문·취소 실증, 승인과 사전조건, 실제 관측, 후속 사용자 지시

### Community 52 - "로컬 실행과 복구"
Cohesion: 0.50
Nodes (4): 검사, 로컬 실행과 복구, 사용 순서, 저장·중지·복구

### Community 53 - "KIS 트레이딩 웹앱 조사"
Cohesion: 0.50
Nodes (4): KIS 트레이딩 웹앱 조사, 공식 자료에서 확인한 제약, 필요한 화면, 확인 범위와 다음 조사

### Community 54 - "server/realtime.ts"
Cohesion: 0.12
Nodes (16): initial(), RealtimeConfig, sessionSchema, Socket, configuredPaperOrderInput, OrderInput, paperOrderInput, StrategyEvaluation (+8 more)

### Community 55 - "#9 주문·복구 검증"
Cohesion: 0.50
Nodes (4): #9 주문·복구 검증, 수용 범위, 실행 결과, 재현과 수정

### Community 56 - "GitHub 기능 적용"
Cohesion: 0.50
Nodes (3): 2026-11-15 세션별 실행 관리, GitHub 기능 적용, 이번 구현의 적용

### Community 57 - "pull_request_template.md"
Cohesion: 0.50
Nodes (3): 검증 근거, 문제와 변경, 인수인계

### Community 58 - "GitHub 개발 운영"
Cohesion: 0.25
Nodes (8): GitHub 개발 운영, Graphify 코드 구조 조회와 기록, 비밀정보와 인프라 접근, 세션별 작업과 재개, 시작, 업데이트와 복구, 작업, 협업과 GitHub 기능

### Community 59 - "Trading.tsx"
Cohesion: 0.17
Nodes (23): paperLedgerSchema, Instrument, orderStatus, won(), portfolioValue(), Change(), Chart(), DataStatusLine() (+15 more)

### Community 63 - "kis.ts"
Cohesion: 0.06
Nodes (31): 실제 공개 마스터, credentials, samples, checkSession(), instruction, testOrder(), amount, balanceSchema (+23 more)

### Community 64 - "KisNotSent"
Cohesion: 0.18
Nodes (6): KisFailure, KisNotSent, safeFailure(), within(), ConnectionFailure, ConnectionState

### Community 65 - "WORKFLOW.md"
Cohesion: 0.20
Nodes (7): 프로젝트 작업 규칙, 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: #23 매매일지, 현재 결과, #23 매매일지 검증

### Community 66 - "71-settings-recovery.md"
Cohesion: 0.24
Nodes (5): House list of words to replace, 문서 작성 기준과 STE 검사, 실행과 판정, 작성 규칙, 적용 범위

### Community 67 - "연결·설정 복구 구현 검증"
Cohesion: 0.33
Nodes (6): STE 복구, 변경, 연결·설정 복구 구현 검증, 외부 리뷰와 한계, 원격 전달, 재현과 검사

### Community 68 - "작업: #25 장중 통합 실증 준비"
Cohesion: 0.12
Nodes (16): 11월 18일 Argon 종결 검토, 11월 18일 오후 실제 주문 전환, 11월 18일 읽기 전용 후속 관측, 11월 18일 장중 화면 수용 대기, 14:02 후속 실증, 2026-11-17 당시 실증 경계, 기존 주문 기록과 격리 전환 검증, 다음 정규장 재개 (+8 more)

### Community 69 - "25-validation.md"
Cohesion: 0.12
Nodes (11): 작업 인수인계, #107 전용 KIS 모의 주문 테스트, #116 KIS 모의 매매 페이지 잔량 취소, 주문당 수량 설정 · 11월 19일, 매매 설정과 다음 실행 고정, #129 오프라인 기능 목록과 관심종목 회귀, Opus 5.5 독립 리뷰 후 검증, 관심종목 실접속 후속 수정 (+3 more)

### Community 70 - "11월 18일 장중 주문 전환"
Cohesion: 0.33
Nodes (6): 11월 18일 장중 주문 전환, 15:12 조건부 전략 종료, 실제 신호에서 전송 직전까지, 실제 주문과 같은 시점의 PC·모바일 화면, 실제 지정가 주문의 통제된 응답 유실, 전략 전송 지연 측정

### Community 71 - "작업: 연결·설정 복구"
Cohesion: 0.25
Nodes (8): STE 검사 복구, 결과와 다음 행동, 다음 작업 점검, 소유권 인계 증거, 실제 연결 검증과 마감, 작업: 연결·설정 복구, 통합 완료, 필수 자료

### Community 72 - "작업: 제목"
Cohesion: 0.33
Nodes (5): 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: 제목, 현재 결과

### Community 73 - "#123 한정 지정가와 매매 정책 검증"
Cohesion: 0.29
Nodes (7): #123 한정 지정가와 매매 정책 검증, 136,300원 주문이 갈리는 지점, #25와의 연결, 검증과 설계 리뷰, 나머지 정책의 집행 조건, 매매설정에서 새 테스트 계약 구성, 첫 격리 검증 당시의 범위

### Community 74 - "Paper"
Cohesion: 0.18
Nodes (9): 리뷰 재개와 수정, samePaperIntent(), act(), PaperCancellationPanel(), cancel(), reconcile(), Paper(), loadLedger() (+1 more)

### Community 75 - "shared/backtest.ts"
Cohesion: 0.16
Nodes (13): backtestResultSchema, dailyBacktestInput, DailyBacktestInput, experimentListSchema, experimentSchema, ExperimentSnapshot, experimentSnapshotSchema, experimentSummarySchema (+5 more)

### Community 76 - "2026-11-16-validation-prep.md"
Cohesion: 0.09
Nodes (18): 구현·검증 및 다음 행동, 기준선과 인수인계, 먼저 읽을 자료, 목표와 경계, 작업: #65 정적 파일 오류의 내부 경로 보호, #64 SQLite 파일 권한 검증, 격리 결과, 보호와 보존 (+10 more)

### Community 77 - "2026-11-17-ws-apply.md"
Cohesion: 0.22
Nodes (7): 구현·검증, 작업: #80 WebSocket 접속키 메모리 발급, 통합·실제 적용 완료, 관측, 남은 순서, 보존·실행 위치, 접속키 실행 경로 실제 적용

### Community 78 - "gon-stock03 기능 검증과 코딩 에이전트 자기개선 설계"
Cohesion: 0.22
Nodes (9): gon-stock03 기능 검증과 코딩 에이전트 자기개선 설계, 기능별 검증표, 실행 권한과 실패 처리, 에이전트가 다음 세대로 넘어가는 조건, 연구에서 선택한 방법, 제품 변경 한 건의 흐름, 첫 실험과 도입 순서, 출발점 (+1 more)

### Community 79 - "trading-plans.ts"
Cohesion: 0.25
Nodes (14): assertStrategyIdentity(), assetKind(), fixInput, fixTradingDraft(), inspectPreparedRun(), kindSchema, planStem(), saveInput (+6 more)

### Community 80 - "replay.mjs"
Cohesion: 0.18
Nodes (4): codes, instruments, results, runtime

### Community 81 - "KIS 연결·설정 화면"
Cohesion: 0.29
Nodes (6): 4303 실측, KIS 연결·설정 화면, Opus 5.5 병합 리뷰, 인증된 계좌의 잔고 갱신 동선, 일반 개발 서버의 자동 주입, 회귀와 리뷰

### Community 82 - "#98 KIS 모의 연속전략 계약"
Cohesion: 0.33
Nodes (5): #25 격리 테스트 계약, #98 KIS 모의 연속전략 계약, 검증 기록, 계약 입력과 시작, 상태 전이와 실패 처리

### Community 83 - "25-validation.md"
Cohesion: 0.12
Nodes (14): 다음 작업 체크리스트, 실패와 보존, 실행 결과, 연결 준비와 공식 근거, 장 마감 후 연결 준비와 복구 점검, 남은 작업 순서, 새 세션 시작, 완료·관측 범위 (+6 more)

### Community 84 - "연결·설정 복구 구현안"
Cohesion: 0.29
Nodes (7): 1. 실행 환경 진단, 3. 재시도·진행 표시, 검증과 인수, 구현 순서와 완료 조건, 방향, 연결·설정 복구 구현안, 출처와 제한

### Community 85 - "TradingSettings.tsx"
Cohesion: 0.18
Nodes (24): tradingTerms, TradingTerms, defaultOncePolicy(), defaultStrategyPolicy(), krxHours(), OncePolicy, StrategyPolicy, NumberField() (+16 more)

### Community 86 - "#25 장중 화면 수용 자료 · 2026-11-18"
Cohesion: 0.33
Nodes (6): 14시 장중 재시작·단절 복구, #25 잔여 판단, #25 장중 화면 수용 자료 · 2026-11-18, Opus 5.5 위임 수용 판정, 체결 원장과 13:45 잔고, 후속 화면 · 기존 앱의 저장 주문과 잔고

### Community 87 - "85-consolidation.md"
Cohesion: 0.33
Nodes (4): 완료 결과와 보존 한계, 작업: 전체 브랜치 통합과 새 세션 재개, 통합 검증, #75 원본 fixture 캡처 보존

### Community 88 - "작업: #20 관심종목"
Cohesion: 0.33
Nodes (6): 2026-11-17 후속 화면 수정, 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: #20 관심종목, 현재 결과

### Community 89 - "2026-11-14 검증 기록"
Cohesion: 0.50
Nodes (4): 2026-11-14 검증 기록, 독립 리뷰와 회귀 수정, 보조 검사와 도구 한계, 원격 전달과 보조 도구 상태

### Community 90 - "#8 연결·설정 검증"
Cohesion: 0.33
Nodes (5): #8 연결·설정 검증, 경계, 구현과 검사, 실제 연결, 위임된 수용과 통합

### Community 91 - "trading-plan.ts"
Cohesion: 0.24
Nodes (8): DEFAULT_PAPER_MAX_QTY, amount, instant, PlanKind, PlanRecord, PlanVersion, strategyTerms, TradingSettingsData

### Community 92 - "#19 실시간 기반 검증"
Cohesion: 0.29
Nodes (6): #19 실시간 기반 검증, 검증, 공식 계약과 구현 선택, 기술 수용·통합, 설정과 실행 경계, 최초 독립 리뷰 시도 (후속 결과는 아래)

### Community 93 - "매매 제한을 어디서 바꿀 것인가"
Cohesion: 0.33
Nodes (6): 구현 결정 후 검증할 것, 매매 제한을 어디서 바꿀 것인가, 세 가지 구조 비교, 세 가지 대표 동선, 제안하는 화면 지도, 현재 화면에서 확인한 문제

### Community 94 - "App.tsx"
Cohesion: 0.10
Nodes (20): connectionSchema, DataStatus, authenticationStatus(), BALANCE_STALE_MS, disconnectedConnection(), LOCAL_STALE_MS, QUOTE_REFRESH_MS, App() (+12 more)

### Community 95 - "dev.ts"
Cohesion: 0.22
Nodes (6): zod, children, kisVariables, realtime, serverEnv, webEnv

### Community 96 - "Paper.tsx"
Cohesion: 0.21
Nodes (16): react-router-dom, addDays(), freshness(), RealtimeStatus(), Badge(), Empty(), DailyDetail(), DataStatus() (+8 more)

### Community 97 - "트레이딩 워크스페이스 설계"
Cohesion: 0.25
Nodes (8): 공통 상태 계약 (#6), 구현 경계, 기술 결정, 전략과 백테스트, 주문과 복구, 책임과 데이터 흐름, 트레이딩 워크스페이스 설계, StateSnapshot

### Community 98 - "useWorkbench"
Cohesion: 0.17
Nodes (15): react, dailyRunsSchema, PaperQuantitySetting(), RiskLimitSettings(), Panel(), useWorkbench(), Backtest(), dateInput() (+7 more)

### Community 99 - ".constructor"
Cohesion: 0.23
Nodes (3): 2. 조회 시간 제한과 복구, PaperKrxSession, StrategyContract

### Community 100 - "FakeSocket"
Cohesion: 0.29
Nodes (3): crossing(), FakeSocket, priceFrame()

### Community 101 - "작업: 연결·설정"
Cohesion: 0.33
Nodes (6): 2026-11-17 세부 동작 재점검, 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: 연결·설정, 현재 결과

### Community 102 - "연결·설정 동작 점검"
Cohesion: 0.40
Nodes (4): 검증 결과, 결론, 연결·설정 동작 점검, 추가 발견

### Community 103 - "2026-11-17-ui-acceptance.md"
Cohesion: 0.40
Nodes (4): 15개 화면의 표시·배치 부분 수용, 검토와 격리, 남은 작업, 수용한 자료

### Community 104 - "store.ts"
Cohesion: 0.13
Nodes (11): fixture, original, stateSnapshotSchema, emptyStatus(), dailyFixture(), headers, credentials, empty (+3 more)

### Community 105 - "트레이딩 실제 주가 연동"
Cohesion: 0.50
Nodes (4): 검증, 실제 실행 근거, 완료 경계 재확인, 트레이딩 실제 주가 연동

### Community 106 - "11월 19일 장중 정상 전략 실증"
Cohesion: 0.50
Nodes (4): 10:33 별도 부분체결 관측, 11월 19일 장중 정상 전략 실증, 14:52 실제 부분체결과 14:59 현재가 변동, 접수·체결 대조

### Community 108 - "#106 원 신호 시각과 모의 주문 사전검사"
Cohesion: 0.67
Nodes (3): #106 원 신호 시각과 모의 주문 사전검사, 부분체결과 잔량 취소, 적용한 개선과 실증 경계

### Community 109 - "#128 기능 검증과 Astra 에이전트 자기개선 설계"
Cohesion: 0.67
Nodes (3): #128 기능 검증과 Astra 에이전트 자기개선 설계, 먼저 읽을 자료, 확인과 다음 행동

### Community 110 - "#92 모의 실시간 구독 경로"
Cohesion: 0.67
Nodes (3): 11월 18일 장중 검증 (KST), #92 모의 실시간 구독 경로, 통합 SHA 장중 재검증

### Community 111 - "on"
Cohesion: 0.67
Nodes (3): on, pull_request, push

## Knowledge Gaps
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Store` connect `Store` to `Realtime`, `engine.ts`, `.constructor`, `PaperBroker`, `store.ts`, `events.ts`, `shared/backtest.ts`, `paper.test.ts`, `trading-plans.ts`, `paper.ts`, `.submit`, `server/realtime.ts`, `#9 최소 모의 실행 절차`, `trading-plan.ts`, `kis.ts`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Are the 30 inferred relationships involving `makeServer()` (e.g. with `.refreshMaster()` and `.start()`) actually correct?**
  _`makeServer()` has 30 INFERRED edges - model-reasoned connections that need verification._
- **Should `PaperBroker` be split into smaller, more focused modules?**
  _Cohesion score 0.12666666666666668 - nodes in this community are weakly interconnected._
- **Why does `KisClient` connect `kis.ts` to `KisNotSent`, `Realtime`, `engine.ts`, `.constructor`, `PaperBroker`, `연결·설정 동작 점검`, `Store`, `store.ts`, `snapshot`, `events.ts`, `shared/market-data.ts`, `paper.test.ts`, `trading-plans.ts`, `paper.ts`, `작업: 국내 종목 마스터·일봉 수집`, `.submit`, `#8 연결·설정 검증`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `KisClient` (e.g. with `계약과 저장` and `실제 공개 마스터`) actually correct?**
  _`KisClient` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05410628019323672 - nodes in this community are weakly interconnected._
- **Should `#21 저장 일봉 백테스트 검증` be split into smaller, more focused modules?**
  _Cohesion score 0.047619047619047616 - nodes in this community are weakly interconnected._