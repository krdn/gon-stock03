# 연결·설정 동작 점검

2026-11-17 KST. 대상 `http://127.0.0.1:4303/settings`, 코드 `3f5366c456137a53a4a1bc845f88d3f1d2914c3e`. [후속 설계](../plans/settings-recovery-2026-11.md).

## 결론

화면과 기존 오류 처리 기능은 작동한다. 현재 서버는 필수 KIS 값 4개가 미주입 상태여서 실제 연결을 완료할 수 없다. 이는 UI 고장이나 Infisical 서비스 장애의 증거가 아니다. 현재 화면은 비밀값 편집·저장 기능이 없는 연결 진단 화면이다.

실행 서버의 cwd는 `/home/gon/llm-projects/gon-stock03`이다. 이번 작업 worktree와 HEAD가 같고 Settings 및 KisClient 파일도 동일하다. 실행 프로세스가 최신 디스크 코드를 모두 재로딩했는지까지 증명한 것은 아니다. #8 CLOSED, PR #31 MERGED, 해당 PR application/configuration 검사 SUCCESS를 다시 조회했다.

## 검증 결과

| 대상·방법 | 결과 | 한계 |
| --- | --- | --- |
| 실제 4303 화면 로드 | 로컬 서버 연결, KIS 미연결, 4개 변수명 미주입 표시 | 값·인증정보를 조회하지 않음 |
| 상태 새로고침 클릭 | GET /api/state 200, 미주입 상태 유지 | 외부 KIS 연결 검사가 아님 |
| 안전한 연결 안내 펼침 | 환경·경로·4개 변수·재시작 명령 표시 | 실제 주입은 수행하지 않음 |
| 390×844 모바일 | scrollWidth 390, 입력란 0개 | 안내 펼친 상태 기준 |
| 실제 페이지 axe #main | 위반0, 미완료0, 통과25 | 전체 접근성 수용을 대신하지 않음 |
| 브라우저 오류 | JS 예외 없음, favicon.ico 404 관측 | favicon은 연결 기능에 영향 없는 부수 문제 |
| KIS·HTTP 검사 | `node --import tsx --test tests/kis.test.ts tests/http.test.ts`: 35/35 PASS | 가짜 transport·격리 저장소 |
| 설정 E2E | `npm run test:e2e -- tests/browser/settings.spec.ts`: 12/12 PASS | 4314, 메모리 DB, KIS 변수 강제 공백·응답 대체 |
| 타입·빌드 | `npm run build` 성공 | 기존 JS 번들 500kB 경고 |

최초 검사 실행은 worktree 의존성 부재로 실패했다(tsx, node/vite 타입 없음). `npm ci --ignore-scripts` 후 위 검사를 다시 실행했다. 실패를 기능 오류로 분류하지 않는다.

35건은 미주입·형식, 인증/잔고 단계, 오류 분류, 토큰 만료·발급 대기·갱신 경쟁, 페이지 누락·중복·합계 변경, 이전 정상 잔고 보존, 호출 간격·동시 요청 합류, 비밀 비노출, HTTP 요청 경계를 포함한다. 12건은 미주입, 조회 중/성공/재실패, 9종 오류 복구, 만료 및 로컬 서버 단절을 확인한다.

## 추가 발견

- F1 — 운영 차단: 네 필수 값이 실행 서버에 없다. `KisClient.fromEnvironment()`는 생성 시 환경을 읽는다(`server/kis.ts:40`). 상태 새로고침으로 주입하거나 재설정하지 않는다. Infisical에 값 자체가 없는지, 실행 명령이 주입을 누락했는지는 미확인이다.
- F2 — 복구 결함: `src/App.tsx:76`의 POST fetch에는 시간 제한이 없다. `src/pages/Operations.tsx:118`은 조회 중 새로고침도 잠근다. Playwright로 모든 API를 차단/대체한 뒤 check 응답을 보류하고 가상시계 120초를 진행하자 두 버튼이 계속 비활성 상태였다. 이때 상태 fixture도 오래되어 서버 확인 필요 표시가 나왔다. 실제 120초 네트워크 장애를 일으킨 결과는 아니다.
- F3 — UX 보완: retryAt을 미래로 둔 응답에서 인증 대기 중에도 연결 확인 버튼이 활성이다. 페이지의 필수 값 표시를 기다린 뒤 재확인했다. 서버에는 발급 대기 방어가 있으므로 즉시 외부 재발급된다는 뜻은 아니다.
- F4 — 진단 한계: instanceId는 API에 있으나 사용자가 현재 서버를 식별할 정보가 부족하다. 주입 실패 후 이전 서버를 보는 상황을 안내 문구만으로 구별해야 한다.

실제 KIS API·주문·취소·서버 재시작·Infisical 인증 변경은 수행하지 않았다. `docs/STATE.md`의 거래 제한을 유지했다. 이전 11월 15일 조회 기록은 이번 실행의 성공 증거로 쓰지 않는다.

문서 검증: 상대 링크 검사 PASS. `evolve docs ste-lint --strict --changed refs/remotes/origin/main --added`는 기준 `docs/conventions/ste100-writing.md` 부재로 exit2였다. 문체 검사 통과로 기록하지 않는다.
