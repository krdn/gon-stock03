# PR 3 선행 설계: 4304 단일 경유 평일 장후 시세 동기화 (#212)

## 1. 결론 요약

**결론**: 평일 장 마감 후 마스터·일봉 갱신은 로컬 **4304 서버**의 단일 HTTP API(`POST /api/data/sync`, `GET /api/data/sync`)로만 수행한다. 별도 프로세스의 SQLite 직접 접근, `setInterval` 내부 주기 실행, 4304 자동 기동, KIS 실전 전환은 영구 금지한다.

- **기준 시점**: 2026-11-26 KST
- **기준 커밋**: `origin/main` `30613ff` (`30613ffdb93245ea3809504af2e38dbf1acde21f`)
- **문서 범위**: `krdn/gon-stock03#212`(PR 3) 구현 전 합의용 선행 설계이며, 이 PR에서는 앱 코드를 수정하지 않는다.
- **설계 핵심 4축**:
  1. **4304 단일 경유와 영속 메타**: HTTP 직렬 큐와 single-flight로 동시 실행을 막고 `market_sync_runs` 테이블에 실행·스킵 이력을 영속 저장한다.
  2. **우선 범위 상한과 직렬 수집**: Tier 1·Tier 2 합집합을 기본 30종목(설정 상한 50종목)으로 제한하고, `await` 직렬 루프로 60달력일 `raw` 1페이지를 수집한다.
  3. **당일 허용 버퍼와 공식 달력 검증**: `krxHours(day, notice).close + 버퍼` 이후 당일(`to === koreaDate()`) 수집을 열고, KRX 공식 스냅샷과 `069500` 교차검증 실패 시 `unverified`로 강등한다.
  4. **미기동·미주입 운영 정책**: 4종 스킵 사유 코드로 누락을 기록·보고하며, 익일 08:30 KST 장전 점검(`gon-stock03-ops`)에 누락 사실을 재표시한다.
- **소유자 확정 대기 파라미터 2건(총괄 Item 18 연계)**:
  - **항목 A(당일 허용 버퍼)**: 기본 권장 `close+10분` vs 보수 대안 `close+15분`.
  - **항목 B(`KIS_UNCONFIGURED` 처리)**: 기본 권장 `전체 스킵` vs 대안 `공개 마스터만 분리 갱신`.
  - 상세 비교와 1줄 회신 양식은 [8장 소유자 최종 확정 파라미터](#8-소유자-최종-확정-파라미터-item-18-연계)에 정리했다.

---

## 2. 배경과 비범위

### 2.1 현행 코드 실측 근거

아래 사실은 `origin/main`(`30613ff`) 코드 직접 대조와 2026-11-26 장후 조사 결과다.

- `server/morning.ts:71-82, 126-135`: `buildMorning()`은 두 거래소 마스터(`phase === 'ready'`, `KIS 공개 종목 마스터`)에 7일 신선도를 요구한다. `daily_runs`(`raw`, `quality.state === 'passed'`, `coverageComplete`, `status.complete`) 역시 7일(`7 * 86400000`ms) 이내여야 한다.
- 2026-11-26 관측 실측: `GET /api/data/daily` 기록이 0건이었고, `market_master` 마지막 성공 시각이 `2026-11-17`(9일 경과)이어서 7일 기준 초과로 후보 종목이 0건으로 제외됐다.
- `server/market-data.ts:101`: `MarketData.start()`가 `config.to >= koreaDate()`를 일괄 차단해 평일 장 마감 후 당일 일봉을 수집할 수 없다.
- `server/market-data.ts:57-72`, `shared/market-data.ts:20-33`: `quality()`는 `calendar` 입력이 없으면 `unverified`를 반환한다. `buildMorning()`은 `passed`만 수용하므로 달력 없는 수집은 후보 산출에서 빠진다.
- `server/morning-scan.ts:9, 35-116`: 기존 `MorningScan`은 장전(`open` 이전) 전용이며 진행 상태(`state`)를 메모리에만 보관한다. 전 종목(`EF`, `ST`)을 순회하므로 완료 시간이 길다.

### 2.2 비범위 (Non-goals)

다음 항목은 이번 설계와 후속 PR 3 구현 범위에 포함하지 않는다.

- 평일 장후 자동화 스케줄 등록(PR 3 구현·검증 완료 후 소유자 별도 승인을 받아 진행한다).
- KIS 실전 서버 전환 및 실전 전용 API(`CTCA0903R` 등) 호출.
- 4304 서버 자동 기동, OS 데몬 등록, 원격 포트 공개.
- 전 종목(약 3,966개) 매일 일괄 수집 또는 분봉 수집.

---

## 3. 4304 단일 경유와 영속 실행 메타

### 3.1 별도 프로세스 `Store`·`KisClient` 생성 영구 금지 근거

장후 동기화 스크립트나 배치가 `.local/workspace.sqlite`를 직접 열거나 별도 `KisClient`를 생성하는 방식은 영구 금지한다.

- **SQLite 원장 복구 충돌(`server/store.ts:75-86`)**: `new Store(path)` 생성자는 매 기동 시 비정상 종료 복구를 실행한다. 실행 중인 4304 서버가 있는 상태에서 별도 프로세스가 `new Store()`를 호출하면 다음과 같은 상태 덮어쓰기가 발생한다.
  - `:75-81`: `state.playing = false`, 활성 전략 강제 정지 및 `sending` 평가 상태를 `unknown`으로 전환.
  - `:82-83`: `paper_orders`의 `sending`을 `unknown`으로, `morning_signals`의 `'검사 중'`을 중단 상태로 덮어씀.
  - `:84-85`: 진행 중인 `daily_runs`의 `phase='loading'`을 `'partial'`로, `market_master`의 `phase='loading'`을 `'error'`로 강제 전환.
- **KIS 세션·호출량 제한 충돌(`server/kis.ts:51, 81-86, 117, 280-297`)**:
  - `KisClient`의 `/oauth2/tokenP` 60초 쿨다운(`nextAuthAt`, `:285, :288`)과 요청 간격 `spacing = 1100`ms(`:51, :86`) 및 직렬 큐(`:85`)는 단일 프로세스 메모리 안에만 존재한다.
  - 별도 프로세스가 `new KisClient()`를 만들면 동일 모의 앱키로 토큰을 중복 요청해 `EGW00133`(1분당 1회 발급 제한)과 `EGW00201`(초당 호출량 초과, `:117`) 오류가 발생한다.

### 3.2 HTTP API 계약과 서버 내부 직렬 큐

장후 시세 동기화는 **서버 내부 `setInterval`을 두지 않는다.** 기존 `server/http.ts:503-539`의 `STOCK_MORNING_REPORT === '1'` 60초 타이머는 장전 전용이며, 장후 동기화에는 주기 타이머를 추가하지 않는다. 외부 수동 호출이나 승인된 자동화가 4304 HTTP API를 1회 호출한다.

#### 엔드포인트 계약

| 메서드·경로 | 용도 | 필수 헤더 | 주요 상태 코드 |
| --- | --- | --- | --- |
| `POST /api/data/sync` | 마스터·우선 범위 일봉 동기화 1회 트리거 | `X-Workbench: local`, `Content-Type: application/json` (`server/http.ts:258`) | `202`, `200`, `400`, `403`, `409`, `503` |
| `GET /api/data/sync` | 현재 실행 상태와 최근 영속 이력 조회 | 없음(로컬 Host 검증은 `server/http.ts:201` 적용) | `200`, `400` |

#### `POST /api/data/sync` 요청 스키마 (설계 제안)

```json
{
  "trigger": "post_close | manual",
  "targetDate": "20261126",
  "limit": 30,
  "includeMaster": true
}
```

- `trigger`: 기본값 `'post_close'`. UI 수동 버튼은 `'manual'`을 보낸다.
- `targetDate`: 생략 시 `koreaDate()`(오늘 KST). 미래일은 `400`으로 거부한다.
- `limit`: 정수 `1-50`, 기본값 `30`. `50` 초과 요청은 Zod 검증에서 `400`으로 즉시 거부한다.
- `includeMaster`: 기본값 `true`. (소유자 확정 항목 B가 `B=대안`이면 `KIS_UNCONFIGURED`에서도 마스터만 갱신 가능.)

#### `POST /api/data/sync` 상태 코드와 응답 규칙

- **`409 Conflict` (`DEDICATED_RUN_ACTIVE`)**: `approval || contract` 전용 실행이 활성인 4304 인스턴스에서는 동기화를 즉시 차단한다. 기존 `server/http.ts:262-264, 360-361`의 409 패턴과 통일한다. 후속 구현 시 `server/http.ts:310`(`/api/morning/scan`) 및 `:366-368`(`/api/data/master/refresh`, `/api/data/daily`, `/api/data/daily/step`)에도 전용 실행 보호 정합성을 함께 검토한다.
- **`200 OK` (스킵 기록 반환, `status: 'skipped'`)**:
  - `reasonCode: 'BEFORE_CLOSE_BUFFER'`: `targetDate === koreaDate()`인데 비거래일이거나 현재 KST 시각이 `krxHours(day, notice).close + 버퍼` 미만일 때.
  - `reasonCode: 'KIS_UNCONFIGURED'`: `kis.configured() === false`(`injection.phase !== 'present'`)일 때(항목 B 기본 정책 기준).
  - 스킵 사실도 `market_sync_runs`에 1건 기록해 익일 장전 점검과 UI에서 원인을 추적할 수 있게 한다.
- **`202 Accepted` (비동기 직렬 큐 접수 또는 single-flight 합류)**:
  - 정상 접수 시 `runId`, `status: 'running'`, `deduplicated: false`, `scopeNotice: '우선 범위 수집 기준(범위 밖 미검증)'`을 반환한다.
  - **single-flight 동작**: 이미 `running` 상태의 동기화 작업이 진행 중이면 새 작업을 만들지 않는다. `202 Accepted`와 함께 `deduplicated: true`, 진행 중인 `run` 요약을 그대로 반환한다.
- **`503 Service Unavailable`**: 저장소(`SQLite`) 쓰기 불가 등 서버 내부 준비 실패 시 반환한다.
- **서버 내부 직렬 큐**: `MarketDataSync` 서비스가 단일 Promise 체인으로 실행을 직렬화한다. `MorningScan.state.running === true`이거나 `MarketData.stepping === true`(`server/market-data.ts:75, 117`)이면 큐에서 대기하거나 충돌을 방지해 `KisClient` 요청 큐(`server/kis.ts:85`)의 과적재를 막는다.

#### `GET /api/data/sync` 쿼리와 응답 스키마 (설계 제안)

- 쿼리: `?limit=10` (기본 `10`, 허용 `1-100`).
- 응답 필드:
  - `active`: 현재 실행 중인 `SyncRunSummary | null`
  - `latest`: 가장 최근 완료·스킵·실패된 `SyncRunSummary | null`
  - `runs`: 최근 `limit`건 배열(`startedAt` 내림차순)
  - `scopeNotice`: `'우선 범위 수집 기준(범위 밖 미검증)'`
  - `serverNow`: ISO-8601 UTC 시각

### 3.3 현행 `morning_scan_meta` 한계와 `market_sync_runs` 영속 스키마

현행 `morning_scan_meta`(`server/store.ts:69`)는 종목별 최신 스캔 1행(`code PRIMARY KEY, to_date, calendar_hash, status, checked_at`)만 저장한다. 다음 정보가 빠져 있어 장후 동기화 운영 감사에 부족하다.

- 어떤 경로가 수집했는지(장후 동기화 vs 장전 스캔 vs 수동 실행) 출처 구분이 없다.
- 실행 단위 시작·종료 시각, 대상 종목 수, 성공·실패·스킵 건수, 스킵 사유 코드가 남지 않는다.
- 비정상 종료(서버 재시작) 시 중단 여부를 복구할 실행 레코드가 없다.

#### 보완 설계 1: `market_sync_runs` 신규 테이블

```sql
CREATE TABLE IF NOT EXISTS market_sync_runs (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL CHECK(trigger IN ('post_close', 'manual')),
  source_label TEXT NOT NULL CHECK(source_label IN ('장후 동기화', '수동 실행')),
  target_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running', 'succeeded', 'partial', 'skipped', 'failed', 'interrupted')),
  reason_code TEXT,
  calendar_source TEXT,
  calendar_verified INTEGER NOT NULL DEFAULT 0 CHECK(calendar_verified IN (0, 1)),
  scope_limit INTEGER NOT NULL CHECK(scope_limit BETWEEN 1 AND 50),
  total_symbols INTEGER NOT NULL DEFAULT 0,
  succeeded_symbols INTEGER NOT NULL DEFAULT 0,
  failed_symbols INTEGER NOT NULL DEFAULT 0,
  master_refreshed INTEGER NOT NULL DEFAULT 0 CHECK(master_refreshed IN (0, 1)),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  summary_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS market_sync_runs_started ON market_sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS market_sync_runs_target ON market_sync_runs(target_date, started_at DESC);
```

- **상태 전이**:
  - `running` → `succeeded` (마스터·달력·전 대상 종목 완료)
  - `running` → `partial` (일부 종목 저장 완료 후 일부 실패 또는 재시작 중단)
  - `running` → `failed` (마스터·기준 ETF 실패 또는 전체 실패)
  - `running` → `interrupted` (1건도 저장하지 못한 상태에서 서버 재시작 복구)
  - 즉시 차단(스킵 조건 충족) → `skipped` (`reason_code`: `KIS_UNCONFIGURED`, `BEFORE_CLOSE_BUFFER`, `DEDICATED_RUN_ACTIVE`)
- `summary_json`에는 Tier 1/Tier 2 구성 종목 수, 실패 종목 코드·오류 요약(비밀값 제외), `scopeNotice`를 저장한다.

#### 보완 설계 2: `morning_scan_meta` 출처 컬럼 확장

- `server/store.ts:69`의 `morning_scan_meta`에 `source TEXT NOT NULL DEFAULT 'morning_scan'` 컬럼을 안전 마이그레이션(`PRAGMA table_info` 확인 후 `ALTER TABLE`, `server/store.ts:532-539` 패턴 동일)으로 추가한다.
- 허용값: `'post_close_sync'`(`장후 동기화`), `'morning_scan'`(`장전 스캔`), `'manual_sync'`(`수동 실행`).
- 장후 동기화가 `passed` 품질로 수집한 종목 일봉은 `morning_daily_bars`와 `morning_scan_meta`에 함께 기록해 익일 `buildMorning()`(`server/morning.ts:113-125`)이 즉시 활용하도록 연결한다. 동시에 개별 `daily_runs` / `daily_bars` 저장과의 중복·일관성 규칙을 단일 쓰기 헬퍼로 고정한다.

### 3.4 `Store` 재시작 복구 규칙

`server/store.ts:75-86`의 기존 재시작 복구 블록 끝에 `market_sync_runs` 복구 SQL을 추가한다.

- 서버 재시작 시 `status = 'running'`인 행을 조회한다.
- `succeeded_symbols > 0` 또는 `master_refreshed = 1`이면 `status = 'partial'`, `reason_code = 'SERVER_RESTART'`, `finished_at = now`로 복구한다.
- 저장된 진척이 0건이면 `status = 'interrupted'`, `reason_code = 'SERVER_RESTART'`, `finished_at = now`로 복구한다.
- 복구 메시지는 `"동기화 중 서버가 재시작됐습니다. 완료 종목만 보존했습니다."`로 기록하며 자동 재실행하지 않는다.

### 3.5 `refreshMaster()`와 전용 실행 `checkInstrument()` 경합 방어

#### 확인된 경합 위험 (코드 실측)

1. `server/market-data.ts:83-90`: `MarketData.loadMasters()`는 KOSPI·KOSDAQ ZIP 다운로드(각 최대 15초 타임아웃) 시작 전에 `market_master` 테이블의 `phase`를 `'loading'`으로 먼저 기록한다.
2. `server/trading-plans.ts:368-390`: 별도 포트에서 실행되는 전용 프로세스(`approval` 또는 `contract` + `policy`)는 매 주문 전 `checkInstrument()`를 호출한다(`server/paper.ts:347, 478`). 이때 원본 원장(`bundle.sourceLedger`)을 `readOnly: true`로 열어 `market_master`를 읽는다.
3. `server/trading-plans.ts:59`: `assetKind()`는 `source.phase !== 'ready'`이면 예외를 발생시켜 신규 주문을 차단한다(`KisNotSent`).
4. 따라서 일반 4304 서버가 `refreshMaster()`를 수행하는 1-30초 사이에 별도 전용 실행 프로세스가 주문을 검증하면 정상 마스터가 있어도 일시 차단되는 경합이 발생한다.

#### 2중 방어 설계 (기존 테스트 보존 포함)

- **방어 1 (호출 시점 격리)**: `POST /api/data/sync`는 `krxHours(day, notice).close + 버퍼` 이후에만 마스터를 갱신한다. 전용 실행의 `sessionBounds`(`shared/trading-policy.ts:68-75`)는 `close`에 종료되므로 정규 장중 전용 실행과 겹치지 않는다.
- **방어 2 (원자적 교체 전용 경로)**:
  - 기존 수동 엔드포인트 `POST /api/data/master/refresh`(`MarketData.refreshMaster()`)는 `tests/market-data.test.ts:117-134`의 `phase='loading'` 영속 및 재시작 `'error'` 복구 계약을 그대로 유지한다.
  - 반면 `POST /api/data/sync`가 호출하는 `MarketData.syncMastersAtomic()`은 두 거래소 ZIP 다운로드·CP949 파싱·해시 검증을 메모리에서 모두 완료한 뒤 `store.saveMasters(snapshots)`(`server/store.ts:396-412`, `BEGIN IMMEDIATE`) 단일 트랜잭션으로 `phase='ready'` 상태를 원자적 교체한다.
  - 다운로드 진행 중 상태(`running`)와 비정상 종료 복구(`interrupted`/`partial`)는 `market_sync_runs`에 기록한다.
  - 결과적으로 수동 `manual` 동기화가 장중에 실행되더라도 `market_master.phase`가 `'loading'`으로 내려가지 않으므로 별도 전용 실행의 `checkInstrument()`를 차단하지 않는다.

### 3.6 `DataInventory.tsx` UI 계약

현행 `src/pages/DataInventory.tsx:84-98`은 `/api/data/master`와 `/api/data/daily`만 조회한다. PR 3 후속 UI 작업에서 다음 계약을 추가한다.

- **조회 추가**: `/api/data/sync?limit=5`를 함께 조회해 데이터 인벤토리 상단 또는 `#inventory-daily` 패널(`src/pages/DataInventory.tsx:144-153`)에 "최근 시세 동기화" 요약 블록을 표시한다.
- **출처 라벨 구분 노출**: 스캔·동기화 메타와 일봉 수집 요약에 출처 배지 3종을 일관되게 표시한다.
  - `장후 동기화` (`post_close_sync`)
  - `장전 스캔` (`morning_scan`)
  - `수동 실행` (`manual_sync` 및 기존 `/api/data/daily` 수동 수집)
- **범위 고지 의무**: 동기화 요약과 상세 영역(`src/pages/DataInventory.tsx:66` 부근 포함)에 **`우선 범위 수집 기준(범위 밖 미검증)`** 문구와 대상 종목 수(예: `30종목 중 30종목 통과`)를 고정 표시한다.
- **스킵·중단 표시**: 최근 실행이 `skipped`, `partial`, `interrupted`, `failed`이면 사유 코드(`4304_DOWN` 제외 서버 기록 코드)와 발생 시각(KST)을 경고 배지로 노출한다.

---

## 4. 종목 범위·상한·소요 시간

### 4.1 Tier 1·Tier 2 우선 범위 정의

| 구분 | 포함 대상 | 코드 원천 | 우선순위 규칙 |
| --- | --- | --- | --- |
| **Tier 1 (필수 포함)** | 보유 종목 | `kis.connection().balance?.positions` (`qty > 0`, `server/kis.ts:348`) | 최우선 |
| **Tier 1 (필수 포함)** | 이월 종목 | `store.carry()` 및 `morning_carry` 미청구(`server/store.ts:233-270`) | 최우선 |
| **Tier 1 (필수 포함)** | 최근 후보 종목 | 최근 5거래일 내 `morning_reports`의 `candidates` (`server/store.ts:92-99, 116-121`) | 필수 |
| **Tier 1 (필수 포함)** | 기준 ETF 2종 | `069500`(KODEX 200), `229200`(KODEX 코스닥150) | 필수(`069500`은 1순위 교차검증용) |
| **Tier 2 (우선 확장)** | 관심 종목 | `store.read().watchlist` (`server/http.ts:415-419`) | 잔여 슬롯 채움 |
| **Tier 2 (우선 확장)** | 전략 종목 | `store.read().strategies` (`environment === 'kis-paper'` 우선, `shared/model.ts:6`) | 잔여 슬롯 채움 |
| **Tier 2 (우선 확장)** | 시드 8종목 | `instrumentSeeds` (`shared/fixtures.ts:4-13`: `005930`, `000660`, `035420`, `005380`, `069500`, `229200`, `035720`, `247540`) | 잔여 슬롯 채움 |

### 4.2 합집합 생성 규칙과 상한 강제

1. **기준 ETF 선행**: `069500`을 목록 맨 앞에 배치해 거래일 교차검증 기준으로 먼저 조회한다.
2. **Tier 1 → Tier 2 순서 중복 제거**: `Set`으로 중복을 제거한다. 우선순위는 `069500`, `229200`, 보유 종목, 이월 종목, 최근 후보, 관심 종목, 전략 종목, 시드 8종목 순이다.
3. **마스터 필터링**: `market_instruments`에 존재하는 `ST`/`EF` 종목 중 `tradingHalted === false && liquidation === false`인 종목만 정상 수집 대상으로 넣는다. 단, 보유·이월 종목이 거래정지 상태이면 자동 제외하지 않고 `summary_json`에 경고를 남긴다.
4. **코드 강제 상한**:
   - **기본 상한**: `DEFAULT_SYNC_SYMBOL_LIMIT = 30`
   - **설정 최대 상한**: `MAX_SYNC_SYMBOL_LIMIT = 50`
   - 요청 `limit`이 50을 넘으면 `400 Bad Request`로 거부한다.
   - Tier 1 합계가 `limit`보다 작거나 같으면 Tier 1 전원을 보장하고 남은 슬롯만 Tier 2로 채운다.
   - Tier 1만으로 `limit`을 넘으면 `069500`, `229200`, 보유, 이월 종목을 먼저 넣는다. 남은 자리는 최근 후보 순으로 채우고 `tier1Truncated: true`와 미포함 코드를 기록한다.

### 4.3 수집 기간과 실측 소요 시간

- **수집 기간**: 종료일 `to`(당일 또는 지정일)로부터 **60달력일**(`from = addDays(to, -59)` 또는 `-60`) `adjustment: 'raw'` 1페이지 조회(`server/kis.ts:185-205` `dailyPage()`).
  - 60달력일은 최대 **44-45거래일**이므로 KIS 일봉 API 1페이지 상한(`output2.max(100)`, `server/kis.ts:194`) 안에 여유 있게 들어온다.
  - `buildMorning()`의 60일 조회 범위(`server/morning.ts:114`)와 `evaluateBars()`의 최소 21봉 요구량(`server/morning.ts:34`)을 모두 충족한다.
- **소요 시간 실측 근거**(`server/kis.ts:51` 기본 간격 `1100`ms 기준):
  - 전 종목 3,966개 순회: 최소 **73분 이상**(장후 동기화 및 장전 스캔으로 비현실적).
  - 우선 범위 실측: 5종목 **4.4초**, 10종목 **9.9초**, 30종목 **31.9초**.
  - 설정 상한 50종목 예상: 약 55-60초(단일 HTTP 비동기 작업으로 안전한 범위).

### 4.4 직렬 `await` 루프 강제와 범위 명시 의무

- **`pending >= 30` 제한 방어(`server/kis.ts:83`)**: `KisClient.send()`는 대기 중인 요청이 30건 이상이면 `KisNotSent('rate-limit')`로 즉시 거부한다. 따라서 종목 목록에 `Promise.all()`이나 `Promise.allSettled()` 병렬 호출을 **절대 금지**한다. 반드시 `for (const code of symbols) { await ... }` **직렬 `await` 루프**로 1종목씩 순차 조회한다.
- **범위 고지 의무**: UI(`DataInventory.tsx`), API 응답(`GET/POST /api/data/sync`), 장후·장전 운영 브리핑 모두에 **`우선 범위 수집 기준(범위 밖 미검증)`** 문구를 의무적으로 포함한다. 전체 시장 검증으로 오인하게 쓰는 표현을 금지한다.

---

## 5. 당일 허용 버퍼와 공식 거래일 달력 원천

### 5.1 `MarketData.start()` 당일 차단 완화 규칙

현행 `server/market-data.ts:101`은 `if (config.to >= koreaDate()) throw new Error(...)`로 당일 수집을 전면 차단한다. 이를 아래 조건부 규칙으로 완화한다.

- `today = koreaDate()`(KST `YYYYMMDD`), `todayIso = YYYY-MM-DD`.
- **규칙 1(미래일 금지)**: `config.to > today`이면 무조건 차단한다.
- **규칙 2(과거일 허용)**: `config.to < today`이면 기존과 동일하게 허용한다.
- **규칙 3(당일 조건부 허용)**: `config.to === today`이면 아래 세 조건을 **모두** 충족할 때만 허용한다.
  1. `todayIso`가 공식 KRX 거래일이다(주말 및 공식 휴장일 스냅샷 제외).
  2. 해당 연도 공식 달력 스냅샷이 유효하다(만료 시 차단).
  3. 현재 KST 시각이 `krxHours(todayIso, notice).close + bufferMinutes` 이상이다.
- 세 조건 중 하나라도 빠지면 당일 수집을 차단한다. 오류 문구는 기존 테스트 정규식(`/오늘/`)과 호환되게 `'일봉 수집 종료일은 서울 기준 오늘 마감 허용 시각 이후에만 수집할 수 있습니다.'` 형식을 유지한다.

### 5.2 공식 거래일 달력 원천과 안전 강등(fail-closed)

- **KIS 실전 API 금지**: KIS 국내휴장일조회 `CTCA0903R`은 실전 전용이므로 **사용을 영구 금지**한다(모의 서버 미지원, 실전 전환 금지 원칙).
- **2중 공식 원천 구조**:
  1. **1차 원천(저장소 공식 스냅샷)**: KRX 공식 연간 휴장일·특별세션(예: 수능일 `2026-11-19`, 연말 휴장일, 임시공휴일) 공지를 연도별 정적 데이터 모듈(예: `shared/krx-calendar.ts`)에 출처 URL·갱신일·유효 연도와 함께 보관한다.
  2. **2차 교차검증(기준 ETF `069500`)**: 동기화 실행 시 `069500`(KODEX 200)의 동일 60달력일 일봉을 먼저 조회한다. 거래량(`volume > 0`)이 있는 관측 거래일 집합을 1차 스냅샷이 산출한 기대 거래일 집합과 대조한다.
- **안전 강등(fail-closed) 3조건**: 아래 중 하나라도 해당하면 `calendar` 검증을 `passed`로 승격하지 않고 즉시 `quality.state = 'unverified'`로 강등한다.
  1. **스냅샷 연도 만료**: `from` 또는 `to` 연도가 스냅샷 지원 연도 범위를 벗어남.
  2. **`notice` 미확보**: 해당 날짜가 특별세션(또는 공지 검증 필요일)인데 유효한 `exchangeNotice` 또는 스냅샷 공식 항목이 없음.
  3. **`069500` 교차검증 불일치**: 스냅샷 기대 거래일 집합과 `069500` 관측 거래일 집합이 1일이라도 다름(임시공휴일 미반영, 장 마감 데이터 미확정, KIS 응답 누락 등).
- 강등 시에도 수집한 일봉 자체는 삭제하지 않되 `unverified`로 저장해 `buildMorning()`의 자동 매수 후보로 잘못 유입되지 않게 차단한다. `market_sync_runs.calendar_verified = 0`과 불일치 날짜 목록을 남긴다.

### 5.3 이슈 `#211` 공휴일 모듈 공유 설계

- 이슈 `#211`(PR 2)의 1단계는 `shared/trading-policy.ts:68-75`의 주말 판정을 재사용해 비거래일 리포트 생성을 400으로 차단한다.
- PR 3(`#212`)에서 도입하는 KRX 공식 휴장일·특별세션 스냅샷 모듈(`shared/krx-calendar.ts`)은 순수 함수(`isKrxTradingDay(dateIso)`, `krxTradingDates(from, to)`, `krxSessionNotice(dateIso)`, `isCalendarSnapshotFresh(year)`)로 제공한다.
- `shared/trading-policy.ts`의 `krxHours(date, notice)`(`:64-67`)와 `#211`의 비거래일 판정이 같은 모듈을 import하도록 설계해, 추후 `#211`의 평일 공휴일 차단 확장과 `#212`의 달력 품질 검증이 단일 원천을 공유한다.

### 5.4 일반 4304 `exchangeNotice` 공급 경로 부재와 보완

- **현행 코드 한계**:
  - `server/http.ts:47`: `Realtime.configuration(paper.timingPolicy?.exchangeNotice)`만 호출한다.
  - `server/paper.ts:153`: `paper.timingPolicy`는 `this.contract?.policy ?? this.approval?.policy`다.
  - 따라서 일반 4304 서버(`!approval && !contract`)는 `exchangeNotice`가 항상 `undefined`다.
  - `shared/trading-policy.ts:66`에는 `2026-11-19`(수능일 `10:00-16:30`)만 하드코딩돼 있어 향후 다른 특별세션(예: 연초 개장일 10:00 개장, 차년도 수능일)을 일반 4304가 인식하지 못한다.
- **보완 설계**:
  1. `shared/krx-calendar.ts` 스냅샷에 연도별 특별세션 목록(`specialSessions: ExchangeNotice[]`)을 기본 탑재한다.
  2. 긴급 임시 변경(예: 임시공휴일·단축거래)은 일반 4304 기동 시 선택 환경변수 `KRX_EXCHANGE_NOTICE`(기존 `shared/trading-policy.ts:9-21` Zod 스키마 검증 통과 필수)로 오버라이드할 수 있게 한다.
  3. `MarketData`와 `MarketDataSync`는 `resolveKrxHours(dayIso, envNotice ?? snapshotNotice)` 순으로 마감 시각을 판정한다.

### 5.5 수능일 경계와 기존 일요일 10시 테스트 보존

- **수능일(`2026-11-19`, KRX 공식 `10:00-16:30`, `shared/trading-policy.ts:18, 66`) 경계**:
  - **기본 권장(`close+10분`)**: `16:39:59 KST` 호출 → `BEFORE_CLOSE_BUFFER` 차단 / `16:40:00 KST` 호출 → 당일 수집 허용.
  - **보수 대안(`close+15분`)**: `16:44:59 KST` 호출 → `BEFORE_CLOSE_BUFFER` 차단 / `16:45:00 KST` 호출 → 당일 수집 허용.
  - 일반 평일(`09:00-15:30`): 기본 권장 `15:39` 차단 / `15:40` 허용, 보수 대안 `15:44` 차단 / `15:45` 허용.
- **기존 일요일 10시 테스트 보존(`tests/market-data.test.ts:208-223`)**:
  - 테스트명: `'collection serializes concurrent steps and rejects next-day resumption and unfinished days'`
  - 고정 시각(`:209`): `Date.parse('2026-11-15T01:00:00Z')` = **2026-11-15 일요일 10:00:00 KST**.
  - 검증식(`:218`): `assert.throws(() => service.start(config({ from: '20261115', to: '20261115' })), /오늘/);`
  - 보전 근거: `2026-11-15`는 주말(비거래일)이고 `10:00 KST`는 마감+버퍼 이전이다. 새 규칙에서도 동일하게 `/오늘/` 포함 예외를 던지므로 기존 테스트를 1줄도 수정하지 않고 그대로 통과한다.

---

## 6. 미기동·미주입 운영 정책

### 6.1 스킵 사유 코드 4종과 판별 기준

외부 호출자(운영자·장후 스크립트·향후 자동화)와 4304 서버는 아래 4종 사유 코드를 표준으로 사용한다.

| 사유 코드 | 발생 주체 | 정확한 판별 기준 | 기록 위치 |
| --- | --- | --- | --- |
| `4304_DOWN` | 호출자 | `GET http://127.0.0.1:4304/api/state` (`server/http.ts:205-209`) 연결 거부(`ECONNREFUSED`) 또는 타임아웃 | 호출자 로그·누락 보고(4304 미기동이므로 SQLite 미접근) |
| `KIS_UNCONFIGURED` | 4304 서버 / 호출자 | **`connection.configured === false`** (`injection.phase !== 'present'`, `server/kis.ts:67, 72-77, 307-311`) | `market_sync_runs` (`status='skipped'`) + 누락 보고 |
| `DEDICATED_RUN_ACTIVE` | 4304 서버 | `approval || contract` 활성 상태(`POST /api/data/sync` `409 Conflict`) | `market_sync_runs` 미기록(전용 원장 보호) + 누락 보고 |
| `BEFORE_CLOSE_BUFFER` | 4304 서버 | 비거래일이거나 현재 KST < `krxHours(day, notice).close + 버퍼` | `market_sync_runs` (`status='skipped'`) + 누락 보고 |

#### `KIS_UNCONFIGURED` 오판 금지 규칙 (핵심 안전 조건)

- `server/kis.ts:307-311`과 `shared/status.ts:4, 9-11`에 따라 잔고 조회 후 `BALANCE_STALE_MS`(60초)가 지나면 `connection.status.phase`가 `'stale'`로 바뀌고 `connection.connected`가 `false`가 된다.
- 즉, Infisical 주입이 정상 완료된 서버라도 최근 60초 안에 잔고를 조회하지 않았으면 `connected: false`, `status.phase: 'stale'` 또는 `'disconnected'` 상태가 정상이다.
- 따라서 **`KIS_UNCONFIGURED` 판별은 반드시 `connection.configured === false`(또는 `connection.injection.phase !== 'present'`)만 사용**한다. `connected === false`나 `status.phase === 'stale'`로 미주입을 오판하지 않는다.

### 6.2 STE-KO 누락 보고 형식

스킵이나 실패가 발생하면 호출자는 아래 STE-KO 형식(3줄 이내)으로 보고한다. 비밀값·계좌번호·잔고 금액은 출력하지 않는다.

```text
[장후 시세 동기화 누락] 2026-11-26 KST · 사유: <4304_DOWN|KIS_UNCONFIGURED|DEDICATED_RUN_ACTIVE|BEFORE_CLOSE_BUFFER>
- 확인 내용: <예: 127.0.0.1:4304 연결 불가 / connection.configured=false (injection.phase=missing)>
- 다음 행동: <예: 4304 수동 기동 후 POST /api/data/sync 수동 실행 또는 익일 08:30 장전 점검 확인>
```

### 6.3 영구 금지 3원칙

1. **4304 자동 기동 금지**: `docs/operations/local.md:29` 원칙대로 로컬 앱은 사용자가 수동으로 실행·종료한다. 동기화 도구나 자동화가 4304를 임의 기동·재시작·종료하지 않는다.
2. **SQLite 직접 접근 금지**: `.local/workspace.sqlite`는 실행 중인 4304 서버만 연다(`docs/operations/local.md:42`). 4304가 꺼져 있어도 별도 프로세스가 SQLite를 열어 쓰거나 복구하지 않는다.
3. **KIS 실전 전환 금지**: `server/kis.ts:7`의 모의 URL(`openapivts.koreainvestment.com:29443`)만 유지하며, 달력·시세 조회를 위해 실전 키나 실전 엔드포인트로 전환하지 않는다.

### 6.4 익일 08:30 KST 장전 점검 연계와 자동화 등록 분리

- **익일 08:30 KST 장전 점검(`gon-stock03-ops`) 연계**: 장전 점검은 `GET /api/data/sync?limit=5`를 조회해 직전 거래일 장후 동기화 기록이 없거나 `skipped`/`partial`/`interrupted`/`failed`이면 장전 브리핑 상단에 누락 사실을 재표시한다. 또한 `우선 범위 수집 기준(범위 밖 미검증)` 문구를 함께 표기한다.
- **평일 장후 자동화 등록 분리**: 평일 장후 자동 실행(크론·오르카 자동화 등) 등록은 이번 설계 PR과 후속 PR 3 구현에 포함하지 않는다. PR 3 병합과 수동 1회 실증 검증이 끝난 뒤 소유자 별도 승인을 받아 등록한다.

---

## 7. 후속 구현 범위·파일 소유권·검증 계획

### 7.1 봇별 파일 소유권과 구현 순서

| 순서 | 담당 봇 | 소유 파일 | 구현 내용 |
| --- | --- | --- | --- |
| 1 | `gon-stock03-core` | `shared/krx-calendar.ts`(신규), `shared/trading-policy.ts`, `shared/market-data.ts`, `shared/data-inventory.ts` | 공식 휴장일·특별세션 스냅샷, `resolveKrxHours`, 동기화 API·스키마 타입(`limit` 30/50) |
| 2 | `gon-stock03-core` | `server/store.ts`, `server/market-data.ts`, `server/market-sync.ts`(신규), `server/http.ts` | `market_sync_runs` 테이블·재시작 복구, `morning_scan_meta.source` 확장, `MarketData.start()` 당일 버퍼 완화, `syncMastersAtomic()`, `POST/GET /api/data/sync` 및 409/single-flight |
| 3 | `gon-stock03-core` | `tests/market-data.test.ts`, `tests/data-inventory.test.ts`, `tests/market-sync.test.ts`(신규) | 단위·통합·회귀 테스트 추가 |
| 4 | `gon-stock03-ui` | `src/pages/DataInventory.tsx`, `src/pages/DataInventory.css` | `/api/data/sync` 요약 블록, 출처 배지 3종(`장후 동기화`/`장전 스캔`/`수동 실행`), `우선 범위 수집 기준(범위 밖 미검증)` 고지 |
| 5 | `gon-stock03-ops` | `docs/operations/local.md`, `docs/STATE.md` | 수동 동기화 호출 절차, 4종 스킵 사유 대응, 익일 08:30 장전 점검 체크리스트 반영 |
| 6 | `gon-stock03-reviewer` | 코드 변경 없음(독립 리뷰) | 다중 파일 완료 경계 독립 교차 감사 |

### 7.2 후속 PR 3 검증 계획

후속 구현 PR에서는 아래 자동 테스트와 수동 확인을 모두 통과해야 한다.

- **기존 테스트 보존**: `tests/market-data.test.ts:208-223`(일요일 `2026-11-15 10:00 KST` 당일 차단) 및 `:117-134`(수동 `refreshMaster()` `loading`→`error` 복구) 무수정 통과.
- **수능일·정규장 경계 테스트**:
  - 정규장: `15:39` 차단 / `15:40` 허용 (보수 대안 선택 시 `15:44` / `15:45`).
  - 수능일(`2026-11-19`): `16:39` 차단 / `16:40` 허용 (보수 대안 선택 시 `16:44` / `16:45`).
  - 비거래일(주말·공휴일 스냅샷): 마감 후 시각이라도 당일 수집 차단.
- **안전 강등(fail-closed) 테스트**: 스냅샷 연도 만료, `notice` 미확보, `069500` 거래일 불일치 시 `quality.state === 'unverified'` 및 `calendar_verified === 0` 강등 확인.
- **4304 단일 경유·동시성 테스트**:
  - `POST /api/data/sync` 동시 2회 요청 시 single-flight(`202`, `deduplicated: true`) 및 KIS 중복 호출 0건.
  - `approval` 또는 `contract` 활성 시 `409 Conflict` (`DEDICATED_RUN_ACTIVE`) 반환.
  - `limit > 50` 입력 시 `400` 거부, 직렬 `await` 호출 시 `KisClient.pending <= 1` 유지 확인.
- **재시작 복구 테스트**: `market_sync_runs`가 `running` 상태에서 `new Store(path)` 재기동 시 진척 0건은 `interrupted`, 1건 이상은 `partial`로 복구 확인.
- **`checkInstrument()` 무충돌 테스트**: `syncMastersAtomic()` 다운로드 진행 중에 별도 `DatabaseSync(path, { readOnly: true })`로 `checkInstrument()`를 호출해도 `market_master.phase === 'ready'`가 유지돼 차단되지 않음 확인.
- **`KIS_UNCONFIGURED` 판별 테스트**: `configured: true` 상태에서 잔고 60초 경과(`status.phase === 'stale'`, `connected === false`) 시 정상 진행을 확인한다. `configured: false`(`injection.phase === 'missing' | 'invalid'`)일 때만 `KIS_UNCONFIGURED`로 판정한다.
- **UI·회귀 검증**: `npm test`, `npm run build`, `DataInventory` 출처 라벨·범위 고지 표시 확인.

---

## 8. 소유자 최종 확정 파라미터 (Item 18 연계)

후속 구현 착수 전 아래 2건의 정책 파라미터만 소유자 확정이 필요하다.

| 항목 | 결정 내용 | 기본 권장 | 대안 | 영향 범위 |
| --- | --- | --- | --- | --- |
| **A. 당일 허용 버퍼** | `MarketData.start()`와 `POST /api/data/sync`의 당일 허용 시작 시각 | **`close+10분`** (정규장 `15:40`, 수능일 `16:40`) | `close+15분` (정규장 `15:45`, 수능일 `16:45`) | `server/market-data.ts`, `server/market-sync.ts`, 경계 테스트 |
| **B. `KIS_UNCONFIGURED` 처리 정책** | 4304는 기동됐으나 `connection.configured === false`일 때의 동작 | **전체 스킵** (마스터·일봉 모두 건너뛰고 `KIS_UNCONFIGURED` 기록·보고) | 공개 마스터(`syncMastersAtomic`)만 분리 갱신하고 KIS 일봉만 스킵 | `server/market-sync.ts`, `market_sync_runs.master_refreshed`, 운영 보고 |

- **판단 근거**:
  - **항목 A**: KRX 정규장 마감(15:30) 후 KIS 모의 일봉 반영 지연을 감안하면 10분 버퍼(`15:40`, 수능일 `16:40`)가 실용적이다. 장 마감 지연에 더 보수적으로 대비하려면 15분(`15:45`, 수능일 `16:45`)을 택한다.
  - **항목 B**: 전체 스킵은 상태 모델이 단순하고 미주입 장애를 운영자가 즉시 인지하게 한다. 반면 마스터 분리 갱신은 7일 마스터 신선도 만료를 예방하지만 부분 성공 해석이 늘어난다.
- **소유자 확정 1줄 회신 예시**:
  - `확정: A=기본(close+10분), B=기본(전체 스킵)`
  - (대안 선택 시 예: `확정: A=대안(close+15분), B=대안(마스터만 갱신)`)
