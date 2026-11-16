# #25 장중 실증 준비

**준비만 완료하고 실제 실행은 Blocked로 유지한다.** #25의 실제 관측을 격리 검사로 대신하지 않는다. 제품 코드는 수정하지 않았다.

기준 main `134118eff0b0575be231d9dd34929ab45a290125`(PR63), 준비 head `a2b7826caf377acb5cdaefc542991306676a9179`. 2026-11-16 원격 확인: native 선행 15개 closed/completed, #22 Project Done, #25 Project Blocked. main [앱](https://github.com/krdn/gon-stock03/actions/runs/43879113152)·[구성](https://github.com/krdn/gon-stock03/actions/runs/43879113265), 준비 head [앱](https://github.com/krdn/gon-stock03/actions/runs/43879630334)·[구성](https://github.com/krdn/gon-stock03/actions/runs/43879630183) SUCCESS. [인계 댓글](https://github.com/krdn/gon-stock03/issues/25#issuecomment-6918303845)의 SHA와 원격 브랜치가 일치했다.

## 증거와 남은 관측

| #25 항목 | 실제 관측 | 격리 회귀 근거 | 남은 관측·판정 |
| --- | --- | --- | --- |
| 주문→체결/취소→잔고 | [삼성전자 한 건](2026-11-16-samsung-paper-run.md): 접수·REST 대조·API 취소 후 체결0/잔량0·기존 보유 유지 | `tests/paper.test.ts` 접수·대조·불명·수량 불변식 | 실제 체결 및 체결 후 잔고 변화 미관측 |
| 부분체결·취소경합 | 없음 | 같은 파일 partial fills, blocked duplicate cancellation racing with a fill | 부분체결·경합을 실제 관측하지 못하면 미재현으로 남긴다 |
| 끊김·재시작·불명 복구 | 없음 | `tests/paper.test.ts` 번호 없는 불명 대조·재시작, `tests/realtime.test.ts` 연결 중단·명시 재개 | 실제 장애 증거 필요. 주문 중 장애를 임의 유발하지 않는다 |
| 전략 신호·주문 ID | 없음 | `tests/realtime.test.ts` 저장 전략·revision·이벤트·영구 원장 연결, 고정 승인 UUID 차단 | 연속전략 실제 전송은 별도 범위와 안전 계약 필요 |
| PC·좁은 화면 수용 | 직접 사용자 수용 없음 | `tests/browser/workbench.spec.ts:44` 전체 화면 데스크톱/모바일 렌더, 화면별 회귀 | 대상 SHA·화면·사용자 답변을 기록해야 수용 가능 |
| 미지원·미재현 | 웹 취소/정정은 계속 409 차단 | `tests/paper.test.ts:185` 무인증·무전송 차단 | 한정 API 취소 한 건을 일반 지원으로 확대하지 않는다 |
| C03 이관 항목 | 취소 한 건만 관측 | 부분체결, 취소경합, 원주문 날짜 대조, ACK 후 불명 유지 회귀 | 부분체결·경합·다음날 잔량/취소 플래그/총평가금액은 실제 미관측 |
| 승인 대조 | 과거 1회 실행 결과와 후속 매수만 지시 존재 | 고정 승인·1회·120초·재시작 차단 회귀 | 아래 사전조건과 별도 장중 시작 전 실행 금지 |
| 최종 수용 | 없음 | CI와 에이전트 검사는 기술 근거 | 미해결 결함·미관측과 사용자 수용을 기록하기 전 #1/#2/#3/#25 Done 금지 |

기존 [전략 검증](2026-11-16-strategies.md)의 fake transport PASS는 실제 체결·연속전략 실증이 아니다. 과거 삼성전자 실행 제품 SHA는 `1d2030ebb40a73831f1f8703e83ce46547ede831`이며 현재 main의 장중 실증으로 바꿔 표기하지 않는다.

## 별도 시작 때 적용할 실행안

다음 한정 실행 후보는 [최신 사용자 지시](2026-11-16-samsung-paper-run.md#후속-사용자-지시)의 **005930 모의 현금 지정가 매수1주·20만원 이하·기존 보유 유지·주문1회·API 취소 없이 사용자 모바일 취소**다. 기존 승인을 다시 요청하는 대신 실행일의 별도 수동 시작과 아래 조건을 확인한다. 지금은 날짜 지정·예약·연결·인증·조회도 하지 않는다.

1. 수용 대상 SHA와 CI를 고정한다. #64/#65 수정·통합 여부와 실행 환경 영향을 다시 판단하고 결함을 숨기지 않는다. 최종 Done은 미해결 결함이 있으면 금지한다.
2. 실행일 공식 개장·특별 시간 공지와 앱 장 상태를 확인한다. 기존 실행안의 09:00 이상·15:30 미만 KST는 특별일 검증을 대체하지 않는다. 날짜·시간창·120초 이내 점검 여유를 확정하지 못하면 중단한다.
3. API와 공식 모의 앱 계좌 일치, 다른 API 운용 중지, 사용자의 잔량 직접 취소 가능 상태를 확인한다. 별도 시작 후 허용된 인증·사전조회로만 확인하며 비밀값은 게시하지 않는다.
4. 사용자 지정 원장과 승인 고정ID·소비 여부를 확인한다. 기존 원장·보유·백업을 보존한다. 새 실행 원장/ID와 백업 방식은 시작 전 확정하며 소비 기록 초기화로 재실행하지 않는다.
5. 최신 시세·호가·거래정지·주문가능금액·보유·미체결·위험 한도를 확인한다. 기존 보유 예외 외 조건은 완화하지 않는다. 승인 단가 상한과 공통 위험 한도를 모두 만족해야 한다.
6. 고정 주문1회만 전송한다. 접수/거절/응답 불명 뒤 신규 주문을 정지한다. 주문번호·날짜·종목·방향·수량·가격·잔량과 잔고를 대조한다. API 취소/정정과 보유분 매도는 실행하지 않는다.
7. 사용자가 앱에서 해당 주문의 잔량을 처리한다. 120초 내 REST 대조가 가능하면 결과를 남긴다. 앱 처리가 늦거나 시간창이 끝나면 자동 조회를 종료하고 미확정 상태를 남긴다. 재시작으로 조회 창을 연장하지 않는다.

**즉시 중단:** 계좌/종목/가격/번호 불일치, 미확인 외부 미체결, 시세 지연·호가 오류·거래정지, 조회/인증 실패, 저장·감사 실패, 수량 모순, 응답 불명, 위험 한도 또는 시간 한도 도달. 전송 전이면 보내지 않고, 전송 후이면 재전송 없이 위험정지·원장 보존·사용자 앱 확인으로 넘긴다. 정지는 이미 접수된 주문을 취소하지 않는다.

연속전략·복구 실증은 위 1회 실행에 포함되지 않는다. 전략 ID/revision·종목·매수/매도·보유 매도 허용 여부·주문 횟수·누적 금액·기간·연결 단절·손실/정지·수동 잔량 대응을 별도 실행안으로 고정해야 한다. 현재 고정 승인 UUID를 전략 UUID로 바꾸거나 무승인 서버로 우회하지 않는다. 실제 장애 주입·부분체결 유도·반복 주문도 별도 범위다.

## #2 P2 격리 재현

| 후속 | 방법 | 관측과 한계 |
| --- | --- | --- |
| [#64 WAL/SHM 권한](https://github.com/krdn/gon-stock03/issues/64) | 0755 임시 디렉터리, KIS 환경변수 없는 자식의 `server/index.ts`, STOCK_DB=임시 DB, STOCK_PORT=0. 열린 파일 mode 측정 | umask 022: DB0600/WAL0644/SHM0644. umask 077: 모두0600. 기존 디렉터리는0755 유지. 실제 다른 사용자 열람은 미검증 |
| [#65 정적 경로 노출](https://github.com/krdn/gon-stock03/issues/65) | dist 없는 임시 cwd, 메모리 Store, 빈 자격증명·호출 시 실패하는 fake transport, loopback 임시 포트와 허용 Host | `/dashboard`, `/assets/missing.js`, `/project-map.html` 모두400·ENOENT 절대 경로 포함. broker transport 0회 |

원인: `server/index.ts:12-13`은 Store 생성 뒤 본 DB만 chmod한다. `server/store.ts:14`는 먼저 WAL을 생성한다. 기존 디렉터리와 상위 경로가 탐색 가능하면 보조 파일 읽기 위험이 남는다. `server/http.ts:159,170,179`는 readFile 실패의 error.message를 반환한다. 따라서 두 항목 모두 별도 수정·격리 회귀가 필요하다. 이번 준비에는 수정하지 않았다.

재현은 `/tmp/stock03-25-prep/probe.mjs`를 `node --import tsx`로 실행했다. 임시 DB/프로세스는 종료·제거했고 사용자 `.local`은 열지 않았다. 재현 절차와 후속 완료 조건은 각 이슈에 보존한다.

## 이번 검증과 한계

- 기존 node_modules가 없어 lockfile 기준 `npm ci --ignore-scripts`로 설치했다. 기존 의존성 디렉터리를 덮어쓴 작업은 없다.
- KIS 환경변수를 비우고 `KIS_PAPER_APPROVAL`을 제거한 `npm test`: 166/166 PASS. fake transport·메모리/임시 DB만 사용했다.
- `npm run build`: PASS. 기존 500 kB 번들 경고 유지.
- 빈 KIS 환경·메모리 DB의 `npm run test:e2e`: 113/113 PASS. 직접 사용자 육안 수용은 아니다.
- 상대 링크·`git diff --check` PASS. STE는 `docs/conventions/ste100-writing.md` 부재로 exit2. 통과가 아니며 문서 검사 한계로 남긴다.
- 실제 KIS 업무API·WebSocket·인증·주문·취소·예약·외부 알림 실행 없음. 원장·보유·백업·다른 worktree·.codex·graphify-out·전역 hook 보존.
- GitHub connector의 이슈 생성은403으로 실패했다. 중복 확인 후 기존 gh 경로로 후속 이슈를 생성했다.

중앙 설정/dry-run은 `claude-opus-5-5/high`로 사용자 지정과 달랐다. 전역 설정을 보존하고 제공 목록의 `gemini-4-argon-high`, effort high를 명시했다. 이번 준비 문서와 재현 근거만 제공한 [리뷰](assets/validation-prep/review.json)는 PASS다. 요청/init 모델 일치, 서버 내부 모델/effort 독립 미검증. 다른 이슈 리뷰를 재사용하지 않았다.
