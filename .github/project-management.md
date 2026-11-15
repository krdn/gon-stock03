# GitHub 기능 적용

저장소: https://github.com/krdn/gon-stock03

| 기능 | 기준·적용 상태 |
| --- | --- |
| Code/docs | 설계·명세·ADR·압축된 인수인계 |
| Issues/sub-issues/dependencies | 작업 기준. 큰 작업에서 계층·차단 관계 연결 |
| Projects/Milestones/Labels | start가 첫 이슈·Milestone·Project를 연결. URL은 project-setup.json |
| Discussions | 탐색/협의. 비활성 시 이슈로 대체 |
| PR/Actions | 구성 파일 검사를 생성. 앱별 CI는 실제 스택으로 추가 |
| Releases/Deployments/Environments | 전달·운영 대상이 정해지면 구성. 미구성은 미배포 |
| Security/Dependabot | 스택별 취약점·의존성 갱신 정책 구성 |
| Rulesets/CODEOWNERS | 실제 권한·플랜 확인 후 적용 결과 기록 |
| Wiki | docs와 중복되지 않는 별도 용도가 있을 때만 사용 |
| Packages/Pages | 배포 제품이 해당할 때 사용 |
| Insights | 실제 이슈/PR/CI 결과 기반 현황 확인 |

설정 파일 존재와 기능 적용은 다르다. URL·검증 결과는 docs/STATE.md 또는 이슈에 기록한다.

## 이번 구현의 적용

- #1을 상위 요구로 재사용하고 #3(화면), #2(공통 기능)를 native 하위 이슈로 연결했다. [세션 계획](../docs/plans/interface-sessions-2026-11.md)에 15개 화면과 공통 작업의 실제 이슈를 연결했다.
- application workflow에서 실제 Node24 단위·계약·SQLite·TypeScript·빌드·Playwright 검사를 실행한다. 구성 CI와 분리한다.
- 단일 PC 로컬 실행이므로 Pages·Packages·Release·외부 Deployments는 현재 사용하지 않는다. Discussions/Wiki 대신 docs와 이슈를 사용한다.
- 기존 Project #25와 Milestone을 재사용한다. 사용자 결과 수용·실제 KIS 주문 검증 전 Done/이슈 종료를 하지 않는다.

## 2026-11-15 세션별 실행 관리

- 새 이슈 #5~#25: 화면 15개·공통 기능 4개·기준선·장중 실증. 기존 상위 이슈 3개를 포함한 Project 항목은 24개다.
- native 부모 관계 23개(#1 직속 4, #2 직속 4, #3 직속 15), blocked-by 52개를 API로 재조회했다. 계획은 순환이 없다.
- 기존 Status 옵션 ID를 보존하며 Ready·In Review·Blocked를 추가했다. Workstream과 Stage는 작업 종류와 개발 단계를 나타낸다.
- 전체 작업·진행 보드·다음 세션·화면 15개·공통/실증·검토 대기, 6개 보기를 저장했다. 다음 세션 후보는 #5다.
- 상태 갱신은 세션 종료 시 직접 확인한다. 자동 차단 해제·자동 수용·자동 완료 workflow는 구성하지 않았다.
- 연결 GitHub 앱의 이슈 작성은 403이었다. 기존 인증의 gh CLI/API로 등록했다. 공개 범위·권한·인증 설정은 변경하지 않았다.
- 초기 Milestone은 보존한다. 미정 일정을 만들어 넣지 않는다. 부모 행은 실행 이슈 완료율과 구분한다.
