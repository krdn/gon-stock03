# 작업 인수인계

기준: [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 개인 PC·국내 주식/ETF·모의 수동/전략 매매.

- 현재: [#9 KIS 주문·복구](tasks/9-kis-orders-recovery.md) Blocked. 독립 구현·검증·지정 리뷰 완료, [초안 PR47](https://github.com/krdn/gon-stock03/pull/47) 제출. 제품 `c2dd987870203f29391ef721e473115f1f12ace6`. 최종 기록 SHA·CI·handoff는 #9 인계 댓글에서 확인한다. 기준 main `034f7e766d67b0ecfe3dab8477078939c255412e`. #6/#8 completed·PR27/31 main 포함·Project Ready 재확인. 실제 주문 승인 없음.
- 범위: 공통 주문 큐·명시적 불명 복구·감사·fixture 검증·최소 모의 실행안. UI는 S15/#14 소유. 웹 정정취소의 필수 가능수량 조회가 모의 미지원이므로 해당 전송은 차단한다.
- 선행 완료: [#24 설계실](tasks/24-design.md) completed/Done, PR45/46 통합. 최종 main 앱43724416483·구성43724416509 SUCCESS. [최종 인계](https://github.com/krdn/gon-stock03/issues/24#issuecomment-6896090609). 직접 육안·장중 수용과 구분한다.
- 필수 읽기: #9 작업 파일의 목록과 관련 원격 이슈·PR·CI만 읽는다. 신규 초기화·전체 과거 대화 재독 없음.
- 세션: t73 / `01a1df8d-f843-7de1-87e1-118df8eeb1bc` 단독 구현. 실제 Herdr 탭·cwd·ID·Ready 확인 후 착수 지시를 받았다. t72·t71·t6z·t6x·t6y 수정 중단.
- 경계: 최소 실제 모의 접수·조회 증거 전 #9 전체 완료·후속 선행 해제 금지. 자동 재전송·실전 fallback·미지원 API 우회 금지.
- 미검증: 실제 KIS 일봉·공식 달력·주문/체결/취소/불명복구·연속전략·V01. #7 공개 마스터3962 실조회와 구분한다.
- 보존: 미추적 `.codex/config.toml`, 기술스택 추천 문서, STE 기준 파일·graphify 부재, #8 Fable 한도 오류, #21 초기 KIS pacing CI 실패 원인 미해결. Argon 요청/init와 서버 모델·effort 독립 확인 한계를 구분한다.
- 다음: #9 초안 PR의 최종 CI와 인계 기록 확인 후 웹 취소 범위 결정·최소 모의 실행 승인을 받는다.
- 후속: #9는 미완료. #11·#17은 #9, #12는 #9·#11, #13·#14·#18·#19·#22·#25는 각 선행 미완료로 Blocked다.
