# 작업: #9 통합 후 #11 위험관리

기준 이슈: https://github.com/krdn/gon-stock03/issues/11

- 상태: 차단.2026-11-16 원격 native 선행은 #9 OPEN, Project의 #9/#11은 Blocked다. PR54는 초안·MERGEABLE/CLEAN,6193f78의 CI4 SUCCESS다.
- 목표·완료 조건: 먼저 #9의 완료 근거와 잔여 이관을 검증해 통합·완료 처리한다. 그 뒤 #11의 긴급정지 영속·불명 중 재개 금지·한도 사용량/산식/차단 이유·편집 보존을 구현하고 이슈의 완료 조건을 검증한다.
- 허용된 작업: 사용자2026-11-16 지시로 저장소 다음 작업을 점검하고 새 Herdr 세션에서 진행한다. 필요한 수용/기술 판단은 Fable5.2 또는 Gemini4Argon 검증으로 진행한다. 보통 GitHub 통합·기록·후속 구현을 포함한다. 현재 구현 소유권은 부모가 새 탭/세션 연결을 확인한 뒤 메시지로 이전한다.
- 제외 범위: 실제 KIS 업무API·새 주문·취소·예약·전략 운용. 이번 개발에 추가 매수 실증은 필요하지 않다. 최신 사용자 거래 지시는 다음 테스트에서 매수만/사용자가 모바일 취소이며 별도 장중 시작 전 실행하지 않는다.
- 선행: #9 completed 및 origin/main 통합과 CI 확인. #17도 후속 후보지만 #11을 먼저 순차 진행한다. #12/#13/#14 등의 남은 선행을 각각 재조회하며 일괄 해제하지 않는다.
- 이슈 / PR: [#9](https://github.com/krdn/gon-stock03/issues/9), [PR54](https://github.com/krdn/gon-stock03/pull/54), [#11](https://github.com/krdn/gon-stock03/issues/11), [#25](https://github.com/krdn/gon-stock03/issues/25).
- 확인 SHA: PR54 `6193f785236deba43b85ac16fc39f1900d28c92c`, origin/main `0f53eaa285d42517c4331675f904cf6112d5ab52`. 인계 문서 커밋은 이 다음이며 재개 시 live head를 확인한다.

## 먼저 읽을 자료

AGENTS·WORKFLOW·STATE, [삼성전자 실증](../verification/2026-11-16-samsung-paper-run.md), [#9 작업](9-kis-orders-recovery.md)의 최신 실증 절, 원격 #9/#11/#25·PR54·CI. 필요한 경우만 [실행안](../operations/kis-minimum-paper-run.md)의 최신 삼성전자 승인과 [취소 후보](../operations/kis-cancel-probe.md)를 읽는다. 전체 과거 대화·로그는 읽지 않는다.

#11 구현 시 `src/pages/Operations.tsx`, `server/paper.ts`, `server/engine.ts`, `server/store.ts`, `src/specs.ts`, 관련 단위/API·`tests/browser/workbench.spec.ts`의 위험관리 부분을 확인한다. 한도 규칙은 기존 서비스에 유지한다.

## 현재 결과

- 제품1d2030e에서 삼성전자195,800원·1주 모의 매수 접수→REST 대조→API취소→cancelled/체결0/잔량0을 관측했다. 기존 보유와 원장 보존, 서버종료·위험정지·백업 완료. 이 한 건은 #9의 마지막 실증 조건을 충족하는 근거다.
- 단위/API124·브라우저67·빌드·지정Argon 본/수정분 PASS. 실행 SHA와6193f78 모두 CI4 SUCCESS. 실제 반환은 init 모델 일치까지만 확인했으며 서버 내부 모델/effort 독립 확인 한계가 있다.
- #9 본문에는 옛 준비 상태/시간창/미실행 내용이 남아 있다. 현재 수용 근거와 미관측 범위를 반영해야 한다. #25 본문도 취소 미실증으로 남아 있어 한정 취소 관측과 미관측 체결·부분체결·장애복구·연속전략을 구분해 이관한다.
- 일반 웹 취소/정정 차단 및 공식 계약 미확정은 유지한다. 한정 성공으로 일반 지원 계약을 확정하지 않는다. 이 결정은 #9의 미지원 대안 완료 조건과 양립한다.
- 보존: 원본 `.local/` 전체, 기존 KODEX/삼성전자 승인별 원장·백업, `.codex/`, 다른 worktree, 기존 미추적 `graphify-out/`. 삭제·초기화·강제푸시·보호규칙 우회 없음.
- STE strict는 `docs/conventions/ste100-writing.md` 부재로 exit2. 자동 handoff는 미추적 graphify-out/ 때문에 중단됐다. PR edit은 구형 Projects classic 오류로 실패해 REST PATCH로 반영했다. 기존 파일을 지우지 말고 필요 시 인증된 GitHub API와 원격 readback을 사용한다.

## 다음 행동

새 세션은 부모의 실제 탭·cwd·session·Ready 확인 후 단독 소유권을 받는다. #9/PR54 완료·통합 가능 여부를 지정 모델로 한 번 검증하고, 근거가 충족되면 실증 체크와 #25 이관을 기록해 PR54를 통합한다. 통합 main CI 및 #9 completed/Project Done을 확인한 뒤 native 선행을 재조회한다. #11을 Ready/진행으로 전환하고 별도 작업 브랜치에서 구현·검증·사용자 위임 범위의 수용·통합까지 진행한다. 실제 UI 사용자 확인이 없으면 모델 검증과 구분해 기록한다.

부모는 소유권 이전 뒤 저장소를 수정하지 않는다. 추가 에이전트 생성·부모 재위임 없이 새 세션이 순차 진행한다. 차단 시 구체적 근거와 다음 행동을 남긴다.
