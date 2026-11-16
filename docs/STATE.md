# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- **현재 작업:** [#11 위험관리](tasks/11-risk-management.md), `feat/11-risk-management`. 불명 중 재개 차단, 환경별 사용량·산식, 저장 중 편집 보존 구현. [PR55](https://github.com/krdn/gon-stock03/pull/55)·제품e459e95. 지정Argon 위임수용 PASS. 최종 merge/main CI와 완료 상태는 #11 종료 댓글을 확인한다. 다음 후보는 #12/#17이며 별도 작업으로 남긴다.
- **선행 완료:** PR54 main `5314e0203b47435600de9a51fbe839a0c327875b` 통합, main CI2 SUCCESS. 지정 Argon 위임 수용 후 #9 completed/Project Done. [#9 근거](tasks/9-kis-orders-recovery.md). #11 In Progress, #17 Ready, #12/#13은 남은 선행으로 Blocked.
- **실증 경계:** [삼성전자 한 건](verification/2026-11-16-samsung-paper-run.md)은 매수 접수·REST 대조·취소·체결0/잔량0만 입증한다. 일반 웹 취소·정정409 차단과 공식 계약 미확정은 유지한다. 실제 체결·부분체결·취소경합·불명복구·연속전략·전체 사용자 화면 수용은 [#25](https://github.com/krdn/gon-stock03/issues/25) 미관측이다.
- **거래 제한:** 현재 실제 KIS 업무API·주문·취소·예약 금지. 최신 거래 지시는 다음 별도 장중 시작 때 매수만/사용자 모바일 직접취소다. 소비된 원장 재설정 없음.
- **보존:** `.local/` 원장·백업, `.codex/`, `graphify-out/`, 다른 worktree. 강제푸시·보호규칙 우회·추가 에이전트·부모 재위임 없음.
- **재개:** 현재 작업 파일·필수 자료·관련 원격 이슈/PR/CI만 확인한다. 기존 통합 기록은 필요할 때만 [#50](tasks/50-branch-integration.md)을 읽는다.
- **검증 한계:** STE 기준파일 부재(exit2), 기존 번들 크기 경고, 리뷰 요청/init 일치와 서버 내부 모델·effort 독립 확인의 차이를 유지한다.
