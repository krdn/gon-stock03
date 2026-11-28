# 5단계 가격 레짐과 아키텍처 제외

[기준 이슈 #252](https://github.com/krdn/gon-stock03/issues/252) · [입력·산식·제외 사유](../plans/strategy-rules.md#저장-다종목-가격-레짐-18-및-아키텍처-제외-0817)

## 완료 기록

- [PR 5-1 #253](https://github.com/krdn/gon-stock03/pull/253) main `9e40e16`에서 첫 위험자산의 저장 종가 SMA와 실현 연변동성으로 세 가지 위험 노출 상태를 판정하는 `price_regime`을 추가했다. 기존 종가 신호·다음 시가 체결과 실험 스냅샷을 재사용했다. 당시 편집기는 새 규칙 전달을 임시 차단했다.
- [PR 5-2 #254](https://github.com/krdn/gon-stock03/pull/254) main `f268790`에서 임시 가드를 정식 폼·프리셋·저장 실험 복원으로 교체하고 18카드 도움말과 08·17 제외 FAQ를 연결했다. 1차 감사 지적(Major 1·Minor 2) 보완은 [감사 기준 `5bdc8b1`](https://github.com/krdn/gon-stock03/commit/5bdc8b1efae13e6e32025d7a07bb482f8318f896)에 포함됐고, 이 트리는 `f268790`과 일치한다. 최종 검증은 단위 394/394, 격리 Playwright E2E 28개 spec 361/361이다.
- 목표 20종 중 18종(단일 11·다종목 5·오버레이 2)이 구현됐다. 08은 분봉 원장, 17은 시점별 공시 원장과 공개 시각이 없어 제외했다. 실계좌 수익은 미검증이며 보장하지 않는다. PR 5-3은 이 기준의 [인수인계](../STATE.md)와 [프로젝트 지도](../../.project-map/index.html)를 동기화한다.

## PR 5-2 인계 당시 검증 항목

- 기존 편집기 임시 가드를 갱신하고 16번째 규칙을 다종목 그룹에 연결한다. 4개 정수 필드와 리밸런싱 간격, 카탈로그 프리셋, 범위 오류 포커스, 요약과 준비 봉 표시를 검증한다.
- 도움말 18카드에 가격 대용의 한계를 설명하고 08·17 제외 사유를 FAQ에 표시한다.
- 5-1의 편집기 거부 테스트를 정상 폼·전달 초안 왕복 검증으로 교체한다. 격리 Playwright에서 프리셋과 입력 검증, W/W+1봉, 저장 실험 재연결, 매매설정 진입 차단 및 주문 요청 0건을 확인한다.

## 5-1 검증

격리 테스트에서 v1/v2/v3 해시 4쌍, 기존 로테이션, 레짐 3상태·경계값, 두 순서 비중 합계, 첫 체결일, 260봉 원장 pruning 후 재생, 편집기 차단을 확인했다. DEMO·KIS 실행 및 계약 초안·고정 차단 테스트의 가짜 전송기 호출은 0건이었다. Graphify CLI는 현재 실행 경로에 없어 그래프 갱신은 미실행이다.

타입 검사·빌드 및 단위 394/394 통과. 독립 리뷰 1회(요청 Claude Opus 5.5/high, 실제 반환 `claude-opus-5-5`)에서 확정 결함은 없었다. W가 SMA 기간보다 긴 입력의 최근 20봉 판정을 회귀에 추가했다. 5-2에서는 첫 위험자산이 판정 자산임을 입력 위치에 표시하고 API로 생성된 실험도 목록에서 불러와 편집기로 복원되는지 확인한다. 5-1에서는 기존 편집기 가드 때문에 이 실험을 UI로 복원할 수 없다.

## PR 5-2 구현 및 검증

PR 5-2는 `krdn/strategy-rules-phase5-pr1`(`8935578`) 위에서 `18 가격 레짐 (매크로 대용)`(`price_regime`)을 정식 16종 UI·18카드 도움말 사전·`08`/`17` 아키텍처 제외 FAQ·E2E로 연동한다.

- **UI·도움말**: `research-rule-form.ts`의 임시 가드(`isEditableKind`)를 제거하고 16종(단일 11·다종목 5)과 5개 정수 입력(`regimeTrendSmaPeriod`, `regimeVolLookback`, `regimeMaxAnnualVolPct`, `regimeCautionExposurePct`, `regimeRebalanceDays`)·프리셋·포커스 검증·요약 포맷을 연결했다. `RuleConfigSection`·`StoredBacktest` 입력 위치에 위험 자산 1이 레짐 판정 기준 자산임을 표시하고, `StrategyCard`에 판정 자산·추세 SMA·변동성 한도·경계 노출·리밸런싱·위험/안전자산을 노출한다. `ResearchHelpPanel`은 18카드(`18 가격 레짐 (매크로 대용)` 및 `[원안 대비 변형 범위]`)와 4탭 `08 갭·초반 거래량`·`17 공시 드리프트·희석 차단` 아키텍처 제외 FAQ를 포함한다.
- **1차 감사 전 검증**: `npm run typecheck`, `npm run build`, `npm test`(394/394) 및 격리 포트 4314 Playwright(360/360) 통과. 프리셋 준비 봉 부족 경고, 3상태 리밸런싱, 저장 실험 재현·편집기 복원, KIS 모의 시작·매매 설정 1~3단계 차단, 18카드·제외 FAQ·390px 모바일을 확인했다.
- **Orca 내장 브라우저 실측**: 격리 포트 4314 임시 메모리 DB 서버에서 `/strategies`·`/backtest`·`/settings/trading/strategy` 데스크톱·390px 모바일(`scrollWidth <= 390`)·키보드 `ArrowRight` 탭 이동·콘솔 오류 0건 및 스크린샷 확인 후 임시 4314 서버를 종료했다. 실제 KIS 모의 주문 전송과 외부 API 호출은 미실행(0건)이다.
- **1차 감사 보완(Major 1 · Minor 2)**: `StoredBacktest.tsx`의 `price_regime` 체결 0건 요약 문구를 경계 노출 0%·위험회피·위험 노출 배정 1주 시가 미만으로 정밀 구분하고(기존 4종 `적격 위험 자산 없음` 유지), 바스켓 수집 기록 `useMemo` 의존성 배열에 `ruleForm.kind`를 추가해 양방향 전환 시 `위험 자산 1 (레짐 판정)` 라벨이 즉시 갱신되도록 수정했다. `StrategyCard.tsx`와 `research-rule-form.ts` `formatRuleSummary`에서 변동성 관측 기간(봉)과 연변동성 한도(%) 단위를 분리 표기하고 단위·E2E 회귀 테스트(394/394, 361/361)를 통과했다.
