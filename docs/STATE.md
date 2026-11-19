# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- **#113 설정 UX:** [4303 실측과 회귀 검증](tasks/113-settings-ux.md). 4303에 계좌 인증과 잔고 갱신 동선을 적용하고, 미주입 복구 및 기본 개발 서버 자동 주입을 검증했다.
- **#12 실제 시세:** [트레이딩 연동](tasks/12-trading.md#실제-주가-연동). 기본 화면은 KIS 실제 현재가·일봉, DEMO는 명시 탭. [실제 응답·검증](verification/2026-11-17-trade-live.md). 현재 작업 폴더에서 Infisical 주입 후 4303/4304 실행, 동일 원장 보존. 단위216·브라우저150 PASS. PR90 통합. 아래 #25에서 일봉 전환 장면 수용.
- **#20 후속:** [관심종목 수정](tasks/20-watchlist.md#2026-11-17-후속-화면-수정). 최초 연결 실패 예시목록·상세 재선택·링크 대비 수정, 4303 로컬 적용. [검증·원본 로컬 변경](verification/2026-11-17-watchlist-fixes.md)과 main 통합은 구분한다.
- **전체 현황:** [완료·잔여 작업과 재개 안내](verification/2026-11-17-consolidated-status.md). 구현·격리검증·실제 관측·사용자 수용을 구분한다.
- **#75 완료:** [11월 18일 실증](tasks/75-market-paper.md#11월-18일-장중-결과). 삼성전자 모의 시장가 1주 전량 체결, 잔량 0주, 보유 1주에서 2주로 증가. 해당 승인은 소진됐다. 다음 작업은 #25 실시간 수신·복구 검증이다.
- **#92 실시간 경로:** PR93 통합 SHA에서 두 구독 승인·실제 시세·REST 대조 확인. [재시도 소진 및 복구 관측](tasks/92-ws.md#통합-sha-장중-재검증).
- **#120·#122 매매 설정:** [Opus 설계 판정·편집 동선 및 실행 방법](tasks/122-trading-settings.md). 일반 한도 저장과 다음 한정 실행/전략 계약의 고정·명시적 기동을 구분한다. 서버 정책 확장은 #123.
- **#116 모의 잔량 취소:** [화면 조작·일반 모의 제약·검증](tasks/116-paper-cancel.md).
- **#106·#107:** [정상 경로의 지연·취소 경합 연구](tasks/106-strategy-preflight.md) · [분리된 모의 테스트 실행기](tasks/107-vts-runner.md).
- **#25 장중 실증 · Blocked:** [11월 19일 정상 전략 2주 접수·체결](verification/2026-11-19-strategy.md). 실제 부분체결 중 잔량 취소 경합만 남았다. [다음 정규장 재개 문구·완료 기준](tasks/25-validation.md#다음-정규장-재개). [장중 주문·응답 유실 복구·전략 신호](verification/2026-11-18-live-transitions.md). 실제 PC·모바일 주문 행의 전송 중→접수→체결, 별도 실제 주문의 통제된 응답 유실→모바일 대조→복구를 확인했다. [기존 화면 4개 수용·14:02 주문 없는 복구](verification/2026-11-18-dynamic-ui.md)와 [격리 재생·미관측 조건](tasks/25-validation.md)을 함께 본다.
- **완료:** #71 연결·설정, #64/#65 안전성, #80 접속키 발급·앱 적용, #83 Graphify 추적·자동 전달은 통합했다. 15개 화면 수용은 초기/DEMO 표시·배치에 한정한다.
- **실행 환경:** 17일19:17 현재 `/home/gon/llm-projects/gon-stock03`에서 4303/4304를 복구했다. 기존 `.local/workspace.sqlite`를 백업 후 사용한다. 주문 승인·WS 접속키 미주입, 구독·전략 정지. [재개 점검](tasks/75-market-paper.md#장외-재개-점검)을 확인한다.
- **통합·정리:** [#85](tasks/85-consolidation.md), [브랜치 manifest](verification/2026-11-17-branch-consolidation.json). PR86으로 모든 기존 브랜치 이력을 main에 연결하고 초기 작업 브랜치29개를 정리했다. 원본18개 변경·fixture8개·작업 폴더를 보존했다. 구 worktree Graphify 재생성110개와 최종 검증은 #85 기록을 확인한다.
- **보존·금지:** 기존 원장·보유·백업·작업 폴더·.codex·node_modules·Graphify 파일을 보존한다. 원장 초기화·ID 자동 재발급·예약·자동 재개·실전 전환·강제푸시·보호 우회 없음.
- **리뷰·재개:** 필요한 구현 경계에서 지정 Fable5.2/high 또는 Argon/high만 사용한다. 이 파일·선택 작업·필수 자료·관련 이슈/PR/CI부터 읽는다. 신규 초기화와 전체 과거 기록 재독은 하지 않는다. [재개 명령과 전달 문구](verification/2026-11-17-consolidated-status.md#새-세션-시작)를 따른다.
