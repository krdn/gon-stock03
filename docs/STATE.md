# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매. 해외·실전·다중 사용자는 범위 밖.

- 현재 완료: [#15 데이터 상태](tasks/15-data-status.md), completed/Done. 이번 계속 진행 지시와 지정 Argon 검증에 따라 [PR #39](https://github.com/krdn/gon-stock03/pull/39)를 통합했다. [수용 형태·검증 경계](verification/2026-11-15-data-status.md#계속-진행에-따른-통합).
- 기준 main: `ab5e16f4ca0d141308c98f2b4e96dad8dc01c97a`. 앱43712041000·구성43712040993 SUCCESS. 기록 PR 통합 후 최종 main SHA·CI·원격 인계를 확인한다.
- 다음 작업: [#21 백테스트](https://github.com/krdn/gon-stock03/issues/21), Ready. native 선행 #7·#15 completed 및 main 통합을 확인했다. 실제 저장 일봉의 기간·출처·수정주가 정책 선택과 재현 가능한 실험 입력 보존이 범위다. 신규 수집 엔진·주문 실행은 포함하지 않는다.
- 새 세션 준비: Herdr `#21 백테스트` 탭·terminal t6z·session `01a1df18-deae-7de3-be21-7c073e8e82c1`의 실제 렌더링·동일 경로·Ready를 확인했다. 최종 기록 main CI 확인 후 부모 t6x가 소유권을 넘긴다. #15 t6y는 수정 중단을 확인했다. 착수 시 계획 S08·필수 파일만 읽고 TEMPLATE로 작업 파일을 만든다.
- 검증: 단위71·전체 브라우저57·빌드·Argon 원/수정분 리뷰 및 최종 PR CI PASS. 직접 육안·장중 수용, 실제 KIS 일봉·공식 달력 대조는 미검증이다. `.codex/config.toml` 미추적 사용자 설정을 보존한다.
- 선행 기록: [기준선 #5](tasks/5-baseline.md), [공통 상태 #6](tasks/6-common-state.md), [마스터·일봉 #7](tasks/7-market-data.md), [연결·설정 #8](tasks/8-connection-settings.md). 완료 이력·세부 근거는 해당 파일을 읽는다.
- 후속: #9는 Ready이지만 실제 모의접수 승인·장중 실증은 별도다. #12는 #9·#11 미완료로 Blocked다. 다음 구현은 선택된 이슈의 native 선행과 Project 상태를 다시 확인한 뒤 별도로 진행한다.
- 필수 읽기: 현재 작업 파일 → 선택한 이슈 → [세션 계획](plans/interface-sessions-2026-11.md)의 해당 행·운영 규칙 → 필수 파일·관련 PR/CI. 전체 대화·과거 작업을 반복 읽지 않는다.
- 미검증: #7 실제 공개 마스터3962종목과 실제 KIS 기간별 일봉·공식 달력 대조 미검증을 구분한다. STE 기준 파일·graphify 환경 부재를 유지한다. Argon 요청/초기화 ID 확인과 서버 모델·effort 독립 확인 한계, #8 Fable 한도 오류는 각 검증 기록을 따른다.
- 수용 경계: #8/#10은 사용자 진행 지시와 지정 모델 검증에 따른 통합이며 사용자 직접 육안 확인·장중 전체 수용이 아니다. [공통 기능 #2](tasks/2-trading-functions.md)·[화면 묶음 #3](tasks/3-screen-blueprint.md)와 #1은 OPEN이다. 실제 KIS 주문·체결·취소·연속 운영·V01 장중 수용은 남아 있다.
- 기존 기술 스택 추천 문서는 별도 리팩터링 지시가 아니다. 실제 조회 성공은 주문·체결 성공이 아니며 이 인계에는 주문·취소·전략 실행 승인이 없다.
