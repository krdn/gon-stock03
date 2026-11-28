import { useEffect, useRef } from 'react';
import { won } from '../../../shared/model';
import { Panel, Stat } from '../ui';
import { dateInput, type CostAssumptions, type FlexibleBacktestResult } from '../../pages/research-rule-form';

/** 백테스트 초기 자금·수수료·슬리피지 입력 필드 묶음. */
export function CostFields({
  values,
  change,
}: {
  values: CostAssumptions;
  change: (values: CostAssumptions) => void;
}) {
  function field(key: keyof CostAssumptions, label: string, min: number, max: number, step = 1) {
    return (
      <label className="field">
        {label}
        <input
          name={key}
          type="number"
          min={min}
          max={max}
          step={step}
          required
          value={Number.isNaN(values[key]) ? '' : values[key]}
          onChange={event => change({ ...values, [key]: event.target.valueAsNumber })}
        />
      </label>
    );
  }
  return (
    <>
      {field('capital', '초기 자금 (원)', 100000, 100000000)}
      <div className="form-grid">
        {field('feeBps', '수수료 (bp, 1bp = 0.01%)', 0, 100, 0.1)}
        {field('slippageBps', '슬리피지 (bp)', 0, 100, 0.1)}
      </div>
    </>
  );
}

/** 전략 성과와 벤치마크 성과를 나란히 비교하는 요약 컴포넌트. */
export function ResultSummary({
  result,
  label,
  portfolio,
}: {
  result: FlexibleBacktestResult;
  label: string;
  portfolio?: boolean;
}) {
  const benchmark = result.benchmark;
  const excessReturn = benchmark ? result.returnPct - benchmark.returnPct : null;
  const benchmarkAriaLabel = portfolio ? '위험 자산 동일 비중 벤치마크 비교' : '단순 보유 벤치마크 비교';
  const benchmarkHeading = portfolio ? '전략 vs 위험 자산 동일 비중 비교' : '전략 vs 단순 보유 비교';
  const benchmarkColumnLabel = portfolio
    ? '위험 자산 동일 비중 첫 시가 보유 (벤치마크)'
    : '단순 보유 (벤치마크)';

  return (
    <>
      <div className="stats-grid three">
        <Stat label={label} value={`${result.returnPct.toFixed(2)}%`} />
        <Stat label="최대 낙폭" value={`${result.maxDrawdown.toFixed(2)}%`} />
        <Stat label="체결 횟수" value={`${result.trades.length}회`} />
      </div>
      <p>
        최종 평가자산 <strong>{won(result.finalEquity)}원</strong> · 누적 수수료 {won(result.fees)}원 · 체결가에 포함된
        슬리피지 {won(result.slippageCost)}원
      </p>
      {benchmark && (
        <div className="bt-benchmark" aria-label={benchmarkAriaLabel}>
          <div className="bt-benchmark-head">
            <strong>{benchmarkHeading}</strong>
            <span className="bt-note">
              초과 수익률 {excessReturn !== null && (excessReturn >= 0 ? '+' : '')}
              {excessReturn?.toFixed(2)}%p
            </span>
          </div>
          <div className="bt-benchmark-grid">
            <div className="bt-benchmark-col">
              <span className="bt-benchmark-label">전략 성과</span>
              <dl>
                <div>
                  <dt>수익률</dt>
                  <dd>{result.returnPct.toFixed(2)}%</dd>
                </div>
                <div>
                  <dt>최대 낙폭</dt>
                  <dd>{result.maxDrawdown.toFixed(2)}%</dd>
                </div>
                <div>
                  <dt>최종 자산</dt>
                  <dd>{won(result.finalEquity)}원</dd>
                </div>
              </dl>
            </div>
            <div className="bt-benchmark-col">
              <span className="bt-benchmark-label">{benchmarkColumnLabel}</span>
              <dl>
                <div>
                  <dt>수익률</dt>
                  <dd>{benchmark.returnPct.toFixed(2)}%</dd>
                </div>
                <div>
                  <dt>최대 낙폭</dt>
                  <dd>{benchmark.maxDrawdown.toFixed(2)}%</dd>
                </div>
                <div>
                  <dt>최종 자산</dt>
                  <dd>{won(benchmark.finalEquity)}원</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** 목표 비중 소수를 백분율 문자열로 포맷한다. */
function formatWeightPct(weight: number): string {
  const pct = weight * 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1).replace(/\.0$/, '')}%`;
}

/** 다종목 자산배분(`v3`) 리밸런싱 판정·체결·목표 비중 내역 테이블. */
export function Rebalances({
  rebalances,
}: {
  rebalances: NonNullable<FlexibleBacktestResult['rebalances']>;
}) {
  return (
    <Panel title="리밸런싱 내역">
      {rebalances.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>판정일 → 체결일</th>
                <th>종목별 목표 비중</th>
                <th>판정 사유</th>
              </tr>
            </thead>
            <tbody>
              {rebalances.map((item, idx) => {
                const allocated = item.targets.reduce((sum, t) => sum + t.weight, 0);
                const cashWeight = Math.max(0, 1 - allocated);
                const targetText = [
                  ...item.targets.map(t => `${t.code} ${formatWeightPct(t.weight)}`),
                  ...(cashWeight > 0.0001 ? [`현금 ${formatWeightPct(cashWeight)}`] : []),
                ].join(' · ');
                return (
                  <tr key={`${item.signalDate}-${item.date}-${idx}`}>
                    <td>{`${dateInput(item.signalDate)} → ${dateInput(item.date)}`}</td>
                    <td>{targetText}</td>
                    <td>{item.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p>이 구간에는 리밸런싱 내역이 없습니다.</p>
      )}
    </Panel>
  );
}

/** 백테스트 거래 내역 테이블 (v2 매매 사유 `reason` 및 v3 종목 코드 `code` 열 자동 지원). */
export function Trades({ result, daily }: { result: FlexibleBacktestResult; daily?: boolean }) {
  const hasCode = result.trades.some(t => Boolean(t.code));
  const hasReason = result.trades.some(t => Boolean(t.reason));
  return (
    <Panel title="백테스트 거래 내역">
      {result.trades.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {hasCode && <th>종목 코드</th>}
                <th>{daily ? '신호일 → 체결일' : '봉 번호'}</th>
                <th>방향</th>
                <th>체결가 (원)</th>
                <th>수량 (주)</th>
                <th>수수료 (원)</th>
                {hasReason && <th>매매 사유</th>}
              </tr>
            </thead>
            <tbody>
              {result.trades.map((t, idx) => (
                <tr key={`${t.bar}-${t.code ?? ''}-${t.side}-${idx}`}>
                  {hasCode && <td>{t.code ?? '—'}</td>}
                  <td>{daily ? `${dateInput(t.signalDate) || '미확인'} → ${dateInput(t.date) || '미확인'}` : t.bar}</td>
                  <td>{t.side === 'buy' ? '매수' : '매도'}</td>
                  <td>{t.price.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}</td>
                  <td>{t.qty}</td>
                  <td>{won(t.fee)}</td>
                  {hasReason && <td>{t.reason ?? '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>이 구간에는 체결된 거래가 없습니다.</p>
      )}
    </Panel>
  );
}

/** 백테스트 결과 영역이 새로 렌더링되면 포커스와 스크롤을 이동하는 훅. */
export function useResultFocus(result: unknown) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (result && ref.current) {
      ref.current.focus({ preventScroll: true });
      ref.current.scrollIntoView({ block: 'start' });
    }
  }, [result]);
  return ref;
}
