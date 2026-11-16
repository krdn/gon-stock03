# 모의 전량취소 검증 후보

상태: [초안 PR #54](https://github.com/krdn/gon-stock03/pull/54)의 리뷰·실행 준비 단계. 실제 KIS 주문·취소는 미수행이다. #9와 후속 차단을 유지한다.

## 근거와 결정

[공식 최신 취소 예제](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/order_rvsecncl/order_rvsecncl.py)는 모의 `VTTC0013U`와 잔량전부 `Y`를 제공한다. [공식 brokerage 구현](https://github.com/koreainvestment/open-trading-api/blob/main/backtester/kis_backtest/providers/kis/brokerage.py)은 수량·가격 `0`, 전량 `Y`로 선행조회 없이 취소한다. 이 구현은 구형 TR을 사용한다.

2026-11-16 재확인한 최신 공식 취소 예제의 설명에도 사전 가능수량 조회가 필수라고 명시되어 있다. 포털에 기록된 해당 조회의 모의 미지원과 함께 보면, 전량 `Y` 예제는 이 조건의 면제를 입증하지 않는다. 따라서 일반 취소 차단 해제 대신 명시적 opt-in 검증 경로를 선택했다. 일별 잔량을 가능수량으로 대신 계산하지 않는다. 요청 규격의 실제 수락과 최종 취소는 미검증이다.

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

[규격 재조사와 공식 문의 초안](../research/kis-order-recovery-2026-11.md#2026-11-16-전량취소-규격-재조사)을 마련했다. 공개 자료만으로 예외를 확정하지 못했으며 문의는 미발송이다. 이후 사용자가 실제 모의 API 주문·취소 테스트를 지시했으므로, [갱신된 실행 절차](kis-minimum-paper-run.md#2026-11-16-실행-지시-갱신)의 한정 검증으로 수락 여부를 관측한다. 관측을 일반 지원 계약으로 확대하지 않는다. 정확한 전량취소 규격은 공식 답변 또는 조건을 별도로 판단한 한정 검증으로 확인해야 한다. 확인할 항목은 모의 `VTTC0013U`에서 사전조회 없이 `ORD_QTY=0`·`QTY_ALL_ORD_YN=Y`가 허용되는지, 필요한 조직번호와 최종 취소를 판별할 조회 필드다. 구형 brokerage 코드나 ACK만으로 이 계약을 확정하지 않는다. 사용자의 API 대안 우선 판단 위임과 스마트폰 잔량취소 가능 확인은 유효하다. 사용자가 API와 스마트폰 동일 모의계좌·다른 API 중지·앱 직접 잔량취소 대응 가능을 확인했다. 장 상태·최신 시세·잔고·원장은 실행 직전 확인한다. 기존 주문 POST1회에 추가되는 취소 POST 최대1회를 실행 기록에 분리한다. 사용자 지시에 따라 주문·취소 전송 창을 지정일09:00 이상·15:30 미만 KST로 확대했다. 원주문 생성 후120초와 기존 클라이언트 종료시한은 유지한다. 마감 후 REST 대조는 남은120초 예산 안에서만 가능하며 새 주문·취소는 전송하지 않는다.

현재 후보는 주문 실행을 자동 시작하지 않는다. 상세 원장 보존·단일 서버·주입·최종 대조 절차는 [기존 실행 절차](kis-minimum-paper-run.md)를 따른다.

## 검증

HTTP 기본 차단 RED(400 대신409) 후 GREEN. 중복·거부·응답 불명·잘못된 ACK·만료·원주문 한정·SQLite 재오픈·감사 실패 롤백은 네트워크 fixture로 확인했다. 실제 계좌 실증과 구분한다. 기존 단위/API 116/116·브라우저 67/67·빌드·diff·상대 링크 검사 PASS. 후속 리뷰에서 첫 취소 전 재시작과 전송 대기 중 120초 만료의 전송0회 테스트를 추가해 단위/API 118/118 PASS를 확인했다. STE strict는 기준 파일 부재로 exit2다. 독립 리뷰·CI 결과는 PR에 기록한다.

최초 Gemini 4 Argon/high 리뷰는 init 이후 본문 없이 8분 경과해 종료한 미완료다. 2026-11-16 새 세션에서 최신 `main...9461a0d` diff와 관련 경로로 입력을 재구성해 재개했다. [반환 기록](../verification/assets/kis-cancel-probe/argon-review.json)은 지적 없음·PREPARATION PASS다. 중앙 기본값 Opus5.5/high·Gemini3.8Flash는 수정하지 않고 사용자 지정 `gemini-4-argon-high`를 명시했다. 요청/init 일치와 정상 본문을 확인했으며, 서버 내부 모델·effort는 독립 확인하지 못했다. 제품 파일 해시는 리뷰 당시와 동일하다. 초안 PR과 실제 실행 보류를 유지한다.

후속 검증: 단위/API118·브라우저67·빌드 PASS. [수정분 리뷰](../verification/assets/kis-cancel-probe/argon-delta-review.json)는 지정 Argon/high 요청/init 일치·DELTA PASS다. diff·상대링크 검사 PASS. STE strict는 `docs/conventions/ste100-writing.md` 부재로 exit2, 기존 번들 크기 경고는 유지한다. 실제 KIS 업무 호출은 0회다.
