# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- 현재: [#21 저장 일봉 백테스트](tasks/21-backtest.md), 검증 대기·OPEN/In Review. [PR #41](https://github.com/krdn/gon-stock03/pull/41). 단독 구현 세션 t6z. 부모 t6x·#15 t6y 수정 중단 확인.
- 기준 main: `f50e08040dc883f5577579221cea433d3054c40e`. 앱43712507342·구성43712507478 SUCCESS. native 선행 #7·#15 completed·통합, 착수 전 #21 Ready·workflow ready PASS.
- 제품 SHA: `05ce604d82ab9a44e98c2f294f2f221ce1025916`. 단위/API77·브라우저59·빌드·지정 Argon/high PASS. [검증·화면·CI 기록](verification/2026-11-15-backtest.md). 사용자 직접 화면 수용·통합은 아직 없다.
- 범위: 저장 일봉 선택·입력 보존·다음 봉 체결·재현 검증. 수집·주문·전략 실행 없음.
- 필수 읽기: 현재 작업 파일 → #21 → [계획 S08·운영 규칙](plans/interface-sessions-2026-11.md) → 필요한 심볼·관련 PR/CI. 신규 초기화·전체 과거 대화 재독 없음.
- 이전 완료: [#15 데이터 상태](tasks/15-data-status.md), PR39·기록PR40, completed/Done. [최종 원격 근거](https://github.com/krdn/gon-stock03/issues/15#issuecomment-6894125259).
- 다음: 최종 PR CI와 인계 댓글을 확인하고 #21 화면 수용·통합을 판단한다. completed/Done·후속 선행 해제는 그 뒤에 한다.
- 수용 경계: 기존 통합은 사용자 진행 지시·지정 Argon/CI 근거이며 사용자 직접 육안·장중 수용이 아니다. #21은 별도 Argon 검증을 수행했다.
- 미검증: 실제 KIS 일봉·공식 달력·주문/체결/취소/불명복구·연속전략·V01 장중 수용. #7 공개 마스터3962 실조회와 구분한다.
- 보존: 미추적 `.codex/config.toml`, 기술스택 추천 문서, STE 기준 파일·graphify 부재, #8 Fable 한도 오류. Argon 요청/init와 서버 모델·effort 독립 확인 한계를 구분한다.
- 후속: #12는 #9·#11, #18은 #11·#17 미완료로 Blocked. #22는 #19·#21 선행. 다음 구현은 별도 선택과 원격 선행 확인 후 진행한다.
