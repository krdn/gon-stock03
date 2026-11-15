# 작업: #48 KIS 요청 간격 CI 실패

기준 이슈: https://github.com/krdn/gon-stock03/issues/48

- 상태: 수용·통합 완료. [PR49](https://github.com/krdn/gon-stock03/pull/49) MERGED `401be0089ac47f29bf3553aff3d2aec6ccd0e7c1`. PR47 결합 검증·통합은 [#50](50-branch-integration.md)에 기록했다. #9 및 후속 차단은 유지한다.
- 목표: #21 최초 CI의 19ms < 20ms 원인을 구분하고 최소 수정·회귀·지정 리뷰·원격 CI를 검증한다.
- 범위: `server/kis.ts`의 pacing, `tests/kis.test.ts` 관련 검사, 이 작업 기록. 실제 KIS 인증·조회·주문·취소·전략 실행은 없다.
- 브랜치/폴더: `fix/48-kis-pacing` / `/home/gon/llm-projects/gon-stock03-worktrees/48-kis-pacing`. 기준 main `034f7e766d67b0ecfe3dab8477078939c255412e`.
- 독립 작업: #9 완료가 필요한 기능 착수가 아니다. #9는 OPEN/Blocked이며 PR47은 #50에서 병합했다. 후속 native 선행 차단을 유지한다. 공유 파일의 문서 충돌·결합 회귀 확인도 #50에서 완료했다.
- 원본 `/home/gon/llm-projects/gon-stock03`의 #9 브랜치와 미추적 `.codex/`를 보존한다. 당시 새 세션이 #48만 단독 구현했고, 후속 #50이 격리 clone에서 통합했다. 추가 에이전트·부모 재위임은 없다.

## 먼저 읽을 자료

AGENTS·WORKFLOW·#48, `server/kis.ts`의 send/request, `tests/kis.test.ts`의 pacing 검사, [#21 검증 기록](../verification/2026-11-15-backtest.md)의 첫 CI 실패 절, [#9 인계](https://github.com/krdn/gon-stock03/issues/9#issuecomment-6896471788)와 [PR47](https://github.com/krdn/gon-stock03/pull/47)의 최신 상태.

## 독립 전달 당시 결과 (통합 전)

- 사용자 확인 탭 t74, session `01a1dfc6-fcfd-7773-9a91-0716aa25ebe1`에서 착수 응답 후 직접 구현했다. 추가 에이전트·부모 재위임 없음.
- 정수 벽시각과 전송 전 기준의 부족 간격을 재현했다. 원본100회 중 벽시각19ms 2회, 단조20ms 미만23회. 수정 후100회는 부족0회. 과거 CI의 정확한 스케줄은 로그만으로 복원하지 않는다.
- 단조 시계·동기 전송 직후 기준으로 변경했다. 간격값 유지, 테스트19ms 허용은20ms로 강화. RED3건→GREEN, 전체 단위/API84/84·빌드 PASS. [검증·한계](../verification/2026-11-16-kis-pacing.md).
- 이번 `gemini-4-argon-high`/high 리뷰: 전달 범위 PASS, P0/P1/P2 0건. 실제 init 일치, 서버 모델/effort 독립 확인 한계. P3 2건은 검증 기록에 판단을 남겼다.
- 제품 SHA `df50147f240d0c2ad36c78953e8dc99fcd3207de`. 제품 push/PR CI4개 SUCCESS, 원격 브라우저67 PASS. 최종 기록 커밋·CI·인계 댓글은 #48에서 확인한다.
- 인계 dry-run PASS. 작업 브랜치 ready는 미통합 main 차이로 FAIL, implementation-ready PASS. STE/graphify/번들 한계 보존. PR47 결합 미리보기의 충돌은 STATE/start-context 문서2개이며 결합 후 실행 회귀는 미검증.

## 착수 시 인계 근거

- 2026-11-16 [CI43714059921 첫 시도](https://github.com/krdn/gon-stock03/actions/runs/43714059921/attempts/1) 로그 재조회: 느린 guard 이후 daily page 테스트가 `transport spacing: 19ms`로 실패, 77개 중 76 PASS·1 FAIL.
- 착수 당시 구현은 `Date.now()`와 transport 직전 lastCall을 사용했다. 테스트는 transport 안에서 별도로 시각을 읽었다. 인계 시에는 측정 위치·시계 해상도·실제 간격 위반을 구분하지 못했으며 이번 재현 결과는 위에 기록했다.
- 최신 main 앱43724416483·구성43724416509 SUCCESS. 이 폴더의 문서 변경 전 `gon-workflow ready` PASS. PR47 head `7fac5aac71702e1a56a61173b1b556ee703f35d9`의 CI4개 SUCCESS.
- 기능 #9·11·12·13·14·17·18·19·22·25는 Project Blocked. #48은 주문 승인 대기와 분리한 기존 결함 조사다.
- 원본 실패 기록, STE 기준 파일·graphify 부재, #8 Fable 한도 오류를 보존한다.

## 다음 행동

PR49와 PR47의 결합 단위/API99·빌드·브라우저67·이번 Argon MERGE PASS 및 PR47 CI4개를 확인해 통합했다. 다음은 #9의 별도 사용자 결정·실증 승인 대기이며 후속 차단을 유지한다.

## 새 세션 시작 문구

> AGENTS·STATE와 #9 작업 기록을 확인해. #48/PR49는 통합됐으며 재조사하지 마. #9 승인·실증 미완료와 후속 차단을 유지해.
