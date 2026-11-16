import { createDecipheriv, createHash } from 'node:crypto';
import WebSocket from 'ws';
import { z } from 'zod';
import { Store } from './store.ts';
import { PaperBroker } from './paper.ts';
import { KisNotSent } from './kis.ts';
import { record, signal } from './engine.ts';
import type { RealtimeStatus } from '../shared/realtime.ts';
import { orderInput, type OrderInput } from '../shared/contracts.ts';

const URL = 'ws://ops.koreainvestment.com:31000';
const PRICE = 'H0STCNT0', NOTICE = 'H0STCNI9';
const sessionSchema = z.object({ date: z.iso.date(), open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/), verified: z.literal(true) }).strict();
export type RealtimeConfig = { approvalKey: string; htsId: string; session: z.infer<typeof sessionSchema> };
type Socket = Pick<WebSocket, 'on' | 'send' | 'pong' | 'terminate'>;
export type SocketFactory = (url: string) => Socket;
const socketFactory: SocketFactory = url => new WebSocket(url, { followRedirects: false, handshakeTimeout: 10000, maxPayload: 65536, perMessageDeflate: false });
const initial = (): RealtimeStatus => ({ phase: 'stopped', required: false, ordersAllowed: false, message: '실시간 미연결 · 자동 시작 없음', code: null, lastQuoteAt: null, lastNoticeAt: null, reconciledAt: null, price: null, fresh: false });

export class Realtime {
  private state = initial();
  private socket?: Socket;
  private generation = 0;
  private revision = 0;
  private reconciledRevision = -1;
  private acknowledgements = new Set<string>();
  private key?: Buffer;
  private iv?: Buffer;
  private seen = new Set<string>();
  private quoteTime = 0;
  private volume = -1;
  private stopped = false;
  private history: number[] = [];
  private consumed = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setInterval>;
  private attempts = 0;
  private lastFrame = 0;
  private required: boolean;
  constructor(private store: Store, private paper: PaperBroker, private config?: RealtimeConfig, private connect: SocketFactory = socketFactory, private now = Date.now) {
    this.required = store.realtimeRequired();
    paper.setRealtimeGuard(code => this.orderGuard(code));
  }
  private orderGuard(code: string) {
    const generation = this.generation, revision = this.revision, quoteTime = this.quoteTime;
    const check = () => {
      if (!this.required) return;
      this.assertReady(code);
      if (generation !== this.generation || revision !== this.revision || this.now() - quoteTime > 5000 || this.now() < quoteTime) throw new KisNotSent('주문 검증 중 실시간 상태가 바뀌었습니다. 다시 확인하세요.');
    };
    check(); return check;
  }
  static configuration(): RealtimeConfig | undefined {
    if (!process.env.KIS_WS_SESSION) return undefined;
    try { return { approvalKey: process.env.KIS_WS_APPROVAL_KEY ?? '', htsId: process.env.KIS_HTS_ID ?? '', session: sessionSchema.parse(JSON.parse(process.env.KIS_WS_SESSION)) }; }
    catch { return undefined; }
  }
  private sessionOpen() {
    if (!this.config) return false;
    const parsed = sessionSchema.safeParse(this.config.session);
    if (!parsed.success) return false;
    const { date, open, close } = parsed.data;
    const begin = Date.parse(`${date}T${open}:00+09:00`), end = Date.parse(`${date}T${close}:00+09:00`);
    const day = new Date(`${date}T12:00:00+09:00`).getUTCDay();
    return day !== 0 && day !== 6 && open >= '09:00' && close <= '15:30' && begin < end && this.now() >= begin && this.now() < end;
  }
  status(): RealtimeStatus {
    const age = this.now() - this.quoteTime;
    const fresh = !this.stopped && this.quoteTime > 0 && age >= 0 && age <= 5000 && this.sessionOpen();
    const ordersAllowed = this.state.phase === 'ready' && fresh && this.reconciledRevision === this.revision && !this.store.read().risk.halted;
    return { ...this.state, required: this.required, fresh, ordersAllowed, message: this.state.phase === 'ready' && !ordersAllowed ? '신규 주문 차단 · 시세 지연/장외 또는 긴급정지를 확인하세요.' : this.state.message };
  }
  private event(title: string, message: string, level: 'info' | 'warning' = 'warning') {
    this.store.update(state => record(state, title, message, level, { environment: 'kis-paper', target: 'paper' }));
  }
  private invalidate(message: string) {
    this.revision++; this.state.reconciledAt = null;
    this.state.phase = 'reconciling'; this.state.message = message;
  }
  start(code: string) {
    if (!/^\d{6}$/.test(code) || !this.config?.approvalKey.trim() || !this.config.htsId.trim() || !this.sessionOpen()) throw new Error('실시간 시작에는 서버 비밀주입과 당일 개장·거래시간 확인이 필요합니다.');
    if (this.socket) throw new Error('실시간 수신이 이미 시작되었습니다.');
    if (this.store.read().risk.halted) throw new Error('긴급정지 상태에서는 실시간 수신을 시작할 수 없습니다.');
    clearTimeout(this.retry); this.retry = undefined;
    this.store.requireRealtime(); this.required = true;
    this.state = { ...initial(), code }; this.attempts = 0; this.history = []; this.consumed = 0;
    this.open();
  }
  private open() {
    if (!this.sessionOpen() || this.store.read().risk.halted) { this.stop(); return; }
    const generation = ++this.generation;
    this.acknowledgements.clear(); this.key = undefined; this.iv = undefined;
    this.quoteTime = 0; this.volume = -1; this.stopped = false; this.history = []; this.seen.clear();
    this.invalidate('구독 확인과 REST 대조 전 신규 주문 차단'); this.state.phase = 'connecting';
    this.lastFrame = this.now();
    let socket: Socket;
    try { socket = this.connect(URL); this.socket = socket; }
    catch { this.failed(generation); return; }
    socket.on('open', () => {
      if (generation !== this.generation) return;
      try {
        for (const [tr_id, tr_key] of [[PRICE, this.state.code!], [NOTICE, this.config!.htsId]]) socket.send(JSON.stringify({ header: { approval_key: this.config!.approvalKey, custtype: 'P', tr_type: '1', 'content-type': 'utf-8' }, body: { input: { tr_id, tr_key } } }));
      } catch { this.failed(generation); }
    });
    socket.on('message', (data, binary) => {
      if (generation !== this.generation) return;
      try { if (binary) throw new Error(); this.receive(data.toString()); }
      catch { this.failed(generation, '실시간 응답 계약 오류 · REST 대조 필요'); }
    });
    socket.on('error', () => this.failed(generation));
    socket.on('close', () => this.failed(generation));
    this.watchdog = setInterval(() => {
      if (!this.sessionOpen() || this.store.read().risk.halted) this.stop();
      else if (this.now() - this.lastFrame > 45000 || this.now() < this.lastFrame) this.failed(generation, '실시간 수신 시간 초과 · REST 대조 필요');
    }, 1000);
    this.watchdog.unref();
    this.event('KIS 실시간 연결 시작', '구독 확인·REST 대조와 신선한 시세가 필요합니다.', 'info');
  }
  private detach() {
    ++this.generation;
    clearInterval(this.watchdog); clearTimeout(this.retry); this.watchdog = undefined; this.retry = undefined;
    const socket = this.socket; this.socket = undefined;
    socket?.terminate(); this.key = undefined; this.iv = undefined;
  }
  private failed(generation: number, message = '실시간 연결끊김 · REST 대조 필요') {
    if (generation !== this.generation) return;
    this.detach(); this.invalidate(message); this.state.phase = 'disconnected';
    this.event('KIS 실시간 수신 중단', message);
    if (this.attempts < 3 && this.sessionOpen() && !this.store.read().risk.halted) {
      this.retry = setTimeout(() => { this.retry = undefined; this.open(); }, 1000 * 2 ** this.attempts++);
      this.retry.unref();
    }
  }
  stop() {
    const wasStarted = Boolean(this.socket || this.retry);
    this.detach(); this.quoteTime = 0; this.invalidate('실시간 중단 · REST 대조 필요 · 자동 거래 재개 없음'); this.state.phase = 'stopped';
    if (wasStarted) this.event('KIS 실시간 수신 정지', this.state.message);
  }
  private receive(raw: string) {
    if (Buffer.byteLength(raw) > 65536) throw new Error();
    this.lastFrame = this.now();
    if (raw.startsWith('{')) {
      const message = JSON.parse(raw);
      const tr = message.header?.tr_id;
      if (tr === 'PINGPONG') { if (Buffer.byteLength(raw) > 125) throw new Error(); this.socket!.pong(raw); return; }
      if (String(message.body?.msg1 ?? '').startsWith('UNSUB') || ![PRICE, NOTICE].includes(tr) || message.body?.rt_cd !== '0' || message.header?.tr_key !== (tr === PRICE ? this.state.code : this.config!.htsId)) throw new Error();
      if (this.acknowledgements.has(tr)) throw new Error();
      if (tr === NOTICE) {
        const key = message.body.output?.key, iv = message.body.output?.iv;
        if (typeof key !== 'string' || typeof iv !== 'string' || Buffer.byteLength(key) !== 32 || Buffer.byteLength(iv) !== 16) throw new Error();
        this.key = Buffer.from(key); this.iv = Buffer.from(iv);
      }
      this.acknowledgements.add(tr);
      if (this.acknowledgements.size === 2) { this.invalidate('구독 확인 · REST 계좌·주문 대조 필요'); this.event('KIS 실시간 구독 확인', this.state.message, 'info'); }
      return;
    }
    const parts = raw.split('|');
    if (parts.length !== 4 || !/^\d{1,3}$/.test(parts[2])) throw new Error();
    const [encrypted, tr, countText, payload] = parts; const count = Number(countText);
    if (count < 1 || count > 100 || !this.acknowledgements.has(tr)) throw new Error();
    let plain = payload;
    if (tr === NOTICE && encrypted === '1' && this.key && this.iv) {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) throw new Error();
      const decipher = createDecipheriv('aes-256-cbc', this.key, this.iv);
      plain = Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]).toString('utf8');
    } else if (tr !== PRICE || encrypted !== '0') throw new Error();
    const width = tr === PRICE ? 47 : 26, fields = plain.split('^');
    if (fields.length !== count * width) throw new Error();
    for (let offset = 0; offset < fields.length; offset += width) {
      const row = fields.slice(offset, offset + width);
      if (tr === PRICE) this.quote(row);
      else {
        if (!/^\d{6}$/.test(row[8]) || !/^\d+$/.test(row[2]) || !['1', '2'].includes(row[13])) throw new Error();
        const fingerprint = createHash('sha256').update(row.join('^')).digest('hex');
        if (this.seen.has(fingerprint)) continue;
        if (this.seen.size >= 1000) this.seen.delete(this.seen.values().next().value!);
        this.seen.add(fingerprint); this.state.lastNoticeAt = new Date(this.now()).toISOString();
        this.invalidate('체결통보 수신 · 수량 확정은 REST 대조 필요');
        this.event('KIS 체결통보 수신', '접수·체결 통보를 수신했습니다. 원장 수량은 REST 대조로 확인하세요.', 'info');
      }
    }
  }
  private quote(row: string[]) {
    if (row[0] !== this.state.code || !/^\d{8}$/.test(row[33]) || !/^\d{6}$/.test(row[1]) || !/^\d+$/.test(row[2]) || !/^\d+$/.test(row[13])) throw new Error();
    const date = `${row[33].slice(0, 4)}-${row[33].slice(4, 6)}-${row[33].slice(6)}`;
    const time = Date.parse(`${date}T${row[1].slice(0, 2)}:${row[1].slice(2, 4)}:${row[1].slice(4)}+09:00`);
    const price = Number(row[2]), volume = Number(row[13]), age = this.now() - time;
    if (!Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(volume) || !Number.isFinite(time)) throw new Error();
    if (time < Date.parse(`${this.config!.session.date}T${this.config!.session.open}:00+09:00`)) return;
    if (!this.sessionOpen() || date !== this.config!.session.date || age < 0 || age > 5000 || time < this.quoteTime || volume < this.volume) return;
    if (row[35] === 'Y') { this.quoteTime = time; this.volume = volume; this.stopped = true; return; }
    if (volume === this.volume) return;
    this.stopped = false;
    this.quoteTime = time; this.volume = volume; this.state.price = price; this.state.lastQuoteAt = new Date(time).toISOString();
    this.history.push(price); this.history = this.history.slice(-500);
  }
  async reconcile() {
    if (this.acknowledgements.size !== 2 || !this.socket) throw new Error('실시간 구독 확인 후 대조하세요.');
    const generation = this.generation, revision = this.revision;
    this.state.phase = 'reconciling';
    try {
      const result = await this.paper.refresh(true);
      if (generation !== this.generation || revision !== this.revision || !this.socket || result.orders.some(o => ['unknown', 'sending'].includes(o.status))) throw new Error();
      this.reconciledRevision = revision; this.state.reconciledAt = new Date(this.now()).toISOString();
      this.state.phase = 'ready'; this.state.message = 'REST 대조 완료 · 신선한 시세에서만 주문 허용';
      this.event('KIS 실시간 REST 대조 완료', '대조를 확인했습니다. 전략은 자동 재개하지 않습니다.', 'info');
    } catch {
      if (generation === this.generation && revision === this.revision) this.invalidate('REST 대조 실패 또는 대조 중 통보 수신 · 다시 대조 필요');
      throw new Error('실시간 대조를 완료하지 못했습니다. 신규 주문 차단을 유지합니다.');
    }
  }
  private assertReady(code: string) {
    if (code !== this.state.code || !this.status().ordersAllowed) throw new KisNotSent('실시간 구독·시세·거래시간·REST 대조를 확인하기 전 신규 주문을 차단합니다.');
  }
  async submitSignal(input: Pick<OrderInput, 'requestId' | 'qty'> & { fast: number; slow: number }) {
    this.assertReady(this.state.code!);
    if (!Number.isInteger(input.fast) || !Number.isInteger(input.slow) || input.fast < 1 || input.slow <= input.fast || input.slow > 499) throw new Error('전략 기간을 확인하세요.');
    const validated = orderInput.pick({ requestId: true, qty: true }).parse({ requestId: input.requestId, qty: input.qty });
    if (this.volume <= this.consumed) return null;
    this.consumed = this.volume;
    const side = signal(this.history, input.fast, input.slow);
    if (side === 'hold') return null;
    return this.paper.submit(orderInput.parse({ ...validated, code: this.state.code!, price: this.state.price!, side }), this.orderGuard(this.state.code!));
  }
}
