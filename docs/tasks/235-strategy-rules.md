# 확정 일봉 전략 7종 · Item #84

기준 이슈 https://github.com/krdn/gon-stock03/issues/235 · [계산 및 PR 2B 계약](../plans/strategy-rules.md). 시작 커밋 8692192. 저장 일봉과 격리 DEMO에서 평가한다.

- 저장 일봉 7종과 종가 전용 DEMO 2종, 카탈로그 21개 프리셋을 구현했다. 전용 폼과 도움말은 PR 2B에서 연결한다.
- npm ci 후 typecheck·빌드·단위 354건·격리 브라우저 E2E 328건이 통과했다. v1 고정 해시와 replay를 기존 fixture로 대조했다.
- implementation-ready 통과. resume은 기존 미추적 pnpm-lock.yaml에서 중단되어 열린 이슈와 작업 브랜치의 로컬·원격 HEAD를 직접 대조했다. Graphify 실행 파일 부재로 갱신 결과는 미검증이다.
- 독립 리뷰에서 요청·반환 모델 Claude Opus 5.5, 요청 effort high를 확인했다. 11번의 청산 기준을 매 봉 다시 계산하는 직전 N봉 최저가로 명시했고 시가 누락 안내를 보완했다. 저장 일봉은 server/backtest.ts에서 open 등 OHLCV를 검증한 스냅샷을 그대로 엔진에 전달한다. 신규 7종의 모의 시작 거부 및 DEMO 저장·계산 허용/거부를 메모리 DB·가짜 전송 HTTP 테스트로 확인한다. KIS 전송 횟수 기대값은 0이다.

## PR 2B (UI·도움말 10종 연동)
- `src/pages/Research.tsx`, `src/pages/Strategies.css`, `src/pages/Backtest.css`에서 `RULE_KINDS` 10종 전체(기존 3종 + 신규 7종)의 그룹 선택기, 21개 신규 프리셋, 정수/실수/대소 역전/`badInput` 검증, DEMO 종가 전용 분기(`macd_momentum`·`bollinger_percent_b` 허용, 일봉 전용 6종·샹들리에 차단), KIS 모의 정지 저장 및 카드 시작 비활성화, 10종+샹들리에 11카드 도움말 사전·문맥 가이드를 연동했다.
- 격리 포트 4314·메모리 DB 기준 `typecheck`, `build`, 단위 354/354, E2E 332/332(기존 328 + 신규 4) 전수 통과.
- Orca 내장 브라우저(PC)와 390px 모바일 뷰포트에서 10종 선택·오류/포커스·도움말 키보드 탭·DEMO 허용/차단·가로 무넘침(`scrollWidth <= 390`)·콘솔 오류 0건을 실측했고, 임시 4314 서버 종료 및 포트 해제를 확인했다.
- 미검증: KIS 모의 실계좌 실시간 주문·장전 레벨 트리거 계약 연결(후속 단계 범위), 운영 4303/4304 서버 반영.
