# Research.tsx 서브컴포넌트·훅 모듈 분리 · Item #90

기준 이슈 https://github.com/krdn/gon-stock03/issues/238 · 기준 커밋 `20f6c1e` (`origin/main`). 동작·DOM·CSS 순서·ARIA·한국어 문구 무변경 원칙으로 `src/pages/Research.tsx`(4,140줄)를 단방향 의존 구조의 역할별 모듈로 분리했다.

## 모듈 구성 및 의존 방향
- 순수 헬퍼·타입·스키마: `src/pages/research-rule-form.ts` (976줄, React 비의존)
- 도움말 패널·규칙 사전: `src/components/research/ResearchHelpPanel.tsx` (584줄, 4탭 WAI-ARIA + `RULE_FIELD_HELP`·`CHANDELIER_FIELD_HELP`)
- 규칙 선택·프리셋·입력·문맥 가이드: `src/components/research/RuleConfigSection.tsx` (781줄)
- 전략 스튜디오 뷰:
  - `src/components/research/StrategyCard.tsx` (313줄)
  - `src/components/research/StrategyEditor.tsx` (305줄)
  - `src/components/research/StrategiesView.tsx` (239줄)
- 백테스트 뷰:
  - `src/components/research/BacktestShared.tsx` (157줄, `CostFields`·`ResultSummary`·`Trades`·`useResultFocus`)
  - `src/components/research/DemoBacktest.tsx` (196줄)
  - `src/components/research/StoredBacktest.tsx` (629줄)
  - `src/components/research/BacktestView.tsx` (141줄)
- 진입점: `src/pages/Research.tsx` (8줄, `./Strategies.css` → `./Backtest.css` 로드 순서 유지 및 `Strategies`, `Backtest` 재내보내기)
- 의존 방향: `shared/*` → `research-rule-form.ts` → `ResearchHelpPanel.tsx` → `RuleConfigSection.tsx` → `StrategiesView` / `BacktestView` → `Research.tsx` (순환 참조 0건)

## 검증 결과 (격리 포트 4314 · 메모리 DB · `tests/**` 변경 0건)
- `npm run typecheck`: 통과 (오류 0건)
- `npm run build`: 통과 (`dist/assets/index-CZVZG_VD.css`, `dist/assets/index-CWPCxqlv.js`)
- `npm test`: 354/354 전수 통과
- `npm run test:e2e`: 336/336 전수 통과 (`strategy-rules-v2.spec.ts` 17건, `trading-settings.spec.ts` 10건 포함, `tests/**` 수정 0건)
- Orca 내장 브라우저 실측 (격리 포트 4314 임시 서버 기동 → 실측 → 종료·포트 해제 확인):
  - `/strategies`·`/backtest` 데스크톱(1440×900) 및 모바일 390px(`scrollWidth = 390 <= 390`) 정상 렌더링
  - 4탭 도움말 키보드 탐색(`ArrowRight`/`End`/`Home`), 닫기 포커스 복귀(`사용방법 도움말` 버튼), 10종 규칙 선택, 스튜디오 → 백테스트 초안 전달 배너(`bollinger_squeeze`), 콘솔 오류 0건 확인
- 미검증: KIS 모의 실계좌 실시간 주문, 운영 4303/4304 서버 반영 (순수 구조 분리 범위 밖)
