# 작업: #19 실시간 수신·재연결·장중 실행 기반

[이슈 #19](https://github.com/krdn/gon-stock03/issues/19). 시작 main `af159134162b5aaa9aeabdbdf4f8c36ccbea4e11`(PR61), `feat/19-realtime`, `/home/gon/llm-projects/gon-stock03-worktrees/19-realtime`.

- 현재: completed/Done. 사용자 다음 작업 진행 지시에 따른 기술 수용 후 PR62 merged. 제품 `2e7ea61`, 통합 main `54754f81e831cf3a6b24085229ca68c485dc8c86`. 단위154·브라우저108·build·Argon 수정분 PASS, head CI4·main CI2 SUCCESS. 직접 사용자 육안·장중 수용은 미검증. 다음 [#22](22-strategies.md).
- 범위: 공식 모의 WebSocket·거래시간 계약 확인, 시세/체결통보 수신·중복 제거·순서 역전·끊김 후 REST 대조. 신호·주문은 기존 공통 경로에 연결하고 주문/알림/데이터 화면의 상태를 함께 갱신한다.
- 필수 읽기: AGENTS·WORKFLOW·#19, server/kis.ts·paper.ts·index.ts·engine.ts, src/pages/Trading.tsx·Operations.tsx·Workspace.tsx의 관련 심볼, src/specs.ts, tests/browser/workbench.spec.ts와 관련 회귀만 확인한다.
- 완료 조건: 지연/장외 입력 통제, 재연결 후 대조 전 신규 주문 차단, 중복 통보의 중복 주문 방지, 재시작 자동 거래 재개 없음, 긴급정지/끊김 장애 주입, 모의 도메인/TR 전용, 승인키·체결 식별값 서버 비밀주입/비노출, S05/S11/S12 상태 연결. 공식 모의 미지원은 추정 구현하지 않고 범위 조정·Blocked 근거를 기록한다.
- 준비 확인: 공식 자료를 실제 확인하고 docs/start-context.json에 이번 조사만 추가, implementation-ready 통과 후 구현. 신규 초기화 없음. 인증 설정은 docs/INFISICAL.md를 따르며 비밀값을 출력하지 않는다.
- 검증: fake transport/격리DB·브라우저·모바일·지정 독립 리뷰·최신 head CI. 실제 연결·체결·장중 복구는 fixture 성공으로 대신하지 않는다. STE 기준파일 부재는 미검증으로 기록한다.
- 실행 금지: 실제 KIS 업무API/WebSocket 연결·주문·취소·예약·외부알림. 기존 고정 승인·시간/금액/횟수 제한, 웹 취소/정정409, 실전 전환 금지를 유지한다. .local 원장/백업/보유를 읽거나 재설정하지 않는다.
- 소유권: Herdr 새 탭의 실제 pwd·CODEX_THREAD_ID·화면을 확인한 후 t7k가 시작 메시지로 넘긴다. 그 전에는 준비만 수행한다. 인계 후 부모는 제품 편집을 중단한다. 추가 에이전트/부모 검증 재위임 없음.
- 리뷰: /home/gon/.codex/guides/external-review.md·중앙 설정을 확인한다. Claude Fable5.2 또는 gemini-4-argon-high만. 중앙 wrapper 기본 모델은 다르므로 자동 대체 금지. agy models 확인 후 직접 --effort high 가능. 요청/init 모델 일치와 서버 내부 모델/effort 미검증을 구분한다. #14 리뷰를 #19 검증으로 재사용하지 않는다.
- 전달: 변경·검증/미검증·실패·다음 행동을 작업 파일/STATE·검증 기록에 저장하고 커밋·푸시·초안 PR·최신 head CI 확인. #19 수용·통합 전 completed/Done·#22/#25 선행 해제 금지.

보존: root의 오래된 feat/12-trading, 다른 worktree, .codex·graphify-out·node_modules 및 전역 hook 설정. 강제푸시·보호 우회 없음. 표준 handoff가 기존 미추적 graphify-out 때문에 거부되면 삭제/숨김/커밋하지 말고 실제 보존 상태와 푸시 범위를 명시해 원격에 기록한다.

세션: Herdr 탭 `tb15271d00c65ed94d14a9a4fc101b1a36` / 터미널 `t7m`, Codex `01a1e3db-402a-7b90-b865-fad44630ae2a`. 실제 화면·pwd·세션 ID 일치 및 준비 응답을 t7k가 확인했다. t7k의 명시 소유권 메시지를 받고 구현을 시작했다. 부모 편집 중단·추가 에이전트 금지를 유지한다.

후속: #19 기술 수용·통합 완료, #22 선행 해제. #25는 #22와 별도 장중 수용 대기. 이번 작업에서 실제 KIS 연결·인증·주문·취소는 하지 않았다.

전달: 제품 커밋을 origin/feat/19-realtime에 푸시했다. 표준 handoff dry-run은 기존 미추적 graphify-out 때문에 exit1이었다. 해당 폴더를 삭제·숨김·커밋하지 않고 기록 파일 고정 링크와 CI 결과를 #19에 직접 남긴다.
