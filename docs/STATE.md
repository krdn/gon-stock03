# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매. 해외·실전·다중 사용자는 범위 밖.

- 현재 작업: [#15 데이터 상태](tasks/15-data-status.md), OPEN/In Review. [PR #39](https://github.com/krdn/gon-stock03/pull/39), 제품 `b8645701b6ec0ec65e94c4897812304fbbc9424f`. 실제 수집 범위·거래일·수정주가·누락·중복·마지막 성공 표시를 구현·검증했다. C01/C02 저장·서비스를 재사용한다.
- 기준 main: `0ea629604c8e75acb0a253e5bcb4a6fbe77ae088`. PR #37·#38 통합, 앱43707747091·구성43707747046 SUCCESS. #16 completed/Done. #15 native 선행 #6·#7 completed·통합 재확인.
- 현재 소유: Herdr terminal t6y, session `01a1dee2-7db7-7dd0-8f32-595cb38802f7`, `/home/gon/llm-projects/gon-stock03`. 부모 t6x의 소유권 인계 후 이 세션만 수정한다.
- 검증: 단위71·전체 브라우저57·빌드·Argon 원/수정분 리뷰 PASS. 제품 SHA push·PR 앱/구성 CI SUCCESS. [상세 근거·수용 경계](verification/2026-11-15-data-status.md).
- 다음 행동: #15 해당 제품 SHA의 화면 수용 형태와 PR #39 통합을 확인한 뒤 completed/Done 처리. 직접 육안·장중 수용은 미실시다. #21 착수는 #15 통합 후 선행·Project를 다시 확인한다.
- 선행 기록: [기준선 #5](tasks/5-baseline.md), [공통 상태 #6](tasks/6-common-state.md), [마스터·일봉 #7](tasks/7-market-data.md), [연결·설정 #8](tasks/8-connection-settings.md). 완료 이력·세부 근거는 해당 파일을 읽는다.
- 후속: #9는 Ready이지만 실제 모의접수 승인·장중 실증은 별도다. #12는 #9·#11 미완료로 Blocked다. 다음 구현은 선택된 이슈의 native 선행과 Project 상태를 다시 확인한 뒤 별도로 진행한다.
- 필수 읽기: 현재 작업 파일 → 선택한 이슈 → [세션 계획](plans/interface-sessions-2026-11.md)의 해당 행·운영 규칙 → 필수 파일·관련 PR/CI. 전체 대화·과거 작업을 반복 읽지 않는다.
- 미검증: #7 실제 공개 마스터3962종목과 실제 KIS 기간별 일봉·공식 달력 대조 미검증을 구분한다. STE 기준 파일·graphify 환경 부재를 유지한다. Argon 요청/초기화 ID 확인과 서버 모델·effort 독립 확인 한계, #8 Fable 한도 오류는 각 검증 기록을 따른다.
- 수용 경계: #8/#10은 사용자 진행 지시와 지정 모델 검증에 따른 통합이며 사용자 직접 육안 확인·장중 전체 수용이 아니다. [공통 기능 #2](tasks/2-trading-functions.md)·[화면 묶음 #3](tasks/3-screen-blueprint.md)와 #1은 OPEN이다. 실제 KIS 주문·체결·취소·연속 운영·V01 장중 수용은 남아 있다.
- 기존 기술 스택 추천 문서는 별도 리팩터링 지시가 아니다. 실제 조회 성공은 주문·체결 성공이 아니며 이 인계에는 주문·취소·전략 실행 승인이 없다.
