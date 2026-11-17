# 작업: 연결·설정 복구

기준: [#71](https://github.com/krdn/gon-stock03/issues/71), 설계 [PR72](https://github.com/krdn/gon-stock03/pull/72) MERGED. 기존 #8 후속이다.

- 상태: 설계 1~3단계 구현·단위197·브라우저116·빌드·지정 Argon 리뷰 PASS. 구현 PR/CI 확인이 남았다.
- 브랜치: `feat/71-settings-recovery`. 기준 main `0d2b33a0aaad65fa8e94d043e1157fdd586d1b87`.
- 완료 조건: 실행 서버 식별·미주입 진단, 잔고 조회 전체 deadline·브라우저 대기 제한, GET 복구, 인증 대기·진행 표시, 회귀·지정 리뷰·PR CI. 실제 연결 수용은 별도다.
- 범위: 연결 진단/조회 경로·계약·UI·검사. 실제 KIS 인증/업무API/WebSocket/주문/취소/예약/외부알림·주입·기존 서버 재시작 금지. fake transport·메모리/임시DB만 사용한다.

## 필수 자료

- #71, 설계 PR72 및 이 작업의 구현 PR·CI.
- [설계](../plans/settings-recovery-2026-11.md), [기존 감사](../verification/2026-11-17-settings-audit.md), [구현 검증](../verification/2026-11-17-settings-recovery.md).
- [워크플로](../WORKFLOW.md)의 세션별 작업과 재개, [Infisical](../INFISICAL.md)의 연결·설정 화면.
- 변경할 부분의 `src/App.tsx`, `src/pages/Operations.tsx` Settings, `server/kis.ts` balance/send, `server/http.ts` state/check, `shared/model.ts`, `shared/contracts.ts`.

## 소유권 인계 증거

2026-11-17 부모가 Herdr 탭 `#71 연결·설정 복구`, terminal `t7y`, 세션 `01a1e52f-2eba-7a40-9aa7-4ffac600c0cd`, cwd `/home/gon/.herdr/worktrees/gon-stock03/feat-71-settings-recovery` 및 Ready 화면을 확인했다고 보고하고 구현 소유권을 전달했다. 이 세션은 동일 브랜치·기준 HEAD·clean·resume PASS·PR72 MERGED·CI4 SUCCESS를 확인했다. [착수 기록](https://github.com/krdn/gon-stock03/issues/71#issuecomment-6933976779).

추가 독립 에이전트·부모 검증 재위임 없이 이 세션이 구현한다. 부모는 제품 파일을 수정하지 않는다. 다른 세션/worktree·원장·graphify-out·설정을 보존한다.

## 결과와 다음 행동

서버 시작 시각·짧은 ID, 잔고 120초 전체 한도, check 125초 브라우저 제한, 독립 GET 새로고침, 서버 시간 기준 인증 대기·조회 경과를 구현했다. 마지막 전체 성공 잔고와 기존 토큰 공유·간격·조회 합류·주문 경계를 유지한다. 재현 실패와 검사 수는 [구현 검증](../verification/2026-11-17-settings-recovery.md)을 따른다.

완료 경계 리뷰는 `gemini-4-argon-high`/high 또는 `claude-fable-5-2`/high만 사용한다. 중앙 설정을 보존하고 Argon 명시 호출을 선택했다. 자동 대체·effort 승격·기존 리뷰 재사용은 하지 않는다. 요청/init과 서버 내부 모델·effort 독립 확인 범위를 구분한다.

로컬 회귀·리뷰를 완료했다. 커밋·푸시·PR·CI를 확인하고 #71을 갱신한다. main 통합·사용자 수용·실제 주입과 연결 성공을 완료로 처리하지 않는다. #25 장중 실증은 별도 Blocked다.
