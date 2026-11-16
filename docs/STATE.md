# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- **현재:** [#25 장중 통합 실증](tasks/25-validation.md)은 준비 완료·Blocked. 남은 개발 결함 이슈는 없으며 실제 관측·사용자 화면 수용이 남았다. 별도 장중 시작 전 실행하지 않는다.
- **수용·통합:** 사용자가 PR68 통합·#65 완료를 명시 승인했다. [#65](tasks/65-static-errors.md)의 PR68은 main `50b958db9c8ee63f72e164ace5f3576b8fddfbfb`에 통합했다. PR head `22575b0`의 CI4·단위189·브라우저113·build·지정 Argon 리뷰 PASS. [검증](verification/2026-11-16-static-errors.md). #64 PR67도 통합 완료다. 실제 장중 수용은 아니다.
- **다음:** [실증 준비안](verification/2026-11-16-validation-prep.md)의 별도 시작 조건과 수용 대상 SHA를 확인한다. 현재 요청은 KIS 실행 승인이 아니다. 최종 원격 CI·완료 기록은 #65/#25 최신 댓글을 확인한다. #1/#2/#3/#25를 일괄 완료하지 않는다.
- **미관측:** [삼성전자 한 건](verification/2026-11-16-samsung-paper-run.md)은 접수·REST 대조·취소·체결0/잔량0만 입증한다. 실제 체결·부분체결·불명복구·연속전략·전체 화면 사용자 수용은 남았다.
- **거래 제한:** 실제 KIS 업무API/WebSocket·인증·주문·취소·예약·외부알림 금지. fake transport·메모리/임시DB만. 고정1회/120초·웹 정정취소409·실전 전환 금지 유지. 다음 한정 실행도 별도 장중 시작과 사용자 모바일 취소 조건을 따른다.
- **보존:** 기존 원장·보유·백업·다른 worktree·.codex·graphify-out·기존 node_modules·전역 hook. 강제푸시·보호 우회·추가 에이전트·부모 검증 재위임 없음.
- **리뷰:** 외부 리뷰 지침·중앙 설정 확인 후 `claude-fable-5-2-high` 또는 `gemini-4-argon-high`만. 자동 대체·effort 승격·다른 이슈 리뷰 재사용 금지. 요청/init과 서버 내부 모델/effort 독립 미검증을 구분한다.
- **세션:** 컨텍스트 잔여132,649토큰을 확인해 현재 세션에서 통합·상태 정리를 진행했다. 실행 가능한 새 독립 작업이 없어 새 Herdr 탭/세션은 만들지 않았다.
- **재개:** AGENTS·WORKFLOW·현재 작업·필수 자료·관련 원격 이슈/PR/CI만. 신규 초기화 없음. STE 기준파일 부재·기존 번들 경고 유지.
