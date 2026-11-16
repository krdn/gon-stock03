# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- **보존 — #13 수용 대기:** [#13 주문·체결](tasks/13-orders.md), `feat/13-orders`, main `bf158cc` 기반. DEMO 관리·검색과 읽기 전용 KIS 원장 분리. 단위137·브라우저88·빌드·Argon ORDERS PASS, [초안 PR58](https://github.com/krdn/gon-stock03/pull/58), 제품 `8ca0d245`, 사용자 수용·통합 대기.
- **보존 — #18 수용 대기:** [#18 대시보드](tasks/18-dashboard.md), `feat/18-dashboard`, main `bf158cc` 기반 전용 worktree. DEMO/KIS 계좌·연결·미체결·정지·원인 링크를 읽기 전용으로 집계. 단위134·브라우저89·빌드·Argon DASHBOARD/DELTA PASS, [초안 PR59](https://github.com/krdn/gon-stock03/pull/59), 제품 `cb8e84a`. 사용자 수용·통합 대기.
- **현재 작업:** [PR58·59 결합 후보](tasks/13-18-integration.md), `integration/13-18` 전용 worktree, [초안 PR60](https://github.com/krdn/gon-stock03/pull/60), 제품 `2bd4473`. 단위137·브라우저95·빌드·Argon INTEGRATION PASS. 원본 두 PR과 기능 보존, 사용자 수용·main 통합은 별도 대기.
- **선행:** #9·#12 completed/Done, PR56 merge `d678e31` main CI2 SUCCESS. PR57 merge `bf158cc`, head CI4·main CI2 SUCCESS, #17 completed/Done. [#12·#17 결합 검증](verification/2026-11-16-trading-alerts-integration.md):134/83/빌드·Argon MERGE PASS.
- **수용 근거:** 사용자 “작업 진행”과 지정 모델 검증·통합 지시에 따른 기술 수용. 사용자 직접 육안 관찰·장중 수용을 주장하지 않는다. #13은 후속 구현·검증 범위.
- **다음:** PR60 최신 head CI 확인·전달 후 사용자 수용 대기. #13/#18 open 유지, #14는 #13, #19는 #14/#18, #22/#25도 Blocked 유지.
- **실증 경계:** [삼성전자 한 건](verification/2026-11-16-samsung-paper-run.md)은 매수 접수·REST 대조·취소·체결0/잔량0만 입증한다. 일반 웹 취소·정정409 차단과 공식 계약 미확정은 유지한다. 실제 체결·부분체결·취소경합·불명복구·연속전략·전체 사용자 화면 수용은 [#25](https://github.com/krdn/gon-stock03/issues/25) 미관측이다.
- **거래 제한:** 현재 실제 KIS 업무API·주문·취소·예약 금지. 최신 거래 지시는 다음 별도 장중 시작 때 매수만/사용자 모바일 직접취소다. 소비된 원장 재설정 없음.
- **보존:** `.local/` 원장·백업, `.codex/`, `graphify-out/`, 다른 worktree. 강제푸시·보호규칙 우회·추가 에이전트·부모 재위임 없음.
- **재개:** 현재 작업 파일·필수 자료·관련 원격 이슈/PR/CI만 확인한다. 기존 통합 기록은 필요할 때만 [#50](tasks/50-branch-integration.md)을 읽는다.
- **검증 한계:** STE 기준파일 부재(exit2), 기존 번들 크기 경고, 리뷰 요청/init 일치와 서버 내부 모델·effort 독립 확인의 차이를 유지한다.
