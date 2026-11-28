# 다종목 포트폴리오 4A-1 · Item #108

[이슈 #246](https://github.com/krdn/gon-stock03/issues/246) · [설계와 정산 규약](../plans/strategy-rules.md). 기준 main은 af351f9이다.

## PR 4A-2 연결 계약

- POST /api/backtest/daily에 runs 배열(각 code, runId), source=kis-rest, from/to(YYYYMMDD), adjustment, capital, feeBps, slippageBps, rule을 보낸다. runs는 assets 및 선택한 safeAsset과 정확히 일치해야 한다. assets 순서는 동률 순위에 사용한다.
- shared/portfolio-rules.ts의 PORTFOLIO_CATALOG에서 제목, environments 및 presets의 conservative/basic/aggressive 기간 설정을 읽는다. kind·assets·safeAsset과 합쳐 규칙을 구성한다. portfolioWarmup(rule)+1이 최소 봉 수다.
- 응답 experiment.snapshot에는 engineVersion, input, legs[].{code,collection,bars}가 있다. result.rebalances의 signalDate/date는 판정/체결일이고 targets는 규칙 순서(code,weight)다. 거래 내역은 trades[].code, 비교 지표는 benchmark이다. 목록의 bars는 공통 기간 길이다. replay는 기존 POST /api/backtest/replay를 사용한다.
- 저장 전략은 code=assets[0], overlay 생략, environment=kis-paper로 보낸다. 모든 구성원이 거래 가능한 ST/EF여야 한다. DEMO와 KIS 모의 기동·초안·고정에서 portfolioOnly 사유를 표시한다. 전용 UI는 후속 PR에서 연결한다.

## 검증

격리 데이터 260봉, 타입 검사·빌드, 단위 테스트와 전략 브라우저 회귀를 사용한다. 실제 계좌·운영 저장 일봉 성과는 미측정이다. 최종 커밋·CI는 이 문서를 포함한 Draft PR의 head 기록을 따른다.

독립 리뷰는 claude-opus-5-5를 high로 요청했고 반환 모델도 일치했다. 손상된 DEMO 활성 레코드는 해당 전략만 정지한다. 달력 오류에는 비교 종목 쌍과 날짜를 넣고 정렬 locale을 고정했다. 입력 필드 오류 경로와 소수 시가의 원 단위 수수료 보정을 확인했다. 동일 신호에서도 비용 포함 목표가 998주에서 996주로 줄어드는 사례는 확정 설계대로 유지하고 회귀로 고정했다. 잔여 현금이 부족하면 assets 순서 뒤쪽 매수가 줄어들 수 있다.

v3 데이터를 생성한 뒤 이전 프로그램으로 되돌릴 경우 v3를 읽고 수집 참조를 보호할 수 있는 버전이 필요하다. 롤백 시에는 변경 전 백업의 복사본을 사용한다. Graphify CLI는 PATH에 없어 그래프 갱신은 미검증이다.

최종 검증 기준은 [원격 작업 브랜치 HEAD](https://github.com/krdn/gon-stock03/commits/krdn/strategy-rules-phase4a-pr1)이다. npm test 375건 및 typecheck·build 통과. PR 본문에 로컬 HEAD와 동일한 원격 SHA, 브라우저 회귀 및 CI 결과를 기록한다.

## PR 4A-2 UI·도움말·매매설정 차단·E2E 연동

- 규칙 폼·에디터·카드(`src/pages/research-rule-form.ts`, `src/components/research/RuleConfigSection.tsx`, `StrategyEditor.tsx`, `StrategyCard.tsx`): `shared/portfolio-rules.ts`의 `PORTFOLIO_CATALOG`(`dual_momentum`, `faber_gtaa`), `portfolioRuleSchema`, `portfolioWarmup`, `portfolioCodes`, `isPortfolioRule`, `portfolioOnly`를 정식 연결했다. 위험 자산 2-6개 순서 유지·중복 차단, 안전자산 선택(`null`=현금), 대표 종목 `assets[0]` 자동 동기화, 공통 오버레이 비활성화 및 `overlay` 생략, 환경 배지 3종(`저장 일봉: 다종목 자산배분 (v3)`, `DEMO: 미지원`, `KIS 모의: 시작 불가 (저장 일봉 백테스트 전용)`), DEMO 저장·실행 차단(POST 0건), KIS 모의 정지 저장 허용 및 `전략 시작` 버튼 비활성화, 카드 `이 설정으로 백테스트` 왕복 링크를 구현했다.
- 저장 일봉 다종목 백테스트(`StoredBacktest.tsx`, `BacktestShared.tsx`, `BacktestView.tsx`, `DemoBacktest.tsx`): `experimentListSchema`·`experimentSchema`로 v1/v2/v3 목록·불러오기·재현(`POST /api/backtest/replay`)을 통합했다. 바스켓 종목별 적격 `kis-rest` 수집 기록 자동 매핑(`to` 내림차순 → `startedAt` 내림차순) + 수동 변경 드롭다운, `수집 필요` 차단(POST 0건), 공통 가능 기간 `[max(from), min(to, captureDate - 1)]` 안내 및 범위 밖·역순 날짜 클라이언트 차단(POST 0건 + `role="alert"` + 포커스 이동), `daily-portfolio-next-open-v3` 결과(위험 자산 동일 비중 벤치마크 비교, 리밸런싱 내역 표, 거래 내역 `종목 코드` 열, `이 설정으로 전략 만들기` 왕복), 출처 전환 시 상태 보존과 뒤로→앞으로 stale 결과 미재결합을 구현했다.
- 매매 설정(`src/pages/TradingSettings.tsx`): 다종목 전략의 1·2·3단계(직접 URL 진입 포함) 진행·저장·고정을 `portfolioOnly` 사유와 실제 규칙 요약(`formatRuleSummary`, `5/20 교차` 오표시 없음)으로 전면 차단(POST 0건)하고 전략 스튜디오 초안 전달 링크를 유지했다.
- 사용방법 도움말(`ResearchHelpPanel.tsx`): `전략·입력 항목 사전`을 15카드(단일 11종 + 다종목 2종 `13 ETF 듀얼 모멘텀`·`14 파버 GTAA` + 공통 오버레이 2종)로 확장하고 프리셋·경계·동률 우선·달력 100% 일치·생존 편향·정수 잔여 현금·분배금/세금 미포함을 4탭 및 문맥 가이드에 반영했다.
- 검증: `npm run typecheck`, `npm run build`, `npm test` 375/375 통과, 격리 포트 4314 `npm run test:e2e` 350/350 통과(`tests/browser/portfolio-rules-v3.spec.ts` 9건 포함, 전체 28개 spec). Orca 내장 브라우저에서 `/strategies`·`/backtest`·`/settings/trading/strategy` 데스크톱(1440×1050)·모바일(390×844, `scrollWidth <= 390`)·키보드 탭 이동·콘솔 오류 0건을 실측하고 임시 4314 서버 종료 및 포트 해제를 확인했다. 실제 KIS 계좌·운영 저장 일봉 성과와 Graphify CLI 그래프 갱신은 미검증이다.
- PR #248 교차 감사 보완 (1차·2차):
  - 1차 Major 1: `verify()`가 엔진 버전별 엄격 결과 스키마(`daily-portfolio-next-open-v3`→`portfolioResultSchema`, `daily-rules-next-open-v2`→`ruleReplayResultSchema`, `daily-ma-next-open-v1`→`backtestResultSchema`)로 재현 응답을 검증해 `rebalances`·`benchmark`·`trades[].code` 등 필수 필드 누락 시 `matches: true`라도 `role="alert"`로 거부한다.
  - 1차 Major 2: 저장 일봉의 수동 `from`/`to`·`dateEdited`·`portfolioPolicy`·`portfolioRunOverrides`를 `BacktestView`로 승격해 `DEMO ↔ 저장 일봉` 출처 전환 후에도 바스켓이 같으면 수정값을 유지하고 적격성을 재검사한다.
  - 1차 Minor 1: `StrategyCard`의 `이 설정으로 백테스트` 링크에 `?source=stored&strategyId=...`를 포함하고 `location.state` 없는 직접 진입 시 `state.strategies`에서 1회 복원 가드로 초안을 복원한다.
  - 1차 Track A 고지: 동일 비중 유지 리밸런싱 시 슬리피지·수수료 포함 목표 수량 재산정으로 소폭 축소 매도가 발생할 수 있음과 매수 현금 부족 시 `assets` 뒤쪽 종목 체결 수량 축소 가능성을 도움말 사전·문맥 가이드·결과 탭에 명시했다.
  - 2차 Major 1: `StoredBacktestDraft`에 단일 종목 선택 `singleRunId`를 날짜·정책과 함께 보관해 `DEMO → 저장 일봉` 복귀 시 적격 `singleRunId`를 복원하고, 대상 `runId`가 소멸하거나 달라지면 `from`/`to`를 새 기록의 기본 범위로 초기화(`dateEdited: false`)해 타 종목 날짜 이식을 이중 차단한다.
  - 2차 Minor 1: `/api/state` 로드 완료 후 미등록/삭제된 `strategyId` 쿼리로 진입하면 `role="alert"` 경고를 표시하고 `StoredBacktest`·`DemoBacktest` 실행을 POST 0건으로 차단하며, 사용자가 규칙·출처를 명시적으로 다시 선택하거나 초기화할 때만 차단과 stale `strategyId` 쿼리를 해제한다.
