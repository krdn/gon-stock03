# #7 수집·품질 검증

기준: `d898eec1998d1d30eef11d45366a55184102876d`, 작업 브랜치 `feat/7-market-data`. 범위와 사용법은 [작업 기록](../tasks/7-market-data.md)·[API 계약](../operations/market-data.md)을 따른다.

## 로컬 검증

- 새 API 구현 전 `tests/market-data.test.ts`가 `400 != 200`으로 실패했다. 구현 후 수집·429 중단·동일 ID 재개·DEMO 보존을 통과했다.
- 추가 검사에서 잘못된 날짜의 `RangeError`와 서울 자정 이후 결과 저장을 재현했다. 날짜 검증과 저장 전 날짜 확인을 보완한 뒤 통과했다.
- `npm test`: 51/51 성공. 마스터 수집 중단의 시작 상태 누락도 RED→GREEN으로 보완했다. 마스터 CP949·선행 0·ETF·영문 코드·중복 거부·시장 원자성, 일봉 범위·윤년·OHLCV·중복·빈 응답·달력 대조·재시작·트랜잭션 롤백·동시성·자정 검사를 포함한다.
- `npm run build`: TypeScript·Vite 성공.
- `npm run test:e2e`: 기존 화면 21/21 성공. 새 UI를 추가한 것은 아니다.
- `git diff --check`: 성공. 변경 문서 4개의 상대 링크 검사 성공.
- `evolve docs ste-lint --strict --changed refs/remotes/origin/main --added`: exit 2. `docs/conventions/ste100-writing.md`가 없어 미검증이며 통과로 처리하지 않는다.
- 구현 커밋의 graphify hook은 설치된 Python 환경을 찾지 못했다. Git 커밋은 성공했으나 graphify 검증 성공은 아니다.

## 실제 공개 마스터

2026-11-15 03:37 UTC와 전체 원자 교체 수정 후 03:48 UTC, 실제 `MarketData.refreshMaster()`와 메모리 SQLite로 다운로드·압축 해제·파싱·저장을 수행했다. 인증값 없는 `KisClient`를 사용했고 주문 경로는 호출하지 않았다.

| 시장 | 보존 종목 수 | 압축 해제 원문 SHA-256 |
| --- | ---: | --- |
| KOSPI | 2128 | `7c13a23897f5ae09a40fb1cb7fde735c95e5bb7c1b1b87bd143b0e30ca4e492c` |
| KOSDAQ | 1834 | `457348c86a088f69727a37111326849c1074773a9ac890ef386c64a64a75e7d2` |

합계 3962종목. `005930` 삼성전자·`000660` SK하이닉스는 KOSPI 주식, `069500` KODEX 200은 ETF로 확인했다. 이 수치는 수집 당시 파일의 관측이며 전체 과거 상장종목 수가 아니다. 운영 DB에는 이 검증 데이터를 주입하지 않았다.

## 미검증과 리뷰

현재 세션의 KIS 필수 환경변수는 미구성이다. 새 기간별 일봉의 실제 계좌 호출과 실제 달력 대조는 수행하지 않았다. 일봉 테스트는 네트워크 응답 fixture를 사용하고 실제 파서·서비스·SQLite·HTTP 경로를 실행했다. fixture ZIP은 테스트용 한국어·주식·ETF·제외 그룹을 담은 합성 파일이다.

사용자 수용·main 통합·실제 주문·체결·취소·전략·장중 실증은 이 검증 결과에 포함하지 않는다.

## 외부 리뷰

중앙 `review-llm --dry-run` 설정은 Claude Opus 5.5/high다. 1차 실제 반환 `modelUsage.claude-opus-5-5`, session `390a9abb-12ff-4470-beef-ea48f1d08d3c`, 실행 성공. **1차 판정은 PASS가 아니며** P2 1건과 P3 2건을 받았다.

- P2 시장 이전: 시장별 교체에서 KOSDAQ→KOSPI 이전 코드가 PK 충돌 후 소실되는 문제를 수용했다. 두 시장 전체를 같은 트랜잭션에서 교체하도록 변경했다. 하나라도 실패하면 이전 전체 목록과 성공 시각을 보존한다.
- P3 0원 봉: 종가 0과 거래 봉의 O/H/L 0을 거부한다. 거래량 0·O/H/L 0·양수 종가인 정지 형태만 보존한다.
- P3 원인 은폐: 안전한 KIS 요청 오류와 원천 계약 오류, 저장 실패를 구분해 안내한다. 원천 품질 오류에 단순 반복 재개를 권하지 않는다.
- 리뷰 당시 코드 사본을 `/tmp`에서 실행해 시장 이전 소실(`undefined != KOSPI`)과 0원 봉 허용(`Missing expected rejection`) 두 실패를 재현했다. 수정된 저장소의 회귀는 통과했다.
- 별도 직접 점검으로 마스터 수집 시작 상태를 원자 저장하고 재시작 시 error로 남기도록 보완했다. 단일 서버 프로세스, 품질 종료 상태 해석, KONEX·FE 제외를 문서화했다.

수정분 후속 실제 반환 `claude-opus-5-5 / high`, session `b80d5537-58f4-4dd4-bfbe-9df5ffb7ece2`: **PASS**, P0~P3 없음. 이 판정은 후속 입력에 포함된 50개 검사 시점의 변경을 대상으로 한다.

후속 리뷰 뒤 최종 검사에서 기존 호출 간격 검사가 실패했고 분리 실행도 실패했다. 느린 전송 직전 검사 뒤 다음 일봉 호출의 간격이 20ms 설정에서 3ms가 되는 증상을 별도 회귀로 재현했다. 실제 transport 직전에 기준 시각을 기록하고 타이머 대기 후 남은 간격을 재확인하도록 보완했다. 최종 단위51/51·빌드와 간격 회귀를 직접 확인했다. 이 마지막 간격 보완은 외부 리뷰 대상에 포함되지 않았으며 지침의 반복 리뷰 제한에 따라 세 번째 호출은 하지 않았다.

## 원격 확인

[PR #29](https://github.com/krdn/gon-stock03/pull/29), 구현 SHA `1aeca9b0430aabb5ab779c339a94cafcbc52ef52`를 origin에 저장하고 SHA 일치를 확인했다. 해당 SHA의 PR [Application checks](https://github.com/krdn/gon-stock03/actions/runs/43674283668)와 [Workflow configuration](https://github.com/krdn/gon-stock03/actions/runs/43674283728)은 SUCCESS다. 원격 앱 검사에는 단위·빌드·브라우저 검사가 모두 포함됐다.

이슈 #7은 OPEN / Project In Review다. 이 기록의 후속 문서 커밋은 PR 최신 CI와 이슈 인계 댓글에서 별도로 확인한다. main 병합과 사용자 수용을 수행했다고 기록하지 않는다.
