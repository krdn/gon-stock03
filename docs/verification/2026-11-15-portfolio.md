# #16 포트폴리오 검증

기준: `daa01baa65f94cb5c9e1497a28fa8c2ff71938e9` → `feat/16-portfolio`. [이슈 #16](https://github.com/krdn/gon-stock03/issues/16)의 환경별 잔고 조회 화면만 변경했다.

## 결과와 계산 기준

KIS 모의와 로컬 DEMO를 선택해 표시한다. 기존 C01 잔고 조회·페이지·토큰·호출제한·이전 전체 성공값 보존을 사용한다. 주문·취소·전략 경로는 실행하지 않았다.

- 보유수량 0은 제외한다. 평가액은 수량×현재가, 평가손익은 평가액−평균매입가×수량이며 수수료 전이다.
- 화면 총 평가자산은 예수금+보유 평가액, 비중은 해당 평가액÷화면 총 평가자산이다. 예수금은 주문 가능 금액이 아니다.
- [KIS 공식 잔고 예제](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_balance/inquire_balance.py)의 모의20건 연속조회·0수량 규칙을 재확인했다. [공식 필드 매핑](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_balance/chk_inquire_balance.py)은 예수금·총평가금액·정산금액을 별도로 제공한다. 따라서 화면 계산과 API 총평가금액을 동일한 정의라고 가정하지 않고 후자는 별도 참고값으로 표시한다.
- 현재가 누락·빈값·null·0은 평가 불가다. 잘못된 숫자 문자열·음수는 계약 오류를 유지한다. 가격 누락 시 해당 손익, 전체 평가 합계·손익·비중을 산출하지 않는다. 총자산0도 비중 없음으로 표시한다.
- 부분실패·오래됨·재조회 중에는 이전 전체 성공값임을 표시한다. 최초 조회 전에는 0잔고를 만들지 않는다.

## 실행 증거

| 검사 | 결과 |
| --- | --- |
| 선행·기준 main | #6·#8 completed·통합, #16 Ready 확인. 앱43702990997·구성43702990969 SUCCESS, `gon-workflow ready` PASS |
| 구현 준비 | 공식 자료 갱신 후 `gon-workflow implementation-ready` PASS |
| 단위 | `npm test`: 70/70 PASS. 실제 공통 서비스의 여러 페이지 합산·현금 중복 방지·0수량·가격 누락·오류 시 이전 잔고 보존, 계산식·비중·총자산0 검사 |
| 빌드 | `npm run build` PASS |
| 브라우저 | `npm run test:e2e`: 49/49 PASS. 최초 신규4개로 환경 분리·수동 조회·로딩/부분실패/오래됨/복구·평가불가/0자산·상세 이동·390px 레이아웃 검사. 후속 소수 평균가 회귀 추가 후 포트폴리오5/5·빌드 PASS. 제품 최종 SHA `ac099ef`의 원격 CI에서 전체50/50 PASS |
| 실제 조회 | 2026-11-15 19:21 KST. Infisical `dev /kis` 주입, 메모리 DB의 별도 서버4316에서 UI 버튼으로 `/api/kis/check` 1회. 전체1페이지·보유0건·요약 표시, 브라우저 오류0. POST는 조회 경로만 관측 |
| 화면 | 에이전트가 1440px·390px 렌더링을 확인했다. [데스크톱](assets/16-portfolio-desktop.png)·[모바일](assets/16-portfolio-mobile.png)은 합성 테스트 데이터다. 실제 계좌 화면은 공개 저장소에 게시하지 않는다 |
| 문서 | `git diff --check` PASS. 상대 링크12개 누락0. STE strict는 기준 파일 `docs/conventions/ste100-writing.md` 부재로 exit2, 통과가 아니다. graphify 환경 부재 미검증 유지 |

## 원격 전달과 수용 대상

- [PR #37](https://github.com/krdn/gon-stock03/pull/37), 제품 수용 대상 `ac099efe3a9164e03c070bedbe939905277d59aa`. 이후 기록 커밋은 제품 코드를 바꾸지 않는다.
- 제품 SHA의 [PR 앱 CI](https://github.com/krdn/gon-stock03/actions/runs/43704203859)·[구성 CI](https://github.com/krdn/gon-stock03/actions/runs/43704203812) SUCCESS. 브랜치 push 앱43704200865·구성43704200916도 SUCCESS.
- 기존 `.codex/` 때문에 루트 handoff는 미커밋 변경으로 차단됐다. 사용자 설정을 보존하고 원격 브랜치의 깨끗한 복제본에서 handoff dry-run을 통과했다.
- `ready`는 HEAD와 원격 기본 브랜치의 동일성을 요구한다. 미통합 작업 브랜치에서의 불일치 오류와 기준 main `daa01ba`에서의 PASS를 구분한다. 최종 인계 댓글은 PR HEAD 기록 커밋을 기준으로 게시한다.
- #16은 OPEN·Project In Review. 화면 수용 답변과 통합은 대기다.

## 실패와 보완

첫 검사에서 가격 누락 응답이 계약 오류로 끝나고 환경 선택 버튼이 없어 실패했다. 계약·화면 구현 후 해당 검사가 통과했다. 기존 DEMO 체결 회귀는 새 기본 환경이 KIS 모의이므로 DEMO를 명시 선택하도록 바꿨고 31주 반영 검사를 유지했다. 모바일 캡처는 기존 메뉴 전환 애니메이션 완료 후 찍도록 안정화했다. 마감 점검에서 평균매입가100.5가101로 표시되어 수량2·현재가150의 손익99원과 화면상 수식을 대조하기 어려운 사례를 재현했다. 평균가의 소수 자릿수를 유지하고 손익은 원본 평균가·비용 전·원 단위 반올림임을 명시했다. 해당 브라우저 회귀는 수정 전 실패, 수정 후 통과했다.

## 독립 리뷰와 수용 경계

외부 리뷰: **PASS**, 구체적 결함 없음. 작업 파일의 착수 시점 문구를 최신 결과로 맞추라는 비차단 메모를 반영했다. 중앙 설정·dry-run은 Claude Opus5.5/high, Gemini 비교 기본은 Flash다. 사용자가 지정한 Argon을 사용하기 위해 `agy models`의 지원 ID `gemini-4-argon-high`와 `--effort high`를 명시한다. 중앙 기본을 대체하지 않았다. 요청과 초기화 이벤트의 모델 ID는 일치했으며 실행은 정상 종료했다. 초기화 이벤트에는 effort가 없고 서버 모델·effort를 독립 확인하는 메타데이터도 없어 그 확인까지 주장하지 않는다. 리뷰는 코드·테스트 검토이며 이미지 직접 검수는 하지 않았다. 이후 평균매입가 표시 수정분만 같은 Argon/high로 한 번 더 검토해 PASS를 받았으며 요청/초기화 ID 일치와 메타데이터 한계는 동일하다.

화면 수용 형태는 이번 진행 지시에 따른 에이전트 구현·검증 결과 제출이다. 변경 SHA·PR/CI 확인 후 사용자 결과 수용·통합을 별도로 기록한다. 사용자 직접 육안 답변과 장중 통합 수용은 아직 없다. 실제 잔고가 0종목이므로 여러 보유종목·여러 페이지·가격 누락은 결정적 테스트 증거이며 실제 계좌로 실증한 것이 아니다.

실제 주문·체결·웹취소·응답 불명 복구·연속 전략·V01 장중 수용은 미검증이다. #7 공개 마스터3962종목 검증과 실제 KIS 기간별 일봉·공식 달력 대조 미검증을 구분한다. #8 Fable 한도 오류와 기존 검증 경계는 그대로다.

## 이번 계속 진행 지시와 수용·통합

2026-11-15 사용자는 컨텍스트·다음 작업을 점검하고 필요하면 새 Herdr 세션에서 이어가며 Fable5.2 또는 Gemini4Argon으로 검증하라고 요청했다. 이 계속 진행 지시와 이 세션의 Argon 본 리뷰·수정분 PASS, 대상 제품 `ac099ef` 및 최종 기록 `78980f3`의 CI 성공에 따라 PR #37을 통합했다. 수용 형태는 에이전트 검증에 근거한 작업 진행·통합 판단이며 사용자 직접 육안 수용 답변 또는 V01 장중 수용이 아니다.

통합 커밋은 `c54061266d7124f498307bde4c54a394ca92f19a`다. 통합된 제품 파일이 검증 대상과 동일함을 `git diff 78980f3 c540612 -- src server shared tests package.json package-lock.json`의 차이 없음으로 확인했다. main 앱43707224025·구성43707223572 SUCCESS를 확인했다. #16 completed/Project Done을 확인했다. 인계 기록을 main에 반영한다.

다음 작업은 #15 데이터 상태다. native 선행 #6·#7 completed 및 Project Ready를 다시 확인했다. 새 세션 `01a1dee2-7db7-7dd0-8f32-595cb38802f7`은 경로·ID 확인 후 대기 중이며, Herdr 탭 `tbb130fad3bfaab56df0a031cd0690d234`·terminal `t6y`에서 동일 세션 ID·프로젝트 경로·Ready 입력창 렌더링을 확인했다. 최초 다른 앱 잠금 표시는 준비 세션을 보관/복원한 뒤 재연결해 해소했다. 최종 기록 main CI 확인 전에는 구현을 시작하지 않는다.
