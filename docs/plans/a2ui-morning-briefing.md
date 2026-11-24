# 장전 공개 원문 분석 브리핑 개선(Step 0) 및 A2UI v1.0 조건부 도입 계획

- 기준 이슈: [#205](https://github.com/krdn/gon-stock03/issues/205) · 상위 운용 [#197](https://github.com/krdn/gon-stock03/issues/197)
- 협의 참여: Codex Astra 6.2 (`gpt-6.2-astra`), Claude Opus 5.5 (`claude-opus-5-5`), Gemini (2라운드 교차 협의, 만장일치)
- 검토 대상: [a2ui-project/a2ui](https://github.com/a2ui-project/a2ui) (Protocol v1.0)

## 1. 결정 요약 (2단계 게이트)

1. **현시점 A2UI 즉시 도입 보류 → Step 0 우선 실행:** 현재 `gon-stock03`에서 LLM이 개입하는 유일한 지점은 `server/morning-analysis.ts`와 `src/components/MorningPortfolio.tsx`의 장전 공개 원문 분석 슬롯뿐이다. 단일 생산자(`claude -p`)·단일 소비자(`MorningPortfolio.tsx`) 구조에서는 프로토콜 층을 얹기 전에 실제 신뢰·UX 결함 6건을 고정 계약·UI로 해결한다.
2. **Step 1 (조건부 진입):** 아래 진입 조건 중 하나가 실제로 충족될 때만 `MorningPortfolio` 공개 원문 브리핑 슬롯 1곳에 **A2UI v1.0 최소 서브셋(Option B)**을 별도 이슈로 도입한다.
   - `(i)` 독립 생산자 또는 독립 소비자(외부 에이전트·MCP·별도 렌더러)의 상호운용 수요가 실제로 발생할 때
   - `(ii)` Step 0 수용 후 실제 장전 보고서에서 고정 UI 배치·순서가 사용자의 승인 판단을 방해한 구체적 사례가 기록될 때

## 2. Out of Scope (A2UI 절대 금지 구역)

- 기존 15개 레지스트리 화면(`src/specs.ts`) 및 `/settings/trading/*`
- 상태줄(`DataStatusLine`), `serverNow`/stale 검증, 긴급정지, 주문·취소·불명 복구(`/paper`, `/orders`), 위험관리(`/risk`), 연결·설정(`/settings`)
- `portfolio-toolbar`의 승인·이월·감시 재개 버튼 및 모든 금액·수량·한도·손실 기준·장후 기여 수치
- 데이터 누락·stale·승인 차단 경고 (호스트 서버만 판정)
- A2UI 역방향 채널(`callAgentFunction`, `sendDataModel`), 표현식 엔진(`@call`), 스트리밍 갱신, HTML/Markdown 렌더러

## 3. 기술 선택 근거 (Option A/C 기각, Option B 채택)

| 후보 | 판정 | 근거 |
| --- | --- | --- |
| Option A: `@a2ui/react` + `@a2ui/web_core` | 기각 | `0.16.1` 기준 `zod ^3.25.76`(peer+dep)을 요구해 프로젝트 `zod 4.6.7`(`z.toJSONSchema`, `z.int()`, `z.iso.date()`)과 충돌. `lit`·`@preact/signals-core`·`markdown-it` 추가는 외부 UI 라이브러리 미도입 원칙(`docs/architecture/workbench.md`) 및 HTML 공격 표면 최소화에 위배 |
| Option C: `@a2ui/agent` 풀스택 | 기각 | `0.2.1` 기준 `antlr4ng`까지 유입. 도구·MCP를 끈 `claude -p` 1회 격리 호출에 과잉 |
| Option B: A2UI v1.0 최소 서브셋 자체 구현 | Step 1 채택 | 기존 `zod 4.6.7` + `src/components/ui.tsx` 재사용, 런타임 의존성 0 추가. 공식 v1.0 스키마를 준수해 향후 외부 에이전트 전환 여지 보존 |

## 4. Step 0 범위 (본 이슈 구현 대상)

1. **반대 근거 인용 표시:** `MorningPortfolio.tsx`에서 `counter.quote`, 발행자, 공개 시각을 대칭 렌더링.
2. **반대 근거 독립성 검사:** `server/morning-analysis.ts`에서 `counter`가 `views`와 동일 문서 index 또는 동일 발행자를 가리키면 거부.
3. **원문 수집 실패 투명화:** `Promise.allSettled` 시도·성공·실패 건수와 실패 발행자를 `analysis.coverage`로 보존해 호스트 고정 경고 표시.
4. **승인 차단 조건 구조화:** `gaps` 문자열 매칭 대신 보고서의 `approvalBlocked`/`approvalBlockReasons` 및 `GET /api/morning`의 `approval: { allowed, reasons }` 계약으로 전환(구 보고서 하위 호환 유지).
5. **후보–공개 근거 결정론 연결:** 원문 제목·본문 종목명/코드 일치 기준의 서버 결정론 매칭(`matchedCodes`, 구 보고서 폴백 포함)으로 후보별 관련 원문 연결(LLM 추천 금지).
6. **고정 대비 카드 & 출처 분리:** 서버 규칙 결론과 AI 원문 요약을 시각 분리하고, `views` + `counter`가 있을 때 승인 전 고정 대비 카드 제공.

## 5. Step 1 설계 예약 (진입 조건 충족 시 별도 이슈)

- **와이어 포맷:** A2UI v1.0 단일 원자 `createSurface` (`version: "1.0"`, `surfaceId = report.id`, 소유 도메인 접두 `catalogId`, 인라인 `components`, `sendDataModel` 미사용).
- **데이터 모델 분리:** 저장 원본은 검증된 LLM `components`만 보존하고, `dataModel`은 불변 `report`의 검증된 공개 분석과 후보 식별자에서 서버가 결정론적으로 직렬화·주입(정적 키 `/views/N`, `/counter` 참조만 허용).
- **최소 카탈로그 (3종, 신규 자유 문구 0개):** `Briefing`(root, children 순서), `Evidence`(검증된 view 참조), `Contrast`(서로 다른 문서·발행자의 `for` + `against` 쌍). `CandidateEvidence`는 실제 묶음 수요와 서버 종목명–코드 대응 검증이 성립할 때만 확장.
- **불변식 및 검증:** `takeaway` 호스트 상단 고정, 모든 `views` 누락·중복 없는 순열, `counter` 존재 시 `Contrast` 필수, Action/Link prop/HTML/Markdown/임의 URL/API 호출 전면 금지, 위반·구 보고서는 Step 0 고정 UI로 완전 폴백. 업스트림 `agent_to_renderer.json`·`catalog_definition.json` 고정 SHA fixture 교차 검증(Step 1 착수 시 JSON Schema 2020-12 devDependency 추가 여부 결정) + 미지원 입력 거부 + 거래 요청 0건.
