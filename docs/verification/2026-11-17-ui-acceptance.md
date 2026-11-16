# 15개 화면의 표시·배치 부분 수용

사용자는 다섯 묶음의 자료를 받은 뒤 각각 “모두 수용함”이라고 답했다. 대상 제품은 main `99f6730a577101d4bd24f3def7a8cd3109f32c2b`다. **제시된 초기/DEMO 상태의 PC·모바일 표시·배치만 수용했다.** 실제 거래, 모든 상세탭·입력·오류·복구 상태의 수용은 아니다. #1/#2/#3/#25는 open, #25는 Blocked로 유지한다.

## 수용한 자료

PC는1440×1050, 모바일은390×844로 촬영했다. [캡처36개와 SHA256](assets/ui-acceptance-2026-11-17/manifest.json), [지정 모델 검토 원문](assets/ui-acceptance-2026-11-17/reviews.json)을 보존했다. 최종 검토 원문의 `/tmp/stock25-ui*`는 촬영 당시 경로이며 manifest의 같은 파일명으로 대응한다. 첫 검토의 전환 중 캡처는 최종 수용 자료에서 제외했다.

| 묶음 | 화면과 제시 상태 | 수용 기록 | 캡처 |
| --- | --- | --- | --- |
| 1 | 대시보드(DEMO/KIS 미연결), 주문·체결(빈 DEMO 주문), 위험관리(기본 한도) | [사용자 답변 기록](https://github.com/krdn/gon-stock03/issues/25#issuecomment-6920202977) | [core](assets/ui-acceptance-2026-11-17/core) |
| 2 | 시장 탐색(마스터 미수집), 관심종목(시세 미확인), 포트폴리오(DEMO 보유/KIS 미조회) | [사용자 답변 기록](https://github.com/krdn/gon-stock03/issues/25#issuecomment-6920363447) | [market](assets/ui-acceptance-2026-11-17/market) |
| 3 | 트레이딩(DEMO 주문 확인 전), 전략 스튜디오(DEMO 정지), 백테스트(저장 일봉·실험 없음) | [사용자 답변 기록](https://github.com/krdn/gon-stock03/issues/25#issuecomment-6920460363) | [trading](assets/ui-acceptance-2026-11-17/trading) |
| 4 | 매매일지(빈 기록), 알림·이벤트(기본 DEMO 이벤트), 데이터 상태(미수집/합성 데이터 구분) | [사용자 답변 기록](https://github.com/krdn/gon-stock03/issues/25#issuecomment-6920584121) | [operations](assets/ui-acceptance-2026-11-17/operations) |
| 5 | 연결·설정(미주입/미인증), 설계실(전체 설계 기본탭), KIS 모의 매매(미조회/빈 원장) | [사용자 답변 기록](https://github.com/krdn/gon-stock03/issues/25#issuecomment-6920713429) | [connection](assets/ui-acceptance-2026-11-17/connection) |

## 검토와 격리

묶음별 `gemini-4-argon-high`/high 시각 검토에서 최종 No findings를 받았다. 요청/init 모델은 일치했고 서버 내부 모델/effort는 독립 확인하지 못했다. 첫 묶음의 위험관리 모바일 지적2건은 전환 완료 후 재촬영과 가로 스크롤 근거를 제공해 같은 모델로 한 번 재확인했다. 제품 코드는 바꾸지 않았다.

`env -u KIS_PAPER_APPROVAL node --import tsx scripts/e2e-server.ts`의 메모리 DB·빈 자격증명을 사용했다. 저장 원장·보유·백업은 열지 않았다. 실제 인증·KIS 조회·주문·실시간 시작·데이터 수집·외부 알림 없음. 화면 이동·크기 전환과 포트폴리오 표시 탭 전환, 표 가로 스크롤만 조작했다. 각 묶음 촬영 후 임시 서버·브라우저를 종료했다.

첫 캡처 저장은 `/mnt/data` 권한 오류로 실패해 쓰기 가능한 임시 경로로 옮겼다. 최종 수용 자료는 사용자 PC `Downloads/gon-stock03-{core,market,trading,operations,connection}-ui-2026-11-17.html`에도 자체 포함 HTML로 남겼다. 저장소 PNG와 해시가 재개 시 근거다.

## 남은 작업

[기존 실증 준비안](2026-11-16-validation-prep.md)의 실제 체결 후 잔고, 부분체결/취소경합 관측 여부, 단절/재시작/불명복구, 전략 신호·주문ID 추적, 실제 장중 흐름 사용자 수용이 남았다. UI 체크 전체를 완료하거나 격리 캡처를 실제 장중 증거로 바꾸지 않는다. 별도 장중 시작과 범위 확인 전 KIS 실행·인증·예약은 금지한다. 고정1회/120초 승인을 연속전략으로 확대하지 않는다.

기록 검사: 캡처36개 SHA256 대조·문서 상대 링크·`git diff --check` PASS. STE는 기존 기준 문서 부재로 exit2. 제품 코드 변경이 없어 로컬 기능 테스트는 반복하지 않았으며, 이 기록 PR의 CI 결과는 #25 전달 댓글에 남긴다.
