import { initialState } from '../shared/fixtures';
import { disconnectedConnection, emptyStatus } from '../shared/status';
import type { StateSnapshot } from '../shared/model';

export function snapshot(): StateSnapshot {
  const now = new Date().toISOString();
  return { ...initialState(), instanceId: 'fixture-server', startedAt: now, status: { ...emptyStatus('demo'), phase: 'ready', complete: true, observedAt: now, lastSuccessAt: now }, connection: disconnectedConnection() };
}
