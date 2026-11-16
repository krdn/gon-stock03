# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- 통합 완료: [#50 전체 브랜치 대조](tasks/50-branch-integration.md). PR49·47 정상 merge, 제품 main `b9a12325ec1fcb683bced5911709d09b6814ffe4`. 기존21개 브랜치도 이미 반영됨을 검증했다. 최종 기록 PR·main SHA·CI는 [#50](https://github.com/krdn/gon-stock03/issues/50)의 종료 댓글 확인.
- [#48 요청 간격](tasks/48-kis-pacing.md): 재현·수정·수용·통합 완료. 결합 단위/API99·빌드·브라우저67·이번 Argon MERGE PASS. [검증](verification/2026-11-16-branch-integration.md).
- 현재 추가 준비: [#9 API 전량취소 후보](operations/kis-cancel-probe.md), `feat/9-vts-cancel-probe`. [초안 PR54](https://github.com/krdn/gon-stock03/pull/54) 지정 Argon 준비 리뷰 PASS. 기본 차단·취소 시도 1회 영구 기록을 유지한다. [규격 재조사·공식 문의 초안](research/kis-order-recovery-2026-11.md#2026-11-16-전량취소-규격-재조사)을 작성했다. 문의는 미발송이다. 사용자가 직접 모의 주문·취소 테스트와09:00–15:30 시간창 확대를 지시하고 동일계좌·타API중지·앱잔량취소·현재장중을 확인했다. 시간창 보완121·브라우저67·빌드·지정Argon PASS. 원격CI·사전조회 확인 후 한정1회 실행하며 결과는 #9 최신 댓글을 따른다.
- 기존 준비: [#9 KIS 주문·복구](tasks/9-kis-orders-recovery.md) 실행 준비. [검증 기록](verification/2026-11-16-paper-preflight.md)의 승인 제한 보완과 fixture110·브라우저67·빌드 PASS; 지정 리뷰·초안 PR·최종 CI는 #9 완료 인계 댓글 확인. 2026-11-16 사용자가 수동 취소 대안과 [최소 모의 주문 1회](operations/kis-minimum-paper-run.md)를 조건부 승인했다. 실행 전 조건·시간창 내 별도 수동 시작·실제 접수/조회 증거가 남아 OPEN/Blocked를 유지한다.
- 기능 #9·11·12·13·14·17·18·19·22·25의 차단을 유지한다. 실제 KIS 인증·조회·주문·취소·전략 호출은 이번 통합에서 수행하지 않았다.
- 준비 폴더: `/home/gon/llm-projects/gon-stock03-worktrees/9-paper-preflight`, 브랜치 `docs/9-paper-approval-preflight`, 기준 main `3f3bee6` CI2개 SUCCESS. t77 세션 `01a1e024-264c-7f20-b0a3-bf03559c62ba`의 실제 탭·cwd·Ready를 부모가 확인해 단독 착수했다. 지금 주문 실행/예약·상주 대기는 하지 않는다.
- 원본 `/home/gon/llm-projects/gon-stock03`과 #48 폴더의 브랜치·미커밋·`.codex/`를 보존한다. 강제푸시·보호규칙 우회·추가 에이전트·부모 재위임 없음.
- 재개: AGENTS → #9 작업 파일 → 필요한 승인안·관련 이슈/PR/CI. 통합 내역이 필요할 때만 #50 기록을 추가 확인한다.
- 보존 한계: STE 기준 파일·graphify 부재, #8 Fable 한도 오류, #21 역사적 CI 정확 스케줄 복원 불가, 리뷰 서버 모델·effort 독립 확인 한계.
