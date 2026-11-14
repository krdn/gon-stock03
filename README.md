# GON Stock

개인 PC용 국내 주식·ETF 트레이딩 워크스페이스. 전체 화면과 설계 시각화에서 출발해 로컬 모의 기능과 KIS 모의 API를 단계적으로 연결합니다.

- **대시보드:** http://127.0.0.1:4303/dashboard
- **상세 설계실:** http://127.0.0.1:4303/design
- **프로젝트 지도:** http://127.0.0.1:4303/project-map.html
- **KIS 모의 매매:** http://127.0.0.1:4303/paper

위 주소는 아래 명령으로 이 PC에서 실행했을 때 열립니다.

```bash
npm ci
npm run dev
```

KIS 모의 계좌는 `infisical secrets-manager run --env dev --path /kis -- npm run dev`로 연결합니다. Node 24가 필요합니다. [실행·중지·복구 안내](docs/operations/local.md)를 참고하세요.

15개 화면, 로컬 주문·취소·전략 자동 재생·백테스트·한도·일지·관심목록을 구현했습니다. 실제 KIS 모의 인증·잔고·현재가·최근 100일봉·당일 주문 조회를 확인했습니다. KIS 주문 접수·대조 코드는 네트워크 fixture로 검증했으며 실제 주문 전송·체결은 아직 검증하지 않았습니다. 웹 정정취소·WebSocket 연속 자동매매·불명 주문 수동 해제는 남아 있습니다. 실전 주문은 지원하지 않습니다.

[현재 작업](docs/STATE.md) · [공식 조사](docs/research/kis-2026-11.md) · [시스템 설계](docs/architecture/workbench.md) · [검증 기록](docs/verification/2026-11-14.md) · [상위 이슈](https://github.com/krdn/gon-stock03/issues/1)
