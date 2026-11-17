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

전달: [초안 PR #56](https://github.com/krdn/gon-stock03/pull/56), 제품 `ed00cca`. 사용자 화면 수용과 원격 CI·통합 전에는 #12 완료나 #13 선행 해제로 처리하지 않는다. 독립 작업 #17은 별도 main 기반 worktree에서 진행한다.

## 2026-11-16 통합 진행 승인

수용·통합 대기 설명 후 사용자 “작업 진행” 및 통합·후속 순차 진행 지시가 전달됐다. 지정 Gemini4Argon/high MERGE PASS와 결합 단위134·브라우저83·빌드 PASS로 기술 수용을 검증했다. 사용자 직접 육안 관찰은 주장하지 않는다. [결합 검증](../verification/2026-11-16-trading-alerts-integration.md). 원격 통합·CI 확인 후 완료 상태를 반영한다.

통합 완료: PR56 `d678e31`, PR57 `bf158cc`, 양쪽 main CI2 SUCCESS. #12·#17 completed/Done 확인. 기존 대기 문구는 통합 전 기록이며 현재는 [#13](13-orders.md)을 순차 진행한다.

## 2026-11-17 후속 화면 수정

사용자 /trade 정밀 분석·수정 요청. main `0ab9da1` 기반 `krdn/issue-12`. 미지원 종목의 묵시적 대체·최초 연결 전 예시 주문폼·한도/잔고 사전 안내 부재·저장소 오류·선택 상태 및 대비를 수정한다. 회귀 재현, 격리 브라우저, 빌드, 외부 리뷰로 확인한다. KIS 주문·취소 없음. 4303 원본 실행 경로는 `/home/gon/llm-projects/gon-stock03`; 검증 뒤 충돌을 확인해 로컬 화면에 적용한다.
