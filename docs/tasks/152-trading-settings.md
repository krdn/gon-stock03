# 매매 설정의 한도 저장과 다음 실행 검토

[작업 #152](https://github.com/krdn/gon-stock03/issues/152) · [상위 #149](https://github.com/krdn/gon-stock03/issues/149) · [선행 설정](122-trading-settings.md) · [정책](123-trading-policy.md) · [주문 비교 사례](147-orders-ux.md)

기준 main 04434fd에서 PC 1440×900·모바일 390×844로 목차, 주문 한도 저장·복귀, 한정·전략의 대상/한도/검토와 고정 후 실행 대기를 비교한다. 4453의 격리 원장과 예시 응답을 사용한다. 사용자 수용은 대기 중이다.

## 화면과 판정

일반 한도는 저장 즉시 일반 주문에 반영한다. 한정·전략은 탭 입력 → 서버 초안 → 다음 실행용 고정 파일 순이다. 고정 시 주문이나 전략을 시작하지 않는다. 목차는 저장된 초안·고정본을 검토 단계에서 열고, 고정 후 적용 방법은 완료 상태 아래에서 펼친다. 전용 원장에서는 현재 조건 조회와 복사만 제공한다.

| 관측 | 결정 |
|---|---|
| 수량을 저장한 뒤 금액 입력 3개를 지나야 주문으로 복귀했다. | 수량 저장 결과 바로 다음에 주문 복귀 링크를 배치했다. 일반 위험 한도의 별도 저장을 유지했다. |
| 한도 단계에서 기본 수량·금액 아래에 시간·응답 설정이 길게 이어졌다. | 가격·시간·응답 정책을 상세로 옮겼다. 고정 단가를 바꾸는 경우 펼치기 1회가 추가된다. |
| 검토 표는 이전 고정본이 없어도 ‘없음’을 행마다 표시했다. 고정 여부와 결과가 표 하단에 있었다. | 최초 설정에서 이전 열을 제거했다. 상태·적용 상한·대상·주문 조건을 먼저 표시한다. 이전본과 다르거나 기본 정책을 바꾼 항목은 항상 펼쳐 표시한다. |
| 검토 후 고정 응답을 잃거나 이전 전략 revision을 열 수 있다. | 원장 재조회 중에는 고정을 잠근다. 확인된 고정본만 실행 대기로 표시한다. revision이 바뀌면 사용자가 대상 단계에서 현재 revision을 선택한 뒤 다시 저장한다. |

Gemini 관측 리뷰에서 복귀 링크 위치, 저장·고정·실행 구분, 키보드 포커스와 빈 비교 열 개선을 채택했다. 가격×수량×횟수를 예상 주문금액으로 제시하자는 의견은 반영하지 않았다. 시장가 평가 단가, 주문당 금액 및 전략 누적액이 각각 집행되므로 화면에는 계약상 상한을 표시한다. 조건 변경이 많은 비교에서는 원문 확인을 우선해 고정 버튼이 화면 아래로 내려갈 수 있다.

## 같은 입력으로 측정한 위치

Chromium CSS px, 페이지 상단부터 요소 윗변까지. PC는 1440×900, 모바일은 390×844. 주문 복귀는 069500 매도, 4주, 72,500원에서 수량 한도 5→8을 저장했다. 한정 계약은 069500 매도 2주, 고정 단가 72,500원, 전략은 예시 revision 3을 사용했다. 검토·고정은 모두 합성 응답이다. 2단계 저장 위치는 브라우저 뒤→앞→새로고침을 거친 상태에서 측정했다.

| 위치 | PC 전 → 후 | 모바일 전 → 후 |
|---|---:|---:|
| 목차 첫 링크 | 195 → 195 | 166 → 166 |
| 저장된 수량 / 주문 복귀 | 379 → 379 / 886 → 443 | 344 → 344 / 882 → 403 |
| 한정 대상 → 한도 버튼 | 744 → 709 | 731 → 699 |
| 한정 초안 저장 / 고정 | 1,571 → 745 / 1,581 → 849 | 1,738 → 819 / 1,600 → 858 |
| 한정 고정 결과 | 1,567 → 295 | 1,586 → 261 |
| 전략 대상 → 한도 버튼 | 702 → 667 | 665 → 633 |
| 전략 초안 저장 / 고정 | 1,295 → 751 / 1,385 → 859 | 1,353 → 764 / 1,372 → 868 |
| 전략 고정 결과 | 1,371 → 295 | 1,358 → 261 |

수량 변경 링크 → 저장 → 복귀는 3번이다. 각 계약은 목차 → 한도 → 검토 → 고정의 버튼·링크 4번이며, 값 입력과 이력 검증은 별도로 수행했다. 각 뷰포트에서 수량 저장 1회, 초안 저장 2회, 고정 2회였다. 모바일 고정 버튼은 이번 두 fixture 모두 첫 화면 아래에 있다. 사용자의 소요 시간은 미측정이다.

| 화면 | PC 전 / 후 | 모바일 전 / 후 |
|---|---|---|
| 목차 | [전](../verification/assets/152-trading-settings/before-desktop-menu.png) / [후](../verification/assets/152-trading-settings/after-desktop-menu.png) | [전](../verification/assets/152-trading-settings/before-mobile-menu.png) / [후](../verification/assets/152-trading-settings/after-mobile-menu.png) |
| 일반 저장·복귀 | [전](../verification/assets/152-trading-settings/before-desktop-general.png) / [후](../verification/assets/152-trading-settings/after-desktop-general.png) | [전](../verification/assets/152-trading-settings/before-mobile-general.png) / [후](../verification/assets/152-trading-settings/after-mobile-general.png) |
| 한정 한도 | [전](../verification/assets/152-trading-settings/before-desktop-once-limits.png) / [후](../verification/assets/152-trading-settings/after-desktop-once-limits.png) | [전](../verification/assets/152-trading-settings/before-mobile-once-limits.png) / [후](../verification/assets/152-trading-settings/after-mobile-once-limits.png) |
| 한정 검토 | [전](../verification/assets/152-trading-settings/before-desktop-once-review.png) / [후](../verification/assets/152-trading-settings/after-desktop-once-review.png) | [전](../verification/assets/152-trading-settings/before-mobile-once-review.png) / [후](../verification/assets/152-trading-settings/after-mobile-once-review.png) |
| 전략 한도 | [전](../verification/assets/152-trading-settings/before-desktop-strategy-limits.png) / [후](../verification/assets/152-trading-settings/after-desktop-strategy-limits.png) | [전](../verification/assets/152-trading-settings/before-mobile-strategy-limits.png) / [후](../verification/assets/152-trading-settings/after-mobile-strategy-limits.png) |
| 전략 검토 | [전](../verification/assets/152-trading-settings/before-desktop-strategy-review.png) / [후](../verification/assets/152-trading-settings/after-desktop-strategy-review.png) | [전](../verification/assets/152-trading-settings/before-mobile-strategy-review.png) / [후](../verification/assets/152-trading-settings/after-mobile-strategy-review.png) |

## 데이터와 검증

Graphify에서 App → TradingSettings → Editor / 수량·위험 폼을 찾았다. HTTP 경계의 직접 경로는 그래프에서 나오지 않아 원문을 대조했다. [화면](../../src/pages/TradingSettings.tsx)에서 설정 GET, 일반 수량·위험 POST, draft/fix를 사용한다. [HTTP 분기](../../server/http.ts)와 [저장·고정](../../server/trading-plans.ts)은 [SQLite 트랜잭션](../../server/store.ts)의 예상 초안 ID 검사, 고정 파일 발행과 연결된다. 초안은 탭 sessionStorage와 서버 저장본의 역할이 다르다.

- 전후 두 뷰포트에서 active 한정 원장의 읽기 전용 안내는 PC 263px·모바일 225px, 설정 조회 오류의 재조회 버튼은 195px·166px, 로컬 부분 응답의 긴급정지 미확인 안내는 267px·255px였다. 복사·오류 복구·부분 상태 확인 중 쓰기 0회였다.
- 일반 저장·새로고침·명시 복귀, 한정과 전략 편집 중 뒤·앞·새로고침, 키보드 고정·완료 포커스, 빈 전략, revision 변경, 고정 응답 유실 후 원장 재확인을 검증했다. 별도 SQLite·가짜 전송기 통합에서는 두 종류 고정 파일을 다시 읽어 내용 일치·전략 정지·브로커 호출 0회를 확인했다. 다음 서버의 실계좌 기동과 사용자 직접 수용은 미검증이다.
- 별도 발견 사항. 수량 저장 후 **브라우저 뒤로 → 앞으로 → 명시 복귀**까지 하면 주문 수량 4주가 1주, 가격 72,500원이 빈 값이 됐다. 첫 복귀 때 Paper가 보관하던 입력을 지우는 경로다. [주문 입력 복구 #154](https://github.com/krdn/gon-stock03/issues/154)에서 Paper 담당자가 수정·교차 검증한다.
- [격리 미리보기](http://127.0.0.1:4453/settings/trading)에는 일반 디스크 예시 원장의 미고정 초안 2개와 정지된 예시 전략 1개를 남겼다. KIS 인증 미설정이며 실제 원장 데이터는 사용하지 않았다. 이 브랜치의 기술 검증과 사용자 화면 수용은 별도 기록이다.

**리뷰와 회귀.** 지정 모델 요청은 모두 `gemini-4-neon-high`였고 CLI 초기화 모델을 대조했다. 최초 구현 검토는 FAIL(P1 두 묶음, P2 세 묶음)이었다. 끝 슬래시에서 대상 제목이 사라지는 문제를 재현한 후 URL을 정규화했다. 로컬 상태가 미확인일 때 빈 전략·기본 한도를 확정값처럼 보이지 않게 했고, 응답 유실 재조회와 충돌, 파일 보기·시각 입력·매도 시 보유 허용 표시를 수정했다. 코드에 이미 있는 경로 줄바꿈은 가로폭을 실측해 유지했다.

같은 Gemini의 수정분 판정은 **PASS**였다. 남은 비차단 시각 비교(P2)는 파싱한 시작·종료 시각을 비교하도록 반영했다. 빈 시작 시각과 역순 기간은 대상 단계에서 멈춘다. 관측·구현·수정분 세 호출 모두 SUCCESS와 CLI 초기화 모델 일치를 확인했고 제공자 내부 모델·추론 강도는 독립 확인할 수 없었다.

전용 Chromium에서 설정 10건과 공통 위험 한도 회귀 3건, 포트가 필요 없는 계약·원장 단위 검사 6건, TypeScript와 프로덕션 빌드를 확인했다. 최초 격리 서버 종료로 연결 거부 3건이 발생해 전용 사용자 서비스로 다시 띄웠다. 오류 테스트의 최초 앱 연결 경합은 연결 후 진입하도록 수정했다. 실제 환경 주문·전략 실행과 사용자 수용은 이 검증에 포함하지 않았다.
