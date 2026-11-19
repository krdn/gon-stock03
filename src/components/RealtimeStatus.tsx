import { Link } from 'react-router-dom';
import { useWorkbench } from '../context';

export function RealtimeStatus({ code }: { code?: string }) {
  const { realtime, available, act, busy } = useWorkbench();
  const age = realtime?.lastQuoteAt ? Date.now() - Date.parse(realtime.lastQuoteAt) : Infinity;
  const fresh = available && realtime?.fresh && age >= 0 && age <= (realtime.quoteSeconds ?? 5) * 1000;
  const allowed = fresh && realtime?.ordersAllowed;
  const time = (value: string | null | undefined) => value ? new Date(value).toLocaleString('ko-KR') : '미확인';
  return <section className="notice compact" aria-label="KIS 실시간 상태"><div>
    <strong>KIS 모의 실시간 · {available && realtime ? ({ stopped: '미연결', connecting: '연결 중', reconciling: 'REST 대조 필요', ready: 'REST 대조 완료', disconnected: '수신 중단', error: '오류' })[realtime.phase] : '상태 미확인'}</strong>
    <p>{!available ? '서버 상태 확인 실패 · 이전 표시는 최신이 아닙니다.' : realtime?.message ?? '실시간 미연결 · 자동 시작 없음'}</p>
    <p>{realtime?.code ?? '구독 없음'} · 시세 {fresh ? '신선' : '미수신/지연'} · 실시간 기준 신규 주문 {allowed ? '허용' : '차단'}</p>
    <p className="tiny">시세 기준 {time(realtime?.lastQuoteAt)} · 체결통보 수신 {time(realtime?.lastNoticeAt)} · REST 대조 {time(realtime?.reconciledAt)}</p>
    <p className="tiny">체결통보 수신은 체결 수량 확정이 아닙니다. {realtime?.required ? '수신 중단·재시작 후에도 대조 전 신규 주문을 차단합니다.' : '실시간 시작 전 수동 주문은 기존 REST 검증을 따릅니다.'} 전략 자동 시작 없음.</p>
    {code ? <div className="button-row">
      <button className="button small secondary" disabled={!available || busy || !/^\d{6}$/.test(code) || !realtime || !['stopped', 'disconnected'].includes(realtime.phase)} onClick={() => void act('kis/realtime/start', { code }).catch(() => {})}>실시간 수신 시작</button>
      <button className="button small secondary" disabled={!available || busy || !realtime || !['reconciling', 'ready'].includes(realtime.phase)} onClick={() => void act('kis/realtime/reconcile').catch(() => {})}>실시간 REST 대조</button>
      <button className="button small secondary" disabled={!available || busy || !realtime || realtime.phase === 'stopped'} onClick={() => void act('kis/realtime/stop').catch(() => {})}>실시간 수신 정지</button>
    </div> : <Link to="/paper">실시간 대조·모의 매매 화면</Link>}
  </div></section>;
}
