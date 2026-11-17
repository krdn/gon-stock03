# 작업: Graphify 활용과 자동 인수인계 복구

[#83](https://github.com/krdn/gon-stock03/issues/83). 사용자 선택은 핵심 그래프·보고서 Git 추적, 캐시 제외다.

- 원인: 전역 post-commit/post-checkout 훅의 graphify-out 생성물 전부가 미추적 상태다. 중앙 verified_checkpoint는 git status --porcelain --untracked-files=all 결과를 정상 차단한다.
- 설계: graph.json·GRAPH_REPORT.md와 저장소별 .skip-hook만 추적한다. 캐시·HTML·manifest·로컬 빌드/라벨 상태는 제외한다. 전역 훅·중앙 dirty 검사는 변경하지 않는다.
- 활용: 기존 그래프로 연관 경로를 찾고 원문과 대조한다. 소스 변경 후 graphify update .를 실행하고 코드와 결과를 함께 커밋한다. 전달 전에 원격 SHA와 clean 상태를 검증한다.
- 완료 조건: 수정 전 거부 재현, 결과/캐시 구분·실제 작업 파일 감지 유지, 그래프 조회·갱신·보존 확인, 훅 실행 후 clean, 지정 리뷰·CI·통합, 실제 자동 전달 및 원격 댓글 재조회 성공.
- 경계: 다른 worktree·기존 파일·전역 훅·중앙 도구·앱·원장 보존. KIS 호출·주문·재시작 없음.
- 근거: [Git ignore 규칙](https://git-scm.com/docs/gitignore), 설치된 post-commit/post-checkout의 .skip-hook 조건, workflow.py의 verified_checkpoint. 작업 후 결과를 이 파일에 기록한다.
