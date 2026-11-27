# #240 저장 일봉 돌파와 변동성 사이징

[이슈 #240](https://github.com/krdn/gon-stock03/issues/240) · [PR 3A-2 입력 계약](../plans/strategy-rules.md#pr-3a-입력-계약)

Item #93의 PR 3A-1은 기준 6979809에서 스키마·카탈로그·일봉 체결과 수량 계산을 추가한다. PR 3A-2에서 폼, 상세 도움말과 브라우저 시나리오를 연결한다. 기존 폼은 신규 입력이 있는 초안의 실행을 차단한다. 3A-2에서 지원 필드를 연결한 후 호환 가드를 제거한다.

기준 코드에서 먼저 산출한 v1·기존 v2 10종·샹들리에 실험 ID/결과 결합 SHA-256은 `df416d735fd533651079a02a844b7b93be85d5772a245dd0d883bcee3a62df2a`다. 격리 SQLite 재생을 포함한 단위 361건이 통과했다. implementation-ready 통과, Graphify CLI 부재. 초기 미추적 pnpm-lock.yaml은 보존했다.

독립 리뷰 실제 반환 모델은 `claude-opus-5-5`(요청 high)이며 확정 코어 결함은 없었다. 기존 규칙에 패리티가 붙은 초안의 필드 보존을 보완했다. 저장·재생 호출은 동일 일봉 시가를 사용하고 UI 선택 목록은 RULE_KINDS로 제한됨을 확인했다.

## PR 3A-2 (UI·도움말·매매설정 연동)

- `src/pages/research-rule-form.ts`: 임시 `unsupportedDailyInput` 가드를 제거하고 11번째 규칙 `volatility_breakout`(5필드)과 `volatilityParity` 오버레이(4필드)를 `RULE_KINDS`·`RULE_GROUPS`·프리셋·검증·직렬화(꺼진 오버레이 키 생략)·요약에 연결했다. `isLegacySma`, `isDemoRuleSupported`, `kisRealtimeBlockReason`, `isKisRealtimeFormSupported`, `isKisBasicSmaSlowExceeded`에 `volatilityParity`와 `volatility_breakout`을 반영했다.
- `src/components/research/*`, `src/pages/TradingSettings.tsx`: `RuleConfigSection` 5필드+3필드 입력·동적 DEMO 경고 배지·문맥 가이드를 추가했고, `ResearchHelpPanel` 사전을 13카드(11종+오버레이 2종)와 당일 목표가 체결·변동성 패리티 설명으로 갱신했다. `StrategyCard` 태그·KIS 시작 차단과 `TradingSettings` 1~3단계 차단·실제 요약·스튜디오 초안 전달을 연동했다.
- 검증(격리 포트 4314 · `:memory:` DB): `npm run typecheck`, `npm run build`, `npm test`(361/361), `npm run test:e2e`(340/340, 기존 336 + 신규 4) 통과. Orca 내장 브라우저에서 `/strategies`·`/backtest` 데스크톱·390px 모바일(`scrollWidth 390`, 가로 넘침 없음)·도움말 13카드·키보드 포커스·오류 상태·콘솔 오류 0건 실측 후 임시 4314 서버 종료 확인.
- 미검증: KIS 모의 장중 실시간 평가·주문 전송(미지원 차단 유지), 운영 4303/4304 서버 반영.
