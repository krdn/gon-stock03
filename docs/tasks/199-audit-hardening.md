# 작업: 프로젝트 전반 점검·하드닝 (장전 스캔 확장성·경계 버그·동적 포트·신뢰 시계)

기준 이슈: https://github.com/krdn/gon-stock03/issues/199

- 상태: 검증 대기 (PR 검토·원격 CI 확인)
- 목표·완료 조건: 장전 스캔 DB 확장성 분리, 장전/이월/재연결 경계 결함 수정, RSS 엔티티 디코딩, 테스트 동적 포트 전환 및 우아한 종료, 프론트엔드 `serverNow` 기반 신뢰 시계 통일, 전체 로컬 검증(`typecheck`, 단위, `build`, E2E) 및 독립 재리뷰 PASS 후 PR 생성
- 허용된 작업·제외 범위: 서버·프론트엔드·테스트 버그 수정과 회귀 테스트 추가 / 실·모의 KIS 원격 주문, `.local/`·`graphify-out/`·실행 중 로컬 서버(4303/4304/4328/4397) 변경, `TradingSettings.tsx` 분할·과거 Git 이력 정리는 제외
- 선행 작업·의존관계: [#197 장전 포트폴리오 운용](197-morning.md)
- 이슈 / PR: https://github.com/krdn/gon-stock03/issues/199
- 작업 브랜치 / 마지막 확인 SHA: `fix/199-audit-hardening` (`aea3e67` 기준 작업 커밋 예정)

## 먼저 읽을 자료

- `server/store.ts` (`morning_daily_bars`, `morning_scan_meta`, `saveMorningScanSymbol`, `morningRecentBars`, `morningIncompleteMeta`, `carryPreviewCodes`)
- `server/morning-scan.ts` (`MorningScan.collect`)
- `server/morning.ts` (`evaluateBars`, `buildMorning`)
- `server/http.ts` (`generateMorning`, `/api/data/daily`, `/api/morning`, `/api/morning/approve`, `/api/morning/carry/start`)
- `server/realtime.ts` (`Realtime.prepareMorning`, `canMonitorCarry`, `armMorning`)
- `server/morning-news.ts` (`decodeEntities`, `parseNews`)
- `server/index.ts` (`stop` 우아한 종료)
- `src/components/RealtimeStatus.tsx`, `src/pages/DataInventory.tsx`, `src/pages/MarketExplorer.tsx`, `src/pages/Paper.tsx` (`serverNow` 통일)
- `tests/test-server.ts`, `tests/morning.test.ts`, `tests/realtime.test.ts`, `tests/data-inventory.test.ts`, `tests/browser/realtime.spec.ts`

## 현재 결과

- 완료한 변경:
  - **장전 스캔 저장소 분리 및 정합성** (`server/store.ts`, `server/morning-scan.ts`, `server/morning.ts`): `MorningScan`이 `daily_runs`를 오염시키지 않도록 전용 `morning_daily_bars`/`morning_scan_meta` 테이블로 분리하고 `incomplete` 캐시를 도입했다. `passed` 저장 시 이전 바를 정리하고, `incomplete`/무효(거래량 0) 종목이 과거 `daily_runs`로 되살아나는 경로를 차단했으며, `stopped` 또는 개장 시각 이후 응답/예외(`KisDataError('contract')`) 저장을 막았다.
  - **장전/이월/재연결 경계 수정** (`server/http.ts`, `server/realtime.ts`, `server/store.ts`): 개장 시각을 넘겨 끝난 `generateMorning()`에 `'당일 승인 불가'` 경고와 종료 시각을 반영하고 `POST /api/morning/approve`에서도 차단했다. `POST /api/morning/carry/start`는 `resolveCarryPrevious` 후 `bindNextSession` 전 단일 동기 구간에서 보고서 JSON 사전 검증(`store.morning`, `carryPreviewCodes`) 및 `canMonitorCarry`를 검증해 400 응답 시 원장 무변경을 보장한다. `Realtime`은 `socket` 또는 재연결 백오프(`retry`) 중에도 포트폴리오 구독(`morningCodes`)이 불필요하게 초기화·축소되지 않도록 보강했고, `/api/morning` 저장소 500 오류 문구를 `/api/trading-settings`와 분리했다.
  - **RSS·서버 종료·테스트 격리** (`server/morning-news.ts`, `server/http.ts`, `server/index.ts`, `tests/test-server.ts`, `tests/*.test.ts`): RSS 엔티티 디코딩을 보완하고, `GET /api/data/daily?limit=`를 선택 파라미터(미지정 시 전체, 지정 시 1..500 검증)로 지원했다. `server/index.ts` 종료 시 `closeIdleConnections()`로 유휴 keep-alive만 닫아 진행 중인 KIS 주문 요청을 보호하며(2회 신호 시 강제 종료), 단위 테스트 전체를 OS 동적 포트(`127.0.0.1:0`)로 전환했다.
  - **신뢰 시계 통일** (`src/components/RealtimeStatus.tsx`, `src/pages/DataInventory.tsx`, `src/pages/MarketExplorer.tsx`, `src/pages/Paper.tsx`, `tests/browser/realtime.spec.ts`): 브라우저 `Date.now()` 대신 서버 기준 시각(`serverNow`)을 사용해 클라이언트 시계 오차로 인한 오탐을 제거했다.
- 검사 명령·결과:
  - `npm run typecheck`: 오류 0건
  - `npm test`: 299/299 통과 (실패 0건; 기존 포트 4328/4397 충돌 환경에서 통과 + 신규 회귀 테스트 포함)
  - `npm run build`: 성공 (`384ms`)
  - `npm run test:e2e`: 304/304 통과 (`2.8m`)
  - 독립 재리뷰(읽기 전용): Claude Opus 5.5 (`claude-opus-5-5`, high) **PASS** (`Critical 0 / Required 0 / Optional 0 / Nit 0`), Codex (`gpt-6.2-sol`) **PASS** (`Critical 0 / Required 0 / Optional 1 / Nit 0`)
- 미검증·남은 작업:
  - 실제 KIS 모의 서버 원격 API/WebSocket 및 실주문 경로는 호출하지 않음(모의 `fetch`/소켓 픽스처 검증).
  - `graphify` CLI 미설치로 `graphify-out/`은 재생성하지 못하고 기존 파일 보존.
  - 보류(Optional): 브라우저 `serverNow` 폴백 정리(`src/pages/{DataInventory,MarketExplorer,Paper}.tsx`), 저장 보고서 `watch` 배열 형식 스키마 검사 보강(`server/realtime.ts:33`), `TradingSettings.tsx` 분할.
- 결정과 이유·보존할 사용자 변경:
  - `.local/workspace.sqlite`, `graphify-out/`, 실행 중인 4303·4304·4328·4397 프로세스를 보존했다.
  - `public/project-map.html` 인라인 스크립트 호환을 위해 전역 CSP 헤더는 추가하지 않았다.
  - `orders-dashboard-integration.spec.ts` 실행 중 덮어쓰인 검증 스크린샷 3건은 `git checkout`으로 원복했다.

## 다음 행동

PR의 GitHub Actions CI 통과와 머지 여부를 확인하고, 필요 시 Optional 항목(`watch` 배열 검증 등) 후속 이슈를 분리한다.

## 새 세션 시작 문구

> docs/STATE.md와 docs/tasks/199-audit-hardening.md를 읽고, 관련 이슈(#199)·PR·CI 상태를 확인해 다음 행동부터 이어가줘. 이전 대화와 전체 파일은 다시 읽지 말고, 필요한 부분만 추가로 확인해.
