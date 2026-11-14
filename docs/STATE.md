# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매. 해외·실전·다중 사용자는 범위 밖.

- 현재: [2차 기능·KIS 연결 #2](tasks/2-trading-functions.md). 로컬 기능 구현·검증, KIS 실조회 확인. 실제 주문 체결·취소·연속 자동매매 검증은 남음.
- 1차: [15개 화면·설계 #3](tasks/3-screen-blueprint.md). PC/모바일 탐색 검증. 사용자 디자인 수용은 미확인.
- 필수 읽기: 현재 작업 파일 → [설계](architecture/workbench.md) → [실행/복구](operations/local.md) → [검증](verification/2026-11-14.md). 전체 과거 기록은 읽지 않는다.
- 시각화: 앱 `/design`, 프로젝트 지도 `/project-map.html`.
- 브랜치: `feat/trading-workbench` · [초안 PR #4](https://github.com/krdn/gon-stock03/pull/4). 구현 SHA `4f9ba30`, 최종 head/CI는 PR Checks와 작업 파일에서 확인. 전체 완료·merge·사용자 수용 전.
- 다음: 1차 화면 피드백 반영, KIS 모의 정정취소 가능수량 계약과 불명 복구 설계, 장중 주문/부분체결/복구 실증, WebSocket 기반 연속 자동매매 연결.
- 중요: 실제 API 조회 성공 ≠ 실제 주문·체결 성공. 데모 백테스트 ≠ 투자 성과. 사용자 결과 수용·실전 허용을 만들지 않는다.
