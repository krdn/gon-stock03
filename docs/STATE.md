# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- 현재: [#21 저장 일봉 백테스트](tasks/21-backtest.md), 진행. 단독 구현 세션 t6z. 부모 t6x·#15 t6y 수정 중단 확인.
- 기준 main: `f50e08040dc883f5577579221cea433d3054c40e`. 앱43712507342·구성43712507478 SUCCESS. native 선행 #7·#15 completed·통합, 착수 전 #21 Ready·workflow ready PASS.
- 범위: 저장 일봉 선택·입력 보존·다음 봉 체결·재현 검증. 수집·주문·전략 실행 없음.
- 필수 읽기: 현재 작업 파일 → #21 → [계획 S08·운영 규칙](plans/interface-sessions-2026-11.md) → 필요한 심볼·관련 PR/CI. 신규 초기화·전체 과거 대화 재독 없음.
- 이전 완료: [#15 데이터 상태](tasks/15-data-status.md), PR39·기록PR40, completed/Done. [최종 원격 근거](https://github.com/krdn/gon-stock03/issues/15#issuecomment-6894125259).
- 수용 경계: 기존 통합은 사용자 진행 지시·지정 Argon/CI 근거이며 사용자 직접 육안·장중 수용이 아니다. #21은 새 검증을 한다.
- 미검증: 실제 KIS 일봉·공식 달력·주문/체결/취소/불명복구·연속전략·V01 장중 수용. #7 공개 마스터3962 실조회와 구분한다.
- 보존: 미추적 `.codex/config.toml`, 기술스택 추천 문서, STE 기준 파일·graphify 부재, #8 Fable 한도 오류. Argon 요청/init와 서버 모델·effort 독립 확인 한계를 구분한다.
- 후속: #12는 #9·#11, #18은 #11·#17 미완료로 Blocked. #22는 #19·#21 선행. 다음 구현은 별도 선택과 원격 선행 확인 후 진행한다.
