# 작업: npm run dev Infisical Machine Identity(Universal Auth) 자동 인증 지원

기준 이슈: https://github.com/krdn/gon-stock03/issues/203

- 상태: 검증 대기 (Claude Opus 5.5 재리뷰 PASS, PR·CI 확인)
- 목표·완료 조건: `npm run dev`([scripts/dev.ts](../../scripts/dev.ts))가 사람 계정 CLI 세션 만료에 의존하지 않고 Infisical Machine Identity(Universal Auth)로 Access Token을 메모리 발급받아 `dev /kis` 4개 키를 API 자식 프로세스에만 안전하게 주입하며, 미설정 시 기존 CLI 조회(및 대화형 터미널 `ETIMEDOUT` 시 `infisical login`)로 폴백하도록 구현하고, `typecheck`/`npm test`/`build` 및 Claude Opus 5.5 (`high`) 독립 재리뷰 PASS 후 커밋·PR·CI 완료
- 허용된 작업·제외 범위: `vite.config.ts`, `scripts/infisical-dev.ts`, `scripts/dev.ts`, `tests/infisical-dev.test.ts`, `tests/ws-startup.test.ts`, `docs/INFISICAL.md`, 작업/상태 문서 / `--realtime`·`dev:morning` 자동 주입 확장 및 실제 Infisical·KIS 원격 호출·`.secrets/` 실자격증명 파일 생성 제외
- 선행 작업·의존관계: [연결·설정 하드닝 #201](201-settings-hardening.md)
- 이슈 / PR: https://github.com/krdn/gon-stock03/issues/203
- 작업 브랜치 / 마지막 확인 SHA: `feat/203-infisical-machine-auth` (기준 `e41fd23` 위 미커밋 변경)

## 먼저 읽을 자료

- `vite.config.ts` (`server.fs.deny` `.secrets/**`, `.local/**` 차단)
- `scripts/infisical-dev.ts` (`readMachineAuthConfig`, `resolveInfisicalDomain`, `fetchKisSecretsViaUniversalAuth`, `applyKisRecords`, `stripInfisicalEnv`)
- `scripts/dev.ts` (`loadDevCredentials`, `rawServerEnv`, `stripInfisicalEnv`)
- `docs/INFISICAL.md` (`로컬 무인 자동 인증 (Machine Identity · Universal Auth)`)
- `tests/infisical-dev.test.ts`, `tests/ws-startup.test.ts`

## 현재 결과

- 완료한 변경:
  - **Vite dev 서버 `.secrets/**`/`.local/**` 차단 (R1 해결)** (`vite.config.ts`): `server.fs.deny`에 Vite 8 기본값 전체 + `.secrets`, `.secrets/**`, `**/.secrets/**`, `.local`, `.local/**`, `**/.local/**`를 추가해 `/.secrets/infisical-dev.json` 및 `?raw`/`?url`/`?import`/`/@fs` 평문 노출을 HTTP 403으로 차단했다.
  - **Machine Identity (Universal Auth) 설정 로더 및 조회 모듈** (`scripts/infisical-dev.ts`):
    - 환경변수(`INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, `INFISICAL_PROJECT_ID`) 우선 확인 후 미설정 시 `.secrets/infisical-dev.json`(또는 `INFISICAL_AUTH_FILE`)을 `O_NOFOLLOW` + `0600` 파일/`0700` 디렉터리(`0o077` 검사, N1 반영)·크기 제한(16KB)·`https://` 검증과 함께 읽는다. 파일 모드에서도 `INFISICAL_DOMAIN` 환경변수를 검증·적용한다(O5 반영).
    - `POST /api/v1/auth/universal-auth/login` → `GET /api/v4/secrets` (404 시 `/api/v3/secrets/raw` 폴백)로 토큰 기반 조회(`imports` 대비 직접 `secrets` 우선) 후 `applyKisRecords` all-or-nothing 주입을 수행한다.
    - `stripInfisicalEnv`로 `dev:server`·`dev:web` 자식 프로세스에서 `INFISICAL_*` 환경변수를 제거하고 오류 사유에 비밀값/토큰을 노출하지 않는다.
  - **`scripts/dev.ts` 연동 및 CLI 만료 폴백**: 머신 인증 시 무인 자동 주입, 미설정(`none`) 시 기존 CLI 조회 및 대화형 터미널 `ETIMEDOUT` 시 `resolveInfisicalDomain` 기준 `infisical login --domain ...` 재시도(O4 반영).
  - **문서·테스트**: `docs/INFISICAL.md`에 Identity TTL 단축/사용량 제한 권고(O2)·`--realtime`/`dev:morning` 범위 외 명시(O3)·`vite.config.ts` 차단 기록. `tests/infisical-dev.test.ts`에 실제 Vite `createServer` 403 회귀 테스트 및 O1 경계 테스트 보강, `tests/ws-startup.test.ts` 환경변수 격리(`INFISICAL_AUTH_FILE=''`).
- 독립 리뷰:
  - 1차 독립 리뷰 (Claude Opus 5.5 `high`): `REQUEST_CHANGES` (`Critical 0 / Required 1 / Optional 5 / Nit 4`) — Required R1(Vite `.secrets` HTTP 200 노출) 및 O1·O2·O3·O4·O5·N1 수정 반영.
  - 완료 경계 독립 재리뷰 (Claude Opus 5.5 `high`): **PASS** (`Critical 0 / Required 0 / Optional 1 / Nit 3`; 실제 Vite 8.3.8 서버 70여 개 경로 차단, `npm test` 307/307, `vite build` 검증 포함).
- 검사 명령·결과 (2026-11-24):
  - `npm run typecheck`: 오류 0건
  - `npm test`: **307/307** 통과 (Vite 403 회귀 포함 `infisical-dev.test.ts` 6건, `ws-startup.test.ts` 21건 포함)
  - `npm run build`: 성공 (`339ms`)
- 미검증·남은 작업:
  - 실제 Infisical Cloud Machine Identity 자격증명 발급 및 원격 API 연동 실측은 사용자 대시보드 설정 후 진행 필요(단위/통합 테스트는 모의 `fetch`·실제 Vite `createServer`로 검증).
  - 재리뷰 Optional 1건(대화형 TTY `infisical login` 성공/실패 후 재조회 분기 테스트) 및 Nit(Vite 테스트 내 `.local` 직접 단언, `**/.local/**` 외부 `~/.local` 경로 참고)는 보류.

## 다음 행동

Claude Opus 5.5 (`high`) 재리뷰 결과를 확인하고, PASS 시 커밋·푸시·PR·CI 통과까지 마무리한다.

## 새 세션 시작 문구

> docs/STATE.md와 docs/tasks/203-infisical-machine-auth.md를 읽고, 관련 이슈(#203)·PR·CI를 확인해 다음 행동부터 이어가줘. 이전 대화와 전체 파일은 다시 읽지 말고, 필요한 부분만 추가로 확인해.
