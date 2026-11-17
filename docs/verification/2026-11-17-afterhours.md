# 장 마감 후 연결 준비와 복구 점검

**가능한 점검은 완료했다. 실제 주문·취소·WebSocket 구독은 실행하지 않았다.** 기준 main은 `9e25197`이다.
사용자는 장 마감 후 가능한 작업을 진행하고, 불가능한 작업은 GitHub에 저장하도록 지시했다. 기존 #25를 재사용한다.

## 실행 결과

| 검사 | 결과 | 검증 범위 |
| --- | --- | --- |
| Infisical dev /kis | REST 필수4개 있음, HTS ID·WS 접속키·세션 없음 | 값 대신 존재 여부만 출력 |
| 모의 WS 인증 | 15:56:12 KST `/oauth2/Approval` HTTP200·접속키 수신 | 키는 메모리에서만 처리하고 폐기. 구독·주문0 |
| 복구·중복·재시작 | `node --import tsx --test tests/paper.test.ts tests/realtime.test.ts`: 84/84 PASS | fake transport·메모리/임시DB |
| 설정·실시간·주문·전략 UI | 관련 브라우저4개 파일: 35/35 PASS | 실제 Chromium·로컬4314, API 응답 대체 |
| 빌드 | PASS | 기존500kB 번들 경고 유지 |
| 수동 화면 점검 | 1440×1050, 390×844 네트워크 오류 안내·잔고 미표시·가로 넘침 없음 확인 | 4316 격리 서버·합성 응답, 실제 계좌 아님 |

브라우저 검사는 미응답 대기 한도·상태 새로고침·이전 값 표시·미연결 주문 차단을 확인했다.
불명 복구는 고유 후보와 명시 확인 전 비활성, 요청ID 보존·자동 재전송 금지를 확인했다.
실시간 검사는 끊김·재연결·재대조·오래된 이벤트·재시작 후 전략 정지와 중복 차단을 확인했다.

[PC 오류 화면](assets/afterhours-20261117/settings-error-desktop.png), [모바일 오류 화면](assets/afterhours-20261117/settings-error-mobile.png), [모바일 실시간 지연](assets/afterhours-20261117/orders-stale-mobile.png)을 보존했다.
이는 에이전트의 화면 점검이다. 실제 장중 성공이나 사용자 수용으로 기록하지 않는다.

## 연결 준비와 공식 근거

[공식 인증 예제](https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/kis_auth.py)의 `auth_ws`는 모의 도메인 `/oauth2/Approval`에 appkey·secretkey를 전달한다.
접속키 발급 성공은 WebSocket 연결·구독·시세 또는 체결통보 수신 성공을 뜻하지 않는다. 키를 저장하지 않았으므로 다음 시작 때 새로 발급·주입해야 한다.

[공식 구독 예제](https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/domestic_stock/domestic_stock_examples_ws.py)는 체결통보 키로 `my_htsid`를 사용한다.
[공식 체결통보 예제](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/ccnl_notice/ccnl_notice.py)는 모의TR `H0STCNI9`와 암호화 수신을 명시한다.
현재 앱의 `server/realtime.ts`는 HTS ID·접속키·검증된 당일 세션이 없거나 장외이면 시작을 거부한다. 이 차단을 우회하지 않았다.

## 다음 작업 체크리스트

| 작업 | 재개 조건 | 실행과 완료 근거 |
| --- | --- | --- |
| HTS ID 설정 | 사용자가 Infisical dev /kis에 KIS_HTS_ID 등록 | 채팅·Git·평문 파일에 복사하지 않고 존재/연결 결과만 확인 |
| WS 접속 준비 | HTS ID와 당일 공식 개장·시간 확인 | 접속키를 실행 시 메모리 주입. KIS_WS_SESSION의 날짜·open·close·verified를 확인 사실로 구성 |
| #75 시장가 실증 | 다음 장중 수동 시작, 최신CI·계좌·미체결0·현재 보유·모바일 취소 대응 확인 | 승인된005930 매수1주·30만원·전송1회·120초·API취소 없음. 접수/체결/잔고를 별도 대조 |
| 실제 수신·단절 복구 | 구독 조건과 주문 없는 격리 실행안 확정 | 005930 한 종목의 수신·재대조·명시 재개 확인. 주문 중 장애를 유발하지 않음 |
| 연속전략 | 전략ID/revision·종목·횟수·누적금액·매도·기간·정지 조건 확정 | 고정1회 승인과 별도 계약. 승인 전 전송·UUID 변경·무제한 서버 우회 금지 |
| 부분체결·경합 | 실제 재현 여부 확인 | 1주 실행의 불가능한 부분체결을 성공으로 만들지 않고 미재현 기록 |
| 최종 화면 수용 | 실제 실행 후 대상SHA와 상태별 PC·모바일 화면 확보 | 사용자 답변을 기록하고 미해결 결함·미관측을 구분 |

현재 저장 전략은 `ma-01`, 069500, 5/20, 1주다. 삼성전자 시장가1회 승인과 다르므로 이를 KIS 전략 실행으로 전환하지 않았다.
연속전략의 구체적인 거래 한도는 확정되지 않았다. 수신·복구 검증과 거래 계약을 분리하고, 기존 승인을 확대하지 않는다.

다음 시작 문구: “#25 최신 작업 기록을 확인하고 장중 준비를 점검해. #75 한정 실행 승인은 유지하되 현재 조건을 확인하고 진행해.”
자동 예약·날짜 추정·소비 원장 초기화는 하지 않는다. 같은 금액·수량 승인 자체는 다시 묻지 않는다.

## 실패와 보존

최초 resume은 원격 브랜치 미생성으로 실패했다. 브랜치 푸시 후 resume을 통과했다.
수동 캡처 초기에는 고정 시각 만료와 보조 응답의 ISO 형식 오류로 대기 실패가 있었다. 보조 응답과 전환 대기를 바로잡아 최종 캡처를 확인했다.
새 제품 결함은 확인되지 않았다. 코드 변경·기존 앱 재시작·원장 수정은 없으며 격리4314/4316 서버를 종료했다.
