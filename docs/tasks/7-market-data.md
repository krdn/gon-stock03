# 작업: 국내 종목 마스터·일봉 수집

기준 이슈: https://github.com/krdn/gon-stock03/issues/7

- 상태: 검증 대기 / Project In Review. [PR #29](https://github.com/krdn/gon-stock03/pull/29), `feat/7-market-data`, 시작 SHA `d898eec1998d1d30eef11d45366a55184102876d`, 구현 SHA `1aeca9b0430aabb5ab779c339a94cafcbc52ef52`.
- 완료 조건: 종목코드 선행 0, 기간 경계·중복·누락 검사, 중단 후 재개, 출처·거래일·수집시각·조정정책 저장.
- 범위: C02 공통 수집·저장·조회 API. 화면 연결은 #10/#15/#21, #8·주문·취소·전략·장중 실증은 제외한다.
- 선행: 2026-11-15 #6 native closed/completed, 병합 `8b280229`의 origin/main 포함 확인. 시작 SHA 앱·구성 CI 성공, #7 Ready 확인 후 In Progress로 변경. `gon-workflow ready .` 통과.
- 소유권: 부모가 실제 Herdr 탭·현재 세션을 확인하고 이 세션에 #7 구현·PR·CI를 지시했다. 부모는 저장소 수정을 중단했다.

## 먼저 읽을 자료

- 이슈 #7, 계획 `docs/plans/interface-sessions-2026-11.md` C02 행·Project 운영·세션 종료.
- `server/kis.ts` 공통 요청·일봉, `server/store.ts`, `shared/model.ts`.
- 공식 계약과 결정: `docs/start-context.json`의 `task_context`.

## 구현 결정

100건 상한보다 작은 90달력일 구간을 사용한다. 한 step은 한 구간만 호출하며 저장과 다음 커서를 같은 트랜잭션으로 커밋한다. 제한·중단 시 그 구간을 다시 요청한다. 수집 ID별 봉을 분리해 다른 수집시점의 수정주가를 덮어 합치지 않는다. 날짜가 바뀐 수집은 새 ID로 전체 재수집한다.

마스터는 공식 KOSPI/KOSDAQ 파일에서 국내 상장 주식·ETF를 추출한다. 두 시장 전체 검증 후 한 트랜잭션으로 교체하며 하나라도 실패하면 이전 성공 데이터 전체를 남긴다. TLS 검증을 끄지 않는다.

휴장일·상장/정지 이력 없이 평일 공백을 누락으로 확정하지 않는다. 선택 입력 달력의 출처와 기대 거래일을 보존하고 누락·예상 밖 날짜를 대조한다. 달력 미제공은 품질 미검증이며 거래 가능성·성과를 뜻하지 않는다.

## 현재 결과

- `gon-workflow implementation-ready .` 통과. 마스터·기간별 일봉의 저장·조회·부분완료 재개 API를 구현했다. [사용법과 품질 정책](../operations/market-data.md).
- `npm test` 51/51, TypeScript·빌드, 기존 브라우저 21/21 성공. [검증 근거](../verification/2026-11-15-market-data.md).
- 실제 공개 마스터 3962종목을 임시 메모리 DB에서 검증했다. KIS 인증값이 없어 실제 기간별 일봉·달력 조회는 미검증이다. Opus 수정분 리뷰 PASS. 그 후 발견한 호출 간격 결함은 재현·직접 검증했고 외부 재리뷰 대상은 아니다.
- 구현 SHA의 [PR application CI](https://github.com/krdn/gon-stock03/actions/runs/43674283668)·[configuration CI](https://github.com/krdn/gon-stock03/actions/runs/43674283728) 성공. 원격 브랜치 SHA 일치. 이슈 #7 OPEN, In Review이며 사용자 수용·main 통합은 남아 있다.
- 초기 sandbox의 git fetch/GitHub CLI 접근은 차단되어 승인된 실행 경로로 재실행했다. 최신 조회는 성공했다.
- GitHub 연결 도구의 PR 생성 403은 인증된 gh CLI로 해결했다. STE 기준 파일과 graphify Python 환경 부재는 미검증으로 남긴다.
- 작업 중 나타난 미추적 `.codex/config.toml`은 수정·스테이징하지 않았다. 이 파일로 원래 작업 트리의 handoff dry-run이 거부됐다. 최종 인계는 커밋된 파일만 있는 별도 작업 트리에서 검증한다.

## 다음 행동

PR #29 최신 head·required CI·리뷰 및 사용자 피드백을 확인한 뒤 허용된 통합 행동을 진행한다. #7을 아직 completed/Done으로 바꾸거나 #10/#15/#21의 선행을 해제하지 않는다. #8 구현은 시작하지 않았다.
