# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- **현재 구현:** [#71 연결·설정 복구](tasks/71-settings-recovery.md). 설계 1~3단계 구현 완료, [PR73](https://github.com/krdn/gon-stock03/pull/73) OPEN·미통합. 구현 `40e4f86`의 단위197·브라우저116·빌드·지정 Argon 리뷰·CI4 PASS. [검증](verification/2026-11-17-settings-recovery.md). 실제 연결·사용자 수용은 별도다.
- **별도 실증:** [#25 장중 통합 실증](tasks/25-validation.md)은 준비 완료·Blocked. 실제 관측·장중 흐름 수용이 남았다. 신규 연결 복구 #71과 분리한다. [15개 화면의 초기/DEMO 표시·배치](verification/2026-11-17-ui-acceptance.md)는 사용자 수용을 기록했다. 별도 장중 시작 전 실행하지 않는다.
- **수용·통합:** 사용자가 PR68 통합·#65 완료를 명시 승인했다. [#65](tasks/65-static-errors.md)의 PR68은 main `50b958db9c8ee63f72e164ace5f3576b8fddfbfb`에 통합했다. PR head `22575b0`의 CI4·단위189·브라우저113·build·지정 Argon 리뷰 PASS. [검증](verification/2026-11-16-static-errors.md). #64 PR67도 통합 완료다. 실제 장중 수용은 아니다.
- **장중 실증 조건:** [실증 준비안](verification/2026-11-16-validation-prep.md)의 별도 시작 조건과 수용 대상 SHA를 확인한다. 현재 요청은 KIS 실행 승인이 아니다. 최종 원격 CI·완료 기록은 #65/#25 최신 댓글을 확인한다. #1/#2/#3/#25를 일괄 완료하지 않는다.
- **미관측:** [삼성전자 한 건](verification/2026-11-16-samsung-paper-run.md)은 접수·REST 대조·취소·체결0/잔량0만 입증한다. 실제 체결·부분체결·불명복구·연속전략·실제 장중 화면 흐름 수용은 남았다.
- **거래 제한:** 실제 KIS 업무API/WebSocket·인증·주문·취소·예약·외부알림 금지. fake transport·메모리/임시DB만. 고정1회/120초·웹 정정취소409·실전 전환 금지 유지. 다음 한정 실행도 별도 장중 시작과 사용자 모바일 취소 조건을 따른다.
- **보존:** 기존 원장·보유·백업·다른 worktree·.codex·graphify-out·기존 node_modules·전역 hook. 강제푸시·보호 우회·추가 에이전트·부모 검증 재위임 없음.
- **리뷰:** 외부 리뷰 지침·중앙 설정 확인 후 `claude-fable-5-2-high` 또는 `gemini-4-argon-high`만. 자동 대체·effort 승격·다른 이슈 리뷰 재사용 금지. 요청/init과 서버 내부 모델/effort 독립 미검증을 구분한다.
- **세션:** #71 구현 소유권은 새 Herdr 세션 `01a1e52f-2eba-7a40-9aa7-4ffac600c0cd`에 인계됐다. 부모의 탭·terminal t7y·cwd·Ready 관측 보고와 이 세션의 resume 확인을 [작업 기록](tasks/71-settings-recovery.md)에 남겼다. 제품 구현·검증은 이 세션이 소유한다.
- **재개:** AGENTS·WORKFLOW·현재 작업·필수 자료·관련 원격 이슈/PR/CI만. 신규 초기화 없음. STE 기준파일 부재·기존 번들 경고 유지.
