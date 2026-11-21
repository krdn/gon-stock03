# 설계실에서 화면을 찾고 의견 남기기

[이슈 #185](https://github.com/krdn/gon-stock03/issues/185) · [전체 #149](https://github.com/krdn/gon-stock03/issues/149) · [설계실 1차 #24](https://github.com/krdn/gon-stock03/issues/24) · [안내 지도 #143](https://github.com/krdn/gon-stock03/issues/143)

[설계실 예시](http://127.0.0.1:4466/design)에서 **주문·체결 → 주문·체결 의견 남기기**를 누르면 그 화면의 [2차 이슈 #151](https://github.com/krdn/gon-stock03/issues/151#issuecomment-new)이 열린다. [선택한 화면으로 바로 열기](http://127.0.0.1:4466/design?screen=orders) · [체결·취소 단계](http://127.0.0.1:4466/design?tab=flow&step=3) · [잘못된 화면 주소](http://127.0.0.1:4466/design?screen=unknown)

## 같은 예시에서 바뀐 위치

기준 브랜치 `verify/149-pages-bb5d779`의 `bb5d779`와 변경본을 4466에서 비교했다. 인메모리 초기 DB, 합성 데이터, 주문 0건, 재생 정지, KIS 미연결이다. 아래 값은 문서 상단에서 요소 상단까지의 CSS px다. 클릭 수는 페이지 진입 뒤 버튼·링크 활성화 횟수다.

| 화면에서 찾은 결과 | 활성화 | PC 1440×900 전 → 후 | 모바일 390×844 전 → 후 |
|---|---:|---:|---:|
| 전체 설계의 화면 지도 | 0 | 1014 → 467 | 1288 → 567 |
| 화면별 상세의 첫 제목 | 1 | 867 → 484 | 953 → 636 |
| 시스템 구조의 첫 제목 | 1 | 850 → 467 | 873 → 567 |
| 주문 흐름의 첫 제목 | 1 | 850 → 467 | 873 → 567 |
| 개발 단계의 첫 단계 | 1 | 872 → 477 | 895 → 577 |
| 리서치·API의 첫 제목 | 1 | 850 → 467 | 873 → 567 |
| 전체 설계에서 주문·체결을 고르는 버튼 | 0 | 1190 → 624 | 1482 → 746 |
| 주문·체결 상세의 화면 열기 / 의견 링크 | 선택 1 | 851 / 없음 → 468 / 554 | 937 / 없음 → 621 / 707 |
| 주문 단계 4의 체결·취소 설명 | 직접 주소 0 | 1057 → 664 | 1164 → 753 |

선택 직후 실제 뷰포트에서 주문·체결 제목은 PC 53px, 모바일 48px에, 의견 링크는 각각 123px와 119px에 보였다. 두 크기 모두 지도에서 총 2번 눌러 GitHub #151 제목까지 열었다. 사용자 직접 수행 시간은 미측정이다.

| 예시 캡처 | 변경 전 | 변경 후 |
|---|---|---|
| PC | [시작](../verification/assets/185-design/before-pc-overview.png) · [선택 직후](../verification/assets/185-design/before-pc-selection.png) · [상세 상단](../verification/assets/185-design/before-pc-orders.png) | [시작](../verification/assets/185-design/after-pc-overview.png) · [선택 직후](../verification/assets/185-design/after-pc-selection.png) · [상세 상단](../verification/assets/185-design/after-pc-orders.png) |
| 모바일 | [시작](../verification/assets/185-design/before-mobile-overview.png) · [선택 직후](../verification/assets/185-design/before-mobile-selection.png) · [상세 상단](../verification/assets/185-design/before-mobile-orders.png) | [시작](../verification/assets/185-design/after-mobile-overview.png) · [선택 직후](../verification/assets/185-design/after-mobile-selection.png) · [상세 상단](../verification/assets/185-design/after-mobile-orders.png) |

## 결정과 검증 범위

- **개선·이동·제거.** 장식 배너를 제거하고, 대상·환경·검증 기준과 두 지도의 설명을 탐색 아래로 옮겼다. 1차 이슈·main 소스와 2차 화면별 의견을 구분했다. 매매 설정은 연결·설정 상세에서 별도 이슈 #152로 간다. 주소의 화면 ID가 비었거나 등록되지 않았으면 대상을 다시 고르게 한다. 주문 단계 설명에는 구독 중 통보·REST 대조, 같은 주문의 부분체결 직후 잔량 취소 미관측을 반영했다. [1차 실증 범위](../verification/2026-11-20-paper-acceptance.md)
- **유지와 이견.** 6개 주제·15개 화면·5개 주문 단계와 URL 기반 선택을 유지했다. Gemini는 모바일에 별도 선택기나 전체 목록 토글을 제안했다. 첫 주제에 전체 목록이 있고, 기존 가로 선택기는 Tab·Enter·Space로 조작할 수 있어 선택기를 중복 추가하지 않았다. 선택 번호/전체 개수와 전체 주제 2행을 노출했다. 페이지 이동 후 뒤로·새로고침에서 선택을 확인했고, 지난 주문 보기 → 화면 설계 → 브라우저 뒤로로 `/orders?view=history`가 복원됐다. [주문 화면 비교 근거](147-orders-ux.md)
- **데이터 경로.** Graphify에서 `App → Design`, `Design.tsx → src/specs.ts::screens / sources`를 찾았다. 원문에서 설계 내용은 번들에 포함되며 주제·단계·화면은 URL에 저장됨을 확인했다. 공통 상태만 `App.refresh → GET /api/state → Store`를 통해 읽는다. 단계별 프로젝트 지도 초안은 `public/project-map.html`의 노드별 localStorage에 저장된다. 설계 탐색·화면 왕복에서 변경 요청은 0건이었다. [설계 화면](../../src/pages/Design.tsx) · [페이지 명세](../../src/specs.ts)
- **의견 경로.** 실제 GitHub에서 15개 화면과 하위 매매 설정의 이슈 제목을 확인했다. 단계별 로컬 지도는 수정 초안을 저장한다. Archify 지도는 1차 캡처와 2차 검토·화면별 의견 이슈를 함께 보여준다. [PR #144](https://github.com/krdn/gon-stock03/pull/144)의 안내 HTML을 내려받으면 화면의 Ask → Copy question으로 화면 이름과 질문을 복사한다. 현재 4328 지도와 고정본 모두 두 크기에서 설계실 이름·예시 질문이 일치했다. 사용자가 직접 전달하는 단계는 검증에 포함하지 않았다.
- **환경과 한계.** 4466 격리 브라우저 검사에서 여섯 주제·화면별 매핑, 존재하지 않는 주소, 계좌 미연결·부분실패, 로컬 조회 503 후 재확인, 키보드·복원을 확인했다. 페이지 데이터는 고정 명세다. 사용자 직접 수용, 4303 반영과 실거래는 이번 검증 범위 밖이다. 빌드에는 기존 번들 크기 경고가 있다. [독립 브라우저 검사](../../tests/browser/185-design-ux.spec.ts)

## 독립 리뷰와 재현

Gemini 4 Neon High 설계 검토 뒤 구현을 별도로 검토했다. 중요 지적은 0건, 경미한 지적은 4건이었다. 새 탭 안내, 주문 단계 선택 그룹, 잘못된 화면 주소의 알림·재선택, 테스트 예시 응답과 링크 이름 일치를 보완했다. 같은 모델 수정분 검토에서 4건 해소·중요 0건을 받았다. 남은 중복 ‘새 탭’ 발화는 보이는 레이블만 유지하고 브라우저로 재검사했다. 3회 모두 CLI 초기화 모델은 `gemini-4-neon-high`, 응답은 SUCCESS였다. 서버 내부 모델·강도와 실제 보조기기 음성 출력은 미확인이다.

로컬 TypeScript/Vite 빌드, 4466 전용 Chromium 설계·지도 10건, Graphify 재생성을 마쳤다. 전후 캡처는 예시 환경에서 생성했다. [16개 카드 지도 고정본](https://github.com/krdn/gon-stock03/blob/fb66f1fbb9343ba8844ec1919e888592b8dd4df0/docs/architecture/figures/v1-guide.html)은 PR #144의 `fb66f1fb`다. 4466 설계실에서 GitHub 파일로 이동해 두 크기 모두 HTML을 내려받았다. SHA-256은 양쪽 모두 `bd13d59f2df28367bf370e3414fd94e8eb10e8ae3022ffc11c9c8b378af75b97`이며 4328 지도와 같다. [원격 검증·사용자 검토 상태](https://github.com/krdn/gon-stock03/issues/185)

기존 조사 원문과 1차 기록을 보존하고 #185 공식 자료 확인 후 `gon-workflow implementation-ready .`를 통과했다. 신규 구성 확인용 `ready .`의 기본 브랜치 일치 검사는 배정된 검증 브랜치에서 실패했다. #185에 지정한 원격 기준 SHA가 현재 부모와 일치하는 것을 별도로 확인했다.

#185의 조사 문서는 [매매일지 PR #184](https://github.com/krdn/gon-stock03/pull/184)의 44개 기록·확인 시각을 그대로 보존하고 #185를 마지막에 추가했다. #184의 배정 SHA `2383ef1`과 후속 head `6f012f2`의 조사 문서는 같다. [백테스트 PR #183](https://github.com/krdn/gon-stock03/pull/183) `e015cea`는 출처·저장 실험 선택과 같은 선택 재입력을, #184는 종목명 검색, 저장 시점 재확인과 초안 보존을 검증한 별도 초안이다. 해당 화면의 결합 검증과 사용자 수용 상태는 각 PR에서 확인한다.

[4466 설계실](http://127.0.0.1:4466/design)에서 ‘이 PC에서 검토 지도 열기’는 [4328 지도](http://127.0.0.1:4328/guide.html)를, ‘GitHub에서 검토 지도 파일 열기’는 고정된 GitHub 파일 페이지를 새 탭에 연다. 1440×900과 390×844에서 Tab·Enter로 두 목적지와 원래 설계실 탭을 확인했다. 모바일 두 링크는 각각 가로 35~207px, 35~240px에 있었고 문서 너비는 390px였다. [PC 안내](../verification/assets/185-design/guide-pc.png) · [모바일 안내](../verification/assets/185-design/guide-mobile.png)

두 크기에서 4328 지도와 내려받은 파일 모두 예시 주소 16개가 4486 통합 앱의 해당 화면으로, 의견 링크 16개가 각 화면 이슈로 연결됨을 대조했다. 4328의 설계실 카드에서 [통합 앱의 설계실](http://127.0.0.1:4486/design)을 실제로 열고 제목을 확인했다. 내려받은 HTML의 설계실 예시 링크를 직접 누르면 두 크기 모두 403이 표시돼 주소창에서 여는 방법을 함께 안내했다. 전체 결합본의 사용자 직접 수용과 4303 반영은 메인이 관리한다.
