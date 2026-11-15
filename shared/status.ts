import type { ConnectionState, DataStatus } from './model.ts';

export const LOCAL_STALE_MS = 10_000;
export const BALANCE_STALE_MS = 60_000;
export const QUOTE_REFRESH_MS = 3_000;
export function emptyStatus(environment: DataStatus['environment']): DataStatus {
  return { environment, source: environment === 'demo' ? 'synthetic' : 'kis-rest', phase: 'disconnected', observedAt: null, lastSuccessAt: null, staleAfterMs: environment === 'demo' ? LOCAL_STALE_MS : BALANCE_STALE_MS, complete: false, error: null, pages: 0 };
}
export function freshness(status: DataStatus, now = Date.now()): DataStatus {
  return status.phase === 'ready' && status.lastSuccessAt && now - Date.parse(status.lastSuccessAt) >= status.staleAfterMs ? { ...status, phase: 'stale' } : status;
}
export function disconnectedConnection(configured = false): ConnectionState {
  return { configured, mode: 'paper', connected: false, message: 'KIS 모의 잔고를 아직 확인하지 않았습니다.', status: emptyStatus('kis-paper') };
}
