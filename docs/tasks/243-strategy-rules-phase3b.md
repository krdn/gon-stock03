# 확정 일봉 KIS 모의 전략 계약

[이슈 #243](https://github.com/krdn/gon-stock03/issues/243) · [설계 및 UI 계약](../plans/strategy-rules.md#pr-3b-1-입력-계약). 기준 main e4a22c2. Item #99의 범위는 확정 일봉 평가, 계약 고정 및 격리 검증이다.

## 검증 범위

가짜 전송기·모의 fetch·격리 SQLite에서 전체 단위 368건을 확인했다. 10종 계약·시딩·재개, 증거의 누적 체결금액을 사용한 가중평균 원가·청산 후 재진입·샹들리에 복원, 당일 봉 제외, 동일 이벤트 예약 및 전용 원장 간 독립성을 검사했다. 원장이 입증하지 못하는 평균단가는 추정하지 않는다. 이격도 전략은 원가 미확인 중 추가 매수를 보류한다.

gon-workflow ready와 implementation-ready 통과. 기존 미추적 pnpm-lock.yaml로 resume은 중단되어 기준 이슈와 원격 main SHA를 직접 대조했다. Graphify CLI는 PATH에 없었다. 외부 리뷰는 실제 claude-opus-5-5 (high 요청)였으며 일봉 평가 예외를 해당 전략에 기록하고, 전용 원장 시딩에서 원본 동기화 이력의 정리를 생략했다. rejected에 대한 선차단 조건과 YYYYMMDD:daily는 지정 계약을 따르며 이미 예약된 이벤트에는 UNIQUE가 적용된다.

HIGH 지적은 달력 확인과 주문 출처의 signalBarDate 영속화로 처리했다. 2026 KRX 스냅샷에서 증명한 직전 거래일의 봉까지 중간 개장일이 모두 있어야 하며, 같은 봉을 집행한 주문이 남은 경우 재시작 후에도 보류한다. 갱신되지 않은 전용 원장과 달력 범위 밖 세션은 자동 매매를 진행할 수 없다. 시장가·지정가 주문 가격을 체결단가로 간주하지 않으며 주문별 누적 체결금액을 대조해 보유 원가를 복원한다.

총괄이 허용한 매매설정 호환 수정은 계약 지원과 SMA 빠른 복사 판정을 분리한다. 비기본 규칙의 고정 요약은 저장 조건을 표시한다. 3B-2는 전략 스튜디오 시작 버튼·안내·도움말을 이 입력 계약에 연결한다.

최종 구현으로 npm run typecheck, npm run build, npm test(368/368), 격리 4314 전체 Playwright(340/340)를 통과했다. 외부 수정분 리뷰도 claude-opus-5-5가 반환됐고 이전 HIGH 해소를 확인했다. 제출 후 전략을 삭제하는 API는 없으며 현재 카탈로그에서 이동평균 KIS 배지는 전용 문자열이다. SHA별 원격 결론은 [브랜치 Actions](https://github.com/krdn/gon-stock03/actions?query=branch%3Akrdn%2Fstrategy-rules-phase3b-pr1) 및 Draft PR 본문의 최종 HEAD를 기준으로 확인한다.
