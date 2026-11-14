# 로컬 실행과 복구

Node 24와 npm을 사용한다. 프로젝트 루트에서 실행한다.

```bash
npm ci
npm run dev
```

주소: http://127.0.0.1:4303/dashboard · 설계: http://127.0.0.1:4303/design . 서버는 4304에서 실행하고 웹의 `/api`를 프록시한다. 두 포트가 사용 중이면 기존 앱을 임의 종료하지 말고 해당 앱의 소유자를 확인한다. `Ctrl+C`로 이 실행의 웹·API 프로세스를 종료한다.

실제 KIS 모의 연결은 다음 명령으로 실행한다. `.infisical.yaml`은 사용자가 제공한 프로젝트, dev 환경, /kis 경로를 가리킨다. 로그인 세션이 만료되면 사용자가 Infisical 인증 화면에서 로그인한다. 키를 채팅에 입력하지 않는다.

```bash
infisical secrets-manager run --env dev --path /kis -- npm run dev
```

비밀 변수는 `KIS_APP_KEY`, `KIS_APP_SECRET`, `KIS_CANO`, `KIS_ACNT_PRDT_CD`다. `.env.example`은 이름만 문서화하며 앱은 평문 .env를 자동 로드하지 않는다. 실제 조회 검사만 별도로 실행하려면 아래 명령을 사용한다. 계좌 잔고 금액·키·토큰을 출력하지 않는다.

```bash
infisical secrets-manager run --env dev --path /kis -- node --import tsx scripts/check-kis.ts
```

빌드한 앱과 API를 한 서버로 실행할 수도 있다.

```bash
npm run build
infisical secrets-manager run --env dev --path /kis -- npm start
```

이 경우 주소는 http://127.0.0.1:4304/dashboard 이다. 외부 배포·원격 공개·자동 시작 서비스는 구성하지 않았다.

## 사용 순서

1. 설계실의 전체 설계 → 화면별 상세 → 주문 흐름을 읽는다.
2. 데모 트레이딩에서 종목·지정가·수량을 확인하고 접수한다.
3. 주문·체결의 다음 데모 봉 또는 전략 스튜디오의 자동 재생으로 체결 조건을 평가한다.
4. 전략을 저장하고 시작한 다음 자동 재생을 켠다. 이벤트에서 주문 이유와 차단 이유를 확인한다.
5. KIS 모의 매매에서는 먼저 시세·일봉과 계좌·주문을 조회한다. 로컬 데모 주문과 구분한다.
6. KIS 지정가 주문은 별도 확인창에서 모의 서버 전송을 확인한다. 실제 체결은 계좌·주문 조회로 대조한다. 정정·취소는 현재 KIS 모의 앱에서 처리한다.

## 저장·중지·복구

DB는 `.local/workspace.sqlite`다. 주문·관심목록·전략·일지·한도와 KIS 주문 원장을 보관한다. 백업은 앱을 정상 종료한 후 `.local` 전체를 별도 안전한 위치에 복사한다. 실행 중 SQLite 파일 하나만 복사하면 WAL의 최신 변경을 놓칠 수 있다. 저장된 개인정보·거래 기록을 Git에 추가하지 않는다.

긴급정지는 신규 주문과 데모 전략·재생을 정지한다. 이미 증권사로 전송한 요청을 취소하지 않는다. 재시작하면 데모 전략/재생은 정지하며, KIS 전송 중 기록은 응답 불명으로 복구된다. 응답 불명에서는 주문을 반복하지 않는다. KIS 모의 앱에서 주문을 확인하고 원장·주문번호를 대조해야 한다. 번호 없는 불명 주문의 자동 해제는 제공하지 않는다.

## 검사

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

브라우저 검사는 별도 4314 포트, 메모리 DB, 빈 KIS 자격증명을 사용한다. 사용자 DB나 실제 계좌에 주문하지 않는다. 테스트 결과와 실제 KIS 확인은 [검증 기록](../verification/2026-11-14.md)을 따른다.
