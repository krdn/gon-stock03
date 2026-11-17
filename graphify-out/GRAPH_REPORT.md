# Graph Report - 65-static-errors  (2026-11-17)

## Corpus Check
- 229 files · ~149,010 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 2, .zip 2, .toml 1)

## Summary
- 1142 nodes · 2517 edges · 71 communities (65 shown, 6 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 135 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f96d453e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App.tsx
- kis.ts
- ref_node_assert
- makeServer
- shared/backtest.ts
- package.json
- #21 저장 일봉 백테스트 검증
- snapshot.ts
- 작업: #12 트레이딩
- application.yml
- files
- 관심종목 검증
- workflow-config.yml
- compilerOptions
- 시장 탐색 검증
- #16 포트폴리오 검증
- 2026-11-14 검증 기록
- interface-sessions-2026-11.md
- 작업: 국내 종목 마스터·일봉 수집
- 작업: 삼성전자 시장가 모의 1회
- realtime.test.ts
- 9-kis-orders-recovery.md
- 후속 개발의 기준선 확정
- 작업: #9 KIS 주문·복구
- body
- #9 최소 모의 실행 절차
- shared/market-data.ts
- 83-graphify-handoff.md
- 화면별 개발 세션 계획
- secrets-management
- STATE.md
- INFISICAL.md
- Infisical 연결과 운영
- #24 설계실 검증
- 작업: 제목
- updates
- 기술 스택 현황, 채택 근거 및 아키텍처 추천
- #9 KIS 주문·복구 계약
- 삼성전자 모의 주문 시도: 가격 변경으로 전송 차단
- #6 공통 상태 계약
- 71-settings-recovery.md
- 작업: #23 매매일지
- #6 공통 상태 검증
- model.ts
- 22-strategies.md
- 모의 전량취소 검증 후보
- 장 마감 후 연결 준비와 복구 점검
- 화면별 세션 계획 검증
- #9 조건부 모의 실행 준비 검증
- 삼성전자 모의 주문·취소 실증
- 로컬 실행과 복구
- KIS 트레이딩 웹앱 조사
- http.ts
- #9 주문·복구 검증
- GitHub 기능 적용
- pull_request_template.md
- Store
- 2026-11-16-orders.md
- 작업: #64 SQLite 원장 파일 권한 보호
- KisClient
- 작업: #65 정적 파일 오류의 내부 경로 보호
- #25 장중 실증 준비
- 작업: #25 장중 통합 실증 준비
- #64 SQLite 파일 권한 검증
- #65 정적 파일 오류의 내부 경로 보호
- 15개 화면의 표시·배치 부분 수용
- 작업: #11 위험관리
- StateSnapshot

## God Nodes (most connected - your core abstractions)
1. `makeServer()` - 63 edges
2. `Store` - 58 edges
3. `KisClient` - 52 edges
4. `files` - 37 edges
5. `Badge()` - 28 edges
6. `useWorkbench()` - 27 edges
7. `Realtime` - 26 edges
8. `PaperBroker` - 25 edges
9. `Panel()` - 24 edges
10. `snapshot()` - 24 edges

## Surprising Connections (you probably didn't know these)
- `계약과 저장` --references--> `KisClient`  [INFERRED]
  docs/operations/market-data.md → server/kis.ts
- `실제 연결` --references--> `KisClient`  [INFERRED]
  docs/verification/2026-11-15-settings.md → server/kis.ts
- `실행 당일 원장·서버 준비` --references--> `Store`  [INFERRED]
  docs/operations/kis-minimum-paper-run.md → server/store.ts
- `공통 상태 계약 (#6)` --references--> `StateSnapshot`  [INFERRED]
  docs/architecture/workbench.md → shared/model.ts
- `실제 공개 마스터` --references--> `KisClient`  [INFERRED]
  docs/verification/2026-11-15-market-data.md → server/kis.ts

## Import Cycles
- None detected.

## Communities (71 total, 6 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.06
Nodes (80): 리뷰 재개와 수정, lucide-react, react, react-router-dom, OrderInput, PaperLedger, dailyRunsSchema, masterDataSchema (+72 more)

### Community 2 - "kis.ts"
Cohesion: 0.11
Nodes (21): zod, amount, balanceSchema, brokerId, Credentials, KisAuthExpired, KisRejected, koreaDate() (+13 more)

### Community 3 - "ref_node_assert"
Cohesion: 0.21
Nodes (6): stateSnapshotSchema, initialState(), headers, headers, credentials, output

### Community 4 - "makeServer"
Cohesion: 0.05
Nodes (30): 2. 조회 시간 제한과 복구, #19 실시간 기반 검증, 검증, 공식 계약과 구현 선택, 기술 수용·통합, 설정과 실행 경계, 최초 독립 리뷰 시도 (후속 결과는 아래), halt() (+22 more)

### Community 5 - "shared/backtest.ts"
Cohesion: 0.17
Nodes (12): createExperiment(), replayExperiment(), backtestDaily(), backtestResultSchema, dailyBacktestInput, DailyBacktestInput, Experiment, experimentListSchema (+4 more)

### Community 6 - "package.json"
Cohesion: 0.06
Nodes (43): dependencies, lucide-react@1.73.0, react@19.3.1, react-dom@19.3.1, react-router-dom@7.18.5, ws@^8.23.0, zod@4.6.7, devDependencies (+35 more)

### Community 7 - "#21 저장 일봉 백테스트 검증"
Cohesion: 0.04
Nodes (38): 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: #21 저장 일봉 백테스트, 현재 결과, 다음 행동, 독립 전달 당시 결과 (통합 전), 먼저 읽을 자료 (+30 more)

### Community 8 - "snapshot.ts"
Cohesion: 0.09
Nodes (22): @playwright/test, disconnectedConnection(), emptyStatus(), dailyFixture(), dashboardState(), bars, master, run() (+14 more)

### Community 9 - "작업: #12 트레이딩"
Cohesion: 0.07
Nodes (17): 2026-11-16 통합 진행 승인, 다음 행동, 먼저 읽을 자료, 작업: #12 트레이딩, 현재 결과, 작업: PR58·59 결합 후보, 작업: #13 주문·체결, 작업: #14 KIS 모의 매매 화면 (+9 more)

### Community 10 - "application.yml"
Cohesion: 0.12
Nodes (16): runs-on, steps, timeout-minutes, jobs, application, name, on, pull_request (+8 more)

### Community 11 - "files"
Cohesion: 0.05
Nodes (39): files, connection/design-desktop.png, connection/design-mobile.png, connection/paper-desktop.png, connection/paper-mobile.png, connection/settings-desktop.png, connection/settings-mobile.png, core/dashboard-desktop-settled.png (+31 more)

### Community 12 - "관심종목 검증"
Cohesion: 0.13
Nodes (13): 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: #20 관심종목, 현재 결과, 공식 출처·경계, 관심종목 검증, 변경과 확인 방법 (+5 more)

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

### Community 17 - "2026-11-14 검증 기록"
Cohesion: 0.50
Nodes (4): 2026-11-14 검증 기록, 독립 리뷰와 회귀 수정, 보조 검사와 도구 한계, 원격 전달과 보조 도구 상태

### Community 18 - "interface-sessions-2026-11.md"
Cohesion: 0.24
Nodes (3): 2차 로컬 기능과 KIS 모의 연결, 1차 화면·설계 시각화, GON Stock

### Community 19 - "작업: 국내 종목 마스터·일봉 수집"
Cohesion: 0.06
Nodes (28): 계약과 저장, 국내 종목·일봉 수집 API, 마스터 정책과 한계, 실행, 품질 판정, 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구 (+20 more)

### Community 20 - "작업: 삼성전자 시장가 모의 1회"
Cohesion: 0.33
Nodes (6): 검증과 다음 행동, 공식 근거와 선택, 변경 계약, 실제 실행과 현재 상태, 작업: 삼성전자 시장가 모의 1회, 최신 main 결합 검증

### Community 21 - "realtime.test.ts"
Cohesion: 0.12
Nodes (8): PaperApproval, SocketFactory, credentials, empty, base, crossing(), priceFrame(), row()

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

### Community 27 - "shared/market-data.ts"
Cohesion: 0.12
Nodes (18): dataStatusSchema, dailyDetailSchema, dailyRunSchema, dailyInput, DailyInput, Exchange, isoDate(), MARKET_PAGE_SIZE (+10 more)

### Community 29 - "화면별 개발 세션 계획"
Cohesion: 0.25
Nodes (8): 15개 화면, Project 운영, 검증 경계, 공통·기준선·실증, 근거와 관리 방식, 이슈와 선후관계, 한 세션의 시작과 종료, 화면별 개발 세션 계획

### Community 30 - "secrets-management"
Cohesion: 0.25
Nodes (7): general, domain, secrets-management, environment, project-id, secret-path, version

### Community 31 - "STATE.md"
Cohesion: 0.13
Nodes (12): 작업 인수인계, 구현·검증, 작업: #80 WebSocket 접속키 메모리 발급, 통합·실제 적용 완료, 삼성전자 시장가 모의 1회 검증, 새 실행 승인과 시간창 종료, 첫 한정 실행, 코드 검증 (+4 more)

### Community 32 - "INFISICAL.md"
Cohesion: 0.16
Nodes (9): 프로젝트 작업 규칙, #23 매매일지 검증, GitHub 개발 운영, 비밀정보와 인프라 접근, 세션별 작업과 재개, 시작, 업데이트와 복구, 작업 (+1 more)

### Community 33 - "Infisical 연결과 운영"
Cohesion: 0.25
Nodes (8): GitHub Actions, Infisical 연결과 운영, WebSocket 접속키 자동 발급, 앱과 AI 실행, 연결 검증, 연결·설정 화면, 인증서와 권한 접근, 프로젝트 연결

### Community 35 - "#24 설계실 검증"
Cohesion: 0.14
Nodes (12): 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: #24 설계실, 현재 결과, #24 설계실 검증, 수용·후속, 실행 근거 (+4 more)

### Community 36 - "작업: 제목"
Cohesion: 0.33
Nodes (5): 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: 제목, 현재 결과

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

### Community 42 - "71-settings-recovery.md"
Cohesion: 0.04
Nodes (41): House list of words to replace, 문서 작성 기준과 STE 검사, 실행과 판정, 작성 규칙, 적용 범위, 1. 실행 환경 진단, 3. 재시도·진행 표시, 검증과 인수 (+33 more)

### Community 43 - "작업: #23 매매일지"
Cohesion: 0.40
Nodes (5): 다음 행동, 먼저 읽을 자료, 새 세션 시작 문구, 작업: #23 매매일지, 현재 결과

### Community 44 - "#6 공통 상태 검증"
Cohesion: 0.33
Nodes (5): #6 공통 상태 검증, 외부 리뷰, 원격 증거, 재현과 결과, 통합 후 확인 — 2026-11-15

### Community 45 - "model.ts"
Cohesion: 0.07
Nodes (37): children, realtime, advanceTick(), backtest(), cancelOrder(), fee(), mean(), placeOrder() (+29 more)

### Community 46 - "22-strategies.md"
Cohesion: 0.17
Nodes (9): 작업: #19 실시간 수신·재연결·장중 실행 기반, 구현과 검증, 작업: #22 KIS 모의 전략 스튜디오, 후속 진행 수용 (2026-11-16), #22 KIS 전략 검증, 구현 결정, 리뷰와 전달, 실패와 수정 (+1 more)

### Community 47 - "모의 전량취소 검증 후보"
Cohesion: 0.40
Nodes (5): 검증, 구현 범위, 근거와 결정, 모의 전량취소 검증 후보, 실행 전 남은 작업

### Community 48 - "장 마감 후 연결 준비와 복구 점검"
Cohesion: 0.33
Nodes (5): 다음 작업 체크리스트, 실패와 보존, 실행 결과, 연결 준비와 공식 근거, 장 마감 후 연결 준비와 복구 점검

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

### Community 54 - "http.ts"
Cohesion: 0.18
Nodes (14): backtestInput, codeSchema, connectionFailureSchema, connectionSchema, eventReadInput, haltInput, idInput, journalInput (+6 more)

### Community 55 - "#9 주문·복구 검증"
Cohesion: 0.50
Nodes (4): #9 주문·복구 검증, 수용 범위, 실행 결과, 재현과 수정

### Community 56 - "GitHub 기능 적용"
Cohesion: 0.50
Nodes (3): 2026-11-15 세션별 실행 관리, GitHub 기능 적용, 이번 구현의 적용

### Community 57 - "pull_request_template.md"
Cohesion: 0.50
Nodes (3): 검증 근거, 문제와 변경, 인수인계

### Community 59 - "Store"
Cohesion: 0.14
Nodes (14): KisDataError, downloadMaster(), MarketData, masterUrl(), parseMaster(), quality(), unzip, Store (+6 more)

### Community 63 - "작업: #64 SQLite 원장 파일 권한 보호"
Cohesion: 0.29
Nodes (7): 구현·전달 상태, 다음 행동, 먼저 읽을 자료, 목표와 경계, 인수인계, 작업: #64 SQLite 원장 파일 권한 보호, 통합 후 상태

### Community 64 - "KisClient"
Cohesion: 0.11
Nodes (14): KisClient, KisFailure, safeFailure(), within(), evidence(), matches(), normalizeId(), reconciled() (+6 more)

### Community 65 - "작업: #65 정적 파일 오류의 내부 경로 보호"
Cohesion: 0.40
Nodes (5): 구현·검증 및 다음 행동, 기준선과 인수인계, 먼저 읽을 자료, 목표와 경계, 작업: #65 정적 파일 오류의 내부 경로 보호

### Community 67 - "#25 장중 실증 준비"
Cohesion: 0.40
Nodes (5): #25 장중 실증 준비, #2 P2 격리 재현, 별도 시작 때 적용할 실행안, 이번 검증과 한계, 증거와 남은 관측

### Community 68 - "작업: #25 장중 통합 실증 준비"
Cohesion: 0.29
Nodes (7): 2026-11-17 최신 실증 경계, 먼저 읽을 자료, 세션 인계, 작업: #25 장중 통합 실증 준비, 장 마감 후 점검 완료, 접속키 적용 완료, 준비 결과와 다음 행동

### Community 69 - "#64 SQLite 파일 권한 검증"
Cohesion: 0.50
Nodes (4): #64 SQLite 파일 권한 검증, 격리 결과, 보호와 보존, 지정 검토와 문서 검사

### Community 70 - "#65 정적 파일 오류의 내부 경로 보호"
Cohesion: 0.40
Nodes (4): #65 정적 파일 오류의 내부 경로 보호, 격리 검증, 근거와 한계, 지정 외부 리뷰

### Community 71 - "15개 화면의 표시·배치 부분 수용"
Cohesion: 0.50
Nodes (4): 15개 화면의 표시·배치 부분 수용, 검토와 격리, 남은 작업, 수용한 자료

### Community 75 - "작업: #11 위험관리"
Cohesion: 0.22
Nodes (6): 결과와 검증, 다음 행동, 먼저 읽을 자료, 작업: #11 위험관리, 전달 대상, 위험관리 검증

### Community 76 - "StateSnapshot"
Cohesion: 0.29
Nodes (7): 공통 상태 계약 (#6), 구현 경계, 기술 결정, 전략과 백테스트, 주문과 복구, 책임과 데이터 흐름, 트레이딩 워크스페이스 설계

## Knowledge Gaps
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Store` connect `Store` to `KisClient`, `kis.ts`, `ref_node_assert`, `makeServer`, `shared/backtest.ts`, `snapshot.ts`, `작업: #11 위험관리`, `model.ts`, `realtime.test.ts`, `http.ts`, `#9 최소 모의 실행 절차`, `shared/market-data.ts`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Are the 28 inferred relationships involving `makeServer()` (e.g. with `.refreshMaster()` and `.start()`) actually correct?**
  _`makeServer()` has 28 INFERRED edges - model-reasoned connections that need verification._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0616191904047976 - nodes in this community are weakly interconnected._
- **Why does `KisClient` connect `KisClient` to `kis.ts`, `ref_node_assert`, `makeServer`, `#21 저장 일봉 백테스트 검증`, `snapshot.ts`, `shared/market-data.ts`, `71-settings-recovery.md`, `작업: 국내 종목 마스터·일봉 수집`, `realtime.test.ts`, `http.ts`, `Store`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `KisClient` (e.g. with `계약과 저장` and `실제 공개 마스터`) actually correct?**
  _`KisClient` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `kis.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11396011396011396 - nodes in this community are weakly interconnected._
- **Should `makeServer` be split into smaller, more focused modules?**
  _Cohesion score 0.05266106442577031 - nodes in this community are weakly interconnected._