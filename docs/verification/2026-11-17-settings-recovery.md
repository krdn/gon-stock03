# 연결·설정 복구 구현 검증

#71 설계 1~3단계를 `feat/71-settings-recovery`에서 구현했다. 기준 main은 PR72 통합 SHA `0d2b33a0aaad65fa8e94d043e1157fdd586d1b87`이다. 실제 연결과 사용자 수용은 미검증이다.

## 변경

- `server/http.ts`의 서버 시작 시각과 기존 인스턴스 ID를 계약·설정 화면에 연결했다. 전체 경로·환경변수 값은 반환하지 않는다. 첫 단계는 “서버 필수 설정”이며 주입 출처·인증 성공과 구분한다.
- `server/kis.ts`의 잔고 작업마다 120초 deadline을 둔다. 큐·호출 간격·공유 인증 대기·응답 본문·연속 페이지·fresh 조회의 선행 대기를 포함한다. 만료된 작업은 후속 요청과 잔고 갱신을 하지 않는다. 이전 전체 성공값을 보존한다.
- `src/App.tsx`의 `kis/check`에만 125초 대기 제한을 적용했다. 지연 문구는 서버 취소·성공·실패를 확정하지 않는다. GET 새로고침은 조회 중에도 가능하며 자동 POST 재전송은 없다.
- 서버 관측 시각과 수신 후 경과 시간으로 인증 대기를 계산한다. 재시도 버튼은 대기 종료 후 수동으로 사용할 수 있다. 잔고 조회 시작 시각·페이지 수를 표시한다.
- 기존 DEMO 실행·strict port 동작을 유지해 `scripts/dev.ts`는 수정하지 않았다. 실제 주입·기존 프로세스 종료·재시작은 하지 않았다.

## 재현과 검사

수정 전 새 단위검사 5건은 인증/본문/페이지/큐의 무한 대기와 시작 시각 계약 부재로 실패했다. 브라우저 2건은 조회 중 GET 버튼 잠김과 서버 식별 부재로 실패했다. 추가 fresh 대기 검사도 전체 한도에 대기가 포함되지 않아 실패한 뒤 수정했다.

- 단위·HTTP: `npm test` 197/197 PASS.
- 브라우저: `npm run test:e2e` 116/116 PASS. 설정 전용 15/15, 설정+공통 상태 26/26은 통과했다.
- 타입·빌드: `npm run build` PASS. 기존 500kB 번들 경고를 유지한다.
- 전체 브라우저 회귀에서 렌더 후 주문 직전 만료 검사 2건이 실패했다. 서버 시간 보정은 Settings의 인증 대기 계산에만 적용하고 기존 freshness/act 실시간 검사 경로를 복원했다. 재검사 결과는 아래 최종 브라우저 결과를 따른다.
- 문서 상대 링크·`git diff --check` PASS. 최초 STE 검사는 기준파일 부재로 exit2였다. 아래 STE 복구에서 기준 도입 후 통과를 확인했다.
- 기존 인증 경합 검사는 추가 await에 맞춰 microtask 스케줄을 3→5로 조정했다. 갱신 후 이전 토큰 오류 발생 순서·발급 횟수·최종 인증 상태 단언은 유지했다. 간격 검사의 fake timer는 신규 120초 deadline을 즉시 실행하지 않도록 실제 타이머에 맡겼다.
- 모든 KIS 검사는 fake transport다. 브라우저 서버는 4314·메모리 DB·KIS 변수 공백이며 기존 서버를 재사용하지 않는다. 원장·다른 worktree·설정은 보존했다. 기록 커밋의 기존 graphify hook이 생성한 미추적 `graphify-out/`은 보존하고 커밋에서 제외한다.

## 외부 리뷰와 한계

완료 경계에서 가이드와 중앙 `review-llm --dry-run`을 확인했다. 중앙 기본값은 지정 모델과 달라 설정을 바꾸지 않고 `agy --model gemini-4-argon-high --effort high`로 명시 호출한다. 현재 실행기 모델 목록에 해당 ID가 있다.

conversation `8eb240c4-15eb-4aa1-88e0-71f3f87c150a`, 종료0·SUCCESS·PASS·차단 지적0. 요청/init 모델은 일치했다. 결과에는 서버 내부 모델·effort가 별도로 반환되지 않아 독립 확인할 수 없다. 검토자는 제공 코드·diff·검사 기록만 읽었고 테스트를 직접 실행하지 않았다.

실제 KIS 인증·업무API·WebSocket·주문·취소·예약·외부알림·Infisical 주입은 수행하지 않았다. 테스트 PASS와 PR CI는 실제 연결 성공, 사용자 수용, main 통합을 뜻하지 않는다. #25 장중 실증과 기존 실행 승인 경계는 유지한다.

## 원격 전달

구현 커밋 `40e4f862faa765581f27ebb29cad27f69ff00f20`을 [PR73](https://github.com/krdn/gon-stock03/pull/73)으로 푸시했다. 해당 SHA의 application/configuration push·PR 검사 4건이 모두 SUCCESS다([PR application](https://github.com/krdn/gon-stock03/actions/runs/43990837230), [push application](https://github.com/krdn/gon-stock03/actions/runs/43990828833)). 기록 후속 커밋의 최신 CI는 PR과 #71 최종 댓글에서 다시 확인한다. PR은 OPEN이며 main에 통합하지 않았다.

## STE 복구

2026-11-17 사용자가 검사 복구를 승인했다. [작성 기준](../conventions/ste100-writing.md)에 공식 원본과 한국어 적용 범위를 기록했다.
원본의 단어표·검사 한도를 유지하고 라이선스·NOTICE를 보존했다. 7문장인 외부 리뷰 문단을 두 문단으로 나눴다.

`evolve docs ste-lint --strict --changed refs/remotes/origin/main --added`: 문서 4개, 위반 0건, 제외 0개, 종료코드 0.
임시 문서의 고의 위반은 단어 2건·문장 길이 1건·문단 길이 1건으로 종료코드 1을 반환했다.
단어표는 공식 원본과 완전히 일치한다. 의미·근거·문서 간 일관성 직접 검토와 상대 링크 검사도 통과했다.

이번 변경은 기준·출처 파일과 작업 문서에 한정했다. 제품 코드는 변경하지 않았으며 기존 실제 연결 제한을 유지한다.
