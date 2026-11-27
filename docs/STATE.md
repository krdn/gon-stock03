# 작업 인수인계

- **저장 일봉 돌파·변동성 사이징** [#240 PR 3A-1·PR 3A-2 작업과 UI 입력 계약](tasks/240-strategy-rules-phase3a.md)

- **Research.tsx 모듈 분리 리팩터링** [#238 작업 기록](tasks/238-research-modularize.md) (Item #90 · `src/pages/Research.tsx`를 순수 헬퍼와 `src/components/research/*` 서브컴포넌트로 분리, `tests/**` 무수정 단위 354/354·E2E 336/336 통과)
- **확정 일봉 전략 7종** [#235와 PR 2A·PR 2B 작업](tasks/235-strategy-rules.md)
- **전략 스튜디오 일봉 규칙** [#231](https://github.com/krdn/gon-stock03/issues/231) · [PR 1A·PR 1B 작업과 계약](tasks/231-strategy-rules.md)
- **장전 브리핑 하드닝** [#211](https://github.com/krdn/gon-stock03/issues/211)의 주말 리포트 생성 400 차단과 승인 보고서 장후 마감 누락 경고를 병합했다. 백엔드 [PR #215](https://github.com/krdn/gon-stock03/pull/215) · UI [PR #217](https://github.com/krdn/gon-stock03/pull/217). 한국은행 통화정책 RSS와 기준금리 결정문 우선 수집도 반영했다. [PR #214](https://github.com/krdn/gon-stock03/pull/214)
- **장후 시세 동기화** [#212](https://github.com/krdn/gon-stock03/issues/212)의 [설계](plans/212-market-data-sync.md), 4304 단일 API·수집 이력·거래일 검증, 데이터 인벤토리 요약·출처 배지·범위 고지를 병합했다. [운영·08:30 점검](operations/local.md#장후-시세-동기화) · [PR #216](https://github.com/krdn/gon-stock03/pull/216) · [PR #219](https://github.com/krdn/gon-stock03/pull/219) · [PR #220](https://github.com/krdn/gon-stock03/pull/220)
- **장전 스캔** [#218](https://github.com/krdn/gon-stock03/issues/218)의 스케줄러 시계를 통일하고 수집 충돌 재시도와 장후 마감 경고 분기 검증을 반영했다. [PR #222](https://github.com/krdn/gon-stock03/pull/222)
- **데이터 인벤토리** [#221](https://github.com/krdn/gon-stock03/issues/221)의 동기화 일봉 보존·출처 배지·장전 스캔 요약 정합화를 main에 병합했고 이슈를 닫았다. [PR #224](https://github.com/krdn/gon-stock03/pull/224) (`4a6578c`) · [PR #225](https://github.com/krdn/gon-stock03/pull/225) (`1311c1d`)
- **장전 공시** [#213](https://github.com/krdn/gon-stock03/issues/213)의 [PR #227](https://github.com/krdn/gon-stock03/pull/227)을 main에 병합했다(`9c4068e`). 선택적 로컬 `OPENDART_API_KEY`로 한국 날짜 기준 당일 상장사 공시를 `list.json`에서 페이징 수집한다. 오류 메시지에서 키를 마스킹한다. 키가 비어 있으면 `todayRSS.xml`을 사용하고, OpenDART 요청 실패 시 남은 시간 예산 안에서 같은 RSS로 폴백한다. Infisical `dev /kis` 읽기 권한 경계는 유지한다. 실키 라이브 호출은 미검증이며 로컬 키 주입 후 확인한다.

- **Infisical 무인 자동 인증** [작업 기록·검증](tasks/203-infisical-machine-auth.md) · [KIS 자동 주입 가이드](operations/kis-auto-injection.md) · [#203](https://github.com/krdn/gon-stock03/issues/203) (PR [#204](https://github.com/krdn/gon-stock03/pull/204) 머지 `2e64669`) · [#207](https://github.com/krdn/gon-stock03/issues/207) (PR [#208](https://github.com/krdn/gon-stock03/pull/208) 머지 `c64bcfc`)
- **장전 브리핑 신뢰·UX 개선(Step 0) 및 A2UI 게이트** [작업 기록·검증](tasks/205-morning-briefing.md) · [설계](plans/a2ui-morning-briefing.md) · [#205](https://github.com/krdn/gon-stock03/issues/205) (PR [#206](https://github.com/krdn/gon-stock03/pull/206) 머지 `63dbbf5`; Step 0 결함 6건 고정 계약·UI 구현 및 A2UI v1.0 Step 1 조건부 게이트 문서화, 이슈 #205 종료)
- **연결·설정 하드닝** [작업 기록·검증](tasks/201-settings-hardening.md) · [#201](https://github.com/krdn/gon-stock03/issues/201) (PR [#202](https://github.com/krdn/gon-stock03/pull/202) 머지 `e41fd23`)
- **전체 점검·하드닝** [작업 기록·검증](tasks/199-audit-hardening.md) · [#199](https://github.com/krdn/gon-stock03/issues/199) (PR [#200](https://github.com/krdn/gon-stock03/pull/200) 머지 `78d4391`; 장전 스캔 분리·경계 수정·동적 포트·`serverNow` 통일, 이슈 #199 종료)
- **장전 포트폴리오 운용** [구현과 검증](tasks/197-morning.md) · [#197](https://github.com/krdn/gon-stock03/issues/197) (PR [#198](https://github.com/krdn/gon-stock03/pull/198) 머지 `aea3e67`, 실제 장중 운용 수용 대기)
기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

프로젝트를 처음 볼 때는 [한 장 그림](architecture/figures/gon-stock-overview.png)에서 KIS 모의 주문과 DEMO 연습 흐름을 따라간다. [구조도 작업 #110](https://github.com/krdn/gon-stock03/issues/110)

- **2차 UI/UX · [전체 범위·배정](tasks/149-ui-ux-v2.md).** 16개 화면·제품 PR 18개 통합 [#187](https://github.com/krdn/gon-stock03/pull/187). [화면별 검토표](verification/2026-11-20-ux-v2.md). 시장 출처 수정 [#194](https://github.com/krdn/gon-stock03/pull/194)까지 main·4303 반영. 사용자가 위임한 판단에 따라 순차 점검 20건의 UX 범위를 수용했다. [최종 판단·검증 한계](tasks/149-ui-ux-v2.md#위임에-따른-최종-수용) [전체 진행 #149](https://github.com/krdn/gon-stock03/issues/149) · [보드](https://github.com/users/krdn/projects/25)
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
