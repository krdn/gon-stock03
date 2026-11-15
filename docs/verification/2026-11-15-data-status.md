# #15 데이터 상태 검증

기준: [이슈 #15](https://github.com/krdn/gon-stock03/issues/15), main `0ea629604c8e75acb0a253e5bcb4a6fbe77ae088`. 제품 SHA `b8645701b6ec0ec65e94c4897812304fbbc9424f`, [PR #39](https://github.com/krdn/gon-stock03/pull/39).

## 구현과 근거

`src/pages/DataInventory.tsx`는 C01 상태와 C02 저장 GET API를 사용한다. 공개 마스터, KIS 모의 일봉, DEMO 합성을 분리하며 수집·주문 POST를 실행하지 않는다. 조회 오류에서도 이전 자료·성공 시각을 보존한다. 일봉 선택을 바꾸면 이전 요청을 취소하고 늦은 응답을 버린다.

- 요청 기간, 응답 저장 구간, 미수집 구간과 실제 저장 거래일·봉 수를 구분한다.
- 수정주가/원주가, 수집 기준일, 최근 시도, 기록 전체 성공, 동일 종목·정책의 마지막 성공을 표시한다. 마지막 성공은 다른 요청 기간일 수 있음을 밝힌다.
- 누락·예상 밖 거래일·평일 후보·중복 제거·빈 응답을 표시한다. 대조 전 0을 누락 없음으로 해석하지 않도록 안내한다.
- 입력 달력 통과는 공식 달력 인증이 아니다. 수집시각을 마스터 기준 거래일로 바꾸지 않는다. 합성 120봉은 실제 과거가 아니다.

2026-11-15 공식 예제 재확인: [일봉](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_daily_itemchartprice/inquire_daily_itemchartprice.py)의 최대100건·KRX·조정 옵션, [당일분봉](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_time_itemchartprice/inquire_time_itemchartprice.py)의 최대30건·전일 미제공, [마스터](https://github.com/koreainvestment/open-trading-api/blob/main/stocks_info/kis_kospi_code_mst.py)의 다운로드·파싱 계약. start-context와 implementation-ready PASS는 준비 기록이며 실호출 성공을 대신하지 않는다.

## 실행 검증

| 검사 | 결과·범위 |
| --- | --- |
| `npm test` | 71/71 PASS. 신규 검사는 실제 Store·MarketData·HTTP GET과 화면 응답 계약을 대조한다. 후속 수집 실패 때 이전 성공을 보존하고 GET이 KIS를 호출하지 않음을 확인한다. |
| `npm run build` | PASS. TypeScript와 Vite. |
| `npm run test:e2e` | 57/57 PASS. 전체 화면·명세·모바일 및 기존 매매 회귀 포함. 모의 네트워크·격리 저장소 검사이며 실제 주문 증거가 아니다. |
| #15 브라우저 검사 | 7/7 PASS. 출처·부분 수집·누락·달력 불일치·빈 구간·이전 성공 보존·미수집/오류·비JSON/불량 응답·ID 불일치·늦은 응답 폐기·오래됨·390px 화면. 화면 조회 POST 0건. |
| 공개 마스터 실조회 | 2026-11-15 11:22:53 UTC, 격리된 메모리 Store에서 KOSPI2128 + KOSDAQ1834 = **3962**종목. 두 시장 ready, 성공 시각 존재. GET schema 통과. 일봉 저장은 0건이며 KIS 계좌·일봉 요청은 하지 않았다. |
| 준비·차이 검사 | `gon-workflow ready`·`implementation-ready`·`git diff --check` PASS. |
| 문서 검사 | STE strict는 `docs/conventions/ste100-writing.md` 부재로 실패(exit 2). graphify 실행 파일 부재. 변경 Markdown 상대 링크는 PASS. |

처음에는 기존 화면에 실제 수집 상세가 없어 브라우저 검사 RED를 확인했다. 응답 schema를 기존 계약 파일에 넣었을 때 순환 import가 발생해 독립 `shared/data-inventory.ts`로 옮겼다. 단위·빌드·브라우저 재실행으로 해결을 확인했다. 모바일 사이드바는 화면 밖 배치이므로 viewport 검사로 확인하며, 다른 종목 fixture는 코드·조정정책을 맞췄다.

[데스크톱](assets/2026-11-15-data-desktop.png) · [모바일](assets/2026-11-15-data-mobile.png): 결정적 fixture를 렌더링한 검사 이미지다. 실제 계좌·실제 수집 결과나 사용자 직접 육안 수용 증거가 아니다.

## 경계 리뷰

중앙 설정·dry-run은 Claude Opus5.5/high, Gemini 기본은 Flash였다. 사용자 지정에 따라 `agy models`에서 확인한 `gemini-4-argon-high`와 `--effort high`로 새 리뷰를 실행했다. 중앙 설정은 바꾸지 않았다. 요청 모델과 init 모델은 일치하고 결과 status SUCCESS, 프로세스 exit0, 판정 **PASS**다. init에는 effort 및 서버 모델의 독립 메타데이터가 없어 서버 모델·effort까지 확인했다고 주장하지 않는다. 리뷰는 제공 코드·테스트·문서 범위이며 이미지 직접 검수는 아니다.

- Low 1: 목록만 실패하고 상세만 갱신되면 마지막 전체 성공이 뒤처지는 경우를 브라우저 RED로 재현했다. 상세 run도 성공 시각 후보에 포함해 수정했다.
- Low 2: 최초 0봉을 `수집 전`·`저장 없음`으로 표시하도록 수정하고 RED 회귀를 남겼다. 부분·달력 미검증 자료는 저장 스냅샷이며 최신이라는 뜻이 아니다.
- Optional 날짜 정렬·고유성 추가 검사는 Store와 C02가 이미 보장하므로 중복 구현하지 않았다.
- 수정분만 같은 Argon/high로 한 번 후속 검토해 **PASS**를 받았다. 요청/init 모델 일치, SUCCESS·exit0를 확인했다. 서버 모델·effort 독립 확인 한계는 동일하다.

최초 CLI 요청은 timeout 단위 누락과 `-p` 인자 누락으로 실행 전 실패(exit2)했다. 실행기와 같은 stream-json 입력 및 `180s`로 고쳤다. 이 실패를 모델 응답으로 취급하지 않는다. 최초 리뷰 입력 SHA256: `b978e3f9b3127302c843d78f41bbdad7a074398e70ee6dd3fe06afbddbb334b1`.

## 이번 화면 수용 형태와 원격 기록

제품 SHA `b8645701b6ec0ec65e94c4897812304fbbc9424f`의 CI: [PR 앱43709329404](https://github.com/krdn/gon-stock03/actions/runs/43709329404), [PR 구성43709329397](https://github.com/krdn/gon-stock03/actions/runs/43709329397), [push 앱43709274587](https://github.com/krdn/gon-stock03/actions/runs/43709274587), [push 구성43709274900](https://github.com/krdn/gon-stock03/actions/runs/43709274900) 모두 SUCCESS. 최종 문서 HEAD의 CI와 인계 댓글은 PR checks·이슈에서 확인한다.

clean clone에서 기준 main ready와 작업 브랜치 handoff dry-run이 통과했다. ready를 작업 브랜치에서 실행한 최초 시도는 기본 브랜치 SHA 불일치로 실패했다. 단일 브랜치 clone의 main fetch refspec을 추가한 뒤 main에서 재확인했다. 원래 저장소의 사용자 설정은 변경하지 않았다. GitHub 연결 도구의 PR·이슈 쓰기 403은 중복 확인 후 기존 인증된 gh로 처리했다.

이번 지시는 #15 구현·검증·PR/CI·원격 인계까지다. 대상 제품 SHA에 대한 사용자 직접 화면 수용 답변은 아직 없다. 직접 육안·장중 수용이나 통합 완료로 표현하지 않는다. CI·지정 모델 결과를 근거로 검토 가능한 PR을 전달하고 #15는 In Review로 둔다.

실제 KIS 기간별 일봉·공식 달력 대조는 미검증이다. #7 공개 마스터3962 검증과 구분한다. #8 Fable 한도 오류, STE 기준 파일·graphify 부재를 유지한다. WebSocket은 C04, 장중 통합·주문/체결/취소/불명 복구·연속 전략은 V01 및 관련 이슈의 별도 범위다. 이 작업에는 해당 실행 승인이 없다.
