# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

프로젝트를 처음 볼 때는 [한 장 그림](architecture/figures/gon-stock-overview.png)에서 KIS 모의 주문과 DEMO 연습 흐름을 따라간다. [구조도 작업 #110](https://github.com/krdn/gon-stock03/issues/110)

- **2차 설계 시작 · [1차 화면 함께 보기](tasks/143-v1-guide.md).** [검토 #143](https://github.com/krdn/gon-stock03/issues/143)에서 화면별 질문과 수정 의견을 모은다. [프로젝트 보드](https://github.com/users/krdn/projects/25)
- **지난 주문 UX · [#147 작업](tasks/147-orders-ux.md).** 첫 주문 결과와 KIS 확인 시각, 보기 복원, 식별자 상세·검색. [진행 이슈](https://github.com/krdn/gon-stock03/issues/147)
- **주문 원장 읽기 · [#145 작업](tasks/145-order-history.md).** 현재 원장과 지난 실행, PC 읽기와 주문별 KIS 확인 시각을 구분한다. [진행 이슈](https://github.com/krdn/gon-stock03/issues/145)
- **현행 모의 버전 수용 · #25 → #3 → #2 → #1.** 실제 부분체결 직후 잔량 취소는 미관측으로 남기고 이번 인수에서 예외로 수용했다. [최종 판정과 검증](verification/2026-11-20-paper-acceptance.md) · [#25](https://github.com/krdn/gon-stock03/issues/25)
- **자동진화 #129 → #130 → #131:** [오프라인 기준선 및 재생](tasks/129-offline.md) · [설계](plans/agent-evolution.md).
- **오프라인 파일럿 #130:** [거래일지 초안 오류와 관심종목 코드 복사](tasks/130-product.md) · [선행 기준선 PR #133](https://github.com/krdn/gon-stock03/pull/133).
- **#128 자동진화 설계:** [연구·설계와 인수인계](tasks/128-agent-evolution.md). 첫 구현 후보는 [#129 관심종목 회귀의 오프라인 재생](https://github.com/krdn/gon-stock03/issues/129)이다.
- **#113 설정 UX:** [4303 실측과 회귀 검증](tasks/113-settings-ux.md). 4303에 계좌 인증과 잔고 갱신 동선을 적용하고, 미주입 복구 및 기본 개발 서버 자동 주입을 검증했다.
- **#12 트레이딩 · 화면 수용 완료.** 실제 시세 종목 전환, 20·60·100일봉과 자동 갱신을 확인했다. [화면과 수용 답변](verification/2026-11-19-issue-closeout.md) · [작업 파일](tasks/12-trading.md)
- **#20 관심종목 · 화면 수용 완료.** PR89 통합 후 정상 마스터의 삼성전자 시세와 상세 열기·닫기 초점 복귀를 확인했다. [화면과 수용 답변](verification/2026-11-19-issue-closeout.md) · [작업 파일](tasks/20-watchlist.md)
- **전체 현황:** [완료·잔여 작업과 재개 안내](verification/2026-11-17-consolidated-status.md). 구현·격리검증·실제 관측·사용자 수용을 구분한다.
- **#75 완료:** [11월 18일 실증](tasks/75-market-paper.md#11월-18일-장중-결과). 삼성전자 모의 시장가 1주 전량 체결, 잔량 0주, 보유 1주에서 2주로 증가. 해당 승인은 소진됐다.
- **#92 실시간 경로:** PR93 통합 SHA에서 두 구독 승인·실제 시세·REST 대조 확인. [재시도 소진 및 복구 관측](tasks/92-ws.md#통합-sha-장중-재검증).
- **#120·#122 매매 설정:** [Opus 설계 판정·편집 동선 및 실행 방법](tasks/122-trading-settings.md). 일반 한도 저장과 다음 한정 실행/전략 계약의 고정·명시적 기동을 구분한다. [#123 매매 테스트 설정·이전 차단 사유별 조치](tasks/123-trading-policy.md). 새 계약에서 가격·금액·시세/신호·세션·잔량 대응을 고정한다. 운영 4303 적용과 실제 부분체결은 별도.
- **#116 모의 잔량 취소:** [화면 조작·일반 모의 제약·검증](tasks/116-paper-cancel.md).
- **#106·#107:** [정상 경로의 지연·취소 경합 연구](tasks/106-strategy-preflight.md) · [분리된 모의 테스트 실행기](tasks/107-vts-runner.md).
- **#25 장중 실증 기록.** [실제 주문과 응답 유실 복구](verification/2026-11-18-live-transitions.md) · [전략 신호·부분체결](verification/2026-11-19-strategy.md) · [KODEX 200 실제 전량 체결](verification/assets/25-live-transition/2026-11-20-kodex-once.json) · [작업 기록](tasks/25-validation.md)
- **완료:** #71 연결·설정, #64/#65 안전성, #80 접속키 발급·앱 적용, #83 Graphify 추적·자동 전달은 통합했다. 15개 화면 수용은 초기/DEMO 표시·배치에 한정한다.
- **실행 환경:** 17일19:17 현재 `/home/gon/llm-projects/gon-stock03`에서 4303/4304를 복구했다. 기존 `.local/workspace.sqlite`를 백업 후 사용한다. 주문 승인·WS 접속키 미주입, 구독·전략 정지. [재개 점검](tasks/75-market-paper.md#장외-재개-점검)을 확인한다.
- **통합·정리:** [#85](tasks/85-consolidation.md), [브랜치 manifest](verification/2026-11-17-branch-consolidation.json). PR86으로 모든 기존 브랜치 이력을 main에 연결하고 초기 작업 브랜치29개를 정리했다. 원본18개 변경·fixture8개·작업 폴더를 보존했다. 구 worktree Graphify 재생성110개와 최종 검증은 #85 기록을 확인한다.
- **보존·금지:** 기존 원장·보유·백업·작업 폴더·.codex·node_modules·Graphify 파일을 보존한다. 원장 초기화·ID 자동 재발급·예약·자동 재개·실전 전환·강제푸시·보호 우회 없음.
- **리뷰·재개:** 필요한 구현 경계의 리뷰는 Claude Opus 5.5/high(기본) 또는 사용자가 Gemini를 지정한 경우 Gemini 4 Neon/high를 사용한다. 이 파일·선택 작업·필수 자료·관련 이슈/PR/CI부터 읽는다. 신규 초기화와 전체 과거 기록 재독은 하지 않는다. [재개 명령과 전달 문구](verification/2026-11-17-consolidated-status.md#새-세션-시작)를 따른다.
- **자동진화 파일럿 #131:** [Astra 지침 비교·부모 복구](tasks/131-agent-comparison.md) · [제품 검토 PR #134](https://github.com/krdn/gon-stock03/pull/134) · [기준선 PR #133](https://github.com/krdn/gon-stock03/pull/133).
