# 전략 스튜디오 일봉 규칙 PR 1A · PR 1B

기준 이슈 https://github.com/krdn/gon-stock03/issues/231 · Item #72.

- **PR 1A (`krdn/strategy-rules-v2-pr1a`, Draft PR #232, 기준 main `6baa969`)**: [20개 전략 설계와 PR 1B 계약](../plans/strategy-rules.md), `shared/backtest.ts`, `shared/strategy-rules.ts`, `tests/strategy-rules.test.ts`를 구현했다.
- **PR 1B (`krdn/strategy-rules-v2-pr1b`, 기준 PR 1A `62cba9a`)**: `/strategies`와 `/backtest` UI를 다중 전략 v2 계약에 연결했다(`src/pages/Research.tsx`, `src/pages/Strategies.css`, `src/pages/Backtest.css`, `tests/browser/strategy-rules-v2.spec.ts`).
  - 전략 스튜디오: `STRATEGY_CATALOG` 기반 규칙 선택(이동평균 교차·돈키안 돌파·RSI 단기 눌림목), 3줄 한글 안내, 환경별 지원 배지, `[보수적/기본/공격적]` 프리셋, 샹들리에 ATR 청산 오버레이, 환경별 미지원 사전 안내, `이 설정으로 백테스트` 초안 전달, 카드 규칙 요약 및 `검증 실험 연결` 배지.
  - 백테스트: v1·v2 혼합 실험 목록·불러오기·재현(`experimentListSchema`, `experimentSchema`), 기본 SMA(필터·오버레이 없음, 장기 100 이하) v1 해시·문구 보존, v2 strictObject 요청(최상위 `fast`/`slow` 제외), 전략 vs 단순 보유(`benchmark`) 비교, 거래 사유(`reason`) 열, `이 설정으로 전략 만들기`(`evidence` 연결).
  - 검증: 격리 포트 `4314`·메모리 DB에서 `typecheck`, `build`, 단위 테스트 345건, Playwright E2E 27개 spec(기존 26종 319건 + 신규 7건 = 326건), Orca 내장 브라우저 PC·모바일(390px)·키보드·오류 상태를 통과했다. 운영 서버(4303/4304)와 KIS 주문은 범위 밖이다.
  - 교차 감사 보완(PR #233): 영숫자 일봉 코드(`masterCodeSchema`) 왕복 보존, 환경 전환(`DEMO`↔`KIS 모의`) 시 편집값·`evidence` 해제 보존, 음수·불완전 숫자(`validity.badInput`)·범위 밖 필터/오버레이 및 저장 일봉 날짜(`run.from`-`run.to`) 범위 밖 차단(`role="alert"`), KIS 미지원 규칙·기본 SMA `slow=101-120` 정지 저장 허용 및 시작 버튼 비활성화, 초기 `/api/state` 리마운트 경합 방지를 반영했다.
- **사용방법 도움말·문맥 가이드 (Item #79, `krdn/strategy-help-guide`)**: `/strategies`와 `/backtest` 상단에 4탭 WAI-ARIA 도움말 패널(`처음부터 따라하기`·`전략·입력 항목 사전`·`백테스트 결과·비용`·`환경별 차이·FAQ`, `/data#inventory-daily` 링크, 화살표/Home/End 키보드 탐색, 닫기 시 토글 포커스 복귀)과 `RuleConfigSection` 문맥별 `입력 항목 설명 보기` 접이식 가이드를 추가했다(`src/pages/Research.tsx`, `src/pages/Strategies.css`, `src/pages/Backtest.css`, `tests/browser/strategy-rules-v2.spec.ts`).
  - 검증: 격리 포트 `4314`·메모리 DB에서 `typecheck`, `build`, 단위 테스트 345/345, Playwright E2E 328/328(기존 326 + 신규 2), Orca 내장 브라우저 `/strategies`·`/backtest` 데스크톱·모바일(390px)·키보드·콘솔 오류 0건을 확인했다. 운영 4303/4304와 KIS 주문은 범위 밖이다.
  - 교차 감사 보완(PR #234): 4개 `tabpanel` 고정 ID 상시 마운트·비활성 `hidden` 처리로 끊긴 `aria-controls` 해소, KIS 저장 일봉 전용 전략 연결·재현 검증(SHA256 입력 스냅샷 해시 대조 vs 엔진 재실행 결과 동등성 비교) 구분, v2 전용 단순 보유 비교·출처별 기준가(저장 일봉 첫 봉 시가 / DEMO 첫 합성 봉 종가) 명시, 돈키안 `>=`/`<=`·거래량 허용 범위/초과 기준 분리, RSI 수익 미보장·샹들리에 종가 판정/다음 봉 체결 가정·기본 프리셋 초기값·기본 SMA `101-120` 정지 저장/시작 차단 안내를 반영했다.
