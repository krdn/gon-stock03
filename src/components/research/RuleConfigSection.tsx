import { STRATEGY_CATALOG } from '../../../shared/strategy-rules';
import { Badge } from '../ui';
import {
  PRESET_ENTRIES,
  RULE_GROUPS,
  applyPreset,
  environmentAvailabilityText,
  isDemoRuleSupported,
  isSameRuleForm,
  kisFormBlockReason,
  kisFormExecutionMode,
  matchedPreset,
  type RuleFormState,
  type RuleKind,
} from '../../pages/research-rule-form';
import {
  CHANDELIER_BASIC_PRESET,
  CHANDELIER_FIELD_HELP,
  RULE_FIELD_HELP,
  VOLATILITY_PARITY_BASIC_PRESET,
  VOLATILITY_PARITY_FIELD_HELP,
} from './ResearchHelpPanel';

/** 규칙 카탈로그 안내(3줄 설명 + 환경 배지 + 프리셋) 및 규칙별 세부 입력·오버레이·문맥 가이드 UI. */
export function RuleConfigSection({
  form,
  onChange,
  disabled,
  mode,
  unit,
  periodError,
  periodErrorId,
}: {
  form: RuleFormState;
  onChange: (next: RuleFormState) => void;
  disabled?: boolean;
  mode: 'strategy' | 'stored' | 'demo';
  unit: string;
  periodError?: boolean;
  periodErrorId?: string;
}) {
  const catalog = STRATEGY_CATALOG[form.kind];
  const activePreset = matchedPreset(form);
  const demoCatalogSupported = catalog.environments.demo !== false;
  const demoFormSupported = isDemoRuleSupported(form);
  const demoBadgeTone = !demoCatalogSupported ? 'neutral' : demoFormSupported ? 'teal' : 'warning';
  const demoBadgeText = !demoCatalogSupported
    ? '미지원'
    : demoFormSupported
      ? environmentAvailabilityText(catalog.environments.demo)
      : '현재 설정 제한 (저장 일봉 필요)';
  const kisMode = kisFormExecutionMode(form);
  const kisBlockReason = kisFormBlockReason(form);
  const kisBadgeTone = kisMode === 'unsupported' ? 'warning' : 'teal';
  const kisBadgeLabel =
    kisMode === 'confirmed-daily'
      ? 'KIS 모의: 확정 일봉 기반'
      : kisMode === 'realtime-tick'
        ? 'KIS 모의 · 실시간 체결가'
        : 'KIS 모의 · 시작 제한 (정지 저장만 가능)';
  const effectiveUnit = kisMode === 'realtime-tick' ? unit : '봉';
  const fastLabel = mode === 'strategy' ? `단기 평균 (${effectiveUnit})` : '단기 (봉)';
  const slowLabel = mode === 'strategy' ? `장기 평균 (${effectiveUnit})` : '장기 (봉)';
  const update = (patch: Partial<RuleFormState>) => onChange({ ...form, ...patch });

  return (
    <div className="rule-config">
      <div className="rule-selector-wrap">
        <label className="field rule-selector-field">
          전략 규칙
          <select
            value={form.kind}
            disabled={disabled}
            onChange={e => update({ kind: e.target.value as RuleKind })}
          >
            {RULE_GROUPS.map(group => (
              <optgroup key={group.label} label={group.label}>
                {group.kinds.map(kind => (
                  <option key={kind} value={kind}>
                    {STRATEGY_CATALOG[kind].title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <p className="rule-selector-meta">11종 전략 지원 · 저장 일봉 전체 / DEMO 종가 전용 4종</p>
      </div>

      <div className="rule-guide" aria-label="규칙 요약 안내">
        <ul className="rule-guide-lines">
          <li>
            <strong>매수</strong>
            <span>{catalog.buyWhen}</span>
          </li>
          <li>
            <strong>매도</strong>
            <span>{catalog.sellWhen}</span>
          </li>
          <li>
            <strong>주의</strong>
            <span>{catalog.cautionRegime}</span>
          </li>
        </ul>
        <div className="rule-env-badges" aria-label="환경별 사용 가능 여부">
          <Badge tone={catalog.environments.daily ? 'teal' : 'neutral'}>
            저장 일봉 · {environmentAvailabilityText(catalog.environments.daily)}
          </Badge>
          <Badge tone={demoBadgeTone}>DEMO · {demoBadgeText}</Badge>
          <Badge tone={kisBadgeTone}>{kisBadgeLabel}</Badge>
        </div>
        {kisMode === 'confirmed-daily' && (
          <p className="rule-kis-note">
            전용 원장에 고정된 직전 KRX 개장일 확정 일봉 신호로 당일 1회 집행합니다.
          </p>
        )}
        {kisMode === 'unsupported' && (
          <p className="rule-kis-warning">
            KIS 모의 시작 제한 · {kisBlockReason} 정지 상태(active=false) 저장만 가능하며 시작·계약 고정은 차단됩니다.
          </p>
        )}
      </div>

      <div className="rule-presets" role="group" aria-label="규칙 프리셋">
        <span className="rule-presets-label">프리셋</span>
        <div className="rule-preset-buttons">
          {PRESET_ENTRIES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-pressed={activePreset === key}
              className={'button small-button ' + (activePreset === key ? 'primary' : 'secondary')}
              onClick={() => {
                if (activePreset === key) return;
                const next = applyPreset(form, key);
                if (!isSameRuleForm(form, next)) onChange(next);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {form.kind === 'ma_crossover' && (
        <>
          <div className="form-grid">
            <label className="field">
              {fastLabel}
              <input
                name="fast"
                type="number"
                min="2"
                max="60"
                value={form.fast}
                onChange={e => update({ fast: e.target.value })}
                required
                aria-invalid={periodError || undefined}
                aria-describedby={periodError ? periodErrorId : undefined}
              />
            </label>
            <label className="field">
              {slowLabel}
              <input
                name="slow"
                type="number"
                min="3"
                max="120"
                value={form.slow}
                onChange={e => update({ slow: e.target.value })}
                required
                aria-invalid={periodError || undefined}
                aria-describedby={periodError ? periodErrorId : undefined}
              />
            </label>
          </div>
          {periodError && (
            <p className="studio-warning" id={periodErrorId} role="alert">
              단기 평균은 장기 평균보다 작아야 합니다.
            </p>
          )}
          <div className="form-grid">
            <label className="field">
              평균 방식
              <select
                value={form.maType}
                disabled={disabled}
                onChange={e => update({ maType: e.target.value as 'sma' | 'ema' })}
              >
                <option value="sma">SMA (단순 이동평균)</option>
                <option value="ema">EMA (지수 이동평균)</option>
              </select>
            </label>
            <label className="field">
              장기 추세 필터 (봉, 선택)
              <input
                name="regimePeriod"
                type="number"
                min="20"
                max="240"
                placeholder="사용 안 함"
                value={form.regimePeriod}
                onChange={e => update({ regimePeriod: e.target.value })}
              />
            </label>
          </div>
          <label className="field">
            최소 상대 거래량 (배, 선택)
            <input
              name="minRelativeVolume"
              type="number"
              min="0"
              max="5"
              step="0.1"
              placeholder="사용 안 함"
              value={form.minRelativeVolume}
              onChange={e => update({ minRelativeVolume: e.target.value })}
            />
          </label>
        </>
      )}

      {form.kind === 'donchian_breakout' && (
        <>
          <div className="form-grid">
            <label className="field">
              진입 고가 기간 (봉)
              <input
                name="entryLookback"
                type="number"
                min="10"
                max="120"
                value={form.entryLookback}
                onChange={e => update({ entryLookback: e.target.value })}
                required
              />
            </label>
            <label className="field">
              청산 저가 기간 (봉)
              <input
                name="exitLookback"
                type="number"
                min="3"
                max="60"
                value={form.exitLookback}
                onChange={e => update({ exitLookback: e.target.value })}
                required
              />
            </label>
          </div>
          <label className="field">
            최소 거래량 배수 (초과)
            <input
              name="volumeMultiplier"
              type="number"
              min="0.5"
              max="5"
              step="0.1"
              value={form.volumeMultiplier}
              onChange={e => update({ volumeMultiplier: e.target.value })}
              required
            />
          </label>
        </>
      )}

      {form.kind === 'volatility_breakout' && (
        <>
          <div className="form-grid">
            <label className="field">
              돌파 계수 k
              <input
                name="vbK"
                type="number"
                min="0.1"
                max="1"
                step="0.05"
                value={form.vbK}
                onChange={e => update({ vbK: e.target.value })}
                required
              />
            </label>
            <label className="field">
              보유 거래일 수 (일)
              <input
                name="vbHoldDays"
                type="number"
                min="1"
                max="10"
                step="1"
                value={form.vbHoldDays}
                onChange={e => update({ vbHoldDays: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="rule-option-row">
            <label className="rule-checkbox">
              <input
                name="vbUseAdaptiveNoise"
                type="checkbox"
                checked={form.vbUseAdaptiveNoise}
                disabled={disabled}
                onChange={e => update({ vbUseAdaptiveNoise: e.target.checked })}
              />
              <span>적응형 노이즈 k 사용 (직전 노이즈 평균 적용)</span>
            </label>
          </div>
          <div className="form-grid">
            <label className="field">
              노이즈 평균 기간 (봉)
              <input
                name="vbNoiseLookback"
                type="number"
                min="5"
                max="60"
                step="1"
                value={form.vbNoiseLookback}
                onChange={e => update({ vbNoiseLookback: e.target.value })}
                required
              />
            </label>
            <label className="field">
              상승 추세 SMA 기간 (봉)
              <input
                name="vbTrendMaPeriod"
                type="number"
                min="5"
                max="200"
                step="1"
                value={form.vbTrendMaPeriod}
                onChange={e => update({ vbTrendMaPeriod: e.target.value })}
                required
              />
            </label>
          </div>
        </>
      )}

      {form.kind === 'rsi2_pullback' && (
        <>
          <div className="form-grid">
            <label className="field">
              RSI 기간 (봉)
              <input
                name="rsiPeriod"
                type="number"
                min="2"
                max="5"
                value={form.rsiPeriod}
                onChange={e => update({ rsiPeriod: e.target.value })}
                required
              />
            </label>
            <label className="field">
              과매도 기준 (RSI 이하)
              <input
                name="oversoldThreshold"
                type="number"
                min="2"
                max="25"
                step="0.5"
                value={form.oversoldThreshold}
                onChange={e => update({ oversoldThreshold: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="form-grid">
            <label className="field">
              장기 추세선 (봉)
              <input
                name="longTrendMa"
                type="number"
                min="60"
                max="240"
                value={form.longTrendMa}
                onChange={e => update({ longTrendMa: e.target.value })}
                required
              />
            </label>
            <label className="field">
              청산 단기선 (봉)
              <input
                name="exitShortMa"
                type="number"
                min="3"
                max="10"
                value={form.exitShortMa}
                onChange={e => update({ exitShortMa: e.target.value })}
                required
              />
            </label>
          </div>
          <label className="field">
            최대 보유 기간 (봉)
            <input
              name="maxHoldingDays"
              type="number"
              min="3"
              max="20"
              value={form.maxHoldingDays}
              onChange={e => update({ maxHoldingDays: e.target.value })}
              required
            />
          </label>
        </>
      )}

      {form.kind === 'macd_momentum' && (
        <>
          <div className="form-grid">
            <label className="field">
              단기 EMA (봉)
              <input
                name="fastPeriod"
                type="number"
                min="3"
                max="30"
                step="1"
                value={form.fastPeriod}
                onChange={e => update({ fastPeriod: e.target.value })}
                required
              />
            </label>
            <label className="field">
              장기 EMA (봉)
              <input
                name="slowPeriod"
                type="number"
                min="10"
                max="100"
                step="1"
                value={form.slowPeriod}
                onChange={e => update({ slowPeriod: e.target.value })}
                required
              />
            </label>
          </div>
          <label className="field">
            시그널 EMA (봉)
            <input
              name="signalPeriod"
              type="number"
              min="3"
              max="30"
              step="1"
              value={form.signalPeriod}
              onChange={e => update({ signalPeriod: e.target.value })}
              required
            />
          </label>
          <div className="rule-option-row">
            <label className="rule-checkbox">
              <input
                name="requireZeroLineAbove"
                type="checkbox"
                checked={form.requireZeroLineAbove}
                disabled={disabled}
                onChange={e => update({ requireZeroLineAbove: e.target.checked })}
              />
              <span>MACD &gt; 0 (제로선 위에서만 매수)</span>
            </label>
          </div>
        </>
      )}

      {form.kind === 'adx_dmi_trend' && (
        <div className="form-grid">
          <label className="field">
            DI 기간 (봉)
            <input
              name="diPeriod"
              type="number"
              min="7"
              max="30"
              step="1"
              value={form.diPeriod}
              onChange={e => update({ diPeriod: e.target.value })}
              required
            />
          </label>
          <label className="field">
            ADX 기준
            <input
              name="adxThreshold"
              type="number"
              min="15"
              max="40"
              step="0.5"
              value={form.adxThreshold}
              onChange={e => update({ adxThreshold: e.target.value })}
              required
            />
          </label>
        </div>
      )}

      {form.kind === 'bollinger_squeeze' && (
        <>
          <div className="form-grid">
            <label className="field">
              볼린저 기간 (봉)
              <input
                name="bbSqueezePeriod"
                type="number"
                min="10"
                max="60"
                step="1"
                value={form.bbSqueezePeriod}
                onChange={e => update({ bbSqueezePeriod: e.target.value })}
                required
              />
            </label>
            <label className="field">
              표준편차 배수
              <input
                name="stdDevMultiplier"
                type="number"
                min="1.5"
                max="3"
                step="0.1"
                value={form.stdDevMultiplier}
                onChange={e => update({ stdDevMultiplier: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="form-grid">
            <label className="field">
              수축 비교 기간 (봉)
              <input
                name="squeezeLookback"
                type="number"
                min="20"
                max="120"
                step="1"
                value={form.squeezeLookback}
                onChange={e => update({ squeezeLookback: e.target.value })}
                required
              />
            </label>
            <label className="field">
              수축 하위 분위수 (%)
              <input
                name="squeezePercentile"
                type="number"
                min="10"
                max="50"
                step="0.5"
                value={form.squeezePercentile}
                onChange={e => update({ squeezePercentile: e.target.value })}
                required
              />
            </label>
          </div>
        </>
      )}

      {form.kind === 'ttm_squeeze' && (
        <>
          <label className="field">
            계산 기간 (봉)
            <input
              name="ttmPeriod"
              type="number"
              min="14"
              max="30"
              step="1"
              value={form.ttmPeriod}
              onChange={e => update({ ttmPeriod: e.target.value })}
              required
            />
          </label>
          <div className="form-grid">
            <label className="field">
              볼린저 배수
              <input
                name="bbMult"
                type="number"
                min="1.5"
                max="2.5"
                step="0.1"
                value={form.bbMult}
                onChange={e => update({ bbMult: e.target.value })}
                required
              />
            </label>
            <label className="field">
              켈트너 배수
              <input
                name="kcMult"
                type="number"
                min="1"
                max="2.5"
                step="0.1"
                value={form.kcMult}
                onChange={e => update({ kcMult: e.target.value })}
                required
              />
            </label>
          </div>
        </>
      )}

      {form.kind === 'bollinger_percent_b' && (
        <>
          <div className="form-grid">
            <label className="field">
              볼린저 기간 (봉)
              <input
                name="bbPeriod"
                type="number"
                min="14"
                max="30"
                step="1"
                value={form.bbPeriod}
                onChange={e => update({ bbPeriod: e.target.value })}
                required
              />
            </label>
            <label className="field">
              볼린저 표준편차 배수
              <input
                name="bbStdDev"
                type="number"
                min="1.8"
                max="2.5"
                step="0.1"
                value={form.bbStdDev}
                onChange={e => update({ bbStdDev: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="form-grid">
            <label className="field">
              RSI 기간 (봉)
              <input
                name="pbRsiPeriod"
                type="number"
                min="7"
                max="21"
                step="1"
                value={form.pbRsiPeriod}
                onChange={e => update({ pbRsiPeriod: e.target.value })}
                required
              />
            </label>
            <label className="field">
              RSI 과매도 기준 (이하)
              <input
                name="rsiOversold"
                type="number"
                min="20"
                max="40"
                step="0.5"
                value={form.rsiOversold}
                onChange={e => update({ rsiOversold: e.target.value })}
                required
              />
            </label>
          </div>
          <label className="field">
            청산 목표 %B (이상)
            <input
              name="exitPercentB"
              type="number"
              min="0.4"
              max="1"
              step="0.05"
              value={form.exitPercentB}
              onChange={e => update({ exitPercentB: e.target.value })}
              required
            />
          </label>
        </>
      )}

      {form.kind === 'low_volume_pullback' && (
        <>
          <div className="form-grid">
            <label className="field">
              눌림 기간 (봉)
              <input
                name="pullbackDays"
                type="number"
                min="2"
                max="7"
                step="1"
                value={form.pullbackDays}
                onChange={e => update({ pullbackDays: e.target.value })}
                required
              />
            </label>
            <label className="field">
              최대 거래량 비율 (배)
              <input
                name="maxVolumeRatio"
                type="number"
                min="0.3"
                max="0.9"
                step="0.05"
                value={form.maxVolumeRatio}
                onChange={e => update({ maxVolumeRatio: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="form-grid">
            <label className="field">
              단기 추세선 (봉)
              <input
                name="trendFastMa"
                type="number"
                min="10"
                max="30"
                step="1"
                value={form.trendFastMa}
                onChange={e => update({ trendFastMa: e.target.value })}
                required
              />
            </label>
            <label className="field">
              장기 추세선 (봉)
              <input
                name="trendSlowMa"
                type="number"
                min="40"
                max="120"
                step="1"
                value={form.trendSlowMa}
                onChange={e => update({ trendSlowMa: e.target.value })}
                required
              />
            </label>
          </div>
        </>
      )}

      {form.kind === 'disparity_reversion' && (
        <>
          <div className="form-grid">
            <label className="field">
              이동평균 기간 (봉)
              <input
                name="maPeriod"
                type="number"
                min="10"
                max="60"
                step="1"
                value={form.maPeriod}
                onChange={e => update({ maPeriod: e.target.value })}
                required
              />
            </label>
            <label className="field">
              손절 기준 (%)
              <input
                name="stopLossPct"
                type="number"
                min="2"
                max="10"
                step="0.5"
                value={form.stopLossPct}
                onChange={e => update({ stopLossPct: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="form-grid">
            <label className="field">
              매수 이격도 (%, 이하)
              <input
                name="buyDisparity"
                type="number"
                min="85"
                max="97"
                step="0.5"
                value={form.buyDisparity}
                onChange={e => update({ buyDisparity: e.target.value })}
                required
              />
            </label>
            <label className="field">
              매도 이격도 (%, 이상)
              <input
                name="sellDisparity"
                type="number"
                min="98"
                max="105"
                step="0.5"
                value={form.sellDisparity}
                onChange={e => update({ sellDisparity: e.target.value })}
                required
              />
            </label>
          </div>
        </>
      )}

      <div className="rule-overlay-box">
        <label className="rule-checkbox">
          <input
            type="checkbox"
            checked={form.useChandelier}
            disabled={disabled}
            onChange={e => update({ useChandelier: e.target.checked })}
          />
          <span>샹들리에 ATR 청산 오버레이 사용</span>
        </label>
        {form.useChandelier && (
          <div className="form-grid">
            <label className="field">
              ATR 기간 (봉)
              <input
                name="atrPeriod"
                type="number"
                min="7"
                max="30"
                value={form.atrPeriod}
                onChange={e => update({ atrPeriod: e.target.value })}
                required
              />
            </label>
            <label className="field">
              ATR 배수
              <input
                name="atrMultiplier"
                type="number"
                min="1.5"
                max="5"
                step="0.1"
                value={form.atrMultiplier}
                onChange={e => update({ atrMultiplier: e.target.value })}
                required
              />
            </label>
          </div>
        )}
      </div>

      <div className="rule-overlay-box">
        <label className="rule-checkbox">
          <input
            name="useVolatilityParity"
            type="checkbox"
            checked={form.useVolatilityParity}
            disabled={disabled}
            onChange={e => update({ useVolatilityParity: e.target.checked })}
          />
          <span>20 변동성 패리티 · 목표 변동성 수량 조절 오버레이 (선택)</span>
        </label>
        {form.useVolatilityParity && (
          <>
            <div className="form-grid">
              <label className="field">
                변동성 관측 기간 (봉)
                <input
                  name="volLookback"
                  type="number"
                  min="10"
                  max="60"
                  step="1"
                  value={form.volLookback}
                  onChange={e => update({ volLookback: e.target.value })}
                  required
                />
              </label>
              <label className="field">
                목표 연환산 변동성 (%)
                <input
                  name="targetAnnualVolPct"
                  type="number"
                  min="5"
                  max="60"
                  step="1"
                  value={form.targetAnnualVolPct}
                  onChange={e => update({ targetAnnualVolPct: e.target.value })}
                  required
                />
              </label>
            </div>
            <label className="field">
              최대 배정 비중 (%)
              <input
                name="maxAllocationPct"
                type="number"
                min="10"
                max="100"
                step="5"
                value={form.maxAllocationPct}
                onChange={e => update({ maxAllocationPct: e.target.value })}
                required
              />
            </label>
          </>
        )}
      </div>

      <details className="rule-field-help">
        <summary>현재 선택한 규칙({catalog.title}) 입력 항목 설명 보기</summary>
        <div className="rule-field-help-content">
          <p className="rule-field-help-env">{RULE_FIELD_HELP[form.kind].envBadge}</p>
          <p className="rule-field-help-summary">{RULE_FIELD_HELP[form.kind].summary}</p>
          <p className="rule-field-help-preset">
            <strong>기본 프리셋 초기값:</strong> {RULE_FIELD_HELP[form.kind].basicPreset}
          </p>
          <p className="rule-field-help-exec">{RULE_FIELD_HELP[form.kind].executionNote}</p>
          <dl className="rule-field-help-list">
            {RULE_FIELD_HELP[form.kind].fields.map(item => (
              <div key={item.term}>
                <dt>
                  {item.term} <small>{item.range}</small>
                </dt>
                <dd>{item.description}</dd>
              </div>
            ))}
          </dl>
          <p className="rule-field-help-overlay-title">
            샹들리에 ATR 청산 오버레이 ({form.useChandelier ? '사용 중' : '선택 사항'}) · {CHANDELIER_BASIC_PRESET}
          </p>
          <dl className="rule-field-help-list">
            {CHANDELIER_FIELD_HELP.map(item => (
              <div key={item.term}>
                <dt>
                  {item.term} <small>{item.range}</small>
                </dt>
                <dd>{item.description}</dd>
              </div>
            ))}
          </dl>
          <p className="rule-field-help-overlay-title">
            20 변동성 패리티 · RMS 포지션 사이징 ({form.useVolatilityParity ? '사용 중' : '선택 사항'}) ·{' '}
            {VOLATILITY_PARITY_BASIC_PRESET}
          </p>
          <dl className="rule-field-help-list">
            {VOLATILITY_PARITY_FIELD_HELP.map(item => (
              <div key={item.term}>
                <dt>
                  {item.term} <small>{item.range}</small>
                </dt>
                <dd>{item.description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </div>
  );
}
