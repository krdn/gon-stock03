# #9 KIS 주문·복구 계약

확인: 2026-11-15. [#9](https://github.com/krdn/gon-stock03/issues/9)의 요청은 “VTS 지원 계약을 확인”하는 것이다. **웹 정정·취소는 차단한다.** 조회 필수 조건을 모의에서 충족할 수 없다. 공통 복구 구현과 실제 주문 승인은 별도다.

## 공식 계약과 판단

| 확인한 사실 | 적용 |
| --- | --- |
| [정정취소](https://apiportal.koreainvestment.com/apiservice-apiservice?/uapi/domestic-stock/v1/trading/order-rvsecncl)는 `VTTC0013U`를 제공한다. 먼저 `psbl_qty` 확인을 요구한다. | TR 존재만으로 안전한 웹 취소 지원을 선언하지 않는다. |
| [가능수량 조회](https://apiportal.koreainvestment.com/apiservice-apiservice?/uapi/domestic-stock/v1/trading/inquire-psbl-rvsecncl)의 공식 포털 `virtualDomain`·`virtualTrId`는 모두 `모의투자 미지원`이다. | `TTTC0084R`의 실전 호출, 추정 `VTTC0084R`, 일별 조회 잔량 대체를 금지한다. |
| [매수 가능](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_psbl_order/inquire_psbl_order.py)은 미수 없는 수량에 `ORD_DVSN=01`·`nrcvb_buy_qty`, 금액에 `nrcvb_buy_amt`를 안내한다. | 가능 조회는 01, 실제 주문은 기존 지정가 00. 금액은 미수 없는 금액과 현금 중 작은 값으로 제한한다. |
| [일별 주문](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_daily_ccld/inquire_daily_ccld.py)은 모의 15건 이후 연속조회와 날짜별 조회를 제공한다. | 전체 페이지 성공 후 주문일로 대조한다. 당일 빈 결과를 미접수나 취소 증거로 쓰지 않는다. |
| [현금 주문](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/order_cash/order_cash.py)은 모의 매수/매도 `VTTC0012U`/`VTTC0011U`와 KRX를 제공한다. | VTS 주소를 고정하고 리다이렉트를 거부한다. 접수와 체결은 구분한다. |

포털 화면의 공개 상세 API 응답에서 선택한 필드와 응답 해시는 [근거 파일](../verification/assets/kis-orders-recovery/official-contracts.json)에 있다. 브라우징 도구의 상세 URL 접근 실패 후, 페이지가 사용하는 공개 `/api/apis/public/detail?accessUrl=...`를 읽었다. 인증된 업무 API는 호출하지 않았다.

## 공통 서비스 계약

주문번호가 없는 `unknown`은 응답을 확정할 수 없는 전송이다. 조회 후보가 삼성전자 매수 1주·70,000원으로 하나 나와도 자동으로 연결하지 않는다. 사용자가 원래 계좌·주문 근거를 확인하고 그 주문번호를 선택해야 한다.

| 경로 | 동작 |
| --- | --- |
| `GET /api/kis/capabilities` | 웹 정정취소 차단 이유와 공식 출처. 업무 요청 없음. |
| `POST /api/kis/cancel`, `/revise` | `{id}` 검증 후 409. 부분체결·중복 요청도 전송·원장 변경 없음. |
| `POST /api/kis/recovery/inspect` | `{id}`로 번호 없는 불명 주문의 원래 거래일 전체 주문과 최신 잔고를 조회한다. 근거·조회시각을 영구 저장한다. |
| `POST /api/kis/recovery/confirm` | `{id,evidenceId,brokerId,organization,confirmed:true}`. 5분 이내 저장 근거와 새 조회를 대조하고 유일 후보만 연결한다. |
| `GET /api/kis/audit?requestId=…` | 시스템/로컬 사용자, 행위, 시각, 이전/이후 상태, 복구 근거를 조회한다. |

조회·접수·복구를 같은 큐로 실행한다. 접수 내부 조회는 큐를 재진입하지 않아 교착을 막는다. 번호 있는 주문은 날짜·번호·조직·종목·방향·수량·가격을 대조한다. 체결수량 역행과 모순된 취소 응답은 불명으로 유지한다. 여러 페이지의 중복 번호·불가능한 수량은 실패다.

번호 없는 복구는 동일 주문 조건의 후보가 0개 또는 여러 개면 중단한다. 다른 로컬 주문과 이미 연결된 번호도 거부한다. 확인 시 부분체결·취소가 진행됐다면 새 수량을 기록한다. 같은 근거·같은 선택 재요청은 저장 결과를 반환한다. 근거 ID를 재사용해 다른 번호로 바꿀 수 없다. 원장 변경과 감사 기록은 하나의 SQLite 트랜잭션이다. 저장 실패는 원래 불명 상태를 보존한다.

`sending` 재시작은 `unknown`과 재시작 감사 기록으로 전환한다. 번호 없는 조회 부재를 근거로 `rejected`로 강제 해제하는 API는 없다. 해당 경우에는 KIS의 주문 미접수 확인 근거와 별도 복구 결정이 필요하다.

## 차단 범위와 대안 결정

| 후보 | 판단·결과 |
| --- | --- |
| 웹 정정취소 유지 보류 + 공식 모의 앱 수동 취소 | 추천하는 범위 변경안. [KIS FAQ](https://securities.koreainvestment.com/main/customer/support/_static/TF04fg000000.jsp?mctgr=04)는 eFriend Plus·한국투자 앱 모의 접속을 안내한다. 현재 API 계좌와 앱 계좌의 일치·수동 취소 가능 여부는 실행 전 확인해야 한다. |
| KIS의 공식 VTS 가능수량 지원 또는 대체 계약 답변 대기 | 웹 취소 목표를 그대로 유지하는 선택이다. 계약과 최소 계정 증거를 확보할 때까지 Blocked다. |
| 일별 잔량으로 가능수량 추정·실전 TR 대체 | 필수 공식 계약을 충족하지 못하므로 채택하지 않는다. |

사용자 범위 결정 전 웹 취소를 완료로 표시하지 않는다. [최소 모의 실행안](../operations/kis-minimum-paper-run.md)의 접수·조회 증거도 없다. 따라서 #9 전체와 후속 native 선행은 해제하지 않는다. UI는 #14 소유이며 이번 변경에는 조작 화면을 추가하지 않았다.

한계: 조회·잔고는 순차 스냅샷이며 거래소의 원자적 스냅샷이 아니다. 현재 서비스는 한 프로세스·한 모의 계좌 운용을 전제로 한다. 계좌를 변경한 기존 원장을 그대로 복구에 사용하지 않는다. 3개월 이전 조회·실제 장중 경합·부분체결·수동 취소·연속 운영은 이번 fixture 증거에 포함되지 않는다.


## 2026-11-16 전량취소 규격 재조사

**결론: 모의 취소 지원 표시는 확인했지만, 사전조회 면제와 수량0의 수락은 확정하지 못했다.** [PR54](https://github.com/krdn/gon-stock03/pull/54)는 준비 후보로 유지한다. 아래는 공개 문서 조사이며 KIS 업무 API를 호출한 결과가 아니다.

| 근거 | 확인 범위와 한계 |
| --- | --- |
| [포털 공개 응답·필드·해시](../verification/assets/kis-cancel-probe/official-contract-review.json) | `VTTC0013U` 모의 지원과 사전 `psbl_qty` 조회 필수 문구가 공존한다. 해당 조회의 모의 domain/TR은 미지원이다. `ORD_QTY`는 필수이고 전량 `Y`를 제공하지만, 수량0 또는 조회 생략 예외 설명은 없다. |
| [최신 취소 함수](https://github.com/koreainvestment/open-trading-api/blob/4a51f9126e719c352072b14b7df9222cb2691720/examples_llm/domestic_stock/order_rvsecncl/order_rvsecncl.py) | 모의 TR 분기와 동일한 사전조회 필수 설명이 있다. 함수가 0을 금지하지 않는 것은 서버 수락 증거가 아니다. |
| [같은 버전의 실행 예제](https://github.com/koreainvestment/open-trading-api/blob/4a51f9126e719c352072b14b7df9222cb2691720/examples_llm/domestic_stock/order_rvsecncl/chk_order_rvsecncl.py) | 실전 환경·수량1·전량Y다. 모의 수량0의 검증 사례로 사용할 수 없다. 예제를 실행하지 않았다. |
| [brokerage 구현](https://github.com/koreainvestment/open-trading-api/blob/4a51f9126e719c352072b14b7df9222cb2691720/backtester/kis_backtest/providers/kis/brokerage.py) | 구형 TR·수량0·전량Y·빈 조직번호를 사용한다. 최신 계약의 사전조회 면제 근거로 채택하지 않는다. |
| [공식 Q&A](https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000003) | 공식 저장소의 legacy 안내가 연결하는 문의 경로다. 비로그인 검색에서 답변을 확보하지 못했다. 빈 검색 결과와 목록 조회 오류를 답변 부재의 증거로 쓰지 않는다. GitHub Issues·Discussions는 비활성이다. |

판단: 우선 공식 답변으로 예외 규격을 확인한다. 문서 간 모순을 실제 주문으로 바로 시험하면 이미 승인된 1회 주문을 소비하면서도 미체결 취소를 관측하지 못할 수 있다. 전부 체결되면 취소 실증은 미수행으로 남기고 두 번째 주문을 만들지 않는다. 한정 검증 경로는 폐기하지 않되, 동일 계좌·실행 시 잔량 대응·시간창과 별도 수동 시작을 확인할 후속 단계로 둔다. 일반 취소409·실전 대체 금지·후속9개 차단을 유지한다.

### 공식 문의 초안 — 미발송

제목: 국내주식 모의 전량취소 VTTC0013U의 사전조회 요건과 요청·조회 규격 확인

국내주식 모의 API 문서에서 정정취소 `VTTC0013U`는 지원되지만, 사전에 필수로 안내하는 정정취소가능주문조회는 모의 미지원입니다. 아래 계약을 확인 부탁드립니다. 실전 호출이나 실제 모의 주문·취소는 수행하지 않았습니다.

1. 모의 원주문의 번호와 조직번호를 알고 있는 경우 `QTY_ALL_ORD_YN=Y` 전량취소는 사전 가능수량 조회 없이 허용됩니까? 허용된다면 공식 예외 문서나 권장 절차를 부탁드립니다. 불가하다면 모의에서 지원되는 대체 조회/취소 절차가 있습니까?
2. `RVSE_CNCL_DVSN_CD=02`, `ORD_DVSN=00`, `ORD_QTY=0`, `ORD_UNPR=0`, `QTY_ALL_ORD_YN=Y`, `EXCG_ID_DVSN_CD=KRX` 조합이 현재 모의 `VTTC0013U`에서 유효합니까? `KRX_FWDG_ORD_ORGNO`는 원주문 접수 응답의 값을 그대로 사용합니까?
3. 취소 접수 ACK 이후 `VTTC0081R`에서 최종 취소를 확정할 권장 조건은 무엇입니까? 원주문/취소주문 행 연결(`odno`·`orgn_odno`), `cncl_yn`·`rmn_qty`·`tot_ccld_qty`의 변화와 모의 조회 지연 주의사항을 부탁드립니다.

계좌번호·키·토큰·잔고를 포함하지 않는 규격 문의다. 초안 작성과 외부 게시·답변 수신은 별개이며, 아직 게시하지 않았다.

검증: 지정 Argon/high [근거·판단 리뷰](../verification/assets/kis-cancel-probe/argon-contract-review.json)는 CONTRACT-RESEARCH PASS이며 요청/init 일치·정상 본문을 확인했다. 이는 KIS의 공식 답변이 아니다. 서버 내부 모델·effort 독립 확인 한계, STE 기준파일 부재 exit2는 유지한다. 문서/JSON·diff·상대링크만 검사했으며 제품·테스트 코드는 바뀌지 않아 로컬118·브라우저67·빌드 검사를 반복하지 않았다.
