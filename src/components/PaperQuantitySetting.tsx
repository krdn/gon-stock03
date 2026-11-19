import { useState, type FormEvent } from 'react';
import { MAX_ORDER_QTY, paperQuantitySetting } from '../../shared/contracts';
import { useWorkbench } from '../context';
import { Panel } from './ui';

export function PaperQuantitySetting({ saved, approvalLimit }: { saved: number; approvalLimit?: number }) {
  const { act, busy, available } = useWorkbench();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? String(saved);
  async function save(event: FormEvent) {
    event.preventDefault();
    const input = paperQuantitySetting.safeParse({ maxQty: Number(value) });
    if (!input.success || !available || busy) return;
    try {
      await act('kis/quantity-setting', input.data);
      setDraft(null);
    } catch { /* Keep the edited value for correction. */ }
  }
  return <Panel title="KIS 모의 수동 주문 한도" className="top-gap">
    <form className="button-row" onSubmit={save}>
      <label className="field">주문당 수량 상한 (주)
        <input type="number" min="1" max={MAX_ORDER_QTY} step="1" required value={value}
          onChange={event => setDraft(event.target.value)} disabled={!available || busy} />
      </label>
      <button className="button secondary" disabled={!available || busy}>수량 한도 저장</button>
    </form>
    <p className="muted">{available ? `저장된 수동 주문 한도 ${saved}주` : '수동 주문 한도 확인 대기'}
      {approvalLimit !== undefined && ` · 이번 1회 승인 상한 ${approvalLimit}주 · 적용 한도 ${Math.min(saved, approvalLimit)}주`}</p>
  </Panel>;
}
