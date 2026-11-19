# KIS 연결·설정 화면

[이슈 #113](https://github.com/krdn/gon-stock03/issues/113) · 브랜치 `krdn/improve-settings-ux`. 기존 [연결 복구 계약](71-settings-recovery.md)을 유지한다. 관련 구현은 `src/pages/Operations.tsx`의 Settings와 `tests/browser/settings.spec.ts`다.

4303에서 필수 값이 누락돼도 잔고 확인 버튼이 활성화됐고, 상단에 합성 데이터라고 표시됐다. 390×844 화면에서 사용자는 연결 방법을 열기 위해 페이지 상단에서 1,895px까지 내려가야 했다. 설정 누락·형식 오류를 버튼 바로 위에 표시하고, 안내 열기와 로컬 상태 갱신을 제공한다. 모의 잔고 확인은 설정 오류가 해소되면 활성화된다. 일반 진단과 서버 상세는 버튼 아래에 둔다.

## 4303 실측

장중 검증 작업 폴더의 프런트엔드 4개 파일에 승인된 변경을 적용했다. 기존 4303·4304 프로세스가 계속 실행되는 상태에서 Chromium으로 새로 접속했다. 당시 서버는 필수 값 미주입 상태였다. 좌표 단위는 문서 상단 기준 CSS px다.

| 창 크기 | 연결 안내 버튼 수정 전 → 후 | 잔고 확인 버튼 수정 전 → 후 |
| --- | --- | --- |
| 1440×900 | 526 → 432 | 1275 → 432 |
| 390×844 | 1895 → 424 | 1551 → 476 |
| 320×740 | 1951 → 461 | 1606 → 513 |

세 크기 모두 Enter로 안내를 열고 Space로 닫았다. 가로 넘침과 JS 예외는 0건이었다. 로컬 상태 새로고침 결과를 확인했고 각 세션의 API 요청은 `GET /api/state` 3회였다. axe 자동검사는 각 크기에서 안내를 열고 닫은 6개 상태 모두 위반 0건, 미완료 0건이었다. [모바일 수정 전](../verification/assets/settings-ux/mobile-before.png) · [수정 후](../verification/assets/settings-ux/mobile-after.png)

## 회귀와 리뷰

- 타입 검사와 Vite 빌드 성공. 단위 234개와 메모리 DB를 사용하는 Playwright 전체 157개 통과.
- 격리 환경에서 형식 오류 복구, 인증 대기·타임아웃, 조회 성공·실패와 이전 잔고 표시를 확인했다. 실제 KIS 인증·잔고 조회와 주문은 실행하지 않았다.
- Argon 독립 리뷰에서 P1~P3 지적 0건. 요청과 init 모델은 `gemini-4-argon-high`, 요청 effort는 high였다. 제공자 내부 모델과 effort의 별도 확인값은 없다.
- PR의 application/configuration 검사와 병합 상태는 이슈의 PR 링크에서 확인한다.
