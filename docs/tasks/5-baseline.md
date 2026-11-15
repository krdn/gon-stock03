# 후속 개발의 기준선 확정

기준: [이슈 #5](https://github.com/krdn/gon-stock03/issues/5) · [병합 PR #4](https://github.com/krdn/gon-stock03/pull/4) · [전체 계획](../plans/interface-sessions-2026-11.md)

2026-11-15 초기 기준선을 수용하고 PR #4를 정상 병합했다. 실제 통합 SHA는 `9b4b361fa4b476f296cdaf60e27ba915c3d521a7`다. 후속 세션은 이 기준선과 모든 선행 작업이 통합된 최신 `origin/main`에서 시작한다.

## 수용 근거와 범위

사용자 지시: “claude opus5.5를 사용하여 검증하고 통과하면 수용하고 병합해.”

실제 반환 `claude-opus-5-5 / high`가 검증 head `6e0bf0cfd4ce84b2c4bf966deec7c66ec5dea78d`에 **PASS, P0/P1 없음**을 반환했다. 이 조건부 승인에 따라 15개 초기 화면·탐색·설계실과 현재 로컬 DEMO를 후속 개발의 출발점으로 수용했다. 사용자 직접 화면 시험을 수행했다고 기록하지 않는다.

- 포함: PC/모바일 탐색, 합성 시세·계좌, 로컬 주문/취소·전략 재생·백테스트·위험관리·일지·저장, 설계실/프로젝트 지도.
- 별도 후속: 실제 KIS 주문·체결/부분체결, 웹 취소·불명 복구, WebSocket·연속 자동매매, 전체 시장 데이터와 최종 장중 통합 수용. #1/#2/#3은 OPEN으로 유지한다.
- [검증·리뷰 기록](../verification/2026-11-15-baseline.md)에 실제 모델·입력 해시·검토 한계와 비차단 P2 5건의 소유 이슈를 남겼다. 해당 지적의 실행 재현·수정은 미완료다.

## 검증과 통합

- 로컬 단위/계약/저장 23/23, Playwright 9/9, TypeScript strict·빌드 통과. 15화면 PC/모바일 탐색과 데모 주요 흐름, 대시보드·설계실·위험관리 axe 위반/미확정 0개를 확인했다.
- 검증 head의 PR/push application·configuration CI 모두 통과. 병합 직전 required configuration·미해결 대화 0·자동 종료 연결 0·head 일치를 확인했다.
- PR #4를 draft에서 해제하고 검증 SHA를 지정해 정상 merge했다. 통합 SHA의 [main 앱 CI](https://github.com/krdn/gon-stock03/actions/runs/43665121544)·[구성 CI](https://github.com/krdn/gon-stock03/actions/runs/43665121666)도 통과했다.
- 앱 코드는 이번 수용 세션에서 변경하지 않았다. KIS 비밀값 주입·주문 전송·새 개발 세션 실행도 하지 않았다.
- 문서 STE100 린트는 기존 표준 파일 부재로 실패했고 로컬 링크·diff 검사는 통과했다. graphify 후처리는 모듈 미설치로 미실행이다. 기능 브랜치에서 실패한 ready는 origin/main 임시 worktree에서 통과했다.

## 후속 실행

후속 #6~#25의 기준선 참조를 위 통합 SHA로 갱신했다. native 의존관계는 삭제하지 않는다. #5 completed와 통합 증거를 확인한 뒤 직접 후속 #6/#23/#24만 Ready로 전환하며, 최종 상태는 이슈·Project에서 확인한다. 나머지는 각 선행 조건을 따른다.

다음 권장 작업은 #6이다. 해당 이슈·필수 파일·최신 origin/main·관련 CI를 확인하고 작업 파일을 새로 만든다. 이번 세션에서는 후속 기능을 시작하지 않았다.
