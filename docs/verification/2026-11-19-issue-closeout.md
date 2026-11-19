# 11월 19일 매매 정책·관심종목·트레이딩 완료 확인

제품 기준은 [main 1e49ff7](https://github.com/krdn/gon-stock03/commit/1e49ff70df12625b75682007f016fc6dfccbc356)이다. 사용자는 두 화면의 확인 범위를 보고 “두 화면 모두 수용하고 #20·#12를 닫습니다.”라고 답했다.

| 순서 | 완료 근거 |
|---|---|
| 1. 매매 정책 #123 | 새 계약의 지정가 상한, 수량, 시세·신호 유효기간, 특별장 시간과 기존 원장 호환성을 검증한 PR125가 통합됐다. 80,000원 상한 아래에서 조회한 79,830원을 주문·원장에 반영하는 격리 HTTP 회귀가 포함된다. [제품 검증](../tasks/123-trading-policy.md) · [종료 기록](https://github.com/krdn/gon-stock03/issues/123#issuecomment-7012658419) |
| 2. 관심종목 #20 | PR89 통합 후 4303의 저장 마스터 3,966종목에서 삼성전자(005930)를 찾아 197,400원과 수신 시각을 확인했다. 마스터 수집 후 24시간 경과 안내도 표시됐다. 1440px·390px에서 상세를 열면 패널로, 닫으면 같은 행의 보기 버튼으로 초점이 이동했다. 주문 링크는 `/paper?code=005930`이었다. [시세 행](assets/2026-11-19-closeout/watch-quotes.png) · [PC 상세](assets/2026-11-19-closeout/watch-detail-desktop.png) · [모바일 너비 상세](assets/2026-11-19-closeout/watch-detail-mobile.png) |
| 3. 트레이딩 #12 | PR90 통합 후 같은 앱에서 삼성전자에서 SK하이닉스(000660)로 바꾸고 20·60·100일봉을 선택했다. 두 너비 모두 차트의 종목과 거래일 수가 일치했다. 주문 링크는 `/paper?code=000660`이었고 수동 조회 없이 KIS 수신 시각이 23:52:47에서 23:53:03 KST로 바뀌었다. [PC 100일봉](assets/2026-11-19-closeout/trade-desktop.png) · [모바일 너비 100일봉](assets/2026-11-19-closeout/trade-mobile.png) |

격리 체크아웃에서 단위·서버 검사 271건, Playwright 브라우저 검사 177건, TypeScript·프로덕션 빌드가 통과했다. 4303의 시세는 장외 KIS REST 조회값이다. 이번 화면 확인에서 주문·취소·전략을 실행하지 않았다. 모바일은 Chromium 390px로 검증했고 실기기 터치는 미측정이다. [같은 SHA의 앱 CI](https://github.com/krdn/gon-stock03/actions/runs/44545711278) · [구성 CI](https://github.com/krdn/gon-stock03/actions/runs/44545711706)

## 상위 이슈

사용자는 “기존 기준 유지. #25가 필요한 상위 이슈는 열린 상태로 둡니다.”를 선택했다. 화면 묶음 #3의 마지막 두 하위 화면이 이번 수용 대상이다. 공통 기능 #2의 하위 #6·#7·#9·#19는 모두 completed다. 전체 #1에는 #25가 직접 연결돼 있다. 세 상위 이슈의 완료 판정은 실제 부분체결 뒤 잔량 취소 시도와 체결·취소 결과를 같은 주문에서 대조한 뒤 진행한다. [기존 실증 기록](2026-11-19-strategy.md) · [남은 완료 기준](../tasks/25-validation.md)
