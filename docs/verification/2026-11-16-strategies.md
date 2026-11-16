# #22 KIS 전략 검증

KIS 체결가 이벤트와 저장 전략을 연결했다. 검증은 fake REST/WebSocket 및 메모리·임시 SQLite에서만 수행했다. 실제 KIS 업무 API·인증·주문·취소·예약·외부 알림 호출은 없다. 직접 사용자 육안·장중 수용은 미검증이며 #25는 시작하지 않았다.

## 구현 결정

- `server/realtime.ts`: 검증된 새 체결가 이벤트에만 이동평균 교차를 평가한다. 분봉으로 오인하지 않도록 이벤트 단위를 표시한다. 기존 모듈 확장을 택해 별도 스케줄러·중복 주문 경로를 만들지 않았다.
- 저장 전략은 불변 ID/revision 1이다. 변경은 새 전략으로 저장한다. 워터마크는 재시작·재연결 후 과거 이벤트 재실행을 막고, 실행 세대는 정지 직전 대기 주문을 막는다.
- 최근 평가 최대 100건과 별개로 주문 원장의 전략 ID·revision·이벤트를 영구 보존한다. 관망/차단은 목록에서 만료될 수 있다. 미확정 전송 기록은 평가 목록 정리 중에도 남긴다.
- 매도는 수동 보유분도 포함한다. 공통 주문 서비스가 잔고·미체결 예약·금액·종목·손실 한도·긴급정지를 다시 검사한다. 기존 고정 1회 승인과 다른 전략 UUID는 차단되며 승인 ID를 전략에 재사용하지 않는다.
- S01은 KIS/DEMO 전략 수를 분리한다. S07은 신호·이유·요청 ID·접수번호와 정지 상태를 표시한다. GET/화면 이동은 KIS 조회·전송을 시작하지 않는다.

## 실행 증거

- 공식 공개 자료 확인 후 `docs/start-context.json`에 #22를 추가했다. `gon-workflow implementation-ready .` PASS.
- 원격 #19/#21: closed/completed·Project Done. PR62 merged, main `54754f81e831cf3a6b24085229ca68c485dc8c86` CI2 SUCCESS.
- 단위: `npm test` 166/166 PASS. 저장/재시작·중복·매수/매도·승인·위험·불명·저장 실패 회귀 포함.
- 브라우저: 전체 111 PASS. 상단 환경 표기·초기 조회 중 선택 보완 후 S01/S07 9 PASS. 초기 조회·서버 불명 회귀 추가 후 S07 5/5 PASS.
- `npm run build` PASS. 기존 500 kB 번들 경고 유지.
- 데스크톱/390px 모바일 스크린샷을 에이전트가 확인했다. 사용자 육안 수용은 아니다. [데스크톱](assets/strategies/desktop.png) · [모바일](assets/strategies/mobile.png).
- STE: `evolve docs ste-lint --strict --changed refs/remotes/origin/main --added`는 `docs/conventions/ste100-writing.md` 부재로 exit 2. 통과로 처리하지 않았다.

## 실패와 수정

- 새 worktree의 `tsx` 부재: 기존 lockfile로 `npm ci --ignore-scripts` 후 실행. 기존 node_modules는 없었다.
- 평가 이력 부재 테스트 RED 확인 후 구현. 잘못 설정한 교차 가격 fixture는 실제 교차가 발생하는 값으로 수정했다.
- 브라우저 500 오류는 공통 안전 오류 계약을 사용한다. 테스트 fixture를 실제 저장 실패 계약에 맞췄다.
- 초기 상태 응답 전에 선택한 환경이 remount로 초기화되는 실패를 재현했다. 상태 확인 전 환경 선택을 비활성화했다.
- 정지 저장 실패 시 주문 가드가 열린 상태로 남는 RED를 재현했다. 소켓/메모리 가드를 먼저 닫도록 수정했다.
- 리뷰 회귀의 첫 가격 fixture가 의도한 매수 전에 매도 교차를 만들어 대기했다. 해당 테스트 프로세스만 종료하고 하락 준비 구간 후 단일 매수 교차로 교정했다. 5초 timeout을 추가했고 최종 단위 검사에 포함했다.
- 모바일 첫 캡처는 메뉴가 열려 내용을 가렸다. 메뉴가 닫힌 조건을 검사한 후 다시 캡처했다.

## 리뷰와 전달

중앙 설정/dry-run 기본은 `claude-opus-5-5/high`로 사용자 지정과 다르다. 전역 설정을 바꾸지 않고 제공 목록에서 확인한 `gemini-4-argon-high`, effort high를 명시해 읽기 전용 리뷰를 요청했다. 요청/init 모델 일치를 확인했다. 초기 리뷰는 평가 순서/조기 삭제 Medium과 S01 서버 불명 준비 표시 Low를 지적했다. 두 RED를 재현해 수정했다. 수정분만 1회 후속 리뷰에서 PASS를 받았다. [리뷰 결과](assets/strategies/review.json). 서버 내부 모델/effort는 독립 검증하지 않았다.

로컬 검증·리뷰를 완료했다. 커밋·초안 PR·최신 head CI는 전달 단계에서 기록한다. #22 사용자 수용·통합 전 completed/Done 처리하지 않는다. #25 장중 실증·연속전략 실제 전송 승인은 별도다.
