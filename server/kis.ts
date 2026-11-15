import { z } from 'zod';
import type { Connection, KisQuote, KisBar, BrokerOrder } from '../shared/model.ts';
import type { OrderInput } from '../shared/contracts.ts';

const BASE = 'https://openapivts.koreainvestment.com:29443';
const amount = z.string().regex(/^\d+(\.\d+)?$/).transform(Number).refine(Number.isFinite);
const balanceSchema = z.object({
  rt_cd: z.literal('0'),
  output1: z.array(z.object({ pdno: z.string(), prdt_name: z.string(), hldg_qty: amount, pchs_avg_pric: amount, prpr: amount })),
  output2: z.array(z.object({ dnca_tot_amt: amount, tot_evlu_amt: amount })).min(1),
  ctx_area_fk100: z.string().optional(), ctx_area_nk100: z.string().optional(),
});
interface Credentials { key: string; secret: string; account: string; product: string }
export class KisRejected extends Error {}
export class KisNotSent extends Error {}
export const koreaDate = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()).replaceAll('-', '');
export class KisClient {
  private token?: { value: string; until: number };
  private auth?: Promise<string>;
  private queue: Promise<unknown> = Promise.resolve();
  private lastCall = 0;
  constructor(private credentials: Credentials, private transport: typeof fetch = fetch, private spacing = 1100) {}
  static fromEnvironment() {
    return new KisClient({ key: process.env.KIS_APP_KEY ?? '', secret: process.env.KIS_APP_SECRET ?? '', account: process.env.KIS_CANO ?? '', product: process.env.KIS_ACNT_PRDT_CD ?? '' });
  }
  configured() { const c = this.credentials; return Boolean(c.key && c.secret && /^\d{8}$/.test(c.account) && /^\d{2}$/.test(c.product)); }
  private async send(path: string, init: RequestInit, beforeSend?: () => void) {
    const job = this.queue.catch(() => {}).then(async () => {
      const wait = this.spacing - (Date.now() - this.lastCall);
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      this.lastCall = Date.now();
      beforeSend?.();
      let response: Response;
      try { response = await this.transport(BASE + path, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) }); }
      catch { throw new Error('KIS 모의 서버 통신 실패 또는 시간 초과입니다. 실전 서버로 대체하지 않습니다.'); }
      if (!response.ok) throw new Error(`KIS 모의 API가 HTTP ${response.status}로 거부했습니다. 모의 키·서비스 신청 상태를 확인하세요.`);
      let data: unknown; try { data = await response.json(); } catch { throw new Error('KIS 응답 형식이 JSON이 아닙니다.'); }
      if (data && typeof data === 'object' && 'rt_cd' in data && data.rt_cd !== '0') {
        const code = 'msg_cd' in data && typeof data.msg_cd === 'string' && /^[A-Z0-9_-]{1,30}$/.test(data.msg_cd) ? data.msg_cd : 'UNKNOWN';
        throw new KisRejected(`KIS 모의 요청 거부 (${code}). 모의 계좌·키·이용 가능 시간을 확인하세요.`);
      }
      return { response, data };
    });
    this.queue = job; return job;
  }
  private async request(path: string, tr: string, params: Record<string, string>, post = false, continuation = '', beforeSend?: () => void) {
    let token: string;
    try { token = await this.accessToken(); }
    catch (error) { if (post) throw new KisNotSent('인증을 완료하지 못해 주문을 보내지 않았습니다.'); throw error; }
    return this.send(path + (post ? '' : '?' + new URLSearchParams(params)), {
      method: post ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}`, appkey: this.credentials.key, appsecret: this.credentials.secret, tr_id: tr, tr_cont: continuation, custtype: 'P' },
      ...(post ? { body: JSON.stringify(params) } : {}),
    }, beforeSend);
  }
  private accountParams() { return { CANO: this.credentials.account, ACNT_PRDT_CD: this.credentials.product }; }
  async quote(code: string): Promise<KisQuote> {
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
    if (!this.configured()) throw new Error('KIS 모의 환경변수가 없거나 계좌 형식이 올바르지 않습니다. Infisical 주입을 확인하세요.');
    if (this.token && this.token.until > Date.now()) return this.token.value;
    if (this.auth) return this.auth;
    this.auth = (async () => {
      const { data } = await this.send('/oauth2/tokenP', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grant_type: 'client_credentials', appkey: this.credentials.key, appsecret: this.credentials.secret }) });
      const parsed = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() }).safeParse(data);
      if (!parsed.success) throw new Error('KIS 모의 토큰 발급이 거부되었습니다. 모의 전용 키인지 확인하세요.');
      this.token = { value: parsed.data.access_token, until: Date.now() + Math.max(0, parsed.data.expires_in - 60) * 1000 };
      return this.token.value;
    })();
    try { return await this.auth; } finally { this.auth = undefined; }
  }
  async balance(): Promise<Connection> {
    const token = await this.accessToken(); const positions: NonNullable<Connection['balance']>['positions'] = [];
    let fk = '', nk = '', cash = 0, totalEquity = 0; const seen = new Set<string>();
    for (let page = 0; page < 50; page++) {
      const params = new URLSearchParams({ CANO: this.credentials.account, ACNT_PRDT_CD: this.credentials.product, AFHR_FLPR_YN: 'N', OFL_YN: '', INQR_DVSN: '02', UNPR_DVSN: '01', FUND_STTL_ICLD_YN: 'N', FNCG_AMT_AUTO_RDPT_YN: 'N', PRCS_DVSN: '00', CTX_AREA_FK100: fk, CTX_AREA_NK100: nk });
      const { response, data } = await this.send('/uapi/domestic-stock/v1/trading/inquire-balance?' + params, { headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}`, appkey: this.credentials.key, appsecret: this.credentials.secret, tr_id: 'VTTC8434R', tr_cont: page ? 'N' : '', custtype: 'P' } });
      const parsed = balanceSchema.safeParse(data);
      if (!parsed.success) throw new Error('KIS 모의 잔고 응답 계약이 일치하지 않습니다. 불완전 잔고는 표시하지 않습니다.');
      cash = parsed.data.output2[0].dnca_tot_amt;
      totalEquity = parsed.data.output2[0].tot_evlu_amt;
      positions.push(...parsed.data.output1.filter(p => p.hldg_qty > 0).map(p => ({ code: p.pdno, name: p.prdt_name, qty: p.hldg_qty, average: p.pchs_avg_pric, price: p.prpr })));
      if (!['M', 'F'].includes(response.headers.get('tr_cont') ?? '')) {
        return { configured: true, mode: 'paper', connected: true, checkedAt: new Date().toISOString(), message: 'KIS 모의 인증과 전체 잔고 조회 응답을 확인했습니다. 주문 검증은 별도입니다.', balance: { cash, totalEquity, positions } };
      }
      fk = parsed.data.ctx_area_fk100?.trim() ?? ''; nk = parsed.data.ctx_area_nk100?.trim() ?? '';
      const cursor = `${fk}|${nk}`;
      if ((!fk && !nk) || seen.has(cursor)) throw new Error('KIS 잔고 연속조회 키가 누락되거나 반복되었습니다.');
      seen.add(cursor);
    }
    throw new Error('KIS 잔고 전체 페이지 조회를 마치지 못했습니다.');
  }
}
