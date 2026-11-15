# #6 공통 상태 검증

기준: [작업 #6](../tasks/6-common-state.md), main `e15d3073cf29ef62dde964f1f41ab186e611ec88`. 검증은 로컬 Node24.22.2와 실제 Chromium에서 수행했다. 외부 API는 가짜 transport이며 실제 계좌·주문·체결 증거가 아니다.

## 재현과 결과

| 검사 | 결과·의미 |
| --- | --- |
| 수정 전 이관 회귀2건 | 비JSON502의 파싱 원문 노출, revision20→1 후 주문 버튼 활성으로 실패. 수정 후 통과 |
| `npm test` | 최종 코드38/38 PASS. 기존 주문·SQLite 검사 유지 |
| `npm run build` / `npm run typecheck` | PASS. 공유 응답 타입과 Zod 경계 일치 |
| `npm run test:e2e` | 최종 코드21/21 PASS. 접근성/현재가 문구와 로컬·revision 유실 시 계좌 상태까지 검사 |
| 15화면 데스크톱/모바일 | 환경·긴급정지 켜짐/꺼짐, 가로 넘침·콘솔 오류, 기존 사용자 동작 검사 |
| 실제 화면 확인 | agent-browser 격리 세션에서1440×1050 대시보드·390×844 모의 화면 상태 표시 확인 |
| HTTP·KIS·저장 | 전체/부분/빈 잔고, 이전 성공값 보존, 토큰 재사용·만료·갱신 동시성·미전송 발급 대기, 대기30개·페이지50개 상한,3초 현재가 재사용, 주문 사전 새 잔고·현재가, POST 재전송 금지·HTTP401 불명 유지 |
| 비밀 비노출 | 가짜 key/secret/token/account와 upstream 본문 sentinel이 API/화면/콘솔에 나오지 않음을 검사 |
| `git diff --check`·상대 링크 | PASS |
| `gon-workflow implementation-ready .` | PASS. 실제 KIS 연결 성공을 뜻하지 않음 |
| STE lint | `evolve docs ste-lint --strict --changed refs/remotes/origin/main --added`: exit2. `docs/conventions/ste100-writing.md` 부재. 통과 아님 |

상태 API 폴링은 KIS 호출을 늘리지 않는다. DEMO 금액은 KIS 조회 전후 불변이다. HTTP500은 공유한 저장소 오류 문구 하나만 표시하고 나머지 5xx·비JSON·전송 오류는 고정 문구로 처리한다. 문서 lint의 부재를 숨기기 위한 규약 파일 추가는 하지 않았다.

## 외부 리뷰

중앙 설정과 매 실행 dry-run: `claude-opus-5-5`, effort `high`. 첫 리뷰 실제 반환 모델도 `claude-opus-5-5`이며 session `2df85032-a63e-4b7c-ab12-207b0595efb3`, 결과 `PASS (조건부)`, P0/P1 없음, P2 7건이다. 조건은 STE lint·실제 KIS 미검증을 성공으로 간주하지 않는 것이다. GitHub 승인 리뷰나 사용자 수용을 대신하지 않는다.

- 첫 검토 tree: `dde50d01fff253198d3ebc8ef565ea7ab9977b05`.
- 첫 diff SHA256: `d14a2a17ea8ad817036ce299e702faa803f28f3a12b4d397fec07f29138e933a`.
- 수정분 diff SHA256: `cae0dec05fd9ee86dc01bbd1f0c9b43bff337222763d695b42a47eadd0ffd37f`.

| 지적 | 처리·증거 |
| --- | --- |
| P2-1 로컬 유실 후 KIS 로딩/정상 잔류 | 브라우저 RED 후 수정. 연결 유실 시 이전 성공 있으면 stale, 없으면 disconnected |
| P2-2 인증 거부 원인 유실·미전송 쿨다운 | 실제 토큰 전송 시 발급 대기를 시작. 인증 거부 원인 보존. 큐 포화 재현 RED→GREEN, 동시 인증 갱신37개 검사에 포함 |
| P2-3 주문 사전검사가 이전 잔고 조회 공유 | RED→GREEN. 화면 조회를 기다린 뒤 별도 새 잔고를 읽음. 현재가도 캐시 우회 유지 |
| P2-4 안전한 저장소500 안내 유실 | 브라우저 RED→GREEN. 공유 고정 문구만 허용, 임의JSON500 비밀 sentinel은 숨김 |
| P2-5 현재가에0페이지 표시 | 페이지 표시는 계좌 상태에만 허용. 브라우저 검사 PASS |
| P2-6 상태줄의 접근 가능한 이름 | `role=group`과 이름으로 브라우저 검사 PASS |
| P2-7 부분실패 정의 불일치 | 유효 페이지를 관측했으나 전체 확정 실패로 문서 명확화. 첫 페이지 중복/커서 오류도 포함 |

리뷰 설계 메모의 주문 HTTP401 분류 변화는 원래 `unknown`으로 복원하고 재전송 방지 회귀를 추가했다. 공식 legacy 샘플은2xx `EGW00123`을 토큰 만료로 취급한다. 비2xx 본문은 파싱·재시도하지 않는 보수적 정책을 유지한다.

수정분 추가 리뷰1회 실제 반환 `claude-opus-5-5 / high`, session `64d089b8-ab11-4008-87ae-14e9de305413`: **PASS**, P0/P1 및 미해결 P2 없음. 남은 P3 3건은 직접 보완했다. 인증 원인 검사를 `/만료되거나 거부/`로 강화하고, 최근 재발급 실패 원인을 보존하며, revision 역행 분기도 계좌 상태를 강등한다. 후자의 두 증상은 추가 RED→GREEN으로 확인했다. P3 보완 뒤 모델 리뷰를 반복하지 않았고 최종38/21개 검사로 확인했다. 최종 커밋·PR·원격 CI는 작업 파일에 연결한다.
