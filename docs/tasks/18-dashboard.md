# 작업: #18 대시보드

[이슈 #18](https://github.com/krdn/gon-stock03/issues/18). 기준 main `bf158ccaf826ca4e91ba5b6d7a059700dfb15098`, `feat/18-dashboard`, 전용 worktree.

- 상태: 구현·격리검증·지정 리뷰 완료, 초안 PR 전달 준비. native 선행 #16/#11/#17 closed/completed·Project Done, main CI2 SUCCESS 재확인.
- 범위: DEMO/KIS 계좌 합계·연결·정지·미체결·최종 성공 시각·원인 링크. DEMO 보유 현금과 미체결 예약액 문구 정정.
- 완료 조건: 환경 분리, 미연결/실패를 0원으로 대체하지 않음, 가격 누락 평가 불가, 저장 주문 대조 유효시간, 원인 이동 POST0회, 모바일·지정 리뷰·CI.
- 필수 읽기: AGENTS·WORKFLOW·#18, Workspace.tsx Dashboard, context.tsx, specs.ts dashboard, shared/portfolio.ts, App.tsx 공통 상태, tests/browser/dashboard.spec.ts.
- 제외: 실제 KIS 업무API·주문·취소·예약·외부알림. KIS 전략은 S07(#22), 장중 통합은 V01(#25). 원장·백업·보유·다른 worktree 보존.
- #13: PR58 head `38e6e40` CI4 PASS, 초안·사용자 수용/통합 대기. #14 선행 해제 없음.

검증 결과는 [검증 기록](../verification/2026-11-16-dashboard.md)에 남긴다. 사용자 직접 화면 수용은 미확인. 단위/API134·전체 브라우저89·빌드 PASS, 캡처 보정 후 대시보드6 PASS, Gemini4Argon/high DASHBOARD/DELTA PASS. STE 기준파일 부재로 미검증. 다음: 커밋·푸시·초안 PR·최신 head CI 확인. 사용자 수용·통합 전 완료/Done 처리하지 않는다.
