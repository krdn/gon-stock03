# 1차 화면 함께 보기 {#workbench-guide}

궁금한 일을 고르면 1차 화면 캡처와 2차 변경을 함께 볼 수 있습니다. 각 카드의 ‘이 PC에서 예시 열기’로 합성 데이터를 확인하고 ‘이 화면에 의견 남기기’에서 바꾸고 싶은 버튼이나 결과를 알려주세요. 예시 주소는 이 프로젝트가 실행 중인 PC에서 열립니다.

- [전체 화면 목차](block:contents)
- [화면 뒤에서 일하는 곳](block:system)
- [수량 한도를 바꾸면 어떻게 될까?](block:limits)
- [이 화면에 의견 남기기](block:feedback)

@answer scope="국내 주식·ETF · 1차 화면 기준과 2차 검토 예시 · 2026년 11월 20일"
@meta locale=ko style=editorial repo_url=https://github.com/krdn/gon-stock03 repo_revision=37dca0834381f355cda8caa5abece9992888a3a3
@source local-save title="종목 메모 저장" path=server/http.ts lines=161:166
@source watch-save title="관심 종목 저장" path=server/http.ts lines=127:133
@source http title="화면 요청을 받는 로컬 서버" path=server/http.ts lines=42:49
@source reconcile title="KIS 모의 주문과 주문 대조" path=server/http.ts lines=94:101
@source db title="PC에 주문을 저장하는 SQLite 원장" path=server/store.ts lines=44:54
@source acceptance title="1차 수용과 실제 주문 대조" path=docs/verification/2026-11-20-paper-acceptance.md lines=3:11
@source plan title="다음 실행 조건의 초안과 고정" path=server/trading-plans.ts lines=154:190
@source settings-history title="일반 설정과 고정된 실행의 적용 범위" path=docs/tasks/122-trading-settings.md lines=5:16
@source storage title="모의 주문 원장에 남는 기록" path=server/store.ts lines=240:253
@source screen-dashboard title="대시보드 동작" path=src/pages/Workspace.tsx lines=15:52
@source screen-market title="시장 탐색 동작" path=src/pages/MarketExplorer.tsx lines=144:166
@source screen-watchlist title="관심종목 동작" path=src/pages/MarketExplorer.tsx lines=148:170
@source screen-trade title="트레이딩 동작" path=src/pages/LiveTrading.tsx lines=84:100
@source screen-paper title="KIS 모의 매매 동작" path=src/pages/Paper.tsx lines=91:130
@source screen-orders title="주문·체결 동작" path=src/pages/Trading.tsx lines=104:134
@source screen-portfolio title="포트폴리오 동작" path=src/pages/Workspace.tsx lines=62:103
@source screen-settings title="연결·설정 동작" path=src/pages/Operations.tsx lines=139:180
@source screen-limits title="매매 설정 동작" path=src/components/PaperQuantitySetting.tsx lines=10:28
@source screen-risk title="위험관리 동작" path=src/pages/Operations.tsx lines=22:32
@source screen-strategies title="전략 스튜디오 동작" path=src/pages/Research.tsx lines=12:25
@source screen-backtest title="백테스트 동작" path=src/pages/Research.tsx lines=65:91
@source screen-data title="데이터 상태 동작" path=src/pages/DataInventory.tsx lines=58:93
@source screen-alerts title="알림·이벤트 동작" path=src/pages/Operations.tsx lines=69:94
@source screen-journal title="매매일지 동작" path=src/pages/Operations.tsx lines=55:66
@source screen-design title="설계실 동작" path=src/pages/Design.tsx lines=24:40

## 무엇을 하고 싶으세요? {#contents}

| 궁금한 일 | 살펴볼 화면 |
| --- | --- |
| 오늘 상태와 종목 살펴보기 | [대시보드](block:dashboard) · [시장 탐색](block:market) · [관심종목](block:watchlist) · [트레이딩](block:trade) |
| 주문 준비와 결과 확인 | [KIS 모의 매매](block:paper) · [주문·체결](block:orders) · [포트폴리오](block:portfolio) |
| 연결과 한도 바꾸기 | [연결·설정](block:settings) · [매매 설정](block:limits) · [위험관리](block:risk) |
| 전략과 데이터 살펴보기 | [전략 스튜디오](block:strategies) · [백테스트](block:backtest) · [데이터 상태](block:data) |
| 이유를 찾거나 기록 남기기 | [알림·이벤트](block:alerts) · [매매일지](block:journal) · [설계실](block:design) |

## 화면과 기록은 어떻게 이어질까? {#overview span=12}

@workflow id=journey title="종목 하나가 모의 주문 기록으로 이어지는 과정"
| price | 종목·시세 | frontend | source:screen-trade |
| request | 주문 확인 | frontend | source:screen-paper |
| ledger | 주문 기록 | database | source:storage |
| balance | 보유 확인 | frontend | source:screen-portfolio |
| price > request | |
| request > ledger | |
| ledger > balance | |

@steps id=walk
| step-price | 종목·시세 | [시장 탐색](block:market)에서 종목을 고르고 [트레이딩](block:trade)에서 받은 가격과 시각을 봅니다. | journey | price |
| step-request | 주문 확인 | [KIS 모의 매매](block:paper)에서 조건을 확인합니다. 실제 모의 전송은 별도 조작입니다. | journey | request |
| step-ledger | 주문 기록 | [주문·체결](block:orders)에서 원주문의 상태와 잔량을 봅니다. | journey | ledger |
| step-balance | 보유 확인 | [포트폴리오](block:portfolio)에서 KIS가 돌려준 잔고와 보유 수량을 대조합니다. | journey | balance |

DEMO 연습에서는 내 PC가 합성 가격으로 주문을 처리합니다. KIS 모의에서는 증권사가 모의계좌의 접수·체결·잔고를 알려줍니다. 아래 이미지는 캡처 당시의 예시이며 현재 계좌 잔고와 시세는 해당 앱에서 확인합니다.

## 화면 뒤에서 누가 무슨 일을 할까? {#system}

@architecture id=services title="버튼을 누른 뒤 결과가 오는 곳"
| browser | 앱 화면 | frontend | source:screen-paper |
| local | 내 PC 서버 | backend | source:http |
| dbfile | 로컬 원장 | database | source:db |
| kis | KIS 모의계좌 | external | source:reconcile |
| browser > local | 요청 |
| local > dbfile | 조회·저장 |
| local > kis | 모의 조회·주문 |

**관심목록이나 메모를 저장할 때** 화면이 내 PC 서버에 요청합니다. 서버가 로컬 원장에 저장하면 나중에 다시 열어도 읽을 수 있습니다.[](source:local-save)[](source:watch-save)

**KIS 주문을 확인할 때** 화면에 보이는 최근 기록은 로컬 원장에서 오고, 체결·잔량의 최신 확인은 서버가 증권사에 다시 조회해서 얻습니다. 둘의 시각이 다를 수 있습니다.[](source:reconcile)

## 같이 짚어볼 지점이 있나요? {#feedback}

화면 제목과 버튼 이름을 말해주세요. “매매 설정에서 수량 한도 저장을 누르면 이미 준비한 주문도 바뀌어?”처럼 질문만 해도 됩니다. 답을 먼저 확인한 뒤 바꾸고 싶은 동작을 정할 수 있습니다.

각 화면 제목 옆 **Ask**에서 질문을 적고 **Copy question**을 누르면 화면 정보와 질문을 함께 복사합니다. 이 대화에 붙여넣거나 GitHub 댓글로 전달할 수 있습니다.

GitHub에 남길 때는 [지도 검토 이슈에 의견 쓰기](https://github.com/krdn/gon-stock03/issues/143#issuecomment-new)를 열고 화면 이름과 질문을 적어 댓글을 등록하세요. [프로젝트 보드](https://github.com/users/krdn/projects/25)에서 지도 제작과 사용자 검토 상태를 봅니다.

## 대시보드 · 장 시작 전에 무엇을 확인할까? {#dashboard}

DEMO와 KIS 모의 중 살펴볼 환경을 선택합니다. 자산·주문·연결 요약에서 확인할 항목을 고릅니다.[](source:screen-dashboard)

@image path="verification/assets/ui-acceptance-2026-11-17/core/dashboard-desktop-settled.png" alt="대시보드 화면 캡처" caption="11월 17일 · 대시보드 검증 화면"

미체결이나 연결 경고를 누르면 자세한 원인을 볼 화면으로 이동합니다. KIS 잔고를 확인하지 못한 경우에는 금액을 미확인으로 표시합니다.

**2차 미리보기**  ‘KIS 전략 평가 확인’을 누르면 전략 스튜디오의 KIS 환경이 열립니다. ‘위험 경고 · 원인 화면’은 경고를 일으킨 화면으로 이동합니다. 공통 시각 수정을 함께 적용한 예시에서는 단말 시계가 2분 빠르거나 느려도 서버가 방금 확인한 데이터가 정상으로 표시됩니다. [대시보드 검토 #150](https://github.com/krdn/gon-stock03/issues/150) · [미리보기와 전후 화면 PR #156](https://github.com/krdn/gon-stock03/pull/156) · [시각 판정 #157](https://github.com/krdn/gon-stock03/issues/157)

**이 화면에서 물어볼 수 있는 것**  연결 경고가 보일 때 어디부터 살펴봐야 할까?

[주문·체결 보기](block:orders) · [전체 목차](block:contents) · [이 PC에서 예시 열기](http://127.0.0.1:4480/dashboard) · [이 화면에 의견 남기기](https://github.com/krdn/gon-stock03/issues/150#issuecomment-new)

## 시장 탐색 · 시장의 종목 중 무엇을 지켜볼까? {#market}

국내 종목 이름이나 코드로 검색합니다. 시장을 좁히고 별을 누르면 그 종목을 관심목록에 넣거나 뺍니다.[](source:screen-market)

@image path="verification/assets/ui-acceptance-2026-11-17/market/market-desktop.png" alt="시장 탐색 화면 캡처" caption="11월 17일 · 시장 탐색 검증 화면"

목록은 관심종목 화면에서도 바뀝니다. 현재가는 별도로 조회하며 가격을 받지 못하면 종목 이름만으로 가격을 추정할 수 없습니다.

**2차 미리보기**  이름이나 코드로 찾은 뒤 ‘종목 상세’를 열어 트레이딩으로 이동하면 선택한 종목이 이어집니다. 뒤로 가면 목록 조건과 상세를 다시 볼 수 있습니다. [시장 탐색 #161](https://github.com/krdn/gon-stock03/issues/161) · [전후 화면 PR #167](https://github.com/krdn/gon-stock03/pull/167)

**이 화면에서 물어볼 수 있는 것**  별을 눌렀을 때 어디에 추가됐는지 더 잘 보이면 좋겠어.

[관심종목 보기](block:watchlist) · [전체 목차](block:contents) · [이 PC에서 예시 열기](http://127.0.0.1:4477/market) · [이 화면에 의견 남기기](https://github.com/krdn/gon-stock03/issues/161#issuecomment-new)

## 관심종목 · 내가 고른 종목을 다시 보려면? {#watchlist}

저장한 종목에서 상세를 열어 최근 받은 가격과 조회 시각을 확인합니다. 관심 해제는 시장 탐색에도 반영됩니다.[](source:screen-watchlist)

@image path="verification/assets/2026-11-19-closeout/watch-detail-desktop.png" alt="관심종목 화면 캡처" caption="11월 19일 · 관심종목 상세 검증 화면"

상세에서 선택 종목을 모의 주문 화면으로 가져갈 수 있습니다. 이때 옮기는 것은 종목 코드이고, 주문 전송에는 별도 확인이 필요합니다.

**2차 미리보기**  관심종목 상세에서 코드를 복사하거나 ‘트레이딩에서 시세 보기’를 누르면 선택 종목으로 이동합니다. Escape로 닫으면 상세를 열었던 종목으로 초점이 돌아갑니다. 시장·관심 양쪽에서 뒤로·앞으로 이동하면 URL에 맞춰 상세가 열리거나 닫힙니다. [관심종목 #169](https://github.com/krdn/gon-stock03/issues/169) · [모바일과 이력 복원 PR #172](https://github.com/krdn/gon-stock03/pull/172)

**이 화면에서 물어볼 수 있는 것**  종목 상세에서 주문 화면으로 무엇이 넘어가?

[KIS 모의 매매 보기](block:paper) · [전체 목차](block:contents) · [이 PC에서 예시 열기](http://127.0.0.1:4477/watchlist) · [이 화면에 의견 남기기](https://github.com/krdn/gon-stock03/issues/169#issuecomment-new)

## 트레이딩 · 차트의 가격은 어디에서 왔을까? {#trade}

종목을 고르고 일봉 기간을 바꿉니다. 기본 화면은 KIS에서 받은 현재가와 수정 일봉을, DEMO 연습 탭은 합성 가격을 보여줍니다.[](source:screen-trade)

@image path="verification/assets/2026-11-19-closeout/trade-desktop.png" alt="트레이딩 화면 캡처" caption="11월 19일 · 트레이딩 검증 화면"

KIS 모의 주문으로 이동하면 종목 코드가 이어집니다. 시세 갱신은 가격 표시를 바꾸며, 주문 여부는 다음 화면에서 결정합니다.

**2차 미리보기**  실제 시세 보기에서 수신 시각과 일봉 구간을 확인하고, 종목과 20·60·100일봉 선택을 새로고침 후에도 이어갑니다. DEMO 입력에서 예시 주문을 접수한 뒤 ‘DEMO 주문 원장’을 누르면 접수 결과가 열립니다. [트레이딩 #158](https://github.com/krdn/gon-stock03/issues/158) · [전후 화면 PR #164](https://github.com/krdn/gon-stock03/pull/164)

**이 화면에서 물어볼 수 있는 것**  시세가 오래됐을 때 어느 시간을 보면 돼?

[KIS 모의 매매 보기](block:paper) · [전체 목차](block:contents) · [이 PC에서 예시 열기](http://127.0.0.1:4480/trade?code=000660&range=100) · [이 화면에 의견 남기기](https://github.com/krdn/gon-stock03/issues/158#issuecomment-new)

## KIS 모의 매매 · 조회와 주문 전송은 어디서 갈릴까? {#paper}

시세·계좌를 조회한 뒤 수량과 가격을 입력합니다. 허용된 모의계좌·실행 조건에서 주문 내용을 확인하고 전송할 수 있습니다.[](source:screen-paper)

@image path="verification/assets/ui-acceptance-2026-11-17/connection/paper-desktop.png" alt="KIS 모의 매매 화면 캡처" caption="11월 17일 · KIS 모의 매매 화면의 당시 배치"

접수 후에는 같은 원주문의 체결·잔량을 대조합니다. 응답이 끊겼다면 저장한 요청으로 대조합니다. 1차에서는 부분체결 직후 잔량취소까지 같은 주문에서 실측한 사례가 없습니다.[](source:acceptance)

**2차 미리보기**  주문 입력에서 ‘수량 한도 변경’을 열어 저장하고 ‘주문 입력으로 돌아가기’를 누르면 원래 종목·매수/매도·수량·지정가를 다시 확인할 수 있습니다. 새 주문 화면은 별도 입력으로 열립니다. [복원 시나리오 #154](https://github.com/krdn/gon-stock03/issues/154) · [입력 복원 PR #159](https://github.com/krdn/gon-stock03/pull/159)

**복구와 취소 예시**  ‘불명 주문 보기’에서 결과를 확인하지 못한 원주문으로 이동합니다. 부분체결 예시에서 ‘잔량 전부 취소’를 누르면 확인창이 열립니다. 닫으면 요청이 전송되지 않고, 확인하면 대조 결과에서 체결·취소확인·남은 수량을 볼 수 있습니다. [모의 매매 #166](https://github.com/krdn/gon-stock03/issues/166) · [예시 화면 PR #170](https://github.com/krdn/gon-stock03/pull/170)

**이 화면에서 물어볼 수 있는 것**  접수됐다는 표시와 체결됐다는 표시를 어디에서 구별해?

[주문·체결 보기](block:orders) · [전체 목차](block:contents) · [이 PC에서 예시 열기](http://127.0.0.1:4458/paper?code=005930&sample=166) · [이 화면에 의견 남기기](https://github.com/krdn/gon-stock03/issues/166#issuecomment-new)

## 주문·체결 · 내가 보낸 주문은 어떻게 됐을까? {#orders}

환경을 선택하고 종목·상태로 찾습니다. DEMO에서는 남은 주문을 취소하거나 다음 합성 봉에서 평가할 수 있습니다.[](source:screen-orders)

@image path="verification/assets/ui-acceptance-2026-11-17/core/orders-desktop-settled.png" alt="주문·체결 화면 캡처" caption="11월 17일 · 주문·체결 검증 화면"

KIS 목록은 PC에 저장된 주문 기록을 읽습니다. 증권사의 최신 상태를 확인할 때는 해당 종목의 KIS 모의 매매 화면에서 주문을 대조합니다.

**현재 앱**  ‘지난 KIS 실행 기록’을 열면 주문별 체결·잔량과 마지막 KIS 확인 시각이 함께 보입니다. ‘주문 상세’에서 주문일과 출처를 확인합니다. [지난 기록 #147](https://github.com/krdn/gon-stock03/issues/147)

**2차 미리보기**  ‘DEMO 주문’은 미체결 행에 취소 가능 여부를 표시합니다. ‘KIS 모의 원장’은 주문별 확인 시각을 첫 행에 표시하고 식별자와 출처를 상세에 둡니다. [주문·체결 검토 #151](https://github.com/krdn/gon-stock03/issues/151) · [예시 미리보기와 전후 화면 PR #155](https://github.com/krdn/gon-stock03/pull/155)

**이 화면에서 물어볼 수 있는 것**  목록을 새로 읽은 시각과 증권사에서 확인한 시각을 같이 보고 싶어.

[포트폴리오 보기](block:portfolio) · [전체 목차](block:contents) · [이 PC에서 예시 열기](http://127.0.0.1:4452/orders?view=kis) · [이 화면에 의견 남기기](https://github.com/krdn/gon-stock03/issues/151#issuecomment-new)

## 포트폴리오 · 체결 뒤 내 보유 종목은 어떻게 보일까? {#portfolio}

DEMO 또는 KIS 모의를 선택해 현금, 보유 수량, 평가손익을 봅니다. KIS 잔고는 화면의 갱신 동작으로 다시 조회합니다.[](source:screen-portfolio)

@image path="verification/assets/ui-acceptance-2026-11-17/market/portfolio-kis-desktop.png" alt="포트폴리오 화면 캡처" caption="11월 17일 · 포트폴리오 KIS 보기"

선택한 환경의 자산을 표시합니다. 평가에 필요한 가격이나 잔고가 부족하면 확인할 수 없는 값을 구분해 보여줍니다.

**2차 미리보기**  계좌를 선택하면 금액의 출처와 마지막 전체 성공 시각을 KST로 봅니다. 일부만 받은 잔고는 경고에서 최근 시도와 원인을 확인합니다. DEMO 보유 종목을 열면 같은 종목의 DEMO 트레이딩으로 이동하고, 뒤로 가면 선택 계좌가 복원됩니다. [포트폴리오 #174](https://github.com/krdn/gon-stock03/issues/174) · [계좌·종목 전달 PR #176](https://github.com/krdn/gon-stock03/pull/176)

**이 화면에서 물어볼 수 있는 것**  평가손익 옆에서 기준 가격의 시각도 볼 수 있을까?

[대시보드 보기](block:dashboard) · [전체 목차](block:contents) · [이 PC에서 예시 열기](http://127.0.0.1:4460/portfolio) · [이 화면에 의견 남기기](https://github.com/krdn/gon-stock03/issues/174#issuecomment-new)

## 연결·설정 · 계좌 정보가 비어 있으면 어디를 볼까? {#settings}

서버의 연결 준비 상태, KIS 인증, 잔고 조회를 차례로 봅니다. 화면에 표시된 실패 단계에서 다시 확인할 수 있습니다.[](source:screen-settings)

@image path="verification/assets/settings-ux/mobile-after.png" alt="연결·설정 화면 캡처" caption="11월 19일 개선 작업 기록의 모바일 연결·설정 화면"

인증과 잔고 조회 결과가 따로 표시됩니다. 인증에 성공한 뒤에도 잔고 조회가 실패할 수 있어 마지막 성공 시각을 함께 확인합니다.

**2차 미리보기**  ‘서버 상태 새로고침’은 이 앱의 저장 상태와 연결 정보를 다시 읽습니다. ‘KIS 모의 잔고 조회’는 모의 계좌 조회를 요청합니다. 일부만 받은 응답과 이전에 전부 받은 잔고의 시각·출처를 구별할 수 있습니다. [연결·설정 #162](https://github.com/krdn/gon-stock03/issues/162) · [전후 화면 PR #165](https://github.com/krdn/gon-stock03/pull/165)

**이 화면에서 물어볼 수 있는 것**  인증은 됐는데 잔고만 비어 있으면 다음에 어디를 누를까?

[매매 설정 보기](block:limits) · [전체 목차](block:contents) · [이 PC에서 예시 열기](http://127.0.0.1:4480/settings?guide=setup) · [이 화면에 의견 남기기](https://github.com/krdn/gon-stock03/issues/162#issuecomment-new)

## 매매 설정 · 수량을 바꾸면 어느 주문에 적용될까? {#limits}

일반 주문·위험에서 수동 주문당 수량을 저장합니다. 한정 실행이나 전략은 별도 화면에서 초안을 검토하고 다음 실행 조건을 고정합니다.[](source:plan)[](source:screen-limits)

@image path="verification/assets/v1-guide/general-settings.png" alt="매매 설정 화면 캡처" caption="11월 20일 · 1차 코드와 예시 데이터로 연 일반 주문·위험 화면"

예를 들어 수동 한도 8주와 이번 승인 상한 3주가 함께 적용되면 수량 상한은 3주입니다. 금액·잔고 조건도 따로 검사합니다. 일반 설정 저장은 주문을 보내지 않으며, 이미 고정한 실행 조건은 그대로입니다.[](source:settings-history)

**2차 미리보기**  주문에서 일반 수량 설정을 열면 저장 결과 바로 아래의 링크로 주문 입력에 돌아갈 수 있습니다. 한정 실행과 전략 계약은 저장된 초안을 열어 대상·한도·검토를 거치고, 고정 결과에서 다음 실행에 적용할 조건을 읽습니다. [매매 설정 검토 #152](https://github.com/krdn/gon-stock03/issues/152) · [저장·고정 결과 PR #160](https://github.com/krdn/gon-stock03/pull/160)

**이 화면에서 물어볼 수 있는 것**  저장 버튼 옆에 이번 주문에 적용되는 수량도 보여줘.

[KIS 모의 매매 보기](block:paper) · [전체 목차](block:contents) · [이 PC에서 예시 열기](http://127.0.0.1:4453/settings/trading) · [이 화면에 의견 남기기](https://github.com/krdn/gon-stock03/issues/152#issuecomment-new)

## 위험관리 · 긴급정지를 누르면 무엇이 멈출까? {#risk}

환경별 사용량과 공통 한도를 확인합니다. 긴급정지를 실행하면 신규 주문을 막고 전략을 정지합니다.[](source:screen-risk)

@image path="verification/assets/ui-acceptance-2026-11-17/core/risk-desktop-settled.png" alt="위험관리 화면 캡처" caption="11월 17일 · 위험관리 검증 화면"

이미 보유한 종목과 접수된 주문은 남습니다. 남은 주문은 해당 환경의 원장에서 확인하며, 처리 결과가 불분명하면 대조한 뒤 재개를 검토합니다.

**2차 미리보기**  ‘KIS 모의 사용량’을 선택하면 해당 계좌의 사용량과 미확인 이유를 볼 수 있습니다. ‘매매 한도 변경’에서 일반 설정으로 이동한 뒤 ‘위험관리로 돌아가기’를 누르면 선택했던 환경이 열립니다. [위험관리 #168](https://github.com/krdn/gon-stock03/issues/168) · [환경 복귀 PR #171](https://github.com/krdn/gon-stock03/pull/171)

**이 화면에서 물어볼 수 있는 것**  정지한 뒤에도 남는 주문을 바로 확인하고 싶어.

[주문·체결 보기](block:orders) · [전체 목차](block:contents) · [이 PC에서 예시 열기](http://127.0.0.1:4459/risk?env=kis) · [이 화면에 의견 남기기](https://github.com/krdn/gon-stock03/issues/168#issuecomment-new)

## 전략 스튜디오 · 내가 정한 규칙은 언제 평가될까? {#strategies}

환경·종목·이동평균 기간·수량을 정해 전략을 저장합니다. DEMO는 합성 봉을 재생하고 KIS 모의는 검증된 체결가 이벤트로 신호를 평가합니다.[](source:screen-strategies)

@image path="verification/assets/ui-acceptance-2026-11-17/trading/strategies-desktop.png" alt="전략 스튜디오 화면 캡처" caption="11월 17일 · 전략 스튜디오 검증 화면"

저장한 전략의 실행에는 시작 절차가 있습니다. KIS 모의에서는 해당 전략과 맞는 계약·실시간 대조 조건을 확인하며 관망·차단 이유를 화면에 남깁니다.

**2차 미리보기**  대시보드에서 ‘KIS 전략 평가 확인’을 누르면 최근 평가 사유가 먼저 보입니다. ‘해당 전략 보기’에서 그 전략의 기록을 열고 ‘다음 계약 준비’로 이동합니다. 두 전략의 계약 기간을 각각 편집하면 전략별 초안이 분리됩니다. [전략 스튜디오 #175](https://github.com/krdn/gon-stock03/issues/175) · [전략 평가·계약 PR #178](https://github.com/krdn/gon-stock03/pull/178)

**이 화면에서 물어볼 수 있는 것**  전략이 이번에는 왜 주문하지 않았는지 보고 싶어.

[알림·이벤트 보기](block:alerts) · [전체 목차](block:contents) · [이 PC에서 예시 열기](http://127.0.0.1:4480/strategies?environment=kis-paper) · [이 화면에 의견 남기기](https://github.com/krdn/gon-stock03/issues/175#issuecomment-new)

## 백테스트 · 같은 규칙을 과거 봉에 적용하면? {#backtest}

저장된 일봉과 기간·비용·매매 규칙을 고르거나 합성 데이터로 동작을 연습합니다. 저장 일봉 실험은 결과를 다시 불러와 재현할 수 있습니다.[](source:screen-backtest)

@image path="verification/assets/ui-acceptance-2026-11-17/trading/backtest-desktop.png" alt="백테스트 화면 캡처" caption="11월 17일 · 백테스트 검증 화면"

고정한 입력과 과거 봉으로 계산한 자산 곡선·거래 내역이 나옵니다. 표본과 출처를 확인해야 결과를 해석할 수 있습니다. 계산만으로 주문이 전송되지는 않습니다.

**2차 미리보기**  데이터 상태에서 고른 저장 일봉이나 DEMO 출처로 들어옵니다. 기간과 비용을 확인한 뒤 실험을 실행하면 결과가 보입니다. ‘저장 실험 불러오기’로 고정 입력을 확인하고 같은 조건의 결과를 다시 계산할 수 있습니다. [백테스트 #180](https://github.com/krdn/gon-stock03/issues/180) · [출처·실험 검토 PR #183](https://github.com/krdn/gon-stock03/pull/183)

**이 화면에서 물어볼 수 있는 것**  이 곡선이 어떤 일봉과 비용으로 계산됐는지 어디서 봐?

[데이터 상태 보기](block:data) · [전체 목차](block:contents) · [이 PC에서 예시 열기](http://127.0.0.1:4484/backtest?source=stored) · [이 화면에 의견 남기기](https://github.com/krdn/gon-stock03/issues/180#issuecomment-new)

## 데이터 상태 · 어떤 종목과 날짜의 자료가 들어 있나? {#data}

종목 목록과 저장된 일봉 수집 기록을 읽습니다. 수집 건을 선택해 출처·기간·누락이나 빈 구간을 확인합니다.[](source:screen-data)

@image path="verification/assets/ui-acceptance-2026-11-17/operations/data-desktop.png" alt="데이터 상태 화면 캡처" caption="11월 17일 · 데이터 상태 검증 화면"

조회 결과는 차트나 백테스트의 입력을 점검하는 근거입니다. 저장 범위를 열어 보는 조작으로 누락된 일봉이 채워지지는 않습니다.

**2차 미리보기**  ‘KIS 일봉’에서 수집 기록을 선택하고 ‘품질 상세 펼치기’를 누르면 달력과 대조한 누락일 또는 아직 확인하지 못한 항목을 봅니다. 새로고침하면 같은 기록이 열립니다. ‘백테스트에서 합성 출처 확인’은 DEMO 출처를, 저장 일봉 링크는 선택한 수집 ID를 다음 화면 주소로 전달합니다. 백테스트 개선본에서 링크를 열면 전달한 저장 기록이나 DEMO 출처가 선택됩니다. [데이터 상태 #173](https://github.com/krdn/gon-stock03/issues/173) · [품질·출처 화면 PR #177](https://github.com/krdn/gon-stock03/pull/177)

**이 화면에서 물어볼 수 있는 것**  결과가 비어 있을 때 어느 날짜가 빠졌는지 알고 싶어.

[백테스트 보기](block:backtest) · [전체 목차](block:contents) · [이 PC에서 예시 열기](http://127.0.0.1:4484/data) · [이 화면에 의견 남기기](https://github.com/krdn/gon-stock03/issues/173#issuecomment-new)

## 알림·이벤트 · 무엇이 실패했고 원인은 어디에 있을까? {#alerts}

중요도로 기록을 좁히고 이벤트를 열어 원인 화면이나 관련 주문을 찾습니다. 모두 읽음은 읽음 상태를 바꿉니다.[](source:screen-alerts)

@image path="verification/assets/ui-acceptance-2026-11-17/operations/alerts-desktop.png" alt="알림·이벤트 화면 캡처" caption="11월 17일 · 알림·이벤트 검증 화면"

실패 원인과 주문 상태는 각각 담당 화면에서 확인합니다. 알림을 읽어도 주문이 복구되거나 연결이 재시도되지는 않습니다.

**2차 미리보기**  중요도·환경·읽음 상태로 목록을 좁히면 ‘이 목록 읽음 처리’는 현재 보이는 미읽음 이벤트에만 적용됩니다. ‘KIS 모의 전략 원인 화면’을 누르면 KIS 전략이 열리고, 뒤로 가면 원래 필터가 복원됩니다. [알림·이벤트 #179](https://github.com/krdn/gon-stock03/issues/179) · [읽음 범위와 원인 이동 PR #181](https://github.com/krdn/gon-stock03/pull/181)

**이 화면에서 물어볼 수 있는 것**  이 경고가 어느 주문에서 나온 건지 바로 보고 싶어.

[주문·체결 보기](block:orders) · [전체 목차](block:contents) · [이 PC에서 예시 열기](http://127.0.0.1:4480/alerts) · [이 화면에 의견 남기기](https://github.com/krdn/gon-stock03/issues/179#issuecomment-new)

## 매매일지 · 내가 그때 생각한 이유를 어디에 남길까? {#journal}

종목을 선택해 메모를 작성하고 저장합니다. 종목 코드나 본문으로 이전 메모를 찾습니다.[](source:screen-journal)

@image path="verification/assets/ui-acceptance-2026-11-17/operations/journal-desktop.png" alt="매매일지 화면 캡처" caption="11월 17일 · 매매일지 검증 화면"

메모는 로컬에 남습니다. 여기 적은 매매 이유는 사용자의 기록이고 실제 주문·체결 결과는 주문 원장에서 확인합니다.

**2차 미리보기**  종목과 메모를 입력해 ‘일지 저장’을 누르면 로컬 기록이 생깁니다. 종목명·코드·메모 본문으로 찾을 수 있고, 같은 방문을 새로고침하면 검색 조건이 돌아옵니다. 저장 응답을 받지 못한 경우 전체 목록을 다시 읽고, 작성 중인 메모는 보존합니다. [매매일지 #182](https://github.com/krdn/gon-stock03/issues/182) · [모바일 작성·검색 PR #184](https://github.com/krdn/gon-stock03/pull/184)

**이 화면에서 물어볼 수 있는 것**  지난번에 이 종목을 선택한 이유를 다시 찾고 싶어.

[주문·체결 보기](block:orders) · [전체 목차](block:contents) · [이 PC에서 예시 열기](http://127.0.0.1:4465/journal) · [이 화면에 의견 남기기](https://github.com/krdn/gon-stock03/issues/182#issuecomment-new)

## 설계실 · 이 화면을 왜 만들었는지 어디서 확인할까? {#design}

화면 이름을 선택해 목적, 연결된 이슈, 완료 기준을 읽습니다. 프로젝트 지도에는 단계별 수정 요청 초안을 적을 수 있습니다.[](source:screen-design)

@image path="verification/assets/ui-acceptance-2026-11-17/connection/design-desktop.png" alt="설계실 화면 캡처" caption="11월 17일 · 설계실 검증 화면"

기존 지도의 초안은 현재 브라우저에 저장됩니다. 대화에 복사하거나 GitHub 댓글을 직접 등록하면 함께 검토할 수 있습니다.

**2차 미리보기**  설계실에서 ‘주문·체결’을 고르면 이 화면의 조작과 근거를 볼 수 있습니다. ‘화면 열기’는 앱으로, ‘주문·체결 의견 남기기’는 해당 화면의 이슈로 연결됩니다. ‘매매 설정’도 별도 의견 대상을 갖습니다. [설계실 #185](https://github.com/krdn/gon-stock03/issues/185) · [화면 선택·피드백 PR #186](https://github.com/krdn/gon-stock03/pull/186)

**이 화면에서 물어볼 수 있는 것**  이 화면의 원래 목적과 지금 동작이 같은지 같이 보자.

[전체 지도 보기](block:contents) · [전체 목차](block:contents) · [이 PC에서 예시 열기](http://127.0.0.1:4466/design) · [이 화면에 의견 남기기](https://github.com/krdn/gon-stock03/issues/185#issuecomment-new)
