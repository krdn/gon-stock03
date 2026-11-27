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

/** 전략 성과와 단순 보유(benchmark) 성과를 나란히 비교하는 요약 컴포넌트. */
export function ResultSummary({ result, label }: { result: FlexibleBacktestResult; label: string }) {
  const benchmark = result.benchmark;
  const excessReturn = benchmark ? result.returnPct - benchmark.returnPct : null;
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
        <div className="bt-benchmark" aria-label="단순 보유 벤치마크 비교">
          <div className="bt-benchmark-head">
            <strong>전략 vs 단순 보유 비교</strong>
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
              <span className="bt-benchmark-label">단순 보유 (벤치마크)</span>
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

/** 백테스트 거래 내역 테이블 (v2 매매 사유 `reason`이 있으면 사유 열을 함께 표시). */
export function Trades({ result, daily }: { result: FlexibleBacktestResult; daily?: boolean }) {
  const hasReason = result.trades.some(t => Boolean(t.reason));
  return (
    <Panel title="백테스트 거래 내역">
      {result.trades.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{daily ? '신호일 → 체결일' : '봉 번호'}</th>
                <th>방향</th>
                <th>체결가 (원)</th>
                <th>수량 (주)</th>
                <th>수수료 (원)</th>
                {hasReason && <th>매매 사유</th>}
              </tr>
            </thead>
            <tbody>
              {result.trades.map(t => (
                <tr key={t.bar}>
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
