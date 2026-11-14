# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매. 해외·실전·다중 사용자는 범위 밖.

- 현재 관리: [화면별 세션 계획](plans/interface-sessions-2026-11.md). 15개 화면·공통 기능 4개·기준선·장중 실증으로 분할하고 GitHub 등록·관계·Project를 재조회했다.
- 다음 개발: [기준선 확정 #5](tasks/5-baseline.md). PR #4의 초기 화면 수용 범위·최신 CI·통합 기준 SHA를 먼저 확정한다. 이후 Project의 Ready 작업 하나씩 진행한다.
- 기존 구현: [화면 묶음 #3](tasks/3-screen-blueprint.md), [공통 기능 묶음 #2](tasks/2-trading-functions.md). 실제 주문 체결·취소·연속 자동매매 실증은 남음.
- 필수 읽기: 선택한 작업 파일·이슈 → [세션 계획](plans/interface-sessions-2026-11.md)의 해당 행·운영 규칙 → 그 이슈의 필수 파일·관련 PR/CI. 전체 과거 기록은 읽지 않는다.
- 시각화: 앱 `/design`, 프로젝트 지도 `/project-map.html`.
- 브랜치: `feat/trading-workbench` · [초안 PR #4](https://github.com/krdn/gon-stock03/pull/4). 구현 SHA `4f9ba30`, 최종 head/CI는 PR Checks와 작업 파일에서 확인. 전체 완료·merge·사용자 수용 전.
- 실행 순서: #5 → 공통 상태·데이터 → 조회·주문 계약과 최소 모의 실증 → 화면별 완성 → 실시간·전략 → 장중 통합 수용. 정확한 선행 관계는 이슈의 blocked by를 따른다.
- 중요: 실제 API 조회 성공 ≠ 실제 주문·체결 성공. 데모 백테스트 ≠ 투자 성과. 사용자 결과 수용·실전 허용을 만들지 않는다.
