# #129 오프라인 기능 목록과 관심종목 회귀

[이슈 #129](https://github.com/krdn/gon-stock03/issues/129) · [승인 설계](../plans/agent-evolution.md) · [설계 PR #132](https://github.com/krdn/gon-stock03/pull/132)

기준 main은 `6e88f877dd992c5f3f13c14fd287aa4b8aefd9d1`이다. Orca Run `run_2e122eaeec9a`, Task `task_6b89a2262c1b`, Dispatch `ctx_e571877231cf`. 자식 작업 경로는 `gon-stock03/pilot-129-offline`, Astra 세션은 `01a1f3e2-88c9-7ff3-b3ca-6da22661a748`이다. 세션에 기록된 첫 지시와 전달본을 대조했다. Orca는 이 터미널의 자동 생존 판정을 제공하지 않아 Dispatch 소유자와 실제 CLI 세션을 대조한다.

| 같은 외부 검사 | 수정 전 71a7a54 | 수정 후 7bcea9d |
|---|---:|---:|
| 최초 503에서 표시한 예시 행 / 시세 요청 | 4 / 4 · RED | 0 / 0 · GREEN |
| 재확인 후 확정된 빈 목록 | 통과 | 통과 |
| 기존 목록 확인 후 503 | 1행 보존·변경 잠금 | 1행 보존·변경 잠금 |
| 거래일지 저장 실패 | 초안 보존·새 저장 0건 | 초안 보존·새 저장 0건 |

[검사 해시·관찰값·중복 요청](../verification/129-replay.json). 최초 평가기 초안에서 거래일지 모의 응답 문구가 서버 계약과 달라 대조군이 시간 초과됐다. 실제 저장 오류 문구를 사용하고 앱 기동 전에 가상 시계를 설치해 두 버전을 다시 측정했다. 과거 수정은 제품 개선 건수에서 제외한다.

재생은 Linux에서 기준 lockfile로 격리 준비한 Node 24 의존성(`npm ci --offline --ignore-scripts`)과 Playwright Chromium headless shell 1255를 사용한다. 별도 빈 상태 디렉터리에서 다음 명령을 `before`와 `after`에 각각 실행한다. 같은 키의 동시 요청은 running, 완료 뒤 재요청은 보관한 결과를 돌려준다. 실행 도중 중단된 키는 자동 재실행하지 않는다.

```sh
python3 scripts/pilot/replay.py before --state "$PILOT_STATE" --deps "$PILOT_DEPS" --browsers "$PILOT_BROWSERS"
```

평가기는 매회 새 마운트·PID·네트워크 네임스페이스, 빈 환경, 읽기 전용 검사, 메모리 DB와 내부 4314를 사용했다. 호스트 홈·공유 Git 이력·운영 원장·도커 소켓은 평가기 마운트에 없다. 별도 네임스페이스에서 loopback만 있고 외부 경로가 비었으며, 호스트의 4303과 문서용 외부 IP에 연결할 수 없었다. 실제 브로커·운영 계정·장중 화면은 미측정이다.

`node --import tsx scripts/pilot/inventory.ts`는 15화면과 추가 매매 설정·공통 서비스를 포함한 186개 행을 출력했다. 테스트 선언에 연결된 항목도 개별 실행 근거가 들어오기 전까지 미측정으로 둔다. 합성 변경에서 새 화면, 별도 경로, 수용 조건 추가, 없는 제목을 각각 찾아냈다. [검사 연결 및 변형 결과](../verification/129-inventory.json)

첫 작업자 패치는 고정된 TypeScript 7.0.2의 기본 export에서 구 컴파일러 API를 호출해 실패했다. 기존 소유자 종료 확인 뒤 같은 세션의 수정 Dispatch `ctx_005f0832474b`가 Rolldown 파서로 바꿨다. 통합 검증에서 총괄이 TS/TSX 언어 옵션을 명시하고 중첩된 HTTP 검사 대신 이를 포함하는 실제 최상위 검사 제목을 연결했다. 두 Dispatch의 작업자 합계 397.75초, 모델 요청 2회다. SDK 요청·후처리 모델은 gpt-6.2-astra, 요청 effort는 high, 공급자 내부 effort·청구액은 미측정이다. 로컬 모드의 호스트 스킬 탐색이 중첩 네임스페이스에 막혔으며 패치는 제공한 공개 입력으로만 작성했다.

Fable 5.2/high는 Claude 구독 로그인 상태에서 사용 크레디트 필요 오류를 반환했다. 리뷰 본문·반환 모델은 없으며 독립 리뷰 대기다. 추가 지출은 없다. 그래프를 갱신하고 별도 TypeScript 검사를 통과했다. 다음 행동은 독립 리뷰와 원격 application·configuration 대조다.
