import { Link } from 'react-router-dom';
import type { TradingTerms } from '../../shared/trading-plan';
import {
  krxHours,
  defaultOncePolicy,
  defaultStrategyPolicy,
  type OncePolicy,
  type StrategyPolicy,
} from '../../shared/trading-policy';

export function NumberField({
  label,
  value,
  max,
  min = 1,
  onChange,
}: {
  label: string;
  value: number;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step="1"
        required
        value={value === 0 && min > 0 ? '' : value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
export const priceNames = {
  current: '입력 지정가와 재조회 현재가 일치',
  cappedCurrent: '재조회 현재가로 매수 · 단가 상한 지정',
  fixed: '계약 고정 지정가',
  lower: '당일 하한가와 고정 단가 일치',
};
export function TradingPolicyFields({ terms, edit }: { terms: TradingTerms; edit: (terms: TradingTerms) => void }) {
  const p =
    terms.kind === 'once' ? (terms.policy ?? defaultOncePolicy(terms.date)) : (terms.policy ?? defaultStrategyPolicy());
  const updateCommon = (patch: Partial<Omit<StrategyPolicy, 'signalSeconds' | 'orderType'>>) => {
    if (terms.kind === 'once')
      edit({ ...terms, policy: { ...(terms.policy ?? defaultOncePolicy(terms.date)), ...patch } });
    else edit({ ...terms, policy: { ...(terms.policy ?? defaultStrategyPolicy()), ...patch } });
  };
  const updateOnce = (patch: Partial<OncePolicy>) => {
    if (terms.kind === 'once')
      edit({ ...terms, policy: { ...(terms.policy ?? defaultOncePolicy(terms.date)), ...patch } });
  };
  return (
    <>
      {terms.kind === 'once' && 'priceMode' in p && (
        <>
          {terms.orderType === 'limit' && (
            <>
              <label className="field">
                지정가 기준
                <select
                  value={p.priceMode}
                  onChange={(e) => {
                    const mode = e.target.value as OncePolicy['priceMode'];
                    updateOnce({ priceMode: mode, limitPrice: mode === 'current' ? undefined : p.limitPrice });
                  }}
                >
                  {Object.entries(priceNames)
                    .filter(([mode]) => mode !== 'cappedCurrent' || p.side === 'buy')
                    .map(([value, title]) => (
                      <option key={value} value={value}>
                        {title}
                      </option>
                    ))}
                </select>
              </label>
              {p.priceMode !== 'current' && (
                <NumberField
                  label={p.priceMode === 'cappedCurrent' ? '매수 단가 상한 (원)' : '계약 고정 단가 (원)'}
                  max={10000000}
                  value={p.limitPrice ?? 0}
                  onChange={(limitPrice) => updateOnce({ limitPrice })}
                />
              )}
            </>
          )}
          <NumberField
            label="주문 후 조회·잔량 대응 시간 (초)"
            value={p.observationSeconds}
            max={86400}
            onChange={(observationSeconds) => updateOnce({ observationSeconds })}
          />
          {p.side === 'buy' && (
            <NumberField
              label="매수 후 남길 현금 (원)"
              min={0}
              max={100000000}
              value={p.cashReserve}
              onChange={(cashReserve) => updateOnce({ cashReserve })}
            />
          )}
          <label className="check-row">
            <input
              type="checkbox"
              checked={p.allowPending}
              onChange={(e) => updateOnce({ allowPending: e.target.checked })}
            />
            계좌에 미체결이 있어도 예약 수량·금액을 반영해 검사
          </label>
          <label className="field">
            1회 승인 소진 시점
            <select
              value={p.consumeAt}
              onChange={(e) => updateOnce({ consumeAt: e.target.value as OncePolicy['consumeAt'] })}
            >
              <option value="preflight">계좌 사전검사 시작 시</option>
              <option value="validated">사전검사 통과 후 전송 예약 시</option>
            </select>
          </label>
          <p className="muted">
            사전검사 통과 후 소진을 선택하면 미전송 실패를 수정하고 직접 다시 시도할 수 있습니다. 전송 예약 후에는 같은
            승인으로 추가 주문할 수 없습니다.
          </p>
        </>
      )}
      {terms.kind === 'strategy' && 'signalSeconds' in p && (
        <label className="field">
          전략 주문 방식
          <select
            value={p.orderType}
            onChange={(e) => edit({ ...terms, policy: { ...p, orderType: e.target.value as 'limit' | 'market' } })}
          >
            <option value="limit">신호 가격 지정가</option>
            <option value="market">시장가 · 상한가로 예산 예약</option>
          </select>
        </label>
      )}
      <NumberField
        label="시세 유효시간 (초)"
        value={p.quoteSeconds}
        max={600}
        onChange={(quoteSeconds) => updateCommon({ quoteSeconds })}
      />
      {terms.kind === 'strategy' && 'signalSeconds' in p && (
        <NumberField
          label="원 신호 유효시간 (초)"
          value={p.signalSeconds}
          max={600}
          onChange={(signalSeconds) => edit({ ...terms, policy: { ...p, signalSeconds } })}
        />
      )}
      <div className="button-row">
        {(['open', 'close'] as const).map((key, i) => (
          <label className="field" key={key}>
            실행 {i ? '마감' : '개시'} 시각 (KST)
            <input
              type="time"
              required
              value={p.session[key]}
              onChange={(e) => updateCommon({ session: { ...p.session, [key]: e.target.value } })}
            />
          </label>
        ))}
      </div>
      <p className="muted">
        거래일을 확인하고 입력하세요. 설정 구간과 KRX 정규장이 겹치는 시간에만 주문합니다. 2026년 11월 19일 주식
        정규장은 10:00~16:30입니다.
      </p>
      <NumberField
        label="종목 마스터 유효기간 (일)"
        max={30}
        value={p.masterDays}
        onChange={(masterDays) => updateCommon({ masterDays })}
      />
      <details>
        <summary>특별 개장일 공지 입력</summary>
        <label className="check-row">
          <input
            type="checkbox"
            checked={!!p.exchangeNotice}
            onChange={(e) => {
              const date =
                terms.kind === 'once'
                  ? terms.date
                  : new Date((Date.parse(terms.startsAt) || Date.now()) + 9 * 3600000).toISOString().slice(0, 10);
              updateCommon({ exchangeNotice: e.target.checked ? { date, ...krxHours(date), source: '' } : undefined });
            }}
          />
          해당 날짜의 공식 정규장 공지를 직접 확인해 고정
        </label>
        {p.exchangeNotice && (
          <>
            <label className="field">
              공지 거래일
              <input
                type="date"
                required
                readOnly={terms.kind === 'once'}
                value={p.exchangeNotice.date}
                onChange={(e) => updateCommon({ exchangeNotice: { ...p.exchangeNotice!, date: e.target.value } })}
              />
            </label>
            {(['open', 'close'] as const).map((key, i) => (
              <label className="field" key={key}>
                공지 {i ? '폐장' : '개장'} 시각
                <input
                  type="time"
                  required
                  value={p.exchangeNotice![key]}
                  onChange={(e) => updateCommon({ exchangeNotice: { ...p.exchangeNotice!, [key]: e.target.value } })}
                />
              </label>
            ))}
            <label className="field">
              KRX·한국투자증권 공식 공지 URL
              <input
                type="url"
                required
                value={p.exchangeNotice.source}
                onChange={(e) => updateCommon({ exchangeNotice: { ...p.exchangeNotice!, source: e.target.value } })}
              />
            </label>
            <p>
              준비자가 확인한 해당일 공지와 실행 시간창의 교집합을 사용합니다. 공지 내용·휴장일을 자동 수집하지
              않습니다.
            </p>
          </>
        )}
      </details>
      <details>
        <summary>KIS 응답 대기·시세 재연결·불명 복구</summary>
        <NumberField
          label="KIS 요청 응답 대기 (초)"
          max={120}
          value={p.requestSeconds}
          onChange={(requestSeconds) => updateCommon({ requestSeconds })}
        />
        <NumberField
          label="잔고 전체 조회 대기 (초)"
          max={600}
          value={p.balanceSeconds}
          onChange={(balanceSeconds) => updateCommon({ balanceSeconds })}
        />
        <NumberField
          label="KIS 요청 간 추가 대기 (ms)"
          min={0}
          max={30000}
          value={p.extraSpacingMs}
          onChange={(extraSpacingMs) => updateCommon({ extraSpacingMs })}
        />
        <NumberField
          label="시세 재연결 횟수"
          min={0}
          max={20}
          value={p.reconnects}
          onChange={(reconnects) => updateCommon({ reconnects })}
        />
        <NumberField
          label="실시간 수신 대기 (초)"
          max={600}
          value={p.silenceSeconds}
          onChange={(silenceSeconds) => updateCommon({ silenceSeconds })}
        />
        <NumberField
          label="주문 복구 조회 근거 유효시간 (초)"
          max={3600}
          value={p.recoverySeconds}
          onChange={(recoverySeconds) => updateCommon({ recoverySeconds })}
        />
        <p>
          재연결 후에는 REST 계좌 대조와 전략 재시작이 필요합니다. 응답 불명 주문은{' '}
          <Link to="/paper">모의 주문 원장</Link>에서 확인하세요.
        </p>
      </details>
    </>
  );
}
