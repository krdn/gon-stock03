# #6 공통 상태 계약

- 상태: 완료(closed/completed, Project Done). [이슈 #6](https://github.com/krdn/gon-stock03/issues/6), [PR #27](https://github.com/krdn/gon-stock03/pull/27) MERGED. 구현 브랜치 `feat/6-common-state`, 완료 기록 브랜치 `docs/6-integration-complete`.
- 착수 기준: `origin/main` = `e15d3073cf29ef62dde964f1f41ab186e611ec88`. 2026-11-15 native 선행 #5 `closed/completed`, 기준선 통합·main 앱/구성 CI 성공, #6 Project `Ready`, 열린 PR 없음 확인.
- 목표: DEMO와 KIS 모의 데이터를 분리하고 미연결·로딩·정상·오래됨·부분실패·오류, 관측/최종 성공 시각을 공통 계약으로 표시한다. 전 화면 환경·긴급정지 표시, 비JSON 오류와 revision 역행 회귀를 포함한다.
- 범위: 공통 모델/계약, 상태 조회·화면 컨텍스트, KIS 조회 서비스, 이를 소비하는 설정/모의 화면과 관련 검사. 실제 주문 전송·취소·실시간·전략 실증·실전 환경은 제외한다.
- 소유권: 이 세션이 #6의 공유 파일을 순차 수정한다. 시작 시 미커밋 변경 없음.

## 먼저 읽을 자료

`AGENTS.md`, `docs/STATE.md`, #6과 native 선행/관련 PR·CI, [계획 C01·운영 규칙](../plans/interface-sessions-2026-11.md), `shared/model.ts`, `shared/contracts.ts`, `src/context.tsx`, `server/kis.ts`, `src/App.tsx`, `src/components/ui.tsx`. API 연결은 `server/http.ts`, `server/paper.ts`, 설정·모의 화면에서 필요한 심볼만 확인한다.

## 현재 결과

- 구현: 공유 상태/응답 Zod 계약, 전 화면 환경·출처·관측/최종 성공·긴급정지 표시, 설정/모의 화면의 KIS 상태 공유. [상세 계약](../architecture/workbench.md#공통-상태-계약-6).
- KIS: 마지막 전체 성공 잔고 보존, 페이지 부분실패·중복·합계 변화·50페이지 상한, 인증/조회/주문의 단일 큐와 30개 대기 상한, 토큰 재사용·60초 발급 간격·GET 인증 재조회 최대1회. POST 재전송 없음. 현재가3초 재사용, 주문 검사는 캐시 우회.
- 회귀 재현(수정 전): 브라우저2건 모두 의도한 assertion 실패. 비JSON502에서 `Unexpected token` 노출, revision20→1 후 주문 버튼 활성 유지.
- 회귀 수정: 파싱·네트워크·5xx 고정 오류, 요청 순서 방어·서버 instanceId·revision 역행 차단. 서버 재시작은 낮은 revision과 새 폼으로 교체하며 열린 확인창을 닫는다.
- `npm test`: 최종38/38 PASS. HTTP 계약·DEMO 불변·비밀 sentinel 비노출, KIS 페이지/인증/제한/재시도, 주문 보존·SQLite 재시작 포함.
- `npm run build`: TypeScript+Vite PASS. `npm run test:e2e`: 최종21/21 PASS. 15화면×데스크톱/모바일에서 환경·긴급정지 켜짐/꺼짐·가로 넘침 검사, 원래 브라우저9건 보존. 리뷰 지적의 상태 유실·오류 문구·접근성 회귀까지 포함.
- agent-browser 육안 확인: 격리된 메모리DB에서 1440×1050 대시보드와390×844 모의 화면의 상태 표시 확인. 실제 계정·비밀정보 없음.
- `git diff --check`, 변경 문서 상대 링크 검사, `gon-workflow implementation-ready .`: PASS.
- 문서 STE lint: `evolve docs ste-lint --strict --changed refs/remotes/origin/main --added` 실행 실패(exit2). 저장소의 `docs/conventions/ste100-writing.md` 부재. 검사를 통과한 것으로 표시하거나 무관한 규약 파일을 추가하지 않는다.
- 외부 리뷰: 실제 `claude-opus-5-5 / high`, 조건부 PASS(P0/P1 없음). P2 7건을 재현·수정·명확화했다. 수정분 추가 확인도 PASS(P0/P1/P2 없음). P3 3건은 직접 재현·보완 후 최종 검사했다. [검사·리뷰 근거](../verification/2026-11-15-common-state.md).
- 결정: 기존 React/Node/SQLite·npm을 유지한다. KIS 요청은 단일 클라이언트의 공통 큐를 사용하고 실패한 부분 잔고를 성공 잔고로 반환하지 않는다.
- 미검증: 실제 KIS 계좌·장중 호출·주문·체결. 이 작업의 네트워크 회귀는 비밀값 없는 가짜 응답으로 검증한다.

## 구현 당시 원격 전달

- 구현 커밋: `0b202401700d56753edffc512256e4e6920b2f60`. push 후 원격 브랜치 SHA 일치를 확인했다.
- 해당 코드의 PR [application CI](https://github.com/krdn/gon-stock03/actions/runs/43668384738)·[configuration CI](https://github.com/krdn/gon-stock03/actions/runs/43668384828) 모두 PASS. push 이벤트의 두 CI도 PASS. required check는 configuration이며 application도 별도 통과했다.
- PR #27 `OPEN`, 초안 아님. #6 `OPEN / In Review`를 원격 재조회했다. 사용자 수용·병합은 수행하지 않았고 후속 native 선행도 해제하지 않았다.
- GitHub 연결 앱의 생성403 뒤 중복 없음을 확인하고 기존 인증의 gh로 PR을 생성했다. 권한은 변경하지 않았다.
- 커밋의 graphify 훅은 설치된 Python 환경을 찾지 못해 실행하지 못했다. 커밋·push는 성공했으나 그래프 갱신은 검증하지 않았다.
- 문서 커밋을 포함한 최종 head `e37d7f8ec32c9d2cc634d8e1392fbd3650b7f8cd`의 PR/push application·configuration CI도 통합 전에 모두 SUCCESS로 재확인했다.

## 통합·완료 — 2026-11-15

- 근거: 사용자가 새 탭에서 “해당 통합 작업을 계속하라”, “정상 병합 절차 및 원격 검증을 진행하라”고 지시했다. 이 진행 지시로 통합했으며 별도 수용 발언이나 실증 성공을 만들지 않았다. [지시·사전 확인 기록](https://github.com/krdn/gon-stock03/pull/27#issuecomment-6888321579).
- 사전 확인: origin/main `e15d307`, PR head `e37d7f8`, required configuration·application 성공, CLEAN/MERGEABLE, 미해결 리뷰 대화 없음. native #5 closed/completed와 기준선의 main 포함을 확인했다. 기존 Opus 리뷰 근거를 확인했고 제품 코드는 추가 수정하지 않았다.
- 정상 병합: `8b280229671bb8452c66ecc4939e87fda569c697`. PR head와 병합 tree가 같다. main [application CI](https://github.com/krdn/gon-stock03/actions/runs/43670725890)·[configuration CI](https://github.com/krdn/gon-stock03/actions/runs/43670725872) SUCCESS. main 로그의 단위38/38·브라우저21/21·TypeScript/빌드 성공을 확인했다.
- #6의 7개 완료 조건과 이관 회귀2건을 완료 체크하고 closed/completed·Project Done을 재조회했다. 실제 KIS·장중 검증, STE lint·graphify 한계는 위 기록대로 남는다.
- 후속 native 관계를 보존하고 #7·#8을 Ready로 갱신했다. 기존 #23·#24도 선행 #5 completed·통합으로 Ready다. #9·#16은 #8, #10·#15는 #7, #17은 #9가 남아 Blocked다. #1/#2/#3은 OPEN이다.
- GitHub 앱의 댓글·merge 호출은 403이었다. 중복 없음을 확인한 뒤 기존 gh 인증으로 정상 처리했다. 권한·보호 규칙은 바꾸지 않았다. 완료 기록 PR의 최종 CI·원격 확인은 #6 인수인계 댓글에서 확인한다.
- 완료 문서3개의 `git diff --check`와 상대 링크10개 검사는 PASS. STE lint 재실행은 같은 기준 파일 부재로 exit2이며 통과가 아니다.

## 다음 행동

다음 권장은 #7 국내 종목 마스터·일봉 수집이다. 이 세션에서는 구현을 시작하지 않았다. 새 세션은 AGENTS·STATE, #7과 계획 C02 행, 최신 origin/main·CI·native 선행 #6, #7의 필수 파일만 확인한다. 공식 계약을 확인하고 작업 기준 SHA와 새 작업 파일을 기록한 뒤 한 이슈씩 진행한다. 실제 KIS 주문·취소·전략 실행은 이번 통합 범위 밖이다.
