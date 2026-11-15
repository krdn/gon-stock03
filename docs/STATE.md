# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매. 해외·실전·다중 사용자는 범위 밖.

- 기준선: [#5 수용·통합 기록](tasks/5-baseline.md). 사용자 조건부 승인과 실제 Claude Opus 5.5 PASS에 따라 [PR #4](https://github.com/krdn/gon-stock03/pull/4)를 병합했다. 기준선 SHA `9b4b361fa4b476f296cdaf60e27ba915c3d521a7`, main 앱·구성 CI 통과.
- 선행 완료: [공통 상태 계약 #6](tasks/6-common-state.md), PR #27·#28 통합, completed/Done. 통합 전 main `d898eec`의 앱·구성 CI 성공을 재확인했다.
- 현재 작업 완료: [국내 종목 마스터·일봉 수집 #7](tasks/7-market-data.md), completed/Done. 사용자의 새 세션 진행 지시에 따라 [PR #29](https://github.com/krdn/gon-stock03/pull/29)를 `bc81384`로 통합했다. main 앱·구성 CI, 단위51·브라우저21·빌드 성공. 실제 공개 마스터3962종목 검증과 Opus 수정분 PASS 이후 간격 보완의 직접 검증 범위를 보존한다.
- 미검증: 실제 KIS 기간별 일봉·공식 달력 대조, STE 기준 파일·graphify 환경 부재. 별도 사용자 수용 발언이나 장중 실증 성공을 만들지 않는다.
- 다음 행동: [연결·설정 #8](https://github.com/krdn/gon-stock03/issues/8) 등 Ready 이슈 중 하나를 별도 지시에 따라 진행한다. #8을 포함한 새 구현은 시작하지 않았다.
- 후속 상태: 2026-11-15 #7 완료 후 native 선행·Project 재조회. [시장 탐색 #10](https://github.com/krdn/gon-stock03/issues/10)·[데이터 상태 #15](https://github.com/krdn/gon-stock03/issues/15)는 Ready, [백테스트 #21](https://github.com/krdn/gon-stock03/issues/21)은 #15 미완료로 Blocked다. #8·#23·#24의 Ready를 유지하며 한 세션에 한 이슈씩 진행한다.
- 필수 읽기: 선택한 이슈 → [세션 계획](plans/interface-sessions-2026-11.md)의 해당 행·운영 규칙 → 그 이슈의 필수 파일·관련 PR/CI. 전체 과거 기록은 읽지 않는다.
- 리뷰 후속: [Opus 검증 기록](verification/2026-11-15-baseline.md). 비차단 P2를 #9·#11·#18·#6·#2에 이관했다. #6의 비JSON·revision 두 항목은 재현·수정했고 나머지는 해당 작업에서 검증한다.
- 기존 구현: [화면 묶음 #3](tasks/3-screen-blueprint.md), [공통 기능 묶음 #2](tasks/2-trading-functions.md). #1/#2/#3은 OPEN이며 실제 KIS 주문·체결·취소·연속 운영·최종 장중 수용은 남아 있다.
- 시각화: 앱 `/design`, 프로젝트 지도 `/project-map.html`. 초기 화면 기준선의 채택이 화면별 상세 기능이나 전체 제품 완료를 뜻하지 않는다.
- 중요: 실제 API 조회 성공 ≠ 실제 주문·체결 성공. 데모 백테스트 ≠ 투자 성과. 주문 전송은 해당 작업에서 승인 범위와 실행 조건을 별도로 확인한다.
