# 후속 개발의 기준선 확정

기준: [이슈 #5](https://github.com/krdn/gon-stock03/issues/5) · [PR #4](https://github.com/krdn/gon-stock03/pull/4) · [전체 계획](../plans/interface-sessions-2026-11.md)

- 상태: 2026-11-15 기술 검증 완료, 사용자 초기 화면 수용 대기. PR #4는 초안이며 merge와 #5 완료 처리는 아직 하지 않았다.
- 목표: 기존 구현을 후속 이슈의 안전한 시작점으로 확정한다. 초기 화면 기준선의 수용과 전체 KIS 제품 완성을 구분한다.
- 선행: 없음. 이번 재검증 SHA는 `96f508c14859aa432025f62df42e1d8f94dbf6b4`. 문서 갱신 후 최종 head·CI는 PR Checks에서 다시 확인한다.
- 범위: 초기 화면 피드백, PR required checks·리뷰 대화·closing keyword 확인, 정상 통합 절차, 후속 실행 기준 origin/main SHA 기록.
- 제외: 새 KIS 기능·주문 전송·상위 #1/#2/#3의 전체 완료 처리.

## 먼저 읽을 자료

`docs/STATE.md`, 이슈 #5와 PR #4, [화면 기록](3-screen-blueprint.md), [기존 검증](../verification/2026-11-14.md), [세션 계획](../plans/interface-sessions-2026-11.md)의 기준선·착수 규칙만 확인한다. 필요할 때만 해당 화면 코드와 설계를 추가로 읽는다.

## 현재 결과

- `96f508c`의 application/configuration CI 성공. `main` 필수 검사는 configuration이며 최신 브랜치 일치와 리뷰 대화 해결이 요구된다. 미해결 리뷰 대화·GitHub 제출 리뷰·자동 종료 연결은 각각 0개다.
- 로컬 단위/계약/저장 23/23, Playwright 9/9, TypeScript strict·빌드 통과. 15개 화면의 PC/모바일 탐색과 데모 주요 흐름을 확인했다. 대시보드·설계실·위험관리 axe 위반/미확정은 각각 0개다.
- [기존 외부 리뷰](../verification/2026-11-14.md)의 판정과 마지막 직접 회귀 검증 범위를 확인했다. 이번 세션은 앱 코드 변경 없이 재검증과 기록 갱신만 수행했으며 외부 리뷰를 반복하지 않았다.
- 사용자 초기 화면 수용은 아직 확인되지 않았다. CI와 모델 리뷰로 대신하지 않는다. 이번 검증은 KIS 비밀값 없는 임시 메모리 DB에서 수행했다.
- 현재 브랜치는 `feat/trading-workbench`, 미통합 `origin/main`은 `086e4881c8ae452e7d40557b54a2d0db2cb41d57`다. 후속 실행 기준 SHA는 merge 후 확정한다.
- `gon-workflow ready .`는 기능 브랜치 HEAD가 원격 main과 달라 실패했다. 같은 명령을 origin/main의 임시 worktree에서 실행해 GitHub 구성 검사를 통과했다. 임시 worktree는 제거했다.
- 문서: 로컬 링크 10개와 `git diff --check` 통과. `evolve docs ste-lint --strict --changed HEAD --added`는 기존 표준 파일 `docs/conventions/ste100-writing.md` 부재로 실패했다. 앱 검사 성공과 구분하며 무관한 표준 파일은 추가하지 않았다.

## 사용자 수용 범위

수용 대상은 **15개 초기 화면·탐색 구조·설계실과 현재 로컬 DEMO 기능을 후속 개발의 출발점으로 채택하는 것**이다. 화면별 상세 완성은 등록된 후속 이슈에서 계속한다.

- 포함: PC/모바일 탐색, 합성 시세·계좌, 로컬 주문/취소·전략 재생·백테스트·위험관리·일지·저장, 설계실/프로젝트 지도.
- 별도 후속: KIS 실제 주문·체결/부분체결, 웹 취소·불명 복구, WebSocket·연속 자동매매, 전체 시장 데이터, 최종 장중 통합 수용. #1/#2/#3은 열린 상태로 유지한다.
- 확인 화면: 로컬 검토 서버의 [대시보드](http://127.0.0.1:4315/dashboard)와 [화면별 설계](http://127.0.0.1:4315/design?tab=screens&screen=orders). 임시 서버이며 비밀값을 주입하지 않았다. 종료 후에는 `npm run dev`로 4303 포트에서 확인한다.
- 수용 답변: 아직 없음. 수정 피드백이 오면 해당 화면만 수정·재검증하고, 수용되면 PR #4 통합으로 진행한다.

## 다음 행동

사용자에게 위 수용 범위와 확인 화면을 제시한다. 수용 후 최신 head·required CI·리뷰 대화·자동 종료 연결을 다시 확인하고 PR #4를 정상 통합한다. 실제 origin/main SHA를 기록한 뒤 #5 완료·직접 후속 #6/#23/#24의 차단 해제·Project Ready를 확인한다. 나머지 선행 관계는 유지한다.

재개: “docs/STATE.md와 docs/tasks/5-baseline.md, 이슈 #5 및 PR #4의 최신 상태를 확인하고 기준선 확정부터 진행해줘. 사용자 수용과 전체 제품 완료를 구분해줘.”
