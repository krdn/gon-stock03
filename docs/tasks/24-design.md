# 작업: #24 설계실

기준 이슈: https://github.com/krdn/gon-stock03/issues/24

- 상태: 검증 대기 (이번 계속 진행 지시·#24 자체 근거로 위임 수용, 통합·main CI 진행)
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
- 완료: 15개 매핑·목표/현재/후속 분리·URL 복구·모바일 키보드·초안 경계. 최종 제품 SHA `107e8182cce35724ee9279540adb88a938036a47` (#7 단계 정정 포함). [검증 기록](../verification/2026-11-15-design.md): 단위/API79·브라우저67·빌드·지도스키마·지정 Argon/high PASS.
- 수용: 이번 계속 진행 지시와 #24 자체 Argon·CI·fixture/화면 근거로 위임 수용·통합 판단. 직접 사용자 육안·V01 장중 수용은 별도다. 통합과 최종 CI는 인계 댓글을 확인한다.
- 추가 확인: 공통 #7 단계가 원격01과 화면02로 달랐다. 회귀 RED → 수정 → 빌드·설계/지도5 및 지정 Argon 수정분 PASS. 초기 리뷰 누락을 기록했다.
- 보존: 미추적 `.codex/config.toml`, 기술스택 추천 문서. STE 기준 파일·graphify 부재, #8 Fable 한도 오류, #21 초기 KIS pacing CI 실패 원인 미해결. #7 공개 마스터3962 실조회와 실제 KIS 일봉·공식 달력 미검증을 구분한다.
- 리뷰: 사용자 지정 Gemini4Argon 사용. 중앙 기본 Opus/Flash로 대체하지 않는다. `agy models`에서 `gemini-4-argon-high` 지원 ID 확인. 요청/init 모델과 서버 모델·effort 독립 확인 한계를 구분한다.

## 다음 행동

PR #45의 최종 CI 확인 후 통합하고 main CI·기록 PR·완료 인계를 마무리한다. 다음은 #9: #6/#8 completed·통합 및 Ready를 재확인한다. t73/session `01a1df8d-f843-7de1-87e1-118df8eeb1bc`는 실제 탭·cwd·동일 ID·Ready 입력창을 확인했으며 연결 준비만 완료했다. #24 종료 후 공식 계약·공통 서비스·fixture 검증과 구체적 모의 주문 승인안 준비를 인계한다. 실제 주문 전송은 승인되지 않았다.

## 새 세션 시작 문구

> docs/STATE.md와 이 작업 파일, 필수 읽기 목록 및 #24 PR/CI만 확인해 다음 행동부터 이어가줘. 제품 대상 SHA와 수용 범위를 구분하고 실제 주문은 실행하지 마.
