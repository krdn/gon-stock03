# 모의 전량취소 검증 후보

상태: 로컬 검증 단계. 실제 KIS 주문·취소는 미수행이다. #9와 후속 차단을 유지한다.

## 근거와 결정

[공식 최신 취소 예제](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/order_rvsecncl/order_rvsecncl.py)는 모의 `VTTC0013U`와 잔량전부 `Y`를 제공한다. [공식 brokerage 구현](https://github.com/koreainvestment/open-trading-api/blob/main/backtester/kis_backtest/providers/kis/brokerage.py)은 수량·가격 `0`, 전량 `Y`로 선행조회 없이 취소한다. 이 구현은 구형 TR을 사용한다.

최신 포털은 사전 가능수량 조회를 요구하지만 그 조회는 모의 미지원이다. 예제는 이 조건의 면제를 입증하지 않는다. 따라서 일반 취소 차단 해제 대신 명시적 opt-in 검증 경로를 선택했다. 일별 잔량을 가능수량으로 대신 계산하지 않는다. 요청 규격의 실제 수락과 최종 취소는 미검증이다.

## 구현 범위

기존 `KIS_PAPER_APPROVAL`의 날짜·requestId에 `cancelProbe: true`를 명시할 때만 `POST /api/kis/cancel-probe`가 활성화된다. 입력은 `{id: 원주문의 requestId}`다. 일반 `/cancel`·`/revise`는 계속 409다.

- 승인된 069500 매수1주·10만원 이하의 번호/조직번호가 있는 당일 미체결 주문만 대상이다.
- 원주문 생성 후 120초 미만과 기존 클라이언트 종료시한 중 짧은 범위만 허용한다. 전송 직전 재검사한다.
- 원주문 시도 소비를 확인하고 취소 시도·unknown·감사를 SQLite 트랜잭션으로 먼저 저장한다.
- `VTTC0013U`, 취소구분02, 수량0·단가0·전량Y·KRX를 보낸다. 수량0은 공식 예제 기반 후보이며 서버 수락 보장이 아니다.
- 성공 ACK·거부·네트워크 불명 모두 재전송하지 않는다. ACK만으로 cancelled를 쓰지 않는다.
- 기존 REST 대조로 최종 상태를 확인한다. 미확정이면 스마트폰 잔량취소를 사용하고 증거를 별도로 남긴다.
- 재시작은 기존 1회 모드의 업무 호출 금지를 유지한다. 새 원장·ID로 재시도하지 않는다.

## 실행 전 남은 작업

정확한 전량취소 규격은 KIS 공식 답변 또는 별도 한정 검증으로 확인해야 한다. 스마트폰 동일 계좌·취소 대응 가능성과 최신 시세·잔고·원장을 확인한다. 기존 주문 POST1회에 추가되는 취소 POST 최대1회를 실행 기록에 분리한다. 기존 10:00–10:10 창은 이번 변경에서 유지했다. 오늘 실행 요청을 충족하려면 별도 시간창 변경·회귀 검증이 필요하다.

현재 후보는 주문 실행을 자동 시작하지 않는다. 상세 원장 보존·단일 서버·주입·최종 대조 절차는 [기존 실행 절차](kis-minimum-paper-run.md)를 따른다.

## 검증

HTTP 기본 차단 RED(400 대신409) 후 GREEN. 중복·거부·응답 불명·잘못된 ACK·만료·원주문 한정·SQLite 재오픈·감사 실패 롤백은 네트워크 fixture로 확인했다. 실제 계좌 실증과 구분한다. 단위/API 116/116·브라우저 67/67·빌드·diff·상대 링크 검사 PASS. STE strict는 기준 파일 부재로 exit2다. 독립 리뷰·CI 결과는 PR에 기록한다.

독립 코드 리뷰: Gemini 4 Argon/high 요청과 init `gemini-4-argon-high` 일치. 본문 없이 8분 경과하여 호출을 종료했다. 리뷰 미완료이며 PASS가 아니다. 서버 내부 모델·effort는 독립 확인하지 못했다. 초안 PR을 유지하고 실제 실행을 보류한다.
