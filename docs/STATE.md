# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- 현재: [#21 저장 일봉 백테스트](tasks/21-backtest.md) 통합 완료. [PR #41](https://github.com/krdn/gon-stock03/pull/41) 제품 통합 SHA `fa0e1e0096dd9e55e824ea6320f6862698a889cb`. 앱43716579368·구성43716579364 SUCCESS.
- 제품 대상 SHA: `05ce604d82ab9a44e98c2f294f2f221ce1025916`. 단위/API77·브라우저59·빌드·지정 Argon/high PASS. [검증·화면·CI 기록](verification/2026-11-15-backtest.md). 이번 계속 진행 지시와 이 근거로 통합을 판단했다. 사용자 직접 육안·장중 수용은 별도다.
- 다음: [#23 매매일지](https://github.com/krdn/gon-stock03/issues/23). native 선행 #5 completed·통합과 Project Ready를 확인했다. 새 Herdr 탭·세션·cwd·입력 가능 상태를 확인한 뒤 단독 구현 소유권을 넘긴다. 준비만 한 세션을 착수로 표시하지 않는다.
- #23 범위: 기존 일지의 빈/공백 입력·저장 실패·검색 결과 없음·안전한 본문 렌더링·새로고침/서버 재시작 보존. 첨부·편집·주문 기능 추가는 제외한다. 착수 세션에서 TEMPLATE로 `docs/tasks/23-journal.md`를 만든다.
- 필수 읽기: #23 → [계획 S10·운영 규칙](plans/interface-sessions-2026-11.md) → `Operations.tsx`·일지 API/엔진/저장·`src/specs.ts`·관련 테스트의 필요한 심볼. 신규 초기화·전체 과거 대화 재독 없음.
- 세션 경계: t6z는 #21 통합·기록만 마무리한다. 부모 t6x·#15 t6y 수정 중단 확인. #23의 실제 시작·새 ID·최종 main CI는 원격 인계 댓글에서 확인한다.
- 다른 작업: #9·#24도 Ready다. #9의 실제 모의 접수 실증은 구체적 주문 승인·장중 조건이 필요하므로 이번 전환은 독립적인 #23으로 선택했다. 승인 범위를 추정하지 않는다.
- 미검증: 실제 KIS 일봉·공식 달력·주문/체결/취소/불명복구·연속전략·V01 장중 수용. #7 공개 마스터3962 실조회와 구분한다.
- 보존: 미추적 `.codex/config.toml`, 기술스택 추천 문서, STE 기준 파일·graphify 부재, #8 Fable 한도 오류. Argon 요청/init와 서버 모델·effort 독립 확인 한계를 구분한다.
- 후속: #12는 #9·#11, #18은 #11·#17 미완료로 Blocked. #22는 #21 통합 뒤에도 #19 미완료로 Blocked다.
