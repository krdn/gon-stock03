import { z } from 'zod';
import { backtestResultSchema, portfolioResultSchema, type Experiment } from '../../shared/backtest';
import { masterCodeSchema } from '../../shared/market-data';
import {
  PORTFOLIO_CATALOG,
  isPortfolioRule,
  portfolioCodes,
  portfolioOnly,
  portfolioRuleSchema,
  type PortfolioRule,
} from '../../shared/portfolio-rules';
import {
  STRATEGY_CATALOG,
  assertRealtimeRule,
  exitOverlaySchema,
  isBasicRealtimeSma,
  strategyRuleSchema,
  type ExitOverlay,
  type StrategyRule,
} from '../../shared/strategy-rules';

/** 전략 실행 환경 구분 (`demo`: 합성 봉, `kis-paper`: KIS 모의 체결가 이벤트). */
export type StrategyEnvironment = 'demo' | 'kis-paper';

/** 지원하는 단일·다종목 전략 규칙 유니온. */
export type AnyStrategyRule = StrategyRule | PortfolioRule;

/** 지원하는 전략 규칙 종류 유니온 (단일 종목 11종 + 다종목 자산배분 5종). */
export type RuleKind = (typeof RULE_KINDS)[number];

/** 규칙 프리셋 단계 키. */
export type PresetKey = 'conservative' | 'basic' | 'aggressive';

/** v1·v2·v3 백테스트 결과를 모두 수용하는 유연한 결과 스키마. */
const benchmarkSchema = backtestResultSchema.pick({
  returnPct: true,
  maxDrawdown: true,
  finalEquity: true,
});

const flexibleTradeSchema = backtestResultSchema.shape.trades.element.extend({
  code: masterCodeSchema.optional(),
  reason: z.string().min(1).optional(),
});

/** v2 단일 규칙 백테스트 결과 엄격 검증 스키마 (`shared/backtest.ts` `ruleResultSchema`와 동일). */
export const ruleReplayResultSchema = backtestResultSchema.extend({
  trades: z.array(backtestResultSchema.shape.trades.element.extend({ reason: z.string().min(1) })),
  benchmark: benchmarkSchema,
});

/** 엔진 버전(`v1`·`v2`·`v3`)에 대응하는 엄격 재현 결과 스키마를 반환한다. */
export function replayResultSchemaFor(engineVersion: Experiment['snapshot']['engineVersion']) {
  if (engineVersion === 'daily-portfolio-next-open-v3') return portfolioResultSchema;
  if (engineVersion === 'daily-rules-next-open-v2') return ruleReplayResultSchema;
  return backtestResultSchema;
}

/** v1·v2·v3 백테스트 결과 응답 검증 스키마. */
export const flexibleResultSchema = backtestResultSchema.extend({
  trades: z.array(flexibleTradeSchema),
  benchmark: benchmarkSchema.optional(),
  rebalances: portfolioResultSchema.shape.rebalances.optional(),
});

/** v1·v2·v3 백테스트 결과 타입. */
export type FlexibleBacktestResult = z.infer<typeof flexibleResultSchema>;

/** `/strategies` ↔ `/backtest` 간 이동 시 라우터 state로 주고받는 검증 실험 증거 스키마. */
export const evidenceSchema = z.strictObject({
  experimentId: z.string().regex(/^[a-f0-9]{64}$/),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
});

/** 전략에 연결되는 백테스트 검증 실험 증거 타입. */
export type StrategyEvidence = z.infer<typeof evidenceSchema>;

/** `/strategies` ↔ `/backtest` 라우터 state 전달용 초안 스키마. */
export const strategyTransferSchema = z.object({
  code: masterCodeSchema,
  rule: z.union([strategyRuleSchema, portfolioRuleSchema]),
  overlay: exitOverlaySchema.optional(),
  evidence: evidenceSchema.optional(),
});

/** `/strategies` ↔ `/backtest` 간 전달 초안 타입. */
export type StrategyTransferDraft = z.infer<typeof strategyTransferSchema>;

/** 규칙·오버레이 입력 폼 상태 (빈 입력·재편집을 안전하게 유지하기 위해 문자열로 보관). */
export interface RuleFormState {
  kind: RuleKind;
  maType: 'sma' | 'ema';
  fast: string;
  slow: string;
  regimePeriod: string;
  minRelativeVolume: string;
  entryLookback: string;
  exitLookback: string;
  volumeMultiplier: string;
  vbK: string;
  vbUseAdaptiveNoise: boolean;
  vbNoiseLookback: string;
  vbTrendMaPeriod: string;
  vbHoldDays: string;
  rsiPeriod: string;
  oversoldThreshold: string;
  longTrendMa: string;
  exitShortMa: string;
  maxHoldingDays: string;
  fastPeriod: string;
  slowPeriod: string;
  signalPeriod: string;
  requireZeroLineAbove: boolean;
  diPeriod: string;
  adxThreshold: string;
  bbSqueezePeriod: string;
  stdDevMultiplier: string;
  squeezeLookback: string;
  squeezePercentile: string;
  ttmPeriod: string;
  bbMult: string;
  kcMult: string;
  bbPeriod: string;
  bbStdDev: string;
  pbRsiPeriod: string;
  rsiOversold: string;
  exitPercentB: string;
  pullbackDays: string;
  maxVolumeRatio: string;
  trendFastMa: string;
  trendSlowMa: string;
  maPeriod: string;
  buyDisparity: string;
  sellDisparity: string;
  stopLossPct: string;
  portfolioAssets: string[];
  portfolioSafeAsset: string;
  dmLookbackDays: string;
  dmRebalanceDays: string;
  gtaaSmaPeriod: string;
  gtaaRebalanceDays: string;
  rsLookbackDays: string;
  rsTopK: string;
  rsMaxWeightPct: string;
  rsRebalanceDays: string;
  clenowRegressionDays: string;
  clenowAtrPeriod: string;
  clenowRegimeSmaPeriod: string;
  clenowTopK: string;
  clenowRiskPerAssetBps: string;
  clenowRebalanceDays: string;
  regimeTrendSmaPeriod: string;
  regimeVolLookback: string;
  regimeMaxAnnualVolPct: string;
  regimeCautionExposurePct: string;
  regimeRebalanceDays: string;
  useChandelier: boolean;
  atrPeriod: string;
  atrMultiplier: string;
  useVolatilityParity: boolean;
  volLookback: string;
  targetAnnualVolPct: string;
  maxAllocationPct: string;
}

/** 환경 전환 시에도 편집값과 해제된 evidence 상태를 보존하는 전략 에디터 초안 상태. */
export interface StrategyEditorDraft {
  name: string;
  code: string;
  ruleForm: RuleFormState;
  evidence?: StrategyEvidence;
  qty: string;
  attempted: boolean;
  formError: string;
  draftSourceCode?: string;
}

/** 백테스트 자금·비용 가정 입력 상태. */
export interface CostAssumptions {
  capital: number;
  feeBps: number;
  slippageBps: number;
}

/** 저장 일봉 백테스트의 단일 runId·날짜·정책·바스켓 runId 편집 상태 (DEMO ↔ 저장 일봉 전환 시 보존). */
export interface StoredBacktestDraft {
  singleRunId: string | null;
  singleRunEdited: boolean;
  from: string;
  to: string;
  dateEdited: boolean;
  portfolioPolicy: 'adjusted' | 'raw' | null;
  portfolioRunOverrides: Record<string, string>;
}

/** 저장 일봉 백테스트 기본 편집 상태를 생성한다. */
export function defaultStoredBacktestDraft(): StoredBacktestDraft {
  return {
    singleRunId: null,
    singleRunEdited: false,
    from: '',
    to: '',
    dateEdited: false,
    portfolioPolicy: null,
    portfolioRunOverrides: {},
  };
}

/** 저장 일봉 백테스트 선택 전환 시 전달하는 포커스·불러오기 정보. */
export type BacktestSelection = { focus: 'policy' | 'run' } | { saved: Experiment };

/** 지원하는 16종 전략 규칙 키 목록 (단일 종목 11종 + 다종목 자산배분 5종). */
export const RULE_KINDS = [
  'ma_crossover',
  'donchian_breakout',
  'volatility_breakout',
  'rsi2_pullback',
  'macd_momentum',
  'adx_dmi_trend',
  'bollinger_squeeze',
  'ttm_squeeze',
  'bollinger_percent_b',
  'low_volume_pullback',
  'disparity_reversion',
  'dual_momentum',
  'faber_gtaa',
  'krx_sector_rs',
  'clenow_momentum',
  'price_regime',
] as const;

/** 전략 규칙 선택 `<optgroup>` 그룹 정의. */
export const RULE_GROUPS: { label: string; kinds: readonly RuleKind[] }[] = [
  { label: '추세 · 모멘텀 (3종)', kinds: ['ma_crossover', 'macd_momentum', 'adx_dmi_trend'] },
  {
    label: '변동성 돌파 · 스퀴즈 (4종)',
    kinds: ['donchian_breakout', 'volatility_breakout', 'bollinger_squeeze', 'ttm_squeeze'],
  },
  {
    label: '눌림목 · 평균회귀 (4종)',
    kinds: ['rsi2_pullback', 'bollinger_percent_b', 'low_volume_pullback', 'disparity_reversion'],
  },
  {
    label: '다종목 자산배분 (5종)',
    kinds: ['dual_momentum', 'faber_gtaa', 'krx_sector_rs', 'clenow_momentum', 'price_regime'],
  },
];

/** 다종목 자산배분 5종 규칙의 3줄 요약 가이드 (매수·매도·주의). */
export const PORTFOLIO_RULE_GUIDE: Record<
  PortfolioRule['kind'],
  { buyWhen: string; sellWhen: string; cautionRegime: string }
> = {
  dual_momentum: {
    buyWhen: '리밸런싱일 종가 기준 최근 수익률이 양수(> 0)인 위험 자산 중 1위 종목에 100% 배분해요(동률 시 앞 순서 우선).',
    sellWhen: '양의 모멘텀 위험 자산이 없으면 안전자산에 100% 배분하거나 비우면 현금을 보유해요.',
    cautionRegime: '급반등·변동성 장세에서는 리밸런싱 주기 사이에 추세가 뒤바뀔 수 있어요.',
  },
  faber_gtaa: {
    buyWhen: '리밸런싱일 종가가 이동평균선을 초과(>)하는 위험 자산에 각각 1/N 동일 비중으로 배분해요.',
    sellWhen: '이동평균선 이하(<=)인 위험 자산의 비중 합계는 안전자산으로 돌리거나 비우면 현금을 보유해요.',
    cautionRegime: '추세선 부근 횡보장에서는 리밸런싱마다 매수·매도가 반복될 수 있어요.',
  },
  krx_sector_rs: {
    buyWhen:
      '리밸런싱일 종가 기준 최근 관측 기간 수익률이 양수(> 0)이고 구간 최고 고가 대비 종가 비율이 90% 이상(>= 0.9)인 위험 자산을 상대강도 점수(수익률×고점 유지율) 순으로 상위 K개 골라 종목당 상한 이내 동일 비중으로 배분해요(동률 시 앞 순서 우선).',
    sellWhen:
      '적격 위험 자산이 없거나 종목당 최대 비중 상한 적용 후 남은 잔여 비중은 안전자산으로 돌리거나 비우면 현금을 보유해요.',
    cautionRegime:
      '사용자 지정 바스켓의 가격 상대강도만 평가하므로 동일 업종 종목을 중복 편입하면 섹터 분산 효과가 줄어들 수 있어요.',
  },
  clenow_momentum: {
    buyWhen:
      '리밸런싱일 종가가 종목 추세 SMA를 초과(>)하고 로그 종가 선형회귀 연율화 기울기×결정계수(252βR²)가 양수(> 0)인 상위 K개 위험 자산에 Wilder ATR 역변동성 비중을 배분해요(동률 시 앞 순서 우선).',
    sellWhen:
      '추세·회귀 모멘텀 적격 자산이 없거나 ATR 역변동성 비중 합계가 100% 미만일 때 남은 비중은 안전자산으로 돌리거나 비우면 현금을 보유해요.',
    cautionRegime:
      '급격한 추세 반전 구간이나 관측 시작일 변경에 따른 Wilder ATR 평활 초기값 차이로 리밸런싱 비중이 달라질 수 있어요.',
  },
  price_regime: {
    buyWhen:
      '리밸런싱일 종가 기준 첫 번째 위험 자산(위험 자산 1)의 종가가 당일 포함 추세 SMA를 초과(>)하고 최근 실현 연변동성이 한도 이하(<=)이면 위험선호(100%), 한도를 초과(>)하면 경계 노출(%)만큼 위험 자산에 균등 배분해요.',
    sellWhen:
      '위험 자산 1의 종가가 추세 SMA 이하(<=)이면 위험회피(0%)로 판정하고, 위험회피·경계 구간의 미배정 비중(1 − 위험 노출)은 안전자산으로 돌리거나 비우면 현금을 보유해요.',
    cautionRegime:
      '별도 거시경제 지표(FRED 빈티지·발표 시각)나 지수가 아니라 투자 대상인 위험 자산 1의 가격·변동성으로만 레짐을 판정하며 리밸런싱 주기 사이에는 비중을 조정하지 않아요.',
  },
};

/** 규칙 키가 다종목 자산배분 전략인지 판정한다. */
export function isPortfolioKind(kind: RuleKind): kind is PortfolioRule['kind'] {
  return (
    kind === 'dual_momentum' ||
    kind === 'faber_gtaa' ||
    kind === 'krx_sector_rs' ||
    kind === 'clenow_momentum' ||
    kind === 'price_regime'
  );
}

/** 규칙 키의 한글 표시 제목을 반환한다. */
export function ruleTitle(kind: RuleKind): string {
  return isPortfolioKind(kind) ? PORTFOLIO_CATALOG[kind].title : STRATEGY_CATALOG[kind].title;
}

/** 규칙 프리셋 버튼 목록. */
export const PRESET_ENTRIES: { key: PresetKey; label: string }[] = [
  { key: 'conservative', label: '보수적' },
  { key: 'basic', label: '기본' },
  { key: 'aggressive', label: '공격적' },
];

/** KIS 평가 결과 상태 한글 라벨. */
export const evaluationLabels = {
  hold: '관망',
  blocked: '차단',
  sending: '검사·전송 중',
  accepted: '접수 · 체결 미확정',
  unknown: '응답 불명',
  rejected: '거부 · 미전송',
};

/** 전략 매매 신호 한글 라벨. */
export const signalLabels = { hold: '관망', buy: '매수', sell: '매도' };

/** KST 기준 평가 시각 포맷터. */
export const evaluationTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** 백테스트 기본 자금·비용 가정. */
export const defaultCosts: CostAssumptions = { capital: 10000000, feeBps: 1.5, slippageBps: 5 };

/** `YYYYMMDD` 문자열을 `<input type="date">` 형식(`YYYY-MM-DD`)으로 변환한다. */
export const dateInput = (value?: string) =>
  value ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}` : '';

/** 수정주가 정책 식별자를 한글 표시 문구로 변환한다. */
export const pricePolicy = (value: string) => (value === 'raw' ? '원주가' : '수정주가');

/** 입력 객체에서 백테스트 자금·비용 가정 필드만 추출한다. */
export function costsOf({ capital, feeBps, slippageBps }: CostAssumptions): CostAssumptions {
  return { capital, feeBps, slippageBps };
}

/** 백테스트 자금·수수료·슬리피지 입력 범위를 검증한다. */
export function validateCosts(
  costs: CostAssumptions,
): { message: string; focusName: keyof CostAssumptions } | null {
  if (!Number.isInteger(costs.capital) || costs.capital < 100000 || costs.capital > 100000000) {
    return {
      message: '초기 자금은 100,000원 이상 100,000,000원 이하의 정수로 입력하세요.',
      focusName: 'capital',
    };
  }
  if (!Number.isFinite(costs.feeBps) || costs.feeBps < 0 || costs.feeBps > 100) {
    return { message: '수수료는 0-100bp 범위로 입력하세요.', focusName: 'feeBps' };
  }
  if (!Number.isFinite(costs.slippageBps) || costs.slippageBps < 0 || costs.slippageBps > 100) {
    return { message: '슬리피지는 0-100bp 범위로 입력하세요.', focusName: 'slippageBps' };
  }
  return null;
}

/** 기본 규칙 폼 상태를 생성한다 (기존 E2E 기본값인 SMA 5/20 기준). */
export function defaultRuleForm(): RuleFormState {
  const ma = STRATEGY_CATALOG.ma_crossover.presets.basic;
  const donchian = STRATEGY_CATALOG.donchian_breakout.presets.basic;
  const vb = STRATEGY_CATALOG.volatility_breakout.presets.basic;
  const rsi2 = STRATEGY_CATALOG.rsi2_pullback.presets.basic;
  const macd = STRATEGY_CATALOG.macd_momentum.presets.basic;
  const adx = STRATEGY_CATALOG.adx_dmi_trend.presets.basic;
  const bbSqueeze = STRATEGY_CATALOG.bollinger_squeeze.presets.basic;
  const ttm = STRATEGY_CATALOG.ttm_squeeze.presets.basic;
  const percentB = STRATEGY_CATALOG.bollinger_percent_b.presets.basic;
  const lowVol = STRATEGY_CATALOG.low_volume_pullback.presets.basic;
  const disparity = STRATEGY_CATALOG.disparity_reversion.presets.basic;
  const dm = PORTFOLIO_CATALOG.dual_momentum.presets.basic;
  const gtaa = PORTFOLIO_CATALOG.faber_gtaa.presets.basic;
  const rs = PORTFOLIO_CATALOG.krx_sector_rs.presets.basic;
  const clenow = PORTFOLIO_CATALOG.clenow_momentum.presets.basic;
  const regime = PORTFOLIO_CATALOG.price_regime.presets.basic;
  return {
    kind: 'ma_crossover',
    maType: ma.kind === 'ma_crossover' ? ma.maType : 'sma',
    fast: ma.kind === 'ma_crossover' ? String(ma.fast) : '5',
    slow: ma.kind === 'ma_crossover' ? String(ma.slow) : '20',
    regimePeriod: '',
    minRelativeVolume: '',
    entryLookback: donchian.kind === 'donchian_breakout' ? String(donchian.entryLookback) : '20',
    exitLookback: donchian.kind === 'donchian_breakout' ? String(donchian.exitLookback) : '10',
    volumeMultiplier: donchian.kind === 'donchian_breakout' ? String(donchian.volumeMultiplier) : '1',
    vbK: String(vb.k),
    vbUseAdaptiveNoise: vb.useAdaptiveNoise,
    vbNoiseLookback: String(vb.noiseLookback),
    vbTrendMaPeriod: String(vb.trendMaPeriod),
    vbHoldDays: String(vb.holdDays),
    rsiPeriod: rsi2.kind === 'rsi2_pullback' ? String(rsi2.rsiPeriod) : '2',
    oversoldThreshold: rsi2.kind === 'rsi2_pullback' ? String(rsi2.oversoldThreshold) : '10',
    longTrendMa: rsi2.kind === 'rsi2_pullback' ? String(rsi2.longTrendMa) : '200',
    exitShortMa: rsi2.kind === 'rsi2_pullback' ? String(rsi2.exitShortMa) : '5',
    maxHoldingDays: rsi2.kind === 'rsi2_pullback' ? String(rsi2.maxHoldingDays) : '10',
    fastPeriod: String(macd.fastPeriod),
    slowPeriod: String(macd.slowPeriod),
    signalPeriod: String(macd.signalPeriod),
    requireZeroLineAbove: macd.requireZeroLineAbove,
    diPeriod: String(adx.diPeriod),
    adxThreshold: String(adx.adxThreshold),
    bbSqueezePeriod: String(bbSqueeze.period),
    stdDevMultiplier: String(bbSqueeze.stdDevMultiplier),
    squeezeLookback: String(bbSqueeze.squeezeLookback),
    squeezePercentile: String(bbSqueeze.squeezePercentile),
    ttmPeriod: String(ttm.period),
    bbMult: String(ttm.bbMult),
    kcMult: String(ttm.kcMult),
    bbPeriod: String(percentB.bbPeriod),
    bbStdDev: String(percentB.bbStdDev),
    pbRsiPeriod: String(percentB.rsiPeriod),
    rsiOversold: String(percentB.rsiOversold),
    exitPercentB: String(percentB.exitPercentB),
    pullbackDays: String(lowVol.pullbackDays),
    maxVolumeRatio: String(lowVol.maxVolumeRatio),
    trendFastMa: String(lowVol.trendFastMa),
    trendSlowMa: String(lowVol.trendSlowMa),
    maPeriod: String(disparity.maPeriod),
    buyDisparity: String(disparity.buyDisparity),
    sellDisparity: String(disparity.sellDisparity),
    stopLossPct: String(disparity.stopLossPct),
    portfolioAssets: ['069500', '005930'],
    portfolioSafeAsset: '',
    dmLookbackDays: String(dm.lookbackDays),
    dmRebalanceDays: String(dm.rebalanceDays),
    gtaaSmaPeriod: String(gtaa.smaPeriod),
    gtaaRebalanceDays: String(gtaa.rebalanceDays),
    rsLookbackDays: String(rs.rsLookbackDays),
    rsTopK: String(rs.topK),
    rsMaxWeightPct: String(rs.maxWeightPct),
    rsRebalanceDays: String(rs.rebalanceDays),
    clenowRegressionDays: String(clenow.regressionDays),
    clenowAtrPeriod: String(clenow.atrPeriod),
    clenowRegimeSmaPeriod: String(clenow.regimeSmaPeriod),
    clenowTopK: String(clenow.topK),
    clenowRiskPerAssetBps: String(clenow.riskPerAssetBps),
    clenowRebalanceDays: String(clenow.rebalanceDays),
    regimeTrendSmaPeriod: String(regime.trendSmaPeriod),
    regimeVolLookback: String(regime.volLookback),
    regimeMaxAnnualVolPct: String(regime.maxAnnualVolPct),
    regimeCautionExposurePct: String(regime.cautionExposurePct),
    regimeRebalanceDays: String(regime.rebalanceDays),
    useChandelier: false,
    atrPeriod: '14',
    atrMultiplier: '3',
    useVolatilityParity: false,
    volLookback: '20',
    targetAnnualVolPct: '20',
    maxAllocationPct: '100',
  };
}

/** 규칙·오버레이 객체를 폼 상태로 변환한다. */
export function formFromRule(rule?: AnyStrategyRule, overlay?: ExitOverlay): RuleFormState {
  const base = defaultRuleForm();
  if (!isPortfolioRule(rule)) {
    if (overlay?.chandelier) {
      base.useChandelier = true;
      base.atrPeriod = String(overlay.chandelier.atrPeriod);
      base.atrMultiplier = String(overlay.chandelier.atrMultiplier);
    }
    if (overlay?.volatilityParity) {
      base.useVolatilityParity = true;
      base.volLookback = String(overlay.volatilityParity.volLookback);
      base.targetAnnualVolPct = String(overlay.volatilityParity.targetAnnualVolPct);
      base.maxAllocationPct = String(overlay.volatilityParity.maxAllocationPct);
    }
  }
  if (!rule) return base;
  base.kind = rule.kind;
  switch (rule.kind) {
    case 'ma_crossover':
      base.maType = rule.maType;
      base.fast = String(rule.fast);
      base.slow = String(rule.slow);
      base.regimePeriod = rule.regimePeriod ? String(rule.regimePeriod) : '';
      base.minRelativeVolume = rule.minRelativeVolume ? String(rule.minRelativeVolume) : '';
      break;
    case 'donchian_breakout':
      base.entryLookback = String(rule.entryLookback);
      base.exitLookback = String(rule.exitLookback);
      base.volumeMultiplier = String(rule.volumeMultiplier);
      break;
    case 'volatility_breakout':
      base.vbK = String(rule.k);
      base.vbUseAdaptiveNoise = rule.useAdaptiveNoise;
      base.vbNoiseLookback = String(rule.noiseLookback);
      base.vbTrendMaPeriod = String(rule.trendMaPeriod);
      base.vbHoldDays = String(rule.holdDays);
      break;
    case 'rsi2_pullback':
      base.rsiPeriod = String(rule.rsiPeriod);
      base.oversoldThreshold = String(rule.oversoldThreshold);
      base.longTrendMa = String(rule.longTrendMa);
      base.exitShortMa = String(rule.exitShortMa);
      base.maxHoldingDays = String(rule.maxHoldingDays);
      break;
    case 'macd_momentum':
      base.fastPeriod = String(rule.fastPeriod);
      base.slowPeriod = String(rule.slowPeriod);
      base.signalPeriod = String(rule.signalPeriod);
      base.requireZeroLineAbove = rule.requireZeroLineAbove;
      break;
    case 'adx_dmi_trend':
      base.diPeriod = String(rule.diPeriod);
      base.adxThreshold = String(rule.adxThreshold);
      break;
    case 'bollinger_squeeze':
      base.bbSqueezePeriod = String(rule.period);
      base.stdDevMultiplier = String(rule.stdDevMultiplier);
      base.squeezeLookback = String(rule.squeezeLookback);
      base.squeezePercentile = String(rule.squeezePercentile);
      break;
    case 'ttm_squeeze':
      base.ttmPeriod = String(rule.period);
      base.bbMult = String(rule.bbMult);
      base.kcMult = String(rule.kcMult);
      break;
    case 'bollinger_percent_b':
      base.bbPeriod = String(rule.bbPeriod);
      base.bbStdDev = String(rule.bbStdDev);
      base.pbRsiPeriod = String(rule.rsiPeriod);
      base.rsiOversold = String(rule.rsiOversold);
      base.exitPercentB = String(rule.exitPercentB);
      break;
    case 'low_volume_pullback':
      base.pullbackDays = String(rule.pullbackDays);
      base.maxVolumeRatio = String(rule.maxVolumeRatio);
      base.trendFastMa = String(rule.trendFastMa);
      base.trendSlowMa = String(rule.trendSlowMa);
      break;
    case 'disparity_reversion':
      base.maPeriod = String(rule.maPeriod);
      base.buyDisparity = String(rule.buyDisparity);
      base.sellDisparity = String(rule.sellDisparity);
      base.stopLossPct = String(rule.stopLossPct);
      break;
    case 'dual_momentum':
      base.portfolioAssets = [...rule.assets];
      base.portfolioSafeAsset = rule.safeAsset ?? '';
      base.dmLookbackDays = String(rule.lookbackDays);
      base.dmRebalanceDays = String(rule.rebalanceDays);
      break;
    case 'faber_gtaa':
      base.portfolioAssets = [...rule.assets];
      base.portfolioSafeAsset = rule.safeAsset ?? '';
      base.gtaaSmaPeriod = String(rule.smaPeriod);
      base.gtaaRebalanceDays = String(rule.rebalanceDays);
      break;
    case 'krx_sector_rs':
      base.portfolioAssets = [...rule.assets];
      base.portfolioSafeAsset = rule.safeAsset ?? '';
      base.rsLookbackDays = String(rule.rsLookbackDays);
      base.rsTopK = String(rule.topK);
      base.rsMaxWeightPct = String(rule.maxWeightPct);
      base.rsRebalanceDays = String(rule.rebalanceDays);
      break;
    case 'clenow_momentum':
      base.portfolioAssets = [...rule.assets];
      base.portfolioSafeAsset = rule.safeAsset ?? '';
      base.clenowRegressionDays = String(rule.regressionDays);
      base.clenowAtrPeriod = String(rule.atrPeriod);
      base.clenowRegimeSmaPeriod = String(rule.regimeSmaPeriod);
      base.clenowTopK = String(rule.topK);
      base.clenowRiskPerAssetBps = String(rule.riskPerAssetBps);
      base.clenowRebalanceDays = String(rule.rebalanceDays);
      break;
    case 'price_regime':
      base.portfolioAssets = [...rule.assets];
      base.portfolioSafeAsset = rule.safeAsset ?? '';
      base.regimeTrendSmaPeriod = String(rule.trendSmaPeriod);
      base.regimeVolLookback = String(rule.volLookback);
      base.regimeMaxAnnualVolPct = String(rule.maxAnnualVolPct);
      base.regimeCautionExposurePct = String(rule.cautionExposurePct);
      base.regimeRebalanceDays = String(rule.rebalanceDays);
      break;
  }
  return base;
}

/** 현재 폼에 카탈로그 프리셋을 적용한다. */
export function applyPreset(form: RuleFormState, presetKey: PresetKey): RuleFormState {
  const next: RuleFormState = { ...form, portfolioAssets: [...form.portfolioAssets] };
  if (form.kind === 'dual_momentum') {
    const preset = PORTFOLIO_CATALOG.dual_momentum.presets[presetKey];
    next.dmLookbackDays = String(preset.lookbackDays);
    next.dmRebalanceDays = String(preset.rebalanceDays);
    return next;
  }
  if (form.kind === 'faber_gtaa') {
    const preset = PORTFOLIO_CATALOG.faber_gtaa.presets[presetKey];
    next.gtaaSmaPeriod = String(preset.smaPeriod);
    next.gtaaRebalanceDays = String(preset.rebalanceDays);
    return next;
  }
  if (form.kind === 'krx_sector_rs') {
    const preset = PORTFOLIO_CATALOG.krx_sector_rs.presets[presetKey];
    next.rsLookbackDays = String(preset.rsLookbackDays);
    next.rsTopK = String(preset.topK);
    next.rsMaxWeightPct = String(preset.maxWeightPct);
    next.rsRebalanceDays = String(preset.rebalanceDays);
    return next;
  }
  if (form.kind === 'clenow_momentum') {
    const preset = PORTFOLIO_CATALOG.clenow_momentum.presets[presetKey];
    next.clenowRegressionDays = String(preset.regressionDays);
    next.clenowAtrPeriod = String(preset.atrPeriod);
    next.clenowRegimeSmaPeriod = String(preset.regimeSmaPeriod);
    next.clenowTopK = String(preset.topK);
    next.clenowRiskPerAssetBps = String(preset.riskPerAssetBps);
    next.clenowRebalanceDays = String(preset.rebalanceDays);
    return next;
  }
  if (form.kind === 'price_regime') {
    const preset = PORTFOLIO_CATALOG.price_regime.presets[presetKey];
    next.regimeTrendSmaPeriod = String(preset.trendSmaPeriod);
    next.regimeVolLookback = String(preset.volLookback);
    next.regimeMaxAnnualVolPct = String(preset.maxAnnualVolPct);
    next.regimeCautionExposurePct = String(preset.cautionExposurePct);
    next.regimeRebalanceDays = String(preset.rebalanceDays);
    return next;
  }
  const preset = STRATEGY_CATALOG[form.kind].presets[presetKey];
  switch (preset.kind) {
    case 'ma_crossover':
      next.maType = preset.maType;
      next.fast = String(preset.fast);
      next.slow = String(preset.slow);
      next.regimePeriod = '';
      next.minRelativeVolume = '';
      break;
    case 'donchian_breakout':
      next.entryLookback = String(preset.entryLookback);
      next.exitLookback = String(preset.exitLookback);
      next.volumeMultiplier = String(preset.volumeMultiplier);
      break;
    case 'volatility_breakout':
      next.vbK = String(preset.k);
      next.vbUseAdaptiveNoise = preset.useAdaptiveNoise;
      next.vbNoiseLookback = String(preset.noiseLookback);
      next.vbTrendMaPeriod = String(preset.trendMaPeriod);
      next.vbHoldDays = String(preset.holdDays);
      break;
    case 'rsi2_pullback':
      next.rsiPeriod = String(preset.rsiPeriod);
      next.oversoldThreshold = String(preset.oversoldThreshold);
      next.longTrendMa = String(preset.longTrendMa);
      next.exitShortMa = String(preset.exitShortMa);
      next.maxHoldingDays = String(preset.maxHoldingDays);
      break;
    case 'macd_momentum':
      next.fastPeriod = String(preset.fastPeriod);
      next.slowPeriod = String(preset.slowPeriod);
      next.signalPeriod = String(preset.signalPeriod);
      next.requireZeroLineAbove = preset.requireZeroLineAbove;
      break;
    case 'adx_dmi_trend':
      next.diPeriod = String(preset.diPeriod);
      next.adxThreshold = String(preset.adxThreshold);
      break;
    case 'bollinger_squeeze':
      next.bbSqueezePeriod = String(preset.period);
      next.stdDevMultiplier = String(preset.stdDevMultiplier);
      next.squeezeLookback = String(preset.squeezeLookback);
      next.squeezePercentile = String(preset.squeezePercentile);
      break;
    case 'ttm_squeeze':
      next.ttmPeriod = String(preset.period);
      next.bbMult = String(preset.bbMult);
      next.kcMult = String(preset.kcMult);
      break;
    case 'bollinger_percent_b':
      next.bbPeriod = String(preset.bbPeriod);
      next.bbStdDev = String(preset.bbStdDev);
      next.pbRsiPeriod = String(preset.rsiPeriod);
      next.rsiOversold = String(preset.rsiOversold);
      next.exitPercentB = String(preset.exitPercentB);
      break;
    case 'low_volume_pullback':
      next.pullbackDays = String(preset.pullbackDays);
      next.maxVolumeRatio = String(preset.maxVolumeRatio);
      next.trendFastMa = String(preset.trendFastMa);
      next.trendSlowMa = String(preset.trendSlowMa);
      break;
    case 'disparity_reversion':
      next.maPeriod = String(preset.maPeriod);
      next.buyDisparity = String(preset.buyDisparity);
      next.sellDisparity = String(preset.sellDisparity);
      next.stopLossPct = String(preset.stopLossPct);
      break;
  }
  return next;
}

/** 두 규칙 폼 상태가 모든 필드(바스켓 종목 순서 포함)에서 동일한지 비교한다. */
export function isSameRuleForm(a: RuleFormState, b: RuleFormState): boolean {
  return (Object.keys(a) as (keyof RuleFormState)[]).every(key => {
    const av = a[key];
    const bv = b[key];
    if (Array.isArray(av) && Array.isArray(bv)) {
      return av.length === bv.length && av.every((item, index) => item === bv[index]);
    }
    return av === bv;
  });
}

/** 문자열 입력값이 대상 숫자와 정확히 일치하는지 판정한다(빈 문자열의 0 변환 차단). */
function numEq(raw: string, expected: number): boolean {
  return raw.trim() !== '' && Number(raw) === expected;
}

/** 현재 폼 값이 일치하는 프리셋 키를 반환한다(동일 값 프리셋은 기본 우선). */
export function matchedPreset(form: RuleFormState): PresetKey | null {
  const order: PresetKey[] = ['basic', 'conservative', 'aggressive'];
  if (form.kind === 'dual_momentum') {
    for (const key of order) {
      const preset = PORTFOLIO_CATALOG.dual_momentum.presets[key];
      if (numEq(form.dmLookbackDays, preset.lookbackDays) && numEq(form.dmRebalanceDays, preset.rebalanceDays)) {
        return key;
      }
    }
    return null;
  }
  if (form.kind === 'faber_gtaa') {
    for (const key of order) {
      const preset = PORTFOLIO_CATALOG.faber_gtaa.presets[key];
      if (numEq(form.gtaaSmaPeriod, preset.smaPeriod) && numEq(form.gtaaRebalanceDays, preset.rebalanceDays)) {
        return key;
      }
    }
    return null;
  }
  if (form.kind === 'krx_sector_rs') {
    for (const key of order) {
      const preset = PORTFOLIO_CATALOG.krx_sector_rs.presets[key];
      if (
        numEq(form.rsLookbackDays, preset.rsLookbackDays) &&
        numEq(form.rsTopK, preset.topK) &&
        numEq(form.rsMaxWeightPct, preset.maxWeightPct) &&
        numEq(form.rsRebalanceDays, preset.rebalanceDays)
      ) {
        return key;
      }
    }
    return null;
  }
  if (form.kind === 'clenow_momentum') {
    for (const key of order) {
      const preset = PORTFOLIO_CATALOG.clenow_momentum.presets[key];
      if (
        numEq(form.clenowRegressionDays, preset.regressionDays) &&
        numEq(form.clenowAtrPeriod, preset.atrPeriod) &&
        numEq(form.clenowRegimeSmaPeriod, preset.regimeSmaPeriod) &&
        numEq(form.clenowTopK, preset.topK) &&
        numEq(form.clenowRiskPerAssetBps, preset.riskPerAssetBps) &&
        numEq(form.clenowRebalanceDays, preset.rebalanceDays)
      ) {
        return key;
      }
    }
    return null;
  }
  if (form.kind === 'price_regime') {
    for (const key of order) {
      const preset = PORTFOLIO_CATALOG.price_regime.presets[key];
      if (
        numEq(form.regimeTrendSmaPeriod, preset.trendSmaPeriod) &&
        numEq(form.regimeVolLookback, preset.volLookback) &&
        numEq(form.regimeMaxAnnualVolPct, preset.maxAnnualVolPct) &&
        numEq(form.regimeCautionExposurePct, preset.cautionExposurePct) &&
        numEq(form.regimeRebalanceDays, preset.rebalanceDays)
      ) {
        return key;
      }
    }
    return null;
  }
  for (const key of order) {
    const preset = STRATEGY_CATALOG[form.kind].presets[key];
    if (preset.kind === 'ma_crossover' && form.kind === 'ma_crossover') {
      if (
        form.maType === preset.maType &&
        numEq(form.fast, preset.fast) &&
        numEq(form.slow, preset.slow) &&
        form.regimePeriod.trim() === '' &&
        (form.minRelativeVolume.trim() === '' || Number(form.minRelativeVolume) === 0)
      ) {
        return key;
      }
    } else if (preset.kind === 'donchian_breakout' && form.kind === 'donchian_breakout') {
      if (
        numEq(form.entryLookback, preset.entryLookback) &&
        numEq(form.exitLookback, preset.exitLookback) &&
        numEq(form.volumeMultiplier, preset.volumeMultiplier)
      ) {
        return key;
      }
    } else if (preset.kind === 'volatility_breakout' && form.kind === 'volatility_breakout') {
      if (
        numEq(form.vbK, preset.k) &&
        form.vbUseAdaptiveNoise === preset.useAdaptiveNoise &&
        numEq(form.vbNoiseLookback, preset.noiseLookback) &&
        numEq(form.vbTrendMaPeriod, preset.trendMaPeriod) &&
        numEq(form.vbHoldDays, preset.holdDays)
      ) {
        return key;
      }
    } else if (preset.kind === 'rsi2_pullback' && form.kind === 'rsi2_pullback') {
      if (
        numEq(form.rsiPeriod, preset.rsiPeriod) &&
        numEq(form.oversoldThreshold, preset.oversoldThreshold) &&
        numEq(form.longTrendMa, preset.longTrendMa) &&
        numEq(form.exitShortMa, preset.exitShortMa) &&
        numEq(form.maxHoldingDays, preset.maxHoldingDays)
      ) {
        return key;
      }
    } else if (preset.kind === 'macd_momentum' && form.kind === 'macd_momentum') {
      if (
        numEq(form.fastPeriod, preset.fastPeriod) &&
        numEq(form.slowPeriod, preset.slowPeriod) &&
        numEq(form.signalPeriod, preset.signalPeriod) &&
        form.requireZeroLineAbove === preset.requireZeroLineAbove
      ) {
        return key;
      }
    } else if (preset.kind === 'adx_dmi_trend' && form.kind === 'adx_dmi_trend') {
      if (numEq(form.diPeriod, preset.diPeriod) && numEq(form.adxThreshold, preset.adxThreshold)) {
        return key;
      }
    } else if (preset.kind === 'bollinger_squeeze' && form.kind === 'bollinger_squeeze') {
      if (
        numEq(form.bbSqueezePeriod, preset.period) &&
        numEq(form.stdDevMultiplier, preset.stdDevMultiplier) &&
        numEq(form.squeezeLookback, preset.squeezeLookback) &&
        numEq(form.squeezePercentile, preset.squeezePercentile)
      ) {
        return key;
      }
    } else if (preset.kind === 'ttm_squeeze' && form.kind === 'ttm_squeeze') {
      if (
        numEq(form.ttmPeriod, preset.period) &&
        numEq(form.bbMult, preset.bbMult) &&
        numEq(form.kcMult, preset.kcMult)
      ) {
        return key;
      }
    } else if (preset.kind === 'bollinger_percent_b' && form.kind === 'bollinger_percent_b') {
      if (
        numEq(form.bbPeriod, preset.bbPeriod) &&
        numEq(form.bbStdDev, preset.bbStdDev) &&
        numEq(form.pbRsiPeriod, preset.rsiPeriod) &&
        numEq(form.rsiOversold, preset.rsiOversold) &&
        numEq(form.exitPercentB, preset.exitPercentB)
      ) {
        return key;
      }
    } else if (preset.kind === 'low_volume_pullback' && form.kind === 'low_volume_pullback') {
      if (
        numEq(form.pullbackDays, preset.pullbackDays) &&
        numEq(form.maxVolumeRatio, preset.maxVolumeRatio) &&
        numEq(form.trendFastMa, preset.trendFastMa) &&
        numEq(form.trendSlowMa, preset.trendSlowMa)
      ) {
        return key;
      }
    } else if (preset.kind === 'disparity_reversion' && form.kind === 'disparity_reversion') {
      if (
        numEq(form.maPeriod, preset.maPeriod) &&
        numEq(form.buyDisparity, preset.buyDisparity) &&
        numEq(form.sellDisparity, preset.sellDisparity) &&
        numEq(form.stopLossPct, preset.stopLossPct)
      ) {
        return key;
      }
    }
  }
  return null;
}

/** `noValidate` 폼에서 불완전 숫자(`1e` 등 `validity.badInput`) 입력 필드를 검출한다. */
export function findBadNumberInput(form: HTMLFormElement | null): HTMLInputElement | null {
  if (!form) return null;
  for (const input of form.querySelectorAll<HTMLInputElement>('input[type="number"]')) {
    if (!input.disabled && input.validity.badInput) return input;
  }
  return null;
}

/** 불완전 숫자 입력 필드에 대한 한글 오류 문구를 생성한다. */
export function badNumberMessage(input: HTMLInputElement): string {
  const label = input.closest('label')?.childNodes[0]?.textContent?.trim();
  return label ? `${label} 항목에 올바른 숫자를 입력하세요.` : '숫자 입력 형식이 올바르지 않습니다.';
}

/** 폼 상태에서 스키마 검증을 거친 규칙·오버레이를 조립한다 (다종목 전략은 오버레이 생략). */
export function buildRuleAndOverlay(
  form: RuleFormState,
): { ok: true; rule: AnyStrategyRule; overlay?: ExitOverlay } | { ok: false; error: string; focusName?: string } {
  if (isPortfolioKind(form.kind)) {
    if (form.portfolioAssets.length < 2 || form.portfolioAssets.length > 6) {
      return { ok: false, error: '위험 자산은 2-6개 종목으로 구성하세요.', focusName: 'portfolioAsset-0' };
    }
    const assets: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < form.portfolioAssets.length; i++) {
      const code = form.portfolioAssets[i].trim().toUpperCase();
      if (!masterCodeSchema.safeParse(code).success) {
        return {
          ok: false,
          error: `위험 자산 ${i + 1} 종목코드는 6자리 영숫자로 입력하세요.`,
          focusName: `portfolioAsset-${i}`,
        };
      }
      if (seen.has(code)) {
        return {
          ok: false,
          error: `바스켓 종목이 중복됩니다 (${code}). 서로 다른 종목코드를 입력하세요.`,
          focusName: `portfolioAsset-${i}`,
        };
      }
      seen.add(code);
      assets.push(code);
    }
    const trimmedSafe = form.portfolioSafeAsset.trim().toUpperCase();
    const safeAsset = trimmedSafe === '' ? null : trimmedSafe;
    if (safeAsset !== null) {
      if (!masterCodeSchema.safeParse(safeAsset).success) {
        return {
          ok: false,
          error: '안전자산 종목코드는 6자리 영숫자로 입력하거나 비워두세요.',
          focusName: 'portfolioSafeAsset',
        };
      }
      if (seen.has(safeAsset)) {
        return {
          ok: false,
          error: `안전자산(${safeAsset})은 위험 자산 목록과 중복될 수 없습니다.`,
          focusName: 'portfolioSafeAsset',
        };
      }
    }
    let rawPortfolio: unknown;
    if (form.kind === 'dual_momentum') {
      const lookbackDays = Number(form.dmLookbackDays);
      const rebalanceDays = Number(form.dmRebalanceDays);
      if (
        form.dmLookbackDays.trim() === '' ||
        !Number.isInteger(lookbackDays) ||
        lookbackDays < 20 ||
        lookbackDays > 252
      ) {
        return {
          ok: false,
          error: '모멘텀 관측 기간은 20-252 사이의 정수로 입력하세요.',
          focusName: 'dmLookbackDays',
        };
      }
      if (
        form.dmRebalanceDays.trim() === '' ||
        !Number.isInteger(rebalanceDays) ||
        rebalanceDays < 5 ||
        rebalanceDays > 60
      ) {
        return {
          ok: false,
          error: '리밸런싱 주기는 5-60 사이의 정수로 입력하세요.',
          focusName: 'dmRebalanceDays',
        };
      }
      rawPortfolio = { kind: 'dual_momentum', assets, safeAsset, lookbackDays, rebalanceDays };
    } else if (form.kind === 'faber_gtaa') {
      const smaPeriod = Number(form.gtaaSmaPeriod);
      const rebalanceDays = Number(form.gtaaRebalanceDays);
      if (form.gtaaSmaPeriod.trim() === '' || !Number.isInteger(smaPeriod) || smaPeriod < 20 || smaPeriod > 250) {
        return {
          ok: false,
          error: '추세 이동평균 기간은 20-250 사이의 정수로 입력하세요.',
          focusName: 'gtaaSmaPeriod',
        };
      }
      if (
        form.gtaaRebalanceDays.trim() === '' ||
        !Number.isInteger(rebalanceDays) ||
        rebalanceDays < 5 ||
        rebalanceDays > 60
      ) {
        return {
          ok: false,
          error: '리밸런싱 주기는 5-60 사이의 정수로 입력하세요.',
          focusName: 'gtaaRebalanceDays',
        };
      }
      rawPortfolio = { kind: 'faber_gtaa', assets, safeAsset, smaPeriod, rebalanceDays };
    } else if (form.kind === 'krx_sector_rs') {
      const rsLookbackDays = Number(form.rsLookbackDays);
      const topK = Number(form.rsTopK);
      const maxWeightPct = Number(form.rsMaxWeightPct);
      const rebalanceDays = Number(form.rsRebalanceDays);
      if (
        form.rsLookbackDays.trim() === '' ||
        !Number.isInteger(rsLookbackDays) ||
        rsLookbackDays < 10 ||
        rsLookbackDays > 120
      ) {
        return {
          ok: false,
          error: '상대강도 관측 기간은 10-120 사이의 정수로 입력하세요.',
          focusName: 'rsLookbackDays',
        };
      }
      if (form.rsTopK.trim() === '' || !Number.isInteger(topK) || topK < 1 || topK > 5) {
        return {
          ok: false,
          error: '상위 선정 종목 수는 1-5 사이의 정수로 입력하세요.',
          focusName: 'rsTopK',
        };
      }
      if (
        form.rsMaxWeightPct.trim() === '' ||
        !Number.isInteger(maxWeightPct) ||
        maxWeightPct < 20 ||
        maxWeightPct > 100
      ) {
        return {
          ok: false,
          error: '종목당 최대 비중 상한은 20-100 사이의 정수로 입력하세요.',
          focusName: 'rsMaxWeightPct',
        };
      }
      if (
        form.rsRebalanceDays.trim() === '' ||
        !Number.isInteger(rebalanceDays) ||
        rebalanceDays < 5 ||
        rebalanceDays > 60
      ) {
        return {
          ok: false,
          error: '리밸런싱 주기는 5-60 사이의 정수로 입력하세요.',
          focusName: 'rsRebalanceDays',
        };
      }
      rawPortfolio = { kind: 'krx_sector_rs', assets, safeAsset, rsLookbackDays, topK, maxWeightPct, rebalanceDays };
    } else if (form.kind === 'clenow_momentum') {
      const regressionDays = Number(form.clenowRegressionDays);
      const atrPeriod = Number(form.clenowAtrPeriod);
      const regimeSmaPeriod = Number(form.clenowRegimeSmaPeriod);
      const topK = Number(form.clenowTopK);
      const riskPerAssetBps = Number(form.clenowRiskPerAssetBps);
      const rebalanceDays = Number(form.clenowRebalanceDays);
      if (
        form.clenowRegressionDays.trim() === '' ||
        !Number.isInteger(regressionDays) ||
        regressionDays < 20 ||
        regressionDays > 252
      ) {
        return {
          ok: false,
          error: '회귀 모멘텀 기간은 20-252 사이의 정수로 입력하세요.',
          focusName: 'clenowRegressionDays',
        };
      }
      if (
        form.clenowAtrPeriod.trim() === '' ||
        !Number.isInteger(atrPeriod) ||
        atrPeriod < 10 ||
        atrPeriod > 60
      ) {
        return {
          ok: false,
          error: 'Wilder ATR 기간은 10-60 사이의 정수로 입력하세요.',
          focusName: 'clenowAtrPeriod',
        };
      }
      if (
        form.clenowRegimeSmaPeriod.trim() === '' ||
        !Number.isInteger(regimeSmaPeriod) ||
        regimeSmaPeriod < 20 ||
        regimeSmaPeriod > 250
      ) {
        return {
          ok: false,
          error: '종목 추세 SMA 기간은 20-250 사이의 정수로 입력하세요.',
          focusName: 'clenowRegimeSmaPeriod',
        };
      }
      if (form.clenowTopK.trim() === '' || !Number.isInteger(topK) || topK < 1 || topK > 5) {
        return {
          ok: false,
          error: '상위 선정 종목 수는 1-5 사이의 정수로 입력하세요.',
          focusName: 'clenowTopK',
        };
      }
      if (
        form.clenowRiskPerAssetBps.trim() === '' ||
        !Number.isInteger(riskPerAssetBps) ||
        riskPerAssetBps < 5 ||
        riskPerAssetBps > 100
      ) {
        return {
          ok: false,
          error: '종목당 위험예산은 5-100 사이의 정수로 입력하세요.',
          focusName: 'clenowRiskPerAssetBps',
        };
      }
      if (
        form.clenowRebalanceDays.trim() === '' ||
        !Number.isInteger(rebalanceDays) ||
        rebalanceDays < 5 ||
        rebalanceDays > 60
      ) {
        return {
          ok: false,
          error: '리밸런싱 주기는 5-60 사이의 정수로 입력하세요.',
          focusName: 'clenowRebalanceDays',
        };
      }
      rawPortfolio = {
        kind: 'clenow_momentum',
        assets,
        safeAsset,
        regressionDays,
        atrPeriod,
        regimeSmaPeriod,
        topK,
        riskPerAssetBps,
        rebalanceDays,
      };
    } else {
      const trendSmaPeriod = Number(form.regimeTrendSmaPeriod);
      const volLookback = Number(form.regimeVolLookback);
      const maxAnnualVolPct = Number(form.regimeMaxAnnualVolPct);
      const cautionExposurePct = Number(form.regimeCautionExposurePct);
      const rebalanceDays = Number(form.regimeRebalanceDays);
      if (
        form.regimeTrendSmaPeriod.trim() === '' ||
        !Number.isInteger(trendSmaPeriod) ||
        trendSmaPeriod < 20 ||
        trendSmaPeriod > 250
      ) {
        return {
          ok: false,
          error: '추세 SMA 기간은 20~250 사이의 정수여야 합니다.',
          focusName: 'regimeTrendSmaPeriod',
        };
      }
      if (
        form.regimeVolLookback.trim() === '' ||
        !Number.isInteger(volLookback) ||
        volLookback < 10 ||
        volLookback > 60
      ) {
        return {
          ok: false,
          error: '변동성 관측 기간은 10~60 사이의 정수여야 합니다.',
          focusName: 'regimeVolLookback',
        };
      }
      if (
        form.regimeMaxAnnualVolPct.trim() === '' ||
        !Number.isInteger(maxAnnualVolPct) ||
        maxAnnualVolPct < 5 ||
        maxAnnualVolPct > 80
      ) {
        return {
          ok: false,
          error: '최대 연변동성 한도는 5~80 사이의 정수(%)여야 합니다.',
          focusName: 'regimeMaxAnnualVolPct',
        };
      }
      if (
        form.regimeCautionExposurePct.trim() === '' ||
        !Number.isInteger(cautionExposurePct) ||
        cautionExposurePct < 0 ||
        cautionExposurePct > 100
      ) {
        return {
          ok: false,
          error: '경계 위험 노출 비중은 0~100 사이의 정수(%)여야 합니다.',
          focusName: 'regimeCautionExposurePct',
        };
      }
      if (
        form.regimeRebalanceDays.trim() === '' ||
        !Number.isInteger(rebalanceDays) ||
        rebalanceDays < 5 ||
        rebalanceDays > 60
      ) {
        return {
          ok: false,
          error: '리밸런싱 주기는 5~60 사이의 정수여야 합니다.',
          focusName: 'regimeRebalanceDays',
        };
      }
      rawPortfolio = {
        kind: 'price_regime',
        assets,
        safeAsset,
        trendSmaPeriod,
        volLookback,
        maxAnnualVolPct,
        cautionExposurePct,
        rebalanceDays,
      };
    }
    const parsedPortfolio = portfolioRuleSchema.safeParse(rawPortfolio);
    if (!parsedPortfolio.success) {
      return {
        ok: false,
        error: parsedPortfolio.error.issues[0]?.message ?? '다종목 자산배분 규칙 입력값을 확인하세요.',
      };
    }
    return { ok: true, rule: parsedPortfolio.data, overlay: undefined };
  }

  let rawRule: unknown;
  switch (form.kind) {
    case 'ma_crossover': {
      const fast = Number(form.fast);
      const slow = Number(form.slow);
      if (form.fast.trim() === '' || !Number.isInteger(fast) || fast < 2 || fast > 60) {
        return { ok: false, error: '단기 기간은 2-60 사이의 정수로 입력하세요.', focusName: 'fast' };
      }
      if (form.slow.trim() === '' || !Number.isInteger(slow) || slow < 3 || slow > 120) {
        return { ok: false, error: '장기 기간은 3-120 사이의 정수로 입력하세요.', focusName: 'slow' };
      }
      if (fast >= slow) {
        return { ok: false, error: '단기 기간은 장기 기간보다 작아야 합니다.', focusName: 'fast' };
      }
      const trimmedRegime = form.regimePeriod.trim();
      const trimmedVol = form.minRelativeVolume.trim();
      const maRule: Record<string, unknown> = {
        kind: 'ma_crossover',
        maType: form.maType,
        fast,
        slow,
      };
      if (trimmedRegime !== '') {
        const regime = Number(trimmedRegime);
        if (!Number.isInteger(regime) || regime < 20 || regime > 240) {
          return { ok: false, error: '장기 추세 필터는 20-240 사이의 정수로 입력하세요.', focusName: 'regimePeriod' };
        }
        maRule.regimePeriod = regime;
      }
      if (trimmedVol !== '') {
        const vol = Number(trimmedVol);
        if (!Number.isFinite(vol) || vol < 0 || vol > 5) {
          return { ok: false, error: '최소 상대 거래량은 0-5 범위의 숫자로 입력하세요.', focusName: 'minRelativeVolume' };
        }
        if (vol > 0) maRule.minRelativeVolume = vol;
      }
      rawRule = maRule;
      break;
    }
    case 'donchian_breakout': {
      const entryLookback = Number(form.entryLookback);
      const exitLookback = Number(form.exitLookback);
      const volumeMultiplier = Number(form.volumeMultiplier);
      if (form.entryLookback.trim() === '' || !Number.isInteger(entryLookback) || entryLookback < 10 || entryLookback > 120) {
        return { ok: false, error: '진입 고가 기간은 10-120 사이의 정수로 입력하세요.', focusName: 'entryLookback' };
      }
      if (form.exitLookback.trim() === '' || !Number.isInteger(exitLookback) || exitLookback < 3 || exitLookback > 60) {
        return { ok: false, error: '청산 저가 기간은 3-60 사이의 정수로 입력하세요.', focusName: 'exitLookback' };
      }
      if (exitLookback >= entryLookback) {
        return { ok: false, error: '청산 기간은 진입 기간보다 작아야 합니다.', focusName: 'exitLookback' };
      }
      if (form.volumeMultiplier.trim() === '' || !Number.isFinite(volumeMultiplier) || volumeMultiplier < 0.5 || volumeMultiplier > 5) {
        return { ok: false, error: '최소 거래량 배수는 0.5-5 범위의 숫자로 입력하세요.', focusName: 'volumeMultiplier' };
      }
      rawRule = { kind: 'donchian_breakout', entryLookback, exitLookback, volumeMultiplier };
      break;
    }
    case 'volatility_breakout': {
      const k = Number(form.vbK);
      const noiseLookback = Number(form.vbNoiseLookback);
      const trendMaPeriod = Number(form.vbTrendMaPeriod);
      const holdDays = Number(form.vbHoldDays);
      if (form.vbK.trim() === '' || !Number.isFinite(k) || k < 0.1 || k > 1) {
        return { ok: false, error: '돌파 계수 k는 0.1-1 범위의 숫자로 입력하세요.', focusName: 'vbK' };
      }
      if (form.vbNoiseLookback.trim() === '' || !Number.isInteger(noiseLookback) || noiseLookback < 5 || noiseLookback > 60) {
        return { ok: false, error: '노이즈 평균 기간은 5-60 사이의 정수로 입력하세요.', focusName: 'vbNoiseLookback' };
      }
      if (form.vbTrendMaPeriod.trim() === '' || !Number.isInteger(trendMaPeriod) || trendMaPeriod < 5 || trendMaPeriod > 200) {
        return { ok: false, error: '상승 추세 SMA 기간은 5-200 사이의 정수로 입력하세요.', focusName: 'vbTrendMaPeriod' };
      }
      if (form.vbHoldDays.trim() === '' || !Number.isInteger(holdDays) || holdDays < 1 || holdDays > 10) {
        return { ok: false, error: '보유 거래일 수는 1-10 사이의 정수로 입력하세요.', focusName: 'vbHoldDays' };
      }
      rawRule = {
        kind: 'volatility_breakout',
        k,
        useAdaptiveNoise: form.vbUseAdaptiveNoise,
        noiseLookback,
        trendMaPeriod,
        holdDays,
      };
      break;
    }
    case 'rsi2_pullback': {
      const rsiPeriod = Number(form.rsiPeriod);
      const oversoldThreshold = Number(form.oversoldThreshold);
      const longTrendMa = Number(form.longTrendMa);
      const exitShortMa = Number(form.exitShortMa);
      const maxHoldingDays = Number(form.maxHoldingDays);
      if (form.rsiPeriod.trim() === '' || !Number.isInteger(rsiPeriod) || rsiPeriod < 2 || rsiPeriod > 5) {
        return { ok: false, error: 'RSI 기간은 2-5 사이의 정수로 입력하세요.', focusName: 'rsiPeriod' };
      }
      if (form.oversoldThreshold.trim() === '' || !Number.isFinite(oversoldThreshold) || oversoldThreshold < 2 || oversoldThreshold > 25) {
        return { ok: false, error: '과매도 기준은 2-25 범위의 숫자로 입력하세요.', focusName: 'oversoldThreshold' };
      }
      if (form.longTrendMa.trim() === '' || !Number.isInteger(longTrendMa) || longTrendMa < 60 || longTrendMa > 240) {
        return { ok: false, error: '장기 추세선은 60-240 사이의 정수로 입력하세요.', focusName: 'longTrendMa' };
      }
      if (form.exitShortMa.trim() === '' || !Number.isInteger(exitShortMa) || exitShortMa < 3 || exitShortMa > 10) {
        return { ok: false, error: '청산 단기선은 3-10 사이의 정수로 입력하세요.', focusName: 'exitShortMa' };
      }
      if (form.maxHoldingDays.trim() === '' || !Number.isInteger(maxHoldingDays) || maxHoldingDays < 3 || maxHoldingDays > 20) {
        return { ok: false, error: '최대 보유 기간은 3-20 사이의 정수로 입력하세요.', focusName: 'maxHoldingDays' };
      }
      rawRule = {
        kind: 'rsi2_pullback',
        rsiPeriod,
        oversoldThreshold,
        longTrendMa,
        exitShortMa,
        maxHoldingDays,
      };
      break;
    }
    case 'macd_momentum': {
      const fastPeriod = Number(form.fastPeriod);
      const slowPeriod = Number(form.slowPeriod);
      const signalPeriod = Number(form.signalPeriod);
      if (form.fastPeriod.trim() === '' || !Number.isInteger(fastPeriod) || fastPeriod < 3 || fastPeriod > 30) {
        return { ok: false, error: 'MACD 단기 EMA 기간은 3-30 사이의 정수로 입력하세요.', focusName: 'fastPeriod' };
      }
      if (form.slowPeriod.trim() === '' || !Number.isInteger(slowPeriod) || slowPeriod < 10 || slowPeriod > 100) {
        return { ok: false, error: 'MACD 장기 EMA 기간은 10-100 사이의 정수로 입력하세요.', focusName: 'slowPeriod' };
      }
      if (fastPeriod >= slowPeriod) {
        return { ok: false, error: 'MACD 단기 기간은 장기 기간보다 작아야 합니다.', focusName: 'fastPeriod' };
      }
      if (form.signalPeriod.trim() === '' || !Number.isInteger(signalPeriod) || signalPeriod < 3 || signalPeriod > 30) {
        return { ok: false, error: '시그널 EMA 기간은 3-30 사이의 정수로 입력하세요.', focusName: 'signalPeriod' };
      }
      rawRule = {
        kind: 'macd_momentum',
        fastPeriod,
        slowPeriod,
        signalPeriod,
        requireZeroLineAbove: form.requireZeroLineAbove,
      };
      break;
    }
    case 'adx_dmi_trend': {
      const diPeriod = Number(form.diPeriod);
      const adxThreshold = Number(form.adxThreshold);
      if (form.diPeriod.trim() === '' || !Number.isInteger(diPeriod) || diPeriod < 7 || diPeriod > 30) {
        return { ok: false, error: 'DI 기간은 7-30 사이의 정수로 입력하세요.', focusName: 'diPeriod' };
      }
      if (form.adxThreshold.trim() === '' || !Number.isFinite(adxThreshold) || adxThreshold < 15 || adxThreshold > 40) {
        return { ok: false, error: 'ADX 기준은 15-40 범위의 숫자로 입력하세요.', focusName: 'adxThreshold' };
      }
      rawRule = { kind: 'adx_dmi_trend', diPeriod, adxThreshold };
      break;
    }
    case 'bollinger_squeeze': {
      const period = Number(form.bbSqueezePeriod);
      const stdDevMultiplier = Number(form.stdDevMultiplier);
      const squeezeLookback = Number(form.squeezeLookback);
      const squeezePercentile = Number(form.squeezePercentile);
      if (form.bbSqueezePeriod.trim() === '' || !Number.isInteger(period) || period < 10 || period > 60) {
        return { ok: false, error: '볼린저 기간은 10-60 사이의 정수로 입력하세요.', focusName: 'bbSqueezePeriod' };
      }
      if (form.stdDevMultiplier.trim() === '' || !Number.isFinite(stdDevMultiplier) || stdDevMultiplier < 1.5 || stdDevMultiplier > 3) {
        return { ok: false, error: '표준편차 배수는 1.5-3 범위의 숫자로 입력하세요.', focusName: 'stdDevMultiplier' };
      }
      if (form.squeezeLookback.trim() === '' || !Number.isInteger(squeezeLookback) || squeezeLookback < 20 || squeezeLookback > 120) {
        return { ok: false, error: '수축 비교 기간은 20-120 사이의 정수로 입력하세요.', focusName: 'squeezeLookback' };
      }
      if (form.squeezePercentile.trim() === '' || !Number.isFinite(squeezePercentile) || squeezePercentile < 10 || squeezePercentile > 50) {
        return { ok: false, error: '수축 하위 분위수는 10-50 범위의 숫자로 입력하세요.', focusName: 'squeezePercentile' };
      }
      rawRule = { kind: 'bollinger_squeeze', period, stdDevMultiplier, squeezeLookback, squeezePercentile };
      break;
    }
    case 'ttm_squeeze': {
      const period = Number(form.ttmPeriod);
      const bbMult = Number(form.bbMult);
      const kcMult = Number(form.kcMult);
      if (form.ttmPeriod.trim() === '' || !Number.isInteger(period) || period < 14 || period > 30) {
        return { ok: false, error: '계산 기간은 14-30 사이의 정수로 입력하세요.', focusName: 'ttmPeriod' };
      }
      if (form.bbMult.trim() === '' || !Number.isFinite(bbMult) || bbMult < 1.5 || bbMult > 2.5) {
        return { ok: false, error: '볼린저 배수는 1.5-2.5 범위의 숫자로 입력하세요.', focusName: 'bbMult' };
      }
      if (form.kcMult.trim() === '' || !Number.isFinite(kcMult) || kcMult < 1 || kcMult > 2.5) {
        return { ok: false, error: '켈트너 배수는 1-2.5 범위의 숫자로 입력하세요.', focusName: 'kcMult' };
      }
      rawRule = { kind: 'ttm_squeeze', period, bbMult, kcMult };
      break;
    }
    case 'bollinger_percent_b': {
      const bbPeriod = Number(form.bbPeriod);
      const bbStdDev = Number(form.bbStdDev);
      const rsiPeriod = Number(form.pbRsiPeriod);
      const rsiOversold = Number(form.rsiOversold);
      const exitPercentB = Number(form.exitPercentB);
      if (form.bbPeriod.trim() === '' || !Number.isInteger(bbPeriod) || bbPeriod < 14 || bbPeriod > 30) {
        return { ok: false, error: '볼린저 기간은 14-30 사이의 정수로 입력하세요.', focusName: 'bbPeriod' };
      }
      if (form.bbStdDev.trim() === '' || !Number.isFinite(bbStdDev) || bbStdDev < 1.8 || bbStdDev > 2.5) {
        return { ok: false, error: '볼린저 표준편차 배수는 1.8-2.5 범위의 숫자로 입력하세요.', focusName: 'bbStdDev' };
      }
      if (form.pbRsiPeriod.trim() === '' || !Number.isInteger(rsiPeriod) || rsiPeriod < 7 || rsiPeriod > 21) {
        return { ok: false, error: 'RSI 기간은 7-21 사이의 정수로 입력하세요.', focusName: 'pbRsiPeriod' };
      }
      if (form.rsiOversold.trim() === '' || !Number.isFinite(rsiOversold) || rsiOversold < 20 || rsiOversold > 40) {
        return { ok: false, error: 'RSI 과매도 기준은 20-40 범위의 숫자로 입력하세요.', focusName: 'rsiOversold' };
      }
      if (form.exitPercentB.trim() === '' || !Number.isFinite(exitPercentB) || exitPercentB < 0.4 || exitPercentB > 1) {
        return { ok: false, error: '청산 목표 %B는 0.4-1 범위의 숫자로 입력하세요.', focusName: 'exitPercentB' };
      }
      rawRule = { kind: 'bollinger_percent_b', bbPeriod, bbStdDev, rsiPeriod, rsiOversold, exitPercentB };
      break;
    }
    case 'low_volume_pullback': {
      const pullbackDays = Number(form.pullbackDays);
      const maxVolumeRatio = Number(form.maxVolumeRatio);
      const trendFastMa = Number(form.trendFastMa);
      const trendSlowMa = Number(form.trendSlowMa);
      if (form.pullbackDays.trim() === '' || !Number.isInteger(pullbackDays) || pullbackDays < 2 || pullbackDays > 7) {
        return { ok: false, error: '눌림 기간은 2-7 사이의 정수로 입력하세요.', focusName: 'pullbackDays' };
      }
      if (form.maxVolumeRatio.trim() === '' || !Number.isFinite(maxVolumeRatio) || maxVolumeRatio < 0.3 || maxVolumeRatio > 0.9) {
        return { ok: false, error: '최대 거래량 비율은 0.3-0.9 범위의 숫자로 입력하세요.', focusName: 'maxVolumeRatio' };
      }
      if (form.trendFastMa.trim() === '' || !Number.isInteger(trendFastMa) || trendFastMa < 10 || trendFastMa > 30) {
        return { ok: false, error: '단기 추세선은 10-30 사이의 정수로 입력하세요.', focusName: 'trendFastMa' };
      }
      if (form.trendSlowMa.trim() === '' || !Number.isInteger(trendSlowMa) || trendSlowMa < 40 || trendSlowMa > 120) {
        return { ok: false, error: '장기 추세선은 40-120 사이의 정수로 입력하세요.', focusName: 'trendSlowMa' };
      }
      if (trendFastMa >= trendSlowMa) {
        return { ok: false, error: '단기 추세선은 장기 추세선보다 작아야 합니다.', focusName: 'trendFastMa' };
      }
      rawRule = { kind: 'low_volume_pullback', pullbackDays, maxVolumeRatio, trendFastMa, trendSlowMa };
      break;
    }
    case 'disparity_reversion': {
      const maPeriod = Number(form.maPeriod);
      const buyDisparity = Number(form.buyDisparity);
      const sellDisparity = Number(form.sellDisparity);
      const stopLossPct = Number(form.stopLossPct);
      if (form.maPeriod.trim() === '' || !Number.isInteger(maPeriod) || maPeriod < 10 || maPeriod > 60) {
        return { ok: false, error: '이동평균 기간은 10-60 사이의 정수로 입력하세요.', focusName: 'maPeriod' };
      }
      if (form.buyDisparity.trim() === '' || !Number.isFinite(buyDisparity) || buyDisparity < 85 || buyDisparity > 97) {
        return { ok: false, error: '매수 이격도는 85-97 범위의 숫자로 입력하세요.', focusName: 'buyDisparity' };
      }
      if (form.sellDisparity.trim() === '' || !Number.isFinite(sellDisparity) || sellDisparity < 98 || sellDisparity > 105) {
        return { ok: false, error: '매도 이격도는 98-105 범위의 숫자로 입력하세요.', focusName: 'sellDisparity' };
      }
      if (buyDisparity >= sellDisparity) {
        return { ok: false, error: '매수 이격도는 매도 이격도보다 작아야 합니다.', focusName: 'buyDisparity' };
      }
      if (form.stopLossPct.trim() === '' || !Number.isFinite(stopLossPct) || stopLossPct < 2 || stopLossPct > 10) {
        return { ok: false, error: '손절 기준은 2-10 범위의 숫자로 입력하세요.', focusName: 'stopLossPct' };
      }
      rawRule = { kind: 'disparity_reversion', maPeriod, buyDisparity, sellDisparity, stopLossPct };
      break;
    }
  }

  const parsedRule = strategyRuleSchema.safeParse(rawRule);
  if (!parsedRule.success) {
    return { ok: false, error: parsedRule.error.issues[0]?.message ?? '전략 규칙 입력값을 확인하세요.' };
  }

  let overlay: ExitOverlay | undefined;
  if (form.useChandelier || form.useVolatilityParity) {
    const rawOverlay: Record<string, unknown> = {};
    if (form.useChandelier) {
      const atrPeriod = Number(form.atrPeriod);
      const atrMultiplier = Number(form.atrMultiplier);
      if (form.atrPeriod.trim() === '' || !Number.isInteger(atrPeriod) || atrPeriod < 7 || atrPeriod > 30) {
        return { ok: false, error: '샹들리에 청산 ATR 기간은 7-30 사이의 정수로 입력하세요.', focusName: 'atrPeriod' };
      }
      if (form.atrMultiplier.trim() === '' || !Number.isFinite(atrMultiplier) || atrMultiplier < 1.5 || atrMultiplier > 5) {
        return { ok: false, error: '샹들리에 청산 ATR 배수는 1.5-5 범위의 숫자로 입력하세요.', focusName: 'atrMultiplier' };
      }
      rawOverlay.chandelier = { atrPeriod, atrMultiplier };
    }
    if (form.useVolatilityParity) {
      const volLookback = Number(form.volLookback);
      const targetAnnualVolPct = Number(form.targetAnnualVolPct);
      const maxAllocationPct = Number(form.maxAllocationPct);
      if (form.volLookback.trim() === '' || !Number.isInteger(volLookback) || volLookback < 10 || volLookback > 60) {
        return { ok: false, error: '변동성 관측 기간은 10-60 사이의 정수로 입력하세요.', focusName: 'volLookback' };
      }
      if (
        form.targetAnnualVolPct.trim() === '' ||
        !Number.isFinite(targetAnnualVolPct) ||
        targetAnnualVolPct < 5 ||
        targetAnnualVolPct > 60
      ) {
        return {
          ok: false,
          error: '목표 연환산 변동성은 5-60% 범위의 숫자로 입력하세요.',
          focusName: 'targetAnnualVolPct',
        };
      }
      if (
        form.maxAllocationPct.trim() === '' ||
        !Number.isFinite(maxAllocationPct) ||
        maxAllocationPct < 10 ||
        maxAllocationPct > 100
      ) {
        return { ok: false, error: '최대 배정 비중은 10-100% 범위의 숫자로 입력하세요.', focusName: 'maxAllocationPct' };
      }
      rawOverlay.volatilityParity = { volLookback, targetAnnualVolPct, maxAllocationPct };
    }
    const parsedOverlay = exitOverlaySchema.safeParse(rawOverlay);
    if (!parsedOverlay.success) {
      return {
        ok: false,
        error: parsedOverlay.error.issues[0]?.message ?? '오버레이 입력값을 확인하세요.',
        focusName: form.useChandelier ? 'atrPeriod' : 'volLookback',
      };
    }
    overlay = parsedOverlay.data;
  }

  return { ok: true, rule: parsedRule.data, overlay };
}

/** v1 기본 SMA 경로(필터·오버레이 없음, 장기 100 이하)인지 판정한다. */
export function isLegacySma(
  rule: AnyStrategyRule,
  overlay?: ExitOverlay,
): rule is Extract<StrategyRule, { kind: 'ma_crossover' }> {
  if (isPortfolioRule(rule)) return false;
  return (
    rule.kind === 'ma_crossover' &&
    rule.maType === 'sma' &&
    rule.slow <= 100 &&
    !rule.regimePeriod &&
    !rule.minRelativeVolume &&
    !overlay?.chandelier &&
    !overlay?.volatilityParity
  );
}

/** DEMO(종가 전용) 환경에서 실행·저장 가능한 규칙 조합인지 확인한다 (`assertCloseOnly`와 동일 기준). */
export function isDemoRuleSupported(form: RuleFormState): boolean {
  if (isPortfolioKind(form.kind)) return false;
  if (form.useChandelier || form.useVolatilityParity) return false;
  if (STRATEGY_CATALOG[form.kind].environments.demo === false) return false;
  if (form.kind === 'ma_crossover' && form.minRelativeVolume.trim() !== '' && Number(form.minRelativeVolume) > 0) {
    return false;
  }
  return true;
}

/** DEMO 환경에서 차단될 때 표시할 사유 문구를 반환한다. */
export function demoFormBlockReason(form: RuleFormState): string {
  if (isPortfolioKind(form.kind)) return portfolioOnly;
  return 'DEMO는 종가만 제공합니다. 고저가·거래량이 필요한 규칙이나 샹들리에 청산·변동성 패리티 오버레이는 저장 일봉 백테스트에서 사용하세요.';
}

/** 폼 상태가 필터·오버레이 없는 기본 SMA인지 판정한다(`shared/strategy-rules` `unfilteredSma`와 동일 기준). */
function isFormUnfilteredSma(form: RuleFormState): boolean {
  return (
    form.kind === 'ma_crossover' &&
    form.maType === 'sma' &&
    form.regimePeriod.trim() === '' &&
    (form.minRelativeVolume.trim() === '' || Number(form.minRelativeVolume) <= 0)
  );
}

/** KIS 모의 계약·실시간 시작 차단 사유를 반환한다(`shared/strategy-rules` `assertRealtimeRule`과 100% 일치). */
export function kisRealtimeBlockReason(rule?: AnyStrategyRule, overlay?: ExitOverlay, slow?: number): string {
  try {
    assertRealtimeRule(rule, overlay, slow);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : 'KIS 모의 실시간 시작을 지원하지 않는 규칙입니다.';
  }
}

/** 저장 전략이 KIS 모의 확정 일봉 기반(종가 확정형 10종 + 선택 샹들리에)인지 판정한다. */
export function isKisConfirmedDailyStrategy(
  rule?: AnyStrategyRule,
  overlay?: ExitOverlay,
  slow?: number,
): boolean {
  return kisRealtimeBlockReason(rule, overlay, slow) === '' && !isBasicRealtimeSma(rule, overlay, slow);
}

/** 폼 상태가 KIS 모의 체결가 이벤트 단위를 사용하는 무필터·무오버레이 기본 SMA인지 판정한다(`slow` 상한과 무관). */
export function isKisTickSmaForm(form: RuleFormState): boolean {
  return !form.useChandelier && !form.useVolatilityParity && isFormUnfilteredSma(form);
}

/** 저장 전략이 KIS 모의 체결가 이벤트 단위를 사용하는 무필터·무오버레이 기본 SMA인지 판정한다(`slow` 상한과 무관). */
export function isKisTickSmaRule(rule?: AnyStrategyRule, overlay?: ExitOverlay): boolean {
  if (isPortfolioRule(rule)) return false;
  if (overlay?.chandelier || overlay?.volatilityParity) return false;
  return (
    !rule ||
    (rule.kind === 'ma_crossover' &&
      rule.maType === 'sma' &&
      !rule.regimePeriod &&
      !rule.minRelativeVolume)
  );
}

/** 폼 상태에서 KIS 모의 기본 무필터 SMA 장기 기간 계약 상한(100) 초과 여부를 판정한다. */
export function isKisBasicSmaSlowExceeded(form: RuleFormState): boolean {
  return isKisTickSmaForm(form) && form.slow.trim() !== '' && Number(form.slow) > 100;
}

/** 폼 상태에서 KIS 모의 계약·시작 지원 여부를 판정한다(`assertRealtimeRule`과 100% 일치). */
export function isKisRealtimeFormSupported(form: RuleFormState): boolean {
  if (isPortfolioKind(form.kind)) return false;
  if (form.kind === 'volatility_breakout' || form.useVolatilityParity) return false;
  if (isKisBasicSmaSlowExceeded(form)) return false;
  return true;
}

/** 폼 상태의 KIS 모의 실행 모드를 분류한다. */
export type KisFormExecutionMode = 'realtime-tick' | 'confirmed-daily' | 'unsupported';

/** 폼 상태에서 KIS 모의 실행 모드를 반환한다. */
export function kisFormExecutionMode(form: RuleFormState): KisFormExecutionMode {
  if (!isKisRealtimeFormSupported(form)) return 'unsupported';
  if (!form.useChandelier && isFormUnfilteredSma(form)) return 'realtime-tick';
  return 'confirmed-daily';
}

/** 폼 상태에서 KIS 모의 시작 제한 사유를 반환한다(지원 설정이면 빈 문자열). */
export function kisFormBlockReason(form: RuleFormState): string {
  if (isPortfolioKind(form.kind)) return portfolioOnly;
  if (form.kind === 'volatility_breakout' || form.useVolatilityParity) {
    return '윌리엄스 변동성 돌파와 변동성 패리티 수량 조절은 저장 일봉 백테스트 전용입니다.';
  }
  if (isKisBasicSmaSlowExceeded(form)) {
    return '실시간 체결가 기본 SMA의 장기 기간은 100 이하여야 합니다.';
  }
  return '';
}

/** 저장된 실험 입력에서 표준 StrategyRule 또는 PortfolioRule을 추출한다. */
export function ruleFromExperimentInput(input: Experiment['snapshot']['input']): AnyStrategyRule {
  if ('rule' in input) return input.rule;
  return { kind: 'ma_crossover', maType: 'sma', fast: input.fast, slow: input.slow };
}

/** 규칙과 오버레이를 한 줄 한글 요약으로 포맷한다. */
export function formatRuleSummary(rule: AnyStrategyRule, overlay?: ExitOverlay): string {
  const parts: string[] = [];
  switch (rule.kind) {
    case 'ma_crossover':
      parts.push(`${STRATEGY_CATALOG.ma_crossover.title} (${rule.maType.toUpperCase()} ${rule.fast}/${rule.slow})`);
      if (rule.regimePeriod) parts.push(`추세선 ${rule.regimePeriod}봉`);
      if (rule.minRelativeVolume) parts.push(`상대거래량 ${rule.minRelativeVolume}배+`);
      break;
    case 'donchian_breakout':
      parts.push(
        `${STRATEGY_CATALOG.donchian_breakout.title} (진입 ${rule.entryLookback} / 청산 ${rule.exitLookback} · 거래량 ${rule.volumeMultiplier}배 초과)`,
      );
      break;
    case 'volatility_breakout':
      parts.push(
        `${STRATEGY_CATALOG.volatility_breakout.title} (${
          rule.useAdaptiveNoise ? `적응형 노이즈 ${rule.noiseLookback}봉` : `k=${rule.k}`
        } · 추세 SMA${rule.trendMaPeriod} · 보유 ${rule.holdDays}일)`,
      );
      break;
    case 'rsi2_pullback':
      parts.push(
        `${STRATEGY_CATALOG.rsi2_pullback.title} (RSI${rule.rsiPeriod} ≤ ${rule.oversoldThreshold} · 장기 ${rule.longTrendMa} · 청산 ${rule.exitShortMa} · 최대 ${rule.maxHoldingDays}봉)`,
      );
      break;
    case 'macd_momentum':
      parts.push(
        `${STRATEGY_CATALOG.macd_momentum.title} (${rule.fastPeriod}/${rule.slowPeriod}/${rule.signalPeriod}${rule.requireZeroLineAbove ? ' · MACD > 0' : ''})`,
      );
      break;
    case 'adx_dmi_trend':
      parts.push(`${STRATEGY_CATALOG.adx_dmi_trend.title} (DI ${rule.diPeriod}봉 · ADX ≥ ${rule.adxThreshold})`);
      break;
    case 'bollinger_squeeze':
      parts.push(
        `${STRATEGY_CATALOG.bollinger_squeeze.title} (${rule.period}봉/${rule.stdDevMultiplier}σ · 압축 ${rule.squeezeLookback}봉 하위 ${rule.squeezePercentile}%)`,
      );
      break;
    case 'ttm_squeeze':
      parts.push(
        `${STRATEGY_CATALOG.ttm_squeeze.title} (${rule.period}봉 · BB ${rule.bbMult}배 / KC ${rule.kcMult}배)`,
      );
      break;
    case 'bollinger_percent_b':
      parts.push(
        `${STRATEGY_CATALOG.bollinger_percent_b.title} (BB ${rule.bbPeriod}봉/${rule.bbStdDev}σ · RSI${rule.rsiPeriod} ≤ ${rule.rsiOversold} · 청산 %B ≥ ${rule.exitPercentB})`,
      );
      break;
    case 'low_volume_pullback':
      parts.push(
        `${STRATEGY_CATALOG.low_volume_pullback.title} (눌림 ${rule.pullbackDays}봉 · 거래량 ≤ ${rule.maxVolumeRatio}배 · 추세 ${rule.trendFastMa}/${rule.trendSlowMa}봉)`,
      );
      break;
    case 'disparity_reversion':
      parts.push(
        `${STRATEGY_CATALOG.disparity_reversion.title} (MA ${rule.maPeriod}봉 · 매수 ≤ ${rule.buyDisparity}% / 매도 ≥ ${rule.sellDisparity}% · 손절 ${rule.stopLossPct}%)`,
      );
      break;
    case 'dual_momentum':
      parts.push(
        `${PORTFOLIO_CATALOG.dual_momentum.title} (관측 ${rule.lookbackDays}봉 · 리밸런싱 ${rule.rebalanceDays}봉 · 위험 ${rule.assets.join('/')} · 안전 ${rule.safeAsset ?? '현금'})`,
      );
      break;
    case 'faber_gtaa':
      parts.push(
        `${PORTFOLIO_CATALOG.faber_gtaa.title} (SMA ${rule.smaPeriod}봉 · 리밸런싱 ${rule.rebalanceDays}봉 · 위험 ${rule.assets.join('/')} · 안전 ${rule.safeAsset ?? '현금'})`,
      );
      break;
    case 'krx_sector_rs':
      parts.push(
        `${PORTFOLIO_CATALOG.krx_sector_rs.title} (관측 ${rule.rsLookbackDays}봉 · 상위 ${rule.topK}종 · 한도 ${rule.maxWeightPct}% · 리밸런싱 ${rule.rebalanceDays}봉 · 위험 ${rule.assets.join('/')} · 안전 ${rule.safeAsset ?? '현금'})`,
      );
      break;
    case 'clenow_momentum':
      parts.push(
        `${PORTFOLIO_CATALOG.clenow_momentum.title} (회귀 ${rule.regressionDays}봉 · ATR ${rule.atrPeriod}봉 · 추세 SMA ${rule.regimeSmaPeriod}봉 · 상위 ${rule.topK}종 · 위험예산 ${rule.riskPerAssetBps}bp · 리밸런싱 ${rule.rebalanceDays}봉 · 위험 ${rule.assets.join('/')} · 안전 ${rule.safeAsset ?? '현금'})`,
      );
      break;
    case 'price_regime':
      parts.push(
        `${PORTFOLIO_CATALOG.price_regime.title} (추세 SMA ${rule.trendSmaPeriod}봉 · 변동성 ${rule.volLookback}봉 ≤ ${rule.maxAnnualVolPct}% · 경계 ${rule.cautionExposurePct}% · 리밸런싱 ${rule.rebalanceDays}봉 · 위험 ${rule.assets.join('/')} · 안전 ${rule.safeAsset ?? '현금'})`,
      );
      break;
  }
  if (!isPortfolioRule(rule)) {
    if (overlay?.chandelier) {
      parts.push(`샹들리에 ATR(${overlay.chandelier.atrPeriod})×${overlay.chandelier.atrMultiplier}`);
    }
    if (overlay?.volatilityParity) {
      parts.push(
        `변동성 패리티(${overlay.volatilityParity.volLookback}일 · 목표 ${overlay.volatilityParity.targetAnnualVolPct}% · 최대 ${overlay.volatilityParity.maxAllocationPct}%)`,
      );
    }
  }
  return parts.join(' · ');
}

/** 환경 지원 여부 표시 문자열을 반환한다. */
export function environmentAvailabilityText(value: boolean | string): string {
  if (value === STRATEGY_CATALOG.ma_crossover.environments.kisPaper) return '체결가·확정 일봉';
  if (value === true) return '지원';
  if (value === false) return '미지원';
  return value;
}

/** 라우터 state에서 유효한 전략/백테스트 초안을 안전하게 파싱한다. */
export function parseTransferDraft(raw: unknown): StrategyTransferDraft | null {
  const parsed = strategyTransferSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** 전략 에디터 기본 초안 상태를 생성한다. */
export function defaultEditorDraft(): StrategyEditorDraft {
  return {
    name: '나의 이동평균 전략',
    code: '069500',
    ruleForm: defaultRuleForm(),
    evidence: undefined,
    qty: '1',
    attempted: false,
    formError: '',
    draftSourceCode: undefined,
  };
}

/** 백테스트 전달 초안으로부터 전략 에디터 초안 상태를 생성한다. */
export function editorDraftFromTransfer(draft: StrategyTransferDraft): StrategyEditorDraft {
  const ruleForm = formFromRule(draft.rule, isPortfolioRule(draft.rule) ? undefined : draft.overlay);
  const code = isPortfolioRule(draft.rule) ? draft.rule.assets[0] : draft.code;
  return {
    name: `${ruleTitle(ruleForm.kind)} 전략`,
    code,
    ruleForm,
    evidence: draft.evidence,
    qty: '1',
    attempted: false,
    formError: '',
    draftSourceCode: code,
  };
}

/** 규칙 바스켓 종목 목록(유효한 6자리 영숫자 코드만, 중복 제외·순서 유지)을 추출한다. */
export function formPortfolioCodes(form: RuleFormState): string[] {
  const raw = [...form.portfolioAssets, form.portfolioSafeAsset];
  const seen = new Set<string>();
  const codes: string[] = [];
  for (const item of raw) {
    const code = item.trim().toUpperCase();
    if (!code || seen.has(code) || !masterCodeSchema.safeParse(code).success) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes;
}

export { portfolioCodes };
