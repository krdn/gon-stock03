# 작업: 연결·설정 복구

기준 이슈: https://github.com/krdn/gon-stock03/issues/71 (기존 #8 후속).

- 상태: 구현 착수. 2026-11-17 부모가 구현 소유권을 이 세션에 전달했다.
- 목표·완료 조건: 실행 서버 식별·미주입 진단, 유한한 조회 대기, 상태 새로고침 복구, 인증 대기 UI. 상세 체크리스트는 #71을 기준으로 한다.
- 범위: 연결 진단/조회 경로·계약·UI·회귀 검사. 실제 KIS 업무 API·주문·취소·예약은 현재 STATE 제한을 유지한다.
- 브랜치: `세부작업`. 최초 설계 기록 `6d7045b`. 최신 기준 main `005a80e`를 병합해 설계 PR72의 STATE 충돌을 해결한다. PR72 통합 확인 후 별도 `feat/71-settings-recovery` 브랜치에서 시작한다.

## 먼저 읽을 자료

- #71, 해당 이슈에서 연결한 설계 PR과 CI.
- [설계](../plans/settings-recovery-2026-11.md), [검증](../verification/2026-11-17-settings-audit.md).
- [워크플로](../WORKFLOW.md)의 세션별 작업과 재개, [Infisical](../INFISICAL.md)의 연결·설정 화면.
- 구현할 단계의 `src/App.tsx`, `src/pages/Operations.tsx` Settings, `server/kis.ts` balance/send, `server/http.ts` state/check, `shared/model.ts`, `shared/contracts.ts`만 확인한다.

## 현재 결과

- 4303 화면은 동작하지만 필수 변수 4개 미주입. 실행 경로는 `/home/gon/llm-projects/gon-stock03`이며 검사 당시 코드 HEAD는 작업 worktree와 동일했다.
- KIS·HTTP 35/35, 설정 브라우저 12/12, 빌드 통과. 실제 KIS 호출 미실행.
- 미응답 시 버튼 잠김, 인증 대기 중 확인 버튼 활성 문제를 응답 대체로 확인했다.
- 문서 링크·diff 검사 통과. STE 기준 파일 부재로 문체 검사 exit2.
- GitHub 연결 도구 이슈 생성403 후 인증된 gh로 #71 생성. 기존 #8의 완료 상태는 유지한다.

## 다음 행동

#71·설계 PR72·최신 main과 CI를 확인하고 설계 1단계부터 구현한다. `gon-workflow resume . --issue https://github.com/krdn/gon-stock03/issues/71 --task docs/tasks/71-settings-recovery.md --plan docs/plans/settings-recovery-2026-11.md --pr https://github.com/krdn/gon-stock03/pull/72`로 기록을 대조한다. 새 구현 브랜치도 먼저 푸시한다.

현재 실제 KIS 인증·업무API·WebSocket·주문·취소·예약·외부알림은 금지다. 주입/인증 실행도 이번 요청으로 허용됐다고 해석하지 않는다. 서버 식별 UI와 fake transport·임시DB 기반 복구 구현은 가능하다. 실제 연결 검증 항목은 별도 승인 전 미검증으로 남긴다.

완료 경계의 검증 모델은 `claude-fable-5-2`/high(사용자 표기 claude-fable-5-2-high) 또는 `gemini-4-argon-high`/high만 사용한다. 이번 부모에서 Fable 한도 소진을 확인했으므로 Argon을 사용할 수 있다. 다른 모델 자동 대체 없음. 요청/init과 실제 반환 모델·effort 확인 범위를 구분한다.

부모가 탭·세션 ID·cwd를 확인한 뒤 구현 소유권을 새 세션에 넘긴다. 부모와 새 세션은 같은 파일을 동시에 수정하지 않는다. 추가 독립 에이전트·부모 검증 재위임은 하지 않는다. 원격 이슈·PR·CI와 작업 기록을 갱신하며 완료까지 진행한다.

## 새 세션 시작 문구

> GitHub krdn/gon-stock03 #71과 연결된 설계 PR·CI, docs/tasks/71-settings-recovery.md 및 필수 자료를 확인하고 연결·설정 복구 구현을 진행해. 최신 main과 설계 통합 상태를 먼저 확인하고 실제 KIS API 실행 제한은 유지해.

## 2026-11-17 다음 작업 점검

- 원격 열린 구현 이슈는 #71이다. #25는 별도 장중 실증 Blocked이며 #1/#2/#3은 상위 묶음이다. 새 독립 결함 이슈를 추측으로 만들지 않는다.
- 기존 main은 UI 초기/DEMO 표시·배치 수용을 포함한 005a80e다. PR72의 충돌은 STATE 한 파일이며 제품 코드는 최신 main 그대로 보존한다.
- 중앙 gon-github-workflow PR28/main 81c87bc와 설치된 resume을 사용한다. 현재 worktree의 graphify-out/은 보존하며 새 구현은 별도 clean worktree에서 시작한다.
- 인계 설계 검토: `gemini-4-argon-high`/요청 high, conversation `1a85854b-4934-4352-a343-3e79b9f35b88`, SUCCESS·PASS·차단0. 요청/init 모델 일치, 서버 내부 모델·effort는 결과에 별도 반환되지 않아 독립 확인 불가. 리뷰는 제공 diff만 검토했고 실제 제품 동작을 실행하지 않았다. 실제 연결 미검증 유지·PR72 통합/CI·clean worktree 원격 푸시·resume·탭/세션/cwd 확인 후 소유권 이전 순서를 확인했다.

## 구현 소유권 인계

- 부모 확인: Herdr 탭 `#71 연결·설정 복구`, terminal `t7y`, 세션 `01a1e52f-2eba-7a40-9aa7-4ffac600c0cd`, 현재 worktree와 Ready 화면. 이 항목은 부모의 관측 보고다.
- 이 세션 확인: `feat/71-settings-recovery`, 기준 `0d2b33a0aaad65fa8e94d043e1157fdd586d1b87`, clean, resume PASS, PR72 MERGED·CI4 SUCCESS.
- 설계 1~3단계·격리 회귀·지정 외부 리뷰·PR/CI까지 소유한다. 추가 에이전트와 부모 검증 재위임 없음. 실제 주입·KIS·기존 서버 재시작·main 통합·사용자 수용은 포함하지 않는다.
