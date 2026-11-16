# 작업: #22 KIS 모의 전략 스튜디오

[이슈 #22](https://github.com/krdn/gon-stock03/issues/22). 시작 main `54754f81e831cf3a6b24085229ca68c485dc8c86`(PR62), `feat/22-strategies`, `/home/gon/llm-projects/gon-stock03-worktrees/22-strategies`.

- 현재: 전용 worktree·Herdr 탭 준비 완료. main CI2 SUCCESS, #19/#21 completed·통합·Done 확인. t7m의 명시적 소유권 인계 전 구현 금지.
- 범위: 검증된 실시간 입력과 공통 주문 경로에 KIS 모의 전략 연결. 주문 없는 평가도 신호·차단 이유 기록. S01 실행 전략 집계와 위험관리 KIS 전략 경로 재검증 포함.
- 필수 읽기: AGENTS·WORKFLOW·#22, `src/pages/Research.tsx`, `server/engine.ts`·`paper.ts`·`realtime.ts`, `src/pages/Workspace.tsx`·`Operations.tsx`, `src/specs.ts`, `tests/browser/workbench.spec.ts`와 관련 회귀. 전체 이력 재독 없음.
- 완료 조건: 동일 이벤트 중복 주문 없음, 정지/재시작 후 신규 주문 없음, 전략 revision·신호·주문 ID 연결, 수동 보유 매도 정책, 공통 금액·손실·종목 한도·긴급정지, S01 상태/차단 이유, 모의 도메인/TR·승인 범위 고정, 행동/API/실패/완료 계약과 회귀 갱신.
- 선행: #19(PR62)와 #21(PR41)의 completed·main 통합·Project Done을 원격에서 확인한다. #25 실제 장중 통합 수용은 후속이며 fixture로 대신하지 않는다.
- 준비: 공식 자료를 확인해 `docs/start-context.json`에 이번 조사만 추가하고 `gon-workflow implementation-ready .` 통과 후 구현. 신규 초기화 없음.
- 검증: fake transport·메모리/임시DB, 단위·브라우저·모바일·build, 지정 독립 리뷰, 최신 head CI. `claude-fable-5-2-high` 또는 `gemini-4-argon-high`만. 외부 리뷰 지침·중앙 설정과 요청/init 반환 모델 확인. 자동 대체·effort 승격·#19 리뷰 재사용 없음. 실제 서버 내부 모델/effort 미검증은 구분한다.
- 실행 금지: 실제 KIS 업무API/WebSocket 연결·인증·주문·취소·예약·외부알림. 기존 고정 승인·1회/120초 제한·웹 정정취소409·실전 전환 금지 유지. 이번 요청은 개발·검증이며 연속 전략 실제 전송 승인이 아니다.
- 보존: 다른 worktree, .local 원장/백업/보유, .codex·graphify-out·node_modules·전역 hook. 강제푸시·보호 우회 없음. 추가 에이전트·부모에게 검증 재위임 없음.
- 전달: 작업/STATE·검증/실패/미검증을 저장하고 커밋·푸시·초안 PR·CI 확인. 사용자 수용·통합 전 completed/Done·#25 해제 금지. 표준 handoff가 graphify-out 때문에 거부되면 폴더를 보존하고 고정 링크와 실패를 원격 기록한다.

세션 준비: Herdr 탭 `tb549e07dd4cb4400b2e67f6eb549093b2`, 터미널 `t7n`. 새 세션 `01a1e468-8ee9-7970-88cd-b192f2e2bf0d`의 실제 pwd·ID·Herdr 화면을 t7m이 확인했다. 선행/main CI 확인 뒤 별도 시작 메시지로 소유권을 넘긴다. 인계 뒤 부모는 제품 편집을 중단한다.

기타 점검: #2에 SQLite DB/WAL/SHM 권한과 정적 파일 누락 시 절대경로 노출에 대한 기존 비차단 P2가 남았다. #22의 필수 구현과 섞지 말고 기존 #2 기록에서 후속 처리한다. #2/#3/#1 상위 이슈를 일괄 완료하지 않는다.
