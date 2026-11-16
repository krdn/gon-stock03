# 작업: #17 알림·이벤트

[이슈 #17](https://github.com/krdn/gon-stock03/issues/17). main `23c7b519` 기준, `feat/17-alerts`, 별도 worktree. 선행 #6·#9 closed/completed 확인.

- 상태: 구현·로컬 검증 완료, 사용자 수용·PR 통합 대기. #12는 [초안 PR56](https://github.com/krdn/gon-stock03/pull/56)에서 별도 수용·통합 대기.
- 범위: KIS 감사 원장 투영·연결/차단 이벤트·원인 화면 이동·읽음 영속화·중복 방지. 외부 알림 발송과 실제 KIS 업무 API·주문·취소·예약은 제외.
- 먼저 읽기: AGENTS·WORKFLOW·이슈 #17, `Operations.tsx`의 Alerts, `store.ts`의 paperAudit/read/update, `http.ts`의 state/events/read, `shared/model.ts`의 Event.
- 완료 조건: 안전한 이벤트 메시지와 요청 추적, 읽음 재시작 보존, 동일 감사 ID 중복 없음, 필터/오류/모바일 검증, 독립 리뷰·PR CI·화면 수용.

기존 감사 이력을 다시 이벤트로 저장하면 원장이 중복된다. 감사 ID를 그대로 투영하고 읽음 여부만 별도 저장한다. 원장 evidence·복구의 brokerId/organization은 알림 응답에 포함하지 않는다. 기존 원장·백업과 다른 worktree를 보존한다.

검증: [결과 기록](../verification/2026-11-16-alerts.md). 단위/API134·전체 브라우저76·빌드 PASS. 원 리뷰 P2 7건은 수정분 리뷰에서 해소 확인. 경미1건은 추가 RED→GREEN과 최종 단위/API134건으로 직접 검증.

다음 행동: PR/CI를 전달하고 사용자 화면 수용을 확인한다. 사용자 수용과 통합 전 #17 완료 및 #18 선행 해제 없음.

전달: [초안 PR57](https://github.com/krdn/gon-stock03/pull/57), 제품 `57a51c5`. 원격 CI·사용자 수용·통합 전에는 #17 완료로 처리하지 않는다. #12/PR56과 공통 문서 변경을 모두 보존해 통합한다. 로컬 node_modules는 기존 설치에 대한 링크이며 원장·백업을 사용하지 않았다.
