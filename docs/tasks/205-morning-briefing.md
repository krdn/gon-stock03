# 작업: 장전 공개 원문 분석 브리핑 신뢰·UX 개선 (Step 0) 및 A2UI 조건부 게이트

기준 이슈: https://github.com/krdn/gon-stock03/issues/205
설계 문서: [A2UI 장전 브리핑 계획](../plans/a2ui-morning-briefing.md)

- 상태: 검증 대기 (Claude Opus 5.5 + Codex Astra 6.2 재리뷰 PASS, PR·CI 확인)
- 목표·완료 조건: 3자 협의(Codex Astra 6.2 · Claude Opus 5.5 · Gemini) 결과에 따라 장전 공개 원문 분석의 신뢰·UX 결함 6건을 고정 계약·UI(Step 0)로 해결하고, A2UI v1.0 최소 서브셋(Step 1)의 조건부 진입 게이트를 문서화한다.
- 허용된 작업·제외 범위: `shared/morning.ts`, `server/morning-analysis.ts`, `server/morning.ts`, `server/realtime.ts`, `server/http.ts`, `src/components/MorningPortfolio.tsx`, `src/pages/portfolio.css`, `tests/morning.test.ts`, `tests/browser/morning.spec.ts`, 관련 `docs/`. 기존 15개 화면·매매 설정·주문/위험/승인 안전 경계 변경, `@a2ui/*` 공식 패키지 도입, Step 1 구현 제외.
- 선행 작업·의존관계: [#197](https://github.com/krdn/gon-stock03/issues/197), [#199](https://github.com/krdn/gon-stock03/issues/199)
- 이슈 / PR: [#205](https://github.com/krdn/gon-stock03/issues/205) / [#206](https://github.com/krdn/gon-stock03/pull/206)
- 작업 브랜치 / 마지막 확인 SHA: `feat/205-morning-briefing-step0` (`11e5719`, 기준 `e41fd23`)

## 먼저 읽을 자료

- [설계 계획](../plans/a2ui-morning-briefing.md)
- `shared/morning.ts` (`reportApprovalBlocked`, `canonicalSourceUrl`, `sourceInstitutionId`, `isIndependentCounter`, `matchCandidateCodesInText`, `resolveViewCandidateCodes`)
- `server/morning-analysis.ts` (`collectPublicDocuments`, `analyzeCollectedDocuments`, `verifiedAnalysis`)
- `server/morning.ts` (`buildMorning`), `server/realtime.ts` (`checkPrepareMorning`, `prepareMorning`, `canMonitorCarry`), `server/http.ts` (`evaluateMorningApproval`, `generateMorning`, `GET /api/morning`, `POST /api/morning/approve`)
- `src/components/MorningPortfolio.tsx`, `src/pages/portfolio.css`
- `tests/morning.test.ts`, `tests/browser/morning.spec.ts`

## 현재 결과

- 완료한 변경:
  - **반대 근거 인용 표시 및 고정 대비 카드** (`src/components/MorningPortfolio.tsx`, `src/pages/portfolio.css`): AI 원문 요약(`takeaway`, `모델` 배지)과 서버 규칙 판단(`r.conclusion`)을 시각 분리하고, 독립 출처가 확인된 `views[0]` vs `counter`를 승인 전 2열 고정 대비 카드로 대칭 렌더링(`counter.quote`, 발행자, 공개 시각, 안전 URL 링크 포함). 동일 출처 구 보고서는 대비 카드를 생략하고 전체·후보 목록 모두 `추가 관점 · 동일 출처`로 일관 표기.
  - **반대 근거 문서·기관(hostname)·정규 URL 독립성 검사** (`shared/morning.ts`, `server/morning-analysis.ts`): `collectPublicDocuments`가 기관(hostname)당 대표 1건과 정규 URL 중복을 제거(`미국 연준`·`미 연준 연구진` 동일 호스트 중복 차단)하고, `verifiedAnalysis`와 UI 구 보고서 판정이 동일한 `isIndependentCounter`를 공유.
  - **원문 수집 시도/성공/실패 집계 독립 보존** (`shared/morning.ts`, `server/morning-analysis.ts`, `server/http.ts`, `src/components/MorningPortfolio.tsx`): `report.analysisCoverage`를 모델 실행·검증 성공 여부와 독립 저장해 전량 실패(`2/0/2`)·부분 실패·LLM 실패 시에도 호스트 경고로 시도/성공/실패 건수와 실패 발행자를 표시.
  - **승인·감시 재개 차단 조건 구조화 및 사전검사 공유** (`shared/morning.ts`, `server/morning.ts`, `server/realtime.ts`, `server/http.ts`, `src/components/MorningPortfolio.tsx`): `buildMorning`의 개장 시각 경계(`now >= openAt`)와 `equity === null || equity <= 0` 구조화(`approvalBlocked`, `approvalBlockReasons`), `realtime.checkPrepareMorning`(WS 키/HTS ID `.trim()`, 종목 수 ≤18, 기존 구독 충돌)과 `evaluateMorningApproval` 단일화, `GET /api/morning`의 `approval: { allowed, reasons }` 제공, 승인 전 차단 및 승인 후 감시 재개 차단 UI 적용, 과거 보고서 열람 시 상세 `gaps` 보존.
  - **후보–공개 근거 결정론 연결** (`shared/morning.ts`, `server/morning-analysis.ts`, `src/components/MorningPortfolio.tsx`): 서버가 원문 전체(`title + text`)에 대해 앞뒤 경계·복합 조사·6자리 코드 영숫자 경계로 `matchedCodes`를 계산해 복합 회사명(`현대차증권`, `삼성전자우`, `한화에어로스페이스`, `KT&G`, `SK하이닉스`, `AB005930CD`) 오매칭을 차단. 구 보고서 폴백에서 LLM `finding`을 제외하고 원자료(`title`·검증 `quote`·동일 정규 URL 뉴스)만 사용.
  - **설계 문서화** (`docs/plans/a2ui-morning-briefing.md`): 3자 합의 2단계 게이트, Option A/C 기각 근거, Step 1 진입 조건 및 A2UI v1.0 3종 카탈로그·안전 불변식 명세.
- 독립 리뷰:
  - 1차 독립 리뷰: Codex Astra 6.2(`high`) FAIL(Major 7), Claude Opus 5.5(`high`) FAIL(Major 1 · Minor 6) → 전 항목 수정 및 회귀 테스트 추가.
  - 2차 재리뷰: Claude Opus 5.5(`high`) **PASS**(Blocker 0 / Major 0 / Minor 2, Playwright 전체 309/309 통과 확인), Codex Astra 6.2(`high`) FAIL(Major 2 · Minor 2) → WS 키/HTS ID `.trim()`, 후보 라벨 일치, 코드 영숫자 경계, 복합 조사·병기 구분자 수정 및 회귀 테스트 추가.
  - 최종 재리뷰: Codex Astra 6.2(`high`) **PASS**(Blocker 0 / Major 0 / Minor 0).
- 검사 명령·결과 (2026-11-24):
  - `npm run typecheck`: 오류 0건
  - `npm test`: 305/305 통과
  - `npm run build`: 성공 (`554ms`)
  - `npx playwright test tests/browser/morning.spec.ts tests/browser/portfolio.spec.ts tests/browser/dashboard.spec.ts`: 23/23 통과 (Opus 5.5 재리뷰에서 전체 Playwright 309/309 통과 확인)
- 미검증·남은 작업:
  - 실제 Claude CLI 원문 분석·KIS 모의 원격 API 호출은 미실측(격리 `fetch`·브라우저 라우트 모의 검증).
  - 로컬 환경에 `graphify` CLI가 설치되어 있지 않아 `PYTHONHASHSEED=0 graphify update .` 미실행(`graphify-out/` 변경 없음).
  - Step 1(A2UI v1.0 최소 서브셋)은 [설계 문서](../plans/a2ui-morning-briefing.md) 진입 조건 충족 시 별도 이슈로 착수.
- 실패·차단 원인과 반복하지 않을 시도:
  - 1차/2차 리뷰에서 발견된 구 보고서 `finding` 폴백 오염, 공백 WS 키 `.trim()` 누락, 과거 보고서 `gaps` 필터 누락을 모두 단위·브라우저 회귀 테스트로 고정했다.

## 다음 행동

PR의 GitHub Actions CI 통과와 `main` 머지 여부를 확인하고, 실제 장전 운용에서 Step 0 효과를 수용한 뒤 Step 1 진입 조건 충족 여부를 판단한다.

## 새 세션 시작 문구

> docs/STATE.md와 이 작업 파일을 읽고, 먼저 읽을 자료 및 관련 이슈·PR·CI를 확인해 다음 행동부터 이어가줘. 이전 대화와 전체 파일은 다시 읽지 말고, 필요한 부분만 추가로 확인해.
