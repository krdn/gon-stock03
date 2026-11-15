# 작업: #20 관심종목

기준 이슈: https://github.com/krdn/gon-stock03/issues/20

- 상태: 검증 대기
- 목표·완료 조건: 실제 마스터 관심종목의 화면 간 공유, 새로고침/재시작 보존·중복 방지, 저장 실패·빈 목록, 수신 시각, 선택코드 주문 화면 이동.
- 허용된 작업·제외 범위: 기존 저장·조회·공통 캐시 재사용. 실제 KIS 주문·취소·전략 실행과 스택 리팩터링 제외.
- 선행 작업·의존관계: #10 completed 및 PR #33/#34 통합 확인. 기준 main `865c3007e99620e9fa5821e7496246869ff04dec`, 앱43684112604·구성43684112485 SUCCESS.
- 이슈 / PR: #20 / 생성 전
- 작업 브랜치 / 마지막 확인 SHA: `feat/20-watchlist` / 위 기준 main

## 먼저 읽을 자료

- `AGENTS.md`, `docs/WORKFLOW.md`, `docs/plans/interface-sessions-2026-11.md` S03·운영 규칙
- `src/pages/Workspace.tsx`, `src/pages/MarketExplorer.tsx`, `src/pages/Paper.tsx`, `src/specs.ts`
- `server/http.ts` 관심목록·시세 경로, `server/store.ts` 저장 트랜잭션, `server/engine.ts` 기존 DEMO 상태
- `tests/market.test.ts`, `tests/browser/market.spec.ts`, `tests/browser/workbench.spec.ts`

## 현재 결과

- 완료한 변경: 실제 마스터 관심목록·화면 공유·미확인/제외 코드 보존·실패/빈 상태·수신시각·선택코드 /paper 이동. 기존 저장·시세 캐시 재사용. SQLite 저장 오류는 안전한500응답으로 구분한다. `src/specs.ts`와 상단 데이터 배지를 갱신했다.
- 검사: `gon-workflow ready .`, `implementation-ready .`, 단위63·브라우저45·빌드 통과. 새 Argon 및 상단 문구 수정분 PASS. 실제 공개마스터3962/VTS현재가3, 새로고침·프로세스재시작 보존·코드전달·주문요청0 확인. [검증 기록](../verification/2026-11-15-watchlist.md).
- 미검증·남은 작업: PR/CI 원격 확인·인계, 사용자 직접 화면 수용·대상 SHA와 main 통합. 실제 주문·체결·취소·장중 실증 제외.
- 보존: 미추적 `.codex/config.toml`, `docs/architecture/tech-stack-review.md`. #7 실제 마스터3962종목 검증과 실제 일봉·달력 미검증, STE/graphify 환경 부재를 구분한다.
- 소유권: 사용자 확인된 Herdr t6v/세션 `01a1ddd3-7728-7041-bf37-7adee6dfc4cc`가 단독 소유한다.

## 다음 행동

원격 PR/CI의 최종 SHA를 확인해 기록한다. 이슈는 수용 형태와 통합 확인 전 completed로 닫지 않는다.

## 새 세션 시작 문구

> docs/STATE.md와 이 작업 파일의 필수 목록, #20 및 관련 PR/CI만 읽고 남은 행동을 이어가줘.
