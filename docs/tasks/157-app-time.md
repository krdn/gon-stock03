# #157 공통 상태의 시각 기준

[기준 이슈](https://github.com/krdn/gon-stock03/issues/157) · [상위 #149](https://github.com/krdn/gon-stock03/issues/149) · [공통 계약 #6](https://github.com/krdn/gon-stock03/issues/6) · [대시보드 후보 #156](https://github.com/krdn/gon-stock03/pull/156)

기준 main `04434fd`. 서버가 관측한 로컬 시각과 브라우저의 단조 경과 시간으로 공통 표시와 행동 직전 만료 시점을 일치시킨다. 읽을 원문은 `server/http.ts`의 GET /api/state, `shared/status.ts`의 freshness, `src/App.tsx`의 refresh/act와 `tests/browser/common-state.spec.ts`다.

4471 메모리 DB에서 PC 1440×900와 모바일 390×844, 초기 시차 0/±120초, 실행 중 시계 보정, 지연·반복·실패 응답과 서버 재시작을 비교한다. 일지 예시 POST는 브라우저가 가로챈다. 메인은 #156과의 결합 및 사용자 화면 확인을 담당한다.
