# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- **현재:** [#25 장중 실증 준비](tasks/25-validation.md). `chore/25-validation-prep`, 전용 worktree `25-validation`. #22 PR63을 main `134118eff0b0575be231d9dd34929ab45a290125`에 통합했다. #22 completed·Project Done 및 main CI2 SUCCESS를 확인했다. #25 실제 실행은 별도 장중 시작 지시 전 Blocked이며, 준비 문서·격리 검증 결과는 [검증 기록](verification/2026-11-16-validation-prep.md)에 남겼다.
- **수용:** 사용자 “다음 작업 상태 확인…새 세션에서 다음 작업을 진행” 지시를 #22의 기술 수용·통합으로 해석했다. 대상 head `41047ec`, CI4 SUCCESS·단위166·브라우저113·build·지정 Argon 수정분 PASS. 직접 사용자 육안·장중 수용은 주장하지 않는다. [검증](verification/2026-11-16-strategies.md).
- **다음:** #25 시나리오별 증거·실행 조건 정리 및 #2 P2 두 건의 격리 재현 완료. 후속 [#64 WAL/SHM 권한](https://github.com/krdn/gon-stock03/issues/64)·[#65 정적 경로 노출](https://github.com/krdn/gon-stock03/issues/65)을 별도 수정·재검증한다. #1/#2/#3을 일괄 완료하지 않는다.
- **실증:** [삼성전자 한 건](verification/2026-11-16-samsung-paper-run.md)은 접수·REST 대조·취소·체결0/잔량0만 입증한다. 실제 체결·부분체결·불명 복구·연속전략·전체 화면 장중 수용은 #25 미관측.
- **거래 제한:** 실제 KIS 업무API/WebSocket 연결·인증·주문·취소·예약·외부알림 금지. 메모리/임시DB·fake transport만. 고정 승인·1회/120초·웹 정정취소409·실전 전환 금지 유지. 원장 재설정 없음.
- **보존:** 다른 worktree, .local 원장/백업/보유, .codex·graphify-out·node_modules·전역 hook. 강제푸시·보호 우회·추가 에이전트·부모에게 검증 재위임 없음. t7r로 소유권 인계 후 부모 t7n 편집 중단.
- **리뷰:** `claude-fable-5-2-high` 또는 `gemini-4-argon-high`만. 외부 리뷰 지침·중앙 설정 확인 후 자동 대체 없이 호출. 요청/init과 서버 내부 모델/effort 독립 미검증을 구분한다. 다른 이슈 리뷰 재사용 없음.
- **재개:** AGENTS·WORKFLOW·현재 작업 파일·필수 읽기·관련 원격 이슈/PR/CI만. 공식자료 확인→start-context 추가→implementation-ready 후 구현. 신규 초기화 없음. STE 기준파일 부재·기존 번들 경고 유지. 새 세션은 사용한도를 초기화하지 않는다.
