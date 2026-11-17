# 작업: #80 WebSocket 접속키 메모리 발급

[이슈 #80](https://github.com/krdn/gon-stock03/issues/80). 기준 main `023960f`, 브랜치 `feat/80-ws-approval`.

- 목표: 사용자가 접속키를 복사하지 않고 `dev:realtime`으로 발급·서버 주입한다.
- 설계: 기존 dev 실행기를 재사용하고 명시 옵션에서만 발급한다. 키는 서버 자식 환경으로 전달한다. 기본 실행·원장·고정 승인 설정은 보존한다.
- 완료 조건: 공식 모의 endpoint/secretkey, 입력/응답 검증, 15초 제한·재시도 없음, 원문 비노출, 실패 시 자식 미실행. fake transport·프로세스 경계 테스트와 빌드·지정 Argon/high 리뷰·CI.
- 필수 읽기: `docs/INFISICAL.md`, `scripts/dev.ts`, `server/realtime.ts`의 configuration/sessionOpen, `tests/realtime.test.ts`.
- 경계: 사용자 발급 성공 보고와 구현 검증을 구분한다. 실제 구독·주문·자동전략·기존 서버 재시작은 이번 구현 검증에 포함하지 않는다. 휴장 확인과 거래일 입력은 자동화하지 않는다.
- 현재: 설계 기록. 다음은 회귀 작성과 구현이다.
