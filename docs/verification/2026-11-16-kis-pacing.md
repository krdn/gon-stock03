# #48 KIS 요청 간격 검증

범위: [#48](https://github.com/krdn/gon-stock03/issues/48), 기준 `6839743eb3abdf12612880d4c6fdb3266d9c502e` (main `034f7e7` + 준비 기록). 실제 KIS 호출 없이 fake transport로 검사했다.

## 원인과 재현

[#21 최초 CI](https://github.com/krdn/gon-stock03/actions/runs/43714059921/attempts/1)의 job `132811663970`을 재조회했다. 느린 guard 뒤 daily page 검사에서 `transport spacing: 19ms`, 76 PASS·1 FAIL이다. 이 로그에는 내부 기준 시각·단조 시각이 없으므로 당시 OS 스케줄이나 벽시계 조정까지 확정할 수 없다.

기존 코드는 정수 벽시각 `Date.now()`를 전송 직전에 저장했다. 이 기준은 두 경계에서 부족하다.

- **정밀도와 조기 깨움:** 실제 시작 60.75ms를 60ms로 기록하면, 80.25ms에서 정수 차이는20이지만 실제 차이는19.5다. 기존 반복 검사가 정수 시각만 다시 읽어 이를 놓친다.
- **전송 경계:** 기준을 저장한 뒤 동기 전송 준비가7ms 걸리면 실제 전송 관측부터 다음 전송까지13ms만 남을 수 있다. 벽시각이 앞으로 이동하는 경우에도 경과시간을 과대평가한다.

원본과 같은 auth→40ms guard가 있는 POST→dailyPage 순서를100회 실행했다. transport 입구에서 벽시각과 단조 시각을 함께 측정했다. [측정값](assets/kis-pacing/measurements.json), [반복 스크립트](assets/kis-pacing/probe.mts).

| 조건 | 20ms 미만 벽시각 | 20ms 미만 단조 시각 | 최소 단조 간격 |
| --- | ---: | ---: | ---: |
| 수정 전100회 | 2 | 23 | 19.396680ms |
| 수정 후100회 | 0 | 0 | 20.315971ms |

19ms 관측 중 하나의 단조 간격은19.971397ms였다. 표시 오차만으로 치부할 수 없는 실제 부족 간격이다. 결정적 시계/타이머 검사도 수정 전 **19.5ms·0ms·13ms**로 실패했다([RED](assets/kis-pacing/red.txt)). 이 재현은 제품의 결함 경로를 확정하지만, 과거 CI 한 번의 정확한 스케줄을 복원한 증거는 아니다.

## 수정과 보존

`server/kis.ts`의 공유 send 큐에서만 경과시간을 `performance.now()`로 측정한다. transport가 Promise를 반환하거나 동기 예외를 던진 직후에 기준을 저장한다. 다음 전송은 이 기준부터 간격을 채우므로 기준 저장 전의 동기 지연을 제외하지 않는다. 응답 완료 시각을 기준으로 삼지 않아 느린 응답 뒤 간격을 중복 적용하지 않는다.

기본1100ms와 테스트20ms는 유지한다. 기존 공유 endpoint 검사의19ms 허용을20ms로 강화했다. 타이머 조기 깨움의 재검사, guard 순서, 큐 상한, 인증 갱신/발급 제한과 POST 재전송 금지는 보존한다. 전송 실패도 기준을 남기고 후속 큐가 진행한다. 첫 요청에는 가상의 이전 요청을 만들지 않는다.

[Node24 performance.now](https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html#performancenow)는 프로세스 기준 고해상도 시각을 제공한다. [Node 타이머](https://nodejs.org/api/timers.html#settimeoutcallback-delay-args)는 정확한 실행 시각을 보장하지 않으며 소수 delay를 절삭한다. [단조 시계 명세](https://www.w3.org/TR/hr-time-3/#monotonic-clock)는 벽시계 조정과 경과시간을 분리한다. 확인한 문서 버전과 기존 프로젝트 자료의 원래 확인 시각은 [시작 기록](../start-context.json)에 구분했다.

## 검사와 전달

- Node24.22.2, 잠금 파일 `npm ci` 완료. 수정 전 전체 단위/API79/79 PASS는 간헐 결함의 해결 증거로 사용하지 않았다.
- `tsx --test --test-name-pattern='pacing preserves' tests/kis.test.ts`: 수정 전3/3 FAIL, 수정 후 PASS. 조기 깨움·벽시계 전진·동기 전송 지연의 회귀다.
- `npm test`: 수정 후 **84/84 PASS**. 인증 제한·429/503 조회 무재시도·401 POST 무재전송·guard 차단·공유 큐를 포함한다. 추가로 동기 전송 예외와 느린 응답의 대기 경계를 검사했다.
- `npm run build`: PASS. 기존515.65kB 번들 경고 유지. UI 변경이 없어 추가 로컬 브라우저 검사는 생략하며 원격 기본 CI의 브라우저 회귀는 확인한다.
- 반복 실행: `node_modules/.bin/tsx docs/verification/assets/kis-pacing/probe.mts`. 위100회는 원본과 수정본에 같은 스크립트를 사용한 비교다.
- `gon-workflow implementation-ready .`: PASS. 최초 실행은 최상위 조사 시각 만료로 실패했다. #48의 공식 자료 확인 시각을 기록하고 기존 프로젝트 자료의 시각을 별도 보존한 뒤 통과했다.
- `gon-workflow ready .`: 준비 커밋과 기본 main의 차이로 FAIL. 인계 당시 main 기준 PASS와 구분한다. 이를 우회하려고 PR을 병합하지 않는다.
- `git diff --check`: PASS. STE lint는 기존 `docs/conventions/ste100-writing.md` 부재로 exit2. graphify 부재와 #8 Fable 한도 오류는 보존한다.
- 문서 로컬 링크8건 PASS. 원격 CI·PR·최종 SHA는 push 후 확인한다.

## 이번 지정 리뷰

중앙 설정의 Gemini 기본은 `Gemini 3.8 Flash (High)`다. 사용자 지정이 우선하므로 설정을 바꾸지 않고, 로컬 `agy models`에서 확인한 `gemini-4-argon-high`와 effort `high`를 직접 지정했다. `review-llm --dry-run`의 중앙 기본값과 이 명시 호출을 구분한다.

[실제 반환](assets/kis-pacing/argon-review.json): SUCCESS·초안 PR 전달 범위 **PASS**, P0/P1/P2 0건·P3 2건. session `ce738d66-c4cf-431c-b40f-0ac4b3c048a5`. init 모델은 요청과 같은 `gemini-4-argon-high`다. 응답은 Argon High 설정 적용을 자술했으나, 결과에 별도 서버 모델/effort 필드는 없어 독립 확인되지 않는다. 응답 step은 `agent_response`뿐이며 추가 위임·도구 실행은 없다.

P3의 타이머 mock 통일 제안은 후속 두 검사가 정수 시각만 다루므로 현재 결함이 아니다. 미래 확장을 위한 helper는 추가하지 않았다. P3의 증거 파일 포함 요청은 이번 커밋 목록과 링크 검사로 확인한다. 제품 파일 해시는 [리뷰 대상](assets/kis-pacing/review-manifest.json)과 일치한다. 리뷰 뒤 제품 코드를 변경하지 않았다.

실제 KIS 인증/조회/주문/취소/전략 호출은 없다. transport 호출 간격은 서버 도착 간격이나 KIS 계정별 한도 실증이 아니다. #9 원본 브랜치·`.codex/`, PR47 Draft와 #9 OPEN/Blocked·후속 차단을 유지한다. #48의 통합·사용자 수용 및 #9과 공통 파일 통합 후 회귀는 별도 단계다.
