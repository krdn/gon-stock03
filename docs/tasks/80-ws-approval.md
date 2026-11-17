# 작업: #80 WebSocket 접속키 메모리 발급

[이슈 #80](https://github.com/krdn/gon-stock03/issues/80). 기준 main `023960f`, 브랜치 `feat/80-ws-approval`.

- 목표: 사용자가 접속키를 복사하지 않고 `dev:realtime`으로 발급·서버 주입한다.
- 설계: 기존 dev 실행기를 재사용하고 명시 옵션에서만 발급한다. 키는 서버 자식 환경으로 전달한다. 기본 실행·원장·고정 승인 설정은 보존한다.
- 완료 조건: 공식 모의 endpoint/secretkey, 입력/응답 검증, 15초 제한·재시도 없음, 원문 비노출, 실패 시 자식 미실행. fake transport·프로세스 경계 테스트와 빌드·지정 Argon/high 리뷰·CI.
- 필수 읽기: `docs/INFISICAL.md`, `scripts/dev.ts`, `server/realtime.ts`의 configuration/sessionOpen, `tests/realtime.test.ts`.
- 경계: 사용자 발급 성공 보고와 구현 검증을 구분한다. 실제 구독·주문·자동전략·기존 서버 재시작은 이번 구현 검증에 포함하지 않는다. 휴장 확인과 거래일 입력은 자동화하지 않는다.
- 현재: 구현·로컬 검증 완료. [PR81](https://github.com/krdn/gon-stock03/pull/81), 제품 `2ec43d5`. 원격 결과는 [PR checks](https://github.com/krdn/gon-stock03/pull/81/checks)와 #80 댓글을 확인한다. 통합·실제 발급·앱 적용도 완료했다. 실제 장중 수신 검증은 #25에 남는다.

## 구현·검증

- `npm run dev:realtime`에서만 모의 접속키를 발급한다. 서버 자식에만 전달하며 웹 자식에서 기존 접속키도 제거한다. 기본 dev와 원장·승인 환경은 유지한다.
- 테스트: 새 프로세스 경계13개 PASS, 전체216개 PASS. 초기 기존 코드에서 새 경로6개 실패를 확인했다. 테스트 타입 오류1건을 수정한 뒤 build PASS. Vite 기존 번들 크기 경고는 남는다.
- `git diff --check`, 변경 문서 상대 링크 PASS. STE 검사0 findings이나 검사 대상2개에서 규칙 적용 파일0개로 보고되어 문체 검증 성공으로 확대하지 않는다.
- 2026-11-17 16:31 KST 실제 Infisical 주입 확인: 앱키·앱시크릿·HTS ID·세션 존재. 세션 스키마 유효, 날짜는 오늘과 다르고 현재 시간창 밖이다. 값은 출력하지 않았다. 접속키 발급 성공은 사용자가 보고한 결과이며 이번 검증에서 실제 재발급·구독·서버 재시작·주문은 하지 않았다.
- 한계: 실행기 시작 때 발급1회, 자동 갱신 없음. 만료 시 전체 명령 재실행. watch 재시작은 발급을 반복하지 않는다. 지정 리뷰와 원격 CI PASS.
- 외부 리뷰: 중앙 기본 Opus5.5/high 확인 후 프로젝트 지정 `gemini-4-argon-high`/high로 직접 실행. `agy models` 지원 확인, 응답 SUCCESS/PASS·결함0. 반환 JSON에는 모델/effort 필드가 없어 서버 내부 모델 독립 검증은 미확인. 최초 호출은 timeout 단위 누락으로 실행 전 실패했고 `180s`로 수정했다. 리뷰 대화 `49587f09-1216-48a5-b86d-9ca7eea22773`.

## 통합·실제 적용 완료

2026-11-17 사용자 순차 진행 지시에 따라 PR81을 main `275d9b5`에 통합했다. main application·configuration 2개 PASS, #80 CLOSED다.
16:48 `dev:realtime`에서 실제 접속키 발급과 4303/4304 실행을 확인했다. 서버에만 키가 있으며 기존 원장·승인 없음 상태를 유지했다.

첫 적용 실패, 기본 실행 복구, 별도 발급 진단200과 최종 적용 성공을 [검증 기록](../verification/2026-11-17-ws-apply.md)에 구분했다.
실제 구독·수신·주문은 실행하지 않았다. 다음 장중 #75 → #25 실증 순서를 유지한다.
