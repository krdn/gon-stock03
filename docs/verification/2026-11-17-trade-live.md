# 트레이딩 실제 주가 연동

사용자 요구에 따라 `/trade` 기본 화면을 KIS 실제 현재가·수정 일봉으로 변경했다. 기존 합성 주문은 `mode=demo`에서만 표시한다. 실제 시세를 합성 원장이나 체결 엔진에 덮어쓰지 않는다. [작업 #12](https://github.com/krdn/gon-stock03/issues/12) · [PR90](https://github.com/krdn/gon-stock03/pull/90).

- 기존 `/api/kis/market`의 현재가·일봉을 조회 완료15초 후 갱신한다. 숨김 탭·종목 변경·언마운트에서 요청을 중단한다. 실패하면 수동 재조회를 안내한다.
- 종목코드·양수 가격·유효 거래일·일봉 순서·중복을 검사한다. 최초 실패는 가격 없이 표시하고 갱신 실패는 이전 수신값임을 명시한다.
- 수신 시각과 거래일을 구분한다. REST 조회이며 WebSocket 실시간 체결 수신으로 표시하지 않는다.
- 기본 화면은 시세 조회만 한다. 모의 주문은 선택 종목코드를 유지해 기존 `/paper`로 이동한다.

## 실제 실행 근거

22:39 KST Infisical dev/kis 주입에서 필수4개 존재를 확인했다. 이전 점검과 달리 실제 4303/4304 프로세스는 `/home/gon/orca/workspaces/gon-stock03/issue-12`에서 실행 중이었다. 이 서버는 인증값이 없었으며 자동 재생·전략·WS가 정지 상태였다. DEMO/KIS 주문은 각각0건이었다.

`.local/backups/before-real-trade-20261117.sqlite`에 SQLite backup으로 같은 원장을 보존하고 integrity_check=ok를 확인했다. 이 작업 폴더의 확인된 dev 프로세스만 종료했다. Infisical에서 필수4개 KIS REST 인증값만 서버 실행 환경에 전달해 동일 원장으로 다시 시작했다. 주문 승인·WS 설정은 추가하지 않았다. 비밀값 출력·Git 저장 없음.

2026-11-17 22:50:56 KST 실제 API 응답: 종목005930, 현재가189,800원, 등락률-3.56%, 일봉100개, 마지막 일봉20261117/189,800원. 실제4303 화면의 가격·차트가 응답과 일치했다. 이 값은 해당 시각 KIS 모의 서버 조회값이다. 앞서 외부 웹에서 확인한 정규장 종가190,300원으로 숫자를 덮어쓰지 않았으며, 거래소 체결 시각이나 별도 정규장 종가로 확정하지 않는다.

검증 뒤 KIS 저장 주문0건. 실제 계좌조회·주문·취소·전략 실행·WS 구독은 하지 않았다. 화면 점검 브라우저는 종료했고, 인증값이 주입된4303/4304 서버는 유지한다. 이전 `/home/gon/llm-projects/gon-stock03`의 소스3개 로컬 변경은 그대로 보존한다.

[실제 PC 화면](assets/trade/live-desktop.png) · [실제320px 화면](assets/trade/live-mobile.png).

## 검증

단위/API216, 전체 브라우저150, 빌드 PASS. 새 실제 시세 검사13건은 실제 응답 대신 HTTP 경계를 대체한다. 종목 전환 경합, 최초 실패/재시도, 갱신 실패/이전값, 잘못된 종목·일봉, 숨김 탭, 명시 DEMO,320/1440px를 검사한다. 기존 DEMO 검사는 `mode=demo`에서 동일한 불변식을 유지한다.

최초 실패에도 이전 수신값이라고 표시하던 문구는 추가 assertion으로 재현해 수신값 없음으로 수정했다. 시세 타이머 테스트의 로컬 상태는 긴 유효시간을 사용해 시세 갱신과 분리한다. 기존 common-state 회귀는 원래 유효시간을 유지한다.

실제 PC·320px axe 위반0/불확정0, 가로 넘침 없음. 스크린리더 실제 음성·장중 연속 수신·주문 체결은 미검증이다. 기존500kB 번들 경고는 유지한다. 외부 리뷰와 원격 CI 결과는 이슈/PR 기록으로 연결한다.

공식 근거: [KIS 현재가](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_price/inquire_price.py) · [KIS 기간별 일봉](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_daily_itemchartprice/inquire_daily_itemchartprice.py). 모의 환경도 현재가/일봉 TR을 제공하며 J는 KRX, 수정주가 옵션은0이다.

## 완료 경계 재확인

최종 전체 브라우저 로그는150 PASS다. 기존148 기록은 리뷰 반영 회귀2건 추가 전 수치여서 수정했다. Claude Opus5.5/high 원 리뷰는 P0–P2 없음, P3 세 건이었다. 

화면 라벨과 접근성 이름을 맞추고 정상 폴링의 반복 낭독을 제거했다. 서버4xx 복구 안내는 보존하고5xx 내부 내용은 숨긴다. 4xx 안내와 로컬 연결 끊김·복구 회귀를 추가했다. 라벨·비live 상태는 코드를 확인했다. 실제 스크린리더 음성 검증으로 간주하지 않는다.

재개 시 미커밋 변경으로 `gon-workflow resume`이 차단됐다. 관련 이슈·PR을 직접 조회해 실제 시세 추가 범위와 원격 head `0a0cad0`을 대조했다. 기존 전체 회귀 로그와 현재 코드를 확인하고 빌드를 다시 통과했다. 전체 브라우저 실행이 갱신한 기존 fixture 화면8개는 실행 산출물로 함께 보존한다.

수정분 외부 리뷰의 실제 반환 모델은 `claude-opus-5-5`이며 설정 effort는 high다. 수정분 P0–P3 없음. 리뷰어는 코드만 검토했고 실행 결과는 재현하지 않았다. 재개 경계에서 실제 시세 회귀13건·빌드·Graphify 갱신·문서 링크·STE·diff 검사를 직접 통과했다. 원 리뷰의 캐시 우려는 `shared/status.ts`의3초 캐시로 확인했다. 로컬 연결 실패·복구 경로는 추가 회귀로 확인했다.
