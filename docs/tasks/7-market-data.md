# 작업: 국내 종목 마스터·일봉 수집

기준 이슈: https://github.com/krdn/gon-stock03/issues/7

- 상태: completed / Project Done. [PR #29](https://github.com/krdn/gon-stock03/pull/29), 최종 head `4fc807be8e5080f314759153acc589280a8eee09`, 병합 SHA `bc813848bc2059f91c99f028b01d91bf0b3ee9f3`. 구현 시작 SHA `d898eec1998d1d30eef11d45366a55184102876d`, 구현 SHA `1aeca9b0430aabb5ab779c339a94cafcbc52ef52`.
- 완료 조건: 종목코드 선행 0, 기간 경계·중복·누락 검사, 중단 후 재개, 출처·거래일·수집시각·조정정책 저장.
- 범위: C02 공통 수집·저장·조회 API. 화면 연결은 #10/#15/#21, #8·주문·취소·전략·장중 실증은 제외한다.
- 선행: 2026-11-15 #6 native closed/completed, 병합 `8b280229`의 origin/main 포함 확인. 시작 SHA 앱·구성 CI 성공, #7 Ready 확인 후 In Progress로 변경. `gon-workflow ready .` 통과.
- 소유권: 부모가 Herdr 탭 `#7 PR29 통합 마무리`, terminal `t6q`, session `01a1dd60-be38-77f2-863e-8c1b0e073036`과 이 저장소 경로·렌더링 일치를 확인했다. 부모는 저장소 수정을 중단했고 이 세션이 통합을 소유했다.

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
- 구현 SHA의 [PR application CI](https://github.com/krdn/gon-stock03/actions/runs/43674283668)·[configuration CI](https://github.com/krdn/gon-stock03/actions/runs/43674283728) 성공. 원격 브랜치 SHA 일치. 최종 head·main 통합 결과는 아래 기록을 따른다.
- 초기 sandbox의 git fetch/GitHub CLI 접근은 차단되어 승인된 실행 경로로 재실행했다. 최신 조회는 성공했다.
- GitHub 연결 도구의 PR 생성 403은 인증된 gh CLI로 해결했다. STE 기준 파일과 graphify Python 환경 부재는 미검증으로 남긴다.
- 작업 중 나타난 미추적 `.codex/config.toml`은 수정·스테이징하지 않았다. 이 파일로 구현 세션의 원래 작업 트리 handoff dry-run이 거부됐다. 통합 기록도 별도 작업 트리에서 커밋·푸시하고 인계한다.

## 통합 결과 — 2026-11-15

- 사용자 요청 “herdr-app에 새로운 탭을 생성하고 새 새션에서 다음 작업을 진행해”와 탭 확인 후 전달된 “#7 PR #29 통합 마무리를 진행하라”를 실행 근거로 삼았다. 별도 사용자 수용 발언은 만들지 않았다. [진행 지시·사전 확인](https://github.com/krdn/gon-stock03/pull/29#issuecomment-6888957047).
- 최종 head `4fc807b`: 필수 configuration·application SUCCESS, MERGEABLE/CLEAN, 리뷰 제출·미해결 대화 없음. native #6 closed/completed·Project Done과 병합 `8b280229`의 origin/main 포함을 재확인했다.
- 정상 PR 병합 후 `bc81384`와 PR 최종 tree가 동일함을 확인했다. main [application CI](https://github.com/krdn/gon-stock03/actions/runs/43675380668)·[configuration CI](https://github.com/krdn/gon-stock03/actions/runs/43675380680) SUCCESS. 실제 main 로그에서 단위51/51·브라우저21/21·TypeScript/빌드를 확인했다. 통합 중 제품 코드는 변경하지 않았다.
- #7의 계약·회귀·저장 범위 완료 조건을 체크하고 closed/completed·Project Done을 재조회했다. 실제 KIS 기간별 일봉·달력, 화면 수용·주문·취소·전략·장중 실증은 이 완료 범위 밖이다. 기존 STE·graphify 미검증도 보존한다.
- native 관계를 보존하고 모든 선행 #6/#7이 완료된 #10·#15를 Ready로 갱신·재조회했다. #21은 #7이 완료됐지만 #15가 OPEN이므로 Blocked를 유지했다. #8·#23·#24는 Ready이며 새 구현은 시작하지 않았다.
- GitHub 연결 도구의 댓글 쓰기 403은 인증된 `gh`로 처리했다. 설치된 `gh`의 미지원 JSON 옵션은 지원 명령·REST 조회로 대체했다. 실패를 검증 통과로 기록하지 않았다.
- 통합 기록 문서 3개의 상대 링크 11개와 `git diff --check`를 확인했다. STE lint 재실행도 기준 파일 부재로 exit 2이며 미검증이다. 문서·상태 갱신만 수행했으므로 기존 외부 리뷰를 반복하지 않았다.

## 다음 행동

다음 세션은 STATE와 선택한 Ready 이슈의 필수 파일·native 선행·최신 main/CI를 확인한다. #8 등 다음 구현은 별도 지시에 따라 한 이슈씩 진행한다. KIS 실제 일봉·달력 연결 및 화면 검증 때 위 미검증을 다시 확인한다.
