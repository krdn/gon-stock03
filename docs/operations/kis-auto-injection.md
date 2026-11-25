# KIS 모의 계좌 자동 주입 가이드

`npm run dev` 실행 시 **Infisical**에 저장된 KIS 모의 계좌 설정 4개를 로컬 API 서버(`127.0.0.1:4304`)로 자동 주입하는 방법을 정리한 운영 문서다.

- 이 앱은 **모의 투자(VTS) 전용**이며 평문 `.env` 파일을 자동 로드하지 않는다.
- 비밀값(`clientId`, `clientSecret`, `KIS_*`, 발급 토큰)은 Git 저장소·이슈·로그·대화에 남기지 않는다.

## 1. 주입 대상 변수 (`dev /kis`)

Infisical 프로젝트(`5fdf34cd-9a4e-4992-a82f-1472fb0a61b5`)의 `dev` 환경 `/kis` 경로에 아래 4개 키를 등록한다.

| 변수명 | 설명 | 형식 |
| --- | --- | --- |
| `KIS_APP_KEY` | KIS 모의 투자 앱 키 | 앞뒤 공백·제어문자 없는 문자열 |
| `KIS_APP_SECRET` | KIS 모의 투자 앱 시크릿 | 앞뒤 공백·제어문자 없는 문자열 |
| `KIS_CANO` | 모의 계좌번호 앞 8자리 | 숫자 8자리 (`^\d{8}$`) |
| `KIS_ACNT_PRDT_CD` | 모의 계좌 상품코드 | 숫자 2자리 (`^\d{2}$`, 보통 `01`) |

## 2. 자동 주입 우선순위 (`npm run dev`)

[scripts/dev.ts](../../scripts/dev.ts)와 [scripts/infisical-dev.ts](../../scripts/infisical-dev.ts)는 기동 시 아래 순서로 자격증명을 조회한다.

1. **현재 셸 환경변수**: KIS 4개 변수가 이미 모두 설정되어 있으면 추가 조회 없이 그대로 사용한다.
2. **Infisical Machine Identity (Universal Auth) — 권장**:
   - `INFISICAL_CLIENT_ID` 또는 `INFISICAL_CLIENT_SECRET` 환경변수가 있으면 환경변수 모드로 즉시 검증·인증한다(CLI로 폴백하지 않음).
   - 환경변수가 없으면 프로젝트 루트의 `.secrets/infisical-dev.json`(또는 `INFISICAL_AUTH_FILE` 지정 경로)을 읽어 단기 Access Token을 메모리에만 발급받고 `dev /kis` 비밀을 조회한다.
3. **Infisical CLI 폴백**:
   - 머신 인증 설정이 없을 때만 `infisical secrets-manager secrets get ... --env dev --path /kis -o json --silent`(15초 제한)를 실행한다.
   - 대화형 터미널(TTY)에서 CLI 응답 시간 초과(`ETIMEDOUT`, 사람 계정 로그인 세션 만료 가능)가 감지되면 자동으로 `infisical login --domain ...`을 실행한 뒤 재조회한다.
4. **실패 시 동작**:
   - 누락·충돌·인증 실패가 발생하면 부분 주입하지 않고(All-or-Nothing) 터미널에 복구 안내를 출력한 뒤 로컬 데모 모드로 시작한다. 실전 서버나 평문 파일로 자동 대체하지 않는다.

## 3. 권장 설정: Infisical Machine Identity (Universal Auth)

사람 계정(`infisical login`)의 Google OAuth/브라우저 세션 만료 없이 재기동할 때마다 무인으로 자동 주입하려면 Machine Identity를 사용한다.

### 1단계: Machine Identity 생성
1. [Infisical 대시보드](https://app.infisical.com)에 로그인한다.
2. **Organization → Access Control → Machine Identities**로 이동한다.
3. **Create Identity**를 클릭해 개발용 Identity를 생성한다.

### 2단계: Universal Auth 활성화 및 `Client Secret` 발급
1. 생성한 Machine Identity 상세 화면의 **Authentication** 카드에서 **Universal Auth**를 선택한다.
2. 표시되는 **`Client ID`** 를 확인한다.
3. **Client Secrets** 영역에서 **Add Client Secret**을 클릭해 **`Client Secret`** 을 발급·복사한다.
   - `Client Secret`은 **생성 직후 팝업에서 1회만** 표시된다. 창을 닫아 복사하지 못했다면 다시 조회할 수 없으므로 **Add Client Secret**으로 새 시크릿을 발급하고 기존 미사용 시크릿은 삭제(Revoke)한다.
4. 같은 Universal Auth 설정에서 아래 보안 옵션을 권장한다.
   - **Access Token TTL**: 기본 30일 대신 `300~600`초로 단축
   - **Access Token Num Uses**: 필요 최소 횟수로 제한
   - **Client Secret Trusted IPs**: 고정 IP 환경이면 허용 대역 제한

### 3단계: 프로젝트 최소 권한 연결
1. 대상 프로젝트(`5fdf34cd-9a4e-4992-a82f-1472fb0a61b5`) → **Access Control → Machine Identities → Add Identity**에서 방금 만든 Identity를 추가한다.
2. 권한을 **`dev` 환경의 `/kis` 경로 읽기 전용(Read-only)** 으로 최소화한다(쓰기·타 환경·실전 키 권한 금지).

### 4단계: 로컬 자격증명 파일 생성 (`.secrets/infisical-dev.json`)
프로젝트 루트에서 Git 제외 경로인 `.secrets/infisical-dev.json`을 생성하고 디렉터리 `0700`, 파일 `0600` 권한을 지정한다.

```bash
mkdir -m 700 -p .secrets
cat <<'EOF' > .secrets/infisical-dev.json
{
  "clientId": "<CLIENT_ID>",
  "clientSecret": "<CLIENT_SECRET>",
  "projectId": "5fdf34cd-9a4e-4992-a82f-1472fb0a61b5",
  "domain": "https://app.infisical.com"
}
EOF
chmod 600 .secrets/infisical-dev.json
```

> **환경변수 방식(선택)**: 로컬 파일 대신 `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, `INFISICAL_PROJECT_ID`(선택: `INFISICAL_DOMAIN`, `INFISICAL_ORGANIZATION_SLUG`)를 셸 환경변수로 주입해도 동일하게 동작한다. 파일 조회를 명시적으로 끄려면 `INFISICAL_AUTH_FILE=""`을 지정한다.

## 4. 대안 설정(CLI) 및 실행 명령별 적용 범위

| 실행 명령 | KIS 키 주입 방식 | 비고 |
| --- | --- | --- |
| `npm run dev` | **자동 주입** (Machine Identity 우선 → CLI 폴백) | 일반 개발 서버 (`4303` 웹 / `4304` API) |
| `npm run dev:realtime` | `infisical secrets-manager run --env dev --path /kis -- npm run dev:realtime` | `.secrets/infisical-dev.json` 자동 주입 범위 외. `KIS_HTS_ID`·`KIS_WS_SESSION` 및 `/oauth2/Approval` 접속키 발급 포함 |
| `npm run dev:morning` | `infisical secrets-manager run --env dev --path /kis -- npm run dev:morning` | `--realtime` 기반 장전 보고서 실행 |
| `npm start` | `infisical secrets-manager run --env dev --path /kis -- npm start` | 빌드 결과 단일 서버 (`4304`) |
| `scripts/check-kis.ts` | `infisical secrets-manager run --env dev --path /kis -- node --import tsx scripts/check-kis.ts` | KIS 연결 단독 점검 |

Machine Identity를 설정하지 않고 CLI 방식만 사용할 때는 터미널에서 아래 명령으로 로그인한 뒤 `npm run dev`를 실행한다.

```bash
infisical login --domain https://app.infisical.com
npm run dev
```

## 5. 보안 경계

- **단기 토큰 메모리 전용 사용**: `POST /api/v1/auth/universal-auth/login`으로 발급받은 Access Token은 파일에 저장하지 않고 메모리에서만 `GET /api/v4/secrets`(404 시 `/api/v3/secrets/raw` 폴백) 조회에 사용한다.
- **자식 프로세스 환경 격리**:
  - `dev:server`(`server/index.ts`)에는 KIS 4개 키만 전달하고 `INFISICAL_*` 변수는 모두 제거한다.
  - `dev:web`(Vite)에는 `KIS_*`와 `INFISICAL_*` 변수를 모두 제거한다.
- **파일·네트워크 검증**: 심볼릭 링크(`O_NOFOLLOW`), 그룹/타인 접근 권한(`0700`/`0600` 위반), 16KB 초과, 비-HTTPS(`http://`) 도메인, 정의되지 않은 JSON 키는 즉시 거부한다.
- **Vite HTTP 노출 차단**: [vite.config.ts](../../vite.config.ts)의 `server.fs.deny`가 `.secrets/**` 및 `.local/**` 경로 요청을 HTTP `403`으로 차단한다.

## 6. 적용 확인 절차 (비밀값 비노출)

1. 프로젝트 루트에서 개발 서버를 시작한다.
   ```bash
   npm run dev
   ```
   터미널에 `Infisical 머신 인증으로 KIS 모의 계좌 설정을 불러오는 중입니다.` 이후 실패 경고 없이 `GON Stock local server: http://127.0.0.1:4304`가 출력되어야 한다.
2. 브라우저에서 `http://127.0.0.1:4303/settings`를 열어 필수 설정 **구성 완료**를 확인하고 **잔고 조회**를 눌러 모의 계좌 인증·잔고 응답을 확인한다.
3. 터미널에서 비밀값을 출력하지 않고 주입 상태와 보안 차단을 점검하려면 아래 명령을 실행한다.

```bash
# 1) KIS 키 주입 상태 확인 (configured: true, missing: [] 기대)
curl -sS http://127.0.0.1:4304/api/state | node -e '
  const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
  console.log({ configured: d.connection?.configured, injection: d.connection?.injection });
'

# 2) Vite 개발 서버의 .secrets 차단 확인 (403 기대)
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:4303/.secrets/infisical-dev.json
```

## 7. 자주 발생하는 오류와 복구

| 증상 / 메시지 | 원인 | 조치 |
| --- | --- | --- |
| 권한 위반 오류 (`0700`/`0600`) | `.secrets` 또는 `infisical-dev.json` 권한이 과도함 | `chmod 700 .secrets && chmod 600 .secrets/infisical-dev.json` 실행 |
| 심볼릭 링크 거부 | 인증 파일 경로가 심볼릭 링크임 | 실제 일반 파일로 `.secrets/infisical-dev.json` 생성 |
| `Universal Auth 인증 실패 (HTTP 401/403)` | `clientId`/`clientSecret` 오입력·만료·IP 제한 | Infisical 대시보드에서 Client Secret 재발급 후 파일 갱신 |
| `Infisical 비밀 조회 실패 (HTTP 403/404)` | Identity에 프로젝트 `dev /kis` 읽기 권한 누락 또는 `projectId` 불일치 | 프로젝트 **Access Control → Machine Identities** 권한과 `projectId` 확인 |
| `누락 항목` 또는 `기존 환경변수와 불일치` | `dev /kis` 4개 키 중 일부 누락 또는 셸에 다른 값의 `KIS_*`가 이미 설정됨 | Infisical 4개 키 확인 및 기존 셸 `KIS_*` 변수 정리 후 재실행 |
| `CLI 응답 시간 초과` (`ETIMEDOUT`) | 머신 인증 미설정 상태에서 CLI 세션 만료 | 대화형 터미널에서 `infisical login --domain https://app.infisical.com` 실행 또는 Machine Identity 전환 |
| `/settings`에 `오래됨(stale)` 표시 | 마지막 잔고 조회 후 60초 경과(키 주입·인증 세션 만료 아님) | 화면에서 **잔고 조회**를 다시 클릭해 갱신 |

## 관련 문서
- [Infisical 연결과 운영](../INFISICAL.md)
- [로컬 실행과 복구](local.md)
- [구현·검증 작업 기록 (#203)](../tasks/203-infisical-machine-auth.md)
- 구현 코드: [scripts/dev.ts](../../scripts/dev.ts) · [scripts/infisical-dev.ts](../../scripts/infisical-dev.ts) · [vite.config.ts](../../vite.config.ts)
