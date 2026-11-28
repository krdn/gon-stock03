# 5단계 가격 레짐과 아키텍처 제외

[기준 이슈 #252](https://github.com/krdn/gon-stock03/issues/252) · [입력·산식·제외 사유](../plans/strategy-rules.md#저장-다종목-가격-레짐-18-및-아키텍처-제외-0817)

PR 5-1은 main `9c79554`에서 저장 다종목 일봉 v3에 `price_regime`을 추가한다. 첫 위험자산의 종가만으로 판정하며 기존 종가 신호·다음 시가 체결과 실험 스냅샷을 사용한다. 기존 편집기는 새 규칙 전달을 차단한다.

## PR 5-2 인계

- 기존 편집기 임시 가드를 갱신하고 16번째 규칙을 다종목 그룹에 연결한다. 4개 정수 필드와 리밸런싱 간격, 카탈로그 프리셋, 범위 오류 포커스, 요약과 준비 봉 표시를 검증한다.
- 도움말 18카드에 가격 대용의 한계를 설명하고 08·17 제외 사유를 FAQ에 표시한다.
- 5-1의 편집기 거부 테스트를 정상 폼·전달 초안 왕복 검증으로 교체한다. 격리 Playwright에서 프리셋과 입력 검증, W/W+1봉, 저장 실험 재연결, 매매설정 진입 차단 및 주문 요청 0건을 확인한다.

## 5-1 검증

격리 테스트에서 v1/v2/v3 해시 4쌍, 기존 로테이션, 레짐 3상태·경계값, 두 순서 비중 합계, 첫 체결일, 260봉 원장 pruning 후 재생, 편집기 차단을 확인했다. DEMO·KIS 실행 및 계약 초안·고정 차단 테스트의 가짜 전송기 호출은 0건이었다. Graphify CLI는 현재 실행 경로에 없어 그래프 갱신은 미실행이다.

타입 검사·빌드 및 단위 394/394 통과. 독립 리뷰 1회(요청 Claude Opus 5.5/high, 실제 반환 `claude-opus-5-5`)에서 확정 결함은 없었다. W가 SMA 기간보다 긴 입력의 최근 20봉 판정을 회귀에 추가했다. 5-2에서는 첫 위험자산이 판정 자산임을 입력 위치에 표시하고 API로 생성된 실험도 목록에서 불러와 편집기로 복원되는지 확인한다. 5-1에서는 기존 편집기 가드 때문에 이 실험을 UI로 복원할 수 없다.

## PR 5-2 구현 및 검증

PR 5-2는 `krdn/strategy-rules-phase5-pr1`(`8935578`) 위에서 `18 가격 레짐 (매크로 대용)`(`price_regime`)을 정식 16종 UI·18카드 도움말 사전·`08`/`17` 아키텍처 제외 FAQ·E2E로 연동한다.

- **UI·도움말**: `research-rule-form.ts`의 임시 가드(`isEditableKind`)를 제거하고 16종(단일 11·다종목 5)과 5개 정수 입력(`regimeTrendSmaPeriod`, `regimeVolLookback`, `regimeMaxAnnualVolPct`, `regimeCautionExposurePct`, `regimeRebalanceDays`)·프리셋·포커스 검증·요약 포맷을 연결했다. `RuleConfigSection`·`StoredBacktest` 입력 위치에 위험 자산 1이 레짐 판정 기준 자산임을 표시하고, `StrategyCard`에 판정 자산·추세 SMA·변동성 한도·경계 노출·리밸런싱·위험/안전자산을 노출한다. `ResearchHelpPanel`은 18카드(`18 가격 레짐 (매크로 대용)` 및 `[원안 대비 변형 범위]`)와 4탭 `08 갭·초반 거래량`·`17 공시 드리프트·희석 차단` 아키텍처 제외 FAQ를 포함한다.
- **검증**: `npm run typecheck`, `npm run build`, `npm test`(394/394 통과, 5-1 임시 편집기 차단 2줄을 5-2 정식 16종 편집기 왕복·프리셋·포맷·검증 `focusName`으로 교체), 격리 포트 4314 `npm run test:e2e`(360/360 통과: 43거래일 원장 프리셋 준비 봉 부족 경고·커스텀 3상태 리밸런싱·재현 일치·API 저장 실험 불러오기→전략 스튜디오 편집기 복원·KIS 모의 정지 저장 및 시작 비활성화·`TradingSettings` 1-3단계 `portfolioOnly` 차단·18카드/ArrowRight/`08`·`17` FAQ·390px 모바일) 통과.
- **Orca 내장 브라우저 실측**: 격리 포트 4314 임시 메모리 DB 서버에서 `/strategies`·`/backtest`·`/settings/trading/strategy` 데스크톱·390px 모바일(`scrollWidth <= 390`)·키보드 `ArrowRight` 탭 이동·콘솔 오류 0건 및 스크린샷 확인 후 임시 4314 서버를 종료했다. 실제 KIS 모의 주문 전송과 외부 API 호출은 미실행(0건)이다.
