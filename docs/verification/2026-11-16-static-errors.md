# #65 정적 파일 오류의 내부 경로 보호

`server/http.ts`의 정적 파일 읽기 오류가 공통 catch로 넘어가 HTTP400과 원문 경로를 반환했다. 읽기 부분만 별도로 처리해 ENOENT/ENOTDIR은404, 그 밖의 읽기 실패는500과 고정 문구를 반환한다. API 오류 처리와 정상 응답 헤더는 유지했다.

## 격리 검증

`tests/static-http.test.ts`는 임시 cwd·메모리 Store·빈 자격증명·실패 fake transport·실패 WebSocket factory를 사용한다. 각 하위 테스트 전 dist를 초기화하고 마지막에 서버·Store·임시 디렉터리를 정리한다. 사용자 원장은 접근하지 않는다.

- 수정 전: 누락 dist·개별 파일·ENOTDIR·EISDIR 네 회귀가 실제 HTTP400으로 실패. 정상 파일/SPA와 API 보존 두 하위 테스트는 통과.
- 수정 후: `node --import tsx --test tests/static-http.test.ts` 7/7 PASS(상위 테스트 포함). 세 경로의 GET/HEAD 상태·고정 JSON·본문 없는 HEAD·내부 경로 없음, 정상 HTML/JS/CSS·SPA·보안 헤더와 API400/405 보존. broker transport 호출0.
- `npm test`: 189/189 PASS. `npm run build`: PASS, 기존 500kB 번들 경고 유지.
- `npm run test:e2e`: 113/113 PASS. 테스트가 재생성한 기존 스크린샷은 작업 시작 시 깨끗했던 HEAD 내용으로 복원했다.
- 최초 테스트 실행은 새 worktree의 tsx 부재로 실패. `npm ci` 후 실제 회귀를 실행했다. 잠금 파일은 바꾸지 않았다.
- STE는 기존 `docs/conventions/ste100-writing.md` 부재로 exit2. 문서 링크·diff 검사는 별도로 수행한다.

## 근거와 한계

[Node24 fs](https://nodejs.org/docs/latest-v24.x/api/fs.html)는 Linux 디렉터리 읽기의 EISDIR을 설명한다. [공식 오류 문서](https://nodejs.org/api/errors.html#common-system-errors)의 ENOENT/ENOTDIR과 [Node24 HTTP](https://nodejs.org/docs/latest-v24.x/api/http.html)의 HEAD 본문 제약을 확인했다. v24 errors 직접 접근은 실패했고 현재 공식 오류 문서를 사용했다. `docs/start-context.json`에 기록 후 `gon-workflow implementation-ready .` PASS.

읽기 실패는 Linux EISDIR로 검증했다. 모든 OS·파일시스템 오류를 실증한 것은 아니다. 실제 KIS 업무API/WebSocket·인증·주문·취소·예약·외부 알림은 실행하지 않았다. #25 장중 수용과 연속전략의 증거가 아니다. 사용자 수용·통합 전 #65는 open으로 유지한다.

## 지정 외부 리뷰

`external-review.md`, 중앙 `review-models.json`, `review-llm --dry-run`을 확인했다. 중앙 기본값은 claude-opus-5-5/high로 사용자 지정과 달라 실행하지 않았다. 전역 설정을 바꾸지 않고 `agy --model gemini-4-argon-high --effort high --sandbox --disable-slash-commands`로 제공 자료만 읽는 리뷰를 1회 실행했다.

요청 모델과 반환 init 모델은 `gemini-4-argon-high`로 일치했다. 대화 `fcd51965-d004-4602-9f72-453787c876f6`, 결과 SUCCESS·exit0·No findings. 정적 오류 경계·GET/HEAD·SPA/API 보존·격리를 검토했다. 도구 실행·위임 이벤트는 없었다. 서버 내부 모델/effort는 독립 검증하지 못했다. 자동 대체·effort 승격·다른 이슈 리뷰 재사용은 없었다.
