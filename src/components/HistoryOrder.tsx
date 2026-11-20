import { Fragment, useEffect, useRef, useState } from 'react';
import { ChevronDown, Copy } from 'lucide-react';
import type { PaperLedger } from '../../shared/contracts';
import { won } from '../../shared/model';
import { Badge } from './ui';

export type LedgerOrder = PaperLedger['orders'][number];
export const paperStatus = {
  sending: '전송 중', accepted: '접수 · 미체결', unknown: '응답 불명 · 대조 필요', rejected: '거부 · 미접수',
  partial: '부분체결', filled: '체결', cancelled: '취소',
};
const formatKst = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function HistoryOrder({ order, name, reveal }: { order: LedgerOrder; name: string; reveal: boolean }) {
  const [feedback, setFeedback] = useState('');
  const detail = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (detail.current) detail.current.open = reveal;
  }, [reveal]);
  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`${label} 복사 완료`);
    } catch {
      setFeedback(`${label} 복사 실패 · 값을 선택해 직접 복사하세요.`);
    }
  }
  const fields: [string, string | undefined][] = [['앱 요청 ID', order.requestId], ['증권사 주문번호', order.brokerId], ['원장 출처', order.sourceLabel]];
  return <li className="history-order">
    <div className="history-order-main">
      <div className="history-instrument">
        <div><strong>{name}</strong> <Badge tone={order.status === 'filled' ? 'teal' : ['unknown','rejected','partial'].includes(order.status) ? 'amber' : 'neutral'}>
          {order.status === 'filled' && order.filled === order.qty ? '전량 체결' : paperStatus[order.status]}
        </Badge></div>
        <span>{order.code} · {order.side === 'buy' ? '매수' : '매도'} · {order.orderType === 'market' ? '시장가' : `지정가 ${won(order.price)}원`}</span>
      </div>
      <div className="history-quantity"><strong>체결 {order.filled}주</strong> · 잔량 {order.remaining}주 <small>주문 {order.qty}주</small></div>
      <div className="history-time"><span>KIS 확인 (KST)</span>{order.lastMatchedAt
        ? <time dateTime={order.lastMatchedAt}>{formatKst.format(new Date(order.lastMatchedAt))}</time>
        : <strong className="history-unknown">미확인</strong>}</div>
    </div>
    <details className="history-order-detail" ref={detail}>
      <summary aria-label={`${name} 주문 상세`}>주문 상세 <ChevronDown size={14} aria-hidden="true" /></summary>
      <dl>
        <dt>주문일</dt><dd>{order.tradeDate.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')}</dd>
        <dt>요청 생성 (KST)</dt><dd>{formatKst.format(new Date(order.createdAt))}</dd>
        {fields.map(([label, value]) => <Fragment key={label}>
          <dt>{label}</dt><dd><span>{value ?? '미확인'}</span>{value && <button type="button" className="history-copy" aria-label={`${label} 복사`}
            onClick={() => void copy(label, value)}><Copy size={15} aria-hidden="true" /> 복사</button>}</dd>
        </Fragment>)}
      </dl>
      <span role="status" className="history-feedback">{feedback}</span>
    </details>
  </li>;
}
