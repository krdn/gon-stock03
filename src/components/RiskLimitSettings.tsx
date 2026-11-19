import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useWorkbench } from '../context';
import { Panel } from './ui';

export function RiskLimitSettings() {
  const { state, act, available, busy } = useWorkbench();
  const [maxOrder, setMaxOrder] = useState(state.risk.maxOrder),
    [maxPosition, setMaxPosition] = useState(state.risk.maxPosition),
    [dailyLoss, setDailyLoss] = useState(state.risk.dailyLoss);
  const [dirty, setDirty] = useState(false);
  const editVersion = useRef(0);
  useEffect(() => {
    if (!dirty && available) {
      setMaxOrder(state.risk.maxOrder);
      setMaxPosition(state.risk.maxPosition);
      setDailyLoss(state.risk.dailyLoss);
    }
  }, [dirty, available, state.risk.maxOrder, state.risk.maxPosition, state.risk.dailyLoss]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const submittedVersion = editVersion.current;
    try {
      await act('risk', { maxOrder, maxPosition, dailyLoss });
      if (editVersion.current === submittedVersion) setDirty(false);
    } catch {
      /* Workspace displays the failure. */
    }
  }
  const edit = () => {
    editVersion.current++;
    setDirty(true);
  };
  return (
    <Panel title="매매 한도" action={<ShieldCheck size={20} />}>
      <form onSubmit={save}>
        <label className="field">
          1회 주문 한도 (원)
          <input
            type="number"
            min="10000"
            max="100000000"
            step="1"
            required
            disabled={!available}
            value={maxOrder}
            onChange={(e) => {
              edit();
              setMaxOrder(Number(e.target.value));
            }}
          />
        </label>
        <label className="field">
          종목별 최대 투자금 (원)
          <input
            type="number"
            min="10000"
            max="100000000"
            step="1"
            required
            disabled={!available}
            value={maxPosition}
            onChange={(e) => {
              edit();
              setMaxPosition(Number(e.target.value));
            }}
          />
        </label>
        <label className="field">
          공통 손실 한도 (원)
          <input
            type="number"
            min="1000"
            max="100000000"
            step="1"
            required
            disabled={!available}
            value={dailyLoss}
            onChange={(e) => {
              edit();
              setDailyLoss(Number(e.target.value));
            }}
          />
        </label>
        <p className="muted prose">
          금액 한도는 DEMO 수동·전략과 KIS 모의 수동·전략 주문에 공통 적용됩니다. KIS 전략은 실시간·승인 검사도 통과해야
          합니다. 이미 접수된 주문은 한도 변경으로 취소되지 않습니다.
        </p>
        {dirty && <p role="status">저장하지 않은 변경이 있습니다.</p>}
        <button className="button primary" disabled={!available || busy}>
          한도 저장
        </button>
      </form>
    </Panel>
  );
}
