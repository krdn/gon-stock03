# 작업: #20 관심종목

기준 이슈: https://github.com/krdn/gon-stock03/issues/20

- 상태: 완료
- 목표·완료 조건: 실제 마스터 관심종목의 화면 간 공유, 새로고침/재시작 보존·중복 방지, 저장 실패·빈 목록, 수신 시각, 선택코드 주문 화면 이동.
- 허용된 작업·제외 범위: 기존 저장·조회·공통 캐시 재사용. 실제 KIS 주문·취소·전략 실행과 스택 리팩터링 제외.
- 선행 작업·의존관계: #10 completed 및 PR #33/#34 통합 확인. 기준 main `865c3007e99620e9fa5821e7496246869ff04dec`, 앱43684112604·구성43684112485 SUCCESS.
- 이슈 / PR: [#20](https://github.com/krdn/gon-stock03/issues/20) / [PR #35](https://github.com/krdn/gon-stock03/pull/35), 통합 `e6aa5f7`·main 앱43702571567·구성43702571536 SUCCESS
- 작업 브랜치 / 제품 SHA: `feat/20-watchlist` / `d53bb90f7b8aaf4a55fbc835b985ca8af4b240cc` (원격 일치). 이후 문서 인계 커밋의 최종 SHA·CI는 PR과 이슈 인계 댓글에서 확인한다.

## 먼저 읽을 자료

- `AGENTS.md`, `docs/WORKFLOW.md`, `docs/plans/interface-sessions-2026-11.md` S03·운영 규칙
- `src/pages/Workspace.tsx`, `src/pages/MarketExplorer.tsx`, `src/pages/Paper.tsx`, `src/specs.ts`
- `server/http.ts` 관심목록·시세 경로, `server/store.ts` 저장 트랜잭션, `server/engine.ts` 기존 DEMO 상태
- `tests/market.test.ts`, `tests/browser/market.spec.ts`, `tests/browser/workbench.spec.ts`

## 현재 결과

- 완료한 변경: 실제 마스터 관심목록·화면 공유·미확인/제외 코드 보존·실패/빈 상태·수신시각·선택코드 /paper 이동. 기존 저장·시세 캐시 재사용. SQLite 저장 오류는 안전한500응답으로 구분한다. `src/specs.ts`와 상단 데이터 배지를 갱신했다.
- 검사: `gon-workflow ready .`, `implementation-ready .`, 단위63·브라우저45·빌드 통과. 새 Argon 및 상단 문구 수정분 PASS. 실제 공개마스터3962/VTS현재가3, 새로고침·프로세스재시작 보존·코드전달·주문요청0 확인. [검증 기록](../verification/2026-11-15-watchlist.md).
- 원격 확인: 제품 SHA의 PR 앱43685541428·구성43685541355 및 push 앱43685499002·구성43685499077 SUCCESS. 최종 문서 커밋도 CI 확인 후 인계한다.
- 수용·통합: 이번 사용자 계속 진행 지시와 #20 Argon/최종 CI PASS에 따른 판단. 대상 `7346886`, 통합 `e6aa5f7`; 사용자 직접 육안 수용과 구분한다.
- 미검증·남은 작업: 기록 PR·원격 인계. 실제 주문·체결·취소·장중 실증·사용자 직접 화면 확인은 미검증.
- 전달 경로: 원본 체크아웃의 미추적 `.codex/` 때문에 handoff가 중단된다. 설정을 건드리지 않고 같은 원격 브랜치의 임시 clean clone에서 ready/handoff를 검증한다. GitHub 연결 도구 PR 생성403 후 중복 확인·기존 `gh` 인증으로 PR35 생성.
- 보존: 미추적 `.codex/config.toml`, `docs/architecture/tech-stack-review.md`. #7 실제 마스터3962종목 검증과 실제 일봉·달력 미검증, STE/graphify 환경 부재를 구분한다.
- 소유권: 사용자 확인된 Herdr t6v/세션 `01a1ddd3-7728-7041-bf37-7adee6dfc4cc`가 단독 소유한다.

## 다음 행동

#20은 main CI 통과 후 completed/Done으로 정리했다. #16의 native 선행 #6·#8 completed를 재확인하고, 기록 PR 통합·main CI·실제 Herdr 연결 후 새 세션에 소유권을 넘긴다.

## 새 세션 시작 문구

> docs/STATE.md와 이 작업 파일의 필수 목록, #20 및 관련 PR/CI만 읽고 남은 행동을 이어가줘.

## 2026-11-17 후속 화면 수정

사용자 요청으로 4303 실접속 후 최초 연결 실패 시 예시 4종목을 저장 목록으로 표시·시세 조회하는 문제와 같은 상세 반복 클릭 시 초점 이동 누락을 재현했다. [범위 기록](https://github.com/krdn/gon-stock03/issues/20#issuecomment-6948261375).

- 변경 범위: MarketExplorer의 최초 목록 확인 및 상세 초점, 해당 브라우저 테스트. 원장·주문·전략 변경 없음.
- 완료 조건: 최초 미확인/확인된 빈 목록/단절 후 이전 목록 구분, 미확인 예시 시세 호출 없음, PC·모바일 반복 상세 열기와 닫기 초점 복귀.
- 기준: 25892e5, 새 브랜치 krdn/issue-20. 기존 PR35 MERGED 및 검사 SUCCESS 확인. 새 브랜치 원격 부재로 resume 실패; ready/implementation-ready 통과.
- 실행: 4303은 /home/gon/llm-projects/gon-stock03의 Vite. 이 작업 폴더 변경은 별도 빌드로 검증하고 실제 서비스 적용을 구분한다.

후속 구현·검증: [실접속 수정 기록](../verification/2026-11-17-watchlist-fixes.md). 최초 미확인 목록, 상세 반복 클릭, 주문 링크 대비를 수정했다. 단위216·관련 브라우저17·빌드 통과. 원본4303에도 두 화면 파일만 적용했으며 main 통합과 구분한다. 모바일 자동 대비 일부 판정유보와 실제 거래 미검증을 보존한다.
