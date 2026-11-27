# 전략 스튜디오 일봉 규칙

[구현 이슈 #231](https://github.com/krdn/gon-stock03/issues/231) · Item 72 · PR 1A. 원안은 2026-11-27의 「gon-stock03 전략 스튜디오 확장을 위한 국내외 20대 핵심 전략 심층 분석 설명서」다. 이 표의 준비 봉은 신호를 판정하기까지의 수다. 확정 일봉 신호를 실제로 체결하려면 한 봉이 더 있어야 한다. O/H/L/C/V는 각각 시가·고가·저가·종가·거래량이다.

|번호·전략|판정 자료|최소 준비 봉(기본값 또는 산식)|판정 → 체결 가정|지원 환경|
|---|---|---|---|---|
|01 이중 이동평균 교차|C, 상대거래량 사용 시 V|max(장기+1, 추세기간, 거래량 사용 시 21)|종가 → 다음 시가|저장 일봉, 거래량 없는 DEMO, 필터 없는 SMA만 기존 KIS 계약|
|02 돈키안 돌파|HLCV|max(진입기간,20)+1|종가 → 다음 시가|저장 일봉|
|03 MACD 히스토그램·제로선|C|`slowPeriod + signalPeriod + 10`|종가 → 다음 시가|PR 2A 저장 일봉·DEMO|
|04 ADX·DMI|HLC|`2 * diPeriod`|종가 → 다음 시가|PR 2A 저장 일봉|
|05 윌리엄스 변동성 돌파|OHLC, 당일 시가·체결가|직전 노이즈 20봉과 당일 시가|장중 목표가 돌파 → 이후 체결|미구현, 장중 이벤트 필요|
|06 볼린저 스퀴즈|CV|`Math.max(period + squeezeLookback, 21)`|종가 → 다음 시가|PR 2A 저장 일봉|
|07 켈트너·볼린저 TTM|HLC|`period + 2`|종가 → 다음 시가|PR 2A 저장 일봉|
|08 갭·초반 거래량|전일 HC, 당일 O, 분별 가격·누적 V|전일 1봉과 당일 개장 구간, 거래량 비교 이력|장초반 확인 → 이후 체결|미구현, 일봉으로 순서 확정 불가|
|09 코너스 RSI 눌림목|C|max(장기,단기,RSI기간+1), 기본 200·원안 권장 자료 205|종가 → 다음 시가|저장 일봉, DEMO|
|10 볼린저 %B·RSI|C|`Math.max(bbPeriod, rsiPeriod + 1) + 1`|종가 → 다음 시가|PR 2A 저장 일봉·DEMO|
|11 거래량 고갈 눌림목|OHLCV|`Math.max(trendSlowMa, 21 + pullbackDays)`|종가 → 다음 시가|PR 2A 저장 일봉|
|12 이격도·엔벨로프|HLC|`maPeriod`|종가 → 다음 시가|PR 2A 저장 일봉|
|13 ETF 듀얼 모멘텀|바스켓·현금 대안별 C|동일 거래일 기준 수익률 기간+1, 기본 61 또는 121|리밸런싱일 종가 → 다음 시가|미구현, 다종목 필요|
|14 파버 GTAA|자산별 C|각 자산 200|월간 판정 → 다음 시가|미구현, 다종목 필요|
|15 KRX 섹터 상대강도|동일 시점 섹터·ETF 비중, 종목 HC·섹터 잔여 한도|기본 21, 분류·비중 관측 필요|리밸런싱 종가 → 다음 시가|미구현, 다종목 필요|
|16 클레노우 회귀 모멘텀|유니버스 종목별 OHLC, ATR, 지수 C|종목 max(회귀기간,100,ATR기간), 지수 기본 200|장전 확정 일봉 순위 → 다음 시가|미구현, 시점별 유니버스 필요|
|17 공시 드리프트·희석 차단|공개시각·공시분류, OHLCV|직전 20봉+현재봉, 최근 공시 이력|공개 후 종가 확인 → 다음 시가|미구현, 시점별 공시 필요|
|18 매크로 레짐|ETF C, FRED 빈티지, 중앙은행 발표시각|기본 200봉과 당시 공개된 경제지표|확정 자료로 일간 레짐 → 다음 진입 한도|미구현, 외부 시점 자료 필요|
|19 샹들리에 청산|HLC, 진입 이후 최고 H|ATR 기간과 진입 규칙 준비 봉 중 큰 값|종가 ≤ 추적선 → 다음 시가|저장 일봉 청산 오버레이|
|20 변동성 패리티·RMS|계좌 평가액, HLC, 20개 종가 수익률|최소 21봉과 별도 워크포워드 학습·검증 구간|장전 수량 결정, 장중 손절 확인 → 이후 체결|미구현, 계좌·장중 경로 필요|

미구현 행의 수치는 설계용 자료 하한이며 실행 검증 전이다. DEMO는 종가 이력만 사용하고 다음 합성 봉 종가에 체결한다. 거래량·고저가가 필요한 경우 저장·계산 시 거부한다. 신규 규칙과 샹들리에는 KIS 시작 시 승인 검사 앞에서 거부한다. 허용되는 기본 SMA도 기존 실행 계약과 주문 검사를 통과해야 한다.

## 규칙 계약

- SMA·EMA 교차는 전봉과 현재 봉의 단기·장기 차이를 비교한다. EMA는 첫 기간 SMA로 초기화한다. 매수 필터는 종가가 같은 종류의 장기 추세선보다 높고, 당일 거래량이 직전 20봉 평균 × 설정 배수 이상일 때 통과한다. 미지정·0 거래량 필터와 미지정·null 추세 필터는 비활성이다. 매도에는 진입 필터를 적용하지 않는다.
- 돈키안 매수는 종가가 직전 진입 기간 최고 고가 이상이고 거래량이 직전 20봉 평균 × 배수를 **초과**해야 한다. 매도는 종가가 직전 청산 기간 최저 저가 이하다.
- RSI는 Wilder 평활을 사용한다. 상승·하락이 모두 없으면 50이다. 장기 SMA 위, 단기 SMA 아래, RSI 임계치 이하일 때 매수한다. 단기 SMA 이상, RSI 70 이상 또는 최대 보유 봉 도달 시 매도한다. 진입 체결 봉의 종가가 첫 보유 봉이다.
- ATR의 첫 true range는 고가−저가, 이후에는 전 종가와의 갭을 포함한다. 진입 봉부터 최고 고가를 추적하고 직전 stop과 최고 고가−배수×ATR 중 큰 값을 유지한다. 종가가 stop 이하면 규칙 매도보다 우선한다.

## PR 1B 연결

- shared/strategy-rules.ts의 STRATEGY_CATALOG에서 한국어 설명과 프리셋을 읽는다. 규칙은 kind별 명시적 필수값을 전송한다. 누락값을 파서가 채우지 않는다.
- POST /api/backtest/daily에 runId, code, source=kis-rest, from, to, adjustment, capital, feeBps, slippageBps, rule 및 선택 overlay를 보낸다. v2 입력에는 최상위 fast/slow가 없다. 응답의 experiment.snapshot.engineVersion은 daily-rules-next-open-v2, result.trades에는 reason이 있다. benchmark는 첫 시가에 동일 비용·슬리피지·정수 수량으로 매수한 뒤 마지막 종가로 평가한 returnPct, maxDrawdown, finalEquity다. 준비 봉도 같은 비교 기간에 포함된다. 마지막 봉 강제청산은 없다.
- POST /api/backtest의 DEMO 입력은 code, 비용·자금, rule 및 선택 overlay다. 응답은 result다. 저장은 POST /api/strategies의 기존 name, code, fast, slow, qty, environment에 선택 rule, overlay, evidence {experimentId,inputHash}를 더한다. MA의 호환 기간은 규칙과 일치시킨다. evidence는 존재·일치 여부를 검증하지 않은 입력 참조다.
- 목록 GET /api/backtest/experiments는 두 버전을 포함한다. v2 UI는 experimentListSchema와 experimentSchema를 사용하고, 기존 화면은 legacyExperimentListSchema와 legacyExperiment로 v1 목록·상세를 읽는다. 재현은 기존 POST /api/backtest/replay에 id를 전달한다.
- v1 함수 signal, simulate, backtestDaily 및 dailyBacktestInput을 동결했다. 고정 일봉 fixture의 원본 SHA-256은 250f7976c8002efc246c4f1333a20a732c05899cb972faacbef30356cef4d0e4다. v2의 엔진 버전과 입력 형태가 달라 해시는 별개다. 파싱한 명시적 입력을 그대로 고정하므로 비활성 옵션도 생략과 명시가 서로 다른 해시를 만든다. 기본 SMA 거래·평가액은 v1과 대조하고 재현은 저장 입력 해시와 isDeepStrictEqual로 확인한다.

## PR 2A 구현과 PR 2B 입력 계약

모든 규칙은 저장 일봉에서 종가 판정 후 다음 시가에 체결한다. 종가 전용 DEMO는 MACD와 %B만 지원한다. KIS 모의 실시간 시작은 모두 차단한다. 아래 필드는 kind 이외의 필수 입력이며 프리셋 값 순서도 같다.

|kind|필수 입력|보수 / 기본 / 공격|
|---|---|---|
|macd_momentum|fastPeriod, slowPeriod, signalPeriod, requireZeroLineAbove|12,26,9,true / 12,26,9,false / 8,17,9,false|
|adx_dmi_trend|diPeriod, adxThreshold|14,30 / 14,25 / 10,20|
|bollinger_squeeze|period, stdDevMultiplier, squeezeLookback, squeezePercentile|20,2,60,20 / 20,2,60,25 / 20,1.8,40,35|
|ttm_squeeze|period, bbMult, kcMult|20,2,1.5 / 20,2,1.5 / 14,1.8,1.5|
|bollinger_percent_b|bbPeriod, bbStdDev, rsiPeriod, rsiOversold, exitPercentB|20,2.2,14,30,0.5 / 20,2,14,35,0.55 / 14,1.8,10,40,0.65|
|low_volume_pullback|pullbackDays, maxVolumeRatio, trendFastMa, trendSlowMa|4,0.55,20,60 / 3,0.65,20,60 / 2,0.75,10,40|
|disparity_reversion|maPeriod, buyDisparity, sellDisparity, stopLossPct|20,91,99,4 / 20,93,99.5,5 / 15,95,100.5,6|

- **03** 첫 각 기간 SMA에서 EMA를 시작하고 장기 EMA가 생긴 봉부터 MACD 시계열을 만든다. 히스토그램이 0 이하에서 양수로 바뀌면 진입하며, 선택 필터는 현재 MACD>0이다. 0 이상에서 음수로 바뀌면 청산한다.
- **04** 첫 TR은 H−L, 첫 ±DM은 0이다. n봉 합계로 방향 이동과 TR을 초기화하고 이후 Wilder 평활한다. n번째 봉에서 첫 DX, 2n−1번째에서 첫 n개 DX 평균 ADX를 얻는다. 2n번째부터 ADX 상승·임계치 이상과 +DI 우위를 함께 확인한다. -DI 우위면 청산한다. 이 첫 봉 시드는 프로젝트 계약이다. [TA-Lib의 Wilder 계산](https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_ADX.c)
- **06** 종가 모집단 표준편차로 밴드를 만든다. 오늘을 제외한 직전 5봉 최소 폭 비율이 직전 lookback 폭의 하위 분위수(오름차순 ceil(N×p/100)순위) 이하고 종가>오늘 상단, 거래량>직전 20봉 평균×1.2면 진입한다. 중심선 미만이면 청산한다.
- **07** SMA 볼린저가 EMA±배수×Wilder ATR 안에 엄격하게 들어가면 수축이다. 수축 해제 시 양의 모멘텀이 증가하면 진입한다. 모멘텀은 종가에서 (기간 고저 중간값과 SMA의 평균)을 뺀 값이다. 음수 또는 양수에서 두 봉 연속 감소하면 청산한다.
- **10** 밴드 내 종가 위치는 폭이 0이면 0.5다. 직전 %B≤0.05에서 %B·종가 모두 상승하고 Wilder RSI가 기준 이하면 진입한다. 목표 %B 이상이면 청산한다.
- **11** 단기 SMA와 종가가 장기 SMA 위에 있어야 한다. 직전 눌림 구간의 모든 종가가 그 구간 직전 종가보다 낮고 구간 평균 거래량이 직전 20봉 평균×설정 비율 이하여야 한다. 오늘 양봉 종가가 직전 고가를 넘으면 진입한다. 종가가 단기 SMA 미만이거나 매 판정 시점 직전 pullbackDays봉 최저가 이하면 청산한다.
- **12** 종가/SMA×100이 매수 기준 이하이고 양의 고저 폭에서 종가 위치가 40% 이상이면 진입한다. 목표 이격도 이상 또는 진입 체결가에서 설정 손절률 이상 하락하면 청산한다. 신호 봉의 종가와 실제 체결가를 구분한다.
