import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Square } from 'lucide-react';
import { type Strategy } from '../../../shared/model';
import { STRATEGY_CATALOG } from '../../../shared/strategy-rules';
import { useWorkbench } from '../../context';
import { Badge, Panel } from '../ui';
import {
  evaluationLabels,
  evaluationTime,
  isKisConfirmedDailyStrategy,
  isKisTickSmaRule,
  kisRealtimeBlockReason,
  signalLabels,
} from '../../pages/research-rule-form';

/** 저장된 전략 1건을 규칙 요약·검증 실험 배지·실행 제어와 함께 표시하는 카드. */
export function StrategyCard({ strategy: s, kis }: { strategy: Strategy; kis: boolean }) {
  const { state, realtime, act, available, busy, serverNow, status } = useWorkbench();
  const instrument = state.instruments.find(i => i.code === s.code);
  const quoteAge = realtime?.lastQuoteAt ? serverNow - Date.parse(realtime.lastQuoteAt) : Infinity;
  const freshQuote = quoteAge >= 0 && quoteAge <= (realtime?.quoteSeconds ?? 5) * 1000;
  const kisRuleBlock = kis ? kisRealtimeBlockReason(s.rule, s.overlay, s.slow) : '';
  const kisConfirmedDaily = kis && isKisConfirmedDailyStrategy(s.rule, s.overlay, s.slow);
  let blocked = '';
  if (state.risk.halted) blocked = '긴급정지 켜짐';
  else if (kis) {
    if (kisRuleBlock) blocked = kisRuleBlock;
    else if (!realtime?.fresh || !realtime.ordersAllowed) blocked = realtime?.message || '실시간 상태 미확인';
    else if (!freshQuote) blocked = '현재 시세 유효 시간 확인 필요';
    else if (realtime.code !== s.code) blocked = '실시간 대조 종목이 전략과 다릅니다.';
  }
  let controlNote = '';
  const rechecking = status.phase === 'loading';
  if (rechecking) controlNote = '서버 실행 상태 재확인 중 · 시작·정지 대기';
  else if (!available)
    controlNote = status.error
      ? '서버 실행 상태 미확인 · 연결 복구 전 시작·정지 불가'
      : '서버 실행 상태 미확인 · 최신 상태 확인 필요';
  else if (blocked) controlNote = (s.active ? '신규 주문 차단 · ' : '전략 시작 차단 · ') + blocked;
  const evaluations = s.evaluations ?? [];
  const [historyOpen, setHistoryOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const unit = kis && isKisTickSmaRule(s.rule, s.overlay) ? '이벤트' : '봉';
  const rule = s.rule;

  return (
    <Panel className="studio-card">
      <div className="studio-card-head">
        <h3 id={'strategy-' + s.id} tabIndex={-1}>
          {s.name}
        </h3>
        <div className="studio-card-badges">
          {kisConfirmedDaily && <Badge tone="teal">KIS 모의: 확정 일봉 기반</Badge>}
          {s.evidence && (
            <Badge tone="teal">
              검증 실험 연결 · {s.evidence.experimentId.slice(0, 8)}
            </Badge>
          )}
          <Badge tone={available && s.active ? 'teal' : 'neutral'}>
            {rechecking ? '재확인 중' : !available ? '상태 미확인' : s.active ? '실행 중' : '정지'}
          </Badge>
        </div>
      </div>
      <p className="studio-meta">
        {kis ? 'KIS 모의' : 'DEMO'} · revision {s.revision ?? 1} · {instrument?.name ?? s.code}
        {instrument && ' ' + s.code}
        {rule && ` · ${STRATEGY_CATALOG[rule.kind].title}`}
      </p>
      <div className="studio-terms">
        {!rule || rule.kind === 'ma_crossover' ? (
          <>
            {rule && (
              <span>
                평균 <b>{rule.maType.toUpperCase()}</b>
              </span>
            )}
            <span>
              단기{' '}
              <b>
                {rule ? rule.fast : s.fast}
                {unit}
              </b>
            </span>
            <span>
              장기{' '}
              <b>
                {rule ? rule.slow : s.slow}
                {unit}
              </b>
            </span>
            {rule?.regimePeriod && (
              <span>
                추세선 <b>{rule.regimePeriod}봉</b>
              </span>
            )}
            {rule?.minRelativeVolume && (
              <span>
                상대거래량 <b>{rule.minRelativeVolume}배+</b>
              </span>
            )}
          </>
        ) : rule.kind === 'donchian_breakout' ? (
          <>
            <span>
              진입 고가 <b>{rule.entryLookback}봉</b>
            </span>
            <span>
              청산 저가 <b>{rule.exitLookback}봉</b>
            </span>
            <span>
              거래량 <b>{rule.volumeMultiplier}배 초과</b>
            </span>
          </>
        ) : rule.kind === 'volatility_breakout' ? (
          <>
            <span>
              돌파 계수{' '}
              <b>{rule.useAdaptiveNoise ? `적응형 노이즈(${rule.noiseLookback}봉)` : `k=${rule.k}`}</b>
            </span>
            <span>
              추세 SMA <b>{rule.trendMaPeriod}봉</b>
            </span>
            <span>
              보유 <b>{rule.holdDays}일</b>
            </span>
          </>
        ) : rule.kind === 'rsi2_pullback' ? (
          <>
            <span>
              RSI({rule.rsiPeriod}) <b>≤ {rule.oversoldThreshold}</b>
            </span>
            <span>
              장기선 <b>{rule.longTrendMa}봉</b>
            </span>
            <span>
              청산선 <b>{rule.exitShortMa}봉</b>
            </span>
            <span>
              최대보유 <b>{rule.maxHoldingDays}봉</b>
            </span>
          </>
        ) : rule.kind === 'macd_momentum' ? (
          <>
            <span>
              EMA/시그널{' '}
              <b>
                {rule.fastPeriod}/{rule.slowPeriod}/{rule.signalPeriod}봉
              </b>
            </span>
            <span>
              제로선 필터 <b>{rule.requireZeroLineAbove ? 'MACD > 0' : '미사용'}</b>
            </span>
          </>
        ) : rule.kind === 'adx_dmi_trend' ? (
          <>
            <span>
              DI 기간 <b>{rule.diPeriod}봉</b>
            </span>
            <span>
              ADX 기준 <b>≥ {rule.adxThreshold}</b>
            </span>
          </>
        ) : rule.kind === 'bollinger_squeeze' ? (
          <>
            <span>
              볼린저{' '}
              <b>
                {rule.period}봉 · {rule.stdDevMultiplier}σ
              </b>
            </span>
            <span>
              수축 구간{' '}
              <b>
                {rule.squeezeLookback}봉 하위 {rule.squeezePercentile}%
              </b>
            </span>
          </>
        ) : rule.kind === 'ttm_squeeze' ? (
          <>
            <span>
              기간 <b>{rule.period}봉</b>
            </span>
            <span>
              BB / KC{' '}
              <b>
                {rule.bbMult}배 / {rule.kcMult}배
              </b>
            </span>
          </>
        ) : rule.kind === 'bollinger_percent_b' ? (
          <>
            <span>
              볼린저{' '}
              <b>
                {rule.bbPeriod}봉 · {rule.bbStdDev}σ
              </b>
            </span>
            <span>
              RSI({rule.rsiPeriod}) <b>≤ {rule.rsiOversold}</b>
            </span>
            <span>
              청산 %B <b>≥ {rule.exitPercentB}</b>
            </span>
          </>
        ) : rule.kind === 'low_volume_pullback' ? (
          <>
            <span>
              눌림 <b>{rule.pullbackDays}봉</b>
            </span>
            <span>
              거래량 비율 <b>≤ {rule.maxVolumeRatio}배</b>
            </span>
            <span>
              추세선{' '}
              <b>
                {rule.trendFastMa}/{rule.trendSlowMa}봉
              </b>
            </span>
          </>
        ) : rule.kind === 'disparity_reversion' ? (
          <>
            <span>
              이동평균 <b>{rule.maPeriod}봉</b>
            </span>
            <span>
              매수/매도 이격도{' '}
              <b>
                ≤ {rule.buyDisparity}% / ≥ {rule.sellDisparity}%
              </b>
            </span>
            <span>
              손절 <b>-{rule.stopLossPct}%</b>
            </span>
          </>
        ) : null}
        {s.overlay?.chandelier && (
          <span>
            샹들리에 <b>ATR({s.overlay.chandelier.atrPeriod})×{s.overlay.chandelier.atrMultiplier}</b>
          </span>
        )}
        {s.overlay?.volatilityParity && (
          <span>
            변동성 패리티{' '}
            <b>
              {s.overlay.volatilityParity.volLookback}일 · 목표 {s.overlay.volatilityParity.targetAnnualVolPct}% · 최대{' '}
              {s.overlay.volatilityParity.maxAllocationPct}%
            </b>
          </span>
        )}
        <span>
          회당 <b>{s.qty}주</b>
        </span>
      </div>
      {kisRuleBlock && (
        <p className="studio-warning">{kisRuleBlock}</p>
      )}
      {kis && (
        <Link className="text-link" to={`/settings/trading/strategy?strategy=${encodeURIComponent(s.id)}`}>
          다음 계약 준비
        </Link>
      )}
      {kis ? (
        <details className="studio-history" onToggle={e => setHistoryOpen(e.currentTarget.open)}>
          <summary>
            최근 평가 · {evaluations.length}건 (최대 100건){!available && ' · 이전 조회'}
          </summary>
          {evaluations.length ? (
            historyOpen &&
            evaluations.map(e => (
              <div className="strategy-evaluation" key={e.event}>
                <p>
                  <strong>{evaluationLabels[e.status]}</strong> · {signalLabels[e.signal]} · revision {e.revision}
                </p>
                <p>{e.reason}</p>
                <p className="studio-meta">
                  <time dateTime={e.at}>{evaluationTime.format(new Date(e.at))} KST</time> · 이벤트 {e.event}
                </p>
                {e.requestId && (
                  <p>
                    요청 ID: <code>{e.requestId}</code> · 주문번호: {e.brokerId ?? '없음'} ·{' '}
                    <Link to="/paper">원장 대조</Link>
                  </p>
                )}
              </div>
            ))
          ) : (
            <p>{available ? '평가 기록 없음 · 시작 이후 새 체결가 이벤트가 필요합니다.' : '평가 기록 미확인'}</p>
          )}
        </details>
      ) : (
        <p className="studio-meta">
          마지막 신호 · {s.lastTick < 0 ? '평가 기록 없음' : signalLabels[s.lastSignal]}
          {!available && ' · 이전 조회'}
        </p>
      )}
      {!kis && controlNote && <p className={rechecking ? 'studio-meta' : 'studio-warning'}>{controlNote}</p>}
      {kis && (
        <p className="studio-meta">
          {controlNote || '별도 서버 계약과 주문별 승인·위험 검사 적용'} · <Link to="/paper">실시간 연결·대조 확인</Link>
        </p>
      )}
      {kis && (
        <p className="studio-meta">
          시작 후 브라우저를 닫아도 서버는 계속 평가합니다. 전략 정지 후에도 접수된 주문은 유지됩니다.
        </p>
      )}
      <div className="button-row">
        <button
          disabled={!available || (s.active ? stopping : busy || Boolean(blocked))}
          className={'button ' + (!available || s.active ? 'secondary' : 'primary')}
          onClick={() => {
            if (s.active) setStopping(true);
            void act(
              kis ? 'kis/strategies/run' : 'strategies/toggle',
              kis ? { id: s.id, active: !s.active } : { id: s.id },
            )
              .catch(() => {})
              .finally(() => {
                if (s.active) setStopping(false);
              });
          }}
        >
          {available && (s.active ? <Square size={14} /> : <Play size={14} />)}
          {!available ? '전략 실행 제어' : s.active ? '전략 정지' : '전략 시작'}
        </button>
        {!kis && (
          <button
            disabled={!available || busy}
            className="button secondary"
            onClick={() => void act('tick').catch(() => {})}
          >
            다음 데모 봉 재생
          </button>
        )}
      </div>
    </Panel>
  );
}
