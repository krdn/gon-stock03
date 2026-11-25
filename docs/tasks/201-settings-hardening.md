# 작업: 연결·설정 안전 제어 차단·상태 모순·키/401/진단 하드닝

기준 이슈: https://github.com/krdn/gon-stock03/issues/201

- 상태: 완료 (PR #202 머지 `e41fd23`, 이슈 #201 종료)
- 목표·완료 조건: 연결·설정(`/settings`) 및 공통 `act()`/KIS 인증·주입 경로의 안전 제어 차단(`#1+N1`), 상태 모순(`#4`), 키/401/동시 예외 분류(`#2/#3/#6`), 개발 주입 진단(`#7`), 낙관적 상태·토스트 보호(`#5a/#5b/#8b`) 결함을 수정하고 회귀 테스트·빌드·독립 재리뷰(Claude Opus 5.5 `high`) PASS 후 커밋·PR·CI 완료
- 허용된 작업·제외 범위: `src/App.tsx`, `src/pages/Operations.tsx`, `src/pages/Research.tsx`, `src/components/RealtimeStatus.tsx`, `server/kis.ts`, `scripts/dev.ts`, 관련 단위·E2E 회귀 테스트 추가 / `#8a`(20종목 초과 계좌 장중 `tot_evlu_amt` 페이지 간 비교 완화)·실/모의 KIS 원격 API 호출·실행 중 로컬 서버 변경 제외
- 선행 작업·의존관계: [전체 점검·하드닝 #199](199-audit-hardening.md) · [연결·설정 UX #162](162-settings-ux.md)
- 이슈 / PR: https://github.com/krdn/gon-stock03/issues/201 / https://github.com/krdn/gon-stock03/pull/202
- 작업 브랜치 / 마지막 확인 SHA: `fix/201-settings-hardening` → `main` 머지 완료 (`e41fd23`, PR #202)

## 먼저 읽을 자료

- `src/App.tsx` (`pendingActions` 카운터, `refreshState`, `act`, 초기 로딩 배너)
- `src/pages/Operations.tsx` (`Risk` 긴급정지 `halting`, `Settings` `connectionRecovery`/`overview`/`p.qty`)
- `src/components/RealtimeStatus.tsx`, `src/pages/Research.tsx` (실시간·전략 정지 `stopping`)
- `server/kis.ts` (`validSecret`, `configured`, `send` JSON-401 분기, `balance` 래퍼)
- `scripts/dev.ts` (`loadDevCredentials` 누락/충돌 키 이름 진단)
- `tests/kis.test.ts`, `tests/browser/settings.spec.ts`

## 현재 결과

- 완료한 변경:
  - **전역 `busy` 카운터 및 안전 정지 예외 (`#1 + N1`)** (`src/App.tsx`, `src/pages/Operations.tsx`, `src/components/RealtimeStatus.tsx`, `src/pages/Research.tsx`): `busy`를 boolean에서 `pendingActions` 카운터로 전환해 중첩 요청 시 조기 해제를 차단하고, 긴급정지 켜기(`risk/halt`), 실시간 수신 정지(`kis/realtime/stop`), 전략 정지(`active → false`)는 `kis/check` 등 장기 조회 중에도 개별 중복 방지 상태(`halting`/`stopping`)만으로 즉시 실행되도록 분리했다.
  - **인증 실패·만료 vs 유효 잔고 문구/배지 상충 해소 및 표기 정리 (`#4`, `#8c`)** (`src/pages/Operations.tsx`): 60초 내 유효 잔고(`currentBalance`)가 있을 때 인증 만료/실패 안내가 `이전 전체 조회 기준` 대신 `아래 잔고는 최근 전체 조회 기준입니다.`를 표시하도록 수정했고, `retrySeconds === 0` 자연 만료 시 대기 시각 문구 대신 즉시 재조회 갱신 안내로 분기했다. 누락 항목 마침표, 수량 천단위 쉼표, `<button type="button">`을 보완했다.
  - **키 검증·401 본문 파싱·동시 `balance()` 예외 방어 (`#2`, `#3`, `#6`)** (`server/kis.ts`): `KIS_APP_KEY`/`KIS_APP_SECRET` 앞뒤 공백 및 제어문자 포함 시 `configured() === false`, `injection().phase === 'invalid'`로 사전 차단한다. GET 401 응답에 JSON `content-type`이 포함된 경우 본문을 파싱해 `EGW00103`/`105`(권한) 및 `EGW00133`/`201`(호출 제한)으로 분류하되, 비-JSON/빈 본문 401의 기존 만료 재시도·동시 경합 동작은 보존했다. `balance()` 동시 합류 호출자도 `safeFailure()` 정제 래퍼를 거치도록 보강했다.
  - **`scripts/dev.ts` 진단 개선 (`#7`, `N3`)**: all-or-nothing 주입 정책과 비밀값 비노출을 유지한 채, 누락 키 이름과 셸 변수 불일치 키 이름만 경고 메시지에 명시했다.
  - **초기 상태·토스트 보존·초기 로딩 배너 (`#5a`, `#5b`, `#8b`)** (`src/App.tsx`): `kis/check`/`kis/orders` 시작 시 `pages: 0`, `checkStartedAt: null`을 초기화하고, `act()` 완료 후 `refreshState()`가 `'restarted'`/`'failed'`를 반환하면 재시작 경고 토스트를 성공 토스트로 덮어쓰지 않도록 보호했다. 초기 로딩 중 경고 `화면 미리보기` 대신 중립 안내를 표시한다.
- 독립 리뷰:
  - 1차 독립 리뷰 (Claude Opus 5.5 `high`): `#1+N1` P1 타당, `#4` P2 타당, `#2/#3/#7/#5b` 조건부 타당, `#5a/#6/#8c` 대부분 오탐·방어용으로 정리, `#8a` 보류 권고 수용.
  - 완료 경계 독립 재리뷰 (Claude Opus 5.5 `high`): **PASS** (`Critical 0 / Required 0 / Optional 3 / Nit 4`).
- 검사 명령·결과 (2026-11-23):
  - `npm run typecheck`: 오류 0건
  - `npm test`: 301/301 통과 (신규 `kis.test.ts` 2건 포함)
  - `npm run build`: 성공 (`454ms`)
  - `npx playwright test tests/browser/settings.spec.ts tests/browser/common-state.spec.ts tests/browser/risk.spec.ts tests/browser/realtime.spec.ts tests/browser/strategies.spec.ts`: 66/66 통과 (신규 `settings.spec.ts` 3건 포함)
  - Opus 5.5 재리뷰 읽기 전용 전체 검증: Playwright 전체 26개 spec 257/257 통과 및 신규 3건 `--repeat-each=8` 24/24 통과
- 미검증·보류 작업:
  - `#8a`(20종목 초과 계좌 장중 `tot_evlu_amt` 페이지 간 비교 완화)는 실제 KIS 모의 동작 미검증 및 장전 손실정지 영향으로 보류.
  - Opus 5.5 재리뷰 Optional 3건(`act()` `'ignored'` 반환 시 토스트 생략, 3초 폴링 선감지 시 재시작 경고 덮어쓰기 드문 경합, JSON 401 `EGW00121`/`123`/`133`/`201` 추가 단위 테스트)과 Nit 4건 보류.
  - 실제 KIS 모의 원격 API/Infisical 로그인 실측은 수행하지 않음(격리 `fetch`·브라우저 모의 라우트 검증).

## 다음 행동

PR #202의 `main` 머지(`e41fd23`) 및 이슈 #201 종료 완료. 필요 시 보류 항목(`#8a`, Optional 3건)을 후속 이슈로 분리한다.

## 새 세션 시작 문구

> docs/STATE.md와 docs/tasks/201-settings-hardening.md를 읽고, 관련 이슈(#201)·PR·CI를 확인해 다음 행동부터 이어가줘. 이전 대화와 전체 파일은 다시 읽지 말고, 필요한 부분만 추가로 확인해.
