# 작업: #21 저장 일봉 백테스트

기준 이슈: https://github.com/krdn/gon-stock03/issues/21

- 상태: 검증 대기
- 목표·완료 조건: 저장 일봉 기간·출처·정책 선택, 다음 봉 체결, 미래 봉 독립성, 누락/표본 부족 거부, 비용·낙폭 검증, 입력 보존·재현.
- 허용 범위: 백테스트 화면·API·엔진·실험 저장·명세·검증. 신규 수집 엔진·주문·연속전략·WebSocket 제외.
- 선행: #7·#15 native completed, main 통합과 #21 Ready를 2026-11-15 재확인.
- 이슈 / PR: [#21](https://github.com/krdn/gon-stock03/issues/21) / [#41](https://github.com/krdn/gon-stock03/pull/41), OPEN/In Review.
- 제품 대상 SHA: `05ce604d82ab9a44e98c2f294f2f221ce1025916`. 직접 사용자 화면 수용 답변·통합은 아직 없다.
- 브랜치 / 기준 SHA: `feat/21-backtest` / `f50e08040dc883f5577579221cea433d3054c40e`.

## 먼저 읽을 자료

- [세션 계획 S08·운영 규칙](../plans/interface-sessions-2026-11.md), [WORKFLOW](../WORKFLOW.md), 이슈 #21.
- `src/pages/Research.tsx`, `server/engine.ts`, `src/specs.ts`, `tests/browser/workbench.spec.ts`.
- C02의 `shared/market-data.ts`, `server/store.ts`, `server/http.ts`, `shared/data-inventory.ts`.

## 현재 결과

- 완료한 변경: 저장 일봉/DEMO 선택, 기간·정책·규칙·비용 설정, 입력 SHA256·봉·출처·엔진 버전·결과 보존, 불러오기·재현 검증. `src/specs.ts` 동시 갱신.
- 검사: 단위/API77·전체 브라우저59·빌드 PASS. 원/수정주가·0거래·다음 시가·미래 봉 독립성·표본 부족·누락·저장 실패·재시작·변조 검사. [검증 기록](../verification/2026-11-15-backtest.md).
- 실패: JSON 키 순서에 따른 재현 오판·모바일 넘침·저장 실패400을 수정하고 재검증했다. 전체 e2e 첫 실행 exit143은 성공으로 계상하지 않았으며 이후59 PASS.
- 원격: 제품 PR 앱43714094710·구성43714094705 SUCCESS. clean clone ready·원격 handoff dry-run PASS. 제품 push CI의 기존 KIS pacing 19ms<20ms 실패를 보존한다. 로컬 단독 재검사는 PASS이며 원인 해결을 주장하지 않는다.
- 문서 검사: 상대 링크·diff PASS, STE 기준 파일 부재 exit2. 번들 500kB 경고를 보존했다.
- 리뷰: 지정 `gemini-4-argon-high`/high PASS·결함 없음. 요청/init 일치, SUCCESS·exit0. 서버 모델·effort 독립 확인 한계 유지. 사용자 직접 화면 수용·통합은 대기다.
- 착수: terminal t6z·session `01a1df18-deae-7de3-be21-7c073e8e82c1`에 단독 구현 소유권 이전.
- 기준 main 앱43712507342·구성43712507478 SUCCESS 및 workflow ready PASS.
- 결정: 입력 달력과 저장 봉의 일치를 다시 검사한다. 공식 달력 인증은 아니며 미대조 기록을 실행 가능으로 승격하지 않는다.
- 미검증: 사용자 직접 화면 수용·장중 수용, 실제 KIS 기간별 일봉·공식 달력, 수익성. 공개 마스터3962 실조회와 구분한다.
- 보존: 미추적 `.codex/config.toml`, `docs/architecture/tech-stack-review.md`, STE 기준 파일·graphify 부재, #8 Fable 한도 오류.

## 다음 행동

PR41의 최종 CI·원격 인계를 확인한 뒤 화면 수용과 통합 판단을 기록한다. 기준 제품 SHA와 직접 육안/장중 미검증을 구분한다. 통합 전에는 #21을 completed/Done으로 바꾸거나 #22 선행을 해제하지 않는다.

## 새 세션 시작 문구

> docs/STATE.md와 이 작업 파일, 필수 파일·관련 이슈/PR/CI만 확인하고 다음 행동부터 이어가줘. 주문 실행 승인은 없다.
