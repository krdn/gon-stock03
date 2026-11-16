# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- **현재:** [#19 실시간 수신·재연결 기반](tasks/19-realtime.md). `feat/19-realtime`, main `af159134162b5aaa9aeabdbdf4f8c36ccbea4e11` 기반 전용 worktree. 선행 #14/#15/#11/#18/#17 completed·Project Done 재확인. 소유권 인계 후 #19 In Progress. 실시간 수신·대조 안전장치 구현. 단위148·브라우저107·build PASS, Argon 리뷰는240초 timeout으로 미완료.
- **통합:** [PR61](https://github.com/krdn/gon-stock03/pull/61) merged, head `391757e` CI4·main `af15913` CI2 SUCCESS. [#14 검증](verification/2026-11-16-paper.md): 단위137·브라우저103·build·Argon PASS. #14 completed/Done.
- **수용 범위:** 최신 사용자 다음 작업 진행 지시를 PR61의 기술 수용·통합 후 #19 진행으로 해석했다. 직접 사용자 육안·장중 수용은 주장하지 않는다. 이전 #14 대기·#19 Blocked는 갱신했다.
- **다음:** #19 초안 PR/CI 전달 후 지정 독립 리뷰 결과 확보·수용·통합 대기. [검증 기록](verification/2026-11-16-realtime.md). #22는 #19, #25는 #22와 실제 장중 수용 대기. 선행 완료 전에 착수하지 않는다.
- **실증:** [삼성전자 한 건](verification/2026-11-16-samsung-paper-run.md)은 접수·REST 대조·취소·체결0/잔량0만 입증한다. 실제 체결·부분체결·불명 복구·연속전략·전체 화면 장중 수용은 #25 미관측.
- **거래 제한:** 실제 KIS 업무API/WebSocket 연결·주문·취소·예약·외부알림 금지. 메모리/임시 DB·fake transport만 사용한다. 다음 실제 거래는 별도 시작 지시 필요. 일반 웹 취소/정정409·고정 승인·실전 전환 금지 유지. 원장 재설정 없음.
- **보존:** root의 오래된 feat/12-trading, 다른 worktree, .local 원장/백업/보유, .codex·graphify-out·node_modules·전역 hook. 강제푸시·보호 우회·추가 에이전트·부모 검증 재위임 없음.
- **리뷰:** Claude Fable5.2 또는 gemini-4-argon-high만. 외부 리뷰 지침/중앙 설정 확인 후 자동 대체 없이 호출. 요청/init 모델 일치와 서버 내부 모델/effort 독립 미검증을 구분한다. #14 리뷰를 #19 증거로 재사용하지 않는다.
- **재개:** AGENTS·WORKFLOW·현재 작업 파일·필수 읽기·관련 원격 이슈/PR/CI만 확인. 신규 초기화 없음. 공식자료 확인→start-context 추가→implementation-ready를 구현 전에 실행한다. STE 기준파일 부재와 기존 번들 경고 유지. 새 세션은 사용한도를 초기화하지 않는다.
