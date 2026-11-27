import { useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { STRATEGY_CATALOG } from '../../../shared/strategy-rules';
import { RULE_KINDS, type RuleKind } from '../../pages/research-rule-form';

/** 사용방법 도움말 탭 식별자. */
export type HelpTabId = 'workflow' | 'dictionary' | 'results' | 'faq';

/** 규칙·오버레이 입력 항목 개별 도움말 정의. */
export interface FieldHelpItem {
  term: string;
  range: string;
  description: string;
}

/** 규칙별 요약·환경 배지·실행 안내·필드 사전 항목. */
export interface RuleHelpEntry {
  summary: string;
  envBadge: string;
  basicPreset: string;
  executionNote: string;
  fields: FieldHelpItem[];
}

/** 4탭 WAI-ARIA 도움말 탭 정의. */
export const HELP_TABS: { id: HelpTabId; label: string }[] = [
  { id: 'workflow', label: '처음부터 따라하기' },
  { id: 'dictionary', label: '전략·입력 항목 사전' },
  { id: 'results', label: '백테스트 결과·비용' },
  { id: 'faq', label: '환경별 차이·FAQ' },
];

/** 규칙별 입력 항목 상세 안내 (상단 도움말 사전과 `RuleConfigSection` 문맥 가이드가 공유). */
export const RULE_FIELD_HELP: Record<RuleKind, RuleHelpEntry> = {
  ma_crossover: {
    summary: '단기 이동평균과 장기 이동평균의 교차(골든·데드크로스)로 추세 전환을 포착합니다.',
    envBadge: '저장 일봉 · DEMO 겸용(거래량 필터 꺼짐) · KIS 모의(필터 없는 SMA 100 이하)',
    basicPreset: 'SMA, 단기 5 / 장기 20 (추세·거래량 필터 꺼짐)',
    executionNote:
      '매도 신호는 현재 수익 여부를 보장하지 않습니다(수익 미보장). 저장 일봉은 종가 판정 후 다음 봉 시가, 거래량 필터를 끈 DEMO는 다음 합성 봉 종가에 체결한다고 가정합니다. 준비 봉은 max(장기+1, 추세 필터, 거래량 필터 사용 시 21)봉입니다.',
    fields: [
      {
        term: '단기 / 장기 평균',
        range: '단기 2-60 정수 · 장기 3-120 정수 (단기 < 장기)',
        description:
          '전봉 단기<=장기에서 오늘 단기>장기(초과)로 상향 돌파하면 매수, 전봉 단기>=장기에서 오늘 단기<장기(미만)로 하향 돌파하면 매도합니다. 기간을 줄이면 신호가 빨라지지만 속임수가 늘고, 늘리면 큰 추세만 느리게 잡습니다.',
      },
      {
        term: '평균 방식 (SMA vs EMA)',
        range: 'SMA · EMA 선택',
        description:
          'SMA는 기간 내 모든 날을 같은 비중으로 평균 내고, EMA는 최근 가격에 더 큰 비중을 두어 추세 전환에 빠르게 반응합니다.',
      },
      {
        term: '장기 추세 필터 (선택)',
        range: '20-240 정수 (비우면 미사용)',
        description:
          '예: 60을 넣으면 오늘 종가가 60일 평균선을 초과(>)할 때만 매수해 하락장 매수를 막습니다. 숫자를 키우면 더 큰 장기 추세만 허용합니다.',
      },
      {
        term: '최소 상대 거래량 (선택)',
        range: '0-5 숫자 (비우면 미사용 · 저장 일봉 전용)',
        description:
          '예: 1.5를 넣으면 오늘 거래량이 직전 20봉 평균 거래량의 1.5배 이상(>=)일 때만 매수합니다. 배수를 높일수록 거래량이 크게 터진 돌파만 고릅니다.',
      },
    ],
  },
  donchian_breakout: {
    summary: '가격 채널 돌파와 거래량 확인을 결합한 터틀 트레이딩 방식입니다.',
    envBadge: '저장 일봉 전용 · KIS 모의 정지 저장 가능(실시간 시작 제한)',
    basicPreset: '진입 고가 20봉 / 청산 저가 10봉 / 최소 거래량 1배 초과',
    executionNote:
      '매도 신호는 수익을 보장하지 않습니다(수익 미보장). 저장 일봉에서는 종가 판정 후 다음 봉 시가에 체결한다고 가정합니다. DEMO에서는 사용할 수 없습니다. 준비 봉은 max(진입 기간, 20)+1봉입니다.',
    fields: [
      {
        term: '진입 고가 기간',
        range: '10-120 정수',
        description:
          '종가가 직전 N일 최고가 이상(>=)으로 마감하고 거래량 조건을 충족할 때 매수합니다(터틀 트레이딩 방식). 기간을 늘리면 큰 돌파만 잡고 줄이면 잦게 진입합니다.',
      },
      {
        term: '청산 저가 기간',
        range: '3-60 정수 (진입 기간 미만)',
        description:
          '종가가 직전 M일 최저가 이하(<=)로 내려가 마감하면 매도합니다. 기간을 줄이면 빠르게 청산하고 늘리면 흔들림을 더 견딥니다.',
      },
      {
        term: '최소 거래량 배수',
        range: '입력 허용 범위 0.5-5 (양끝 포함) · 숫자 · 판정 기준: 직전 20봉 평균 × 배수 초과(>)',
        description:
          '입력값은 0.5-5 범위로 설정하며, 실제 진입 판정은 돌파 당일 거래량이 직전 20봉 평균 거래량 × 배수를 초과(>)할 때만 매수해 거래량 없는 가짜 돌파를 거릅니다. 배수를 높이면 진입이 줄고 낮추면 늘어납니다.',
      },
    ],
  },
  volatility_breakout: {
    summary: '전일 변동폭에 돌파 계수 k를 곱한 당일 목표가를 상향 돌파할 때 진입하고 설정 보유일 뒤 시가에 청산합니다.',
    envBadge: '저장 일봉 전용 · DEMO 미지원 · KIS 모의 정지 저장 가능(실시간 시작 제한)',
    basicPreset: '돌파 계수 k 0.5 / 적응형 노이즈 꺼짐 / 노이즈 20봉 / 추세 SMA 20봉 / 보유 1일',
    executionNote:
      '매도·청산 신호는 수익을 보장하지 않습니다(수익 미보장). 저장 일봉 전용 규칙이며 DEMO에서는 사용할 수 없습니다. 전일 확정 OHLC로 추세와 변동폭을 확정한 뒤 당일 고가가 목표가 이상(>=)이면 당일 기준가 max(시가, 목표가)로 매수 체결을 가정합니다(호가 단위 반올림 없음). 진입 당일에는 청산하지 않고, 이후 봉부터 전일 종가 기준 샹들리에 손절 또는 보유일 도달 시 당일 시가에 전량 청산합니다(시가 청산 봉 당일 재진입 금지). 준비 봉은 max(노이즈 기간, 추세 SMA 기간)봉입니다.',
    fields: [
      {
        term: '돌파 계수 k',
        range: '0.1-1 숫자 (고정 k 모드 적용)',
        description:
          '전일 변동폭(전일 고가−전일 저가 > 0)에 곱해 당일 목표가(당일 시가 + k × 전일 변동폭)를 만듭니다. 당일 고가가 목표가 이상(>=)이면 매수하며, k를 높이면 강한 돌파만 선별하고 낮추면 진입이 잦아집니다.',
      },
      {
        term: '적응형 노이즈 k 사용',
        range: '체크박스 (기본 꺼짐)',
        description:
          '켜면 고정 k 대신 직전 확정 봉들의 평균 노이즈 비율(1 − |시가−종가|/(고가−저가), 고저 폭이 0이면 0.5)을 유효 k로 사용합니다. 꼬리가 긴 흔들림 장세일수록 목표가가 자동으로 높아져 속임수 돌파를 줄입니다.',
      },
      {
        term: '노이즈 평균 기간',
        range: '5-60 정수 (기본 20)',
        description:
          '적응형 노이즈 평균을 구할 직전 확정 봉 수이며 준비 봉 계산에도 포함됩니다. 기간을 늘리면 k가 완만하게 변하고 줄이면 최근 일봉 형태에 빠르게 반응합니다.',
      },
      {
        term: '상승 추세 SMA 기간',
        range: '5-200 정수 (기본 20)',
        description:
          '전일 확정 종가가 직전 확정 종가의 추세 SMA를 초과(>)할 때만 당일 돌파 매수를 허용합니다. 기간을 늘리면 중장기 상승 추세 종목만 엄선하고 줄이면 단기 반등에도 진입합니다.',
      },
      {
        term: '보유 거래일 수',
        range: '1-10 정수 (기본 1)',
        description:
          '진입 다음 봉부터 누적 보유 거래일이 설정값 이상(>=)이면 당일 시가에 전량 청산합니다(수익 미보장). 샹들리에 청산을 함께 켜면 전일 종가 손절선 도달(<=)이 보유 기한보다 우선 적용됩니다.',
      },
    ],
  },
  rsi2_pullback: {
    summary: '장기 상승 추세 종목이 단기 과매도로 눌렸을 때 반등을 노립니다.',
    envBadge: '저장 일봉 · DEMO 겸용 · KIS 모의 정지 저장 가능(실시간 시작 제한)',
    basicPreset: 'RSI 기간 2봉 / 과매도 기준 10 이하 / 장기 추세선 200봉 / 청산 단기선 5봉 / 최대 보유 10봉',
    executionNote:
      '매도/청산 신호는 현재 수익 여부를 검사하지 않으므로 수익을 보장하지 않습니다(수익 미보장). 저장 일봉은 종가 판정 후 다음 봉 시가, DEMO는 다음 합성 봉 종가에 체결한다고 가정합니다. 준비 봉은 max(장기 추세선, 청산 단기선, RSI 기간+1)봉입니다.',
    fields: [
      {
        term: '장기 추세선',
        range: '60-240 정수 (기본 200)',
        description:
          '종가가 장기 SMA 초과(>)이고 청산 단기선 미만(<)일 때만 진입 후보가 됩니다. 기간을 늘리면 장기 상승 종목만 엄선하고 줄이면 중기 상승 종목까지 넓어집니다.',
      },
      {
        term: 'RSI 기간 & 과매도 기준',
        range: 'RSI 기간 2-5 정수 · 기준 2-25 숫자 (이하 <=)',
        description:
          'Wilder RSI가 기준 이하(<=)일 때 매수합니다. 과매도 기준을 10에서 5로 낮추면 더 극단적으로 떨어진 날에만 신중하게 매수하고, 높이면 진입이 잦아집니다.',
      },
      {
        term: '청산 단기선 & 최대 보유 기간',
        range: '청산선 3-10 정수 · 보유 3-20 정수',
        description:
          '주가가 단기 평균 이상(>=)을 회복하거나 RSI가 70 이상(>=)이 되거나 보유 봉 수가 최대 보유 기간 이상(>=)에 도달하면 매도/청산 신호를 냅니다(현재 수익 여부를 검사하지 않으므로 수익 미보장). 숫자를 줄이면 빨리 청산하고 늘리면 더 오래 기다립니다.',
      },
    ],
  },
  macd_momentum: {
    summary: '단기·장기 EMA 차이와 시그널선의 간격(히스토그램) 전환으로 모멘텀 변화를 포착합니다.',
    envBadge: '저장 일봉 · DEMO 겸용 · KIS 모의 정지 저장 가능(실시간 시작 제한)',
    basicPreset: '단기 12봉 / 장기 26봉 / 시그널 9봉 / 제로선 위 필터 꺼짐',
    executionNote:
      '매도 신호는 수익을 보장하지 않습니다(수익 미보장). 저장 일봉은 종가 판정 후 다음 봉 시가, DEMO는 다음 합성 봉 종가에 체결한다고 가정합니다. 준비 봉은 장기+시그널+10봉입니다.',
    fields: [
      {
        term: '단기 / 장기 EMA 기간',
        range: '단기 3-30 정수 · 장기 10-100 정수 (단기 < 장기)',
        description:
          '각 기간 첫 SMA에서 시작하는 EMA 차이로 MACD선을 계산합니다. 기간을 줄이면 추세 전환을 빠르게 잡지만 횡보장 잦은 매매가 늘고, 늘리면 큰 추세만 느리게 잡습니다.',
      },
      {
        term: '시그널 EMA 기간',
        range: '3-30 정수',
        description:
          '히스토그램(MACD−시그널)이 전봉 0 이하(<=)에서 오늘 0 초과(>)로 바뀌면 매수, 전봉 0 이상(>=)에서 오늘 0 미만(<)으로 바뀌면 매도합니다. 숫자를 줄이면 신호가 빨라지고 늘리면 완만해집니다.',
      },
      {
        term: 'MACD > 0 (제로선 위에서만 매수)',
        range: '체크박스 (기본 꺼짐)',
        description:
          '켜면 히스토그램 양전환 시점에 MACD선이 0 초과(>)인 상승 구간에서만 매수해 하락 추세 중 반등 진입을 줄입니다. 끄면 제로선 아래 반등도 허용합니다.',
      },
    ],
  },
  adx_dmi_trend: {
    summary: '방향성 지수(+DI/−DI)와 추세 강도(ADX)를 결합해 추세가 강해질 때만 진입합니다.',
    envBadge: '저장 일봉 전용 · KIS 모의 정지 저장 가능(실시간 시작 제한)',
    basicPreset: 'DI 기간 14봉 / ADX 기준 25 이상',
    executionNote:
      '매도 신호는 수익을 보장하지 않습니다(수익 미보장). 저장 일봉에서는 종가 판정 후 다음 봉 시가에 체결한다고 가정합니다. DEMO에서는 사용할 수 없습니다. 준비 봉은 2×DI 기간봉입니다.',
    fields: [
      {
        term: 'DI · ADX 기간',
        range: '7-30 정수',
        description:
          '고가·저가·종가로 +DI, −DI와 Wilder 평활 ADX를 계산합니다. 기간을 줄이면 추세 전환에 민감해지지만 잡음이 늘고, 늘리면 신호는 늦지만 큰 추세 위주로 걸러냅니다.',
      },
      {
        term: 'ADX 추세 기준',
        range: '15-40 숫자',
        description:
          '+DI가 −DI 초과(>)이고 ADX가 기준 이상(>=)이며 직전 봉 ADX 초과(>)로 상승 중이면 매수, +DI가 −DI 미만(<)으로 역전되면 매도합니다. 기준을 높이면 강한 추세에만 신중히 진입하고 낮추면 더 잦게 진입합니다.',
      },
    ],
  },
  bollinger_squeeze: {
    summary: '볼린저 밴드 폭이 극도로 좁아진(스퀴즈) 뒤 거래량이 동반된 상단 돌파를 노립니다.',
    envBadge: '저장 일봉 전용 · KIS 모의 정지 저장 가능(실시간 시작 제한)',
    basicPreset: '밴드 20봉 / 표준편차 2배 / 수축 비교 60봉 / 하위 25% 이하',
    executionNote:
      '매도 신호는 수익을 보장하지 않습니다(수익 미보장). 저장 일봉에서는 종가 판정 후 다음 봉 시가에 체결한다고 가정합니다. DEMO에서는 사용할 수 없습니다. 준비 봉은 max(밴드 기간+수축 비교 기간, 21)봉입니다.',
    fields: [
      {
        term: '밴드 기간 & 표준편차 배수',
        range: '기간 10-60 정수 · 배수 1.5-3 숫자',
        description:
          '종가 모집단 표준편차로 상단·중심·하단을 계산합니다. 스퀴즈 조건과 당일 거래량(직전 20봉 평균×1.2배 초과 >)을 충족하며 종가가 상단 초과(>)면 매수, 종가가 중심선 미만(<)이면 매도합니다. 기간이나 배수를 키우면 돌파가 줄고 줄이면 잦아집니다.',
      },
      {
        term: '수축 비교 기간 & 하위 분위수',
        range: '비교 기간 20-120 정수 · 분위수 10-50 숫자',
        description:
          '오늘을 제외한 직전 5봉 최소 밴드폭 비율이 직전 비교 기간 밴드폭의 하위 분위수(오름차순 ceil(N×p/100) 순위) 이하(<=)일 때 수축으로 봅니다. 분위수를 낮추면 극심한 응축만 허용하고 높이면 진입이 늘어납니다.',
      },
    ],
  },
  ttm_squeeze: {
    summary: '볼린저 밴드가 켈트너 채널 안으로 들어갔다가 풀리는 변동성 발산과 모멘텀 방향을 결합합니다.',
    envBadge: '저장 일봉 전용 · KIS 모의 정지 저장 가능(실시간 시작 제한)',
    basicPreset: '기간 20봉 / 볼린저 2배 / 켈트너 1.5배 (보수적·기본 동일)',
    executionNote:
      '매도 신호는 수익을 보장하지 않습니다(수익 미보장). 저장 일봉에서는 종가 판정 후 다음 봉 시가에 체결한다고 가정합니다. DEMO에서는 사용할 수 없습니다. 준비 봉은 기간+2봉입니다.',
    fields: [
      {
        term: '공통 계산 기간',
        range: '14-30 정수',
        description:
          'SMA 볼린저, EMA·Wilder ATR 켈트너, 모멘텀 기준선(종가−((기간 고저 중간값+SMA)/2))에 함께 사용합니다. 기간을 줄이면 수축 해제와 모멘텀 전환이 빨라지고 늘리면 완만해집니다.',
      },
      {
        term: '볼린저 배수 & 켈트너 배수',
        range: 'BB 1.5-2.5 숫자 · KC 1-2.5 숫자',
        description:
          '볼린저 상단 < 켈트너 상단(미만) 및 볼린저 하단 > 켈트너 하단(초과)이면 수축입니다. 직전 봉 수축이 오늘 해제되고 모멘텀이 0 초과(>)이며 직전 모멘텀 초과(>)로 커지면 매수, 모멘텀이 0 미만(<)이거나 양수에서 2봉 연속 미만(<)으로 둔화하면 매도합니다. BB 배수를 줄이거나 KC 배수를 키우면 수축 판정이 잦아집니다.',
      },
    ],
  },
  bollinger_percent_b: {
    summary: '볼린저 하단 부근 과매도 구간에서 %B와 종가가 함께 반등할 때 단기 복원을 노립니다.',
    envBadge: '저장 일봉 · DEMO 겸용 · KIS 모의 정지 저장 가능(실시간 시작 제한)',
    basicPreset: '볼린저 20봉 / 표준편차 2배 / RSI 14봉 / RSI 35 이하 / 청산 %B 0.55 이상',
    executionNote:
      '매도 신호는 수익을 보장하지 않습니다(수익 미보장). 저장 일봉은 종가 판정 후 다음 봉 시가, DEMO는 다음 합성 봉 종가에 체결한다고 가정합니다. 준비 봉은 max(볼린저 기간, RSI 기간+1)+1봉입니다.',
    fields: [
      {
        term: '볼린저 기간 & 표준편차 배수',
        range: '기간 14-30 정수 · 배수 1.8-2.5 숫자',
        description:
          '밴드 내 종가 위치 %B(폭이 0이면 0.5)를 계산합니다. 배수를 키우면 하단 이탈(%B <= 0.05) 빈도가 줄어 보수적이 되고, 줄이면 진입 기회가 늘어납니다.',
      },
      {
        term: 'RSI 기간 & 과매도 기준',
        range: 'RSI 기간 7-21 정수 · 기준 20-40 숫자',
        description:
          '직전 %B가 0.05 이하(<=)에서 오늘 %B와 종가가 모두 직전 봉 초과(>)로 상승하고 Wilder RSI가 기준 이하(<=)이면 매수합니다. 과매도 기준을 낮추면 깊은 침체만 고르고 높이면 더 빨리 진입합니다.',
      },
      {
        term: '청산 목표 %B',
        range: '0.4-1 숫자',
        description:
          '현재 %B가 목표 수준 이상(>=)에 도달하면 매도합니다. 값을 낮추면(예: 0.5) 중심선 부근에서 빠르게 청산하고, 높이면(예: 0.65) 더 큰 반등까지 보유합니다.',
      },
    ],
  },
  low_volume_pullback: {
    summary: '상승 추세 중 거래량이 줄어든 눌림목 뒤 직전 고가를 넘는 양봉 반전을 포착합니다.',
    envBadge: '저장 일봉 전용 · KIS 모의 정지 저장 가능(실시간 시작 제한)',
    basicPreset: '눌림 3봉 / 최대 거래량 0.65배 이하 / 단기 추세 20봉 / 장기 추세 60봉',
    executionNote:
      '매도 신호는 수익을 보장하지 않습니다(수익 미보장). 저장 일봉에서는 종가 판정 후 다음 봉 시가에 체결한다고 가정합니다. DEMO에서는 사용할 수 없습니다. 준비 봉은 max(장기 추세선, 21+눌림 기간)봉입니다.',
    fields: [
      {
        term: '눌림 기간 & 최대 거래량 비율',
        range: '눌림 2-7 정수 · 비율 0.3-0.9 숫자',
        description:
          '직전 눌림 구간 모든 종가가 구간 직전 기준봉 종가 미만(<)이고 눌림 평균 거래량이 직전 20봉 평균 × 비율 이하(<=)일 때, 오늘 양봉(종가 > 시가) 종가가 직전 봉 고가 초과(>)로 마감하면 매수합니다. 눌림 기간을 늘리거나 비율을 낮추면 진입이 까다로워집니다.',
      },
      {
        term: '단기 / 장기 추세선',
        range: '단기 10-30 정수 · 장기 40-120 정수 (단기 < 장기)',
        description:
          '단기 SMA와 종가가 모두 장기 SMA 초과(>)인 상승 추세에서만 매수합니다. 종가가 단기 SMA 미만(<)이거나 매 판정 시점 직전 눌림 기간 최저가 이하(<=)면 매도합니다. 기간을 줄이면 반응이 빨라지고 늘리면 큰 상승 추세에만 집중합니다.',
      },
    ],
  },
  disparity_reversion: {
    summary: '이동평균 대비 과도하게 벌어진 하방 이격에서 봉 내 하단 반등 마감 시 복원을 노립니다.',
    envBadge: '저장 일봉 전용 · KIS 모의 정지 저장 가능(실시간 시작 제한)',
    basicPreset: '이동평균 20봉 / 매수 93% 이하 / 매도 99.5% 이상 / 손절 5% 이하',
    executionNote:
      '매도·손절 신호는 수익을 보장하지 않으며 다음 봉 시가가 손절 기준보다 낮을 수 있습니다(수익 미보장). 저장 일봉에서는 종가 판정 후 다음 봉 시가에 체결한다고 가정합니다. DEMO에서는 사용할 수 없습니다. 준비 봉은 이동평균 기간봉입니다.',
    fields: [
      {
        term: '이동평균 기간',
        range: '10-60 정수',
        description:
          '이격도(종가/SMA×100)의 기준 평균선을 계산합니다. 기간을 줄이면 기준선이 주가를 빨리 따라가 괴리가 작아지고, 늘리면 중기 평균 대비 낙폭을 측정합니다.',
      },
      {
        term: '매수 이격도 & 매도 이격도',
        range: '매수 85-97 숫자 · 매도 98-105 숫자 (매수 < 매도)',
        description:
          '이격도가 매수 기준 이하(<=)이고 당일 고저 폭이 양수(고가 > 저가)이며 봉 내 종가 위치가 40% 이상(>=)이면 매수, 이격도가 매도 기준 이상(>=)이면 매도합니다. 매수 기준을 낮추면 더 큰 급락만 고르고 매도 기준을 높이면 더 큰 복원까지 보유합니다.',
      },
      {
        term: '손절 기준 (%)',
        range: '2-10 숫자',
        description:
          '종가가 실제 진입 체결가 대비 설정 손절률 이상 하락(종가 <= 진입 체결가×(1−손절%/100))하면 손절 매도 신호를 냅니다. 숫자를 줄이면 손실을 빨리 끊고 늘리면 흔들림을 더 견딥니다.',
      },
    ],
  },
};

/** 샹들리에 ATR 청산 오버레이 기본 초기값 안내. */
export const CHANDELIER_BASIC_PRESET = '기본 꺼짐 (활성화 시 초기값: ATR 기간 14봉 / ATR 배수 3배)';

/** 샹들리에 ATR 청산 오버레이 입력 항목 안내. */
export const CHANDELIER_FIELD_HELP: FieldHelpItem[] = [
  {
    term: '추적 손절 원리',
    range: '선택 오버레이 (고저가 필요 · 저장 일봉 전용)',
    description:
      '매수 후 도달한 최고가에서 하루 평균 변동폭(ATR) × 배수만큼 낮춘 추적 손절선을 계산합니다(한 번 올라간 손절선은 내려가지 않음). 장중 저가 터치가 아니라 저장 일봉에서는 봉의 종가가 추적 손절선 이하(<=)이면 전략 매도 신호보다 먼저 매도 신호를 내고 다음 봉 시가에 체결한다고 가정합니다. DEMO에서는 샹들리에를 사용할 수 없습니다.',
  },
  {
    term: 'ATR 기간 & ATR 배수',
    range: 'ATR 기간 7-30봉 · 배수 1.5-5배',
    description:
      '배수를 줄이면(예: 2.0) 손절선이 촘촘해져 빨리 청산하고, 늘리면(예: 3.0-4.0) 흔들림을 견디며 추세를 길게 탑니다.',
  },
];

/** 20 변동성 패리티 · RMS 포지션 사이징 오버레이 기본 초기값 안내. */
export const VOLATILITY_PARITY_BASIC_PRESET =
  '기본 꺼짐 (활성화 시 초기값: 관측 기간 20봉 / 목표 연환산 변동성 20% / 최대 배정 비중 100%)';

/** 20 변동성 패리티 · RMS 포지션 사이징 오버레이 입력 항목 안내. */
export const VOLATILITY_PARITY_FIELD_HELP: FieldHelpItem[] = [
  {
    term: '목표 변동성 사이징 원리',
    range: '선택 오버레이 (저장 일봉 전용 · DEMO 미지원)',
    description:
      '매수 체결 시 체결일 직전 확정 종가(관측 기간+1봉)의 단순 일간 수익률 모집단 표준편차 × √252 × 100으로 연환산 변동성을 계산합니다. 목표 비중 min(최대 배정 비중/100, 목표 변동성/실측 변동성)(변동성이 0이면 최대 배정 비중)만큼 현금 예산을 배정해 전체 현금과 배정 예산 각각에서 수수료를 감당하는 정수 수량 중 작은 값으로 매수하며(0주이면 보류), 준비 봉은 관측 기간+1과 규칙 준비 봉 중 큰 값을 사용합니다. DEMO에서는 사용할 수 없습니다.',
  },
  {
    term: '변동성 관측 기간',
    range: '10-60 정수 (기본 20봉)',
    description:
      '직전 확정 종가에서 일간 수익률을 산출할 거래일 수(필요 종가 기간+1봉)입니다. 기간을 줄이면 최근 변동성 급등에 빠르게 수량을 줄이고, 늘리면 비중이 완만하게 조절됩니다.',
  },
  {
    term: '목표 연환산 변동성 (%)',
    range: '5-60 숫자 (기본 20%)',
    description:
      '목표로 삼는 연환산 변동성 수준입니다. 값을 낮출수록 변동성이 큰 종목에서 매수 수량을 더 보수적으로 축소합니다.',
  },
  {
    term: '최대 배정 비중 (%)',
    range: '10-100 숫자 (기본 100%)',
    description:
      '실측 변동성이 매우 낮거나 0일 때도 현금 대비 한 번에 투입할 수 있는 최대 비중 상한입니다. 예: 50%면 가용 현금의 절반 이내로 매수 수량을 제한합니다.',
  },
];

/** `/strategies`와 `/backtest` 상단에서 열고 닫는 4탭 상세 사용방법 도움말 패널. */
export function ResearchHelpPanel({
  panelId,
  onClose,
}: {
  panelId: string;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<HelpTabId>('workflow');
  const tabRefs = useRef<Partial<Record<HelpTabId, HTMLButtonElement | null>>>({});

  function moveTab(nextIndex: number) {
    const normalized = (nextIndex + HELP_TABS.length) % HELP_TABS.length;
    const nextTab = HELP_TABS[normalized].id;
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveTab(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveTab(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      moveTab(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      moveTab(HELP_TABS.length - 1);
    }
  }

  return (
    <section
      id={panelId}
      className="panel research-help"
      role="region"
      aria-label="전략 스튜디오 및 백테스트 사용방법 도움말"
    >
      <div className="research-help-head">
        <div>
          <h2>전략 스튜디오 · 백테스트 사용방법</h2>
          <p className="research-help-sub">
            데이터 준비부터 규칙 선택, 백테스트 비교 검증, 전략 저장까지 순서와 항목 의미를 정리했습니다.
          </p>
        </div>
        <button type="button" className="button secondary small-button" onClick={onClose}>
          <X size={14} aria-hidden="true" />
          닫기
        </button>
      </div>

      <div className="research-help-tabs" role="tablist" aria-label="도움말 주제">
        {HELP_TABS.map((tab, index) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={el => {
                tabRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              id={`${panelId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${panelId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={'research-help-tab' + (selected ? ' active' : '')}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={event => handleTabKeyDown(event, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id={`${panelId}-panel-workflow`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-workflow`}
        tabIndex={activeTab === 'workflow' ? 0 : undefined}
        hidden={activeTab !== 'workflow'}
        className="research-help-body"
      >
        <ol className="research-help-steps">
          <li>
            <span className="research-help-step-no">1단계</span>
            <h3>데이터 준비</h3>
            <p>
              과거 일봉 실험을 위해{' '}
              <Link className="text-link" to="/data#inventory-daily">
                데이터 상태 (/data)
              </Link>
              에서 종목의 KIS 일봉 수집과 달력 대조(<code>passed</code>)가 완료되어 있는지 확인합니다. 합성 봉 연습은
              수집 없이 바로 가능합니다.
            </p>
          </li>
          <li>
            <span className="research-help-step-no">2단계</span>
            <h3>규칙과 프리셋 선택</h3>
            <p>
              전략 스튜디오나 백테스트에서 11종 전략 규칙(저장 일봉 전체 11종 · DEMO 종가 전용 4종:{' '}
              <code>이동평균 교차</code>, <code>RSI 단기 눌림목</code>, <code>MACD 히스토그램</code>,{' '}
              <code>볼린저 %B 반등</code>) 중 하나를 고르고 <strong>[보수적 / 기본 / 공격적]</strong> 프리셋 버튼으로
              시작값을 채운 뒤 필요하면 <code>샹들리에 ATR 청산</code>이나{' '}
              <code>변동성 패리티 · RMS 사이징</code> 오버레이를 켭니다.
            </p>
          </li>
          <li>
            <span className="research-help-step-no">3단계</span>
            <h3>저장 전 백테스트 검증</h3>
            <p>
              바로 저장하지 않고 <strong>이 설정으로 백테스트</strong> 버튼을 눌러 과거 구간 수익률·최대낙폭(MDD)·체결
              횟수를 확인합니다. 다중 전략·EMA·필터·오버레이·장기 101-120(<code>v2</code>) 실행 시에는{' '}
              <strong>단순 보유(저장 일봉은 첫 봉 시가, DEMO는 첫 합성 봉 종가 매수 기준)</strong>와의 비교도 함께
              표시됩니다.
            </p>
          </li>
          <li>
            <span className="research-help-step-no">4단계</span>
            <h3>검증 배지 저장 및 실행</h3>
            <p>
              <strong>KIS 저장 일봉 실험</strong> 결과 화면의 <strong>이 설정으로 전략 만들기</strong> 버튼을 눌러
              돌아오면 <strong>검증 실험 연결</strong> 배지가 자동으로 붙습니다(DEMO 합성 백테스트는 기능 검증 전용으로
              전략 연결·재현 검증 미제공). 이름을 정해 저장한 뒤 DEMO 재생 또는 KIS 모의 계약 연결로 실행합니다.
            </p>
          </li>
        </ol>
      </div>

      <div
        id={`${panelId}-panel-dictionary`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-dictionary`}
        tabIndex={activeTab === 'dictionary' ? 0 : undefined}
        hidden={activeTab !== 'dictionary'}
        className="research-help-body"
      >
        <div className="research-help-grid">
          {RULE_KINDS.map(kind => (
            <article key={kind} className="research-help-card">
              <h3>
                {STRATEGY_CATALOG[kind].title} <code>{kind}</code>
              </h3>
              <p className="research-help-env-line">{RULE_FIELD_HELP[kind].envBadge}</p>
              <p className="research-help-card-note">{RULE_FIELD_HELP[kind].summary}</p>
              <p className="research-help-preset">
                <strong>기본 프리셋 초기값:</strong> {RULE_FIELD_HELP[kind].basicPreset}
              </p>
              <p className="research-help-exec-note">{RULE_FIELD_HELP[kind].executionNote}</p>
              <dl className="research-help-dl">
                {RULE_FIELD_HELP[kind].fields.map(item => (
                  <div key={item.term}>
                    <dt>
                      {item.term} <small>{item.range}</small>
                    </dt>
                    <dd>{item.description}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
          <article className="research-help-card">
            <h3>
              19 샹들리에 ATR 청산 오버레이 <code>chandelier</code>
            </h3>
            <p className="research-help-env-line">저장 일봉 전용 · DEMO 미지원 · KIS 모의 정지 저장 가능(실시간 시작 제한)</p>
            <p className="research-help-card-note">
              전략 기본 매도 신호와 별개로 변동성 기반 추적 손절선을 함께 적용하는 보호 장치입니다.
            </p>
            <p className="research-help-preset">
              <strong>초기값:</strong> {CHANDELIER_BASIC_PRESET}
            </p>
            <dl className="research-help-dl">
              {CHANDELIER_FIELD_HELP.map(item => (
                <div key={item.term}>
                  <dt>
                    {item.term} <small>{item.range}</small>
                  </dt>
                  <dd>{item.description}</dd>
                </div>
              ))}
            </dl>
          </article>
          <article className="research-help-card">
            <h3>
              20 변동성 패리티 · RMS 포지션 사이징 <code>volatilityParity</code>
            </h3>
            <p className="research-help-env-line">저장 일봉 전용 · DEMO 미지원 · KIS 모의 정지 저장 가능(실시간 시작 제한)</p>
            <p className="research-help-card-note">
              종목의 최근 실현 변동성에 반비례해 매수 투입 비중과 정수 수량을 자동 조절하는 공통 리스크 사이징 오버레이입니다.
            </p>
            <p className="research-help-preset">
              <strong>초기값:</strong> {VOLATILITY_PARITY_BASIC_PRESET}
            </p>
            <dl className="research-help-dl">
              {VOLATILITY_PARITY_FIELD_HELP.map(item => (
                <div key={item.term}>
                  <dt>
                    {item.term} <small>{item.range}</small>
                  </dt>
                  <dd>{item.description}</dd>
                </div>
              ))}
            </dl>
          </article>
        </div>
      </div>

      <div
        id={`${panelId}-panel-results`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-results`}
        tabIndex={activeTab === 'results' ? 0 : undefined}
        hidden={activeTab !== 'results'}
        className="research-help-body"
      >
        <div className="research-help-grid">
          <article className="research-help-card">
            <h3>전략 vs 단순 보유(벤치마크) 비교 · 초과 수익률(%p)</h3>
            <p>
              <code>v2</code> 규칙·EMA·필터·오버레이 또는 장기 101-120 실행 시에만 표시됩니다(필터·오버레이가 없는 기본
              SMA 장기 100 이하는 <code>v1</code> 경로라 단순 보유 비교 미표시). 단순 보유 기준가는{' '}
              <strong>KIS 저장 일봉은 첫 봉 시가, DEMO 합성은 첫 합성 봉 종가</strong>이며, 가만히 보유했을 때 대비
              전략의 초과 수익률(%p)을 보여줍니다.
            </p>
          </article>
          <article className="research-help-card">
            <h3>최대 낙폭 (MDD)</h3>
            <p>
              실험 기간 중 최고 평가자산 대비 가장 많이 하락했던 폭(%)입니다. 수익률이 비슷하다면 최대 낙폭이 낮은 전략이
              손실 압박이 적어 더 안정적입니다.
            </p>
          </article>
          <article className="research-help-card">
            <h3>수수료(bp)와 슬리피지(bp)</h3>
            <p>
              <code>1bp = 0.01%</code>입니다. 슬리피지는 주문 시 호가 차이로 조금 더 비싸게 사고 싸게 팔리는 현실적
              불리함을 반영합니다. 세금·배당·기업행사는 계산에 포함하지 않습니다.
            </p>
          </article>
          <article className="research-help-card">
            <h3>고정 입력 재현 검증 (KIS 저장 일봉 전용)</h3>
            <p>
              <strong>KIS 저장 일봉 실험</strong>에서만 제공됩니다(DEMO 합성 백테스트 미제공).{' '}
              <strong>SHA256</strong>은 저장된 입력 스냅샷의 해시를 대조해 입력 위변조 여부를 확인하고,{' '}
              <strong>결과 일치</strong>는 저장된 스냅샷으로 엔진을 다시 실행한 뒤 기존 저장 결과와 동등성을 별도로
              비교해 검증합니다.
            </p>
          </article>
          <article className="research-help-card">
            <h3>당일 목표가 체결 &amp; 변동성 패리티 수량 조절</h3>
            <p>
              기존 10종 일봉 규칙은 종가 판정 후 다음 봉 시가에 체결한다고 가정하지만,{' '}
              <code>윌리엄스 변동성 돌파</code>는 전일 확정 OHLC로 계산한 당일 목표가를 고가가 돌파(&gt;=)하면 당일
              기준가 <code>max(시가, 목표가)</code>에 매수하고 이후 봉 시가에 청산한다고 가정합니다. 공통 오버레이{' '}
              <code>변동성 패리티</code>를 켜면 매수 시 직전 확정 종가 변동성에 맞춰 투입 비중과 정수 수량을 제한합니다.
            </p>
          </article>
        </div>
      </div>

      <div
        id={`${panelId}-panel-faq`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-faq`}
        tabIndex={activeTab === 'faq' ? 0 : undefined}
        hidden={activeTab !== 'faq'}
        className="research-help-body"
      >
        <div className="research-help-faq">
          <article className="research-help-card">
            <h3>Q. 왜 11종 전략 중 일부와 오버레이 2종은 DEMO에서 저장/실행이 안 되나요?</h3>
            <p>
              DEMO 합성 봉은 종가 하나만 생성합니다. 종가만 쓰는 4종(<code>이동평균 교차</code>(거래량 필터 끔),{' '}
              <code>RSI 단기 눌림목</code>, <code>MACD 히스토그램</code>, <code>볼린저 %B 반등</code>)만 DEMO
              저장·백테스트를 지원합니다. 시가·고가·저가·거래량이 필요한 7종(<code>돈키안 돌파</code>,{' '}
              <code>윌리엄스 변동성 돌파</code>, <code>ADX·DMI 추세</code>, <code>볼린저 스퀴즈</code>,{' '}
              <code>TTM 스퀴즈</code>, <code>거래량 고갈 눌림목</code>, <code>이격도 복원</code>)과 이동평균 거래량
              필터·<code>샹들리에 청산</code>·<code>변동성 패리티</code> 오버레이는 실제 일봉 데이터가 있는{' '}
              <strong>KIS 저장 일봉 백테스트</strong>에서만 정확히 계산할 수 있어 DEMO 저장·실행을 차단합니다.
            </p>
          </article>
          <article className="research-help-card">
            <h3>Q. 왜 새로 만든 다중 전략이나 장기 101-120 SMA가 KIS 모의에서 전략 시작이 잠겨 있나요?</h3>
            <p>
              KIS 모의 계좌에 실제 주문을 내보내는 실시간 장중 평가는 현재 필터·오버레이가 없는 기본 SMA(장기 100 이하)만
              열려 있습니다. 필터·오버레이가 없는 기본 SMA라도 장기 기간이 <code>101-120</code>이면 KIS 모의에서{' '}
              <strong>정지 상태(active=false) 저장과 저장 일봉 백테스트는 가능하지만</strong>, KIS 실시간 시작 계약
              상한(100 이하)에 따라 <strong>전략 시작</strong>은 차단됩니다. 다중 전략·오버레이 역시 백테스트로 검증한 뒤
              후속 장전 레벨 트리거 계약 단계에서 안전하게 열립니다.
            </p>
          </article>
          <article className="research-help-card">
            <h3>Q. 검증 실험 연결 배지가 왜 사라졌나요?</h3>
            <p>
              백테스트에서 넘어온 뒤 종목이나 규칙 숫자를 하나라도 바꾸면 검증받았던 원래 설정과 달라집니다. 허위 검증
              표시를 막기 위해 설정이 바뀌는 즉시 배지가 자동 해제됩니다.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
