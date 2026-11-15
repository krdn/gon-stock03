# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- 현재: [#50 전체 브랜치 통합](tasks/50-branch-integration.md). 사용자의 “모든 브랜치 머지해줘” 지시로 PR49·47을 결합 검증하고 main에 통합한다. 최종 SHA·CI·병합 결과는 #50 댓글에서 확인한다.
- [#48 요청 간격 수정](tasks/48-kis-pacing.md): 독립 재현·검증 완료. PR49와 PR47 결합 회귀를 이번 #50에서 확인한다.
- 다음: [#9 KIS 주문·복구](tasks/9-kis-orders-recovery.md) OPEN/Blocked. 코드 통합은 실제 모의 주문 승인이나 실증 완료가 아니다. [웹 취소 대안·미승인 최소 실행안](operations/kis-minimum-paper-run.md)의 사용자 결정·승인과 실제 접수·조회 증거가 남았다.
- 기능 #9·11·12·13·14·17·18·19·22·25의 차단을 유지한다. 실제 KIS 인증·조회·주문·취소·전략 호출은 이번 통합에서 금지한다.
- 원본 `/home/gon/llm-projects/gon-stock03`의 브랜치·미커밋·`.codex/`·작업 파일을 보존한다. 통합 세션만 격리 clone에서 수정한다. 브랜치 삭제·강제푸시·보호규칙 우회·추가 에이전트 없음.
- 재개: AGENTS → #50 작업 파일 → 관련 PR/이슈/CI와 필요한 #9 기록만 확인한다.
- 보존 한계: STE 기준 파일·graphify 부재, #8 Fable 한도 오류, #21 역사적 CI 정확 스케줄 복원 불가, 지정 리뷰의 서버 모델·effort 독립 확인 한계.
