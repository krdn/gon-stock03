# #9 조건부 모의 실행 준비 검증

2026-11-16. **준비 검증이며 실제 KIS 업무 호출은 0회다.** [승인 기록](https://github.com/krdn/gon-stock03/issues/9#issuecomment-6897995215)과 [실행 절차](../operations/kis-minimum-paper-run.md)를 기준으로 한다. #9 OPEN/Blocked·후속9개 차단을 유지한다.

## 기준과 변경

- 시작 `84220d19ac5095311c037b0de9fb6d69abf7bbc4`: [앱43738214984](https://github.com/krdn/gon-stock03/actions/runs/43738214984)·[구성43738215092](https://github.com/krdn/gon-stock03/actions/runs/43738215092) SUCCESS를 재조회했다. main `3f3bee6`의 앱43736920136·구성43736920132도 SUCCESS다.
- 기존 경로는 일반 주문을 위해 만들어져 서로 다른 ID의 두 번째 주문·10:10 이후 전송·응답 후 정지·120초 조회 종료를 강제하지 않았다. 새 승인 경계 fixture5개에서 예상한 assertion 실패로 재현했다.
- `server/paper.ts`: 선택적 승인 모드로 종목·방향·1주·금액·시간·현재가·호가 단위·보유/미체결·현금 여유를 검사한다. 요청 시작과 pacing 뒤 전송 직전 시간창을 다시 확인한다. 종료 시 위험정지한다.
- `server/store.ts`: SQLite `paper_run`에 날짜·ID와 시도 소비를 기록한다. 새 ID·날짜·설정 생략으로 재시작할 수 없다. 기존 `sending` 선저장·감사 트랜잭션은 유지한다.
- `server/kis.ts`: 승인 시도 종료 뒤 최대120초의 전체 요청 제한. 단조시계와 벽시각 중 이른 한도, 남은 시간으로 응답 AbortSignal 설정. 주문 POST 재시도는 없다.
- `server/index.ts`·`server/http.ts`: 환경의 명시적 승인 JSON을 기존 `/api/kis/order`로 연결한다. 영구 `STOCK_DB`를 요구하고 로컬 원장 GET으로 제한 활성 여부를 확인한다. 새 UI·예약·자동 시작은 없다.

## 실행한 검사

| 검사 | 결과·증거 범위 |
| --- | --- |
| 승인 회귀 RED | 5개 assertion 실패. 앞선 tsx IPC EPERM은 환경 실패로 분리하고 허용된 로컬 IPC 실행으로 재현했다. |
| `npm test` | 110/110 PASS. 기존99 + 승인11. SQLite 파일 재시작·중복 동시 요청·소비 기록 실패·HTTP 경로·진행 중 조회 중단·벽시계 역행 포함. |
| `npm run build` | PASS. 기존 500kB 번들 경고 유지. |
| `npm run test:e2e` | 67/67 PASS, 48.7초. KIS 키를 비운 서버와 브라우저 fixture. 실제 화면의 장중 수용은 아니다. |
| 백업·잠금 예행 | 임시 합성 SQLite에서 읽기 전용 backup·WAL 반영·quick_check·건수·해시·0600·flock 경합 거부 PASS. 실제 원장 백업은 아직 없다. |
| `implementation-ready` | PASS. 공식 KIS 공개 현금주문·미수 없는 매수가능 예제를 재확인해 task_contexts에 추가했다. |
| `gon-workflow ready .` | 미통합 준비 브랜치와 원격 기본 main 차이로 exit1 실패. 구성/CI 성공과 구분하며 병합으로 우회하지 않는다. |
| 문서·diff | 상대링크20개·whitespace PASS. 원본 RED 로그의 행말 공백만 정규화했다. 최종 원격 결과는 인계 댓글 확인. |

새 HTTP fixture의 동적 포트를 허용 목록에 넣지 않은 첫 검사는 107/108이었다. 기존 Host 보호로403이 발생한 테스트 구성 결함이다. 실제 포트 허용 목록과 상태코드 assertion을 적용한 뒤108/108을 확인했다. 실패를 제품 성공으로 재분류하지 않았다.

## 로컬 구성과 남은 사실

- 4303/4304 listener와 해당 프로젝트 서버 프로세스0개를 준비 시점에 확인했다. 실행일 단일 서버 확인을 대체하지 않는다.
- 전용 cwd의 기본 원장은 없다. 원본 `.local/workspace.sqlite`는 존재(40,960byte)만 확인했다. 내용·계좌 연결·주문 상태는 읽지 않았고 수정하지 않았다.
- Infisical YAML의 프로젝트 ID 형식만 확인했다. 현재 프로세스의 KIS 필수 환경변수4개는 모두 없다. 로그인·주입·토큰·계좌 인증은 검사하지 않았다.
- 실행일·공식 개장·앱과 API 계좌 일치·앱 잔량 취소 가능성·최신 마스터/시세/잔고/원장은 미확인이다. KRX 공개 안내 재조회403은 개장 확인 실패로 남긴다.
- 원본 폴더·#48 worktree·`.codex`·다른 세션은 변경하지 않았다. 실제 원장 이관/백업과 단일 서버 기동은 별도 수동 시작 뒤에 수행한다.

## 지정 리뷰와 한계

중앙 `review-models.json`과 `review-llm --dry-run`은 Claude Opus5.5/high이며 Gemini 항목은3.8Flash(High)다. 사용자가 지정한 Gemini4Argon을 `agy models`에서 확인했고 `gemini-4-argon-high / high`로 직접 리뷰한다. 래퍼에 모델 override가 없어 중앙 파일을 수정하지 않고 명시 CLI 인자를 사용한다. 대체모델·effort 승격·추가 에이전트 없음.

[Argon 리뷰](assets/paper-preflight/argon-review.json)는 PREPARATION PASS, P0/P1/P2 0·P3 3건이다. 요청과 CLI init 반환은 `gemini-4-argon-high`로 일치한다. 결과 SUCCESS·1턴·146.47초, 도구/재위임 호출 없음. 결과 자체에는 별도 서버 모델/effort 필드가 없어 서버측 실제 모델·effort의 독립 검증은 못했다. 샌드박스 로그/소켓 거부로 시작하지 못한 최초 호출은 리뷰 성공 횟수에 포함하지 않는다.

- P3 시세 예산: 운영 간격1100ms를 사용한 합성 transport에서도 승인 주문1건과 간격 불변식 PASS. 실제 KIS 지연은 미검증이며 자동 조회·경합이 생기거나5초를 넘으면 중단한다.
- P3 마스터 확인: 기존 `/api/market/quote`의 등록 종목 검사와 실행 절차의 공식 마스터 대조를 필수로 유지한다. 일반 주문 서비스에 중복 검사를 추가하지 않았다.
- P3 비정상 종료 표시: 시도 소비 후 재기동할 때 조회 차단과 함께 `risk.halted=true`도 저장하도록 보완했다. 전송중 원장 fixture에서 RED(false)를 확인하고 GREEN, 단위/API110·빌드 PASS. 수정분 [Argon/high 재검토](assets/paper-preflight/argon-followup.json)도 PREPARATION PASS(P0/P1/P2/P3 신규0), 57.38초·1턴으로 완료했다. 요청/init 일치와 서버 모델·effort 독립 확인 한계는 동일하다. 기존 조건부 승인을 취소하거나 새로 요구하는 리뷰가 아니다.

STE strict는 `docs/conventions/ste100-writing.md` 부재로 exit2 실패했다. graphify도 설치되지 않아 해당 검증을 수행할 수 없다. 과거 #8 Fable 한도 오류·#21 초기 CI의 정확한 스케줄 복원 한계는 보존한다. fixture·CI·리뷰는 실제 접수·체결·취소·불명 복구·공식 달력·연속 운영·V01 증거를 대신하지 않는다.
