# 작업: #50 전체 브랜치 통합

기준 이슈: https://github.com/krdn/gon-stock03/issues/50

사용자의 “모든 브랜치 머지해줘” 요청에 따라 실제 미반영 변경을 main에 통합한다. 이전 Draft 유지 지시는 통합 범위에서 변경됐다.

- 상태: 결합 단위/API99·빌드·브라우저67 및 이번 Argon MERGE PASS. 정상 PR 병합·최종 main CI 확인 진행 중.
- 시작 main: `034f7e766d67b0ecfe3dab8477078939c255412e`.
- 대상: [PR49](https://github.com/krdn/gon-stock03/pull/49) `0526d0fa1a68cb843ea91521a95d024016297a6a`, [PR47](https://github.com/krdn/gon-stock03/pull/47) `7fac5aac71702e1a56a61173b1b556ee703f35d9`.
- 작업: `/tmp/gon-stock03-all-branches-20261116`, `feat/9-kis-orders-recovery`의 격리 clone. 원본 폴더는 수정하지 않는다.
- 완료 조건: 전체 refs 대조, 문서 충돌 해결, 결합 회귀·빌드·브라우저·이번 Argon 리뷰, PR 병합, 최종 main CI·원본 및 브랜치 보존.
- 제외: 실제 KIS 인증/조회/주문/취소/전략 호출. #9 실제 실증·승인 미완료와 후속 차단 유지.

## 먼저 읽을 자료

AGENTS·WORKFLOW, 이 파일, [#48](48-kis-pacing.md), 필요한 [#9](9-kis-orders-recovery.md), PR49·47·#50의 최신 댓글/CI. 결합 코드는 `server/kis.ts`, `server/paper.ts`, `tests/kis.test.ts`, `tests/paper.test.ts`.

## 대조와 통합 결정

[전체 refs 근거](../verification/assets/branch-integration/branch-audit.json): 로컬24개(main 포함)와 원격23개 작업 브랜치를 대조했다. 기존21개는 PR의 head SHA가 현재 브랜치와 같고, head 파일 트리가 당시 병합 결과 트리와 같다. 병합 커밋은 시작 main의 조상이다. 실제 미반영은 PR47·49 두 개다.

`--no-merged`에 남은 squash 브랜치10개는 아래와 같다. 후속 커밋이 없어 다시 병합하지 않는다.

| 브랜치 | 이미 병합한 PR |
|---|---|
| feat/20-watchlist · docs/20-integration-handoff | #35 · #36 |
| feat/16-portfolio · docs/16-portfolio-integration | #37 · #38 |
| feat/15-data-status · docs/15-data-status-integration | #39 · #40 |
| feat/21-backtest · docs/21-integrated-handoff | #41 · #42 |
| feat/23-journal · docs/23-journal-integration | #43 · #44 |

PR47 clone에 PR49를 일반 merge한다. 제품 텍스트 충돌은 없고 `STATE.md`·`start-context.json` 두 문서가 충돌했다. STATE는 이번 통합과 #9 차단을 가리키며, 조사 기록은 두 task_context와 원래 확인 시각을 보존했다. 새로운 공식 조사나 실제 KIS 실행으로 표시하지 않았다.

정상 PR 경로로 PR49를 먼저, 결합 결과를 담은 PR47을 다음에 merge한다. 브랜치를 보존하기 위해 저장소의 자동 삭제 설정만 병합 동안 끄고 원래 값으로 복원한다. 보호규칙은 변경하지 않는다.

## 검증과 남은 행동

결합 주문/외부 조회 직렬화 검사에 20ms 간격 단언을 추가했다. 응답 불명→명시적 복구·중복 확인에서도 모든 transport 간격과 POST1회·감사1회가 유지되는 검사를 추가했다. 제품 코드는 두 PR의 자동 결합 결과다.

최종 검사·이번 독립 리뷰·대상 해시·원격 CI는 [통합 검증](../verification/2026-11-16-branch-integration.md)과 #50 댓글에 기록한다. 원본 보존은 시작/종료 파일 해시와 Git 상태로 확인한다. #9와 후속 기능의 차단은 해제하지 않는다.

## 다음 행동

정상 PR merge 후 최종 main CI를 확인한다. 완료 후에는 #9의 별도 사용자 결정·실증 승인 경계에서 재개한다.
