# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- **현재 구현:** [#71 연결·설정 복구](tasks/71-settings-recovery.md)의 설계 1~3단계와 STE 복구를 완료했다. [PR73](https://github.com/krdn/gon-stock03/pull/73)은 main `341825b`에 통합했다. 단위197·브라우저116·빌드·지정 Argon 리뷰·PR CI4 PASS. [검증](verification/2026-11-17-settings-recovery.md).
- **연결 검증 완료:** #71은 2026-11-17 실제 Infisical 주입·모의 인증·잔고 전체 조회를 확인했다. 사용자는 후속 순서에 동의하고 #71 마감을 지시했다. [실행 근거](https://github.com/krdn/gon-stock03/issues/71#issuecomment-6940359209). #75의 보존된 구현을 최신 main과 결합 검증한 뒤 #25로 진행한다.
- **병행 작업 보존:** [#75 시장가 모의 1회 경로](https://github.com/krdn/gon-stock03/issues/75)는 `feat/75-market-paper` 별도 worktree에서 착수됐다. 미커밋 제품 변경이 있으므로 새 세션에서 중복 구현하지 않는다. [PR74](https://github.com/krdn/gon-stock03/pull/74)는 #25 실행 기록이며 제품 구현과 구분한다.
- **별도 실증:** [#25 장중 통합 실증](tasks/25-validation.md)은 준비 완료·Blocked. 실제 관측·장중 흐름 수용이 남았다. 신규 연결 복구 #71과 분리한다. [15개 화면의 초기/DEMO 표시·배치](verification/2026-11-17-ui-acceptance.md)는 사용자 수용을 기록했다. 별도 장중 시작 전 실행하지 않는다.
- **수용·통합:** 사용자가 PR68 통합·#65 완료를 명시 승인했다. [#65](tasks/65-static-errors.md)의 PR68은 main `50b958db9c8ee63f72e164ace5f3576b8fddfbfb`에 통합했다. PR head `22575b0`의 CI4·단위189·브라우저113·build·지정 Argon 리뷰 PASS. [검증](verification/2026-11-16-static-errors.md). #64 PR67도 통합 완료다. 실제 장중 수용은 아니다.
- **장중 실증 조건:** [실증 준비안](verification/2026-11-16-validation-prep.md)의 별도 시작 조건과 수용 대상 SHA를 확인한다. 현재 요청은 KIS 실행 승인이 아니다. 최종 원격 CI·완료 기록은 #65/#25 최신 댓글을 확인한다. #1/#2/#3/#25를 일괄 완료하지 않는다.
- **미관측:** [삼성전자 한 건](verification/2026-11-16-samsung-paper-run.md)은 접수·REST 대조·취소·체결0/잔량0만 입증한다. 실제 체결·부분체결·불명복구·연속전략·실제 장중 화면 흐름 수용은 남았다.
- **실행 경계:** #71의 주입·재시작·모의 인증·잔고 조회는 사용자의 명시 승인으로 완료했다. 주문·취소 승인을 포함하지 않는다. #75는 해당 작업의 1회 승인·장중·사용자 모바일 취소 조건을 대조한다. 실전 전환·임의 재주문·API 취소·예약·외부알림은 금지한다.
- **보존:** 기존 원장·보유·백업·다른 worktree·.codex·graphify-out·기존 node_modules·전역 hook. 강제푸시·보호 우회·추가 에이전트·부모 검증 재위임 없음.
- **리뷰:** 외부 리뷰 지침·중앙 설정 확인 후 `claude-fable-5-2-high` 또는 `gemini-4-argon-high`만. 자동 대체·effort 승격·다른 이슈 리뷰 재사용 금지. 요청/init과 서버 내부 모델/effort 독립 미검증을 구분한다.
- **세션:** #71 구현 소유권은 새 Herdr 세션 `01a1e52f-2eba-7a40-9aa7-4ffac600c0cd`에 인계됐다. 부모의 탭·terminal t7y·cwd·Ready 관측 보고와 이 세션의 resume 확인을 [작업 기록](tasks/71-settings-recovery.md)에 남겼다. 제품 구현·검증은 이 세션이 소유한다.
- **재개:** AGENTS·WORKFLOW·현재 작업·필수 자료·관련 원격 이슈/PR/CI만. 신규 초기화 없음. [STE 기준](conventions/ste100-writing.md) 도입 후 변경 문서 검사 PASS. 기존 번들 경고 유지.
