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
- [공식 계약·대안](../research/kis-order-recovery-2026-11.md), [조건부 최소 실행안](../operations/kis-minimum-paper-run.md), [검증](../verification/2026-11-15-kis-orders-recovery.md).
- 조회/주문 공통 큐, 번호 없는 불명 inspect→confirm, 원장·감사 원자 저장, 미지원 취소 409와 미수 없는 가능수량 계약 보완.
- `npm test` 93/93·빌드 PASS, 브라우저67/67 PASS. 기준 main 앱43724416483·구성43724416509 SUCCESS, `ready`·`implementation-ready` PASS. 초안 PR47의 원격 CI는 진행 중이며 최종 댓글에서 확인한다.
- 지정 리뷰: Argon/high 전달 범위 PASS, P0/P1/P2 0. 요청/init 일치, 서버 모델·effort 독립 확인 한계. P3 문구 보완·0값 사전 거부 개선은 현 후보 검증으로 차단되어 유지.
- 미검증: 실제 주문/체결/취소/불명 복구, KIS 일봉·공식 달력·연속전략·V01. #7 공개 마스터3962 실조회와 구분한다.
- 보존: 미추적 `.codex/config.toml`, `docs/architecture/tech-stack-review.md`, STE 기준 파일·graphify 부재, #8 Fable 한도 오류, #21 초기 pacing CI 실패 원인 미해결.
- 당시 구현 소유권: t73 / `01a1df8d-f843-7de1-87e1-118df8eeb1bc`. 후속 통합은 #50 독립 세션이 격리 clone에서 수행했다. 추가 에이전트·부모 재위임 없음.

## 이번 준비 결과

- 소유 세션 t77 / `tb16e0417a21549ae7858bb64ea2535da8` / `01a1e024-264c-7f20-b0a3-bf03559c62ba`. 부모가 실제 Ready 화면·cwd·시작 SHA를 확인한 뒤 착수했다.
- [사용자 승인](https://github.com/krdn/gon-stock03/issues/9#issuecomment-6897995215)은 그대로 유효하다. 같은 승인을 다시 묻지 않는다. 지금 KIS 호출·예약·상주 대기는 하지 않았다.
- [준비 검증](../verification/2026-11-16-paper-preflight.md): 기존 주문 경로에 명시적 1회 승인 제한을 보완했다. 범위·시도 소비 영구 기록·전송 직전 시간/시세·응답 후 정지·120초 조회 상한을 fixture로 확인했다. 단위/API110·빌드·브라우저67 PASS.
- 시작 준비 커밋84220d1 앱43738214984·구성43738215092 및 main3f3bee6 CI2개 SUCCESS 재확인. 이번 지정 Argon/high 본 리뷰·수정분 모두 PREPARATION PASS. 실제 반환 init 일치, 서버 모델/effort 독립 검증 한계 유지. 최종 SHA·초안 PR·CI는 완료 인계 댓글에서 확인한다.
- 실패/한계: STE strict 기준파일 부재, graphify 부재, KRX 안내 재조회403. 실제 계좌/앱·최신 데이터·장중 접수/조회는 미검증이다. 원본·#48 폴더·`.codex`와 다른 세션의 변경은 보존했다.

## 다음 행동

[실행 절차](../operations/kis-minimum-paper-run.md)에 원장 출처 확인·읽기 전용 백업·전용 실행 원장·단일 서버·수동 시작·잔량 처리·정지 절차를 고정했다. 원장 출처 후보는 존재만 확인했으며 실제 백업/이관은 하지 않았다.

준비 PR을 검토한 후 사용자에게 **실행일, API/앱 동일 계좌, 앱 잔량 취소 가능성, 다른 API 운용 없음**의 사실확인과 시간창 내 **별도 수동 시작**만 받는다. 그때 공식 개장·마스터·최신 시세/잔고/원장·위험 상태를 확인하고 조건 불충족이면 전송하지 않는다. 설정값은 실행/예약이 아니다.

실제 접수·조회 증거 전 #9 completed/Done·후속9개 선행 해제 금지. UI는 #14 소유다. 추가 에이전트·부모 재위임은 하지 않는다.

## 새 세션 시작 문구

> docs/STATE.md와 #9 작업 파일·최신 승인 댓글·조건부 실행안을 읽고 실행 준비를 이어가줘. 사용자 승인은 기록된 범위로 유효하다. 지금 실행/예약하지 말고, 실행 전 조건과 별도 수동 시작을 확인해. 필요한 검증은 Fable 5.2 또는 Gemini 4 Argon으로 진행해.

## 2026-11-16 API 전량취소 후보

사용자는 스마트폰 잔량취소 가능을 확인했으며, Open API 대안을 우선 조사하고 판단해 진행하도록 지시했다. [검증 경로](../operations/kis-cancel-probe.md)를 추가했다. 일반 취소·정정 409는 유지한다. 예제와 포털 안내의 충돌은 미해결이며, 실제 모의 취소 지원 확정이나 #9 완료를 뜻하지 않는다. 현재 실행 시간창 변경·실제 주문·취소·예약은 수행하지 않았다.

2026-11-16 PR54 리뷰 재개: 세션 `01a1e2ce-afc8-7bf0-83c1-609fc91d971f`의 Herdr 탭·Ready·cwd·HEAD를 부모가 확인한 뒤 단독 소유권을 받았다. 지정 Argon/high는 최신 diff에서 지적 없음·PREPARATION PASS를 반환했다. 제품 코드는 유지하고 첫 취소 전 재시작·전송 대기 만료의 전송0회 테스트를 추가해 단위/API118 PASS를 확인했다. [리뷰 근거와 실행 전 미확인 사항](../operations/kis-cancel-probe.md)을 보완했다. 최종 SHA·추가 검증·CI·수정분 리뷰는 PR54와 최신 인계 댓글을 확인한다. 실제 업무 API·시간창 변경·예약·추가 에이전트는 없으며 후속9개 차단을 유지한다.
