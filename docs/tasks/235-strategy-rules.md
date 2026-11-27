# 확정 일봉 전략 7종 · Item #84

기준 이슈 https://github.com/krdn/gon-stock03/issues/235 · [계산 및 PR 2B 계약](../plans/strategy-rules.md). 시작 커밋 8692192. 저장 일봉과 격리 DEMO에서 평가한다.

- 저장 일봉 7종과 종가 전용 DEMO 2종, 카탈로그 21개 프리셋을 구현했다. 전용 폼과 도움말은 PR 2B에서 연결한다.
- npm ci 후 typecheck·빌드·단위 354건·격리 브라우저 E2E 328건이 통과했다. v1 고정 해시와 replay를 기존 fixture로 대조했다.
- implementation-ready 통과. resume은 기존 미추적 pnpm-lock.yaml에서 중단되어 열린 이슈와 작업 브랜치의 로컬·원격 HEAD를 직접 대조했다. Graphify 실행 파일 부재로 갱신 결과는 미검증이다.
- 독립 리뷰에서 요청·반환 모델 Claude Opus 5.5, 요청 effort high를 확인했다. 11번의 청산 기준을 매 봉 다시 계산하는 직전 N봉 최저가로 명시했고 시가 누락 안내를 보완했다. 저장 일봉은 server/backtest.ts에서 open 등 OHLCV를 검증한 스냅샷을 그대로 엔진에 전달한다. 신규 7종의 모의 시작 거부 및 DEMO 저장·계산 허용/거부를 메모리 DB·가짜 전송 HTTP 테스트로 확인한다. KIS 전송 횟수 기대값은 0이다.

## PR 2B (UI·도움말 10종 연동 및 PR #237 감사 보완)
- `src/pages/Research.tsx`, `src/pages/TradingSettings.tsx`, `src/pages/Strategies.css`, `src/pages/Backtest.css`에서 `RULE_KINDS` 10종 전체(기존 3종 + 신규 7종)의 그룹 선택기, 21개 신규 프리셋, 정수/실수/대소 역전/`badInput` 검증, DEMO 종가 전용 분기(`macd_momentum`·`bollinger_percent_b` 허용, 일봉 전용 6종·샹들리에 차단), KIS 모의 정지 저장 및 카드 시작 비활성화, 10종+샹들리에 11카드 도움말 사전·문맥 가이드를 연동했다.
- Codex 교차 감사(`REQUEST_CHANGES`: Major 2, Minor 4) 보완 반영:
  - Major 1: `/backtest` 상위 `Backtest`로 `ruleForm`·`costs` 상태를 끌어올려 `DEMO 합성 ↔ KIS 저장 일봉` 출처 전환 시 편집값을 보존한다.
  - Major 2: `src/pages/TradingSettings.tsx`에서 `assertRealtimeRule`·`STRATEGY_CATALOG`·장기 100 이하 기준으로 실제 규칙명을 표시하고, 다중 규칙·오버레이 전략 선택 시 레거시 `5/20 교차` 오표시와 `fast/slow` 변질 복사를 차단했다.
  - Minor 1-4: 활성 프리셋 재클릭·동일 상태 시 `evidence` 유지, `CostFields` 입력 `name` 및 비용 검증 실패 시 포커스 이동, 샹들리에·거래량 필터 활성 시 `DEMO · 현재 설정 제한 (저장 일봉 필요)` 경고 배지 동적 전환, 도움말 닫힘 시 `aria-controls` 생략.
- 2차 증분 재감사(`REQUEST_CHANGES`: Major 2, Minor 1) 보완 반영:
  - Major 1: `Backtest`·`StoredBacktest`에서 폼(`ruleForm`·`costs`·날짜) 수정 시 `transfer.current`를 즉시 무효화하고 저장 실험과 현재 폼 일치를 대조해 뒤로→앞으로 이동 시 stale 결과와 `이 설정으로 전략 만들기` 버튼 재결합을 차단했다.
  - Major 2: `TradingSettings.tsx`에서 `selectedUnsupported` 선택 시 1·2·3단계 진행·초안 저장·고정 버튼과 `advance()`를 모두 차단(POST 0건)하고, 2·3단계 직접 URL 진입에서도 `5/20` 대신 실제 규칙명·차단 경고·1단계 복귀 링크를 표시한다.
  - Minor 1: `TradingSettings.tsx`의 전략 스튜디오 링크에 선택 전략 `code`·`rule`·`overlay` 초안(`backtestDraft`)을 전달하고 문구를 `전략 스튜디오에서 이 설정으로 새 전략 만들기`로 정정했다.
- 격리 포트 4314·메모리 DB 기준 `typecheck`, `build`, 단위 354/354, E2E 336/336(기존 328 + PR 2B 8, `strategy-rules-v2.spec.ts` 17건·`trading-settings.spec.ts` 10건 포함) 전수 통과.
- Orca 내장 브라우저(PC)와 390px 모바일 뷰포트에서 10종 선택·오류/포커스·도움말 키보드 탭·DEMO 허용/차단·가로 무넘침(`scrollWidth <= 390`)·콘솔 오류 0건을 실측했고, 임시 4314 서버 종료 및 포트 해제를 확인했다.
- 미검증: KIS 모의 실계좌 실시간 주문·장전 레벨 트리거 계약 연결(후속 단계 범위), 운영 4303/4304 서버 반영.
