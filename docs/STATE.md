# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- **현재:** [#64 SQLite 원장 권한 보호](tasks/64-sqlite-permissions.md). `fix/64-sqlite-permissions`, 전용 worktree `64-sqlite-permissions`. #25 준비 PR66을 main `dae458093b664d872a23672f4b65aa9b229aa10c`에 통합했다. main CI2 SUCCESS. 새 Herdr 세션의 실제 경로·ID·Ready 화면을 확인했으며 단독 소유권을 인계한다.
- **수용:** 사용자 “다음작업 상태 확인…새 세션에서 다음 작업 진행” 지시로 검증된 준비 PR66을 통합했다. head `3db325c`, CI4 SUCCESS·단위166·브라우저113·build·지정 Argon 준비 검토 PASS. 실제 장중 수용은 아니다. [준비 증거](verification/2026-11-16-validation-prep.md).
- **다음:** #64 수정·격리 회귀·지정 검토·초안 PR/CI. [#65 정적 경로 노출](https://github.com/krdn/gon-stock03/issues/65)은 별도 다음 작업. #1/#2/#3/#25를 일괄 완료하지 않는다.
- **실증:** [#25](tasks/25-validation.md)는 Blocked 유지. [삼성전자 한 건](verification/2026-11-16-samsung-paper-run.md)은 접수·REST 대조·취소·체결0/잔량0만 입증한다. 실제 체결·부분체결·불명복구·연속전략·전체 화면 장중 수용은 미관측.
- **거래 제한:** 실제 KIS 업무API/WebSocket·인증·주문·취소·예약·외부알림 금지. fake transport·메모리/임시DB만. 고정1회/120초·웹 정정취소409·실전 전환 금지 유지. 다음 한정 실행도 별도 장중 시작과 사용자 모바일 취소 조건을 따른다.
- **보존:** 기존 원장·보유·백업·다른 worktree·.codex·graphify-out·기존 node_modules·전역 hook. 강제푸시·보호 우회·추가 에이전트·부모 검증 재위임 없음. 소유권 인계 후 t7r 편집 중단.
- **리뷰:** 외부 리뷰 지침·중앙 설정 확인 후 `claude-fable-5-2-high` 또는 `gemini-4-argon-high`만. 자동 대체·effort 승격·다른 이슈 리뷰 재사용 금지. 요청/init과 서버 내부 모델/effort 독립 미검증을 구분한다.
- **재개:** AGENTS·WORKFLOW·현재 작업·필수 자료·관련 원격 이슈/PR/CI만. 공식자료 확인→start-context 추가→implementation-ready 후 구현. STE 기준파일 부재·기존 번들 경고 유지. 신규 초기화 없음.
