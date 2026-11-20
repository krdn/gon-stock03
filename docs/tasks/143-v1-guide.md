# 1차 화면 이해와 2차 수정 의견

처음 보는 화면 하나를 고르고, 무엇을 누르면 어디가 달라지는지 살펴본다. 2차에서 바꿀 기능은 지도를 본 뒤 사용자와 정한다.

[클릭형 지도 HTML 내려받기](../architecture/figures/v1-guide.html?raw=true) · [검토 이슈 #143](https://github.com/krdn/gon-stock03/issues/143) · [GitHub 프로젝트 보드](https://github.com/users/krdn/projects/25)

내려받은 HTML을 브라우저에서 열면 **전체 화면 목차**에서 원하는 항목으로 이동한다. 화면 옆 **Ask**에서 질문을 쓰고 **Copy question**을 누르면 해당 화면 정보와 질문이 복사된다. 대화에 붙여넣거나 이슈 #143에 댓글을 등록하면 된다.

## GitHub에서 바로 둘러보기

아래에서 화면 이름을 누르면 당시 검증 캡처가 열린다. 앱의 15개 메뉴와 연결된 매매 설정을 함께 다룬다.

| 화면 | 함께 짚어볼 질문 |
| --- | --- |
| [대시보드](../verification/assets/ui-acceptance-2026-11-17/core/dashboard-desktop-settled.png) | 장 시작 전에 무엇을 확인할까? |
| [시장 탐색](../verification/assets/ui-acceptance-2026-11-17/market/market-desktop.png) | 시장의 종목 중 무엇을 지켜볼까? |
| [관심종목](../verification/assets/2026-11-19-closeout/watch-detail-desktop.png) | 내가 고른 종목을 다시 보려면? |
| [트레이딩](../verification/assets/2026-11-19-closeout/trade-desktop.png) | 차트의 가격은 어디에서 왔을까? |
| [KIS 모의 매매](../verification/assets/ui-acceptance-2026-11-17/connection/paper-desktop.png) | 조회와 주문 전송은 어디서 갈릴까? |
| [주문·체결](../verification/assets/ui-acceptance-2026-11-17/core/orders-desktop-settled.png) | 내가 보낸 주문은 어떻게 됐을까? |
| [포트폴리오](../verification/assets/ui-acceptance-2026-11-17/market/portfolio-kis-desktop.png) | 체결 뒤 내 보유 종목은 어떻게 보일까? |
| [연결·설정](../verification/assets/settings-ux/mobile-after.png) | 계좌 정보가 비어 있으면 어디를 볼까? |
| [매매 설정](../verification/assets/v1-guide/general-settings.png) | 수량을 바꾸면 어느 주문에 적용될까? |
| [위험관리](../verification/assets/ui-acceptance-2026-11-17/core/risk-desktop-settled.png) | 긴급정지를 누르면 무엇이 멈출까? |
| [전략 스튜디오](../verification/assets/ui-acceptance-2026-11-17/trading/strategies-desktop.png) | 내가 정한 규칙은 언제 평가될까? |
| [백테스트](../verification/assets/ui-acceptance-2026-11-17/trading/backtest-desktop.png) | 같은 규칙을 과거 봉에 적용하면? |
| [데이터 상태](../verification/assets/ui-acceptance-2026-11-17/operations/data-desktop.png) | 어떤 종목과 날짜의 자료가 들어 있나? |
| [알림·이벤트](../verification/assets/ui-acceptance-2026-11-17/operations/alerts-desktop.png) | 무엇이 실패했고 원인은 어디에 있을까? |
| [매매일지](../verification/assets/ui-acceptance-2026-11-17/operations/journal-desktop.png) | 내가 그때 생각한 이유를 어디에 남길까? |
| [설계실](../verification/assets/ui-acceptance-2026-11-17/connection/design-desktop.png) | 이 화면을 왜 만들었는지 어디서 확인할까? |

## 지도 근거와 재개

- 화면·코드 기준은 `37dca08`이다. 착수 당시 Graphify 보고서 기준 `a1dcfeeb`와 비교해 `src/`, `server/`, `shared/` 차이가 없음을 확인했다. Graphify로 앱 진입점과 화면의 연결, 일반 매매 설정과 수량 한도 컴포넌트의 호출, 서버 설정과 저장소 연결을 찾아 코드와 대조했다.
- [지도 원본](../v1-guide.archify.md)에 조작, 적용 범위, 화면별 질문과 근거를 담았다. 보관 캡처 15개에는 시점을 표시했다. 일반 주문·위험은 1차 소스와 예시 데이터로 새로 촬영했다. 실제 KIS 부분체결 직후 잔량 취소 장면은 [1차 수용 당시 미관측](../verification/2026-11-20-paper-acceptance.md)으로 표시했다.
- 재생성은 Python/Pillow와 Archify 3.2.0이 있는 환경에서 저장소 루트의 `python docs/architecture/render-v1-guide.py /path/to/archify/bin/archify.mjs`로 한다. 원본 캡처는 보존하고 지도에 쓸 미리보기만 압축한다. [Archify 라이선스](../architecture/figures/Archify-LICENSE.txt)
- 최종 HTML을 1440×900 및 390×844 Chromium에서 열었다. 양쪽 모두 목차 16개에서 상세와 목차로 왕복했고, 16개 캡처를 디코딩했다. 매매 설정의 고유 주소로 재접속한 뒤 질문을 쓰고 클립보드에서 해당 화면과 질문을 확인했다. 문서 너비는 각각 1440·390px, 페이지 오류와 외부 요청은 0건이었다. 다운로드한 파일과 동일한 HTML을 로컬 파일로 열어 이미지도 확인했다. 사용자가 직접 검토하는 단계는 대기 중이다.
- 모바일 툴바가 390px을 넘어갔던 초안을 수정했다. Archify로 압축된 미리보기와 원본 지도를 검증한 뒤 모바일 줄바꿈을 적용한 배포 파일에 독립 HTML 검사와 브라우저 검사를 수행했다. 흐름도의 작은 연결 문구를 단계 설명으로 옮긴 뒤 Archify 브라우저의 배치·가독성·도구·테마 검사도 통과했다. 생성기 추가 후 Graphify 코드 그래프를 갱신했다.
- 독립 리뷰 첫 호출은 응답 없이 종료됐다. 지정 모델로 재시도해 생성기·대표 설명·검증 결과에서 결함 없음 판정을 받았다. 반환 모델은 `claude-opus-5-5`, 요청 강도는 high였다.
- 진행 단계와 사용자 의견은 [#143](https://github.com/krdn/gon-stock03/issues/143)에서 확인한다. 첫 사용자 검토에서는 화면과 버튼을 특정할 수 있는 질문이나 수정 의견을 기록하고, 합의한 변경만 후속 이슈에 연결한다.

## 2차 화면 검토

대시보드와 주문·체결 카드에 [#149의 개선 작업](https://github.com/krdn/gon-stock03/issues/149)을 반영했다. 병합된 지난 실행 기록과 초안 미리보기에 다른 표시를 쓴다. 대시보드의 KIS 전략 진입·경고 이동, DEMO 주문 취소 가능 여부와 현재 KIS의 주문별 확인 시각에 해당 PR과 의견 이슈를 연결했다. 두 카드의 새 PR 링크와 390×844·1440×900에서 가로 넘침이 없는 것을 실제 4328 지도에서 확인했다.

매매 설정과 KIS 모의 매매 카드에는 수량 저장 뒤 원래 주문으로 돌아가는 위치, 초안과 고정 결과, 주문 입력 복원 이슈·PR을 연결했다. 4328 지도의 두 카드에서 390×844와 1440×900 모두 새 PR 링크와 가로폭을 확인했다.
