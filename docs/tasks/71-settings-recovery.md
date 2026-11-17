# 작업: 연결·설정 복구

기준: [#71](https://github.com/krdn/gon-stock03/issues/71), 설계 [PR72](https://github.com/krdn/gon-stock03/pull/72) MERGED. 기존 #8 후속이다.

- 상태: 실제 연결 검증·마감 승인 완료. 설계 1~3단계 구현·단위197·브라우저116·빌드·지정 Argon 리뷰 PASS. [구현 PR73](https://github.com/krdn/gon-stock03/pull/73) MERGED, main `341825b`. 최종 head `bab80bb`의 CI4 SUCCESS.
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

구현 커밋 `40e4f862faa765581f27ebb29cad27f69ff00f20`을 푸시하고 PR73의 CI4 SUCCESS를 확인했다. 기록 후속 커밋의 최신 CI는 PR과 #71 최종 댓글에서 대조한다. 다음 행동은 사용자 검토·수용 및 별도 통합 결정이다. main 통합·사용자 수용·실제 주입과 연결 성공을 완료로 처리하지 않는다. #25 장중 실증은 별도 Blocked다.

## STE 검사 복구

2026-11-17 사용자가 기준 파일 도입과 검사 통과를 승인했다. [적용 기준](../conventions/ste100-writing.md)은 공식 원본의 단어표와 검사 한도를 유지한다.
한국어 문서 원칙을 유지하며 #71 변경 문서의 위반을 수정한다. 제품 코드·실제 연결·main 통합은 이번 변경에 포함하지 않는다.

검사 결과: 변경 문서 4개·위반0·제외0·exit0. 고의 위반 4건은 exit1로 탐지했다. [복구 근거](../verification/2026-11-17-settings-recovery.md#ste-복구)를 확인한다.

## 다음 작업 점검

2026-11-17 사용자 요청으로 컨텍스트와 원격 작업을 대조했다. 점검 시작 시 컨텍스트 잔여량은 53,003토큰이었다.
PR73 head `4ca9a79`는 OPEN·CI4 SUCCESS·병합 충돌 없음이다. GitHub 제출 리뷰는 없으며 지정 모델 리뷰와 구분한다.

열린 이슈는 #1/#2/#3 상위 묶음, #25 실증, #71, #75다. 새 미소유 구현 작업은 확인되지 않았다.
[#75 작업 기록](https://github.com/krdn/gon-stock03/blob/4f258896f32b5e44d7f14f0791e103788ce0f1ab/docs/tasks/75-market-paper.md)은 별도 worktree 소유 범위를 명시한다.
해당 worktree에 미커밋 제품 변경이 있음을 읽기 전용으로 확인했다. 다른 세션의 파일·실행 범위를 인수하거나 변경하지 않았다.

PR74의 CI4 SUCCESS는 #25의 전송 전 차단 기록을 검증한 결과다. 실제 체결·복구·연속전략의 완료 근거가 아니다.
#75의 별도 승인·실행은 해당 소유 세션에서 관리한다. 이번 세션은 실제 KIS·주입·서버 재시작·주문을 실행하지 않는다.

새 탭은 생성하지 않았다. 컨텍스트 부족이 없고 독립적으로 인계할 미소유 작업도 없기 때문이다.
다음 경계는 PR73의 사용자 검토·통합 결정, 기존 소유자의 #75 완료, 이후 #25 잔여 실증이다.
#71과 #75가 수정한 공통 파일은 통합 전에 함께 검증해야 한다. 이 점검만으로 merge·사용자 수용·실제 거래 성공을 표시하지 않는다.

## 통합 완료

2026-11-17 사용자가 계획 완료까지 자율 진행을 요청했다. PR73 head `bab80bb`의 CI4 SUCCESS와 충돌 없음, 기존 지정 리뷰를 확인했다.
제품 변경이 없어 검사를 반복하지 않고 PR73을 main `341825b61a198fd970f3ffb2c801097d4a9ade27`에 통합했다. 앞 절의 통합 대기 상태는 이 기록으로 갱신한다.

[추가 실행 기록](https://github.com/krdn/gon-stock03/issues/71#issuecomment-6939807685)은 같은 head의 단위197·브라우저116·빌드 PASS를 확인한다.
실제 연결 검증은 실행 제한 때문에 남아 있으며 #71을 닫지 않는다. #75 소유권·#25 시작 조건·기존 서버·원장을 보존했다.

자동 resume은 미추적 `graphify-out/` 때문에 실패했다. 해당 파일을 보존하고 원격 SHA·이슈·PR·CI를 직접 대조했다.
통합 후 CI와 기록 PR의 최종 결과는 #71 후속 댓글에서 확인한다.

## 실제 연결 검증과 마감

2026-11-17 사용자가 Infisical 주입·서버 재시작·모의 인증·잔고 조회를 명시 승인했다. 앞 절의 해당 실행 제한은 이 한정 작업에 한해 해제됐다.
[실행 근거](https://github.com/krdn/gon-stock03/issues/71#issuecomment-6940359209)는 main `087b588`의 실제 4303 화면과 서버 상태를 대조한다.

- 원인: 일반 실행 명령으로 시작한 서버에 필수 환경변수 4개가 없었다.
- 조치: 문서의 Infisical `dev /kis` 주입 명령으로 기존 DB를 유지하고 서버를 재시작했다.
- 관측: 15:11:50 KST 토큰 발급, 15:11:52 전체 잔고 1페이지 성공. 상태 새로고침 후 성공 표시를 확인했다.
- 코드 변경 없음. 주문·취소 실행 없음. 기존 보유·원장·다른 worktree를 보존했다.

사용자는 결과 보고 뒤 #71 마감 → #75 완료 → #25 실증 순서에 동의하고 진행을 지시했다. 이를 #71 범위의 마감 승인으로 기록한다.
실제 거래·복구·연속전략과 전체 화면 흐름의 수용은 #25에 남긴다. 주입된 서버를 다시 실행할 때도 [Infisical 실행 명령](../INFISICAL.md#연결설정-화면)을 사용한다.
