import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { backtestInput, codeSchema, haltInput, idInput, journalInput, orderInput, paperRecoveryInput, riskInput, storageErrorMessage, strategyInput } from '../shared/contracts.ts';
import { advanceTick, backtest, cancelOrder, halt, placeOrder, record } from './engine.ts';
import { KisClient } from './kis.ts';
import { Store } from './store.ts';
import { PaperBroker, paperCapabilities, type PaperApproval } from './paper.ts';
import type { StateSnapshot } from '../shared/model.ts';
import { emptyStatus } from '../shared/status.ts';
import { createExperiment, replayExperiment } from './backtest.ts';
import { MarketData } from './market-data.ts';
import { marketQuoteInput, masterCodeSchema } from '../shared/market-data.ts';

async function body(req: IncomingMessage, limit = 16384) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('입력 크기 제한을 초과했습니다.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown; } catch { throw new Error('올바른 JSON 입력이 필요합니다.'); }
}
function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data));
}
export function makeServer(store: Store, kis = KisClient.fromEnvironment(), ports = [4303, 4304], approval?: PaperApproval) {
  const paper = new PaperBroker(store, kis, approval);
  const market = new MarketData(store, kis);
  const instanceId = randomUUID();
  const origins = new Set(ports.flatMap(port => [`http://127.0.0.1:${port}`, `http://localhost:${port}`]));
  const hosts = new Set([...origins].map(origin => new URL(origin).host));
  return createServer(async (req, res) => {
    if (!hosts.has(req.headers.host ?? '') || (req.headers.origin && !origins.has(req.headers.origin)) || req.headers['sec-fetch-site'] === 'cross-site') { json(res, 403, { error: '로컬 워크스페이스에서만 접근할 수 있습니다.' }); return; }
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    try {
      if (path === '/api/state' && req.method === 'GET') {
        const now = new Date().toISOString();
        const snapshot: StateSnapshot = { ...store.read(), instanceId, status: { ...emptyStatus('demo'), phase: 'ready', complete: true, observedAt: now, lastSuccessAt: now }, connection: kis.connection(), paperRisk: paper.riskSnapshot() };
        json(res, 200, snapshot); return;
      }
      if (path === '/api/kis/ledger' && req.method === 'GET') { json(res, 200, { orders: store.paperOrders(), minimumRun: paper.approvalStatus() }); return; }
      if (path === '/api/kis/capabilities' && req.method === 'GET') { json(res, 200, paperCapabilities); return; }
      if (path === '/api/kis/audit' && req.method === 'GET') {
        const id = idInput.parse({ id: new URL(req.url!, 'http://127.0.0.1').searchParams.get('requestId') }).id;
        json(res, 200, { audit: store.paperAudit(id) }); return;
      }
      if (path === '/api/data/master' && req.method === 'GET') { json(res, 200, store.masterData()); return; }
      if (path === '/api/data/daily' && req.method === 'GET') { json(res, 200, { runs: store.dailyRuns() }); return; }
      if (path.startsWith('/api/data/daily/') && req.method === 'GET') {
        const id = idInput.parse({ id: path.slice('/api/data/daily/'.length) }).id;
        const run = store.dailyRun(id); json(res, run ? 200 : 404, run ? { run, bars: store.dailyBars(id) } : { error: '수집 ID를 찾지 못했습니다.' }); return;
      }
      if (path === '/api/backtest/experiments' && req.method === 'GET') { json(res, 200, { experiments: store.experiments() }); return; }
      if (path.startsWith('/api/backtest/experiments/') && req.method === 'GET') {
        const experiment = store.experiment(idInput.parse({ id: path.slice('/api/backtest/experiments/'.length) }).id);
        json(res, experiment ? 200 : 404, experiment ? { experiment } : { error: '저장 실험을 찾지 못했습니다.' }); return;
      }
      if (path.startsWith('/api/')) {
        if (req.method !== 'POST') { json(res, 405, { error: '허용하지 않는 요청 방식입니다.' }); return; }
        if (req.headers['x-workbench'] !== 'local' || !req.headers['content-type']?.startsWith('application/json')) { json(res, 403, { error: '워크스페이스 요청 검증에 실패했습니다.' }); return; }
        const input = await body(req, path === '/api/data/daily' ? 65536 : 16384);
        if (path === '/api/data/master/refresh') { json(res, 200, await market.refreshMaster()); return; }
        if (path === '/api/data/daily') { json(res, 200, { run: market.start(input) }); return; }
        if (path === '/api/data/daily/step') { json(res, 200, { run: await market.step(idInput.parse(input).id) }); return; }
        if (path === '/api/market/quote') {
          const { code } = marketQuoteInput.parse(input);
          if (!store.masterData().instruments.some(row => row.code === code)) throw new Error('현재 마스터에 없는 종목입니다. 상장폐지·거래 가능 여부를 확인하세요.');
          json(res, 200, { quote: await kis.quote(code) }); return;
        }
        if (path === '/api/kis/check') { const connection = await kis.balance(); json(res, 200, { connection, message: 'KIS 모의 잔고 조회를 확인했습니다.' }); return; }
        if (path === '/api/kis/market') {
          const code = codeSchema.parse((input as { code?: unknown })?.code);
          const quote = await kis.quote(code); const bars = await kis.bars(code);
          json(res, 200, { quote, bars, message: 'KIS 현재가와 최근 일봉을 조회했습니다. 수신 시각과 거래일을 구분하세요.' }); return;
        }
        if (path === '/api/kis/orders') { json(res, 200, { ...await paper.refresh(), message: 'KIS 모의 계좌와 당일 주문을 조회했습니다.' }); return; }
        if (path === '/api/kis/cancel-probe') {
          const { id } = idInput.parse(input);
          if (!paper.cancelProbeEnabled()) { json(res, 409, { error: '전량취소 검증 승인이 없습니다.' }); return; }
          const order = await paper.cancelProbe(id); json(res, 200, { order, warning: true }); return;
        }
        if (path === '/api/kis/cancel' || path === '/api/kis/revise') { idInput.parse(input); json(res, 409, { error: paperCapabilities.changeOrders.reason, code: 'vts-change-blocked' }); return; }
        if (path === '/api/kis/recovery/inspect') { json(res, 200, await paper.inspectRecovery(idInput.parse(input).id)); return; }
        if (path === '/api/kis/recovery/confirm') {
          const order = await paper.confirmRecovery(paperRecoveryInput.parse(input)); json(res, 200, { order, message: order.message }); return;
        }
        if (path === '/api/kis/order') {
          const order = await paper.submit(orderInput.parse(input)); json(res, 200, { order, message: order.message, warning: order.status === 'unknown' || order.status === 'rejected' }); return;
        }
        if (path === '/api/backtest/daily') { json(res, 200, { experiment: createExperiment(store, input), message: '저장 일봉의 입력과 결과를 보존했습니다.' }); return; }
        if (path === '/api/backtest/replay') { const replay = replayExperiment(store, idInput.parse(input).id); json(res, 200, { ...replay, message: replay.matches ? '고정 입력 재현 결과가 일치합니다.' : '재현 불일치: 엔진·저장 결과를 점검하세요.', warning: !replay.matches }); return; }
        if (path === '/api/backtest') {
          const config = backtestInput.parse(input); const instrument = store.read().instruments.find(s => s.code === config.code);
          if (!instrument) throw new Error('지원하지 않는 종목입니다.');
          json(res, 200, { result: backtest(instrument.history, config), message: '합성 데이터 백테스트를 계산했습니다.' }); return;
        }
        const result = store.update(state => {
          switch (path) {
            case '/api/orders': return { order: placeOrder(state, orderInput.parse(input)), message: '데모 주문을 접수했습니다. 체결은 다음 봉에서 평가합니다.' };
            case '/api/orders/cancel': cancelOrder(state, idInput.parse(input).id); return { message: '미체결 주문을 취소했습니다.' };
            case '/api/tick': advanceTick(state); return { message: `데모 봉 #${state.tick}에서 체결과 전략 신호를 평가했습니다.` };
            case '/api/playback': {
              if (state.risk.halted && !state.playing) throw new Error('신규 주문 정지 상태입니다.');
              state.playing = !state.playing; record(state, state.playing ? '자동 데모 재생 시작' : '자동 데모 재생 정지', '3초마다 합성 봉을 생성합니다. KIS 주문을 실행하지 않습니다.'); return {};
            }
            case '/api/watchlist': {
              const code = masterCodeSchema.parse((input as { code?: unknown })?.code);
              if (!state.watchlist.includes(code) && !state.instruments.some(s => s.code === code) && !store.masterData().instruments.some(s => s.code === code)) throw new Error('지원하지 않는 종목입니다.');
              state.watchlist = state.watchlist.includes(code) ? state.watchlist.filter(s => s !== code) : [...state.watchlist, code]; return {};
            }
            case '/api/strategies': {
              const strategy = strategyInput.parse(input);
              if (!state.instruments.some(s => s.code === strategy.code)) throw new Error('지원하지 않는 종목입니다.');
              if (state.strategies.length >= 30) throw new Error('전략은 최대 30개까지 저장할 수 있습니다.');
              state.strategies.push({ ...strategy, id: randomUUID(), active: false, lastSignal: 'hold', lastTick: -1 });
              record(state, '전략 저장', strategy.name); return {};
            }
            case '/api/strategies/toggle': {
              const strategy = state.strategies.find(s => s.id === idInput.parse(input).id);
              if (!strategy) throw new Error('전략을 찾지 못했습니다.');
              if (!strategy.active && state.risk.halted) throw new Error('신규 주문 정지 상태입니다.');
              strategy.active = !strategy.active; record(state, strategy.active ? '전략 시작' : '전략 정지', strategy.name); return {};
            }
            case '/api/risk': Object.assign(state.risk, riskInput.parse(input)); record(state, '위험 한도 변경', '새 주문부터 변경한 한도를 적용합니다.'); return {};
            case '/api/risk/halt': {
              const { halted } = haltInput.parse(input);
              if (!halted && store.paperOrders().some(o => o.status === 'unknown' || o.status === 'sending')) throw new Error('KIS 불명·전송 중 주문을 대조하기 전에는 재개할 수 없습니다.');
              halt(state, halted); return {};
            }
            case '/api/journal': {
              const entry = journalInput.parse(input);
              if (!state.instruments.some(s => s.code === entry.code)) throw new Error('지원하지 않는 종목입니다.');
              if (state.journal.length >= 2000) throw new Error('일지 보관 한도에 도달했습니다.');
              state.journal.unshift({ ...entry, id: randomUUID(), date: new Date().toISOString() }); return {};
            }
            case '/api/events/read': state.events.forEach(e => { e.read = true; }); return {};
            default: throw new Error('지원하지 않는 API입니다.');
          }
        });
        json(res, 200, result); return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { error: '지원하지 않는 요청 방식입니다.' }); return; }
      const root = resolve('dist'); const file = path.startsWith('/assets/') || path === '/project-map.html' ? resolve(root, '.' + path) : resolve(root, 'index.html');
      if (!file.startsWith(root + sep)) { json(res, 404, { error: '파일이 없습니다.' }); return; }
      const bytes = await readFile(file);
      const type = ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' } as Record<string, string>)[extname(file)] ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' }); res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if ((path === '/api/watchlist' || path === '/api/journal' || path.startsWith('/api/risk') || path.startsWith('/api/backtest/') || path.startsWith('/api/kis/')) && error instanceof Error && 'code' in error && error.code === 'ERR_SQLITE_ERROR') { json(res, 500, { error: storageErrorMessage }); return; }
      const message = error instanceof ZodError ? '입력값을 확인하세요. 범위·필수 항목 또는 단기/장기 기간이 올바르지 않습니다.' : error instanceof Error ? error.message : '요청 처리에 실패했습니다.';
      if (path === '/api/orders') {
        try { store.update(state => record(state, '주문 요청 차단', message, 'warning')); }
        catch { json(res, 500, { error: storageErrorMessage }); return; }
      }
      if (path === '/api/risk' || path === '/api/risk/halt') {
        try { store.update(state => record(state, '위험관리 요청 차단', message, 'warning')); }
        catch { json(res, 500, { error: storageErrorMessage }); return; }
      }
      json(res, 400, { error: message });
    }
  });
}
