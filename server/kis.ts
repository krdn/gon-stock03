import { z } from 'zod';
import type { ConnectionState, ConnectionFailure, KisQuote, KisBar, BrokerOrder } from '../shared/model.ts';
import type { OrderInput } from '../shared/contracts.ts';
import { authenticationStatus, disconnectedConnection, freshness, QUOTE_REFRESH_MS } from '../shared/status.ts';
import { dailyInput, marketDate, type DailyInput, type DailyPrice } from '../shared/market-data.ts';

const BASE = 'https://openapivts.koreainvestment.com:29443';
const amount = z.string().regex(/^\d+(\.\d+)?$/).transform(Number).refine(Number.isFinite);
const balanceSchema = z.object({
  rt_cd: z.literal('0'),
  output1: z.array(z.object({ pdno: z.string(), prdt_name: z.string(), hldg_qty: amount, pchs_avg_pric: amount, prpr: amount })),
  output2: z.array(z.object({ dnca_tot_amt: amount, tot_evlu_amt: amount })).min(1),
  ctx_area_fk100: z.string().optional(), ctx_area_nk100: z.string().optional(),
});
interface Credentials { key: string; secret: string; account: string; product: string }
class KisFailure extends Error { constructor(message: string, readonly kind: ConnectionFailure['kind']) { super(message); } }
export class KisRejected extends KisFailure { constructor(message: string, kind: ConnectionFailure['kind'] = 'rejected') { super(message, kind); } }
export class KisNotSent extends KisFailure { constructor(message: string, kind: ConnectionFailure['kind'] = 'rejected') { super(message, kind); } }
export class KisDataError extends Error { constructor(readonly kind: 'request' | 'contract', message: string) { super(message); } }
class KisAuthExpired extends KisRejected { constructor(message: string) { super(message, 'expired'); } }
const safeFailure = (error: unknown): ConnectionFailure => error instanceof KisFailure ? { kind: error.kind, message: error.message } : { kind: 'upstream', message: 'KIS 모의 요청을 완료하지 못했습니다. 잠시 후 다시 확인하세요.' };
export const koreaDate = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()).replaceAll('-', '');
export class KisClient {
  private token?: { value: string; until: number };
  private auth?: Promise<string>;
  private queue: Promise<unknown> = Promise.resolve();
  private lastCall = 0;
  private pending = 0;
  private nextAuthAt = 0;
  private authError?: Error;
  private balanceRequest?: Promise<ConnectionState>;
  private accountState = disconnectedConnection();
  private quotes = new Map<string, KisQuote>();
  private quoteRequests = new Map<string, Promise<KisQuote>>();
  constructor(private credentials: Credentials, private transport: typeof fetch = fetch, private spacing = 1100) {}
  static fromEnvironment() {
    return new KisClient({ key: process.env.KIS_APP_KEY ?? '', secret: process.env.KIS_APP_SECRET ?? '', account: process.env.KIS_CANO ?? '', product: process.env.KIS_ACNT_PRDT_CD ?? '' });
  }
  configured() { const c = this.credentials; return Boolean(c.key.trim() && c.secret.trim() && /^\d{8}$/.test(c.account) && /^\d{2}$/.test(c.product)); }
  private injection(): ConnectionState['injection'] {
    const c = this.credentials;
    const fields = { KIS_APP_KEY: c.key, KIS_APP_SECRET: c.secret, KIS_CANO: c.account, KIS_ACNT_PRDT_CD: c.product };
    const missing = (Object.keys(fields) as ConnectionState['injection']['missing']).filter(key => !fields[key].trim());
    return { phase: missing.length ? 'missing' : this.configured() ? 'present' : 'invalid', missing };
  }
  private async send(path: string, init: RequestInit, beforeSend?: () => void) {
    if (this.pending >= 30) throw new KisNotSent('KIS 요청 대기가 많습니다. 잠시 후 다시 확인하세요.', 'rate-limit');
    this.pending++;
    const job = this.queue.catch(() => {}).then(async () => {
      for (let wait = this.spacing - (Date.now() - this.lastCall); wait > 0; wait = this.spacing - (Date.now() - this.lastCall)) await new Promise(resolve => setTimeout(resolve, wait));
      const options: RequestInit = { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) };
      beforeSend?.();
      let response: Response;
      this.lastCall = Date.now();
      try { response = await this.transport(BASE + path, options); }
      catch { throw new KisFailure('KIS 모의 서버 통신 실패 또는 시간 초과입니다. 실전 서버로 대체하지 않습니다.', 'network'); }
      if (response.status === 401 && init.method !== 'POST') throw new KisAuthExpired('KIS 모의 인증이 만료되거나 거부되었습니다.');
      let data: unknown;
      try { data = await response.json(); }
      catch (error) {
        if (!(error instanceof SyntaxError)) throw new KisFailure('KIS 모의 응답 수신 실패 또는 시간 초과입니다.', 'network');
        if (response.ok) throw new KisFailure('KIS 응답 형식이 JSON이 아닙니다.', 'contract');
      }
      const body = data && typeof data === 'object' ? data : {};
      const code = 'msg_cd' in body ? body.msg_cd : 'error_code' in body ? body.error_code : undefined;
      const rateLimited = code === 'EGW00201' || code === 'EGW00133' || response.status === 429;
      const denied = ['EGW00103', 'EGW00105', 'EGW00121', 'EGW00122'].includes(typeof code === 'string' ? code : '') || response.status === 401 || response.status === 403;
      if (code === 'EGW00123' && init.method !== 'POST') throw new KisAuthExpired('KIS 모의 인증이 만료되었습니다 (EGW00123).');
      if (!response.ok) throw new KisFailure(`KIS 모의 API가 HTTP ${response.status}로 거부했습니다. ${rateLimited ? '호출 제한 후 잠시 기다려 다시 확인하세요.' : denied ? '모의 키·서비스 권한을 확인하세요.' : '서비스 상태를 확인하고 다시 조회하세요.'}`, rateLimited ? 'rate-limit' : denied ? 'permission' : 'upstream');
      if (('rt_cd' in body && body.rt_cd !== '0') || ((init.method !== 'POST' || path === '/oauth2/tokenP') && 'error_code' in body)) {
        if (code === 'EGW00123') throw new KisAuthExpired('KIS 모의 인증이 만료되었습니다 (EGW00123).');
        const safeCode = typeof code === 'string' && /^[A-Z0-9_-]{1,30}$/.test(code) && ![this.credentials.key, this.credentials.secret, this.credentials.account, this.token?.value].some(secret => secret && code.includes(secret)) ? code : 'UNKNOWN';
        throw new KisRejected(rateLimited ? 'KIS 모의 호출 한도를 초과했습니다. 잠시 후 다시 확인하세요.' : denied ? 'KIS 모의 인증·권한이 거부되었습니다. 모의 계좌·키·서비스 신청을 확인하세요.' : `KIS 모의 요청 거부 (${safeCode}). 모의 계좌·키·이용 가능 시간을 확인하세요.`, rateLimited ? 'rate-limit' : denied ? 'permission' : 'rejected');
      }
      return { response, data };
    });
    this.queue = job;
    try { return await job; } finally { this.pending--; }
  }
  private async request(path: string, tr: string, params: Record<string, string>, post = false, continuation = '', beforeSend?: () => void) {
    let token: string;
    try { token = await this.accessToken(); }
    catch (error) { if (post) throw new KisNotSent('인증을 완료하지 못해 주문을 보내지 않았습니다.'); throw error; }
    const send = (value: string) => this.send(path + (post ? '' : '?' + new URLSearchParams(params)), {
      method: post ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${value}`, appkey: this.credentials.key, appsecret: this.credentials.secret, tr_id: tr, tr_cont: continuation, custtype: 'P' },
      ...(post ? { body: JSON.stringify(params) } : {}),
    }, beforeSend);
    try { return await send(token); }
    catch (error) {
      if (!(error instanceof KisAuthExpired) || post) throw error;
      if (this.token?.value === token) {
        this.token = undefined; this.authError = error;
        this.accountState.authentication = { ...this.accountState.authentication, phase: 'expired', failure: safeFailure(error) };
      }
      const renewed = await this.accessToken();
      try { return await send(renewed); }
      catch (retryError) { if (retryError instanceof KisAuthExpired && this.token?.value === renewed) { this.token = undefined; this.authError = retryError; this.accountState.authentication = { ...this.accountState.authentication, phase: 'expired', failure: safeFailure(retryError) }; } throw retryError; }
    }
  }
  private accountParams() { return { CANO: this.credentials.account, ACNT_PRDT_CD: this.credentials.product }; }
  async quote(code: string, fresh = false): Promise<KisQuote> {
    const cached = this.quotes.get(code);
    if (!fresh && cached && Date.now() - Date.parse(cached.receivedAt) < QUOTE_REFRESH_MS) return cached;
    const pending = this.quoteRequests.get(code);
    if (!fresh && pending) return pending;
    const request = this.loadQuote(code);
    if (!fresh) this.quoteRequests.set(code, request);
    try {
      const quote = await request;
      if (this.quotes.size >= 100) this.quotes.delete(this.quotes.keys().next().value!);
      this.quotes.set(code, quote); return quote;
    } finally { if (!fresh) this.quoteRequests.delete(code); }
  }
  private async loadQuote(code: string): Promise<KisQuote> {
    const { data } = await this.request('/uapi/domestic-stock/v1/quotations/inquire-price', 'FHKST01010100', { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code });
    const parsed = z.object({ output: z.object({ stck_prpr: amount, prdy_ctrt: z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number), stck_mxpr: amount, stck_llam: amount, aspr_unit: amount, temp_stop_yn: z.string() }) }).safeParse(data);
    if (!parsed.success || parsed.data.output.stck_prpr <= 0) throw new Error('KIS 현재가 응답을 확인할 수 없습니다.');
    const q = parsed.data.output;
    return { code, price: q.stck_prpr, change: q.prdy_ctrt, upper: q.stck_mxpr, lower: q.stck_llam, tickSize: q.aspr_unit, stopped: q.temp_stop_yn === 'Y', receivedAt: new Date().toISOString() };
  }
  async bars(code: string): Promise<KisBar[]> {
    const start = new Date(); start.setUTCDate(start.getUTCDate() - 180);
    const { data } = await this.request('/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice', 'FHKST03010100', { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code, FID_INPUT_DATE_1: start.toISOString().slice(0, 10).replaceAll('-', ''), FID_INPUT_DATE_2: koreaDate(), FID_PERIOD_DIV_CODE: 'D', FID_ORG_ADJ_PRC: '0' });
    const parsed = z.object({ output2: z.array(z.object({ stck_bsop_date: z.string(), stck_clpr: z.string() })) }).safeParse(data);
    if (!parsed.success) throw new Error('KIS 일봉 응답 계약이 일치하지 않습니다.');
    const rows = parsed.data.output2.filter(r => /^\d{8}$/.test(r.stck_bsop_date) && /^\d+(\.\d+)?$/.test(r.stck_clpr) && Number(r.stck_clpr) > 0).map(r => ({ date: r.stck_bsop_date, close: Number(r.stck_clpr) })).sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length < 2 || new Set(rows.map(r => r.date)).size !== rows.length) throw new Error('KIS 일봉이 부족하거나 중복되었습니다.');
    return rows;
  }
  async dailyPage(input: DailyInput, from: string, to: string): Promise<DailyPrice[]> {
    dailyInput.strip().parse(input); marketDate.parse(from); marketDate.parse(to);
    if (from < input.from || to > input.to || from > to) throw new Error('일봉 요청 기간이 올바르지 않습니다.');
    const { data } = await this.request('/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice', 'FHKST03010100', {
      FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: input.code, FID_INPUT_DATE_1: from, FID_INPUT_DATE_2: to,
      FID_PERIOD_DIV_CODE: 'D', FID_ORG_ADJ_PRC: input.adjustment === 'adjusted' ? '0' : '1',
    }).catch(error => { throw new KisDataError('request', error instanceof Error ? error.message : 'KIS 일봉 요청에 실패했습니다.'); });
    const parsed = z.object({ rt_cd: z.literal('0'), output2: z.array(z.object({
      stck_bsop_date: z.string(), stck_oprc: z.string(), stck_hgpr: z.string(), stck_lwpr: z.string(), stck_clpr: z.string(), acml_vol: z.string(),
    })).max(100) }).safeParse(data);
    if (!parsed.success) throw new KisDataError('contract', 'KIS 일봉 응답 계약이 일치하지 않습니다.');
    return parsed.data.output2.filter(row => !Object.values(row).every(value => value === '')).map(row => {
      const date = marketDate.safeParse(row.stck_bsop_date);
      const values = [row.stck_oprc, row.stck_hgpr, row.stck_lwpr, row.stck_clpr, row.acml_vol];
      if (!date.success || date.data < from || date.data > to || !values.every(value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)))) throw new KisDataError('contract', 'KIS 일봉 날짜·가격·거래량 또는 기간 경계가 올바르지 않습니다.');
      const [open, high, low, close, volume] = values.map(Number);
      const suspended = open === 0 && high === 0 && low === 0 && volume === 0;
      if (close <= 0 || (!suspended && (open <= 0 || low <= 0 || high <= 0 || low > Math.min(open, close) || high < Math.max(open, close) || low > high))) throw new KisDataError('contract', 'KIS 일봉 가격 또는 고가·저가 관계가 올바르지 않습니다.');
      return { date: date.data, open, high, low, close, volume };
    });
  }
  async buyingPower(code: string, price: number) {
    const { data } = await this.request('/uapi/domestic-stock/v1/trading/inquire-psbl-order', 'VTTC8908R', { ...this.accountParams(), PDNO: code, ORD_UNPR: String(price), ORD_DVSN: '00', CMA_EVLU_AMT_ICLD_YN: 'N', OVRS_ICLD_YN: 'N' });
    const parsed = z.object({ output: z.object({ nrcvb_buy_qty: amount, ord_psbl_cash: amount }) }).safeParse(data);
    if (!parsed.success) throw new Error('KIS 미수 없는 주문 가능 수량을 확인하지 못했습니다.');
    return { qty: parsed.data.output.nrcvb_buy_qty, cash: parsed.data.output.ord_psbl_cash };
  }
  async dailyOrders(date = koreaDate()): Promise<BrokerOrder[]> {
    let fk = '', nk = ''; const seen = new Set<string>(); const rows: BrokerOrder[] = [];
    for (let page = 0; page < 50; page++) {
      const { response, data } = await this.request('/uapi/domestic-stock/v1/trading/inquire-daily-ccld', 'VTTC0081R', { ...this.accountParams(), INQR_STRT_DT: date, INQR_END_DT: date, SLL_BUY_DVSN_CD: '00', PDNO: '', CCLD_DVSN: '00', INQR_DVSN: '00', INQR_DVSN_3: '00', ORD_GNO_BRNO: '', ODNO: '', INQR_DVSN_1: '', CTX_AREA_FK100: fk, CTX_AREA_NK100: nk, EXCG_ID_DVSN_CD: 'KRX' }, false, page ? 'N' : '');
      const parsed = z.object({ output1: z.array(z.object({ odno: z.string(), ord_dt: z.string(), pdno: z.string(), prdt_name: z.string(), sll_buy_dvsn_cd: z.enum(['01', '02']), ord_qty: amount, ord_unpr: amount, tot_ccld_qty: amount, rmn_qty: amount, cncl_yn: z.string(), ord_gno_brno: z.string() })), ctx_area_fk100: z.string().optional(), ctx_area_nk100: z.string().optional() }).safeParse(data);
      if (!parsed.success) throw new Error('KIS 주문 조회 응답 계약이 일치하지 않습니다.');
      rows.push(...parsed.data.output1.map(o => ({ brokerId: o.odno, date: o.ord_dt, code: o.pdno, name: o.prdt_name, side: (o.sll_buy_dvsn_cd === '02' ? 'buy' : 'sell') as 'buy' | 'sell', qty: o.ord_qty, price: o.ord_unpr, filled: o.tot_ccld_qty, remaining: o.rmn_qty, cancelled: o.cncl_yn === 'Y', organization: o.ord_gno_brno })));
      if (!['M', 'F'].includes(response.headers.get('tr_cont') ?? '')) return rows;
      fk = parsed.data.ctx_area_fk100?.trim() ?? ''; nk = parsed.data.ctx_area_nk100?.trim() ?? '';
      const cursor = `${fk}|${nk}`;
      if ((!fk && !nk) || seen.has(cursor)) throw new Error('KIS 주문 연속조회 키가 누락되거나 반복되었습니다.');
      seen.add(cursor);
    }
    throw new Error('KIS 주문 전체 조회를 마치지 못했습니다.');
  }
  async submit(input: OrderInput, beforeSend?: () => void) {
    const { data } = await this.request('/uapi/domestic-stock/v1/trading/order-cash', input.side === 'buy' ? 'VTTC0012U' : 'VTTC0011U', { ...this.accountParams(), PDNO: input.code, ORD_DVSN: '00', ORD_QTY: String(input.qty), ORD_UNPR: String(input.price), EXCG_ID_DVSN_CD: 'KRX', SLL_TYPE: input.side === 'sell' ? '01' : '', CNDT_PRIC: '' }, true, '', beforeSend);
    const parsed = z.object({ output: z.object({ ODNO: z.string().min(1), KRX_FWDG_ORD_ORGNO: z.string().min(1) }) }).safeParse(data);
    if (!parsed.success) throw new Error('주문 응답을 확정할 수 없습니다. 자동 재전송하지 않습니다.');
    return { brokerId: parsed.data.output.ODNO, organization: parsed.data.output.KRX_FWDG_ORD_ORGNO };
  }
  private async accessToken(): Promise<string> {
    if (!this.configured()) throw new KisFailure('KIS 모의 환경변수가 없거나 계좌 형식이 올바르지 않습니다. Infisical 주입을 확인하세요.', this.injection().phase === 'missing' ? 'missing' : 'invalid');
    if (this.token && this.token.until > Date.now()) return this.token.value;
    if (this.auth) return this.auth;
    if (Date.now() < this.nextAuthAt) throw this.authError ?? new KisFailure('KIS 인증 갱신 대기 중입니다. 1분 후 다시 확인하세요.', 'rate-limit');
    this.accountState.authentication = { ...this.accountState.authentication, phase: 'loading', failure: null };
    this.auth = (async () => {
      const { data } = await this.send('/oauth2/tokenP', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grant_type: 'client_credentials', appkey: this.credentials.key, appsecret: this.credentials.secret }) }, () => { this.nextAuthAt = Date.now() + 60_000; });
      const parsed = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() }).safeParse(data);
      if (!parsed.success) throw new KisFailure('KIS 모의 토큰 발급 응답 계약을 확인할 수 없습니다.', 'contract');
      const validUntil = new Date(Date.now() + Math.max(0, parsed.data.expires_in - 60) * 1000);
      if (!Number.isFinite(validUntil.getTime())) throw new KisFailure('KIS 모의 토큰 유효기간을 확인할 수 없습니다.', 'contract');
      this.token = { value: parsed.data.access_token, until: validUntil.getTime() };
      this.accountState.authentication = { phase: 'ready', lastSuccessAt: new Date().toISOString(), validUntil: validUntil.toISOString(), failure: null, retryAt: null };
      this.authError = undefined;
      return this.token.value;
    })();
    try { return await this.auth; }
    catch (error) {
      const failure = safeFailure(error);
      this.authError = new KisFailure(failure.message, failure.kind);
      this.accountState.authentication = { ...this.accountState.authentication, phase: failure.kind === 'expired' ? 'expired' : 'error', failure };
      throw this.authError;
    }
    finally { this.auth = undefined; }
  }
  connection(): ConnectionState {
    const status = freshness(this.accountState.status);
    let authentication = authenticationStatus(this.accountState.authentication);
    authentication = { ...authentication, retryAt: authentication.phase !== 'ready' && Date.now() < this.nextAuthAt ? new Date(this.nextAuthAt).toISOString() : null };
    return structuredClone({ ...this.accountState, configured: this.configured(), injection: this.injection(), authentication, status, connected: status.phase === 'ready' });
  }
  async balance(fresh = false): Promise<ConnectionState> {
    if (fresh) while (this.balanceRequest) await this.balanceRequest.catch(() => {});
    if (this.balanceRequest) return this.balanceRequest;
    this.accountState.status = { ...this.accountState.status, phase: 'loading', complete: false, error: null, pages: 0 };
    this.accountState.failure = null;
    this.balanceRequest = this.loadBalance();
    try { return await this.balanceRequest; }
    catch (error) {
      const failure = safeFailure(error); const message = failure.message;
      const previous = this.accountState.status;
      this.accountState = { ...this.accountState, connected: false, message, failure, status: { ...previous, phase: previous.pages > 0 ? 'partial' : this.configured() ? 'error' : 'disconnected', complete: false, observedAt: new Date().toISOString(), error: message } };
      throw error instanceof KisFailure ? error : new KisFailure(message, failure.kind);
    } finally { this.balanceRequest = undefined; }
  }
  private async loadBalance(): Promise<ConnectionState> {
    const positions: NonNullable<ConnectionState['balance']>['positions'] = [];
    let fk = '', nk = '', cash = 0, totalEquity = 0; const seen = new Set<string>();
    for (let page = 0; page < 50; page++) {
      const params = { ...this.accountParams(), AFHR_FLPR_YN: 'N', OFL_YN: '', INQR_DVSN: '02', UNPR_DVSN: '01', FUND_STTL_ICLD_YN: 'N', FNCG_AMT_AUTO_RDPT_YN: 'N', PRCS_DVSN: '00', CTX_AREA_FK100: fk, CTX_AREA_NK100: nk };
      const { response, data } = await this.request('/uapi/domestic-stock/v1/trading/inquire-balance', 'VTTC8434R', params, false, page ? 'N' : '');
      const parsed = balanceSchema.safeParse(data);
      if (!parsed.success) throw new KisFailure('KIS 모의 잔고 응답 계약이 일치하지 않습니다. 불완전 잔고는 표시하지 않습니다.', 'contract');
      this.accountState.status = { ...this.accountState.status, observedAt: new Date().toISOString(), pages: page + 1 };
      if (page > 0 && (cash !== parsed.data.output2[0].dnca_tot_amt || totalEquity !== parsed.data.output2[0].tot_evlu_amt)) throw new KisFailure('KIS 잔고 페이지 사이에 계좌 합계가 바뀌었습니다. 다시 조회하세요.', 'contract');
      cash = parsed.data.output2[0].dnca_tot_amt;
      totalEquity = parsed.data.output2[0].tot_evlu_amt;
      positions.push(...parsed.data.output1.filter(p => p.hldg_qty > 0).map(p => ({ code: p.pdno, name: p.prdt_name, qty: p.hldg_qty, average: p.pchs_avg_pric, price: p.prpr })));
      if (new Set(positions.map(p => p.code)).size !== positions.length) throw new KisFailure('KIS 잔고 페이지에 중복 종목이 있어 전체 잔고를 확정할 수 없습니다.', 'contract');
      if (!['M', 'F'].includes(response.headers.get('tr_cont') ?? '')) {
        const now = new Date().toISOString();
        this.accountState = { ...this.accountState, configured: true, mode: 'paper', connected: true, checkedAt: now, failure: null, message: 'KIS 모의 인증과 전체 잔고 조회 응답을 확인했습니다. 주문 검증은 별도입니다.', balance: { cash, totalEquity, positions }, status: { ...this.accountState.status, phase: 'ready', complete: true, observedAt: now, lastSuccessAt: now, error: null } };
        return this.connection();
      }
      fk = parsed.data.ctx_area_fk100?.trim() ?? ''; nk = parsed.data.ctx_area_nk100?.trim() ?? '';
      const cursor = `${fk}|${nk}`;
      if ((!fk && !nk) || seen.has(cursor)) throw new KisFailure('KIS 잔고 연속조회 키가 누락되거나 반복되었습니다.', 'contract');
      seen.add(cursor);
    }
    throw new KisFailure('KIS 잔고 전체 페이지 조회를 마치지 못했습니다.', 'contract');
  }
}
