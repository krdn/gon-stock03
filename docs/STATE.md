# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- 현재: [#23 매매일지](tasks/23-journal.md) [PR #43](https://github.com/krdn/gon-stock03/pull/43) 통합 완료. 제품 통합 SHA `7543db068b30add25221d091f000f1dbcca2231c`, main 앱43720265557·구성43720265544 SUCCESS.
- 제품 대상 SHA: `25a20d1263dad917620948dc62375040751aa4cc`. 단위/API79·브라우저63·빌드·지정 Argon/high PASS. [검증·화면·CI 기록](verification/2026-11-15-journal.md). 이번 계속 진행 지시와 #23 자체 근거로 위임 수용·통합했다. 사용자 직접 육안·장중 수용은 별도다.
- 다음: [#24 설계실](https://github.com/krdn/gon-stock03/issues/24). native 선행 #5 completed·통합과 Project Ready를 재확인했다. 새 Herdr `#24 설계실`/t72/session `01a1df71-6c2c-70f2-912b-6a21522136e7`의 실제 화면·cwd·Ready 입력창을 확인했다. 현재 연결 준비만 완료했으며, 기록 PR 통합·최종 main CI 확인 후 착수를 지시한다.
- #24 범위: 15개 화면↔15개 GitHub 이슈·단계·근거 연결, 목표 계약/현재 동작/DEMO·KIS·후속 경계, 초안 저장과 실행·승인 구분, 키보드·모바일 탐색. 진행 상태를 정적 화면에 복제하지 않는다. 착수 세션이 TEMPLATE로 `docs/tasks/24-design.md`를 만든다.
- 필수 읽기: #24 → [계획 S14·운영 규칙](plans/interface-sessions-2026-11.md) → `Design.tsx`·`src/specs.ts`·`public/project-map.html`·관련 브라우저 테스트의 필요한 심볼. 신규 초기화·전체 과거 대화 재독 없음.
- 세션 경계: t71은 #23 통합·기록만 마무리한다. t6z·t6x·t6y 수정 중단 상태. #24의 실제 시작·새 ID·최종 main CI는 원격 인계 댓글에서 확인한다.
- 다른 작업: #9도 Ready이며 실제 모의 접수는 구체적 주문 승인·장중 조건이 필요하다. 이번 전환은 주문 승인에 의존하지 않는 #24로 선택했다.
- 미검증: 실제 KIS 일봉·공식 달력·주문/체결/취소/불명복구·연속전략·V01 장중 수용. #7 공개 마스터3962 실조회와 구분한다.
- 보존: 미추적 `.codex/config.toml`, 기술스택 추천 문서, STE 기준 파일·graphify 부재, #8 Fable 한도 오류, #21 초기 KIS pacing CI 실패/재실행 성공의 원인 미해결. Argon 요청/init와 서버 모델·effort 독립 확인 한계를 구분한다.
- 후속: #12는 #9·#11, #18은 #11·#17 미완료로 Blocked. #22는 #19 미완료로 Blocked다.
