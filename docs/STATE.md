# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- 현재: [#24 설계실](tasks/24-design.md) completed/Done. [PR #45](https://github.com/krdn/gon-stock03/pull/45) 통합 main `2ffa67c97beb1c5d5727b56504ba1a02c546b36b`, 앱43723913211·구성43723913052 SUCCESS. 기록 PR 이후 최종 main SHA·CI는 #24 인계 댓글을 확인한다.
- 수용: 이번 계속 진행 지시와 #24 자체 지정 Argon·CI·fixture/화면 근거의 위임 수용. 제품 대상 `107e8182cce35724ee9279540adb88a938036a47`. 직접 사용자 육안·V01 장중 수용은 별도다. [검증·화면·리뷰](verification/2026-11-15-design.md): 단위/API79·브라우저67·빌드 PASS. 원격 공통 #7 단계 불일치도 회귀·수정·지정 Argon 수정분 PASS.
- 다음: [#9 KIS 웹 취소·정정 계약과 불명 주문 복구](https://github.com/krdn/gon-stock03/issues/9). native 선행 #6/#8 completed·PR #27/#31 main 포함 및 Project Ready 확인. 공식 계약·공통 서비스·fixture 검증·구체적 모의 주문 승인안 준비부터 진행한다. 실제 주문 전송 승인은 없다.
- #9 필수 읽기: AGENTS·WORKFLOW → #9 → [계획 C03·S15·운영 규칙](plans/interface-sessions-2026-11.md) → `server/kis.ts`, `server/paper.ts`, `server/store.ts`, `server/http.ts`, `server/index.ts`, `shared/contracts.ts`, `tests/paper.test.ts`의 필요한 심볼. 착수 시 TEMPLATE로 작업 파일을 만든다. 전체 과거 대화 재독·신규 초기화 없음.
- 세션: 새 Herdr t73 / `01a1df8d-f843-7de1-87e1-118df8eeb1bc`. 실제 탭·cwd·동일 ID·Ready 입력창 재확인, 현재 연결 준비만 완료. #24 기록 통합·최종 CI 후 착수 지시와 응답을 #24 인계 댓글에 기록한다. t72는 지시 전송 시 저장소 수정 중단, t71·t6z·t6x·t6y도 수정 중단 상태다.
- 경계: #9의 실제 최소 모의 접수·조회 증거까지 충족하기 전 전체 완료로 표시하지 않는다. 지원 불가 계약은 우회하지 않으며, 자동 재전송·실전 fallback 금지. KIS 조작 UI는 S15/#14 소유다.
- 미검증: 실제 KIS 일봉·공식 달력·주문/체결/취소/불명복구·연속전략·V01. #7 공개 마스터3962 실조회와 구분한다.
- 보존: 미추적 `.codex/config.toml`, 기술스택 추천 문서, STE 기준 파일·graphify 부재, #8 Fable 한도 오류, #21 초기 KIS pacing CI 실패 원인 미해결. Argon 요청/init와 서버 모델·effort 독립 확인 한계를 구분한다.
- 후속: #9만 Ready. #11·#17은 #9, #12는 #9·#11, #13·#14·#18·#19·#22·#25는 각 선행 미완료로 Blocked다.
