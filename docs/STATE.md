# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매. 해외·실전·다중 사용자는 범위 밖.

- 현재 작업: [기준선 확정 #5](tasks/5-baseline.md). 기존 head `96f508c`의 CI·단위 23개·브라우저 9개·빌드를 재확인했다. 초기 화면·로컬 데모의 사용자 수용이 남아 있으며 PR #4는 초안이다.
- 다음 행동: 작업 파일의 수용 범위를 확인한 뒤 PR #4를 정상 통합하고 `origin/main` SHA를 기록한다. 그전에는 후속 기능을 시작하지 않는다.
- 후속 관리: [화면별 세션 계획](plans/interface-sessions-2026-11.md). 기준선 통합 후 선행 조건이 충족된 #6·#23·#24의 Project Ready를 확인한다.
- 기존 구현: [화면 묶음 #3](tasks/3-screen-blueprint.md), [공통 기능 묶음 #2](tasks/2-trading-functions.md). 실제 주문 체결·취소·연속 자동매매 실증은 남음.
- 필수 읽기: 선택한 작업 파일·이슈 → [세션 계획](plans/interface-sessions-2026-11.md)의 해당 행·운영 규칙 → 그 이슈의 필수 파일·관련 PR/CI. 전체 과거 기록은 읽지 않는다.
- 시각화: 앱 `/design`, 프로젝트 지도 `/project-map.html`.
- 브랜치: `feat/trading-workbench` · [초안 PR #4](https://github.com/krdn/gon-stock03/pull/4). 구현 SHA `4f9ba30`, 최종 head/CI는 PR Checks와 작업 파일에서 확인. 전체 완료·merge·사용자 수용 전.
- 실행 순서: #5 → 공통 상태·데이터 → 조회·주문 계약과 최소 모의 실증 → 화면별 완성 → 실시간·전략 → 장중 통합 수용. 정확한 선행 관계는 이슈의 blocked by를 따른다.
- 중요: 실제 API 조회 성공 ≠ 실제 주문·체결 성공. 데모 백테스트 ≠ 투자 성과. 사용자 결과 수용·실전 허용을 만들지 않는다.
