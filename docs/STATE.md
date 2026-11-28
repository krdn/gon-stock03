# 작업 인수인계

[상위 이슈 #1](https://github.com/krdn/gon-stock03/issues/1) · 개인 PC에서 국내 주식·ETF 모의 주문과 전략을 검증한다. [시스템 개요](architecture/figures/gon-stock-overview.png) · [개발 워크플로](WORKFLOW.md)

## 전략 스튜디오 1~5단계 완료

2026-11-28 main `f268790` 기준. 목표 20종 중 **18종 구현**(단일 11·다종목 5·오버레이 2). 08은 분봉 원장, 17은 시점별 공시 원장과 공개 시각이 없어 제외했다. [전략 기준표와 체결 계약](plans/strategy-rules.md)

| 단계 · 작업 기록 | main 병합 SHA |
| --- | --- |
| 1 · [#231 일봉 v2·스튜디오·도움말](tasks/231-strategy-rules.md) | #232 `7879c91` · #233 `7e78492` · #234 `8692192` |
| 2 · [#235 확정 일봉 7종](tasks/235-strategy-rules.md) | #236 `cb13b75` · #237 `20f6c1e` |
| 2 후속 · [#238 Research 모듈 분리](tasks/238-research-modularize.md) | #239 `6979809` |
| 3A · [#240 일봉 돌파·변동성 사이징](tasks/240-strategy-rules-phase3a.md) | #241 `371c526` · #242 `e4a22c2` |
| 3B · [#243 확정 일봉 KIS 모의 계약](tasks/243-strategy-rules-phase3b.md) | #244 `d57fa8b` · #245 `af351f9` |
| 4A · [#246 다종목 백테스트 v3](tasks/246-strategy-rules-phase4a.md) | #247 `8109ed7` · #248 `af0a65e` |
| 4B · [#249 섹터 상대강도·클레노우](tasks/249-strategy-rules-phase4b.md) | #250 `cc3a794` · #251 `9c79554` |
| 5 · [#252 가격 레짐·18카드·제외 FAQ](tasks/252-strategy-rules-phase5.md) | #253 `9e40e16` · #254 `f268790` |

[최종 제품 검증](https://github.com/krdn/gon-stock03/pull/254)은 단위 394/394, 격리 Playwright E2E 28개 spec 361/361이다. 다종목·05·20의 KIS 실시간 시작은 차단된다. 실계좌 수익은 미검증이며 보장하지 않는다.

## 운영·재개

- **개발과 검증** · [Orca 4303/4304·격리 4314 가이드](operations/orca-dev-testing.md) · [PR #230](https://github.com/krdn/gon-stock03/pull/230) `6baa969`.
- **장후 시세 동기화** · [#212 설계](plans/212-market-data-sync.md) · [운영·08:30 점검](operations/local.md#장후-시세-동기화). 11월 27일 15:40 KST 일회 실증(runId `96935494`, Orca Item #69 기록 e634)에서 마스터 갱신과 우선 범위 10/10종목 수집을 확인했다. 정기 실행과 범위 밖은 미검증이다.
- **장전 운용** · [#197 장전 포트폴리오](tasks/197-morning.md) 실제 장중 운용 수용 대기 · [#205 브리핑·A2UI](tasks/205-morning-briefing.md) · [#218 스캔 재시도](https://github.com/krdn/gon-stock03/pull/222) · [#221 인벤토리](https://github.com/krdn/gon-stock03/issues/221). [#213 OpenDART](https://github.com/krdn/gon-stock03/pull/227) 실키 호출 미검증.
- **기존 수용·운영** · [#149 UX 수용 범위](tasks/149-ui-ux-v2.md#위임에-따른-최종-수용) · [모의 버전 수용과 예외](verification/2026-11-20-paper-acceptance.md) · [KIS 자동 주입](operations/kis-auto-injection.md) · [기존 완료·잔여 작업과 재개 명령](verification/2026-11-17-consolidated-status.md).
- 재개할 때 선택한 작업 기록·필수 자료·원격 이슈/PR/CI를 대조한다. 주문·취소·전략 실행에는 별도 승인이 필요하다.
