# 전략 스튜디오 일봉 규칙 PR 1A · PR 1B

기준 이슈 https://github.com/krdn/gon-stock03/issues/231 · Item #72.

- **PR 1A (`krdn/strategy-rules-v2-pr1a`, Draft PR #232, 기준 main `6baa969`)**: [20개 전략 설계와 PR 1B 계약](../plans/strategy-rules.md), `shared/backtest.ts`, `shared/strategy-rules.ts`, `tests/strategy-rules.test.ts`를 구현했다.
- **PR 1B (`krdn/strategy-rules-v2-pr1b`, 기준 PR 1A `62cba9a`)**: `/strategies`와 `/backtest` UI를 다중 전략 v2 계약에 연결했다(`src/pages/Research.tsx`, `src/pages/Strategies.css`, `src/pages/Backtest.css`, `tests/browser/strategy-rules-v2.spec.ts`).
  - 전략 스튜디오: `STRATEGY_CATALOG` 기반 규칙 선택(이동평균 교차·돈키안 돌파·RSI 단기 눌림목), 3줄 한글 안내, 환경별 지원 배지, `[보수적/기본/공격적]` 프리셋, 샹들리에 ATR 청산 오버레이, 환경별 미지원 사전 안내, `이 설정으로 백테스트` 초안 전달, 카드 규칙 요약 및 `검증 실험 연결` 배지.
  - 백테스트: v1·v2 혼합 실험 목록·불러오기·재현(`experimentListSchema`, `experimentSchema`), 기본 SMA(필터·오버레이 없음, 장기 100 이하) v1 해시·문구 보존, v2 strictObject 요청(최상위 `fast`/`slow` 제외), 전략 vs 단순 보유(`benchmark`) 비교, 거래 사유(`reason`) 열, `이 설정으로 전략 만들기`(`evidence` 연결).
  - 검증: 격리 포트 `4314`·메모리 DB에서 `typecheck`, `build`, 단위 테스트 345건, Playwright E2E 27개 spec(기존 26종 319건 + 신규 3건 = 322건), Orca 내장 브라우저 PC·모바일(390px)·키보드·오류 상태를 통과했다. 운영 서버(4303/4304)와 KIS 주문은 범위 밖이다.
