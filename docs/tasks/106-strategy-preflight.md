# #106 원 신호 시각과 모의 주문 사전검사

**11월 19일 장중 대조 완료.** 원 시세 나이 4,654ms에서 정상 전략 매수 주문을 1회 전송했고, REST 체결 2주·잔량 0주를 확인했다. [호출별 시간과 동일 요청 대조](../verification/2026-11-19-strategy.md).

**장중에 가장 먼저 해결할 문제는 원 신호의 남은 시간이다.** KIS 요청 시작 간격 1,100ms를 유지하면 잔고→당일 주문→현재가→매수가능→주문 POST의 최단 간격은 4,400ms다. 신호 시세의 초 단위 시각부터 첫 조회가 시작되기까지의 시간, 기존 큐, 추가 페이지와 응답 지연이 더해진다. [장중 37회](../verification/assets/25-live-transition/strategy-latency.csv) 중 5초 미만은 4,920ms 한 번뿐이다. 이 표본도 첫 조회 전에 80ms를 넘게 썼다면 원 신호로 전송할 수 없다. 당시 4.5초 조건에는 0회였다.

11월 18일 15:51 이후 실제 모의 GET으로 토큰이 준비되고 앞 요청이 없는 상태에서 3회 측정했다. 각 회의 네 요청은 모두 1페이지였고 다음 요청 가능 시점은 4,407·4,404·4,405ms였다. 첫 회의 잔고·주문내역·현재가·매수가능 응답 헤더는 각 요청 시작 후 145·779·12·61ms에 도착했다. 전체 단계 소요시간은 순서대로 149·1,735·335·1,150ms로 대기와 본문 처리를 포함한다. 실제 전략 신호는 장외에 발생하지 않아 신호→첫 조회 지연은 미측정이다. [마스킹 관측값](../verification/assets/25-live-transition/afterhours-profile.json)

## 적용한 개선과 실증 경계

- 정상 경로는 계좌·주문 대조 직후, 현재가 조회 직후에 원 신호를 다시 확인한다. 이미 만료된 신호가 후속 REST 큐를 점유하지 않도록 했다. 가짜 전송기에서 각각 조회 2건·1건이 줄고 예약·POST는 0건이었다.
- 영구 예약 직전에 KIS 클라이언트의 필수 잔여 대기를 조회한다. 이미 다음 전송 가능 시점이 신호 만료 뒤라면 예약 전에 차단한다. 예측 가능한 간격만 반영하며 실제 전송 직전에는 다시 검사한다. 과거 차감은 유지된다. 고정 시계에서 같은 4,407ms를 재생했을 때 신호 나이 500ms는 가짜 접수, 700ms는 늦은 전송을 차단했다. 장중 지연이 단축됐거나 승인된 실제 주문이 체결됐다는 증거는 아직 없다.
- 계좌·가격 조회 생략, 캐시 잔고 대체, 다른 시세로 신호 시간 연장, 병렬 요청으로 1,100ms 간격 축소는 채택하지 않았다. 공식 모의 주문내역은 한 페이지 최대 15건이며, 매수가능 수량은 별도 조회의 미수 없는 수량이다. 다음 정상 경로 장중 검증에서는 같은 이벤트·요청 ID에 원 신호 나이, 각 호출 대기·페이지 수, 예약·전송·브로커 접수를 함께 기록한다. [공식 주문내역 예제](https://github.com/koreainvestment/open-trading-api/blob/74b0a082fa67a0be5bf53f561719c853890ed2df/examples_llm/domestic_stock/inquire_daily_ccld/inquire_daily_ccld.py) · [매수가능 예제](https://github.com/koreainvestment/open-trading-api/blob/74b0a082fa67a0be5bf53f561719c853890ed2df/examples_llm/domestic_stock/inquire_psbl_order/inquire_psbl_order.py)

## 부분체결과 잔량 취소

9월 1일~11월 18일의 삼성전자 모의 주문을 기간·종목 조건으로 다시 조회했다. 1페이지, 8건 모두 1주였고 취소확인수량 필드가 8건 모두 있었다. 부분체결 후 취소를 입증할 행은 0건이다. 정상 UI의 수동 복구에서 최초 조회의 유일 후보가 취소 표시와 양수 잔량을 동시에 보여도 연결 후보로 표시하던 경로를 수정했다. 불일치 사본으로는 연결할 수 없다. 여러 후보에서 한 행만 제외해 유일한 것처럼 처리하지 않는다. 격리 회귀에서 3주 중 1주 체결·2주 잔량의 일관된 사본 확인 후, 새 대조에서 2주 체결·잔량 0으로 취소된 경우 기체결 2주가 보존됐다.

실제 경합 확인에는 동일 원주문의 부분체결 시점, 모바일 잔량 취소 시도 시각, 그 사이 추가 체결 또는 취소 거절, 최종 총체결수량·취소확인수량·잔여수량 대조가 필요하다. 최종 취소 행 하나만으로 경합의 순서를 복원할 수 없다. 공식 정정취소 TR은 모의를 제공하지만 정정취소 가능수량 조회는 모의 미지원이다. 일반 API 취소를 열지 않고 공식 모의 앱으로 잔량을 취소하는 경로를 유지했다. [KIS 주문내역 명세](https://apiportal.koreainvestment.com/api/apis/public/detail?accessUrl=/uapi/domestic-stock/v1/trading/inquire-daily-ccld) · [정정취소](https://apiportal.koreainvestment.com/api/apis/public/detail?accessUrl=/uapi/domestic-stock/v1/trading/order-rvsecncl) · [가능수량 조회](https://apiportal.koreainvestment.com/api/apis/public/detail?accessUrl=/uapi/domestic-stock/v1/trading/inquire-psbl-rvsecncl)
