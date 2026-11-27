# Orca 개발 서버 실행 및 테스트 가이드

| 포트 | 역할 |
| --- | --- |
| `4303` | Vite 개발 화면. `/api` 요청을 `127.0.0.1:4304`로 프록시한다. |
| `4304` | 로컬 API. 기본 DB는 실행한 checkout의 `.local/workspace.sqlite`다. |
| `4314` | Playwright의 격리 서버. 빌드된 화면과 API를 함께 제공한다. |

## 워크트리와 실행 중인 서버 확인

Orca 사이드바에서 실행 대상 워크트리를 선택하고 터미널에서 `pwd`와 `git rev-parse --short HEAD`로 경로와 리비전을 확인한다. 아래 `orca`는 Orca IDE CLI를 뜻한다. Orca 터미널 밖에서는 설치된 IDE CLI(예: Linux의 `orca-ide`)를 사용한다.

`--worktree <worktree-selector>`에는 대상 워크트리의 선택자를 넣는다. 아래 `path:`는 메인 checkout 예시다. 경로로 구분할 수 없으면 `orca worktree list --json`에서 정확한 ID를 골라 사용한다. `id:a58b130b-e45c-432d-9d51-628c93a94bfc::/home/gon/llm-projects/gon-stock03`은 특정 시스템의 UUID 예시다.

```bash
orca worktree show --worktree path:/home/gon/llm-projects/gon-stock03
orca terminal list --worktree path:/home/gon/llm-projects/gon-stock03
orca ports --worktree path:/home/gon/llm-projects/gon-stock03
ss -H -ltnp '( sport = :4303 or sport = :4304 )'
```

`ss`는 Linux에서 같은 호스트의 리스너와 확인 가능한 PID를 보여 준다. 표시된 각각의 PID를 `ps -p PID -o pid,ppid,comm`과 `readlink /proc/PID/cwd`에 넣어 프로세스와 실제 checkout을 확인한다. 프로세스 환경이나 전체 명령행은 출력하지 않는다.

두 포트가 의도한 checkout의 같은 개발 실행에 속하고 필요한 버전과 설정을 사용하며 아래 상태 확인이 통과하면 기존 터미널과 주소를 재사용한다. 포트 하나만 있거나 경로·소유자가 다르거나 확인할 수 없으면 기동을 보류하고 실행 소유자에게 확인한다. 운영 중인 checkout에서 `npm ci`를 실행하거나 기존 프로세스를 임의로 종료하지 않는다.

## 개발 서버 기동과 확인

두 포트가 비어 있고 해당 checkout을 실행할 권한이 있을 때, Orca의 대상 터미널에서 의존성을 설치한다. 일반 개발에 쓰는 셸을 사용하고 전용 거래 승인·전략 계약·장전 자동화 설정을 가져오지 않는다.

```bash
node --version  # v24.x
npm ci
npm run dev
```

설치를 마친 뒤 Orca CLI로 새 실행 터미널을 만드는 방법도 있다. 아래 명령은 위의 `npm run dev`와 같은 서버를 기동하므로 한 곳에서만 실행한다. 워커가 만든 실행 터미널을 작업 종료 뒤에도 유지하려면 `--keep-open`을 붙인다.

```bash
orca terminal create --worktree path:/home/gon/llm-projects/gon-stock03 \
  --title dev-4303 --command 'npm run dev'
```

`npm run dev`는 웹과 API를 함께 시작한다. 기존 KIS 환경 설정을 사용하거나 [KIS 자동 주입 가이드](kis-auto-injection.md)에 따라 Infisical의 `dev /kis` 설정을 API에 전달한다. `npm run dev:realtime`은 기동 전에 모의 WebSocket 접속키를 요청하는 별도 경로이며 실제 구독은 별도다. 일반 개발·테스트 절차에서는 기본 명령을 사용한다. 자신이 시작한 개발 실행을 끝낼 때는 해당 터미널에서 `Ctrl+C`를 누른다.

기동 후 리스너를 다시 확인하고 API 응답과 Vite 프록시를 각각 점검한다. 아래 명령은 GET 응답 본문을 버리고 HTTP 코드만 출력한다. 헤더·상태 JSON·계좌 정보는 공유 로그에 남기지 않는다.

```bash
curl --noproxy '*' -fsS --max-time 5 -o /dev/null -w 'API %{http_code}\n' \
  http://127.0.0.1:4304/api/state
curl --noproxy '*' -fsS --max-time 5 -o /dev/null -w '웹 프록시 %{http_code}\n' \
  http://127.0.0.1:4303/api/state
```

두 응답이 `200`이면 로컬 API와 프록시 경로가 응답한 것이다. 연결 거부·시간 초과·비정상 상태가 나오면 각 포트의 리스너와 소유 터미널에서 초기 오류를 확인한다.

## Orca 내장 브라우저 열기

실행 대상 워크트리의 Orca 터미널에서 대시보드를 오른쪽 분할 창으로 연다. `--focus`는 선택 옵션이다. 창을 표시할 수 없는 호스트에서는 분할 대신 일반 탭으로 열릴 수 있다.

```bash
orca tab create --url http://127.0.0.1:4303/dashboard --split right
```

브라우저를 열면 화면에서 API 요청이 발생한다. 브라우저를 열기 전에 읽기 전용 상태만 확인하려면 위의 `curl`을 사용한다.

## 격리 워크트리에서 검사

검사 대상 checkout에서 Node 24와 `npm ci`로 의존성을 준비한다. 아래 예시는 Linux에서 필요한 `PATH`와 `HOME`만 전달해 기존 서버나 거래 실행에 사용하던 환경변수의 상속을 피한다. E2E를 실행하기 전에 `ss`로 `4314`와 일부 브라우저 테스트가 쓰는 로컬 fixture 포트 `4332`, `4387`이 비어 있는지 확인한다. 이미 사용 중이면 소유자의 실행이 끝난 뒤 다시 확인하거나 격리된 CI에서 실행한다.

```bash
env -i PATH="$PATH" HOME="$HOME" npm test
env -i PATH="$PATH" HOME="$HOME" npm run build
env -i PATH="$PATH" HOME="$HOME" npx playwright install chromium
ss -H -ltnp '( sport = :4314 or sport = :4332 or sport = :4387 )'
env -i PATH="$PATH" HOME="$HOME" npm run test:e2e
```

- `npm test`는 `tests/*.test.ts`를 실행한다. HTTP 테스트 헬퍼는 OS가 배정하는 임시 포트를 사용하고 테스트는 메모리 또는 임시 파일 DB를 사용한다. `npm run build`는 타입 검사 후 `dist/`를 생성한다. 두 명령에 `4314` 개발 서버를 띄울 필요는 없다.
- `npm run test:e2e`는 `tests/browser`를 대상으로 한다. [Playwright 설정](../../playwright.config.ts)은 [E2E 서버 스크립트](../../scripts/e2e-server.ts)를 실행해 `4314`를 열며, 기존 리스너를 재사용하지 않는다. 스크립트는 `STOCK_DB=:memory:`를 지정하고 KIS 연결용 자격증명을 비운다. 일부 케이스는 브라우저 응답 fixture나 별도 테스트 서버·임시 DB를 사용한다. 브라우저 검사 결과는 이 테스트 환경의 동작을 보여 준다.
- 실패 시 첫 오류와 실패한 테스트 이름을 확인한다. 빌드 오류는 타입 검사·Vite 로그에서, 서버 기동 오류는 `dist/` 생성 여부와 사용 중인 포트에서, 브라우저 오류는 `playwright-report/`와 실패 시 남은 `test-results/` 트레이스에서 확인한다. 파일 단위 재실행도 같은 격리 환경에서 `npm run test:e2e -- tests/browser/data-status.spec.ts`처럼 경로를 지정한다.

별도의 [파일럿 리플레이](../../scripts/pilot/replay-entry.sh)도 자체 격리 환경에서 같은 서버 스크립트와 `4314`를 사용한다.

실행 스크립트와 운영 절차는 [package.json](../../package.json)과 [로컬 실행과 복구](local.md)를 참고한다.
