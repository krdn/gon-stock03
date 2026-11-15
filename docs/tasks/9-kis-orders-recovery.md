# 작업: #9 KIS 주문·복구

기준 이슈: https://github.com/krdn/gon-stock03/issues/9

- 상태: 차단. 안전한 독립 구현·로컬 검증·지정 리뷰 완료. 웹 정정·취소 범위 결정과 실제 최소 모의 접수·조회 승인/증거가 필요하다.
- 목표·완료 조건: 공통 주문 큐, 명시적 불명 복구와 감사 기록, 재시작·다음 거래일·경합 fixture 검증. 전체 완료에는 승인된 최소 실제 모의 접수·조회 증거가 필요하다.
- 허용된 작업·제외 범위: 조사·공통 서비스·fixture·검증·PR/인계. 실제 주문·정정·취소는 미승인. UI는 S15/#14 소유. 자동 재전송·실전 fallback·미지원 API 우회 금지.
- 선행: #6/#8 completed, PR #27/#31 main 포함, #9 Project Ready를 2026-11-15 확인.
- 이슈 / PR: #9 / 초안 PR 작성·원격 CI 진행 예정.
- 브랜치 / 기준 SHA: `feat/9-kis-orders-recovery` / `034f7e766d67b0ecfe3dab8477078939c255412e`.

## 먼저 읽을 자료

AGENTS·WORKFLOW, #9, [계획 C03·S15·검증 경계](../plans/interface-sessions-2026-11.md), `server/paper.ts`의 refresh/submit, `server/kis.ts`의 request/dailyOrders/submit, `server/store.ts`의 paperOrders/savePaper, `server/http.ts`의 KIS 경로, `shared/contracts.ts`, `shared/model.ts`, `tests/paper.test.ts`.

## 현재 결과

- 현재 공식 포털: 정정취소 `VTTC0013U`는 모의 지원. 선행 가능수량 `TTTC0084R`은 모의 미지원. 잔량을 가능수량으로 대신하거나 실전 TR을 호출하지 않는다.
- [공식 계약·대안](../research/kis-order-recovery-2026-11.md), [미승인 최소 실행안](../operations/kis-minimum-paper-run.md), [검증](../verification/2026-11-15-kis-orders-recovery.md).
- 조회/주문 공통 큐, 번호 없는 불명 inspect→confirm, 원장·감사 원자 저장, 미지원 취소 409와 미수 없는 가능수량 계약 보완.
- `npm test` 93/93·빌드 PASS, 브라우저67/67 PASS. 기준 main 앱43724416483·구성43724416509 SUCCESS, `ready`·`implementation-ready` PASS. 새 PR CI 대기.
- 지정 리뷰: Argon/high 전달 범위 PASS, P0/P1/P2 0. 요청/init 일치, 서버 모델·effort 독립 확인 한계. P3 문구 보완·0값 사전 거부 개선은 현 후보 검증으로 차단되어 유지.
- 미검증: 실제 주문/체결/취소/불명 복구, KIS 일봉·공식 달력·연속전략·V01. #7 공개 마스터3962 실조회와 구분한다.
- 보존: 미추적 `.codex/config.toml`, `docs/architecture/tech-stack-review.md`, STE 기준 파일·graphify 부재, #8 Fable 한도 오류, #21 초기 pacing CI 실패 원인 미해결.
- 소유권: t73 / `01a1df8d-f843-7de1-87e1-118df8eeb1bc`만 수정. 추가 에이전트·부모 재위임 없음.

## 다음 행동

초안 PR·CI·원격 인계를 마무리한 뒤 공식 모의 앱 수동 취소 대안의 범위 결정과 069500 1주·10만 원 상한·1회 모의 주문 실행 승인을 요청한다. 실제 접수·조회 증거 전 #9 completed/Done·후속 선행 해제 금지.

## 새 세션 시작 문구

> docs/STATE.md와 이 작업 파일, 필수 읽기 및 #9 관련 PR/CI만 확인해 다음 행동부터 이어가줘. 실제 주문 승인과 웹 취소 범위 결정을 추정하지 마.
