# 데이터 상태에서 저장된 출처 확인

[배정 이슈 #173](https://github.com/krdn/gon-stock03/issues/173) · [전체 진행 #149](https://github.com/krdn/gon-stock03/issues/149) · [1차 기록 #15](15-data-status.md) · [주문 UX 비교](147-orders-ux.md). 기준 main은 `04434fdbd44b3eb7cc169e651fdd537086f7e568`이다.

[데이터 상태 예시](http://127.0.0.1:4462/data)에서 거래소별 마지막 성공 시각을 확인하고, ‘KIS 일봉’으로 이동해 저장 범위와 미수집 구간을 비교할 수 있다. [달력 불일치 기록](http://127.0.0.1:4462/data?run=96b3f123-f72e-4d77-9091-72a057ce26e4#inventory-daily)에서 ‘품질 상세 펼치기’를 누르면 2026-01-06의 누락을 확인한다. [합성 인벤토리](http://127.0.0.1:4462/data#inventory-demo)에서는 종목별 봉 수와 데이터 출처를 확인한다.

## 같은 예시로 수행한 전후 비교

Chromium에서 서버의 동일한 SQLite 예시를 읽었다. 두 거래소에 각 1종목과 교체 실패 후 보존된 마지막 성공이 있다. 005930 수정주가 기록 3건은 일부 수집, 달력 대조 통과, 달력 불일치로 구성했다. 각 기록에 저장 거래일이 2개 있다. 합성 종목은 8개, 각 120봉이며 추가 재생은 0회다. 출발 시각·계좌 상태를 포함해 캡처의 데이터는 격리 예시다.

| 사용자가 찾는 정보·행동 | PC 1440×900 전 → 후 | 모바일 390×844 전 → 후 |
|---|---:|---:|
| 마스터 첫 마지막 성공 시각, 문서 상단 기준 | 714 → 567px | 852 → 626px |
| 저장 상태 새로고침 버튼 | 548 → 384px | 694 → 447px |
| 마스터에서 시장으로 가는 링크 | 640 → 736px | 781 → 795px |
| 일봉 선택 / 일부 수집 결과 | 1,067 / 1,154 → 555 / 643px | 1,288 / 1,375 → 956 / 1,044px |
| 달력 불일치 기록에서 품질 상세 / 펼친 누락일 | 1,576 / 1,600 → 801 / 855px | 2,137 / 2,161 → 1,202 / 1,273px |
| 합성 인벤토리 제목 | 1,820 → 866px | 2,395 → 1,539px |
| 합성 인벤토리에서 백테스트 DEMO 출처까지 | 2 → 2회 | 3 → 2회 |

스크롤과 포커스 이동을 제외한 선택·실행 횟수다. 두 버전에서 마스터의 성공 시각은 추가 조작 0회, 시장 목록 도착은 1회다. 누락일 확인에는 해당 기록 선택과 품질 펼침이 각각 1회 필요하다. 변경 후 모바일의 KIS 일봉 바로가기는 y=450px에서 시작하고 한 번 누르면 일부 수집 결과가 뷰포트 y=194px에 보인다. PC에서는 y=386px의 바로가기로 결과가 뷰포트 y=199px에 보인다. 양쪽 화면의 가로 넘침은 0px였다. 체감 시간은 미측정이다.

[전 수치](../verification/assets/173-data/before.json) · [후 수치](../verification/assets/173-data/after.json) · 첫 화면 [PC 전](../verification/assets/173-data/before-desktop.png) / [후](../verification/assets/173-data/after-desktop.png), [모바일 전](../verification/assets/173-data/before-mobile.png) / [후](../verification/assets/173-data/after-mobile.png) · 품질 상세 [PC 전](../verification/assets/173-data/before-desktop-quality.png) / [후](../verification/assets/173-data/after-desktop-quality.png), [모바일 전](../verification/assets/173-data/before-mobile-quality.png) / [후](../verification/assets/173-data/after-mobile-quality.png).

## 판단과 경로

- **유지.** 마스터의 마지막 성공과 최근 시도, 읽기 실패 시 이전 저장분, 서로 다른 수집 ID의 상세 응답 검증을 보존했다. 거래소 상태가 한쪽만 있으면 다른 쪽을 미확인으로 표시한다. KST 표기와 원본 UTC 시각의 대응을 검사했다.
- **개선.** 저장 정보 앞에 있던 실시간 블록을 아래로 옮기고 자료별 바로가기를 두었다. 일봉을 선택하면 주소의 `run`이 바뀌어 새로고침·뒤로가기로 복원된다. 누락된 ID는 설명과 ‘최근 기록 보기’를 제공한다. 로컬 상태 수신 전에는 합성 봉 수를 미확인으로 표시한다.
- **상세로 이동.** 수집 ID·시도 시각·날짜 목록은 전용 펼침에서 확인한다. ID 전체를 목록에 반복하는 대신 종목·정책·요청 기간·기록 번호를 표시한다. 시장 링크는 마스터의 성공과 오류를 먼저 읽은 뒤에 나온다.
- **제거.** 달력 대조 전의 ‘누락 0일’을 제거했다. 달력이 없으면 평일 누락 후보만 표시하고, 대조가 끝난 자료는 입력 달력상 누락과 예상 밖 거래일을 각각 표시한다.
- **출처 전달.** 공개 마스터는 `/market`, 합성 출처는 `/backtest?source=demo`, 저장 일봉은 `/backtest?source=stored&run=<수집 ID>`로 연결한다. 데이터 후보 단독에서 시장의 공식 예시 종목 2개와 백테스트 출처 선택을 직접 확인했다. 현재 백테스트는 두 화면 크기 모두 저장 일봉으로 열려 DEMO를 한 번 더 선택했다. 달력 불일치 ID를 전달했을 때 목적지에서 첫 번째 부분 수집 기록이 선택됐고 뒤로가면 원래 불일치 ID가 복원됐다. [목적지 실측](../verification/assets/173-data/preview.json) 백테스트의 파라미터 자동 선택은 별도 담당이며 두 후보의 결합 검증이 남았다. [합의 기록](https://github.com/krdn/gon-stock03/issues/173#issuecomment-7038449861)
- **Graphify와 원문.** `src/pages/DataInventory.tsx::DataStatus → DailyDetail` 호출과 `server/http.ts → server/store.ts` import를 조회했다. 원문에서 GET `/api/data/master`가 `market_master/market_instruments`, GET `/api/data/daily[/id]`가 `daily_runs/daily_bars`, 합성 자료가 `useWorkbench → GET /api/state → workspace`를 읽음을 확인했다. 저장 상태 새로고침은 마스터 갱신·일봉 수집 API를 호출하지 않는다.

## 검증과 한계

- 페이지 검사 12건과 실시간 회귀 1건이 통과했다. 새로고침, URL 및 브라우저 앞뒤 이동, 키보드 선택·펼침·초점, 잘못된 ID 복구, 오래된 상세 응답, 비어 있는 저장소·오류·부분·미확인, 출처 이동을 검사했다. 브라우저 테스트는 전용 4462에 붙였고 프로덕션 빌드로 화면을 확인했다. Vite의 기존 500kB 청크 경고가 있다. 같은 미리보기에서 브라우저의 GET 응답만 바꿔 [503과 보존된 저장분](../verification/assets/173-data/after-mobile-error.png), [빈 일봉·미확인 DEMO](../verification/assets/173-data/after-mobile-empty.png)를 확인했다.
- Gemini 4 Neon High 사전 검토는 미검증 0일과 선택 복원 문제를 지적했다. 상세의 핵심 건수와 마지막 성공은 보존하고 긴 근거를 접는 제안을 채택했다. 고정 높이 요약과 ID 복사 버튼은 추가하지 않았다. 예시 목록에서 수집을 선택하고 원문 ID를 확인하는 데 기본 select와 펼침으로 충분했다. 스트림 최종 응답은 SUCCESS, CLI 초기화 모델은 `gemini-4-neon-high`였고 외부 실행 세션 종료코드는 143이었다. 서버 내부 모델·강도는 미확인이다.
- 같은 지정 모델의 구현 검토는 수정 필요(P2 두 건, P3 한 건)로 반환됐다. 느린 일봉 응답 후 모바일 합성 섹션이 y=268px에서 693px로 밀리는 현상을 재현했다. 최종 상세 응답까지 기다려 다시 맞추자 y=268px을 유지했다. Enter 뒤 구역 포커스는 Chromium에서 원래도 이동했지만, 링크에 포커스가 남는 경우까지 수용하고 Tab 시작점을 검사했다. 첫 조회 실패·로딩과 이전 자료가 있는 재조회의 문구도 분리했다. 선택 목록의 기록 번호를 앞에 두어 모바일에서도 구별할 수 있다. 수정분 지정 모델 재검토와 최종 CI는 [이슈에서 확인한다](https://github.com/krdn/gon-stock03/issues/173).
- 공유 화면·운영 4303 적용, 실제 KIS 조회·거래, 사용자 직접 수용은 이번 검증 범위 밖이다. 미리보기는 전용 임시 SQLite, 무인증 환경 및 서버 외부 fetch 차단으로 실행 중이다.
