# 다종목 포트폴리오 4A-1 · Item #108

[이슈 #246](https://github.com/krdn/gon-stock03/issues/246) · [설계와 정산 규약](../plans/strategy-rules.md). 기준 main은 af351f9이다.

## PR 4A-2 연결 계약

- POST /api/backtest/daily에 runs 배열(각 code, runId), source=kis-rest, from/to(YYYYMMDD), adjustment, capital, feeBps, slippageBps, rule을 보낸다. runs는 assets 및 선택한 safeAsset과 정확히 일치해야 한다. assets 순서는 동률 순위에 사용한다.
- shared/portfolio-rules.ts의 PORTFOLIO_CATALOG에서 제목, environments 및 presets의 conservative/basic/aggressive 기간 설정을 읽는다. kind·assets·safeAsset과 합쳐 규칙을 구성한다. portfolioWarmup(rule)+1이 최소 봉 수다.
- 응답 experiment.snapshot에는 engineVersion, input, legs[].{code,collection,bars}가 있다. result.rebalances의 signalDate/date는 판정/체결일이고 targets는 규칙 순서(code,weight)다. 거래 내역은 trades[].code, 비교 지표는 benchmark이다. 목록의 bars는 공통 기간 길이다. replay는 기존 POST /api/backtest/replay를 사용한다.
- 저장 전략은 code=assets[0], overlay 생략, environment=kis-paper로 보낸다. 모든 구성원이 거래 가능한 ST/EF여야 한다. DEMO와 KIS 모의 기동·초안·고정에서 portfolioOnly 사유를 표시한다. 전용 UI는 후속 PR에서 연결한다.

## 검증

격리 데이터 260봉, 타입 검사·빌드, 단위 테스트와 전략 브라우저 회귀를 사용한다. 실제 계좌·운영 저장 일봉 성과는 미측정이다. 최종 커밋·CI는 이 문서를 포함한 Draft PR의 head 기록을 따른다.

독립 리뷰는 claude-opus-5-5를 high로 요청했고 반환 모델도 일치했다. 손상된 DEMO 활성 레코드는 해당 전략만 정지한다. 달력 오류에는 비교 종목 쌍과 날짜를 넣고 정렬 locale을 고정했다. 입력 필드 오류 경로와 소수 시가의 원 단위 수수료 보정을 확인했다. 동일 신호에서도 비용 포함 목표가 998주에서 996주로 줄어드는 사례는 확정 설계대로 유지하고 회귀로 고정했다. 잔여 현금이 부족하면 assets 순서 뒤쪽 매수가 줄어들 수 있다.

v3 데이터를 생성한 뒤 이전 프로그램으로 되돌릴 경우 v3를 읽고 수집 참조를 보호할 수 있는 버전이 필요하다. 롤백 시에는 변경 전 백업의 복사본을 사용한다. Graphify CLI는 PATH에 없어 그래프 갱신은 미검증이다.

최종 검증 기준은 [원격 작업 브랜치 HEAD](https://github.com/krdn/gon-stock03/commits/krdn/strategy-rules-phase4a-pr1)이다. npm test 375건 및 typecheck·build 통과. PR 본문에 로컬 HEAD와 동일한 원격 SHA, 브라우저 회귀 및 CI 결과를 기록한다.
