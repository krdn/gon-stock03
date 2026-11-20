import { useId, type ReactNode } from 'react';
import { ArrowUpRight, ArrowDownRight, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { won, type DataStatus } from '../../shared/model';

export const phaseLabels: Record<DataStatus['phase'], string> = { disconnected: '미연결', loading: '로딩', ready: '정상', stale: '오래됨', partial: '부분실패', error: '오류' };
// 좁은 상태줄에서도 날짜와 초를 유지하는 YYYY-MM-DD HH:mm:ss 표기.
const kstDateTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23',
});
export function confirmedAt(value: string | null | undefined) {
  if (!value) return '없음';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '없음' : <time dateTime={value}>{kstDateTime.format(date)} KST</time>;
}

export function DataStatusLine({ status, label, showPages = false }: { status: DataStatus; label: string; showPages?: boolean }) {
  return <div className="data-status" role="group" aria-label={label}><strong>{label}</strong><Badge tone={status.phase === 'ready' ? 'teal' : 'neutral'}>{phaseLabels[status.phase]}</Badge><span>{status.environment === 'demo' ? 'DEMO · 합성 데이터' : 'KIS 모의 · REST'}</span><span>관측 {confirmedAt(status.observedAt)}</span><span>최종 전체 성공 {confirmedAt(status.lastSuccessAt)}</span>{showPages && <span>{status.pages}페이지 · {status.complete ? '전체 확인' : '전체 확인 전'}</span>}{status.error && <p>{status.error}</p>}</div>;
}

export function Panel({ title, eyebrow, children, action, className = '' }: { title?: string; eyebrow?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{title && <header className="panel-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action}</header>}{children}</section>;
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
export function Change({ value }: { value: number }) { return <span className={value >= 0 ? 'up change' : 'down change'}>{value >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{value >= 0 ? '+' : ''}{value.toFixed(2)}%</span>; }
export function Stat({ label, value, sub, tone, children }: { label: string; value: string; sub?: string; tone?: string; children?: ReactNode }) { return <div className="stat"><span className="muted">{label}</span><strong className={tone}>{value}</strong><div className="stat-bottom">{sub && <span className="muted">{sub}</span>}{children}</div></div>; }
export function Empty({ title, children }: { title: string; children?: ReactNode }) { return <div className="empty"><div className="empty-mark">—</div><h3>{title}</h3><p>{children}</p></div>; }
export function PageLink({ to, children }: { to: string; children: ReactNode }) { return <Link className="text-link" to={to}>{children}<ArrowRight size={15} /></Link>; }
export function Chart({ values, height = 190, color = 'var(--teal)', label = '합성 데이터 가격 추이', area = true }: { values: number[]; height?: number; color?: string; label?: string; area?: boolean }) {
  const id = useId().replace(/:/g, '');
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const points = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * 600},${height - 16 - ((v - min) / span) * (height - 38)}`).join(' ');
  return <svg className="chart" viewBox={`0 0 600 ${height}`} preserveAspectRatio="none" role="img" aria-label={label} style={{ height }}><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".17" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>{height > 80 && [0.2, 0.5, 0.8].map(y => <line key={y} x1="0" x2="600" y1={height * y} y2={height * y} stroke="var(--line)" strokeDasharray="4 5" />)}{area && <polygon points={`0,${height} ${points} 600,${height}`} fill={`url(#${id})`} />}<polyline points={points} fill="none" stroke={color} strokeWidth="2.3" vectorEffect="non-scaling-stroke" /></svg>;
}
export function Money({ value }: { value: number }) { return <>{won(value)}<small className="unit">원</small></>; }
