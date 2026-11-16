# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- **현재:** [#14 KIS 모의 매매 화면](tasks/14-paper.md). `feat/14-paper`, 최신 main `46593c56abc5f6958f21e163bdd8d4758b79c2b6` 기반 전용 worktree. 선행 #8/#13/#11 completed·PR60/main CI를 재조회하고 소유권 인계 후 #14 In Progress. 요청 보존·입력 보존·불명 복구 화면 구현, 단위137·브라우저103·Argon 리뷰 PASS. [초안 PR61](https://github.com/krdn/gon-stock03/pull/61) 전달; 최신 head CI는 PR checks/이슈 인계에 기록. 사용자 수용·통합 전. [검증 기록](verification/2026-11-16-paper.md).
- **통합:** [PR60](https://github.com/krdn/gon-stock03/pull/60) merge `46593c5`, head `e1ab060` CI4·main CI2 SUCCESS. [#13·#18 결합 검증](verification/2026-11-16-orders-dashboard-integration.md): 단위137·브라우저95·빌드·Argon INTEGRATION PASS. 원본 PR58/59는 원래 head를 보존한 채 GitHub merged. #13/#18 completed/Done.
- **수용 범위:** 반복된 사용자 다음 작업 진행 지시를 PR60 기술 수용·통합 후 #14 진행으로 해석했다. 사용자 직접 육안 관찰·장중 수용을 주장하지 않는다. 과거 후보 단계의 완료·선행 해제 보류는 이번 통합 상태로 갱신했다.
- **다음:** PR61의 최신 head CI 확인과 #14 사용자 화면 수용·통합. #19는 #14 open 때문에 Blocked, #22는 #19, #25는 #14/#22 대기. 선행 완료 전에 착수하지 않는다.
- **실증:** [삼성전자 한 건](verification/2026-11-16-samsung-paper-run.md)은 매수 접수·REST 대조·취소·체결0/잔량0만 입증한다. 일반 웹 취소·정정409 차단과 공식 계약 미확정 유지. 실제 체결·부분체결·불명 복구·연속전략·전체 사용자 화면 수용은 #25 미관측.
- **거래 제한:** 실제 KIS 업무API·주문·취소·예약·외부알림 금지. 메모리/임시 DB·fake transport만 사용한다. 다음 실제 거래는 별도 장중 시작 지시가 필요하며 매수만/사용자 모바일 직접취소다. 소비 원장 재설정 없음.
- **보존:** root의 오래된 feat/12-trading, 다른 worktree, .local 원장·백업·보유, .codex, graphify-out, node_modules 및 전역 hook 설정. 강제푸시·보호규칙 우회·추가 에이전트·부모 검증 재위임 없음.
- **검증 모델:** Claude Fable5.2 또는 Gemini4Argon만. 외부 리뷰 지침·중앙 설정을 확인하되 다른 기본 모델로 자동 대체하지 않는다. Argon은 agy models 확인 후 gemini-4-argon-high/--effort high 직접 호출 가능. 요청/init 일치와 서버 내부 모델·effort 독립 확인의 차이를 기록한다.
- **재개:** AGENTS·WORKFLOW·현재 작업 파일·필수 파일·관련 원격 이슈/PR/CI만 먼저 확인한다. STE 기준파일 부재는 미검증, 기존 번들 경고 유지. 새 세션은 사용한도를 초기화하지 않는다.
