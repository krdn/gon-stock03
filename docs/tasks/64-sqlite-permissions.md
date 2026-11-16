# 작업: #64 SQLite 원장 파일 권한 보호

[이슈 #64](https://github.com/krdn/gon-stock03/issues/64) · 상위 #2 · 후속 실증 #25. 기준 main `dae458093b664d872a23672f4b65aa9b229aa10c`(PR66). 브랜치 `fix/64-sqlite-permissions`, 전용 worktree `64-sqlite-permissions`.

## 목표와 경계

기존0755 데이터 디렉터리·umask022에서도 본 DB/WAL/SHM이 생성·재열기 동안 다른 사용자에게 읽히지 않도록 최소 수정하고 격리 회귀로 입증한다. 실제 원장·백업을 대상으로 chmod나 마이그레이션을 실행하지 않는다.

- 최신 사용자 지시: 다음 작업 상태를 점검하고 필요하면 새 Herdr 탭/세션에서 진행. #64를 다음 독립 작업으로 선택했다. #65 정적 경로 노출은 별도 다음 작업이다.
- #25 준비는 PR66으로 통합했다. 실제 체결·부분체결·연속전략·장애복구·직접 사용자 화면 수용은 미관측이며 #25 Blocked를 유지한다. #1/#2/#3도 일괄 완료하지 않는다.
- 허용: 공식 공개 문서 확인, 코드·테스트 최소 수정, fake transport·메모리/임시 DB 회귀, 지정 외부 검토, 커밋·푸시·초안 PR·CI·이슈 기록.
- 금지: 실제 KIS 업무API/WebSocket·인증·주문·취소·예약·외부 알림, 기존 원장/보유/백업 재설정, 실전 전환, 고정1회/120초 승인을 연속전략으로 확대.
- 보존: 다른 worktree·.local·.codex·graphify-out·기존 node_modules·전역 hook. 강제푸시·보호 우회·추가 에이전트·부모 검증 재위임 없음.

## 먼저 읽을 자료

AGENTS·WORKFLOW, 이슈 #64 최신 본문, [#25 P2 재현](../verification/2026-11-16-validation-prep.md#2-p2-격리-재현), `server/index.ts:8-13`, `server/store.ts` 생성자, 관련 저장 테스트와 `package.json`만 먼저 읽는다. #2의 P2 원문, PR66·main CI를 대조한다. 전체 과거 작업/대화 재독이나 신규 초기화는 하지 않는다.

## 다음 행동

1. main CI 및 소유권·현재 경로를 확인한다. 공식 Node/SQLite 파일·권한 자료 확인→`docs/start-context.json`에 근거 추가→`gon-workflow implementation-ready .` 후 구현한다.
2. 기존0755 디렉터리·umask022/077, 신규/기존 DB와 보조 파일, 재열기·실패 경로를 임시 경로에서 재현한다. 생성 시점 노출도 고려하고 DB 생성 후 chmod만으로 충분하다고 가정하지 않는다.
3. 원장/백업·소유권 보존을 지키는 최소 수정을 선택한다. 정상 저장·재시작·안전 실패를 회귀로 확인한다. 인접 #65 수정은 포함하지 않는다.
4. 완료 경계에서 `/home/gon/.codex/guides/external-review.md`와 중앙 설정/dry-run을 확인한다. `claude-fable-5-2-high` 또는 `gemini-4-argon-high`만 사용하고 자동 대체·effort 승격·다른 이슈 리뷰 재사용을 금지한다. 요청/init과 서버 내부 모델/effort 독립 확인을 구분한다.
5. 변경·검증/실패·미검증을 기록하고 커밋/푸시·초안 PR·CI·#64 전달을 완료한다. 사용자 수용·통합 전 #64를 완료로 표시하지 않는다. #25 실제 실증은 시작하지 않는다.

## 인수인계

부모 t7r의 컨텍스트 잔여량 조회값은140,559토큰이었다. 컨텍스트 부족 때문이 아니라 작업 경계를 나누기 위해 새 세션을 사용한다. 새 세션은 사용한도를 초기화하지 않는다.

Herdr 탭 `tbd76b499fb01e26bf0000f1afe2a02d03` / 터미널 `t7s`. 부모 t7r의 별도 메시지로 단독 소유권을 인수하고 구현을 시작했다. 새 Codex `01a1e4b0-31d2-7920-b7ab-e70b917e5e66`가 pwd/브랜치/ID를 실제 출력했다. 부모가 Herdr 실제 화면에서 같은 경로·ID·Ready와 활성 탭을 확인했다. main [앱 CI](https://github.com/krdn/gon-stock03/actions/runs/43882613633)·[구성 CI](https://github.com/krdn/gon-stock03/actions/runs/43882613847) SUCCESS 확인. 인계 뒤 부모는 저장소 편집을 중단한다.

STE 기준파일 부재와 기존 번들 경고는 유지한다. #25의 단위166·브라우저113·Argon PASS는 기준선 증거이며 #64 수정 검증을 대체하지 않는다.

전달 문서 상대 링크·`git diff --check` PASS. STE는 기준파일 부재로 exit2다. 단순 인계 문서에 별도 모델 리뷰는 추가하지 않았으며 #64 제품 수정 리뷰는 새 세션에서 수행한다.

## 구현·전달 상태

Store의 생성 전 DB/WAL/SHM0600 보호와 실패 시 중단을 구현했다. [검증 기록](../verification/2026-11-16-sqlite-permissions.md): RED10건, 저장 회귀17/17·전체182/182·build PASS. 생성 시점은 임시 서버 strace로 확인했다. 준비 head 앱43883174622·구성43883174696 SUCCESS도 재확인했다. 지정 Argon 리뷰 PASS(요청/init 일치, 서버 내부 모델/effort 독립 미검증). STE 기준파일 부재 exit2. 초안 PR67로 전달했으며 최종 head CI 결과는 PR Checks와 #64 전달 댓글이 기준이다. 사용자 수용·통합 전 #64 open과 #25 Blocked를 유지한다.

구현 커밋 `2edfe9d654b1c7f9e6880c23613419008e777a98`을 원격과 대조했다. [초안 PR67](https://github.com/krdn/gon-stock03/pull/67), base main. 최종 기록 커밋은 제품 코드를 변경하지 않는다. PR 생성 connector403 후 중복 없음 확인과 기존 gh로 생성했다. 기존 커밋 훅이 생성한 미추적 `graphify-out/`은 보존했으며 추적 변경과 구분한다. 다음 단계는 최신 head CI와 사용자 수용·통합 판단이다. #65로 자동 확장하지 않는다.

## 통합 후 상태

사용자 최신 다음 작업 진행 지시로 PR67을 squash merge했다. main `961f470036eafbadce5d18d9b772705f1f4c5ca3`, 기존 head CI4 SUCCESS·미해결 리뷰 스레드0 확인. 다음 독립 작업은 [#65](65-static-errors.md)다. main 앱43885535648·구성43885535909 SUCCESS, 단위182·브라우저113 PASS 확인. #64 종료 기록은 이슈에 남기며 실제 장중 수용과 구분한다.
