# 작업: #24 설계실

기준 이슈: https://github.com/krdn/gon-stock03/issues/24

- 상태: 검증 대기 (구현·로컬 검증·지정 리뷰 완료, PR/CI·화면 수용 대기)
- 목표·완료 조건: 15개 화면과 15개 이슈를 단계·API·완료 기준·구현 근거로 연결한다. 현재 동작과 목표·DEMO/KIS/후속 범위를 구분하고 키보드·모바일 탐색과 로컬 초안 저장을 검증한다.
- 허용 범위: 설계실·설계 레지스트리·프로젝트 지도와 관련 검사·기록. 실제 주문·취소·연속전략 실행, 다른 화면 기능 추가는 제외한다.
- 선행: #5 completed, PR #4 통합 커밋의 main 포함 확인. #23 completed·PR #43/#44 통합과 최종 main CI 성공 확인. #24 Project Ready → In Progress.
- 이슈 / PR: #24 / [PR #45](https://github.com/krdn/gon-stock03/pull/45)
- 브랜치 / 기준 SHA: `feat/24-design` / `f621a145172cb4c764f2d6e6315f3ff2520efdf6`

## 먼저 읽을 자료

- `AGENTS.md`, `docs/WORKFLOW.md`, #24, `docs/plans/interface-sessions-2026-11.md`의 S14·15개 화면 매핑·운영 규칙.
- `src/pages/Design.tsx`의 Design, `src/specs.ts`의 screens, `public/project-map.html`의 data·초안 저장, `tests/browser/workbench.spec.ts`의 설계·지도 검사.

## 현재 결과

- 착수: t72 / `01a1df71-6c2c-70f2-912b-6a21522136e7`. t71의 실제 탭 확인과 착수 지시로 연결 제한 해제. 부모 및 이전 세션 수정 중단, 이 세션 단독 구현. 재위임·추가 에이전트 없음.
- 검사: 기준 SHA 원격 일치, main 앱43720656350·구성43720656336 SUCCESS. `gon-workflow ready .`, `implementation-ready .` PASS. 공식 브라우저 자료는 `docs/start-context.json`의 #24 task_context에 기록.
- 완료: 15개 매핑·목표/현재/후속 분리·URL 복구·모바일 키보드·초안 경계. 제품 SHA `d1a465f25a1273e2faf00f5ceb69d53e7fee7fdf` 원격 게시. [검증 기록](../verification/2026-11-15-design.md): 단위/API79·브라우저67·빌드·지도스키마·지정 Argon/high PASS.
- 미검증: 사용자 화면 수용과 PR 통합. 최종 기록 SHA CI는 PR 및 이슈 인계 댓글에서 확인한다. 직접 사용자 육안 및 V01 장중 통합 수용과 구분한다.
- 보존: 미추적 `.codex/config.toml`, 기술스택 추천 문서. STE 기준 파일·graphify 부재, #8 Fable 한도 오류, #21 초기 KIS pacing CI 실패 원인 미해결. #7 공개 마스터3962 실조회와 실제 KIS 일봉·공식 달력 미검증을 구분한다.
- 리뷰: 사용자 지정 Gemini4Argon 사용. 중앙 기본 Opus/Flash로 대체하지 않는다. `agy models`에서 `gemini-4-argon-high` 지원 ID 확인. 요청/init 모델과 서버 모델·effort 독립 확인 한계를 구분한다.

## 다음 행동

PR #45 최종 SHA·CI와 이슈 인계를 확인하고 제품 `d1a465f25a1273e2faf00f5ceb69d53e7fee7fdf`의 화면 수용 형태·답변을 기록한다. 수용·통합 전 completed/Done으로 바꾸거나 다른 이슈 구현을 시작하지 않는다.

## 새 세션 시작 문구

> docs/STATE.md와 이 작업 파일, 필수 읽기 목록 및 #24 PR/CI만 확인해 다음 행동부터 이어가줘. 제품 대상 SHA와 수용 범위를 구분하고 실제 주문은 실행하지 마.
