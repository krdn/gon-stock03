# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매. 해외·실전·다중 사용자는 범위 밖.

- 현재 작업: [#16 포트폴리오](tasks/16-portfolio.md), [PR #37](https://github.com/krdn/gon-stock03/pull/37) 게시, 구현·로컬 검증·Argon 리뷰 완료. 최종 CI·화면 수용·통합 대기. KIS 잔고·환경 분리·평가 불가·합계/비중을 검증했다. 주문 실행은 포함하지 않는다.
- 최근 완료: [#20 관심종목](tasks/20-watchlist.md), completed/Done. PR #35·#36 통합 및 최종 main CI 성공을 확인했다.
- 기준 main: `daa01baa65f94cb5c9e1497a28fa8c2ff71938e9`. 앱43702990997·구성43702990969 SUCCESS. 실제 Herdr 탭 연결 확인 후 #16 소유권을 이 세션으로 넘겼다. `.codex/config.toml`은 미추적 사용자 설정으로 보존한다.
- 선행 기록: [기준선 #5](tasks/5-baseline.md), [공통 상태 #6](tasks/6-common-state.md), [마스터·일봉 #7](tasks/7-market-data.md), [연결·설정 #8](tasks/8-connection-settings.md). 완료 이력·세부 근거는 해당 파일을 읽는다.
- 후속: #9는 Ready이지만 실제 모의접수 승인·장중 실증은 별도다. #12는 #9·#11 미완료로 Blocked다. 다음 구현은 선택된 이슈의 native 선행과 Project 상태를 다시 확인한 뒤 별도로 진행한다.
- 필수 읽기: 현재 작업 파일 → 선택한 이슈 → [세션 계획](plans/interface-sessions-2026-11.md)의 해당 행·운영 규칙 → 필수 파일·관련 PR/CI. 전체 대화·과거 작업을 반복 읽지 않는다.
- 미검증: #7 실제 공개 마스터3962종목과 실제 KIS 기간별 일봉·공식 달력 대조 미검증을 구분한다. STE 기준 파일·graphify 환경 부재를 유지한다. Argon 요청/초기화 ID 확인과 서버 모델·effort 독립 확인 한계, #8 Fable 한도 오류는 각 검증 기록을 따른다.
- 수용 경계: #8/#10은 사용자 진행 지시와 지정 모델 검증에 따른 통합이며 사용자 직접 육안 확인·장중 전체 수용이 아니다. [공통 기능 #2](tasks/2-trading-functions.md)·[화면 묶음 #3](tasks/3-screen-blueprint.md)와 #1은 OPEN이다. 실제 KIS 주문·체결·취소·연속 운영·V01 장중 수용은 남아 있다.
- 기존 기술 스택 추천 문서는 별도 리팩터링 지시가 아니다. 실제 조회 성공은 주문·체결 성공이 아니며 이 인계에는 주문·취소·전략 실행 승인이 없다.
