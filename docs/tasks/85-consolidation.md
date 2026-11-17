# 작업: 전체 브랜치 통합과 새 세션 재개

[#85](https://github.com/krdn/gon-stock03/issues/85). 기준 main `849bef9`. 사용자 승인: 완료·잔여 기록 저장, 모든 작업 브랜치 통합, 병합 완료 브랜치 삭제.

- 조사: main 외 로컬29개·원격2개와 기존 worktree22개를 확인했다. 미커밋 소스/캡처는75-market-paper의18개뿐이다.
- 원본 보존: 전체 refs bundle·manifest와 미커밋 binary patch·파일 해시를 비공개 로컬 백업에 저장했다. 기존 원장을 포함한 무시 파일은 GitHub에 올리지 않는다.
- 통합: #75 원본을 그대로 커밋·푸시한 뒤 격리 worktree에서 최신 main과 병합한다. 제품은 최신 main을 유지한다. 고유 fixture8개는 별도 경로에 보존한다.
- 이력: 기존 squash PR의 정확한 head·merge commit 도달성을 검증한다. 확인된 원본만 내용 변경 없는 병합으로 연결해 최종 main의 조상으로 남긴다.
- 정리: 지정 리뷰·CI 후 merge commit 방식으로 통합한다. 삭제 직전 ref 이동·미커밋 변경을 재검사한다. 작업 폴더는 같은 커밋으로 detach해 보존하고 병합 확인 브랜치만 삭제한다.
- 완료 조건: 모든 기존 branch head 및 원본 snapshot이 원격 main에 도달, 제품 차이0, fixture8개 보존, 원격 CI PASS, 원래 작업 브랜치 정리, main 기준 재개·자동 전달 확인.
- 경계: 앱·원장·보유·백업·전역 훅·다른 작업 폴더 보존. 추가 KIS 호출·주문·구독·예약·새 세션 자동 시작 없음.

필수 자료: STATE, #75/#25 작업 파일, 이번 통합 manifest와 관련 PR/CI. 과거 전체 작업을 다시 읽지 않는다.
