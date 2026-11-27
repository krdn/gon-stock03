# 확정 일봉 전략 7종 · Item #84

기준 이슈 https://github.com/krdn/gon-stock03/issues/235 · [계산 및 PR 2B 계약](../plans/strategy-rules.md). 시작 커밋 8692192. 저장 일봉과 격리 DEMO에서 평가한다.

- 저장 일봉 7종과 종가 전용 DEMO 2종, 카탈로그 21개 프리셋을 구현했다. 전용 폼과 도움말은 PR 2B에서 연결한다.
- npm ci 후 typecheck·빌드·단위 354건·격리 브라우저 E2E 328건이 통과했다. v1 고정 해시와 replay를 기존 fixture로 대조했다.
- implementation-ready 통과. resume은 기존 미추적 pnpm-lock.yaml에서 중단되어 열린 이슈와 작업 브랜치의 로컬·원격 HEAD를 직접 대조했다. Graphify 실행 파일 부재로 갱신 결과는 미검증이다.
- 독립 리뷰에서 요청·반환 모델 Claude Opus 5.5, 요청 effort high를 확인했다. 11번의 청산 기준을 매 봉 다시 계산하는 직전 N봉 최저가로 명시했고 시가 누락 안내를 보완했다. 저장 일봉은 server/backtest.ts에서 open 등 OHLCV를 검증한 스냅샷을 그대로 엔진에 전달한다. 신규 7종의 모의 시작 거부 및 DEMO 저장·계산 허용/거부를 메모리 DB·가짜 전송 HTTP 테스트로 확인한다. KIS 전송 횟수 기대값은 0이다.
