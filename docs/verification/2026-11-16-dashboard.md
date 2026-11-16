# #18 대시보드 검증

[이슈 #18](https://github.com/krdn/gon-stock03/issues/18)의 DEMO와 KIS 계좌 요약을 분리했다. 기준 main `bf158cc`. 실제 KIS 업무API·주문·취소·예약·외부알림은 실행하지 않았다.

- 초기 신규 브라우저 검사: DEMO 계좌 요약 영역 부재로 1건 RED, 나머지 4건은 max-failures로 미실행. 구현 후 5건 GREEN, 상태 전환 검사 추가 후 6건 PASS.
- `npm test`: 단위/API134 PASS. 기존 portfolioValue의 자산·손익·가격 누락 계산을 그대로 사용한다.
- `npm run build`: TypeScript/빌드 PASS. 기존 500kB 번들 경고 유지.
- `npx playwright test --reporter=list`: 전체88 PASS. 이후 추가한 로딩→복구→오래됨·주문 대조 만료 검사 포함 대시보드6 PASS. 최종 전체 결과는 아래에 기록한다.
- `agent-browser`: 4418 포트의 별도 메모리 DB, KIS 자격값 제거. DEMO 정상·KIS 미연결을 확인했다. 모바일390px scrollWidth390, 데스크톱1440px scrollWidth1440. 숨겨진 모바일 상단 연결 문구 대기는 타임아웃했고, 보이는 상태 영역의 정상 표시로 재확인했다.
- [데스크톱](assets/dashboard/desktop.png) · [모바일](assets/dashboard/mobile.png) · [KIS fixture 데스크톱](assets/dashboard/kis-fixture-desktop.png) · [KIS fixture 모바일](assets/dashboard/kis-fixture-mobile.png). 사용자 직접 관찰·수용은 미확인이다.

DEMO 예시: 현금1,000 + 2주×150 = 총1,300, 손익100. KIS 예시: 예수금2,000 + 3주×200 = 총2,600, 손익300. KIS totalEquity 참고값9,999를 화면 합계로 쓰지 않는다. 미연결·오류의 잔고 부재는 0원으로 대체하지 않고, 부분실패는 이전 전체 성공값·성공 시각을 유지한다. 현재가 누락은 합계와 손익 평가 불가다.

주문 대조는 기존 paperRisk 저장 응답의 60초 유효시간을 적용한다. 불명·전송 중은 별도 수로 표시한다. DEMO 보유 현금은 접수 시 차감되지 않으며 주문 가능액은 미체결 매수 금액과 예상 수수료를 제외한다. 원인 링크 이동과 대시보드 상태 갱신의 POST0회를 검증했다. 실제 KIS 계좌/장중 수용은 #25, KIS 전략 집계는 #22다.

[React 공식 문서](https://react.dev/learn/you-might-not-need-an-effect)의 렌더 중 파생값 계산 원칙을 적용했다. 별도 조회 Effect 없이 공통 상태와 portfolioValue를 사용한다. start-context에 #13 기록을 보존하고 #18 출처를 추가했다. implementation-ready 통과는 구현 후 확인했으며, 선행 확인 절차를 지켰다는 증거로 주장하지 않는다.

독립 지정 리뷰와 최종 원격 CI는 아래 및 작업 파일에 기록한다. #13 PR58은 초안·사용자 수용/통합 대기이며, #14 선행 상태는 변경하지 않는다.

최종 전체 브라우저89 PASS. `git diff --check` 및 수정 문서 상대 링크 검사 PASS. STE strict는 `docs/conventions/ste100-writing.md` 부재로 exit2, 미검증.

지정 Gemini4Argon/high [리뷰](assets/dashboard/argon-review.json)는 DASHBOARD PASS, P0–P3 0건이다. 중앙 기본값/dry-run과 `agy models`를 확인하고 `gemini-4-argon-high --effort high`로 직접 호출했다. 요청/init 일치, 서버 내부 모델·effort 독립 확인은 불가하다. 도구 호출0회, 이미지 미제공 텍스트 리뷰다. 최초 리뷰 명령은 OS argv 길이 제한으로 실행되지 않았고, 관련 서버 절만 공급하도록 줄여 성공했다.

리뷰 후 제품 소스 해시는 동일하다. 캡처 직전 사이드바 전환 완료 대기 1줄을 테스트에 추가했고, 대시보드6 PASS 및 [지정 모델 추가 확인](assets/dashboard/argon-delta.json) DELTA PASS를 받았다. [공급 파일 해시](assets/dashboard/review-manifest.json)와 추가 확인의 테스트 해시로 범위를 구분한다. 재시작 전 임시 서버 종료로 실패한 캡처는 사용하지 않고, 재시작 후 정상 상태·사이드바 right0을 확인해 최종 이미지로 교체했다.
