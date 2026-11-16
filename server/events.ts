import { z } from 'zod';
import type { ConnectionState, ConnectionFailure, Event, PaperAudit, State } from '../shared/model.ts';
import { record } from './engine.ts';

const status = { sending: '전송 중', accepted: '접수 · 미체결', unknown: '응답 불명 · 대조 필요', rejected: '거부 · 미접수', partial: '부분체결', filled: '체결', cancelled: '취소' };
const action = { sending: '주문 전송 시작', response: '주문 응답', reconcile: '주문 대조', restart: '재시작 불명 전환', 'recovery-inspect': '불명 복구 조회', 'recovery-confirm': '불명 복구 확인', 'cancel-attempt': '한정 취소 시도', 'cancel-response': '한정 취소 응답' };
export function paperEvent(audit: PaperAudit, read: boolean): Event {
  const requestId = z.uuid().safeParse(audit.requestId);
  return { id: `paper:${audit.id}`, time: audit.at, title: `KIS ${action[audit.action]}`, detail: `${audit.before ? status[audit.before] : audit.action === 'sending' ? '미전송' : '이전 상태 미기록'} → ${status[audit.after]}. KIS 모의 매매 화면의 원장을 확인하세요.`, level: audit.after === 'unknown' || audit.after === 'rejected' ? 'warning' : 'info', read, environment: 'kis-paper', target: 'paper', ...(requestId.success ? { requestId: requestId.data } : {}) };
}
export function presentEvent(event: Event): Event {
  if (event.target) return event;
  const kis = event.title.startsWith('KIS');
  const risk = /위험|긴급정지|신규 주문 허용/.test(event.title);
  return { ...event, ...(kis ? { title: 'KIS 모의 주문 기록', detail: '기존 KIS 주문 이벤트입니다. 자세한 상태는 모의 매매 원장을 확인하세요.' } : {}), environment: kis ? 'kis-paper' : risk ? 'shared' : 'demo', target: kis ? 'paper' : risk ? 'risk' : /전략|재생/.test(event.title) ? 'strategies' : /주문/.test(event.title) ? 'orders' : undefined };
}
export function recordKisEvent(state: State, title: string, detail: string, target: 'paper' | 'settings', requestId?: string, level: Event['level'] = 'warning') {
  const prior = requestId ? state.events.find(e => e.requestId === requestId && e.title === title) : state.events.find(e => e.environment === 'kis-paper' && e.target === target && !e.requestId);
  if (prior?.title === title && prior.detail === detail) return;
  record(state, title, detail, level, { environment: 'kis-paper', target, ...(requestId ? { requestId } : {}) });
}
export function recordConnection(state: State, connection: ConnectionState, failed?: ConnectionFailure['kind'] | null) {
  const failure = failed !== undefined ? failed : connection.failure?.kind ?? connection.authentication.failure?.kind;
  const reasons = { missing: '필수 설정 미주입', invalid: '설정 형식 오류', expired: '인증 만료', permission: '이용 권한 오류', 'rate-limit': '호출 제한', network: '연결 실패', upstream: '외부 서버 오류', contract: '응답 계약 불일치', rejected: '조회 거부' };
  const ready = failed === undefined && connection.status.phase === 'ready';
  recordKisEvent(state, ready ? 'KIS 연결·잔고 확인' : 'KIS 연결 확인 실패', ready ? 'REST 잔고 전체 조회를 확인했습니다. 실시간 연결 상태는 아닙니다.' : `${failure ? reasons[failure] : '전체 조회 미확인'}. 연결·설정 화면에서 원인과 복구 방법을 확인하세요.`, 'settings', undefined, ready ? 'info' : 'warning');
}
