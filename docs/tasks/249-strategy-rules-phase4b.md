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

## PR 4B-2 UI·17카드 도움말·매매설정 차단·E2E 연동

- 규칙 폼·에디터·카드(`src/pages/research-rule-form.ts`, `src/components/research/RuleConfigSection.tsx`, `src/components/research/StrategyCard.tsx`): `RULE_KINDS`를 15종(단일 11종 + 다종목 4종: `dual_momentum`, `faber_gtaa`, `krx_sector_rs`, `clenow_momentum`)으로 확장하고 4B-1 임시 편집기 차단(`isEditableKind`)을 제거했다. 15(`krx_sector_rs`, 4필드)·16(`clenow_momentum`, 6필드)의 3줄 가이드, `PORTFOLIO_CATALOG` 보수/기본/공격 프리셋, 정수·범위 검증(`focusName` 포함), `formatRuleSummary`, `portfolioWarmup` 최소 준비 봉 표시를 연결했다. `StrategyCard.tsx`는 코디네이터 승인을 받아 저장된 15·16 전략 카드의 `studio-terms`(파라미터·위험자산·안전자산)가 누락되지 않도록 최소 범위로 함께 반영했다.
- 저장 일봉 백테스트(`src/components/research/StoredBacktest.tsx`): 다종목 모드에서 선택 기간 `[from, to]`의 매핑 종목 달력 교집합 길이(`availableCommonBars`)와 `portfolioWarmup(rule) + 1`(`requiredBars`)을 함께 표시하고, `availableCommonBars < requiredBars`일 때 실행 전 **준비 봉 부족** 경고를 노출한다. 리밸런싱 판정이 완료(`rebalances.length > 0`)됐으나 적격 위험 자산이 없어 체결이 0건(`trades.length === 0`)이면 `준비 봉 충족 · 리밸런싱 판정 완료 (적격 위험 자산 없음으로 현금/안전자산 유지)` 안내로 준비 봉 부족 오류와 구분한다.
- 사용방법 도움말(`src/components/research/ResearchHelpPanel.tsx`): `전략·입력 항목 사전`을 17카드(단일 11종 + 다종목 4종 `13 ETF 듀얼 모멘텀`·`14 파버 GTAA`·`15 KRX 섹터 상대강도`·`16 클레노우 회귀 모멘텀` + 공통 오버레이 2종)로 확장하고 4탭 전략 수를 15종으로 정합화했다. 15번의 섹터 대용 가격·동일 시점 섹터/ETF 구성비/중복 섹터 합산/잔여 한도 미구현·`maxWeightPct` 선정 위험자산별 상한(`safeAsset` 미적용)과 16번의 종목별 `SMA(regimeSmaPeriod)` 대체·`252βR²` 점수·ATR 0/비유한 시 대체 비중 `1/K`의 위험예산 미보장·Wilder ATR 시작일 의존을 명시했다.
- 검증: `npm run typecheck`, `npm run build`, `npm test` 389/389 통과(`tests/portfolio-rules.test.ts` 맨 끝 4B-1 임시 차단 테스트 1개만 4B-2 정식 편집기 왕복·프리셋·포맷·검증 테스트로 교체, 백엔드 해시·산식 테스트 무변경), 격리 포트 4314 `npm run test:e2e` 357/357 통과(`tests/browser/portfolio-rules-v3.spec.ts` 4B-2 3건 + 1차 보완 2건 추가 및 `strategy-rules-v2.spec.ts` 카운트 3곳 정합, 종료 후 4314 포트 해제 확인). Orca 내장 브라우저(임시 4314 메모리 DB 서버)에서 `/strategies`·`/backtest`·`/settings/trading/strategy` 데스크톱(1440×1050)·모바일(390×844, `scrollWidth <= 390`)·키보드 탭 이동(`ArrowRight`, 17카드 확인)·콘솔 오류 0건을 실측하고 임시 4314 서버 종료 및 포트 해제를 확인했다. 실제 KIS 계좌·운영 저장 일봉 성과와 Graphify CLI 그래프 갱신은 미검증이다.
- PR #251 교차 감사 보완 (1차):
  - 1차 Major 1: `StoredBacktest.tsx`에서 다종목(`v3`) 실행 결과가 `rebalances.length > 0 && trades.length === 0`일 때 목표 비중(`hasRiskTarget`, `hasAnyPositiveTarget`)에 따라 ① 무신호(`적격 위험 자산 없음으로 현금/안전자산 유지`), ② 무신호+안전자산 1주 미만 예산 미체결(`적격 위험 자산 없음 · 안전자산 배정 예산이 수수료·슬리피지 포함 1주 시가 미만이어서 체결 0건`), ③ 위험자산 선정+1주 미만 예산 미체결(`적격 위험 자산이 선정되었으나 배정 예산이 수수료·슬리피지 포함 1주 시가 미만이어서 체결 0건`) 3분기로 정확히 구분하고 E2E 회귀를 추가했다.
  - 1차 Minor 1: `StoredBacktest.tsx`에서 선택 구간 `[from, to]` 내 바스켓 종목 간 거래일 달력 불일치를 사전 검사해 첫 불일치 종목 쌍과 날짜(`선택 기간 내 바스켓 종목의 거래일 달력이 일치하지 않습니다 (codeA / codeB · YYYYMMDD).`)를 실행 전 경고로 표시하고 실행 시 `POST /api/backtest/daily` 0건 + `role="alert"`로 클라이언트 차단하며 E2E 회귀를 추가했다.
