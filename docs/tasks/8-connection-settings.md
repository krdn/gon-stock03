# 작업: 연결·설정

기준 이슈: [#8 S13](https://github.com/krdn/gon-stock03/issues/8)

- 상태: 완료 (completed / Done)
- 목표·완료 조건: `/settings`에서 필수 값·KIS 인증·전체 잔고 조회를 구분하고 미주입·만료·권한·호출제한·네트워크 실패와 복구 방법을 표시한다. 실제 응답 전 성공, 실전 fallback, 비밀값 노출을 금지한다. 화면 수용 답변과 대상 SHA는 별도로 기록한다.
- 범위: 설정 화면·공통 연결 상태의 필요한 확장·`src/specs.ts`·단위/HTTP/브라우저 검증. 주문·취소·전략·#9 등 다른 기능은 제외한다.
- 선행: native #6 closed/completed, 통합 `8b280229`가 기준 main에 포함됨을 확인했다.
- 이슈 / PR: [#8](https://github.com/krdn/gon-stock03/issues/8) closed/completed, Project Done / [PR #31](https://github.com/krdn/gon-stock03/pull/31) merged. 통합 SHA는 `21ca53a0f7850bc072777e293b4ca14b419e52aa`다.
- 브랜치 / 기준 SHA: `feat/8-connection-settings` / `78f96ec3647cf9ef8c8ebf8562136eb1494b76d9`.
- 구현·검증 SHA: `15e3dc6fb4f6721d8483ea3cb363ebcd4eec3ef2`. 위임된 수용 대상은 `f05d5ae90f0b70179e521a9199ffcf4bd6ae4617`이며 후속 기록 커밋은 제품 코드를 바꾸지 않는다.

## 먼저 읽을 자료

- `AGENTS.md`, `docs/WORKFLOW.md`, #8.
- `docs/plans/interface-sessions-2026-11.md`: S13 행, Project 운영, 한 세션의 시작과 종료.
- `src/pages/Operations.tsx`: Settings; `server/kis.ts`: send/accessToken/connection/balance.
- `shared/model.ts`, `shared/contracts.ts`, `shared/status.ts`, `src/App.tsx`: 연결 상태 계약과 갱신.
- `src/specs.ts`: settings; `tests/kis.test.ts`, `tests/http.test.ts`, `tests/browser/workbench.spec.ts`.
- `docs/INFISICAL.md`, `docs/start-context.json`: 주입 경계와 공식 근거.

## 현재 결과

- 2026-11-15 착수 전 원격 main SHA 일치, 열린 PR 없음, #8 Ready, #6 completed·통합 확인. main [앱 CI](https://github.com/krdn/gon-stock03/actions/runs/43675809174)·[구성 CI](https://github.com/krdn/gon-stock03/actions/runs/43675809187) SUCCESS. `gon-workflow ready .` 통과.
- Project #8을 착수 시 In Progress, PR 준비 후 In Review로 바꿨다. 부모 t6q가 이 세션의 Herdr 탭·세션·경로 일치와 저장소 수정 중단을 알렸다.
- 설계: 기존 토큰·페이징·호출 간격·재시도 경로를 확장한다. 별도 인증 클라이언트를 만들면 상태와 제한이 갈라지므로 사용하지 않는다. 환경변수 존재는 Infisical 출처·접근 성공 증거가 아니다.
- 원격: 구현 SHA와 origin 브랜치 일치 확인. GitHub 연결 도구 PR 생성403 후 중복이 없음을 조회하고 기존 인증 gh로 PR #31을 생성했다. 필수 CI·최종 handoff는 PR/이슈의 최신 원격 기록을 따른다.
- 보존: 미추적 `.codex/config.toml`은 수정·스테이징하지 않는다.
- 구현: 단계별 상태·유형화 오류·복구 안내·서버 상태 재조회·토큰 재확인·이전 잔고 표기와 `src/specs.ts` 계약을 갱신했다. 새 상태 필드가 필수이므로 서버와 화면을 함께 갱신한다.
- 검사: 새 단위7건과 오류표 확장 RED→GREEN, 브라우저 상태 부재 RED→GREEN. 단위58/58·브라우저33/33·타입/빌드 성공. 390px 안내 펼침에서 가로 넘침 없음, axe 0건. [검증 기록](../verification/2026-11-15-settings.md).
- 실제 조회: 2026-11-15 13:31:48 및 최종 13:42:09 KST Infisical dev /kis 주입 후 모의 인증·잔고1페이지 전체 조회 성공. 두 독립 클라이언트의 발급 시도로 실제 HTTP403/EGW00133을 확인하고 수정 후 rate-limit로 분류했다. 비밀값·계좌잔고 수치는 기록하지 않았다.
- 수정 중 실패: ES2024 Promise.withResolvers는 기존 TS lib에서 지원하지 않아 기존 Promise 방식으로 변경했다. 주문 거부 진단 코드 제거로 기존 테스트1건이 실패해 비밀 마스킹을 유지한 코드 표시를 복원했다. 새 검사도 비밀이 아닌 대문자 진단코드 대신 실제 fixture 계좌값을 넣어 비노출을 검사한다.
- 외부 리뷰: 실제 Claude Opus5.5/high의 조건부 PASS(P2 1·P3 2). 발급 제한 분류·갱신 경쟁·주문 error_code-only 판정 보존을 재현·수정했고, 비정상 유효기간 캐시도 회귀 검사로 보완했다. 수정분은 실제 `claude-opus-5-5 / high`, session `3629b7d5-17db-4108-b25b-aaa18df7d75c`에서 PASS.
- 위임된 수용: 사용자 요청에 따른 Fable5.2 호출은 한도 오류로 검증하지 못했다. 사용자가 Gemini4 Argon으로 변경했고 `gemini-4-argon-high / high` 지정 세션이 코드·검사 증거·스크린샷2장에 PASS를 반환했다. 요청/초기화 모델은 일치하나 서버 모델명·effort는 결과에 별도 반환되지 않았다. [판단·한계](../verification/2026-11-15-settings.md#위임된-수용과-통합), [원격 수용 기록](https://github.com/krdn/gon-stock03/pull/31#issuecomment-6889636552).
- 통합 검증: main `21ca53a`의 [앱 CI](https://github.com/krdn/gon-stock03/actions/runs/43680325192)·[구성 CI](https://github.com/krdn/gon-stock03/actions/runs/43680325225) SUCCESS. `gon-workflow ready .` 통과. 작업 브랜치에서의 ready 실패는 main SHA 불일치였으며, 별도 main 체크아웃 및 통합 후 main에서 통과했다. #8을 completed/Done으로 갱신한 뒤 #9·#16의 native 선행 완료와 main 통합을 확인하고 Project를 Ready로 바꿨다. #14는 #11·#13 미완료로 Blocked를 유지한다.
- 미검증: 사용자 직접 화면 확인, 실제 만료·권한거부·네트워크 장애 주입, 장중 주문·체결·취소·전략. 기존 #7 실제 마스터 3962종목 검증, KIS 기간별 일봉/달력 미검증, Opus 수정분 PASS 이후 간격 보완의 직접 검증, STE/graphify 미검증은 그대로 유지한다.

## 다음 행동

이 기록의 원격 통합을 확인한 뒤, 같은 데이터·조회 단계의 [#10 시장 탐색](https://github.com/krdn/gon-stock03/issues/10)을 새 Herdr 탭·세션·경로 확인 후 시작한다. #10의 native 선행 #6·#7은 completed·main 통합이며 Project는 Ready다. #9의 실제 모의 주문 승인은 이 수용 판단에 포함하지 않는다.

## 새 세션 시작 문구

> docs/STATE.md의 다음 작업 #10과 해당 이슈·필수 자료·관련 PR/CI만 확인하고 이어가줘. #8의 위임된 수용과 사용자 직접 화면 확인·장중 전체 수용을 구분해 유지해.

## 2026-11-17 세부 동작 재점검

현재 4303 서버의 필수 값 미주입을 확인했다. KIS·HTTP 35건, 설정 E2E 12건과 빌드는 통과했다. 응답 미완료 시 버튼 잠김과 cooldown 중 재시도 UI를 추가 확인했다. [검증과 한계](../verification/2026-11-17-settings-audit.md), [복구 구현안](../plans/settings-recovery-2026-11.md). 제품 코드·실제 KIS 연결은 변경/실행하지 않았다. 후속 구현은 전체 조회 시간 제한·서버 식별·복구 UI 순서로 진행한다.
