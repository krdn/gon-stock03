# 2차 로컬 기능과 KIS 모의 연결

11월 20일 최종 인수 범위는 [모의 버전 수용 판정](../verification/2026-11-20-paper-acceptance.md)을 따른다. 아래는 단계별 이력이다.

이슈: https://github.com/krdn/gon-stock03/issues/2 · 선행: [화면 #3](https://github.com/krdn/gon-stock03/issues/3) · 브랜치 `feat/trading-workbench`

2026-11-15부터 [화면별 세션 계획](../plans/interface-sessions-2026-11.md)의 공통 기능 묶음으로 관리한다. 위 선행은 초기 개발 순서의 기록이다. 다음 실행은 #5 기준선 확정 뒤 개별 하위 이슈의 native 의존성을 따른다. 이 파일은 기존 구현·검증 근거를 보존한다.

- 구현/검증: 로컬 주문·예약 자원·다음봉 체결·취소·관심목록·전략 저장/시작/정지·3초 자동 데모 재생·비용 포함 백테스트·위험관리·일지·이벤트·SQLite 복구.
- KIS 실조회: Infisical dev /kis 주입 → 모의 인증·잔고·현재가·최근100일봉·당일 주문. 민감값은 출력/저장하지 않음.
- KIS 코드/fixture: VTS 지정가 주문, 전송 전 원장, 동일 ID 중복 방지, 거부/불명 구분, 불명 시 추가 주문 차단, 계좌/매수 가능량/위험 검사, 실제 조회 대조.
- 필수 읽기: `docs/architecture/workbench.md`, `docs/operations/local.md`, `docs/verification/2026-11-14.md`, 변경 대상의 `server/kis.ts`, `paper.ts`, `engine.ts`.
- 미완료: 실제 KIS 주문·부분체결 실증, 모의 정정취소 가능수량 계약과 웹 취소, 주문번호 없는 불명 상태 수동 복구, WebSocket·장중 연속 자동매매·연결 복구, 전체 종목/과거 데이터 수집.
- 현재 제한: KIS 주문은 UI 확인 후 접수 코드까지 제공하나 체결 검증은 아직 없다. KIS 취소는 모의 앱에서 처리 후 대조. 데모 자동재생은 KIS로 전송하지 않는다. 실전 환경 미지원.
- 실패·조치: HTTP Host 위조 테스트에서 fetch가 Host를 덮어써 잘못된 요청이 발생. node:http로 실제 위조 Host를 전송해 차단 검증. 낮춘 잔고 테스트의 손실 기준도 해당 fixture 자산으로 맞춤.
- 다음: 공식 모의 정정취소 지원 확인 → 원장 수동 복구 → 장중 소량 모의 주문/체결/취소·연속 자동매매 실증. 현재 작업을 전체 완료로 종료하지 않는다.
- 리뷰/검사: Claude Opus 5.5/high 원 리뷰·수정분 확인 완료. P1 3건 수정, 단위/계약/저장 23개·브라우저 9개·빌드 통과. 최종 후속 수정은 직접 회귀 검사.
- 원격: [초안 PR #4](https://github.com/krdn/gon-stock03/pull/4). 구현 커밋 `4f9ba30918f6b3f77062b2a560ab934049785298`. 최종 head와 검사 결과는 PR Checks에서 재조회한다.
- CI: [구성 검사](https://github.com/krdn/gon-stock03/actions/runs/43607696475) 통과. [앱 검사](https://github.com/krdn/gon-stock03/actions/runs/43607696508)는 최초 기록 시 브라우저 설치/검사 진행 중이었다. 최종 결과는 PR·이슈 전달 기록을 따른다.
