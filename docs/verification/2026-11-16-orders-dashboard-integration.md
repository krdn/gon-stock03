# PR58·59 결합 검증

최신 main `bf158cc` 위에 PR58 `38e6e40`, PR59 `6270faa`를 결합한 후보다. 원본 PR을 자동 병합하거나 #13/#18 완료·Done으로 바꾸지 않는다.

- 충돌: App 상단 환경 표기에 대시보드의 계좌 요약과 주문의 환경 선택을 모두 유지했다. STATE는 결합 작업을 가리킨다. #13·#18 기록과 start-context의 원래 task_contexts·checked_at을 보존했다.
- 자동 병합: specs의 orders 항목은 PR58, dashboard 항목은 PR59와 정확히 일치한다. Trading·Workspace·공유 계약 및 기존 테스트는 해당 원본과 일치한다. 서버 변경 없음.
- 준비: [React cleanup](https://react.dev/reference/react/useEffect)과 [파생값 계산](https://react.dev/learn/you-might-not-need-an-effect)을 실제 확인하고 충돌 해소 전에 implementation-ready 통과. 별도 KIS Effect나 업무 요청을 추가하지 않는다.
- 격리: 기존 e2e-server의 메모리 DB·빈 KIS 자격값을 사용했다. 실행 환경의 KIS_PAPER_APPROVAL도 제거했다. 단위/API의 broker transport는 fixture다. 기존 .local 원장·백업은 사용하지 않았다.
- 단위/API: npm test 137/137 PASS, 실패·건너뜀0. npm run build PASS, 기존 500kB 번들 경고 유지.
- 결합 회귀: 대시보드 → DEMO 주문 → KIS 로컬 원장 → 모바일 대시보드 이동과 두 상단 환경 문구·POST0회 검사. 전체 브라우저 결과와 지정 리뷰는 아래에 갱신한다.

사용자 직접 화면 수용·실제 KIS 장중 성공은 미확인이다. #14/#19/#22/#25 Blocked와 웹 취소409 경계를 유지한다. STE 기준파일 부재는 미검증으로 남긴다.

전체 브라우저 `npx playwright test --reporter=list`: 95/95 PASS(53.4초). 신규 결합1·기존 주문5·대시보드6 포함, 재시도 없이 통과했다. [주문 PC](assets/orders-dashboard-integration/orders-desktop.png)·[주문 모바일](assets/orders-dashboard-integration/orders-mobile.png)·[대시보드 모바일](assets/orders-dashboard-integration/dashboard-mobile.png)·[KIS fixture PC](assets/orders-dashboard-integration/dashboard-kis-fixture-desktop.png)·[KIS fixture 모바일](assets/orders-dashboard-integration/dashboard-kis-fixture-mobile.png). 원본 PR의 캡처는 그대로 보존했다.

STE strict는 `docs/conventions/ste100-writing.md` 부재로 exit2. 문서 기준 검사는 미검증이며, diff·상대 링크 검사는 별도로 확인한다.

지정 Gemini4Argon/high [리뷰](assets/orders-dashboard-integration/argon-review.json): INTEGRATION PASS, P0–P3 0건. 중앙 설정/dry-run은 지정 모델과 달라 사용하지 않고 `agy models` 확인 후 `gemini-4-argon-high --effort high`로 직접 호출했다. 요청/init 모델 일치, 서버 내부 모델·effort는 독립 확인 불가. 텍스트 리뷰이며 도구·재위임0회, 외부 이미지 리뷰 아님. 응답의 임시 경로 링크·줄 번호는 독립 파일 접근 증거가 아니다.

[공급 파일 해시](assets/orders-dashboard-integration/review-manifest.json)는 리뷰 직후 모두 일치했다. 이후 변경은 결과·인계 문서뿐이다. git diff --check와 수정 문서 상대 링크 검사 PASS. 원격 main과 원본 PR head가 유지됨을 재확인했다.

전달: [초안 PR60](https://github.com/krdn/gon-stock03/pull/60), 제품 `2bd44733f8b6923841b5fff46d358f13cdf36090`. 원본 두 head를 부모로 보존한 merge commit이다. GitHub connector 생성403 후 중복 없음 확인·인증된 gh REST로 초안을 생성했다. 최신 head CI 결과는 PR 본문에서 확인한다. 이 전달 추가는 제품·테스트 변경이 아니다. 커밋 훅이 생성한 graphify-out/과 node_modules 링크는 보존하며 clean-tree 인계를 주장하지 않는다.
