# 작업: #15 데이터 상태

기준 이슈: https://github.com/krdn/gon-stock03/issues/15

- 상태: 완료
- 목표·완료 조건: 실제/합성 출처, 요청·저장 범위, 거래일, 수정주가, 누락·중복과 마지막 성공을 구분해 표시한다. 실패를 최신으로 표시하지 않는다.
- 허용된 작업·제외 범위: 기존 C01/C02 저장 조회와 화면 검증. 실제 주문·취소·전략 실행, 새 수집 엔진, WebSocket(C04)과 장중 통합 수용(V01)은 제외한다.
- 선행: #6·#7 completed, PR #27 `8b28022`·#29 `bc81384`가 main 조상임을 확인했다.
- 이슈 / PR: [#15](https://github.com/krdn/gon-stock03/issues/15) completed/Done / [#39](https://github.com/krdn/gon-stock03/pull/39) merged.
- 브랜치 / 기준 main SHA: `feat/15-data-status` / `0ea629604c8e75acb0a253e5bcb4a6fbe77ae088`. main 앱43707747091·구성43707747046 SUCCESS, ready PASS.

## 먼저 읽을 자료

- [작업 규칙](../WORKFLOW.md), [계획 S12·운영 규칙](../plans/interface-sessions-2026-11.md)
- `src/pages/Operations.tsx`의 DataStatus, `src/specs.ts`의 data 행
- `shared/market-data.ts`의 DailyRun, `server/market-data.ts`의 quality/step, `server/store.ts`의 dailyRuns/dailyBars
- [수집 API·품질 경계](../operations/market-data.md), `tests/market-data.test.ts`, `tests/browser/workbench.spec.ts`

## 현재 결과

- 완료한 변경: 공개 마스터·KIS 일봉·DEMO 분리 화면, 범위·품질·마지막 성공과 실패 표시, schema·브라우저/API 회귀 검사. [검증](../verification/2026-11-15-data-status.md).
- 검사: 단위71/71·전체 브라우저57/57·#15 브라우저7/7·빌드 PASS. 격리 저장소에서 공개 마스터3962종목 실조회, 실제 KIS 일봉·계좌 조회 없음. Argon/high 원 리뷰·수정분 리뷰 PASS. 제품 `b8645701b6ec0ec65e94c4897812304fbbc9424f`의 push·PR 앱/구성 CI 모두 SUCCESS. clean clone main ready·작업 브랜치 handoff dry-run PASS. 최종 문서 HEAD의 CI·인계 댓글은 PR·이슈에서 확인한다.
- 미검증: 사용자 직접 육안·장중 수용, 실제 KIS 기간별 일봉과 공식 달력 대조. #7 공개 마스터3962종목 실조회와 구분한다.
- 통합: 이번 계속 진행 지시와 지정 Argon 검증에 따른 판단으로 PR #39를 `ab5e16f4ca0d141308c98f2b4e96dad8dc01c97a`에 통합했다. main 앱43712041000·구성43712040993 SUCCESS. [수용 형태](../verification/2026-11-15-data-status.md#계속-진행에-따른-통합).
- 실패·제한: STE 기준 파일·graphify 부재, #8 Fable 한도 오류를 보존한다. 이번 새 Argon 원 리뷰·수정분 PASS에서 요청/init 일치와 서버 모델·effort 독립 확인 한계를 구분한다.
- 보존: 미추적 `.codex/config.toml`, `docs/architecture/tech-stack-review.md`. 후자는 리팩터링 지시가 아니다.

## 다음 행동

기록 PR의 최종 main CI·원격 인계를 확인하고 준비된 Herdr #21 탭으로 소유권을 넘긴다. #21 native 선행 #7·#15 completed·main 통합 및 Ready를 확인했다. #15 추가 구현은 없다.

## 새 세션 시작 문구

> docs/STATE.md와 이 작업 파일, 필수 자료 및 관련 이슈·PR·CI만 확인하고 다음 행동부터 이어가줘.
