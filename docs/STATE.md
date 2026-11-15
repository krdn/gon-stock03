# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매. 해외·실전·다중 사용자는 범위 밖.

- 기준선: [#5 수용·통합 기록](tasks/5-baseline.md). 사용자 조건부 승인과 실제 Claude Opus 5.5 PASS에 따라 [PR #4](https://github.com/krdn/gon-stock03/pull/4)를 병합했다. 기준선 SHA `9b4b361fa4b476f296cdaf60e27ba915c3d521a7`, main 앱·구성 CI 통과.
- 현재 작업 완료: [공통 상태 계약 #6](tasks/6-common-state.md). 새 탭에서 통합을 계속하라는 사용자 지시에 따라 [PR #27](https://github.com/krdn/gon-stock03/pull/27)을 `8b280229671bb8452c66ecc4939e87fda569c697`로 병합했다. main 앱·구성 CI와 단위38·브라우저21·빌드 성공을 확인하고 #6을 completed/Done으로 마감했다. 별도 사용자 수용 발언이나 실제 KIS 성공을 추정하지 않았다.
- 다음 권장: [국내 종목 마스터·일봉 수집 #7](https://github.com/krdn/gon-stock03/issues/7), Ready·미착수. native 선행 #6 completed·main 통합을 확인했다. 새 세션에서 최신 origin/main·CI·이슈의 필수 자료를 확인하고 작업 파일을 만든다.
- 다른 Ready: [연결·설정 #8](https://github.com/krdn/gon-stock03/issues/8), [매매일지 #23](https://github.com/krdn/gon-stock03/issues/23), [설계실 #24](https://github.com/krdn/gon-stock03/issues/24). 2026-11-15 native 선행과 Project를 재조회했다. 한 세션에 한 이슈씩 진행한다.
- 필수 읽기: 선택한 이슈 → [세션 계획](plans/interface-sessions-2026-11.md)의 해당 행·운영 규칙 → 그 이슈의 필수 파일·관련 PR/CI. 전체 과거 기록은 읽지 않는다.
- 리뷰 후속: [Opus 검증 기록](verification/2026-11-15-baseline.md). 비차단 P2를 #9·#11·#18·#6·#2에 이관했다. #6의 비JSON·revision 두 항목은 재현·수정했고 나머지는 해당 작업에서 검증한다.
- 기존 구현: [화면 묶음 #3](tasks/3-screen-blueprint.md), [공통 기능 묶음 #2](tasks/2-trading-functions.md). #1/#2/#3은 OPEN이며 실제 KIS 주문·체결·취소·연속 운영·최종 장중 수용은 남아 있다.
- 시각화: 앱 `/design`, 프로젝트 지도 `/project-map.html`. 초기 화면 기준선의 채택이 화면별 상세 기능이나 전체 제품 완료를 뜻하지 않는다.
- 중요: 실제 API 조회 성공 ≠ 실제 주문·체결 성공. 데모 백테스트 ≠ 투자 성과. 주문 전송은 해당 작업에서 승인 범위와 실행 조건을 별도로 확인한다.
