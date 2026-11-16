# 작업: 연결·설정 복구

기준 이슈: https://github.com/krdn/gon-stock03/issues/71 (기존 #8 후속).

- 상태: 대기. 설계 등록 완료, 제품 구현 미착수.
- 목표·완료 조건: 실행 서버 식별·미주입 진단, 유한한 조회 대기, 상태 새로고침 복구, 인증 대기 UI. 상세 체크리스트는 #71을 기준으로 한다.
- 범위: 연결 진단/조회 경로·계약·UI·회귀 검사. 실제 KIS 업무 API·주문·취소·예약은 현재 STATE 제한을 유지한다.
- 브랜치: `세부작업`. 최초 설계 기록 `6d7045b`. 후속 구현은 최신 main과 설계 PR의 통합 상태를 확인하고 별도 구현 브랜치에서 시작한다.

## 먼저 읽을 자료

- #71, 해당 이슈에서 연결한 설계 PR과 CI.
- [설계](../plans/settings-recovery-2026-11.md), [검증](../verification/2026-11-17-settings-audit.md).
- [워크플로](../WORKFLOW.md)의 세션별 작업과 재개, [Infisical](../INFISICAL.md)의 연결·설정 화면.
- 구현할 단계의 `src/App.tsx`, `src/pages/Operations.tsx` Settings, `server/kis.ts` balance/send, `server/http.ts` state/check, `shared/model.ts`, `shared/contracts.ts`만 확인한다.

## 현재 결과

- 4303 화면은 동작하지만 필수 변수 4개 미주입. 실행 경로는 `/home/gon/llm-projects/gon-stock03`이며 검사 당시 코드 HEAD는 작업 worktree와 동일했다.
- KIS·HTTP 35/35, 설정 브라우저 12/12, 빌드 통과. 실제 KIS 호출 미실행.
- 미응답 시 버튼 잠김, 인증 대기 중 확인 버튼 활성 문제를 응답 대체로 확인했다.
- 문서 링크·diff 검사 통과. STE 기준 파일 부재로 문체 검사 exit2.
- GitHub 연결 도구 이슈 생성403 후 인증된 gh로 #71 생성. 기존 #8의 완료 상태는 유지한다.

## 다음 행동

#71과 설계 PR·CI를 조회해 원격 반영을 확인한다. 구현 요청을 받으면 설계 1단계부터 진행한다. 구현 완료 경계의 외부 리뷰와 실제 연결 검증은 각각 별도 증거로 남긴다.

## 새 세션 시작 문구

> GitHub krdn/gon-stock03 #71과 연결된 설계 PR·CI, docs/tasks/71-settings-recovery.md 및 필수 자료를 확인하고 연결·설정 복구 구현을 진행해. 최신 main과 설계 통합 상태를 먼저 확인하고 실제 KIS API 실행 제한은 유지해.
