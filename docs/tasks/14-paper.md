# 작업: #14 KIS 모의 매매 화면

[이슈 #14](https://github.com/krdn/gon-stock03/issues/14). 시작 main `46593c56abc5f6958f21e163bdd8d4758b79c2b6`, `feat/14-paper`, `/home/gon/llm-projects/gon-stock03-worktrees/14-paper`.

- 현재: 소유권 인계 후 #14 In Progress. 원격 선행 completed·PR60/main CI 성공 재조회. 구현과 격리 검증을 진행하며 [검증 기록](../verification/2026-11-16-paper.md)에 결과를 남긴다.
- 범위: /paper의 KIS 환경·접수/부분체결/체결/취소/불명 표시, 요청 ID 보존·재전송 방지, 조회 중 입력 보존, #12/#13의 종목·원장 맥락 연결. 기존 C03 안전장치·일반 웹 취소/정정409 차단을 유지한다.
- 필수 읽기: AGENTS·WORKFLOW·#14, src/pages/Paper.tsx, server/paper.ts의 저장/조회/불명복구, src/specs.ts paper, tests/browser/workbench.spec.ts 및 관련 paper 회귀. 기존 #9 실증 전체 로그를 재독하지 않고 필요하면 검증 문서의 해당 절만 확인한다.
- 완료 조건: 이슈 계약을 확인해 미구현·회귀 위험을 구분한다. fake transport/격리 DB의 단위·브라우저·모바일·지정 리뷰·CI 증거를 남긴다. 실제 조회 대조·부분체결·장중 복구는 #25와 구분하며 fixture PASS로 대신하지 않는다.
- 실행 금지: 실제 KIS 업무API·주문·취소·예약·외부알림. .local 원장·백업·보유를 읽거나 재설정하지 않는다. 기존 고정 승인·장중 시간창·금액/횟수·웹 취소 차단을 임의로 풀지 않는다.
- 준비 확인: 공식 자료 실제 확인 후 docs/start-context.json에 이번 확인만 추가하고 implementation-ready를 구현 전에 실행한다. 신규 프로젝트 초기화는 하지 않는다.
- 리뷰: /home/gon/.codex/guides/external-review.md와 중앙 설정 확인. 사용자 지정 Claude Fable5.2 또는 Gemini4Argon만 사용. 중앙 wrapper 기본값은 다르므로 자동 대체 금지. agy models의 gemini-4-argon-high를 확인한 직접 --effort high 호출 가능. 서버 내부 모델·effort 독립 확인 한계와 STE 부재 미검증을 기록한다.
- 소유권: 새 Herdr 탭의 실제 pwd·CODEX_THREAD_ID·화면 연결 확인 뒤 후속 시작 메시지로 넘긴다. 그 전에는 제품 수정 금지. 부모는 인계 후 제품 편집·검증 재위임을 하지 않는다. 추가 에이전트 생성 금지.
- 전달: 구현·검증 후 작업 파일/STATE·검증 기록을 갱신하고 커밋·푸시·초안 PR·최신 head CI 확인. #14 자체 수용/통합 전 completed/Done·#19 선행 해제를 주장하지 않는다.

PR60 기술 수용·통합과 #13/#18 완료는 이번 사용자 다음 작업 진행 지시에 따른 처리다. 직접 화면 관찰이나 실제 KIS 실행 승인을 뜻하지 않는다. #19/#22/#25는 계속 Blocked다. root와 다른 worktree, .codex·graphify-out·node_modules 및 전역 hook 설정을 보존한다.

구현: 가격/수량 보존·늦은 시세 응답 폐기, 요청 ID/내용의 탭 저장 및 미확인 차단, 서버 저장 원장 대조, 명시적 불명 복구 확인. 기존 서버 안전장치는 변경하지 않았다. 단위137 PASS·build PASS·전체 브라우저103 PASS(최종 paper8 재확인 PASS). 지정 Argon/high 리뷰 PASS(P0–P3 지적0), 요청/init 모델 일치·서버 내부 모델/effort 미검증. 커밋·초안 PR/CI 전달 단계이며 사용자 수용·통합은 남아 있다.
