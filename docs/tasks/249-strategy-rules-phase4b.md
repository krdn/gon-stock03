# 다종목 로테이션 4B-1 · Item #117

[이슈 #249](https://github.com/krdn/gon-stock03/issues/249) · [입력 범위·프리셋·산식](../plans/strategy-rules.md#저장-다종목-로테이션-1516). 기준 main af0a65e. opt1 · UNANIMOUS_2.

## PR 4B-2 UI 계약

- 기존 POST /api/backtest/daily v3 입력을 사용한다. runs의 code/runId는 위험자산 및 선택 안전자산 집합과 일치해야 하며 위험자산 입력 순서를 보존한다. PORTFOLIO_CATALOG의 presets를 assets, safeAsset, kind와 합쳐 strict 규칙을 구성한다.
- krx_sector_rs 필드는 rsLookbackDays, topK, maxWeightPct, rebalanceDays다. clenow_momentum 필드는 regressionDays, atrPeriod, regimeSmaPeriod, topK, riskPerAssetBps, rebalanceDays다. 모든 수치는 정수다.
- 공통 거래일이 portfolioWarmup(rule)+1개부터 실행 가능하다. 최초 체결까지 15 보수/기본/공격은 62/22/12봉, 16은 201/101/61봉이다. 43거래일이면 15 기본·공격과 16 커스텀(회귀 20, ATR 10, SMA 20)의 최초 체결이 가능하다. 16 프리셋은 모두 자료 부족을 표시한다.
- 결과의 rebalances[].signalDate는 확정 종가일, date는 다음 시가일이다. targets, reason과 거래 내역을 표시하고 기존 replay 계약을 사용한다. 참조 원장은 prune에서 보호한다.
- 저장 다종목 일봉만 지원한다. DEMO·KIS 실시간 및 계약 초안·고정은 portfolioOnly로 차단한다. 4B-1에서는 기존 편집기가 신규 규칙을 열지 못하게 막는다. 4B-2에서 선택지·폼·저장 실험 복원·17카드 도움말·브라우저 회귀를 연결한다. 도움말에는 섹터 대용 가격과 자산별 상한, 종목별 레짐과 ATR 대체 비중의 한계를 표시한다.

## 검증 기록

기준 커밋의 격리 복사본에서 고정한 v1·v2·v3 듀얼·GTAA 실험 4개의 스냅샷 SHA-256과 결과 SHA-256을 회귀 테스트로 대조했다. 신규 두 규칙은 260봉 원장 보존·재생, 신호/체결 경계, 가짜 KIS 전송 0회를 검사한다. Wilder ATR은 스냅샷의 첫 봉부터 평활하므로 시작일이 달라지면 같은 신호일의 비중도 달라질 수 있다.

외부 리뷰는 claude-opus-5-5/high로 1회 요청했고 반환 모델이 일치했다. 원판정 FAIL의 High(엔진 OHLC 검사)는 Item #117의 명시적 승인 범위와 일치해 유지했다. 기존 저장 실험 생성도 loadVerifiedBars에서 동일한 무효 OHLC를 거부한다. Medium(기존 포트폴리오 초안 overlay)은 호출부의 기존 제외 조건을 복원하고 테스트했다. Graphify CLI는 PATH에 없어 미실행했다.
