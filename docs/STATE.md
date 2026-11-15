# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- 통합 완료: [#50 전체 브랜치 대조](tasks/50-branch-integration.md). PR49·47 정상 merge, 제품 main `b9a12325ec1fcb683bced5911709d09b6814ffe4`. 기존21개 브랜치도 이미 반영됨을 검증했다. 최종 기록 PR·main SHA·CI는 [#50](https://github.com/krdn/gon-stock03/issues/50)의 종료 댓글 확인.
- [#48 요청 간격](tasks/48-kis-pacing.md): 재현·수정·수용·통합 완료. 결합 단위/API99·빌드·브라우저67·이번 Argon MERGE PASS. [검증](verification/2026-11-16-branch-integration.md).
- 현재/다음: [#9 KIS 주문·복구](tasks/9-kis-orders-recovery.md) OPEN/Blocked. PR47 코드 통합은 실제 모의 주문 승인이나 실증 완료가 아니다. [웹 취소 대안·미승인 최소 실행안](operations/kis-minimum-paper-run.md)의 사용자 결정·승인과 실제 접수·조회 증거가 남았다.
- 기능 #9·11·12·13·14·17·18·19·22·25의 차단을 유지한다. 실제 KIS 인증·조회·주문·취소·전략 호출은 이번 통합에서 수행하지 않았다.
- 원본 `/home/gon/llm-projects/gon-stock03`의 브랜치·미커밋·`.codex/`·작업 파일을 해시와 Git 상태로 보존 확인했다. 모든 브랜치를 유지하며 강제푸시·보호규칙 우회·추가 에이전트 없음.
- 재개: AGENTS → #9 작업 파일 → 필요한 승인안·관련 이슈/PR/CI. 통합 내역이 필요할 때만 #50 기록을 추가 확인한다.
- 보존 한계: STE 기준 파일·graphify 부재, #8 Fable 한도 오류, #21 역사적 CI 정확 스케줄 복원 불가, 리뷰 서버 모델·effort 독립 확인 한계.
