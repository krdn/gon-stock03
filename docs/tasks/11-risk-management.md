# 작업: #11 위험관리

기준 이슈: https://github.com/krdn/gon-stock03/issues/11

- 상태: 구현·로컬 검증 완료, 지정 Gemini4Argon/high 위임 수용 PASS. 이 기록 시점은 통합 전이며 최종 상태는 #11 종료 댓글·PR55의 merge/main CI를 기준으로 확인한다. 브랜치 `feat/11-risk-management`, 기준 main `5314e0203b47435600de9a51fbe839a0c327875b`.
- 선행: PR54 통합·main 앱43818793568/구성43818793645 SUCCESS, #9 closed/completed·Project Done 확인. #11 In Progress, #17 Ready. #12/#13은 남은 선행으로 Blocked 유지. native 관계는 보존했다.
- 소유권: 부모가 Herdr 탭·cwd·Ready 확인 후 t7c/session `01a1e313-6e2c-7663-ada0-677025acb987`에 단독 작업을 이전했다. [원래 인계·위임 범위](https://github.com/krdn/gon-stock03/blob/e550c09/docs/tasks/11-risk-management.md). 사용자가 필요한 Fable5.2 또는 Gemini4Argon 검증·정상 조건의 통합·후속 구현을 위임했다. 직접 사용자 육안 수용과 구분한다.
- 완료 조건: 긴급정지 영속·신규 전송 차단·기접수 주문 자동취소 아님·불명 중 재개 금지·폴링/저장 중 편집 보존·환경별 사용량/산식/차단 이유·DEMO 수동/전략 공통 한도·매도 보유 범위·specs 계약 갱신.
- 제외: 실제 KIS 업무API·주문·취소·예약·전략 운용. 최신 거래 지시는 다음 별도 장중 시작 때 매수만/모바일 직접취소. 소비 원장 재설정 없음. KIS 전략은 #22, 실제 장중 통합/전체 육안 수용은 #25다.

## 먼저 읽을 자료

AGENTS·WORKFLOW·STATE, 이 작업 파일, 원격 #11·구현 PR/CI. 구현 세부가 필요할 때 `Risk` in `src/pages/Operations.tsx`, `server/http.ts`의 risk/halt, `PaperBroker.riskSnapshot`, `Store.paperBaselineValue`, `tests/risk.test.ts`, `tests/browser/risk.spec.ts`를 확인한다. #9 근거는 [수용 기록](9-kis-orders-recovery.md#2026-11-16-위임-수용-검증)과 [삼성전자 한정 실증](../verification/2026-11-16-samsung-paper-run.md)만 추가로 읽는다.

## 결과와 검증

[검증 기록](../verification/2026-11-16-risk-management.md). 불명/전송 중 재개200을400으로 차단했다. 저장 대기 중 새 편집과 저장 후 조회실패에서 입력이 보존된다. 상태 폴링은 로컬 원장·기준·이미 관측한 주문 스냅샷만 읽으며 브로커 호출·손실 기준 생성이 없다.

단위/API128 PASS, 전체 브라우저72 PASS 후 추가 조회실패를 포함한 위험관리6 PASS, 빌드 PASS. STE strict 기준파일 부재 exit2와 기존 번들 경고는 유지한다. 화면은 비밀값 미주입·메모리 DB로 확인했고 서버를 종료했다. [지정 리뷰](../verification/assets/risk-management/argon-review.json)는 RISK ACCEPTANCE PASS(P0/P1/P2 없음), 요청/init 일치. 서버 내부 모델·effort 독립 확인 한계. PR·최종 SHA·CI는 완료 기록에서 갱신한다.

## 다음 행동

지정 모델 리뷰 지적을 처리한 뒤 코드·검증 기록을 커밋·푸시한다. 해당 SHA의 PR CI와 위임 수용 판단을 확인해 통합하고 main CI를 재조회한다. #11 completed/Project Done 및 후속 native 상태를 갱신한다. 사용자 직접 육안 수용을 대체했다고 주장하지 않는다.

보존: `.local/` 전체 원장·백업, `.codex/`, `graphify-out/`, 다른 worktree. 강제푸시·보호규칙 우회·추가 에이전트·부모 재위임 없음. GitHub 연결 도구 쓰기403은 인증된gh로 처리하며 원격 readback을 확인한다.

## 전달 대상

[PR55](https://github.com/krdn/gon-stock03/pull/55), 제품 `e459e95701c84f72ad6f1407f1c7295ec21a7e09`. 위임 수용은 이 제품 파일 해시에 고정했다. 후속 기록 커밋은 문서만 변경한다. #11 완료 후 #12와 #17은 Ready 후보이며, 다른 후속은 각 native 선행을 재조회한다. 이번 구현 범위는 #11까지다.
