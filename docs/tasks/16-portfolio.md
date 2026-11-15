# 작업: #16 포트폴리오

기준 이슈: https://github.com/krdn/gon-stock03/issues/16

- 상태: 검증 대기
- 목표·완료 조건: 환경별 현금·보유·평가액·손익·비중, 전체 페이지·0수량·가격 누락·총자산0·상세 이동을 검증한다.
- 허용된 작업·제외 범위: KIS 조회와 DEMO 표시. 주문·취소·전략 실행, 스택 교체는 제외한다.
- 선행 작업·의존관계: #6·#8 completed 및 main 통합 재확인. #16 Project Ready에서 착수한다.
- 이슈 / PR: #16 / 작성 예정
- 작업 브랜치 / 마지막 확인 SHA: `feat/16-portfolio` / 기준 `daa01baa65f94cb5c9e1497a28fa8c2ff71938e9`

## 먼저 읽을 자료

- `AGENTS.md`, `docs/WORKFLOW.md`, 이슈 #16, `docs/plans/interface-sessions-2026-11.md` S06·운영 규칙.
- `src/pages/Workspace.tsx` Portfolio, `src/specs.ts` portfolio, `tests/browser/workbench.spec.ts`.
- C01 경계: `server/kis.ts` balance/loadBalance, `shared/model.ts`, `shared/contracts.ts`, `src/App.tsx` 공통 조회.

## 현재 결과

- 완료한 변경: 환경 분리·잔고 수동 조회·평가/손익/비중·불완전 상태·상세 이동·가격 nullable 계약·화면 레지스트리. [검증 기록](../verification/2026-11-15-portfolio.md).
- 검사 명령·결과·대상 SHA: 기준 main CI·ready PASS. 구현 작업트리에서 단위70/70·브라우저49/49·빌드 PASS. 실제 KIS 모의잔고1페이지0보유 UI 반영, Argon high 리뷰 PASS.
- 미검증·남은 작업: PR/CI·원격 인계, 대상 SHA에 대한 사용자 화면 수용·통합. 사용자 직접 육안·장중 수용·실제 주문/취소/전략은 미검증. 실제 여러 보유/여러 페이지는 미실증이며 결정적 테스트로 확인했다.
- 실패·차단 원인과 반복하지 않을 시도: 처음 가격 누락·환경 선택 부재 테스트 실패 후 구현. DEMO 회귀는 환경을 명시 선택해 통과했다. STE 기준 파일·graphify 부재는 통과로 바꾸지 않는다.
- 결정과 이유·보존할 사용자 변경: 공통 서비스를 재사용한다. `.codex/config.toml` 미추적 사용자 설정 및 `docs/architecture/tech-stack-review.md`를 보존한다.

## 다음 행동

PR의 최종 HEAD·CI와 화면 수용 형태를 확인하고 사용자 수용·통합 후 #16 completed/Project Done을 처리한다. 추가 구현은 요청 또는 확인된 결함이 있을 때만 한다.

## 새 세션 시작 문구

> docs/STATE.md와 이 작업 파일, 필수 자료 및 관련 이슈·PR·CI만 확인해 다음 행동부터 이어가줘.
