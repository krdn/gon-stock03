# #9 주문·복구 검증

기준: main `034f7e766d67b0ecfe3dab8477078939c255412e`. 구현 브랜치 `feat/9-kis-orders-recovery`, 제품 `c2dd987870203f29391ef721e473115f1f12ace6`. [작업](../tasks/9-kis-orders-recovery.md) · [공식 계약](../research/kis-order-recovery-2026-11.md) · [미승인 실행안](../operations/kis-minimum-paper-run.md).

## 재현과 수정

| 검사 | 수정 전 | 수정 후 |
| --- | --- | --- |
| 조회/접수 경합 | 2번째 일별 조회가 주문 POST 전에 끼어드는 네트워크 순서 assertion 실패 | 같은 큐에서 접수 전 구간 완료 후 외부 조회. 내부 조회 재진입 교착 없음. |
| 주문번호 재사용·수량 | 가격/조직 불일치가 accepted. 불가능 체결수량도 통과 | 가격·조직 대조, 중복 번호·수량 계약 실패 차단. |
| 복구·취소 API | inspect 400, capabilities 405 | 저장 근거·확인·재조회·원장/감사 원자 저장. 취소/정정 409, 전송 0건. |
| 주문 접수 계약 | 성공 코드 없는 응답도 accepted | `rt_cd=0`·유효 번호 없으면 unknown, 재전송 0건. |
| 미수 없는 가능금액 | 60,000원인데 70,000원 주문을 차단하지 않음 | nrcvb 금액·현금의 최솟값으로 차단, 조회 구분 01. |

최초 추가 검사 6 FAIL/10 PASS, 접수 계약 추가 RED 1 FAIL/20 PASS, 가능금액 RED 1 FAIL을 확인한 뒤 수정했다. 첫 테스트 작성의 ES2023 타입 불일치와 HTTP 시험 포트 재사용도 수정했다. 포트별 생명주기를 분리하고 프로젝트 TypeScript 설정은 바꾸지 않았다.

## 실행 결과

- `npm test`: **93/93 PASS**. HTTP·KIS transport fixture, 재시작, 다음 거래일 원래 날짜 조회, 복구 근거 만료/모호/변경, 중복 확인, 부분체결·취소 경합, 감사 저장 실패 롤백을 포함한다.
- `npm run build`: PASS. 기존 500kB 번들 경고는 남는다.
- `npm run test:e2e`: **67/67 PASS**. 비밀값을 제거한 메모리 DB 서버에서 기존 화면 회귀를 검사했다. 이번 UI 추가는 없다. 마지막 가능금액 계약 변경은 단위/API 검사와 빌드로 확인했다.
- `git diff --check`: PASS. 변경 문서의 로컬 링크 11건 PASS.
- `evolve docs ste-lint --strict --changed refs/remotes/origin/main --added`: **실패**. 기존 `docs/conventions/ste100-writing.md`가 없다. graphify도 설치되지 않았다. 통과로 대체하지 않는다.
- [지정 Argon 리뷰](assets/kis-orders-recovery/argon-review.json): 제한된 전달·초안 PR 범위 PASS, P0/P1/P2 0건. 요청/init `gemini-4-argon-high`, CLI effort `high`, 182.46초. 서버 모델·effort는 독립 확인되지 않았다. P3 2건 중 실행안 문구를 보완했고, 0값 식별자는 검증된 후보와 일치할 수 없어 코드 변경 없이 유지했다. 문구 수정에 반복 리뷰는 붙이지 않았다.
- [초안 PR47](https://github.com/krdn/gon-stock03/pull/47): 제품 SHA 푸시·원격 일치 확인. 최종 기록 SHA와 해당 head의 PR/push CI·clean clone handoff 결과는 #9 인계 댓글에서 확인한다. GitHub 앱 PR 생성은 403으로 실패해 기존 인증 `gh`로 생성했다.

## 수용 범위

실제 KIS 주문·정정·취소·인증 업무 요청은 수행하지 않았다. API 공개 문서 조회와 네트워크 fixture를 구분한다. 웹 정정취소는 공식 필수 가능수량 조회 모의 미지원으로 Blocked다. 번호 없는 조회 부재는 불명 유지다.

최소 실제 모의 접수·조회, 공식 앱 계좌 일치·수동 취소, 직접 육안·장중 수용, 실제 일봉·공식 달력·연속전략은 미검증이다. #7 공개 마스터3962 실조회와 구분한다. #8 Fable 한도 오류와 #21 초기 pacing CI 실패/재실행 성공의 원인 미해결을 보존한다. #24 검증 PASS는 #9의 근거로 재사용하지 않았다. 전체 #9 completed/Done 또는 후속 선행 해제 근거가 아니다.
