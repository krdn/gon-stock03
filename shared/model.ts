export type Market = 'KOSPI' | 'KOSDAQ' | 'ETF';
export interface Instrument { code: string; name: string; market: Market; sector: string; price: number; change: number; volume: number; history: number[] }
export interface Position { code: string; qty: number; average: number }
export interface Order { id: string; code: string; side: 'buy' | 'sell'; qty: number; price: number; filledPrice?: number; status: 'pending' | 'filled' | 'cancelled'; createdAt: string; filledAt?: string; source: string; fee: number; requestId: string }
export interface Strategy { id: string; name: string; code: string; fast: number; slow: number; qty: number; active: boolean; lastSignal: 'buy' | 'sell' | 'hold'; lastTick: number }
export interface Risk { maxOrder: number; maxPosition: number; dailyLoss: number; halted: boolean }
export interface Event { id: string; time: string; level: 'info' | 'warning' | 'error'; title: string; detail: string; read: boolean }
export interface Journal { id: string; date: string; code: string; text: string }
export interface State { cash: number; startingEquity: number; instruments: Instrument[]; positions: Position[]; orders: Order[]; watchlist: string[]; strategies: Strategy[]; risk: Risk; events: Event[]; journal: Journal[]; tick: number; playing: boolean; revision: number; updatedAt: string }
export interface BacktestInput { code: string; fast: number; slow: number; capital: number; feeBps: number; slippageBps: number }
export interface BacktestResult { equity: number[]; trades: { bar: number; date?: string; signalDate?: string; side: 'buy' | 'sell'; price: number; qty: number; fee: number }[]; returnPct: number; maxDrawdown: number; finalEquity: number; fees: number; slippageCost: number; source: string }
export interface Connection { configured: boolean; mode: 'paper'; connected: boolean; checkedAt?: string; message: string; balance?: { cash: number; totalEquity: number; positions: { code: string; name: string; qty: number; average: number; price: number | null }[] } }
export interface DataStatus { environment: 'demo' | 'kis-paper'; source: 'synthetic' | 'kis-rest'; phase: 'disconnected' | 'loading' | 'ready' | 'stale' | 'partial' | 'error'; observedAt: string | null; lastSuccessAt: string | null; staleAfterMs: number; complete: boolean; error: string | null; pages: number }
export interface ConnectionFailure { kind: 'missing' | 'invalid' | 'expired' | 'permission' | 'rate-limit' | 'network' | 'upstream' | 'contract' | 'rejected'; message: string }
export interface ConnectionState extends Connection {
  status: DataStatus;
  injection: { phase: 'unverified' | 'missing' | 'invalid' | 'present'; missing: ('KIS_APP_KEY' | 'KIS_APP_SECRET' | 'KIS_CANO' | 'KIS_ACNT_PRDT_CD')[] };
  authentication: { phase: 'unverified' | 'loading' | 'ready' | 'expired' | 'error'; lastSuccessAt: string | null; validUntil: string | null; retryAt: string | null; failure: ConnectionFailure | null };
  failure: ConnectionFailure | null;
}
export interface StateSnapshot extends State { instanceId: string; status: DataStatus; connection: ConnectionState }
export interface KisQuote { code: string; price: number; change: number; upper: number; lower: number; tickSize: number; stopped: boolean; receivedAt: string; volume?: number; sector?: string; liquidation?: boolean }
export interface KisBar { date: string; close: number }
export interface BrokerOrder { brokerId: string; date: string; code: string; name: string; side: 'buy' | 'sell'; qty: number; price: number; filled: number; remaining: number; cancelled: boolean; organization: string }
export interface PaperOrder { requestId: string; code: string; side: 'buy' | 'sell'; qty: number; price: number; createdAt: string; tradeDate: string; status: 'sending' | 'accepted' | 'unknown' | 'rejected' | 'partial' | 'filled' | 'cancelled'; brokerId?: string; organization?: string; filled: number; remaining: number; message: string }
export interface PaperEvidence { observedAt: string; tradeDate: string; orders: BrokerOrder[]; balance: { cash: number; totalEquity: number; positions: { code: string; qty: number }[] } }
export interface PaperAudit { id: string; requestId: string; at: string; actor: 'system' | 'local-user'; action: 'cancel-attempt' | 'cancel-response' | 'sending' | 'response' | 'reconcile' | 'restart' | 'recovery-inspect' | 'recovery-confirm'; before: PaperOrder['status'] | null; after: PaperOrder['status']; evidence?: PaperEvidence; recovery?: { evidenceId: string; brokerId: string; organization: string } }
export const won = (value: number) => Math.round(value).toLocaleString('ko-KR');
export const equity = (state: State) => state.cash + state.positions.reduce((total, p) => total + p.qty * (state.instruments.find(s => s.code === p.code)?.price ?? p.average), 0);
export const orderStatus = { pending: '접수 · 미체결', filled: '체결', cancelled: '취소' };
