# 작업: #65 정적 파일 오류의 내부 경로 보호

[이슈 #65](https://github.com/krdn/gon-stock03/issues/65) · 상위 #2 · 후속 실증 #25. 기준 main `961f470036eafbadce5d18d9b772705f1f4c5ca3`(PR67). 브랜치 `fix/65-static-errors`, 전용 worktree `65-static-errors`.

## 목표와 경계

정적 파일 누락·읽기 실패 응답에서 ENOENT 절대 경로를 제거하고 적절한 HTTP 상태를 반환한다. dist/index.html·assets·project-map의 누락과 HEAD를 격리 검증하며 정상 파일·SPA·API 오류 계약을 보존한다.

- 사용자 최신 지시: 컨텍스트·다음 작업 점검 후 필요하면 새 Herdr 탭/세션에서 진행. #64 검증·통합 뒤 다음 독립 작업으로 #65를 선택했다.
- 허용: 공식 공개 자료 확인, 최소 코드·테스트 수정, fake transport·메모리/임시 DB 검증, 지정 리뷰, 커밋·푸시·초안 PR·CI·#65 기록.
- 금지: 실제 KIS 업무API/WebSocket·인증·주문·취소·예약·외부 알림. 고정1회/120초 승인을 연속전략으로 확대하지 않는다. #25 Blocked와 #1/#2/#3 open을 유지한다.
- 보존: 기존 원장·보유·백업·다른 worktree·.codex·graphify-out·기존 node_modules·전역 hook. 강제푸시·보호 우회·추가 에이전트·부모 검증 재위임 없음.

## 먼저 읽을 자료

AGENTS·WORKFLOW, #65 최신 본문, [#25 P2 재현](../verification/2026-11-16-validation-prep.md#2-p2-격리-재현), `server/http.ts`의 정적 파일·HEAD·공통 catch 처리, `tests/http.test.ts`와 관련 정적 경로 테스트, `package.json`만 먼저 읽는다. PR67·main CI를 대조한다. 전체 과거 대화·작업 기록은 다시 읽지 않는다.

## 구현·검증 및 다음 행동

단독 소유권을 인수해 정적 readFile 경계에만 오류 처리를 추가했다. ENOENT/ENOTDIR은404, 다른 읽기 실패는500 고정 문구다. [검증 기록](../verification/2026-11-16-static-errors.md)에 재현·공식자료·실패·리뷰 한계를 남겼다.

- 신규 격리7·전체 단위189·브라우저113·build PASS. 실제 broker 호출0, 정상 SPA/정적 파일/API 오류 보존.
- 지정 `gemini-4-argon-high`/high 요청·init 일치, SUCCESS·No findings. 서버 내부 모델/effort 독립 미검증.
- 준비 브랜치 앱43886129383·구성43886129482 SUCCESS를 재확인했다.
- STE 기준 문서 부재 exit2·기존 번들 경고 유지. 최초 tsx 부재는 npm ci 후 해소했다.
- 전달: 수정 커밋 `de90d4c`를 푸시하고 [초안 PR68](https://github.com/krdn/gon-stock03/pull/68)을 생성했다. GitHub 연결 도구403 후 중복 없음 확인·기존 gh 경로로 생성했다.
- 다음: PR68 최종 head의 CI 결과를 #65 전달 댓글에 기록한 뒤 사용자 수용·통합 판단 대기. 사용자 수용·통합 판단 전 초안과 #65 open을 유지한다. #25 Blocked·#1/#2/#3 open 유지. 자동 merge·실증 실행 없음.

## 기준선과 인수인계

#64 PR67 head `4a3221d`의 CI4·단위182·브라우저113·build·지정 Argon 리뷰 PASS를 확인하고 사용자 다음 작업 진행 지시로 통합했다. [#64 검증](../verification/2026-11-16-sqlite-permissions.md)은 #65 제품 수정의 검증을 대체하지 않는다.

부모 t7s의 컨텍스트 조회값은136,663토큰이다. 부족 때문이 아니라 작업 경계를 분리하려고 새 세션을 사용한다. 새 세션은 누적 사용한도를 초기화하지 않는다.

Herdr 탭 `tb17b42247bd18c9d2a3e6736ff3e8d6e0` / 터미널 `t7t`를 생성했다. 준비 단계에서는 별도 소유권 메시지 전 구현하지 않았고, 이후 t7s의 명시 인계로 작업을 시작했다. 새 Codex `01a1e4c0-23cc-7be1-9848-0428557395ab`가 실제 pwd/브랜치/ID를 출력했다. 부모가 Herdr 실제 화면에서 같은 경로·ID·Ready와 활성 탭을 확인했다. main [앱 CI](https://github.com/krdn/gon-stock03/actions/runs/43885535648)·[구성 CI](https://github.com/krdn/gon-stock03/actions/runs/43885535909) SUCCESS, 로그의 단위182·브라우저113 PASS를 확인했다. 인계 뒤 부모는 저장소 편집을 중단한다.

STE 기준파일 부재·기존 번들 경고를 유지한다. 기존 commit hook이 만든 graphify-out은 보존하고 인수인계 도구가 이를 미커밋 변경으로 거부하면 실제 상태를 명시해 직접 이슈에 기록한다.

전달 문서 상대 링크·`git diff --check` PASS. STE는 기존 기준파일 부재 exit2. 단순 인계 문서에 추가 모델 리뷰는 붙이지 않으며 #65 제품 수정 리뷰는 새 세션에서 별도로 수행한다.
