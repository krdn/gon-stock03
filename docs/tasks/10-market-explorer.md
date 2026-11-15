# 작업: 시장 탐색

기준 이슈: https://github.com/krdn/gon-stock03/issues/10

- 상태: 검증 대기
- 목표·완료 조건: `/market`에서 실제 국내 주식·ETF를 이름/코드와 시장으로 함께 검색한다. 선행 0을 보존하고 미수신·지연·거래정지·마스터 제외를 구분한다. 표시 종목만 갱신한다. 사용자 화면 수용 답변과 대상 SHA는 별도로 기록한다.
- 범위: 기존 마스터·KIS·공통 상태·관심 저장 재사용, 시장 상세와 `src/specs.ts`, 필요한 단위·브라우저 검사. 주문·취소·전략·장중 실증 제외.
- 선행: #6·#7 completed와 main 통합, PR #32 통합 `73fa8d1b4fe53a0ac579b611d764f658011631f8`의 Application 43680743738·configuration 43680743724 성공 및 ready 통과를 2026-11-15 재확인.
- 이슈 / PR: [#10](https://github.com/krdn/gon-stock03/issues/10), OPEN / [PR #33](https://github.com/krdn/gon-stock03/pull/33), In Review
- 브랜치 / 제품 SHA: `feat/10-market-explorer` / `507c2ef130eeb940a48f355c901e9876c86b75c1`. 시작 main은 `73fa8d1b4fe53a0ac579b611d764f658011631f8`. 문서 포함 최종 head는 PR #33에서 확인한다.

## 먼저 읽을 자료

- [운영 규칙](../WORKFLOW.md), [S02·운영 규칙](../plans/interface-sessions-2026-11.md)
- `src/pages/Workspace.tsx`: Market·InstrumentTable, `shared/model.ts`: KisQuote, `src/specs.ts`: market
- `server/market-data.ts`: parseMaster·refreshMaster, `server/store.ts`: masterData·saveMasters, `server/kis.ts`: quote·호출 간격, `server/http.ts`: master·watchlist
- `tests/browser/workbench.spec.ts`, `tests/market-data.test.ts`, `tests/kis.test.ts`

## 현재 결과

- 기존 마스터와 KIS 현재가 캐시·직렬 호출을 재사용한다. 한 페이지 8종목을 순차 조회하고 숨겨진 탭은 중단한다.
- 공식 마스터 제외는 상장폐지 확정 근거가 아니다. 이전 종목을 보존해 제외·확인 필요로 표시하며, 거래정지와 정리매매는 공식 필드에 근거한다.
- 검사: 착수 ready·implementation-ready, 단위62·빌드, 최종 제품 SHA의 원격 단위62·브라우저40·빌드 통과. 실제 마스터3962와 3종목 VTS 현재가 응답 확인. 상세는 [검증 기록](../verification/2026-11-15-market.md). Claude Opus 5.5(high) 실제 반환 모델 확인 및 수정분 PASS. 재검토 후 LOW 속성 제거는 직접 확인. 제품 SHA 앱 [43682425291](https://github.com/krdn/gon-stock03/actions/runs/43682425291)·구성 [43682425267](https://github.com/krdn/gon-stock03/actions/runs/43682425267) CI 성공. 문서 후속 커밋의 CI는 PR에서 재확인한다.
- 미검증: #10 사용자 수용 답변과 그 대상 SHA 기록, 통합. #7의 실제 일봉·달력, STE·graphify 환경 한계는 유지한다. #8의 위임 수용을 #10 수용으로 확대하지 않는다.
- 실패·한계: GitHub 연결 도구 PR 생성 403 후 중복 없음 확인, 기존 인증 gh로 PR33 생성·재조회. 기존 미추적 설정 때문에 깨끗한 별도 클론으로 원격 인계한다. STE 기준 파일·graphify 환경 부재는 통과로 표시하지 않는다.
- 보존: 미추적 `.codex/config.toml`은 수정·스테이징하지 않는다. 다른 세션 변경을 되돌리지 않는다.

## 다음 행동

PR33의 최신 head·CI와 이슈의 인수인계 댓글을 먼저 확인한다. #10 화면 수용 답변과 그 대상 SHA를 기록한 뒤 통합한다. 그 전에는 #10을 완료로 닫거나 후속 #20·#12를 시작하지 않는다. #8의 위임 수용을 재사용하지 않는다.

## 새 세션 시작 문구

> docs/STATE.md와 이 작업 파일, 필수 파일·이슈 #10·관련 PR/CI만 확인하고 남은 행동부터 이어가줘.
