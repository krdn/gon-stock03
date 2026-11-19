export interface RealtimeStatus {
  quoteSeconds?: number;
  phase: 'stopped' | 'connecting' | 'reconciling' | 'ready' | 'disconnected' | 'error';
  required: boolean;
  ordersAllowed: boolean;
  message: string;
  code: string | null;
  lastQuoteAt: string | null;
  lastNoticeAt: string | null;
  reconciledAt: string | null;
  price: number | null;
  fresh: boolean;
}
