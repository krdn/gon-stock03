import { useEffect, useRef, useState } from 'react';
import { useWorkbench } from '../context';
import { Panel } from './ui';
import type { PaperCancellation } from '../../shared/contracts';
import { won, type PaperOrder, type BrokerOrder } from '../../shared/model';

interface Props {
  info: PaperCancellation | null;
  orders: PaperOrder[];
  refreshOrders: () => Promise<{ orders: PaperOrder[]; brokerOrders: BrokerOrder[] } | undefined>;
}

export function PaperCancellationPanel({ info, orders, refreshOrders }: Props) {
  const { act, available, busy, serverNow } = useWorkbench();
  const [selected, setSelected] = useState<string | null>(null);
  const [attempted, setAttempted] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const dialog = useRef<HTMLDialogElement>(null), inFlight = useRef(false);
  const candidate = info?.candidate;
  const order = candidate && orders.find(row => row.requestId === candidate.requestId);
  const eligible = Boolean(available && candidate && order?.brokerId && order.remaining > 0 &&
    ['accepted', 'partial'].includes(order.status) && serverNow < Date.parse(candidate.expiresAt) && attempted !== order.requestId);
  useEffect(() => {
    if (selected && eligible && order?.requestId === selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected, eligible, order?.requestId]);

  async function reconcile(target?: PaperOrder) {
    const result = await refreshOrders();
    if (!result) { setFeedback('대조 실패 · 최종 취소 수량을 확인할 수 없습니다.'); return; }
    if (!target) { setFeedback('당일 주문 표에 최신 조회 수량을 표시했습니다.'); return; }
    const saved = result.orders.find(o => o.requestId === target.requestId);
    const row = result.brokerOrders.find(o => o.date === target.tradeDate && o.code === target.code &&
      o.side === target.side && o.qty === target.qty && o.price === target.price &&
      Number(o.brokerId) === Number(target.brokerId) && Number(o.organization) === Number(target.organization));
    if (!row || !saved || saved.status === 'unknown') { setFeedback('최종 주문 상태 미확정 · 계좌·주문을 다시 대조하세요.'); return; }
    setFeedback(`KIS 대조 · 체결 ${row.filled}주 · 취소확인 ${row.confirmedCancelQty === undefined ? '미제공' : row.confirmedCancelQty + '주'} · 잔량 ${row.remaining}주`);
  }
  async function cancel() {
    if (!eligible || !order || selected !== order.requestId || busy || inFlight.current) return;
    inFlight.current = true;
    setAttempted(order.requestId); setSelected(null);
    try {
      await act('kis/cancel-probe', { id: order.requestId, reconcileFirst: true });
      setFeedback('취소를 요청했습니다. 당일 주문 표의 체결·잔량·취소확인 수량을 확인하세요.');
    } catch {
      setFeedback('취소 결과를 확인해야 합니다. 계좌·주문을 다시 조회하세요.');
    } finally {
      try { await reconcile(order); } finally { inFlight.current = false; }
    }
  }
  return <Panel title="미체결 잔량 취소" className="top-gap">
    <p id="paper-cancel-reason" className="muted">{order && !eligible ? '취소 시도 또는 유효시간 종료. 계좌·주문을 다시 조회하세요.' : info?.reason ?? '원장 조회 후 서버가 허용한 취소 대상을 표시합니다.'}</p>
    <div className="button-row">
      {eligible && order && <span>{order.code} · 주문번호 {order.brokerId} · 잔량 {order.remaining}주</span>}
      <button className="button secondary" aria-describedby="paper-cancel-reason" disabled={!eligible || busy} onClick={() => order && setSelected(order.requestId)}>잔량 전부 취소</button>
      <button className="button secondary" disabled={busy || !available || inFlight.current} onClick={() => void reconcile(orders.find(o => o.requestId === attempted))}>취소 결과 조회</button>
    </div>
    {feedback && <p role="status">{feedback}</p>}
    <dialog ref={dialog} className="order-dialog" aria-labelledby="paper-cancel-heading" onClose={() => setSelected(null)} onCancel={() => setSelected(null)}>
      <h2 id="paper-cancel-heading">미체결 잔량을 취소할까요?</h2>
      {order && <p>종목 {order.code} · 주문번호 {order.brokerId}<br />지정가 {won(order.price)}원 · 주문 {order.qty}주 · 체결 {order.filled}주 · 취소 요청 잔량 {order.remaining}주</p>}
      <p>확인하는 동안 체결되면 실제 취소 수량이 달라질 수 있습니다.</p>
      <div className="button-row">
        <button className="button secondary" autoFocus onClick={() => setSelected(null)}>돌아가기</button>
        <button className="button primary" disabled={!eligible || busy} onClick={() => void cancel()}>잔량 취소 요청</button>
      </div>
    </dialog>
  </Panel>;
}
