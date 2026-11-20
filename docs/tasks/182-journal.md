# 매매일지에서 기록을 작성하고 다시 찾기

[작업 #182](https://github.com/krdn/gon-stock03/issues/182) · [전체 #149](https://github.com/krdn/gon-stock03/issues/149) · [1차 매매일지](23-journal.md) · [편집 중 초안 회귀](130-product.md) · [주문 UX 비교](147-orders-ux.md)

## 비교 조건과 범위

기준은 `krdn/ux2-179-alerts@23bab52`이며 main `04434fd` 이후 같은 파일에서 수정된 위험관리·알림을 보존한다. `Journal`, 페이지 전용 CSS, 일지 검사와 증거를 담당한다. 4465 격리 서버에서 Chromium PC 1440×900과 모바일 390×844에 같은 빈 목록과 같은 종목·본문을 입력한다. 저장 → 검색 → 새로고침, 최초 빈 목록과 검색 0건, 실패와 저장 대기 중의 편집, URL·뒤로가기·키보드를 확인한다.

- 기준 버전에서 종목 선택 → 본문 입력 → Enter 저장 → 검색어 입력 → 새로고침까지 5행동, 메모 POST 1회였다. 새로고침 후 두 화면 모두 본문 검색어가 사라졌다. 서버 오류 응답 뒤에는 작성 중 메모가 남았다. [좌표와 입력 조건](../verification/assets/182-journal/before.json)
- 모바일 최초 빈 목록의 종목은 문서 상단 830px, 본문은 915px, 저장은 1,172px에 시작했다. 저장 결과 첫 행은 517px였다. PC는 본문 560px, 저장 818px, 첫 행 462px였다. [모바일 최초](../verification/assets/182-journal/before-mobile-empty.png) · [PC 최초](../verification/assets/182-journal/before-desktop-empty.png)
- Graphify의 `Journal → useWorkbench`는 추출 관계이며 `makeServer → Store.update`는 추론 관계다. 원문에서 App의 GET /api/state, act의 POST /api/journal, journalInput·종목·2,000건 검증, 최신순 삽입과 SQLite workspace 트랜잭션을 대조했다. [화면](../../src/pages/Operations.tsx) · [App](../../src/App.tsx) · [HTTP](../../server/http.ts) · [저장소](../../server/store.ts)

페이지 안에서 최초 작성 위치를 높이고, 저장한 종목을 이름·코드·본문으로 다시 찾을 수 있게 한다. 브라우저 주소에 자유 입력을 싣지 않고 검색 복원을 검증한다. 실제 저장 기능과 실패·대기 중 초안 보호는 기존 회귀와 함께 확인한다. 기준 실측을 지정 모델로 검토한 후 결정과 이견을 기록한다.
