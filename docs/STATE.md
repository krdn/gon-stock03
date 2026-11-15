# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- 현재 독립 작업: [#48 KIS 요청 간격 CI 실패](tasks/48-kis-pacing.md). 단조 시계·전송 경계 수정, RED3건→GREEN·단위/API84·빌드·100회 부족0건·Argon 전달 리뷰 PASS. [검증](verification/2026-11-16-kis-pacing.md). 초안 PR·원격 CI 진행 중. 실제 KIS 호출 없음.
- 폴더/브랜치: `/home/gon/llm-projects/gon-stock03-worktrees/48-kis-pacing`, `fix/48-kis-pacing`. 기준 main `034f7e766d67b0ecfe3dab8477078939c255412e`, 준비 `6839743eb3abdf12612880d4c6fdb3266d9c502e`.
- 승인 대기: [#9](https://github.com/krdn/gon-stock03/issues/9#issuecomment-6896471788) OPEN/Blocked, [PR47](https://github.com/krdn/gon-stock03/pull/47) Draft. head `7fac5aac71702e1a56a61173b1b556ee703f35d9`, CI4개 SUCCESS. 웹 취소 대안 결정과 최소 모의 주문 승인·증거가 남았다. #48로 #9 또는 후속 native 선행을 해제하지 않는다.
- 원본 보존: `/home/gon/llm-projects/gon-stock03`의 #9 브랜치·미추적 `.codex/`를 유지한다. 새 세션만 #48 폴더를 수정한다. 부모 t73은 인계 후 구현을 중단한다.
- 재개: AGENTS → #48 작업 파일·필수 읽기 → #48/#9·PR47·관련 CI만 확인한다. 탭·ID·cwd·Ready 확인 뒤 착수하며 실제 결과는 #48 댓글에 기록한다.
- 선행 완료: #24 PR45/46 통합·completed/Done. main 앱43724416483·구성43724416509 SUCCESS. [#24 인계](https://github.com/krdn/gon-stock03/issues/24#issuecomment-6896090609).
- 남은 기능 #9·11·12·13·14·17·18·19·22·25는 Blocked. 실제 KIS 일봉·공식 달력·주문/체결/취소/불명복구·연속전략·V01은 미검증이다.
- 보존 한계: STE 기준 파일·graphify 부재, #8 Fable 한도 오류. #21 당시의 정확한 스케줄은 복원 불가이며 #48의 재현·수정 근거와 구분한다. 지정 리뷰의 요청/init와 서버 모델·effort 독립 확인 한계를 구분한다.
