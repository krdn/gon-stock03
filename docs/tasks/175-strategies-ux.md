# 전략 스튜디오의 규칙 저장과 평가 사유

[작업 #175](https://github.com/krdn/gon-stock03/issues/175) · [전체 #149](https://github.com/krdn/gon-stock03/issues/149) · [선행 #22](22-strategies.md) · [주문 UX 비교](147-orders-ux.md)

기준 main `04434fd`, 브랜치 `krdn/ux2-175-strategies`. [검토 화면](http://127.0.0.1:4461/strategies?environment=kis-paper#strategy-evaluations)에서 ‘예시 · 이동평균 교차’의 최근 차단 사유를 읽고 ‘해당 전략 보기’로 이력과 계약을 확인할 수 있다. [규칙 작성](http://127.0.0.1:4461/strategies?environment=kis-paper#strategy-editor) · [DEMO 화면](http://127.0.0.1:4461/strategies?environment=demo)

## 같은 과업의 변경 전후

매 검사마다 새 전용 SQLite에 [예시 전략 2개](../verification/assets/175-strategies/fixture.json)를 넣었다. 첫 KIS 전략에는 평가가 없고 두 번째에는 최근 차단과 앞선 관망이 있다. [대시보드 #150](https://github.com/krdn/gon-stock03/issues/150)이 전달하는 `/strategies?environment=kis-paper`로 진입했다. 위치는 문서 상단부터 요소 시작까지의 CSS px다.

| 행동 | PC 1440×900 전 → 후 | 모바일 390×844 전 → 후 |
| --- | --- | --- |
| 최근 차단 사유 읽기 | 1,598 → 521px · PageDown 1 → 0회 | 1,741 → 580px · PageDown 2 → 0회 |
| 이름 입력 시작 | 653 → 569px · 첫 화면에서 가능 | 2,282 → 1,679px · PageDown 3회 → 바로가기 1회 |
| 전략 저장 버튼 | 1,052 → 840px | 2,682 → 1,950px |
| 저장 후 다음 계약 준비 | 화면 밖 → 화면 안 | 화면 밖 → 화면 안 |

[PC 전](../verification/assets/175-strategies/before-desktop.png) · [PC 후](../verification/assets/175-strategies/after-desktop.png) · [모바일 전](../verification/assets/175-strategies/before-mobile.png) · [모바일 후](../verification/assets/175-strategies/after-mobile.png) · [이전 모바일 차단 사유](../verification/assets/175-strategies/before-mobile-reason.png) · [저장 후 모바일](../verification/assets/175-strategies/after-mobile-saved.png)

두 화면 크기와 양 버전에서 이름·단기·장기 3개 필드를 편집하고 3/8 교차, 1주, revision 1을 저장했다. 다음 계약 준비 → 대상·기간의 시작/종료 입력 → 한도·조건 → 초안 저장 및 검토까지 수행했다. POST는 전략 저장과 계약 초안 저장 두 건이었다. 변경 후 서버가 반환한 ID의 제목에 초점이 가고 이어서 계약 링크를 누를 수 있다. 환경 전환 후 새로고침하면 이전 버전은 KIS로 돌아갔고 변경 후 DEMO를 유지했다. 사용자 체감 시간은 미측정이다.

## 결정과 근거

| 판단 | 반영 내용 |
| --- | --- |
| 유지 | 전략을 저장하면 새로운 ID와 revision 1로 정지 상태가 된다. DEMO 봉 재생, KIS 명시적 시작·정지, 서버 계약과 위험 검사를 유지했다. |
| 개선 | URL에서 환경을 읽고 선택을 브라우저 이력에 남긴다. 최근 KIS 평가는 환경 내 각 전략의 가장 최근 기록을 시각순으로 비교해 한 건을 보여준다. KST 시각·전략명·평가 당시 revision·신호·결과·원인을 함께 표시한다. |
| 상세로 이동 | 전략별 최근 최대 100건, 이벤트·주문 식별자, 실행 규칙을 필요할 때 연다. 접수·체결 미확정, 응답 불명, 차단은 각자 다른 상태다. |
| 제거 | 모든 이력을 기본으로 펼치던 동작과 장문의 중복 안내를 없앴다. 저장 전에 잘못된 교차 기간을 입력 위치에서 바로잡을 수 있다. |

Graphify의 `Strategies → useWorkbench`, `StrategyStudio → StrategyCard`, `server/http.ts → server/store.ts` 경로를 원문과 대조했다. 브라우저의 [조회와 변경](../../src/App.tsx)은 GET /api/state 및 POST /api/strategies를 사용한다. [저장 핸들러](../../server/http.ts)는 검증 후 ID와 revision을 반환하고 [SQLite 트랜잭션](../../server/store.ts)이 workspace 본문을 갱신한다. [실시간 평가](../../server/realtime.ts)는 새 이벤트를 전략별 배열 맨 앞에 넣는다. 조회 실패·계좌 부분 실패·로컬 저장된 과거 평가를 분리해 표시한다.

Gemini 4 Neon High 관측 리뷰에서 환경 URL, 새 revision 생성 문구, 저장 후 초점, 기본 이력 접기를 수용했다. 최근 평가 원인은 배정 과업과 양쪽 화면 실측을 근거로 첫 화면에 올렸다. 공통 헤더는 로컬 상태와 KIS 계좌 상태를 함께 보여주는 영역이라 선택한 전략 환경으로 덮어쓰자는 제안은 채택하지 않았다.

구현 리뷰의 첫 판정은 수정 필요(P2 3건·P3 3건)였다. DEMO 긴급정지 이유를 조작 옆에 표시하고, 이전 0건·조회 실패를 로딩과 구분했다. 종목 누락·빈 기간 입력·오류의 접근성 설명·이전 이력 표기도 수정했다. 미래 시각 허용 제안은 서버의 음수 age 거부 규칙을 확인해 기각했다. 서버 관측보다 1ms 미래인 예시에서 시작 차단, 1초 전의 유효 시세에서 시작 가능을 브라우저로 확인했다. 인스턴스 교체 때에는 공용 Routes가 새로 마운트되어 현재 URL의 제목을 다시 찾는다. 모든 리뷰는 격리 임시 경로에서 실행했다. CLI 초기화 모델은 `gemini-4-neon-high`였고 서버 내부 모델·effort는 별도 미확인이다. 같은 모델의 수정분 재검토에서 브라우저 조회 실패를 서버 차단으로 오인할 수 있는 문구와 로딩·이전 0건 표시가 남았다. 실행·정지 여부를 미확인으로 명시하고 조회 단계별 표시를 바로잡아 Chromium으로 재검증했다. 최종 CI는 [이슈 #175](https://github.com/krdn/gon-stock03/issues/175)에 기록한다.

## 검증 범위

전용 포트 4461에서 빈 환경과 새 fixture DB로 기존 server/index.ts 및 프로덕션 빌드를 사용했다. 단위/API·실시간 검사 47건, 전략·매매 설정·DEMO 연동 Chromium 검사 11건이 통과했다. 기간 오류·저장 500에서 초안 유지, 정상 빈 결과, 최초 조회 실패, 미확인·이전 기록, 계좌 부분 실패, Enter/Space, 직접 앵커·새로고침·뒤로가기·계약 복귀를 확인했다. 테스트 DB를 재사용한 단건 재검사는 동명 전략이 남아 실패했고, 새 예시 DB에서 재실행했다. 4461의 검토용 데이터에는 정지 DEMO 전략 1개와 정지 KIS 예시 2개만 있으며, KIS 인증·재생·실행 계약이 없다.

기준 main의 매매 설정에서 A 계약의 기간을 편집한 뒤 저장하지 않고 돌아가 B의 계약으로 이동하면 주소는 B여도 선택값은 A로 복원됐다. 두 요청 간 POST는 0건이었다. [매매 설정 PR #160](https://github.com/krdn/gon-stock03/pull/160)에 전략별 초안 키가 포함돼 있다. 해당 PR의 UI와 이 작업의 UI를 임시 결합해 같은 4461 동선을 반복했더니 B를 선택했고 POST는 0건이었다. 사용자 직접 수용·장중 동작·main 통합은 별도다.
