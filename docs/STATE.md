# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- **현재:** [#22 KIS 전략 스튜디오](tasks/22-strategies.md). `feat/22-strategies`, main `54754f81e831cf3a6b24085229ca68c485dc8c86` 기반 전용 worktree. 선행 #19/#21 completed·Project Done 확인 후 Ready. t7m 소유권 인계 후 t7n에서 구현·격리 검증 진행. 초안 PR·head CI와 사용자 수용·통합은 미완료. [검증 기록](verification/2026-11-16-strategies.md).
- **통합:** [PR62](https://github.com/krdn/gon-stock03/pull/62) merged. head `2e7ea61` CI4·main `54754f8` CI2 SUCCESS. [#19 검증](verification/2026-11-16-realtime.md): 단위154·브라우저108·build·Argon 수정분 PASS. #19 completed/Done.
- **수용 범위:** 사용자 다음 작업 점검·새 세션 진행 지시를 #19의 기술 수용·통합과 #22 진행으로 해석했다. 직접 사용자 육안·장중 수용을 주장하지 않는다.
- **다음:** #22 구현·검증·수용·통합 후 #25 장중 통합 실증. #25는 Blocked이며 실제 거래는 별도 시작 지시 필요. #2의 기존 비차단 P2(DB/WAL/SHM 권한, 정적 파일 누락 경로 노출)는 별도 후속 점검. #1/#2/#3을 일괄 완료하지 않는다.
- **실증:** [삼성전자 한 건](verification/2026-11-16-samsung-paper-run.md)은 접수·REST 대조·취소·체결0/잔량0만 입증한다. 실제 체결·부분체결·불명 복구·연속전략·전체 화면 장중 수용은 #25 미관측.
- **거래 제한:** 실제 KIS 업무API/WebSocket 연결·인증·주문·취소·예약·외부알림 금지. 메모리/임시DB·fake transport만. 고정 승인·1회/120초·웹 정정취소409·실전 전환 금지 유지. 원장 재설정 없음.
- **보존:** 다른 worktree, .local 원장/백업/보유, .codex·graphify-out·node_modules·전역 hook. 강제푸시·보호 우회·추가 에이전트·부모에게 검증 재위임 없음. 인계 후 부모 편집 중단.
- **리뷰:** `claude-fable-5-2-high` 또는 `gemini-4-argon-high`만. 외부 리뷰 지침·중앙 설정 확인 후 자동 대체 없이 호출. 요청/init과 서버 내부 모델/effort 독립 미검증을 구분한다. 다른 이슈 리뷰 재사용 없음.
- **재개:** AGENTS·WORKFLOW·현재 작업 파일·필수 읽기·관련 원격 이슈/PR/CI만. 공식자료 확인→start-context 추가→implementation-ready 후 구현. 신규 초기화 없음. STE 기준파일 부재·기존 번들 경고 유지. 새 세션은 사용한도를 초기화하지 않는다.
