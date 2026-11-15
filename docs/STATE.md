# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- 현재: [#24 설계실](tasks/24-design.md) [PR #45](https://github.com/krdn/gon-stock03/pull/45) 수용·통합 대기. 기준 main `f621a145172cb4c764f2d6e6315f3ff2520efdf6`, 앱43720656350·구성43720656336 SUCCESS. #5 completed·통합 및 #24 Ready 확인 후 In Progress.
- 범위: 15개 화면↔이슈·단계·API·완료 기준·근거, 목표 계약/현재 동작/DEMO·KIS·후속 경계, 로컬 초안과 실행·승인 구분, 키보드·모바일 탐색. 진행 상태는 GitHub에서 확인한다.
- 필수 읽기: #24 → [계획 S14·운영 규칙](plans/interface-sessions-2026-11.md) → `Design.tsx`·`src/specs.ts`·`public/project-map.html`·관련 브라우저 검사. 전체 과거 대화 재독·신규 초기화 없음.
- 세션: t72 / `01a1df71-6c2c-70f2-912b-6a21522136e7`. 실제 Herdr 탭·ID·cwd·Ready 입력창 확인 후 착수 지시 수신. t71·t6z·t6x·t6y 수정 중단, 이 세션 단독 구현.
- 이전: [#23](tasks/23-journal.md) completed/Done, PR #43/#44 통합. [최종 인계](https://github.com/krdn/gon-stock03/issues/23#issuecomment-6895263340). #23 지정 Argon·CI·fixture 근거의 위임 수용이며 직접 사용자 육안·장중 수용은 별도다. #23 PASS를 #24에 재사용하지 않는다.
- 제품 대상: `d1a465f25a1273e2faf00f5ceb69d53e7fee7fdf`. [검증·화면·리뷰](verification/2026-11-15-design.md): 단위/API79·브라우저67·빌드·지정 Argon/high PASS. 최종 기록 SHA의 CI는 PR·인계 댓글을 확인한다.
- 다음: #24 제품 대상 SHA의 사용자 화면 수용 형태·답변과 PR 최종 CI를 확인해 통합 여부를 판단한다. 수용 전 다른 이슈 구현으로 넘어가지 않는다.
- 미검증: 실제 KIS 일봉·공식 달력·주문/체결/취소/불명복구·연속전략·V01. #7 공개 마스터3962 실조회와 구분한다. 실제 주문 승인 없음.
- 보존: 미추적 `.codex/config.toml`, 기술스택 추천 문서, STE 기준 파일·graphify 부재, #8 Fable 한도 오류, #21 초기 KIS pacing CI 실패 원인 미해결. Argon 요청/init와 서버 모델·effort 독립 확인 한계를 구분한다.
- 후속: #9 Ready. #22는 #19, #12는 #9·#11, #18은 #11·#17 미완료로 Blocked.
