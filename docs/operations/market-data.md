# 국내 종목·일봉 수집 API

#7은 공통 수집·저장 API를 제공한다. 시장 탐색·데이터 상태·백테스트 화면 연결은 각각 #10·#15·#21에서 진행한다. 기존 DEMO 봉과 계좌 상태는 이 수집으로 바뀌지 않는다.

## 계약과 저장

[KIS 일봉 계약](https://github.com/koreainvestment/open-trading-api/blob/4a51f9126e719c352072b14b7df9222cb2691720/examples_llm/domestic_stock/inquire_daily_itemchartprice/inquire_daily_itemchartprice.py)은 한 번에 최대 100건을 반환한다. `J`는 KRX, `D`는 일봉, 수정주가는 `0`, 원주가는 `1`이다. 서버는 90달력일 이하 구간을 시작일부터 순서대로 요청한다. 예를 들어 2026-01-01~04-15는 01-01~03-31, 04-01~04-15 두 구간이다. 연속조회 토큰이나 반환 건수로 완료를 추측하지 않는다.

- 공통 `KisClient`의 모의 서버·1.1초 직렬 간격·대기 30건·15초 제한을 사용한다. GET 인증 갱신은 최대 한 번이며 429·5xx를 자동 반복하지 않는다. 이 설정은 계정별 실제 한도를 보장하지 않는다.
- 날짜는 `YYYYMMDD`, 최대 3660달력일이다. 종료일은 서울 기준 오늘보다 이전이어야 한다. 6자리 종목코드는 문자열이며 `005930`과 영문을 포함한 `00088K`도 보존한다.
- 봉의 키는 `(수집 ID, 거래일)`이다. ID별 독립 스냅샷에 종목·출처·KRX·수집시각·OHLCV·조정정책을 보존한다. 서로 다른 ID·정책의 같은 거래일은 별도 관측이다.
- 한 구간의 봉과 다음 날짜를 같은 SQLite 트랜잭션으로 저장한다. 실패한 구간은 저장하지 않는다. 같은 값의 중복은 하나로 저장하고 개수를 기록한다. 값이 다른 중복·잘못된 날짜·기간 밖 봉·잘못된 OHLCV는 구간 전체 실패다.
- 같은 ID의 조건은 변경할 수 없다. 재수집에는 새 UUID를 사용한다. 재개는 같은 서울 날짜에만 허용한다. 요청 도중 자정을 넘긴 결과도 저장하지 않는다. 같은 날에도 공급자의 수정 이력이 고정됐다는 보장은 없으며, 이 자료는 과거 시점 기준 데이터(PIT) 인증이 아니다.

## 실행

앱 실행과 비밀값 주입은 [Infisical 지침](../INFISICAL.md)을 따른다. 공개 마스터에는 인증이 필요 없다. ZIP 처리에는 시스템 `unzip`이 필요하다.

모든 POST는 로컬 서버에서 `Content-Type: application/json`, `X-Workbench: local` 헤더를 사용한다. 외부 Origin·Host는 기존 정책대로 거부한다.

| 요청 | 입력·결과 |
| --- | --- |
| `POST /api/data/master/refresh` | `{}`. KOSPI와 KOSDAQ를 수집한다. 시장별 `sources[].phase/error/lastSuccessAt`을 확인한다. |
| `GET /api/data/master` | 저장된 `sources`, `instruments`. 네트워크 호출 없음. |
| `POST /api/data/daily` | 아래 입력으로 수집 기록을 만든다. 아직 KIS를 호출하지 않는다. |
| `POST /api/data/daily/step` | `{"id":"수집 UUID"}`. 한 구간만 수집한다. |
| `GET /api/data/daily` | 저장된 `runs`. |
| `GET /api/data/daily/수집UUID` | 해당 `run`과 날짜순 `bars`. 없는 ID는 404. |

```json
{
  "id": "86b3f123-f72e-4d77-9091-72a057ce26e4",
  "code": "005930",
  "from": "20260101",
  "to": "20260415",
  "adjustment": "raw"
}
```

`nextDate`가 남아 있으면 다음 step을 호출한다. 호출을 중단하면 저장된 구간은 보존된다. 서버 재시작으로 남은 `loading`은 `partial`로 바뀐다. 재개는 같은 ID로 step을 호출한다. 날짜가 바뀌었다면 새 ID로 처음부터 수집한다. 자동 백그라운드 재시도는 없다.

하나의 DB 파일은 서버 프로세스 하나만 사용한다. 여러 서버 프로세스의 동시 수집은 지원하지 않는다.

HTTP 200은 상태 응답의 전달이다. 수집 실패도 `run.status.error` 또는 `sources[].error`에 기록하므로 본문을 확인한다. 동일 서버에서 일봉 step은 한 번에 하나만 실행한다.

## 품질 판정

후속 화면은 `status`뿐 아니라 `nextDate`, `captureDate`, `quality.state`를 함께 해석한다. `nextDate=null`이면 구간 수집은 끝났으며 품질 검토나 새 ID 재수집이 필요하다. 서울 날짜가 달라진 미완료 수집도 새 ID가 필요하다.

`coverageComplete`는 요청한 모든 구간의 응답을 저장했다는 뜻이다. `status.complete`는 전체 구간 저장과 입력 달력 대조가 모두 통과해야 true다. `status.lastSuccessAt`도 그때만 설정한다.

선택 입력 `calendar`에는 `source`(HTTPS 근거 URL)와 전체 요청 기간의 기대 거래일 `dates`를 넣는다. 서버는 이 달력을 자동 조회하거나 진위를 인증하지 않는다. 해당 종목의 상장기간·정지 이력을 포함한 달력인지 호출자가 확인해야 한다. 달력과 봉의 대조 통과는 원천 자료의 정확성 인증이 아니다.

- 달력 제공: 누락은 `missingDates`, 예상 밖 봉은 `unexpectedDates`에 기록한다. 둘 다 없을 때 `quality.state=passed`, 다르면 `failed`다.
- 달력 미제공: `quality.state=unverified`다. 봉이 없는 평일을 `candidateMissingDates`로 기록한다. 주말은 후보에서 제외하며 휴장·상장 전·정지 여부는 추정하지 않는다. 모든 평일 봉이 있어도 미검증 상태를 유지한다.
- 빈 응답 구간은 `emptyWindows`에 남긴다. 빈 값을 0원·합성 봉으로 채우지 않는다. 거래량 0인 정지 형태의 원본 봉은 그대로 보존한다.

## 마스터 정책과 한계

[공식 KOSPI/KOSDAQ 마스터](https://github.com/koreainvestment/open-trading-api/tree/4a51f9126e719c352072b14b7df9222cb2691720/stocks_info)의 CP949와 고정폭 구조를 사용한다. 그룹 ST/MF/RT/SC/IF/DR/FS는 국내 상장 주식, EF는 ETF로 분류한다. 기존 시장 범위(KOSPI/KOSDAQ/ETF)에 맞춰 KONEX·ELW·ETN·신주인수권·FE(해외 ETF)와 해외시장 파일은 제외한다. 코드는 숫자로 변환하지 않는다.

다운로드 URL은 고정하고 TLS 검증을 유지한다. 다운로드 8MiB, 압축 해제 16MiB, 각 15초를 제한한다. ZIP에서 지정한 파일만 stdout으로 읽고, 외부 경로로 압축을 풀지 않는다. 두 시장의 수집 시작 상태를 원자 저장한 뒤, 두 파일의 전체 파싱과 코드 중복 검증 후 전체 목록을 한 트랜잭션으로 교체한다. KOSDAQ→KOSPI 이전 종목도 한 번만 보존한다. 한 파일 실패·중복 충돌·재시작 중단 시 이전 성공 자료 전체를 보존하며 상태는 error다. refresh를 다시 호출하면 두 시장을 재수집한다.

각 시장에 다운로드 출처·수집시각·압축 해제 원문 SHA-256을 저장한다. 파일 자체의 공식 기준 거래일은 확인하지 못했으므로 수집시각을 기준 거래일로 바꾸지 않는다. 최신 파일은 현재 목록이며 상장폐지 이력·과거 구성종목 복원이 아니다. 마스터 상태의 성공 시각과 일봉의 거래일을 구분한다.
