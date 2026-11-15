# 작업: #9 KIS 주문·복구

기준 이슈: https://github.com/krdn/gon-stock03/issues/9

- 상태: 조건부 승인 후 실행 준비. #9 OPEN/Blocked 유지. 2026-11-16 수동 취소 대안과 최소 모의 주문 1회 승인을 받았으며 실행 전 조건·별도 수동 시작·실제 접수/조회 증거가 남았다.
- 목표·완료 조건: 공통 주문 큐, 명시적 불명 복구와 감사 기록, 재시작·다음 거래일·경합 fixture 검증. 전체 완료에는 승인된 최소 실제 모의 접수·조회 증거가 필요하다.
- 허용된 작업·제외 범위: 현재는 승인 기록·실행 준비 점검·필요한 fixture 검증·PR/인계. 실제 주문은 실행안의 조건부 1회만 승인됐지만 지금 실행하거나 예약하지 않는다. 실제 웹 정정·취소·매도·전략은 승인하지 않았다. UI는 S15/#14 소유. 자동 재전송·실전 fallback·미지원 API 우회 금지.
- 선행: #6/#8 completed, PR #27/#31 main 포함, #9 Project Ready를 2026-11-15 확인.
- 이슈 / PR: [#9](https://github.com/krdn/gon-stock03/issues/9) OPEN/Blocked / [PR #47](https://github.com/krdn/gon-stock03/pull/47) MERGED `b9a12325ec1fcb683bced5911709d09b6814ffe4`.
- 제품 SHA: `c2dd987870203f29391ef721e473115f1f12ace6`. 최종 기록 SHA·원격 CI·handoff 결과는 #9 인계 댓글을 확인한다.
- 준비 브랜치 / 기준 SHA: `docs/9-paper-approval-preflight` / `3f3bee605100287490704f825fca8d95ac05e2cc`. 폴더 `/home/gon/llm-projects/gon-stock03-worktrees/9-paper-preflight`.

## 먼저 읽을 자료

AGENTS·WORKFLOW, #9 최신 승인/인계 댓글, [조건부 승인 실행안](../operations/kis-minimum-paper-run.md), [Infisical 지침](../INFISICAL.md). 실행 준비에 필요한 경우만 `server/paper.ts`의 refresh/submit, `server/kis.ts`의 request/dailyOrders/submit, `server/store.ts`의 paperOrders/savePaper, `server/http.ts`의 KIS 경로와 `tests/paper.test.ts`를 확인한다.

## 구현 전달 당시 결과 (통합 전)

- 현재 공식 포털: 정정취소 `VTTC0013U`는 모의 지원. 선행 가능수량 `TTTC0084R`은 모의 미지원. 잔량을 가능수량으로 대신하거나 실전 TR을 호출하지 않는다.
- [공식 계약·대안](../research/kis-order-recovery-2026-11.md), [미승인 최소 실행안](../operations/kis-minimum-paper-run.md), [검증](../verification/2026-11-15-kis-orders-recovery.md).
- 조회/주문 공통 큐, 번호 없는 불명 inspect→confirm, 원장·감사 원자 저장, 미지원 취소 409와 미수 없는 가능수량 계약 보완.
- `npm test` 93/93·빌드 PASS, 브라우저67/67 PASS. 기준 main 앱43724416483·구성43724416509 SUCCESS, `ready`·`implementation-ready` PASS. 초안 PR47의 원격 CI는 진행 중이며 최종 댓글에서 확인한다.
- 지정 리뷰: Argon/high 전달 범위 PASS, P0/P1/P2 0. 요청/init 일치, 서버 모델·effort 독립 확인 한계. P3 문구 보완·0값 사전 거부 개선은 현 후보 검증으로 차단되어 유지.
- 미검증: 실제 주문/체결/취소/불명 복구, KIS 일봉·공식 달력·연속전략·V01. #7 공개 마스터3962 실조회와 구분한다.
- 보존: 미추적 `.codex/config.toml`, `docs/architecture/tech-stack-review.md`, STE 기준 파일·graphify 부재, #8 Fable 한도 오류, #21 초기 pacing CI 실패 원인 미해결.
- 당시 구현 소유권: t73 / `01a1df8d-f843-7de1-87e1-118df8eeb1bc`. 후속 통합은 #50 독립 세션이 격리 clone에서 수행했다. 추가 에이전트·부모 재위임 없음.

## 다음 행동

[#50 통합](50-branch-integration.md)에서 PR47·49 결합 단위/API99·빌드·브라우저67·Argon MERGE PASS를 확인해 병합했다. 최종 main `3f3bee6` 앱43736920136·구성43736920132 SUCCESS를 2026-11-16 재확인했다. 열린 PR·독립 결함은 없고 기능10개는 Blocked다.

이번 인계 준비는 문서3개만 변경했다. `git diff --check`와 상대 링크14개 검사는 PASS. STE strict 검사는 기존 `docs/conventions/ste100-writing.md` 부재로 실패했으며 통과로 표시하지 않는다. 제품/테스트 변경과 실제 KIS 호출은 없다.

새 Herdr 세션은 이 준비 브랜치만 소유한다. 원본 폴더와 #48 작업 폴더·`.codex/`는 보존한다. 실제 탭·새 session ID·cwd 확인 전에는 준비 응답만 하고, 확인 후 실행 준비 점검을 시작한다. 추가 에이전트·이전 부모 재위임은 하지 않는다.

승인 범위를 다시 묻지 말고 남은 실행 조건을 구분한다. 단일 서버·원장/백업 경로·중복 전송 방지·정지와 조회 절차를 점검하고, 필요한 보완만 수행한다. 현재는 비밀값 출력·실제 KIS 업무 호출·예약·상주 대기 없이 준비한다. 변경 검증이 필요하면 Fable 5.2 또는 Gemini 4 Argon을 사용하고 요청/init와 실제 반환·확인 한계를 기록한다. 준비 결과와 필요한 사용자 계좌 확인을 #9에 남기고 별도 수동 시작을 기다린다. 실제 접수·조회 증거 전 #9 completed/Done·후속 선행 해제 금지.

## 새 세션 시작 문구

> docs/STATE.md와 #9 작업 파일·최신 승인 댓글·조건부 실행안을 읽고 실행 준비를 이어가줘. 사용자 승인은 기록된 범위로 유효하다. 지금 실행/예약하지 말고, 실행 전 조건과 별도 수동 시작을 확인해. 필요한 검증은 Fable 5.2 또는 Gemini 4 Argon으로 진행해.
