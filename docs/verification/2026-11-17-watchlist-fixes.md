# 관심종목 실접속 후속 수정

4303에 직접 접속해 세 문제를 재현하고 수정했다. [#20 범위](https://github.com/krdn/gon-stock03/issues/20#issuecomment-6948261375), [대비 보정 추가](https://github.com/krdn/gon-stock03/issues/20#issuecomment-6948330888).

| 문제 | 수정·검증 |
|---|---|
| 최초 상태 조회 실패인데 예시 4종목을 저장 목록으로 표시하고 실제 시세를 붙임 | 서버 스냅샷 확인 전 목록·개수·시세 호출을 보류. 최초 로딩/실패, 확인된 빈 목록, 단절 후 마지막 목록을 구분 |
| 열린 종목의 보기 재클릭 시 초점 이동 없음 | 같은 종목도 상세에 초점·스크롤 이동. 닫기 시 마지막 누른 버튼으로 복귀 |
| 주문 화면 링크 4개 대비 부족 | 해당 표 링크만 기존 강조색 적용. 데스크톱 axe 위반0·판정유보0 |

- 수정 전 회귀: 최초 실패 표시 및 PC/모바일 상세 재선택 3실패, 기존 목록 보존1통과.
- 최종 검사: `npm test` 216통과, `npm run build` 성공, `npx playwright test tests/browser/market.spec.ts` 17통과. 기존 500kB 번들 경고 유지. 설치 전 타입 정의 누락 실패는 `npm ci` 후 해소.
- 4303 실접속: 기존 저장4종목 및 KIS 현재가, 클라이언트에서 /api/state 차단 시 미확인·행0, 차단 해제 후 복원, 1440/390 폭 상세 재선택과 닫기 복귀 확인. 모바일 문서 폭390, 가로 넘침 없음. 저장 실패·빈 목록·저장 동작은 격리된 브라우저 API fixture 검증이다.
- 모바일 axe 위반0, 화면 밖 표 요소 대비 판정유보1개 규칙. 실기기 터치·장중 거래·주문·취소·전략 실행은 검증하지 않았다.
- 외부 리뷰: 중앙 설정과 실제 반환 `claude-opus-5-5`, effort high. 핵심 코드 수정의 결함 없음. 타이머 설치를 goto 이전으로 옮기라는 테스트 지적과 로딩 본문의 재시도 안내 중복을 반영했다. `/market`의 최초 미확인 별 버튼 문구와 공통 재시도 진행 표시는 범위 밖 후속 개선으로 남긴다.
- Graphify 코드 그래프 갱신 성공. 문서 의미 분석 증거는 아니다.
- 실행 적용: 원본 체크아웃 `/home/gon/llm-projects/gon-stock03`의 변경 전 파일이 기준25892e5와 동일함을 검사하고 `src/pages/MarketExplorer.tsx`, `src/styles.css` 두 파일만 반영했다. Vite HMR 적용을 확인했다. 원본 두 파일은 로컬 수정 상태이며 본 작업 브랜치와 내용이 같다. 원래 파일은 `/tmp/watchlist-original-MarketExplorer.tsx`, `/tmp/watchlist-original-styles.css`에 보존했다. DB·프로세스·계정 설정 변경 없음.

[데스크톱](assets/watchlist-fixes-2026-11-17/desktop.png) · [모바일](assets/watchlist-fixes-2026-11-17/mobile.png) · [최초 연결 실패](assets/watchlist-fixes-2026-11-17/offline.png)

구현 근거: [React 동일 상태 갱신](https://react.dev/reference/react/useState), [DOM ref 초점·스크롤](https://react.dev/learn/manipulating-the-dom-with-refs). 동일 selected 값은 effect를 재실행하지 않으므로 반복 클릭은 기존 DOM을 직접 가리킨다.

수정분 외부 확인도 같은 반환 모델에서 확정 결함 없음. 수정분 확인은 요약 서술 기반이라는 한계를 남긴다. 실제 변경·17개 재검증과 별도 대조했고, 링크 대비는 흰색/hover 배경 모두 4.5:1 이상이다. 해당 선택자는 관심종목 주문 링크에만 적용되며 별도 hover/visited 색상 규칙은 없다.
