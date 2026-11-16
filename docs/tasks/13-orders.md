# 작업: #13 주문·체결

[이슈 #13](https://github.com/krdn/gon-stock03/issues/13). 시작 main `bf158ccaf826ca4e91ba5b6d7a059700dfb15098`, `feat/13-orders`, 별도 worktree.

- 선행: native blocked_by #9·#12 closed/completed, Project Done, PR54·56 main 통합 확인. PR57도 병합, 결합134/83/빌드·Argon PASS.
- 범위: DEMO 주문 상태·종목 검색·예약 반환/체결 경합 확인, KIS 저장 원장 읽기·조회 상태·원인 화면 이동. 로컬 읽기와 KIS REST 대조를 구분한다.
- 완료 조건: 두 환경 분리, 오류/이전값/빈값 구분, KIS 조회·이동의 전송0회, 불명 자동 재전송0회, 서버 취소 경합·재시작/주문일 대조 회귀, 모바일·독립 지정 리뷰·CI.
- 먼저 읽기: AGENTS·WORKFLOW·#13, Trading.tsx Orders, paper.ts refreshInsideQueue, http.ts GET ledger, specs.ts orders, engine/paper/browser 회귀.
- 제외: 실제 KIS 업무API·주문·취소·예약·외부알림, WebSocket(#19), 실제 장중 수용(#25). 기존 원장·백업·보유·다른 worktree 보존.

현재: 구현·단위/API137·브라우저88·빌드 PASS. [검증 기록](https://github.com/krdn/gon-stock03/blob/38e6e402c640bdb19f550eb099dd6eb08a80302d/docs/verification/2026-11-16-orders.md). 사용자 직접 화면 수용은 미확인. 지정 Gemini4Argon/high ORDERS PASS(P0–P3 0), 요청/init 모델 일치·서버 내부 확인 한계. 다음: PR/CI 전달. 사용자 수용·통합 전 #13 완료와 #14 선행 해제를 주장하지 않는다.

전달: [초안 PR58](https://github.com/krdn/gon-stock03/pull/58), 제품 `8ca0d245`. 사용자 화면 수용·통합 대기. 원격 CI는 해당 PR 최신 head에서 확인한다. 후속 #14 선행은 유지하고 #18은 독립 Ready 상태다.

결합 후보는 [PR58·59 통합 작업](13-18-integration.md)에서 검증한다. 원본 PR과 이슈는 열린 수용 대기 상태를 유지하며, 이 기록은 사용자 수용이나 main 통합 완료를 뜻하지 않는다.
