import type {PortfolioRule} from '../../shared/portfolio-rules';
import { z } from 'zod';
import { backtestResultSchema, type SingleExperiment as Experiment } from '../../shared/backtest';
import { masterCodeSchema } from '../../shared/market-data';
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

/** 지원하는 전략 규칙 종류 유니온. */
export type RuleKind = (typeof RULE_KINDS)[number];

/** 규칙 프리셋 단계 키. */
export type PresetKey = 'conservative' | 'basic' | 'aggressive';

/** v1·v2 백테스트 결과를 모두 수용하는 유연한 결과 스키마. */
const benchmarkSchema = backtestResultSchema.pick({
  returnPct: true,
  maxDrawdown: true,
  finalEquity: true,
});

const flexibleTradeSchema = backtestResultSchema.shape.trades.element.extend({
  reason: z.string().min(1).optional(),
});

/** v1·v2 백테스트 결과 응답 검증 스키마. */
export const flexibleResultSchema = backtestResultSchema.extend({
  trades: z.array(flexibleTradeSchema),
  benchmark: benchmarkSchema.optional(),
});

/** v1·v2 백테스트 결과 타입. */
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
  rule: strategyRuleSchema,
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

/** 저장 일봉 백테스트 선택 전환 시 전달하는 포커스·불러오기 정보. */
export type BacktestSelection = { focus: 'policy' | 'run' } | { saved: Experiment };

/** 지원하는 11종 전략 규칙 키 목록. */
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
];

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
export function formFromRule(rule?: StrategyRule, overlay?: ExitOverlay): RuleFormState {
  const base = defaultRuleForm();
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
  }
  return base;
}

/** 현재 폼에 카탈로그 프리셋을 적용한다. */
export function applyPreset(form: RuleFormState, presetKey: PresetKey): RuleFormState {
  const preset = STRATEGY_CATALOG[form.kind].presets[presetKey];
  const next = { ...form };
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

/** 두 규칙 폼 상태가 모든 필드에서 동일한지 비교한다. */
export function isSameRuleForm(a: RuleFormState, b: RuleFormState): boolean {
  return (Object.keys(a) as (keyof RuleFormState)[]).every(key => a[key] === b[key]);
}

/** 문자열 입력값이 대상 숫자와 정확히 일치하는지 판정한다(빈 문자열의 0 변환 차단). */
function numEq(raw: string, expected: number): boolean {
  return raw.trim() !== '' && Number(raw) === expected;
}

/** 현재 폼 값이 일치하는 프리셋 키를 반환한다(동일 값 프리셋은 기본 우선). */
export function matchedPreset(form: RuleFormState): PresetKey | null {
  const order: PresetKey[] = ['basic', 'conservative', 'aggressive'];
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

/** 폼 상태에서 스키마 검증을 거친 규칙·오버레이를 조립한다. */
export function buildRuleAndOverlay(
  form: RuleFormState,
): { ok: true; rule: StrategyRule; overlay?: ExitOverlay } | { ok: false; error: string; focusName?: string } {
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
  rule: StrategyRule,
  overlay?: ExitOverlay,
): rule is Extract<StrategyRule, { kind: 'ma_crossover' }> {
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
  if (form.useChandelier || form.useVolatilityParity) return false;
  if (STRATEGY_CATALOG[form.kind].environments.demo === false) return false;
  if (form.kind === 'ma_crossover' && form.minRelativeVolume.trim() !== '' && Number(form.minRelativeVolume) > 0) {
    return false;
  }
  return true;
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
export function kisRealtimeBlockReason(rule?: PortfolioRule | StrategyRule, overlay?: ExitOverlay, slow?: number): string {
  try {
    assertRealtimeRule(rule, overlay, slow);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : 'KIS 모의 실시간 시작을 지원하지 않는 규칙입니다.';
  }
}

/** 저장 전략이 KIS 모의 확정 일봉 기반(종가 확정형 10종 + 선택 샹들리에)인지 판정한다. */
export function isKisConfirmedDailyStrategy(
  rule?: PortfolioRule | StrategyRule,
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
export function isKisTickSmaRule(rule?: PortfolioRule | StrategyRule, overlay?: ExitOverlay): boolean {
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
  if (form.kind === 'volatility_breakout' || form.useVolatilityParity) {
    return '윌리엄스 변동성 돌파와 변동성 패리티 수량 조절은 저장 일봉 백테스트 전용입니다.';
  }
  if (isKisBasicSmaSlowExceeded(form)) {
    return '실시간 체결가 기본 SMA의 장기 기간은 100 이하여야 합니다.';
  }
  return '';
}

/** 저장된 실험 입력에서 표준 StrategyRule을 추출한다. */
export function ruleFromExperimentInput(input: Experiment['snapshot']['input']): StrategyRule {
  if ('rule' in input) return input.rule;
  return { kind: 'ma_crossover', maType: 'sma', fast: input.fast, slow: input.slow };
}

/** 규칙과 오버레이를 한 줄 한글 요약으로 포맷한다. */
export function formatRuleSummary(rule: StrategyRule, overlay?: ExitOverlay): string {
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
  }
  if (overlay?.chandelier) {
    parts.push(`샹들리에 ATR(${overlay.chandelier.atrPeriod})×${overlay.chandelier.atrMultiplier}`);
  }
  if (overlay?.volatilityParity) {
    parts.push(
      `변동성 패리티(${overlay.volatilityParity.volLookback}일 · 목표 ${overlay.volatilityParity.targetAnnualVolPct}% · 최대 ${overlay.volatilityParity.maxAllocationPct}%)`,
    );
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
  return {
    name: `${STRATEGY_CATALOG[draft.rule.kind].title} 전략`,
    code: draft.code,
    ruleForm: formFromRule(draft.rule, draft.overlay),
    evidence: draft.evidence,
    qty: '1',
    attempted: false,
    formError: '',
    draftSourceCode: draft.code,
  };
}
