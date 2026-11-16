# 작업: PR58·59 결합 후보

기준 main `bf158ccaf826ca4e91ba5b6d7a059700dfb15098`. `integration/13-18`, 전용 worktree `/home/gon/llm-projects/gon-stock03-worktrees/13-18-integration`.

- 입력: [PR58](https://github.com/krdn/gon-stock03/pull/58) `38e6e402c640bdb19f550eb099dd6eb08a80302d`, [PR59](https://github.com/krdn/gon-stock03/pull/59) `6270faa0024433274930996300fb1e9e20cadc89`. 시작 시 원격 SHA·초안·CI4 SUCCESS 각각 재확인.
- 범위: STATE·start-context·#13 기록·App 충돌 해소. dashboard/orders 상단 환경 표기와 자동 병합 specs의 양쪽 계약 보존. 제품 원본 파일과 서버 동작 보존.
- 필수 읽기: AGENTS·WORKFLOW, 이 파일, [#13](13-orders.md)·[#18](18-dashboard.md), App 환경 표기, tests/browser/orders-dashboard-integration.spec.ts, 관련 PR/CI.
- 검증: [통합 검증 기록](../verification/2026-11-16-orders-dashboard-integration.md). 단위/API137·브라우저95·빌드 PASS. 지정 Argon/high INTEGRATION PASS(P0–P3 0). 요청/init 일치·서버 내부 모델/effort 독립 확인 한계, STE 기준파일 부재.
- 경계: 원본 PR58/59는 초안·open, #13/#18 사용자 수용 대기. #14/#19/#22/#25 Blocked 유지. 실제 KIS 업무API·주문·취소·예약·외부알림 없음. root·다른 worktree·원장·백업·설정 보존.
- 전달: [초안 PR60](https://github.com/krdn/gon-stock03/pull/60), 통합 제품 `2bd44733f8b6923841b5fff46d358f13cdf36090`. 이후 변경은 이 전달 문서뿐이다. 최신 head CI는 PR 본문의 최종 원격 확인을 기준으로 조회한다.
- 다음: 최신 head CI 확인 후 사용자 수용 대기. main 병합·원본 완료 처리와 사용자 직접 화면 수용은 이 작업의 결과가 아니다.
