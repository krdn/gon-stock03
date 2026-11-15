# 작업: #21 저장 일봉 백테스트

기준 이슈: https://github.com/krdn/gon-stock03/issues/21

- 상태: 완료 — 저장 일봉 실험 구현·위임 수용·통합 범위
- 목표·완료 조건: 저장 일봉 기간·출처·정책 선택, 다음 봉 체결, 미래 봉 독립성, 누락/표본 부족 거부, 비용·낙폭 검증, 입력 보존·재현.
- 허용 범위: 백테스트 화면·API·엔진·실험 저장·명세·검증. 신규 수집 엔진·주문·연속전략·WebSocket 제외.
- 선행: #7·#15 native completed, main 통합과 #21 Ready를 2026-11-15 재확인.
- 이슈 / PR: [#21](https://github.com/krdn/gon-stock03/issues/21) / [#41](https://github.com/krdn/gon-stock03/pull/41), MERGED. 제품 통합 `fa0e1e0096dd9e55e824ea6320f6862698a889cb`.
- 제품 대상 SHA: `05ce604d82ab9a44e98c2f294f2f221ce1025916`. 사용자의 2026-11-15 계속 진행·다음 세션 지시와 지정 Argon/CI·fixture 화면 근거로 수용·통합을 판단했다. 직접 사용자 육안 수용으로 기록하지 않는다.
- 브랜치 / 기준 SHA: `feat/21-backtest` / `f50e08040dc883f5577579221cea433d3054c40e`.

## 먼저 읽을 자료

- [세션 계획 S08·운영 규칙](../plans/interface-sessions-2026-11.md), [WORKFLOW](../WORKFLOW.md), 이슈 #21.
- `src/pages/Research.tsx`, `server/engine.ts`, `src/specs.ts`, `tests/browser/workbench.spec.ts`.
- C02의 `shared/market-data.ts`, `server/store.ts`, `server/http.ts`, `shared/data-inventory.ts`.

## 현재 결과

- 완료한 변경: 저장 일봉/DEMO 선택, 기간·정책·규칙·비용 설정, 입력 SHA256·봉·출처·엔진 버전·결과 보존, 불러오기·재현 검증. `src/specs.ts` 동시 갱신.
- 검사: 단위/API77·전체 브라우저59·빌드 PASS. 원/수정주가·0거래·다음 시가·미래 봉 독립성·표본 부족·누락·저장 실패·재시작·변조 검사. [검증 기록](../verification/2026-11-15-backtest.md).
- 실패: 기록 커밋 CI에서 #21 오류 선택자가 페이지 오류·toast를 함께 잡았다. `main`의 지속 오류로 대상을 명시해 3회 연속 PASS·Argon 수정분 PASS를 확인했다. JSON 키 순서에 따른 재현 오판·모바일 넘침·저장 실패400을 수정하고 재검증했다. 전체 e2e 첫 실행 exit143은 성공으로 계상하지 않았으며 이후59 PASS.
- 원격: 제품 PR 앱43714094710·구성43714094705 SUCCESS. clean clone ready·원격 handoff dry-run PASS. 제품 push CI의 기존 KIS pacing 19ms<20ms 실패를 보존한다. 로컬 단독 재검사는 PASS이며 원인 해결을 주장하지 않는다.
- 문서 검사: 상대 링크·diff PASS, STE 기준 파일 부재 exit2. 번들 500kB 경고를 보존했다.
- 리뷰: 지정 `gemini-4-argon-high`/high PASS·결함 없음. 요청/init 일치, SUCCESS·exit0. 서버 모델·effort 독립 확인 한계 유지. 제품 이후 src/server/shared 변경이 없어 새 모델 리뷰를 반복하지 않았다.
- 통합: 최종 HEAD `fd6350425b3c07834bd721d9b9873dd70372c23e`의 PR·push CI 모두 SUCCESS와 미해결 리뷰 없음 확인 후 squash merge했다. 통합 main 앱43716579368·구성43716579364 SUCCESS. clean clone `ready` PASS. 원래 작업 폴더의 미추적 사용자 설정을 보존했다.
- 착수: terminal t6z·session `01a1df18-deae-7de3-be21-7c073e8e82c1`에 단독 구현 소유권 이전.
- 기준 main 앱43712507342·구성43712507478 SUCCESS 및 workflow ready PASS.
- 결정: 입력 달력과 저장 봉의 일치를 다시 검사한다. 공식 달력 인증은 아니며 미대조 기록을 실행 가능으로 승격하지 않는다.
- 미검증: 사용자 직접 화면 수용·장중 수용, 실제 KIS 기간별 일봉·공식 달력, 수익성. 공개 마스터3962 실조회와 구분한다.
- 보존: 미추적 `.codex/config.toml`, `docs/architecture/tech-stack-review.md`, STE 기준 파일·graphify 부재, #8 Fable 한도 오류.

## 다음 행동

기록 PR·최종 main CI·원격 인계 댓글을 확인하고 #23 매매일지를 새 Herdr 세션에서 진행한다. #23의 native 선행 #5 completed·통합과 Ready를 재확인한다. #22는 #19 미완료로 Blocked를 유지한다. 직접 육안·실제 KIS 일봉·공식 달력·장중 검증은 완료로 승격하지 않는다.

## 새 세션 시작 문구

> docs/STATE.md와 이 작업 파일, 필수 파일·관련 이슈/PR/CI만 확인하고 다음 행동부터 이어가줘. 주문 실행 승인은 없다.
