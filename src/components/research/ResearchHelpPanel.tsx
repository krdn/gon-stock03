import { useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { RULE_KINDS, ruleTitle, type RuleKind } from '../../pages/research-rule-form';

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
    envBadge: '저장 일봉 · DEMO 겸용(거래량 필터 끔) · KIS 모의(무필터 SMA 100 이하 체결가 / EMA·필터 확정 일봉 / 무필터 SMA 101-120 시작 차단)',
    basicPreset: 'SMA, 단기 5 / 장기 20 (추세·거래량 필터 꺼짐)',
    executionNote:
      '매도 신호는 현재 수익 여부를 보장하지 않습니다(수익 미보장). 저장 일봉은 종가 판정 후 다음 봉 시가, 거래량 필터를 끈 DEMO는 다음 합성 봉 종가에 체결한다고 가정합니다. KIS 모의에서는 무필터 SMA(장기 100 이하)는 실시간 체결가(H0STCNT0) 교차로 평가하고, EMA·추세/거래량 필터·샹들리에 적용 시에는 전용 원장에 복사된 직전 KRX 개장일 확정 일봉으로 당일 1회 집행합니다(계약 고정 후 추가 수집 일봉 자동 미반영; 무필터 SMA 장기 101-120은 정지 저장만 가능). 준비 봉은 max(장기+1, 추세 필터, 거래량 필터 사용 시 21)봉입니다.',
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
    envBadge: '저장 일봉 · KIS 모의(확정 일봉 기반 당일 1회) · DEMO 미지원',
    basicPreset: '진입 고가 20봉 / 청산 저가 10봉 / 최소 거래량 1배 초과',
    executionNote:
      '매도 신호는 수익을 보장하지 않습니다(수익 미보장). 저장 일봉에서는 종가 판정 후 다음 봉 시가에 체결한다고 가정합니다. DEMO에서는 사용할 수 없습니다. KIS 모의에서는 전용 원장에 복사된 직전 KRX 개장일 확정 일봉 신호로 당일 1회 집행합니다(계약 고정 후 추가 수집 일봉 자동 미반영). 준비 봉은 max(진입 기간, 20)+1봉입니다.',
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
    envBadge: '저장 일봉 백테스트 전용 · DEMO 미지원 · KIS 모의 정지 저장만 가능(시작·계약 고정 차단)',
    basicPreset: '돌파 계수 k 0.5 / 적응형 노이즈 꺼짐 / 노이즈 20봉 / 추세 SMA 20봉 / 보유 1일',
    executionNote:
      '매도·청산 신호는 수익을 보장하지 않습니다(수익 미보장). 저장 일봉 백테스트 전용 규칙이며 DEMO에서는 사용할 수 없고 KIS 모의에서는 정지 상태(active=false) 저장만 가능하며 시작·계약 고정은 차단됩니다. 전일 확정 OHLC로 추세와 변동폭을 확정한 뒤 당일 고가가 목표가 이상(>=)이면 당일 기준가 max(시가, 목표가)로 매수 체결을 가정합니다(호가 단위 반올림 없음). 진입 당일에는 청산하지 않고, 이후 봉부터 전일 종가 기준 샹들리에 손절 또는 보유일 도달 시 당일 시가에 전량 청산합니다(시가 청산 봉 당일 재진입 금지). 준비 봉은 max(노이즈 기간, 추세 SMA 기간)봉입니다.',
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
    envBadge: '저장 일봉 · DEMO 겸용 · KIS 모의(확정 일봉 기반 당일 1회)',
    basicPreset: 'RSI 기간 2봉 / 과매도 기준 10 이하 / 장기 추세선 200봉 / 청산 단기선 5봉 / 최대 보유 10봉',
    executionNote:
      '매도/청산 신호는 현재 수익 여부를 검사하지 않으므로 수익을 보장하지 않습니다(수익 미보장). 저장 일봉은 종가 판정 후 다음 봉 시가, DEMO는 다음 합성 봉 종가에 체결한다고 가정합니다. KIS 모의에서는 전용 원장에 복사된 직전 KRX 개장일 확정 일봉 신호로 당일 1회 집행합니다(계약 고정 후 추가 수집 일봉 자동 미반영). 준비 봉은 max(장기 추세선, 청산 단기선, RSI 기간+1)봉입니다.',
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
    envBadge: '저장 일봉 · DEMO 겸용 · KIS 모의(확정 일봉 기반 당일 1회)',
    basicPreset: '단기 12봉 / 장기 26봉 / 시그널 9봉 / 제로선 위 필터 꺼짐',
    executionNote:
      '매도 신호는 수익을 보장하지 않습니다(수익 미보장). 저장 일봉은 종가 판정 후 다음 봉 시가, DEMO는 다음 합성 봉 종가에 체결한다고 가정합니다. KIS 모의에서는 전용 원장에 복사된 직전 KRX 개장일 확정 일봉 신호로 당일 1회 집행합니다(계약 고정 후 추가 수집 일봉 자동 미반영). 준비 봉은 장기+시그널+10봉입니다.',
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
    envBadge: '저장 일봉 · KIS 모의(확정 일봉 기반 당일 1회) · DEMO 미지원',
    basicPreset: 'DI 기간 14봉 / ADX 기준 25 이상',
    executionNote:
      '매도 신호는 수익을 보장하지 않습니다(수익 미보장). 저장 일봉에서는 종가 판정 후 다음 봉 시가에 체결한다고 가정합니다. DEMO에서는 사용할 수 없습니다. KIS 모의에서는 전용 원장에 복사된 직전 KRX 개장일 확정 일봉 신호로 당일 1회 집행합니다(계약 고정 후 추가 수집 일봉 자동 미반영). 준비 봉은 2×DI 기간봉입니다.',
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
    envBadge: '저장 일봉 · KIS 모의(확정 일봉 기반 당일 1회) · DEMO 미지원',
    basicPreset: '밴드 20봉 / 표준편차 2배 / 수축 비교 60봉 / 하위 25% 이하',
    executionNote:
      '매도 신호는 수익을 보장하지 않습니다(수익 미보장). 저장 일봉에서는 종가 판정 후 다음 봉 시가에 체결한다고 가정합니다. DEMO에서는 사용할 수 없습니다. KIS 모의에서는 전용 원장에 복사된 직전 KRX 개장일 확정 일봉 신호로 당일 1회 집행합니다(계약 고정 후 추가 수집 일봉 자동 미반영). 준비 봉은 max(밴드 기간+수축 비교 기간, 21)봉입니다.',
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
    envBadge: '저장 일봉 · KIS 모의(확정 일봉 기반 당일 1회) · DEMO 미지원',
    basicPreset: '기간 20봉 / 볼린저 2배 / 켈트너 1.5배 (보수적·기본 동일)',
    executionNote:
      '매도 신호는 수익을 보장하지 않습니다(수익 미보장). 저장 일봉에서는 종가 판정 후 다음 봉 시가에 체결한다고 가정합니다. DEMO에서는 사용할 수 없습니다. KIS 모의에서는 전용 원장에 복사된 직전 KRX 개장일 확정 일봉 신호로 당일 1회 집행합니다(계약 고정 후 추가 수집 일봉 자동 미반영). 준비 봉은 기간+2봉입니다.',
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
    envBadge: '저장 일봉 · DEMO 겸용 · KIS 모의(확정 일봉 기반 당일 1회)',
    basicPreset: '볼린저 20봉 / 표준편차 2배 / RSI 14봉 / RSI 35 이하 / 청산 %B 0.55 이상',
    executionNote:
      '매도 신호는 수익을 보장하지 않습니다(수익 미보장). 저장 일봉은 종가 판정 후 다음 봉 시가, DEMO는 다음 합성 봉 종가에 체결한다고 가정합니다. KIS 모의에서는 전용 원장에 복사된 직전 KRX 개장일 확정 일봉 신호로 당일 1회 집행합니다(계약 고정 후 추가 수집 일봉 자동 미반영). 준비 봉은 max(볼린저 기간, RSI 기간+1)+1봉입니다.',
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
    envBadge: '저장 일봉 · KIS 모의(확정 일봉 기반 당일 1회) · DEMO 미지원',
    basicPreset: '눌림 3봉 / 최대 거래량 0.65배 이하 / 단기 추세 20봉 / 장기 추세 60봉',
    executionNote:
      '매도 신호는 수익을 보장하지 않습니다(수익 미보장). 저장 일봉에서는 종가 판정 후 다음 봉 시가에 체결한다고 가정합니다. DEMO에서는 사용할 수 없습니다. KIS 모의에서는 전용 원장에 복사된 직전 KRX 개장일 확정 일봉 신호로 당일 1회 집행합니다(계약 고정 후 추가 수집 일봉 자동 미반영). 준비 봉은 max(장기 추세선, 21+눌림 기간)봉입니다.',
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
    envBadge: '저장 일봉 · KIS 모의(확정 일봉 기반 당일 1회) · DEMO 미지원',
    basicPreset: '이동평균 20봉 / 매수 93% 이하 / 매도 99.5% 이상 / 손절 5% 이하',
    executionNote:
      '매도·손절 신호는 수익을 보장하지 않으며 다음 봉 시가가 손절 기준보다 낮을 수 있습니다(수익 미보장). 저장 일봉에서는 종가 판정 후 다음 봉 시가에 체결한다고 가정합니다. DEMO에서는 사용할 수 없습니다. KIS 모의에서는 전용 원장에 복사된 직전 KRX 개장일 확정 일봉 신호로 당일 1회 집행합니다(계약 고정 후 추가 수집 일봉 자동 미반영). 준비 봉은 이동평균 기간봉입니다.',
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
  dual_momentum: {
    summary:
      '리밸런싱일 종가 기준 최근 수익률이 양수(> 0)인 위험 자산 중 1위 종목에 100% 배분하고, 모두 0 이하이면 안전자산 또는 현금으로 전환합니다.',
    envBadge: '저장 일봉: 다종목 자산배분 (v3) · DEMO 미지원 · KIS 모의 정지 저장만 가능(시작·계약 고정 차단)',
    basicPreset: '모멘텀 관측 60봉 / 리밸런싱 20봉 (보수적 120/20 · 공격적 20/10 · 위험 자산 2-6종 · 안전자산 선택)',
    executionNote:
      '매도·리밸런싱은 수익을 보장하지 않습니다(수익 미보장). 저장 일봉 다종목 백테스트(v3) 전용이며 DEMO 저장·합성 백테스트는 차단되고, KIS 모의에서는 정지 상태(active=false) 저장만 가능하며 시작·계약 고정은 차단됩니다(단일 종목 공통 오버레이 미지원). 바스켓 전 종목의 거래일 달력이 100% 일치해야 하며, 리밸런싱일 종가 판정 후 다음 봉 시가에 슬리피지 전 시가 총평가액 기준으로 목표 정수 수량을 산출해 매도를 선행한 뒤 가용 현금 내 정수 수량만 매수하고 잔여 현금을 보유합니다. 동일 비중을 유지하는 리밸런싱에서도 슬리피지·수수료를 포함한 목표 수량 재산정으로 소폭 축소 매도가 발생할 수 있으며, 매수 현금이 부족하면 위험 자산(assets) 입력 순서 뒤쪽 종목의 체결 수량이 줄어들 수 있습니다. 수익률이 같으면 입력한 위험 자산 앞 순서 종목이 우선합니다. 벤치마크는 위험 자산 동일 비중 첫 시가 보유이며 분배금·배당·세금은 미포함이고, 현재 상장 종목 선택에 따른 생존 편향에 유의하세요. 최소 준비 봉은 관측 기간+2봉(판정 lookbackDays+1봉 + 다음 봉 시가 체결 1봉, 기본 62봉)입니다.',
    fields: [
      {
        term: '위험 자산 바스켓 (assets)',
        range: '2-6개 종목코드 (6자리 영숫자 · 중복 금지 · 순서 보존)',
        description:
          '상대·절대 모멘텀을 비교할 위험 자산 목록입니다. 수익률(당일 종가/N봉전 종가 − 1)이 0 초과(> 0)인 종목 중 최댓값 1종에 100% 배분하며, 동률이면 앞 순서 종목이 우선합니다. 대표 종목(code)은 위험 자산 1과 자동 동기화됩니다.',
      },
      {
        term: '안전자산 (safeAsset, 선택)',
        range: '6자리 영숫자 코드 또는 비움 (assets와 중복 금지)',
        description:
          '모든 위험 자산의 모멘텀이 0 이하(<= 0)일 때 100% 배분할 방어 자산입니다. 비워두면(null) 하락·약세 구간에서 현금을 100% 보유합니다.',
      },
      {
        term: '모멘텀 관측 기간 (lookbackDays)',
        range: '20-252 정수 (기본 60봉)',
        description:
          '수익률을 측정할 과거 거래일 간격입니다. 기간을 줄이면 최근 추세 변화에 빠르게 갈아타고, 늘리면 중장기 모멘텀 우위 종목에 집중합니다.',
      },
      {
        term: '리밸런싱 주기 (rebalanceDays)',
        range: '5-60 정수 (기본 20봉)',
        description:
          '첫 준비 완료 종가 이후 다음 리밸런싱 판정까지의 거래일 간격입니다. 주기를 줄이면 대응이 빨라지지만 수수료·슬리피지가 늘어날 수 있습니다.',
      },
    ],
  },
  faber_gtaa: {
    summary:
      '리밸런싱일 종가가 이동평균선을 초과(>)하는 위험 자산에 각각 1/N 동일 비중을 배분하고, 이탈(<=) 비중은 안전자산 또는 현금으로 돌립니다.',
    envBadge: '저장 일봉: 다종목 자산배분 (v3) · DEMO 미지원 · KIS 모의 정지 저장만 가능(시작·계약 고정 차단)',
    basicPreset: '추세 SMA 120봉 / 리밸런싱 20봉 (보수적 200/20 · 공격적 60/10 · 위험 자산 2-6종 · 안전자산 선택)',
    executionNote:
      '매도·리밸런싱은 수익을 보장하지 않습니다(수익 미보장). 저장 일봉 다종목 백테스트(v3) 전용이며 DEMO 저장·합성 백테스트는 차단되고, KIS 모의에서는 정지 상태(active=false) 저장만 가능하며 시작·계약 고정은 차단됩니다(단일 종목 공통 오버레이 미지원). 바스켓 전 종목의 거래일 달력이 100% 일치해야 하며, 리밸런싱일 종가 판정 후 다음 봉 시가에 슬리피지 전 시가 총평가액 기준으로 목표 정수 수량을 산출해 매도를 선행한 뒤 가용 현금 내 정수 수량만 매수하고 잔여 현금을 보유합니다. 동일 비중을 유지하는 리밸런싱에서도 슬리피지·수수료를 포함한 목표 수량 재산정으로 소폭 축소 매도가 발생할 수 있으며, 매수 현금이 부족하면 위험 자산(assets) 입력 순서 뒤쪽 종목의 체결 수량이 줄어들 수 있습니다. 당일 포함 단순 이동평균(SMA) 초과(>) 위험 자산에만 1/N씩 배분하고 나머지 (N−선정 수)/N 비중은 안전자산(비우면 현금)으로 배분합니다. 벤치마크는 위험 자산 동일 비중 첫 시가 보유이며 분배금·배당·세금은 미포함이고, 현재 상장 종목 선택에 따른 생존 편향에 유의하세요. 최소 준비 봉은 SMA 기간+1봉(판정 smaPeriod봉 + 다음 봉 시가 체결 1봉, 기본 121봉)입니다.',
    fields: [
      {
        term: '위험 자산 바스켓 (assets)',
        range: '2-6개 종목코드 (6자리 영숫자 · 중복 금지)',
        description:
          '분산 투자할 위험 자산 목록(N종)입니다. 리밸런싱일 종가가 당일 포함 SMA를 초과(>)하는 종목에 각각 1/N 동일 비중을 배분합니다. 대표 종목(code)은 위험 자산 1과 자동 동기화됩니다.',
      },
      {
        term: '안전자산 (safeAsset, 선택)',
        range: '6자리 영숫자 코드 또는 비움 (assets와 중복 금지)',
        description:
          '종가가 SMA 이하(<=)인 위험 자산들의 미배정 비중 합계((N−선정 수)/N)를 옮겨 담을 방어 자산입니다. 비워두면(null) 해당 비중만큼 현금을 보유합니다.',
      },
      {
        term: '추세 이동평균 기간 (smaPeriod)',
        range: '20-250 정수 (기본 120봉)',
        description:
          '각 위험 자산의 추세 유지 여부를 판정할 당일 포함 단순 이동평균(SMA) 기간입니다. 기간을 늘리면 잦은 교체를 줄이고, 줄이면 하락 전환에 빠르게 방어합니다.',
      },
      {
        term: '리밸런싱 주기 (rebalanceDays)',
        range: '5-60 정수 (기본 20봉)',
        description:
          '첫 준비 완료 종가 이후 다음 비중 재조정까지의 거래일 간격입니다. 주기를 줄이면 추세 변화에 빠르게 반응하지만 거래 비용이 늘어날 수 있습니다.',
      },
    ],
  },
  krx_sector_rs: {
    summary:
      '리밸런싱일 종가 기준 최근 수익률이 양수(> 0)이고 구간 최고 고가 대비 종가 유지율이 90% 이상(>= 0.90)인 위험 자산 중 상대강도 점수(수익률×고점 유지율) 상위 K종에 종목당 상한 이내 동일 비중을 배분합니다.',
    envBadge: '저장 일봉: 다종목 자산배분 (v3) · DEMO 미지원 · KIS 모의 정지 저장만 가능(시작·계약 고정 차단)',
    basicPreset:
      '관측 20봉 / 상위 2종 / 종목 상한 50% / 리밸런싱 20봉 (보수적 60/2/40/20 · 공격적 10/3/60/10 · 위험 자산 2-6종 · 안전자산 선택)',
    executionNote:
      '매도·리밸런싱은 수익을 보장하지 않습니다(수익 미보장). 저장 일봉 다종목 백테스트(v3) 전용이며 DEMO 저장·합성 백테스트는 차단되고, KIS 모의에서는 정지 상태(active=false) 저장만 가능하며 시작·계약 고정은 차단됩니다(단일 종목 공통 오버레이 미지원). [원안 대비 변형 범위] 사용자 지정 섹터 대용 자산의 가격 상대강도(t−L 종가 대비 수익률 R_c > 0, 최근 L봉 최고 고가 대비 현재 종가 유지율 P_c >= 0.90, 점수 R_c × P_c)로만 판정하며, 동일 시점 섹터·ETF 구성비·중복 섹터 합산·섹터 잔여 한도는 미구현입니다. 선정 수 k에 대해 각 min(1/k, maxWeightPct/100)을 배분하며 maxWeightPct는 선정 위험자산별 상한(safeAsset 미적용)이고 잔여 비중은 안전자산(비우면 현금)으로 돌립니다. 바스켓 전 종목 거래일 달력 100% 일치·다음 봉 시가 체결·매도 선행 후 정수 수량 매수·동일 비중 유지 시 소폭 축소 매도 가능·현금 부족 시 assets 뒤쪽 종목 수량 축소 가능·동률 시 입력 앞 순서 우선·위험 자산 동일 비중 첫 시가 벤치마크·분배금/배당/세금 미포함·생존 편향에 유의하세요. 최소 준비 봉은 rsLookbackDays+2봉(판정 rsLookbackDays+1봉 + 다음 봉 시가 체결 1봉, 기본 22봉 · 보수적 62봉 · 공격적 12봉)입니다.',
    fields: [
      {
        term: '위험 자산 바스켓 (assets)',
        range: '2-6개 종목코드 (6자리 영숫자 · 중복 금지 · 순서 보존)',
        description:
          '사용자 지정 섹터 대용 위험 자산 목록입니다. 동일 시점 업종 분류·ETF 구성비·중복 섹터 합산·섹터 잔여 한도는 미구현이므로 동일 업종 중복 편입에 유의하세요. 동률 시 앞 순서 종목이 우선하며 대표 종목(code)은 위험 자산 1과 자동 동기화됩니다.',
      },
      {
        term: '안전자산 (safeAsset, 선택)',
        range: '6자리 영숫자 코드 또는 비움 (assets와 중복 금지)',
        description:
          '적격 위험 자산이 없거나 종목당 최대 비중 상한(maxWeightPct) 적용 후 남은 잔여 비중을 옮겨 담을 방어 자산입니다. maxWeightPct 상한은 선정 위험자산별 상한이며 safeAsset에는 적용되지 않습니다. 비워두면(null) 잔여 비중을 현금으로 보유합니다.',
      },
      {
        term: '상대강도 관측 기간 (rsLookbackDays)',
        range: '10-120 정수 (기본 20봉)',
        description:
          't−L 종가 대비 수익률(R_c > 0)과 최근 L봉 최고 고가 대비 현재 종가 유지율(P_c >= 0.90)을 측정할 거래일 수입니다. 기간을 줄이면 단기 주도 섹터로 빠르게 교체되고, 늘리면 중기 강세 종목 위주로 선별합니다.',
      },
      {
        term: '상위 선정 종목 수 (topK)',
        range: '1-5 정수 (기본 2종)',
        description:
          '적격 위험 자산 중 상대강도 점수(R_c × P_c) 순으로 편입할 최대 종목 수(K)입니다. 선정 수 k에 대해 종목당 min(1/k, maxWeightPct/100)을 배분합니다.',
      },
      {
        term: '종목당 최대 비중 상한 (maxWeightPct)',
        range: '20-100 정수 % (기본 50%)',
        description:
          '선정된 각 위험 자산 1종에 배정할 수 있는 최대 비중 상한입니다(선정 위험자산별 상한 · safeAsset 미적용). 예: 1종만 적격이고 상한이 50%면 위험 자산 50%, 나머지 50%는 안전자산(또는 현금)에 배분됩니다.',
      },
      {
        term: '리밸런싱 주기 (rebalanceDays)',
        range: '5-60 정수 (기본 20봉)',
        description:
          '첫 준비 완료 종가 이후 다음 상대강도 재평가까지의 거래일 간격입니다. 주기를 줄이면 대응이 빨라지지만 수수료·슬리피지가 늘어날 수 있습니다.',
      },
    ],
  },
  clenow_momentum: {
    summary:
      '리밸런싱일 종가가 종목 추세 SMA를 초과(>)하고 로그 종가 선형회귀 연율화 기울기×결정계수(252βR²)가 양수(> 0)인 상위 K종 위험 자산에 Wilder ATR 역변동성 비중을 배분합니다.',
    envBadge: '저장 일봉: 다종목 자산배분 (v3) · DEMO 미지원 · KIS 모의 정지 저장만 가능(시작·계약 고정 차단)',
    basicPreset:
      '회귀 90봉 / ATR 20봉 / 추세 SMA 100봉 / 상위 2종 / 위험예산 20bp / 리밸런싱 20봉 (보수적 120/20/200/2/10/20 · 공격적 60/14/60/3/35/10 · 위험 자산 2-6종 · 안전자산 선택)',
    executionNote:
      '매도·리밸런싱은 수익을 보장하지 않습니다(수익 미보장). 저장 일봉 다종목 백테스트(v3) 전용이며 DEMO 저장·합성 백테스트는 차단되고, KIS 모의에서는 정지 상태(active=false) 저장만 가능하며 시작·계약 고정은 차단됩니다(단일 종목 공통 오버레이 미지원). [원안 대비 변형 범위] 원안의 별도 시장 지수 200일 레짐과 고정 종목 100일 조건을 종목별 설정 SMA(regimeSmaPeriod) 초과(close > SMA, 기본 100일)로 대체했고, 점수는 연율화 로그 기울기 점수 252βR²(beta > 0 && R² > 0)를 사용합니다. 원시 비중은 (riskPerAssetBps/10000)/(Wilder ATR/종가)이며 합이 1을 넘으면 비례 축소하고 1 미만 잔여 비중은 안전자산(비우면 현금)으로 배분합니다. Wilder ATR 비율(ATR/종가)이 0 또는 비유한일 때 적용하는 대체 비중(1/K)은 ATR 위험예산을 보장하지 않으며, Wilder ATR은 조회 시작일 첫 봉부터 평활하므로 관측 시작일이 달라지면 같은 신호일이라도 비중이 달라질 수 있습니다. 바스켓 전 종목 거래일 달력 100% 일치·다음 봉 시가 체결·매도 선행 후 정수 수량 매수·동일 비중 유지 시 소폭 축소 매도 가능·현금 부족 시 assets 뒤쪽 종목 수량 축소 가능·동률 시 입력 앞 순서 우선·위험 자산 동일 비중 첫 시가 벤치마크·분배금/배당/세금 미포함·생존 편향에 유의하세요. 최소 준비 봉은 max(regressionDays, regimeSmaPeriod, atrPeriod+1)+1봉(기본 101봉 · 보수적 201봉 · 공격적 61봉)입니다.',
    fields: [
      {
        term: '위험 자산 바스켓 (assets)',
        range: '2-6개 종목코드 (6자리 영숫자 · 중복 금지 · 순서 보존)',
        description:
          '종목별 추세 SMA 초과 및 회귀 모멘텀 점수(252βR² > 0)로 순위를 매길 위험 자산 목록입니다. 동률 시 앞 순서 종목이 우선하며 대표 종목(code)은 위험 자산 1과 자동 동기화됩니다.',
      },
      {
        term: '안전자산 (safeAsset, 선택)',
        range: '6자리 영숫자 코드 또는 비움 (assets와 중복 금지)',
        description:
          '적격 위험 자산이 없거나 ATR 역변동성 비중 합계가 100% 미만일 때 남는 비중을 배분할 방어 자산입니다. 비워두면(null) 잔여 비중을 현금으로 보유합니다.',
      },
      {
        term: '회귀 모멘텀 기간 (regressionDays)',
        range: '20-252 정수 (기본 90봉)',
        description:
          '로그 종가 선형회귀의 연율화 기울기와 결정계수 곱(252βR², beta > 0 && R² > 0)을 계산할 관측 봉 수입니다. 기간을 늘리면 완만하고 꾸준한 추세를, 줄이면 최근 급등 추세를 선호합니다.',
      },
      {
        term: 'Wilder ATR 기간 (atrPeriod)',
        range: '10-60 정수 (기본 20봉)',
        description:
          '역변동성 비중 산출에 쓰는 Wilder ATR 기간입니다. Wilder ATR은 조회 시작일 첫 봉부터 평활하므로 시작일이 달라지면 비중이 달라질 수 있으며, ATR/종가가 0 또는 비유한일 때 적용하는 대체 비중(1/K)은 ATR 위험예산을 보장하지 않습니다.',
      },
      {
        term: '종목 추세 SMA 기간 (regimeSmaPeriod)',
        range: '20-250 정수 (기본 100봉)',
        description:
          '원안의 별도 시장 지수 200일 레짐과 고정 종목 100일 조건을 대체하는 종목별 설정 추세 필터입니다. 리밸런싱일 종가가 해당 SMA를 초과(close > SMA)한 종목만 후보가 됩니다.',
      },
      {
        term: '상위 선정 종목 수 (topK)',
        range: '1-5 정수 (기본 2종)',
        description:
          '추세·회귀 모멘텀 적격 자산 중 점수(252βR²) 순으로 편입할 최대 종목 수(K)입니다.',
      },
      {
        term: '종목당 위험예산 (riskPerAssetBps)',
        range: '5-100 정수 bp (기본 20bp)',
        description:
          '종목당 목표 일간 변동성 예산(bps/10000)으로, 원시 비중 (bps/10000)/(ATR/종가)을 결정합니다. 값을 높이면 투자 비중이 커지고(합계 1 초과 시 비례 축소), 낮추면 현금·안전자산 비중이 늘어납니다.',
      },
      {
        term: '리밸런싱 주기 (rebalanceDays)',
        range: '5-60 정수 (기본 20봉)',
        description:
          '첫 준비 완료 종가 이후 다음 회귀 모멘텀·ATR 역변동성 비중 재산정까지의 거래일 간격입니다.',
      },
    ],
  },
  price_regime: {
    summary:
      '리밸런싱일 종가 기준 첫 번째 위험 자산(위험 자산 1)의 추세 SMA와 실현 연변동성으로 위험선호(100%)·경계(설정 노출 %)·위험회피(0%) 3상태를 판정해 위험 자산 균등 배분과 안전자산(또는 현금) 비중을 조절합니다.',
    envBadge: '저장 일봉: 다종목 자산배분 (v3) · DEMO 미지원 · KIS 모의 정지 저장만 가능(시작·계약 고정 차단)',
    basicPreset:
      '추세 SMA 200봉 / 변동성 관측 20봉 / 최대 연변동성 25% / 경계 노출 50% / 리밸런싱 20봉 (보수적 200/60/20/30/20 · 공격적 100/20/35/70/10 · 위험 자산 2-6종 · 안전자산 선택)',
    executionNote:
      '매도·리밸런싱은 수익을 보장하지 않습니다(수익 미보장). 저장 일봉 다종목 백테스트(v3) 전용이며 DEMO 저장·합성 백테스트는 차단되고, KIS 모의에서는 정지 상태(active=false) 저장만 가능하며 시작·계약 고정은 차단됩니다(단일 종목 공통 오버레이 미지원). [원안 대비 변형 범위] 원안의 FRED 빈티지(당시 공개 경제지표)·중앙은행 발표 시각·금리/신용 레짐은 사용하지 않으며, 첫 번째 위험 자산(assets[0])의 저장 일봉 종가만으로 추세(종가 > 당일 포함 SMA, 같으면 위험회피)와 실현 변동성(직전 volLookback개 단순 수익률 모집단 표준편차×√252×100)을 판정해 위험선호 100%(변동성 <= 한도)·경계 cautionExposurePct%(변동성 > 한도)·위험회피 0%(종가 <= SMA)의 3상태 노출을 위험 자산들에 동일 비중(exposure / N)으로 나누고 잔여 비중(1 - exposure)을 안전자산(비우면 현금)에 배분합니다. 판정 자산은 별도 지수가 아닌 투자 대상 위험 자산 1이며, 타 전략의 진입 한도 오버레이로 적용되지 않고 리밸런싱일 사이에 레짐이 바뀌어도 비중을 조정하지 않습니다. 바스켓 전 종목 거래일 달력 100% 일치·다음 봉 시가 체결·매도 선행 후 정수 수량 매수·동일 비중 유지 시 소폭 축소 매도 가능·현금 부족 시 assets 뒤쪽 종목 수량 축소 가능·위험 자산 동일 비중 첫 시가 벤치마크·분배금/배당/세금 미포함·생존 편향에 유의하세요. 최소 준비 봉은 max(trendSmaPeriod, volLookback + 1) + 1봉(판정 max(trendSmaPeriod, volLookback + 1)봉 + 다음 봉 시가 체결 1봉, 기본 201봉 · 보수적 201봉 · 공격적 101봉)입니다.',
    fields: [
      {
        term: '위험 자산 바스켓 (assets · 위험 자산 1이 레짐 판정 기준)',
        range: '2-6개 종목코드 (6자리 영숫자 · 중복 금지 · 순서 보존)',
        description:
          '투자 대상 위험 자산 목록(N종)이며, 첫 번째 종목(위험 자산 1)의 저장 일봉 종가로만 추세·변동성 레짐을 판정합니다. 판정된 위험 노출(exposure)을 N개 위험 자산에 동일 비중(exposure / N)으로 배분하며 대표 종목(code)은 위험 자산 1과 자동 동기화됩니다.',
      },
      {
        term: '안전자산 (safeAsset, 선택)',
        range: '6자리 영숫자 코드 또는 비움 (assets와 중복 금지)',
        description:
          '경계·위험회피 구간에서 남는 미배정 비중(1 − 위험 노출)을 옮겨 담을 방어 자산입니다. 비워두면(null) 잔여 비중을 현금으로 보유합니다.',
      },
      {
        term: '추세 SMA 기간 (trendSmaPeriod)',
        range: '20-250 정수 (기본 200봉)',
        description:
          '위험 자산 1의 당일 포함 단순 이동평균(SMA) 기간입니다. 리밸런싱일 종가가 SMA를 초과(>)해야 위험선호·경계 판정을 진행하며, 종가가 SMA 이하(<=)이면 위험회피(0%)로 판정합니다.',
      },
      {
        term: '변동성 관측 기간 (volLookback)',
        range: '10-60 정수 (기본 20봉)',
        description:
          '위험 자산 1의 직전 volLookback개 단순 일간 수익률(C_i / C_{i-1} − 1, 필요 종가 volLookback + 1봉) 모집단 표준편차×√252×100으로 실현 연변동성을 계산합니다.',
      },
      {
        term: '최대 연변동성 한도 (maxAnnualVolPct)',
        range: '5-80 정수 % (기본 25%)',
        description:
          '상승 추세(종가 > SMA)에서 실현 연변동성이 이 한도 이하(<=)이면 위험선호(100%), 초과(>)하면 경계 노출(%)로 축소합니다.',
      },
      {
        term: '경계 위험 노출 비중 (cautionExposurePct)',
        range: '0-100 정수 % (기본 50%)',
        description:
          '상승 추세이지만 실현 연변동성이 한도를 초과한 경계 상태에서 위험 자산 전체에 배정할 총 위험 노출 비율입니다. 0%면 안전자산(또는 현금) 100%, 100%면 위험선호와 동일하게 배분합니다.',
      },
      {
        term: '리밸런싱 주기 (rebalanceDays)',
        range: '5-60 정수 (기본 20봉)',
        description:
          '첫 준비 완료 종가 이후 다음 레짐 판정·비중 재조정까지의 거래일 간격입니다. 리밸런싱 주기 사이에는 레짐이 변해도 비중을 바꾸지 않습니다.',
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
    range: '선택 오버레이 (고저가 필요 · 저장 일봉 · KIS 모의 확정 일봉 기반 · DEMO 미지원)',
    description:
      '매수 후 도달한 최고가에서 하루 평균 변동폭(ATR) × 배수만큼 낮춘 추적 손절선을 계산합니다(한 번 올라간 손절선은 내려가지 않음). 장중 저가 터치가 아니라 저장 일봉에서는 봉의 종가가 추적 손절선 이하(<=)이면 전략 매도 신호보다 먼저 매도 신호를 내고 다음 봉 시가에 체결한다고 가정합니다. DEMO에서는 샹들리에를 사용할 수 없습니다. KIS 모의에서는 종가 확정형 10종과 결합해 전용 원장에 복사된 직전 KRX 개장일 확정 일봉 신호로 당일 1회 집행합니다(계약 고정 후 추가 수집 일봉 자동 미반영).',
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
    range: '선택 오버레이 (저장 일봉 백테스트 전용 · DEMO 미지원 · KIS 모의 시작·계약 고정 차단)',
    description:
      '매수 체결 시 체결일 직전 확정 종가(관측 기간+1봉)의 단순 일간 수익률 모집단 표준편차 × √252 × 100으로 연환산 변동성을 계산합니다. 목표 비중 min(최대 배정 비중/100, 목표 변동성/실측 변동성)(변동성이 0이면 최대 배정 비중)만큼 현금 예산을 배정해 전체 현금과 배정 예산 각각에서 수수료를 감당하는 정수 수량 중 작은 값으로 매수하며(0주이면 보류), 준비 봉은 관측 기간+1과 규칙 준비 봉 중 큰 값을 사용합니다. DEMO에서는 사용할 수 없으며, KIS 모의에서는 정지 상태(active=false) 저장만 가능하고 시작·계약 고정은 차단됩니다.',
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
              전략 스튜디오나 백테스트에서 16종 전략 규칙(단일 종목 11종 + 다종목 자산배분 5종:{' '}
              <code>13 ETF 듀얼 모멘텀</code>, <code>14 파버 GTAA</code>, <code>15 KRX 섹터 상대강도</code>,{' '}
              <code>16 클레노우 회귀 모멘텀</code>, <code>18 가격 레짐 (매크로 대용)</code> · DEMO 종가 전용 4종:{' '}
              <code>이동평균 교차</code>,{' '}
              <code>RSI 단기 눌림목</code>, <code>MACD 히스토그램</code>, <code>볼린저 %B 반등</code>) 중 하나를
              고르고 <strong>[보수적 / 기본 / 공격적]</strong> 프리셋 버튼으로 시작값을 채운 뒤 단일 종목 전략이면
              필요에 따라 <code>샹들리에 ATR 청산</code>이나 <code>변동성 패리티 · RMS 사이징</code> 오버레이를
              켭니다.
            </p>
          </li>
          <li>
            <span className="research-help-step-no">3단계</span>
            <h3>저장 전 백테스트 검증</h3>
            <p>
              바로 저장하지 않고 <strong>이 설정으로 백테스트</strong> 버튼을 눌러 과거 구간 수익률·최대낙폭(MDD)·체결
              횟수를 확인합니다. 단일 종목 다중 규칙(<code>v2</code>)은{' '}
              <strong>단순 보유(저장 일봉은 첫 봉 시가, DEMO는 첫 합성 봉 종가 매수 기준)</strong>와 비교하며, 다종목
              자산배분(<code>v3</code>)은 <strong>위험 자산 동일 비중 첫 시가 보유</strong> 벤치마크·리밸런싱 내역·종목별
              체결 내역을 함께 표시합니다.
            </p>
          </li>
          <li>
            <span className="research-help-step-no">4단계</span>
            <h3>검증 배지 저장 및 실행</h3>
            <p>
              <strong>KIS 저장 일봉 실험</strong> 결과 화면의 <strong>이 설정으로 전략 만들기</strong> 버튼을 눌러
              돌아오면 <strong>검증 실험 연결</strong> 배지가 자동으로 붙습니다(DEMO 합성 백테스트는 기능 검증 전용으로
              전략 연결·재현 검증 미제공). 이름을 정해 저장한 뒤 DEMO 재생 또는 KIS 모의 계약 연결로 실행합니다. KIS
              모의에서는 기본 무필터 SMA(장기 100 이하)는 실시간 체결가(<code>H0STCNT0</code>) 교차로, 종가 확정형
              10종(EMA·필터 포함)과 <code>19 샹들리에 청산</code>은 전용 원장에 복사된 직전 KRX 개장일 확정 일봉으로
              당일 1회 집행합니다(<code>05 윌리엄스 변동성 돌파</code>·<code>13 ETF 듀얼 모멘텀</code>·
              <code>14 파버 GTAA</code>·<code>15 KRX 섹터 상대강도</code>·<code>16 클레노우 회귀 모멘텀</code>·
              <code>18 가격 레짐 (매크로 대용)</code>·<code>20 변동성 패리티</code>·무필터 SMA 장기 101-120은 저장 일봉
              백테스트 전용이며 정지 저장만 가능).
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
          {RULE_KINDS.map(kind => {
            const cardTitle =
              kind === 'dual_momentum'
                ? `13 ${ruleTitle(kind)}`
                : kind === 'faber_gtaa'
                  ? `14 ${ruleTitle(kind)}`
                  : kind === 'krx_sector_rs'
                    ? `15 ${ruleTitle(kind)}`
                    : kind === 'clenow_momentum'
                      ? `16 ${ruleTitle(kind)}`
                      : kind === 'price_regime'
                        ? `18 ${ruleTitle(kind)}`
                        : ruleTitle(kind);
            return (
              <article key={kind} className="research-help-card">
                <h3>
                  {cardTitle} <code>{kind}</code>
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
            );
          })}
          <article className="research-help-card">
            <h3>
              19 샹들리에 ATR 청산 오버레이 <code>chandelier</code>
            </h3>
            <p className="research-help-env-line">
              저장 일봉 · KIS 모의(확정 일봉 기반 당일 1회, 종가형 10종 결합) · DEMO 미지원
            </p>
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
            <p className="research-help-env-line">
              저장 일봉 백테스트 전용 · DEMO 미지원 · KIS 모의 정지 저장만 가능(시작·계약 고정 차단)
            </p>
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
              종가 확정형 10종 일봉 규칙은 종가 판정 후 다음 봉 시가에 체결한다고 가정하며, KIS 모의에서는{' '}
              <code>19 샹들리에 청산</code>과 함께 전용 원장에 복사된 직전 KRX 개장일 확정 일봉 신호로 당일 1회
              집행합니다(고정 후 추가 수집 일봉 자동 미반영). 반면 <code>윌리엄스 변동성 돌파</code>(당일 목표가{' '}
              <code>max(시가, 목표가)</code> 매수·이후 시가 청산)와 <code>변동성 패리티</code>(직전 확정 종가 변동성
              기준 투입 비중·정수 수량 제한)는 저장 일봉 백테스트 전용이며 KIS 모의 시작·계약 고정은 차단됩니다.
            </p>
          </article>
          <article className="research-help-card">
            <h3>다종목 자산배분 (v3) 정산·벤치마크·유의사항</h3>
            <p>
              <code>13 ETF 듀얼 모멘텀</code>, <code>14 파버 GTAA</code>, <code>15 KRX 섹터 상대강도</code>,{' '}
              <code>16 클레노우 회귀 모멘텀</code>, <code>18 가격 레짐 (매크로 대용)</code>은 저장 일봉 다종목 백테스트(
              <code>daily-portfolio-next-open-v3</code>) 전용입니다. 바스켓 전 종목(위험 자산 2-6종 + 선택 안전자산)의
              거래일 달력이 100% 일치해야 하며, 리밸런싱일 다음 봉 시가에 슬리피지 전 시가 총평가액으로 목표 정수 수량을
              산출해 매도를 먼저 체결한 뒤 가용 현금 안에서 정수 수량만 매수하고 잔여 현금을 보유합니다. 동일 비중을
              유지하는 리밸런싱에서도 슬리피지·수수료를 포함한 목표 수량 재산정으로 소폭 축소 매도가 발생할 수 있으며,
              매수 현금이 부족하면 위험 자산(<code>assets</code>) 입력 순서 뒤쪽 종목의 체결 수량이 줄어들 수 있습니다.
              벤치마크는 위험 자산 동일 비중 첫 시가 보유(비용·잔여 현금 동일 적용)이며, 분배금·배당·세금은 포함하지
              않고 현재 상장 종목 선택에 따른 생존 편향에 유의해야 합니다.
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
            <h3>Q. 왜 16종 전략 중 일부와 오버레이 2종은 DEMO에서 저장/실행이 안 되나요?</h3>
            <p>
              DEMO 합성 봉은 종가 하나만 생성하며 단일 종목 연습 전용입니다. 종가만 쓰는 단일 종목 4종(
              <code>이동평균 교차</code>(거래량 필터 끔), <code>RSI 단기 눌림목</code>, <code>MACD 히스토그램</code>,{' '}
              <code>볼린저 %B 반등</code>)만 DEMO 저장·백테스트를 지원합니다. 시가·고가·저가·거래량이 필요한 단일 종목
              7종, 다종목 자산배분 5종(<code>13 ETF 듀얼 모멘텀</code>, <code>14 파버 GTAA</code>,{' '}
              <code>15 KRX 섹터 상대강도</code>, <code>16 클레노우 회귀 모멘텀</code>,{' '}
              <code>18 가격 레짐 (매크로 대용)</code>), 이동평균 거래량 필터·<code>샹들리에 청산</code>·
              <code>변동성 패리티</code> 오버레이는 실제 일봉 데이터가 있는 <strong>KIS 저장 일봉 백테스트</strong>에서만
              계산할 수 있어 DEMO 저장·실행을 차단합니다.
            </p>
          </article>
          <article className="research-help-card">
            <h3>Q. KIS 모의에서 어떤 전략이 시작·계약 고정이 가능하고, 어떤 전략이 차단되나요?</h3>
            <p>
              <strong>기본 무필터 SMA(장기 100 이하)</strong>는 실시간 체결가(<code>H0STCNT0</code>) 교차 평가로
              시작·계약 고정을 지원합니다. <strong>종가 확정형 10종(EMA·추세/거래량 필터 포함)</strong>과{' '}
              <strong>19 샹들리에 청산</strong>은 매매 설정에서 계약 고정 시 검증 완료 일봉을 전용 원장에 복사하여
              세션 직전 KRX 개장일 확정 일봉 신호로 당일 1회 집행하며, 고정 이후 추가 수집한 일봉은 기존 전용 원장에
              자동 반영되지 않습니다. 반면 <strong>05 윌리엄스 변동성 돌파</strong>,{' '}
              <strong>13 ETF 듀얼 모멘텀</strong>, <strong>14 파버 GTAA</strong>,{' '}
              <strong>15 KRX 섹터 상대강도</strong>, <strong>16 클레노우 회귀 모멘텀</strong>,{' '}
              <strong>18 가격 레짐 (매크로 대용)</strong>, <strong>20 변동성 패리티 · RMS</strong>는 저장 일봉 백테스트
              전용이라 KIS 모의에서는 정지 상태(<code>active=false</code>) 저장만 가능하고 시작·계약 고정은 차단됩니다.
              또한 기본 무필터 SMA라도 장기 기간이 <code>101-120</code>이면{' '}
              <strong>정지 상태(active=false) 저장과 저장 일봉 백테스트는 가능하지만</strong>, KIS 실시간 시작 계약
              상한(100 이하)에 따라 <strong>전략 시작</strong>과 계약 고정은 차단됩니다.
            </p>
          </article>
          <article className="research-help-card">
            <h3>Q. 다종목 백테스트에서 &apos;수집 필요&apos; 또는 달력 불일치 오류가 뜨는 이유는?</h3>
            <p>
              다종목 자산배분(<code>v3</code>)은 바스켓의 모든 위험 자산과 선택한 안전자산 각각에 대해{' '}
              <code>passed</code> 상태의 달력 대조 완료 KIS 저장 일봉이 필요하며, 선택한 기간의 거래일 달력이 전 종목
              100% 일치해야 합니다. 일부 종목이 미수집이면 데이터 상태 화면에서 먼저 수집하고, 공통 가능 기간
              (<code>[max(시작일), min(종료일, 수집일−1일)]</code>) 안에서 기간을 지정해 실행하세요.
            </p>
          </article>
          <article className="research-help-card">
            <h3>Q. 설계 문서의 20대 전략 중 08 갭·초반 거래량과 17 공시 드리프트·희석 차단 전략은 왜 목록에 없나요?</h3>
            <p>
              설계 문서의 20대 전략 중 <strong>18종 구현(단일 11 · 다종목 5 · 오버레이 2)</strong>을 제공하며, 아래
              2종은 현재 저장 일봉 원장 아키텍처로 원안의 핵심 신호를 왜곡 없이 재현할 수 없어 아키텍처 제외로
              분류했습니다.
            </p>
            <p>
              <strong>08 갭·초반 거래량</strong>: 장 초반 분 단위 가격·누적 거래량으로 진입을 확인하는 전략이나 저장
              스냅샷에는 일봉 OHLCV만 있어 시가 이후 거래량과 고저가 순서를 확정할 수 없으며, 종가 확인 후 다음 시가
              체결로 바꾸면 원안의 당일 진입 근거가 사라지고 <code>02 돈키안 돌파</code>·<code>06 볼린저 스퀴즈</code>의
              거래량 돌파와 중복되어 제외했습니다.
            </p>
            <p>
              <strong>17 공시 드리프트·희석 차단</strong>: 공시 공개 시각과 분류(실적·유상증자·전환사채 등)가 필수이나
              저장 스냅샷에 시점별 공시 원장이 없고 현재 수집하는 OpenDART 목록은 접수일·접수번호만 사용해 장중·장후
              공개 시각을 확정할 수 없으며, 가격·거래량 급변 대용으로는 공시 여부 판별과 희석 차단을 구현할 수 없어
              제외했습니다.
            </p>
          </article>
          <article className="research-help-card">
            <h3>Q. 검증 실험 연결 배지가 왜 사라졌나요?</h3>
            <p>
              백테스트에서 넘어온 뒤 종목·바스켓 순서·안전자산이나 규칙 숫자를 하나라도 바꾸면 검증받았던 원래 설정과
              달라집니다. 허위 검증 표시를 막기 위해 설정이 바뀌는 즉시 배지가 자동 해제됩니다.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
