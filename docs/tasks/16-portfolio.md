# 작업: #16 포트폴리오

기준 이슈: https://github.com/krdn/gon-stock03/issues/16

- 상태: 완료
- 목표·완료 조건: 환경별 현금·보유·평가액·손익·비중, 전체 페이지·0수량·가격 누락·총자산0·상세 이동을 검증한다.
- 허용된 작업·제외 범위: KIS 조회와 DEMO 표시. 주문·취소·전략 실행, 스택 교체는 제외한다.
- 선행 작업·의존관계: #6·#8 completed 및 main 통합 재확인. #16 Project Ready에서 착수한다.
- 이슈 / PR: [#16](https://github.com/krdn/gon-stock03/issues/16) / [PR #37](https://github.com/krdn/gon-stock03/pull/37)
- 작업 브랜치 / 마지막 확인 SHA: `feat/16-portfolio` / 제품 수용 대상 `ac099efe3a9164e03c070bedbe939905277d59aa`, PR 최종 `78980f3`, 통합 `c54061266d7124f498307bde4c54a394ca92f19a`

## 먼저 읽을 자료

- `AGENTS.md`, `docs/WORKFLOW.md`, 이슈 #16, `docs/plans/interface-sessions-2026-11.md` S06·운영 규칙.
- `src/pages/Workspace.tsx` Portfolio, `src/specs.ts` portfolio, `tests/browser/workbench.spec.ts`.
- C01 경계: `server/kis.ts` balance/loadBalance, `shared/model.ts`, `shared/contracts.ts`, `src/App.tsx` 공통 조회.

## 현재 결과

- 완료한 변경: 환경 분리·잔고 수동 조회·평가/손익/비중·불완전 상태·상세 이동·가격 nullable 계약·화면 레지스트리. [검증 기록](../verification/2026-11-15-portfolio.md).
- 검사 명령·결과·대상 SHA: 기준 main CI·ready PASS. 구현 작업트리에서 단위70/70·최종 원격 브라우저50/50·빌드 PASS. 실제 KIS 모의잔고1페이지0보유 UI 반영, Argon high 리뷰 PASS. 평균매입가 표시 후속 회귀·수정분 리뷰 PASS. 제품 PR 앱43704203859·구성43704203812 SUCCESS, clean clone handoff dry-run PASS.
- 미검증·남은 작업: 이번 계속 진행 지시와 Argon 검증에 따라 PR #37을 통합했다. 통합 main 앱43707224025·구성43707223572 SUCCESS를 확인했다. 기록 인계를 마무리한다. [수용 형태](../verification/2026-11-15-portfolio.md#이번-계속-진행-지시와-수용통합). 사용자 직접 육안·장중 수용·실제 주문/취소/전략은 미검증. 실제 여러 보유/여러 페이지는 미실증이며 결정적 테스트로 확인했다.
- 실패·차단 원인과 반복하지 않을 시도: 처음 가격 누락·환경 선택 부재 테스트 실패 후 구현. DEMO 회귀는 환경을 명시 선택해 통과했다. STE 기준 파일·graphify 부재는 통과로 바꾸지 않는다. 루트 handoff dry-run은 보존 중인 미추적 `.codex/` 때문에 차단되어 원격 브랜치의 깨끗한 복제본에서 통과했다. `ready`는 기본 브랜치 HEAD를 요구하므로 작업 브랜치 불일치와 main PASS를 구분한다.
- 결정과 이유·보존할 사용자 변경: 공통 서비스를 재사용한다. `.codex/config.toml` 미추적 사용자 설정 및 `docs/architecture/tech-stack-review.md`를 보존한다.

## 다음 행동

#16 completed/Project Done과 기록 PR의 최종 main CI를 확인한다. 실제 Herdr 탭·세션·경로 확인 후 #15 소유권을 넘긴다. 추가 제품 구현은 없다.

## 새 세션 시작 문구

> docs/STATE.md와 이 작업 파일, 필수 자료 및 관련 이슈·PR·CI만 확인해 다음 행동부터 이어가줘.
