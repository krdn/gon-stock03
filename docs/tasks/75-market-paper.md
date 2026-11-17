# 작업: 삼성전자 시장가 모의 1회

[#75](https://github.com/krdn/gon-stock03/issues/75), 실증 상위 [#25](https://github.com/krdn/gon-stock03/issues/25). 기준 main `0d2b33a`, 브랜치 `feat/75-market-paper`. 별도 #71/PR73은 편집하지 않는다.

사용자는 삼성전자 시장가 테스트와 주문대금30만원 상향을 명시했다. 모의 매수1주·전송1회·120초·기존 보유 유지·API 취소 없음·앱 직접 취소 조건을 유지한다. 과거 지정가 실행ID/원장은 재사용하거나 초기화하지 않는다. 현재 시장가 직접 실행 경로가 없어 구현·격리검증·지정 Argon/high 리뷰·CI 후 실제 사전조건을 다시 확인한다.

## 변경 계약

- DEMO와 기존 지정가 입력은 보존한다. KIS 입력만 `orderType: market`, 단가0인 별도 계약을 추가한다. 명시적 시장가1회 승인 없이는 차단한다. 일반 시장가 매도·전략·UI 주문 생성 기능은 만들지 않는다.
- 승인 날짜/ID/종목/금액/보유허용과 함께 주문유형을 SQLite에 고정한다. 기존 승인은 지정가로 해석하고 재시작 시 변경을 거부한다.
- KIS 시장가 `ORD_DVSN=01`, `ORD_UNPR=0`, `VTTC0012U`를 사용한다. 당일 상한가×수량을 승인한도·현금·위험한도에 적용한다. 당일 상한가가30만원을 넘으면 전송하지 않는다. 5초 시세/장중/미체결/위험정지 검사를 보존한다.
- 시장가 단가0과 실제 체결가는 다르다. 주문유형을 원장·대조·표시에 보존하고 시장가는 '시장가'로 표시한다. 기존 지정가 동일ID/가격/수량 대조와 POST 재시도금지를 보존한다.
- 변경 후 테스트: 시장가 wire본문·현재가변경 허용·상한가/현금/위험 한도 무전송·다른 승인 차단·중복/재시작·거절/불명·시장가 단가0 대조·지정가 회귀·HTTP/원장/UI 계약.

## 공식 근거와 선택

KIS 공개 상세 `order-cash`에서 KRX01=시장가, 시장가 단가0, VTS 매수TR을 확인했다. 공식 예제는 단가 없는 주문의 상한가 금액 산정과 체결 후 정산을 설명한다. `inquire_psbl_order`는 시장가01로 미수 없는 수량/금액을 확인하도록 한다. `inquire_daily_ccld`의 주문번호/날짜/수량/단가와 전체 페이지를 대조한다.

- https://apiportal.koreainvestment.com/api/apis/public/detail?accessUrl=/uapi/domestic-stock/v1/trading/order-cash
- https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/order_cash/order_cash.py
- https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_psbl_order/inquire_psbl_order.py
- https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_daily_ccld/inquire_daily_ccld.py

기존 지정가 경로를 임시로 변조하거나 직접 POST로 우회하는 방식은 승인·원장 대조를 잃으므로 사용하지 않는다. 공통 PaperBroker에 명시적 opt-in 시장가 처리를 추가한다. 입력/영구 승인/원장/표시만 필요한 범위에서 변경한다.

## 검증과 다음 행동

구현과 결합 검증을 완료했다. 초기 실패 테스트의 이 턴 재실행 증거는 없으므로 새 RED 관측으로 기록하지 않는다. 실제 모의 주문 결과는 격리 검사·리뷰·CI와 별도 기록한다. #25의 부분체결/복구/연속전략 전체 완료를 뜻하지 않는다. 사용자 지정 모델 외 자동 대체 없음. STE 기준문서 부재와 기존 번들 경고는 별도 한계다.

## 최신 main 결합 검증

2026-11-17 사용자가 #71 마감 → #75 완료 → #25 실증 순서의 진행을 지시했다.
기존 `feat/75-market-paper`의 미커밋 구현과 스크린샷을 보존했다. 제품·회귀 변경만 최신 main `087b588` 기반 `feat/75-market-paper-complete`로 복사했다.

현재 세션이 이 별도 작업 공간의 결합 검증과 후속 수정을 담당한다. 원본 worktree는 변경하지 않는다.

단위203·브라우저118·빌드 PASS. 기존 번들 크기 경고는 유지한다. 지정 Argon/high 리뷰 PASS·차단0. 실제 주문은 아직 실행하지 않았다.

리뷰 conversation `67093a2d-8c0e-4f93-952b-a58358e619e0`: 요청/init `gemini-4-argon-high`, 요청 effort high, 종료0·SUCCESS. 서버 내부 모델·effort는 독립 반환되지 않았다.

검토자는 제공 자료만 읽었다. 리뷰 후 브라우저118 PASS를 확인했다. 일반 경로의 외부 미체결 시장가 평가액0 가능성은 비차단 관찰로 남겼다.
이번 한정 실행은 미체결이 있으면 차단하고 1회 실행 후 정지한다. 일반 시장가 입력은 열지 않는다.

## 실제 실행과 현재 상태

[PR78](https://github.com/krdn/gon-stock03/pull/78)을 main `b7c6ac2`에 통합했다. head `d821caa`의 CI4 SUCCESS와 제품 코드 일치를 확인했다.
[실행 기록](../verification/2026-11-17-market-paper.md): 15:24 사전 잔고 HTTP500으로 중단, 주문POST0·취소POST0이다. 15:25 읽기 전용 재조회는 성공했다.

사용자가 새 한정 실행을 승인했지만 답변 확인은15:28:16이었다. 약속한15:28 시작 마감을 넘겨 추가 실행하지 않았다.
현재 상태는 구현 완료·실제 시장가 실증 대기다. 기존 실행 사본·원장10개·원본 worktree와 앱을 보존했다.

다음 장중 수동 시작에서는 승인된005930 시장가 매수1주·30만원·120초·전송1회·API취소 없음 범위를 재사용한다.
실행일·시간창·현재 계좌 조건을 확인하고 새 실행ID를 고정한다. 소비 원장 초기화·예약·자동 실행은 하지 않는다.
