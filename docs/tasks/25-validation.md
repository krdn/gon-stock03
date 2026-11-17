# 작업: #25 장중 통합 실증 준비

[이슈 #25](https://github.com/krdn/gon-stock03/issues/25). 기준 main `134118eff0b0575be231d9dd34929ab45a290125`(PR63), `chore/25-validation-prep`, `/home/gon/llm-projects/gon-stock03-worktrees/25-validation`.

- 상태: 준비 검증 완료, PR66을 main `dae458093b664d872a23672f4b65aa9b229aa10c`에 통합. 실제 장중 실행은 Blocked. 사용자 후속 작업 진행 지시는 준비·격리 검증 범위이며 주문 전송·예약 승인이 아니다.
- 목표: #25 각 완료 조건의 기존 증거·미관측·실행 전제·중단 조건을 정리하고, 별도 장중 시작 때 검토할 실행안을 만든다. 문서 작성과 실제 실증 완료를 구분한다.
- 선행: native 선행 15개 중 #22가 마지막이었다. PR63 통합 후 native 선행 15개 전부 closed/completed를 확인했다. #22 Project Done·main CI2 SUCCESS 확인. #25 Project Blocked 유지.
- 범위: 저장소/공식 공개 자료 읽기, 필요한 fake transport·메모리/임시DB 회귀, 실증 준비 문서. 실제 KIS 업무API·WebSocket·인증·주문·취소·예약·외부알림 금지. 원장/보유/백업 재설정 금지.
- 보존: 다른 worktree·.local·.codex·graphify-out·node_modules·전역 hook. 강제푸시·보호 우회·추가 에이전트·부모 검증 재위임 없음.
- 리뷰: 필요 시 외부 리뷰 가이드와 중앙 설정을 확인하고 `claude-fable-5-2-high` 또는 `gemini-4-argon-high`만 사용한다. 자동 대체·effort 승격 금지. 요청/init 모델과 서버 내부 모델 독립 확인을 구분한다.

## 먼저 읽을 자료

AGENTS·WORKFLOW·이슈 #25/PR63 최신 상태, `docs/operations/local.md`, `docs/verification/2026-11-16-samsung-paper-run.md`, `docs/verification/2026-11-16-strategies.md`, `tests/browser/workbench.spec.ts`의 필요한 부분. 전체 과거 대화·작업·로그 재독 없음. 신규 코드 수정이 필요하면 공식 자료를 start-context에 추가하고 implementation-ready를 확인한다.

## 준비 결과와 다음 행동

- 2026-11-17 10:30: [삼성전자 한정 실행](../verification/2026-11-17-samsung-paper-run.md)은 지정가192,100원과 재조회192,200원 불일치로 전송 전에 중단했다. 증권사 주문/취소0회, attempted1·위험정지true, 원장/백업 정상·기존4개 불변. 실제 접수·체결 성공이 아니며 같은ID 재실행 금지. 조회HTTP500은 앞선 두 차례 실제 재조회로 정상화됐으나 최초 내부 원인은 미확정이다.

- 2026-11-17: main `99f6730`의 [15개 화면 초기/DEMO 표시·배치 부분 수용](../verification/2026-11-17-ui-acceptance.md)을 기록했다. PC/모바일 캡처36개·지정 Argon 검토와 사용자 답변을 보존한다. 실제 장중/동적 오류·복구 흐름은 미수용이다.

- [증거·실행 전제·중단 조건](../verification/2026-11-16-validation-prep.md)에 #25 완료 조건을 실제 관측/격리 회귀/미관측으로 구분했다.
- #2 P2를 임시 DB·loopback HTTP로 모두 재현했다. [#64 WAL/SHM 권한](https://github.com/krdn/gon-stock03/issues/64), [#65 정적 파일 경로 노출](https://github.com/krdn/gon-stock03/issues/65)로 수정 범위를 분리했다. 이번에는 제품 코드 수정 없음.
- 원격 기준 main·PR63·선행15 completed·#22 Done·#25 Blocked 및 준비 head a2b7826 CI2 SUCCESS 확인. 단위166·브라우저113·build·지정 Argon/high 준비 검토 PASS. STE exit2 한계 유지. 초안 PR의 최종 SHA·CI는 #25 전달 댓글을 기준으로 확인한다.
- 후속 결함 [#64 권한 보호](64-sqlite-permissions.md)와 [#65 정적 경로 보호](65-static-errors.md)는 PR67·PR68로 통합했다. PR68 통합 main은 `50b958db9c8ee63f72e164ace5f3576b8fddfbfb`다. #65 사용자 통합·완료 승인을 확인했고, 추가 열린 개발 결함은 없다. 실제 실증은 실행일·대상 SHA·원장/ID·장 상태·앱 직접 취소 대응을 확정하고 별도 장중 수동 시작 지시가 있어야 한다.
- 기존 삼성전자1회/120초 승인과 연속전략을 혼동하지 않는다. API 취소 없이 사용자 모바일 취소라는 최신 지시를 유지한다. #1/#2/#3/#25 완료 금지.

## 세션 인계

Herdr 탭 `tbe18393cd08fa3a5b8062c2d2dfdb7224` / 터미널 `t7r`, 새 Codex `01a1e49c-e145-7a12-9390-c0cae0de41af`. 새 세션이 pwd/브랜치/ID를 실제 조회했고 부모 t7n이 실제 Herdr 화면·경로·ID·Ready를 확인했다. 부모 t7n의 별도 시작 메시지를 받아 단독 소유권을 인수했다. 부모는 저장소 편집을 중단했다.

전달 검사: 변경 문서 상대 링크·git diff --check PASS. STE는 기준 문서 부재로 exit 2이며 통과가 아니다. main [application](https://github.com/krdn/gon-stock03/actions/runs/43879113152)·[configuration](https://github.com/krdn/gon-stock03/actions/runs/43879113265) SUCCESS.

기존 STE 기준 문서 부재와 번들 경고는 통과로 바꾸지 않는다.

## 2026-11-17 최신 실증 경계

현재 제품 기준은 PR78 통합 main `b7c6ac2`다. #71은 PR77과 실제 주입·인증·잔고 조회 검증 후 마감했다.
#75의 시장가 구현은 단위203·브라우저118·빌드·Argon/high 리뷰·CI4를 통과했다. 실제 접수·체결은 [실행 기록](../verification/2026-11-17-market-paper.md)처럼 아직 미관측이다.

| 남은 항목 | 다음 행동과 조건 |
| --- | --- |
| 주문→체결→잔고 | 다음 장중 수동 시작에 승인된 삼성전자 시장가1주·30만원 한정 실행. 같은 금액·수량 승인 재요청 없음 |
| 부분체결·취소경합 | 1주 실행으로 부분체결을 입증하지 않는다. 미재현으로 기록하며 추가 수량이나 취소를 임의 실행하지 않는다 |
| 실제 단절·재시작 복구 | 주문 미전송 상태의 수신 단절·명시 재개부터 별도 실행안을 확정. 주문 중 장애는 유발하지 않는다 |
| 실시간·전략 추적 | 현재 앱의 KIS_WS_SESSION/KIS_WS_APPROVAL_KEY/KIS_HTS_ID 모두 미주입. Infisical 설정과 당일 세션 준비 필요 |
| 연속전략 전송 | 전략ID/revision·횟수·누적 금액·매도 허용·기간·정지 조건을 먼저 고정. 현재 시장가1회 승인을 확대하지 않는다 |
| 화면 수용 | 실제 실행 후 대상SHA와 PC·모바일 주문/체결/잔고·오류/복구 화면을 제시하고 사용자 답변 기록 |

15:24 실제 잔고 오류와15:25 조회 정상화는 관측했다. 이를 주문 응답 불명·WebSocket 단절·재시작 복구 성공으로 바꾸지 않는다.
첫 실패 뒤 새 실행은 사용자가 허용했지만15:28 시작 마감을 넘겨 실행하지 않았다. 예약·자동 재개는 없다.
#25와 상위 #1/#2/#3은 열린 상태를 유지한다. 준비·격리 회귀·실제 관측·사용자 수용을 구분한다.

## 장 마감 후 점검 완료

2026-11-17 사용자의 장외 작업 지시로 [연결 준비·복구·UI 점검](../verification/2026-11-17-afterhours.md)을 완료했다.
WS 인증 HTTP200·접속키 수신, 격리 복구84·브라우저35·빌드 PASS다. 실제 구독·주문·취소는0이며 키를 저장하지 않았다.
HTS ID 등록·당일 세션·장중 체결/복구·연속전략 거래 계약·사용자 화면 수용은 위 체크리스트의 재개 조건을 따른다.
기존 승인과 원장·앱을 보존했다. #75와 #25는 실제 실증 대기로 유지하며 자동 예약하지 않는다.
