# 작업: #12 트레이딩

기준: [이슈 #12](https://github.com/krdn/gon-stock03/issues/12). 브랜치 `feat/12-trading`, 시작 main `23c7b519809681d2777e1ee1298e7604cc4ae1bc`.

- 상태: 구현·로컬 검증 완료, 사용자 수용·PR 통합 대기. 선행 #9·#10·#11 closed/completed 확인, main CI 성공.
- 범위: DEMO 지정가 입력·확인·중복 방지·시세 변경 재확인, 예약 제외 현금/매도 가능량, 종목코드를 유지한 `/paper` 이동.
- 완료 조건: 시세 변경·정지·연결 실패 시 접수 차단, 서버 잔고/한도 재검사, 접수/체결 구분, 브라우저 회귀·독립 리뷰·PR CI. 사용자 화면 수용은 별도 기록한다.
- 제외: 실제 KIS 업무 API·주문·취소·예약. 일반 웹 취소409 및 #25 장중 미관측 경계 유지.

## 먼저 읽을 자료

AGENTS·WORKFLOW·이슈 #12, `src/pages/Trading.tsx`의 Trade, `src/specs.ts`의 trade, `server/engine.ts`의 placeOrder, `tests/browser/trade.spec.ts`, `tests/engine.test.ts`.

## 현재 결과

기존 서버는 requestId 멱등성과 예약 제외 현금·보유량을 검사한다. 확인창에는 시세 변경 재확인과 최신 정지/연결 차단이 부족하다. 기존 경로를 유지하고 UI 경계만 보완한다. 응답 손실은 같은 탭에 요청을 보존하고 로컬 원장 대조 전 신규 요청을 막는다.

보존: `.local/` 원장·백업, `.codex/`, `graphify-out/`, 다른 worktree.

검증: [결과 기록](../verification/2026-11-16-trading.md). 단위/API128·최종 브라우저80·빌드 통과. 중앙 Claude Opus5.5/high 원 리뷰 P2 두 건, 수정분 리뷰 P2 한 건을 재현·수정했다. 마지막 수정은 직접 회귀80건으로 검증했다. 외부 최종 PASS나 사용자 수용으로 표시하지 않는다.

## 다음 행동

커밋·PR CI를 확인하고 사용자 화면 수용을 받는다. 사용자 수용 미확인 상태에서는 완료로 닫지 않는다.
