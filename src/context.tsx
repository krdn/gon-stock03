import { createContext, useContext } from 'react';
import type { State, DataStatus, ConnectionState, PaperRiskSnapshot } from '../shared/model';
export interface Workbench { serverNow: number; server?: { instanceId: string; startedAt: string }; realtime?: import('../shared/realtime').RealtimeStatus; state: State; status: DataStatus; connection: ConnectionState; paperRisk?: PaperRiskSnapshot; busy: boolean; available: boolean; act: <T = unknown>(path: string, body?: unknown) => Promise<T>; refresh: () => Promise<void> }
export const WorkbenchContext = createContext<Workbench | null>(null);
export function useWorkbench() { const value = useContext(WorkbenchContext); if (!value) throw new Error('워크스페이스가 없습니다.'); return value; }
