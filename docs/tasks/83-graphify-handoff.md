# 작업: Graphify 활용과 자동 인수인계 복구

[#83](https://github.com/krdn/gon-stock03/issues/83). 사용자 선택은 핵심 그래프·보고서 Git 추적, 캐시 제외다.

- 원인: 전역 post-commit/post-checkout 훅의 graphify-out 생성물 전부가 미추적 상태다. 중앙 verified_checkpoint는 git status --porcelain --untracked-files=all 결과를 정상 차단한다.
- 설계: graph.json·GRAPH_REPORT.md와 저장소별 .skip-hook만 추적한다. 캐시·HTML·manifest·로컬 빌드/라벨 상태는 제외한다. 전역 훅·중앙 dirty 검사는 변경하지 않는다.
- 활용: 기존 그래프로 연관 경로를 찾고 원문과 대조한다. 소스 변경 후 graphify update .를 실행하고 코드와 결과를 함께 커밋한다. 전달 전에 원격 SHA와 clean 상태를 검증한다.
- 완료 조건: 수정 전 거부 재현, 결과/캐시 구분과 실제 작업 파일 감지 유지. 그래프 조회·갱신·보존과 훅 실행 후 clean을 확인한다. 지정 리뷰·CI·통합 후 실제 자동 전달과 댓글 재조회를 검증한다.
- 경계: 다른 worktree·기존 파일·전역 훅·중앙 도구·앱·원장 보존. KIS 호출·주문·재시작 없음.
- 근거: [Git ignore 규칙](https://git-scm.com/docs/gitignore), 설치된 post-commit/post-checkout의 .skip-hook 조건, workflow.py의 verified_checkpoint. 작업 후 결과를 이 파일에 기록한다.

## 검증

- 수정 전 `handoff --dry-run`은 미추적 graphify-out 때문에 exit1이었다. cache의 check-ignore도 exit1이었다.
- 수정 후 ignore 경계10개 PASS. 핵심3개는 추적 가능, cache·HTML·manifest·상태는 제외, 중첩 동명 경로·일반 소스는 제외되지 않는다.
- 임시 저장소에서 cache가 있어도 clean이다. 그래프·보고서·소스 수정과 새 미추적 파일은 실제 handoff 명령이 모두 거부했다(4/4).
- 기존 생성물193개의 내용 해시가 설정 변경 직후 동일했다. `PYTHONHASHSEED=0 graphify update .`는 스캔328개 변경 없음으로 종료0이었다.
- `graphify explain "scripts/dev.ts"`는 Realtime import와 자식 실행 연결을 반환했다. 갱신 후 그래프1142노드·2517연결이며 .local/.env/.secrets/.codex 소스 경로와 절대 소스 경로는0이다.
- 중앙 기본 Opus5.5/high 확인 후 프로젝트 지정 gemini-4-argon-high/high로 직접 리뷰했다. 응답 SUCCESS/PASS·결함0, conversation 54db8815-7a4b-4d41-a382-b8794d485d35다. 반환 JSON의 모델/effort 필드는 없어 서버 내부 모델은 독립 미검증이다.
- 실제 저장소 커밋 후 clean, 설치된 checkout 훅 실행 후 그래프·보고서 해시 동일과 clean을 확인했다. 기존193개 생성물의 누락은0이다.
- bdf0c3a 원격 일치·handoff --dry-run 성공 후 [자동 게시·댓글 재조회](https://github.com/krdn/gon-stock03/issues/83#issuecomment-6942353920)를 완료했다. 새 세션 생성은 하지 않았다.
- diff·상대 링크 PASS. STE는0 findings이나 규칙 적용 파일0 보고 한계가 있다. 원격 CI·통합 상태는 #83의 관련 PR에서 확인한다. 제품 코드·앱 실행·KIS 호출 변경은 없다.
