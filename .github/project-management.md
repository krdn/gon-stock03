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

- #1을 상위 요구로 재사용하고 #3(화면), #2(기능)를 본문 링크로 연결했다. native sub-issue/dependency 구성은 아직 미확인이다.
- application workflow에서 실제 Node24 단위·계약·SQLite·TypeScript·빌드·Playwright 검사를 실행한다. 구성 CI와 분리한다.
- 단일 PC 로컬 실행이므로 Pages·Packages·Release·외부 Deployments는 현재 사용하지 않는다. Discussions/Wiki 대신 docs와 이슈를 사용한다.
- 기존 Project #25와 Milestone을 재사용한다. 사용자 결과 수용·실제 KIS 주문 검증 전 Done/이슈 종료를 하지 않는다.
