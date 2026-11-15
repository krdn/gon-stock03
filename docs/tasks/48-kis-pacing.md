# 작업: #48 KIS 요청 간격 CI 실패

기준 이슈: https://github.com/krdn/gon-stock03/issues/48

- 상태: 새 Herdr 탭 확인 후 착수. 원인·제품 수정·이번 외부 리뷰는 아직 없다.
- 목표: #21 최초 CI의 19ms < 20ms 원인을 구분하고 최소 수정·회귀·지정 리뷰·원격 CI를 검증한다.
- 범위: `server/kis.ts`의 pacing, `tests/kis.test.ts` 관련 검사, 이 작업 기록. 실제 KIS 인증·조회·주문·취소·전략 실행은 없다.
- 브랜치/폴더: `fix/48-kis-pacing` / `/home/gon/llm-projects/gon-stock03-worktrees/48-kis-pacing`. 기준 main `034f7e766d67b0ecfe3dab8477078939c255412e`.
- 독립 작업: #9 완료가 필요한 기능 착수가 아니다. #9/PR47은 OPEN·Blocked/Draft, 후속 native 선행 차단 유지. 공통 파일 변경은 통합 시 #9과 충돌·회귀를 확인한다.
- 원본 `/home/gon/llm-projects/gon-stock03`의 #9 브랜치와 미추적 `.codex/`를 보존한다. 새 세션이 #48만 단독 구현하며 추가 에이전트·부모 재위임은 없다.

## 먼저 읽을 자료

AGENTS·WORKFLOW·#48, `server/kis.ts`의 send/request, `tests/kis.test.ts`의 pacing 검사, [#21 검증 기록](../verification/2026-11-15-backtest.md)의 첫 CI 실패 절, [#9 인계](https://github.com/krdn/gon-stock03/issues/9#issuecomment-6896471788)와 [PR47](https://github.com/krdn/gon-stock03/pull/47)의 최신 상태.

## 확인한 결과

- 2026-11-16 [CI43714059921 첫 시도](https://github.com/krdn/gon-stock03/actions/runs/43714059921/attempts/1) 로그 재조회: 느린 guard 이후 daily page 테스트가 `transport spacing: 19ms`로 실패, 77개 중 76 PASS·1 FAIL.
- 현재 구현은 `Date.now()`와 transport 직전 lastCall을 사용한다. 테스트는 transport 안에서 별도로 시각을 읽는다. 측정 위치·시계 해상도·실제 간격 위반은 아직 구분하지 않았다.
- 최신 main 앱43724416483·구성43724416509 SUCCESS. 이 폴더의 문서 변경 전 `gon-workflow ready` PASS. PR47 head `7fac5aac71702e1a56a61173b1b556ee703f35d9`의 CI4개 SUCCESS.
- 기능 #9·11·12·13·14·17·18·19·22·25는 Project Blocked. #48은 주문 승인 대기와 분리한 기존 결함 조사다.
- 원본 실패 기록, STE 기준 파일·graphify 부재, #8 Fable 한도 오류를 보존한다.

## 다음 행동

탭·새 session ID·cwd·Ready 확인 후 #48만 재현한다. 필요한 Node 공식 자료를 확인해 `docs/start-context.json`을 갱신하고 implementation-ready 통과 후 최소 수정한다. 임계값 완화·sleep 증액·재시도만으로 실패를 숨기지 않는다.

집중 회귀·전체 단위/API·빌드와 변경 영향에 맞는 검사를 수행한다. 완료 경계에서 외부 리뷰 가이드·중앙 설정을 읽고 Gemini 4 Argon 또는 Fable 5.2로 이번 변경을 검증한다. 실제 반환과 서버 모델·effort 확인 한계를 구분한다. 검증 기록·초안 PR·원격 CI·handoff까지 남긴다. 원인/재현 불명확은 해결 완료가 아니다.

## 새 세션 시작 문구

> 이 폴더의 AGENTS·STATE·docs/tasks/48-kis-pacing.md와 #48을 읽고 재현부터 진행해. 실제 KIS 호출 없이 #9 경계를 유지하고 지정 모델 검증·초안 PR·CI·인계까지 수행해.
