import { analyzeCollectedDocuments, collectPublicDocuments } from './morning-analysis.ts';
import {
  AFTER_OPEN_BLOCK_REASON,
  APPROVAL_BLOCK_TEXT,
  MISSING_BALANCE_BLOCK_REASON,
  reportApprovalBlocked,
  type MorningApprovalState,
  type MorningReport,
} from '../shared/morning.ts';
import { researchDecision } from './morning-replay.ts';
import { closeMorning } from './morning-close.ts';
import { applyExposure } from './morning-exposure.ts';
import { MorningScan } from './morning-scan.ts';
import { buildMorning, seoulDay } from './morning.ts';
import { collectNews,collectIndicators } from './morning-news.ts';
import { fixTradingDraft, saveTradingDraft, tradingSettings } from './trading-plans.ts';
import type { StrategyContract } from './strategy-contract.ts';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import { backtestInput, codeSchema, eventReadInput, haltInput, idInput, journalInput, orderInput, configuredPaperOrderInput, paperOrderInput, paperQuantitySetting, paperRecoveryInput, riskInput, storageErrorMessage, strategyInput } from '../shared/contracts.ts';
import { advanceTick, backtest, cancelOrder, halt, placeOrder, record } from './engine.ts';
import { recordConnection, recordKisEvent } from './events.ts';
import { KisClient, KisFailure } from './kis.ts';
import { Store } from './store.ts';
import { PaperBroker, paperCapabilities, type PaperApproval } from './paper.ts';
import type { StateSnapshot } from '../shared/model.ts';
import { emptyStatus } from '../shared/status.ts';
import { createExperiment, replayExperiment } from './backtest.ts';
import { Realtime, type RealtimeConfig, type SocketFactory } from './realtime.ts';
import { orderHistory } from './order-history.ts';
import { MarketData } from './market-data.ts';
import { addDays,marketQuoteInput, masterCodeSchema } from '../shared/market-data.ts';

async function body(req: IncomingMessage, limit = 16384) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('입력 크기 제한을 초과했습니다.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown; } catch { throw new Error('올바른 JSON 입력이 필요합니다.'); }
}
function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data));
}
export function makeServer(store: Store, kis = KisClient.fromEnvironment(), ports = [4303, 4304], approval?: PaperApproval, realtimeOptions?: { config?: RealtimeConfig; connect?: SocketFactory; now?: () => number }, contract?: StrategyContract, checkInstrument?: () => void) {
  const paper = new PaperBroker(store, kis, approval, contract, checkInstrument);
  const realtime = new Realtime(store, paper, realtimeOptions?.config ?? Realtime.configuration(paper.timingPolicy?.exchangeNotice), realtimeOptions?.connect, realtimeOptions?.now);
  const market = new MarketData(store, kis);
  const account = () => (kis.configured() ? kis.accountFingerprint() : 'unconfigured');
  const scan = new MorningScan(store, kis, market);
  let generating = false;
  async function resolveCarryPrevious(day: string) {
    if (!store.pendingCarry(account()) || !realtime.canApproveMorning(day)) return null;
    const end = addDays(day.replaceAll('-', ''), -1),
      from = addDays(end, -21);
    const bars = await kis.dailyPage(
      { id: randomUUID(), code: '069500', from, to: end, adjustment: 'raw' },
      from,
      end,
    );
    const previous = bars
      .filter((b) => b.volume > 0)
      .map((b) => b.date)
      .sort()
      .at(-1);
    return previous ? previous.replace(/^(....)(..)(..)$/, '$1-$2-$3') : null;
  }
  async function bindCarry(day: string) {
    const previousDay = await resolveCarryPrevious(day);
    if (previousDay) store.bindNextSession(account(), previousDay, day);
  }
  async function generateMorning() {
    if (generating) throw new Error('보고서를 작성 중입니다.');
    const day = seoulDay(Date.now()),
      key = account();
    const prior = store.morning(key, day);
    const opening = Date.parse(day + 'T' + realtime.morningOpenTime(day) + ':00+09:00');
    if (prior && Date.now() >= opening) return prior;
    if (prior?.approvedAt) throw new Error('이미 승인한 오늘 계획입니다.');
    generating = true;
    try {
      const cutoff = Math.min(Date.now(), Date.parse(day + 'T' + realtime.morningOpenTime(day) + ':00+09:00'));
      const [{ news, gaps }, indicators] = await Promise.all([
        collectNews(cutoff),
        Date.now() <= Date.parse(day + 'T' + realtime.morningOpenTime(day) + ':00+09:00')
          ? collectIndicators(Date.now())
          : Promise.resolve([]),
      ]);
      const connection =
        kis.configured() &&
        !approval &&
        !contract &&
        Date.now() < Date.parse(day + 'T' + realtime.morningOpenTime(day) + ':00+09:00')
          ? await kis.balance(true)
          : kis.connection();
      const report = buildMorning(
        store,
        connection,
        Date.now(),
        news,
        gaps,
        indicators,
        realtime.morningOpenTime(day),
      );
      if (
        report.cash !== null &&
        Date.now() < Date.parse(day + 'T' + realtime.morningOpenTime(day) + ':00+09:00')
      ) {
        try{await bindCarry(day);}catch{report.gaps.push('직전 거래일 미확인 · 이월 매도 감시 보류');}
        const monitored = new Set(store.carry(key, day).map((p) => p.code));
        report.candidates = report.candidates.filter((p) => {
          if (!/^\d{6}$/.test(p.code) || (!monitored.has(p.code) && monitored.size >= 18)) {
            report.gaps.push(p.name + ' · 실시간 구독 범위 밖, 자동매매 제외');
            return false;
          }
          monitored.add(p.code);
          return true;
        });
        await applyExposure(report, store, kis);
        report.createdAt = new Date().toISOString();
      }
      if (process.env.STOCK_MORNING_ANALYST_MODEL && Date.now() < opening) {
        try {
          const { docs, coverage } = await collectPublicDocuments(report.news);
          if (coverage.attempted > 0) report.analysisCoverage = coverage;
          report.analysis = await analyzeCollectedDocuments(
            docs,
            process.env.STOCK_MORNING_ANALYST_MODEL,
            coverage,
            report.candidates,
          );
        } catch {
          report.gaps.push('전문가 원문 분석 미확인');
        }
        report.createdAt = new Date().toISOString();
      }
      if(process.env.STOCK_MORNING_COST_BPS){
        try{report.costBps=z.object({buy:z.number().min(0).lt(1000),sell:z.number().min(0).lt(1000)}).strict().parse(JSON.parse(process.env.STOCK_MORNING_COST_BPS));}
        catch{report.gaps.push('편도 비용률 미확인 · 장후 순기여 미측정');}
      }
      if (process.env.STOCK_MORNING_REPLAY) {
        try {
          const raw = await readFile(process.env.STOCK_MORNING_REPLAY, 'utf8');
          report.research = researchDecision(JSON.parse(raw), day);
          if (report.equity && report.research.fraction)
            report.dailyLoss = Math.min(
              report.dailyLoss,
              Math.max(1, Math.floor(report.equity * report.research.fraction)),
            );
        } catch {
          report.gaps.push('과거 검증 자료 부족 또는 형식 오류 · 손실 기준 미측정');
        }
      }
      if (Date.now() >= opening && prior) return prior;
      if (Date.now() >= opening) {
        report.createdAt = new Date().toISOString();
        report.approvalBlocked = true;
        report.approvalBlockReasons = [...new Set([...(report.approvalBlockReasons ?? []), AFTER_OPEN_BLOCK_REASON])];
        if (!report.gaps.some((g) => g.includes(APPROVAL_BLOCK_TEXT))) {
          report.gaps.push(AFTER_OPEN_BLOCK_REASON);
        }
      }
      if (report.day !== day) throw new Error('거래일이 바뀌었습니다. 다시 작성하세요.');
      store.saveMorning(key, report);
      return store.morning(key,day)??report;
    } finally {
      generating = false;
    }
  }
  function evaluateMorningApproval(report: MorningReport | null, day: string, now: number): MorningApprovalState {
    if (!report) return { allowed: false, reasons: [] };
    const reasons: string[] = [];
    const addReason = (reason: string) => {
      if (reason && !reasons.includes(reason)) reasons.push(reason);
    };
    const today = seoulDay(now);
    if (day !== today) addReason('과거 거래일 보고서는 열람 전용입니다.');
    if (approval || contract) addReason('전용 실행 중에는 일반 장전 계획을 승인할 수 없습니다.');
    if (!kis.configured()) addReason('KIS 모의 계좌 설정이 필요합니다.');
    const reportBlock = reportApprovalBlocked(report);
    for (const reason of reportBlock.reasons) addReason(reason);
    if (reportBlock.blocked && reportBlock.reasons.length === 0) addReason(APPROVAL_BLOCK_TEXT);
    if (report.equity === null || report.equity <= 0) addReason(MISSING_BALANCE_BLOCK_REASON);
    if (Date.parse(report.createdAt) >= Date.parse(day + 'T' + realtime.morningOpenTime(day) + ':00+09:00')) {
      addReason(AFTER_OPEN_BLOCK_REASON);
    }
    if (!realtime.canApproveMorning(day)) {
      addReason('당일 공식 거래일·실시간 설정 확인이 필요합니다.');
    } else {
      const prepare = realtime.checkPrepareMorning(report);
      if (!prepare.ok) addReason(prepare.reason);
    }
    if (store.read().risk.halted) addReason('긴급정지가 켜져 있어 당일 승인을 차단했습니다.');
    return { allowed: reasons.length === 0, reasons };
  }
  const instanceId = randomUUID();
  const startedAt = new Date().toISOString();
  const origins = new Set(ports.filter(port => port > 0).flatMap(port => [`http://127.0.0.1:${port}`, `http://localhost:${port}`]));
  const hosts = new Set([...origins].map(origin => new URL(origin).host));
  const server = createServer(async (req, res) => {
    if (!hosts.has(req.headers.host ?? '') || (req.headers.origin && !origins.has(req.headers.origin)) || req.headers['sec-fetch-site'] === 'cross-site') { json(res, 403, { error: '로컬 워크스페이스에서만 접근할 수 있습니다.' }); return; }
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    let eventRequestId: string | undefined;
    try {
      if (path === '/api/state' && req.method === 'GET') {
        const now = new Date().toISOString();
        const snapshot: StateSnapshot = { ...store.read(), events: store.events(), instanceId, startedAt, status: { ...emptyStatus('demo'), phase: 'ready', complete: true, observedAt: now, lastSuccessAt: now }, connection: kis.connection(), paperRisk: paper.riskSnapshot(), realtime: realtime.status() };
        json(res, 200, snapshot); return;
      }
      if (path === '/api/morning' && req.method === 'GET') {
        const now = Date.now();
        const day = z.iso.date().parse(new URL(req.url!, 'http://127.0.0.1').searchParams.get('day') ?? seoulDay(now));
        const report = store.morning(account(), day);
        json(res, 200, {
          run: realtime.morningRun(),
          pendingCarry: store.pendingCarry(account()),
          carry: store.carry(account(), seoulDay(now)).map((p) => ({ code: p.code, remaining: p.remaining })),
          days: store.morningDays(account()),
          close: report && store.morningClose(report.id),
          scan: scan.state,
          approval: report ? evaluateMorningApproval(report, day, now) : { allowed: false, reasons: [] },
          report: report && { ...report, watch: [] },
          additions: report ? store.additions(report.id) : [],
          signals: report ? store.morningSignals(report.id) : [],
        });
        return;
      }
      if (path === '/api/trading-settings' && req.method === 'GET') { json(res,200,tradingSettings(store,approval,contract)); return; }
      if (path === '/api/kis/history' && req.method === 'GET') {
        try { json(res, 200, orderHistory(store)); }
        catch { json(res, 500, { error: '지난 실행 목록을 읽지 못했습니다.' }); }
        return;
      }
      if (path === '/api/kis/ledger' && req.method === 'GET') { const orders = store.displayPaperOrders(); json(res, 200, { orders, cancellation: paper.cancellation(orders), minimumRun: paper.approvalStatus(), strategyBudget: paper.strategyBudget() }); return; }
      if (path === '/api/kis/capabilities' && req.method === 'GET') { json(res, 200, paperCapabilities); return; }
      if (path === '/api/kis/audit' && req.method === 'GET') {
        const id = idInput.parse({ id: new URL(req.url!, 'http://127.0.0.1').searchParams.get('requestId') }).id;
        json(res, 200, { audit: store.paperAudit(id) }); return;
      }
      if (path === '/api/data/master' && req.method === 'GET') { json(res, 200, store.masterData()); return; }
      if (path === '/api/data/daily' && req.method === 'GET') {
        const rawLimit = new URL(req.url!, 'http://127.0.0.1').searchParams.get('limit');
        const limit = rawLimit === null ? undefined : z.string().regex(/^\d+$/).transform(Number).pipe(z.int().min(1).max(500)).parse(rawLimit);
        json(res, 200, { runs: store.dailyRuns(limit) });
        return;
      }
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
        const input = await body(req, path === '/api/events/read' ? 128000 : path === '/api/data/daily' ? 65536 : 16384);
        const eventId = z.uuid().safeParse((input as { requestId?: unknown; id?: unknown } | null)?.requestId ?? (input as { id?: unknown } | null)?.id);
        if (eventId.success) eventRequestId = eventId.data;
        if ((approval || contract) && (path === '/api/risk' || path === '/api/kis/quantity-setting')) {
          json(res,409,{error:'전용 실행의 고정 한도입니다. 일반 앱에서 다음 실행을 준비하세요.'}); return;
        }
        if (path === '/api/morning/carry') {
          const { id } = idInput.parse(input);
          const day = seoulDay(Date.now()),
            report = store.morning(account(), day),
            close = store.morningClose(id);
          if (approval || contract || !report?.approvedAt || report.id !== id || !close)
            throw new Error('오늘의 승인·장후 결과와 이월 매도 날짜를 확인하세요.');
          const positions = close.positions.filter(
            (p) => p.qty > 0 && report.candidates.some((c) => c.code === p.code && c.exit > 0),
          );
          if (!positions.length) throw new Error('매도 조건이 정해진 이월 보유분이 없습니다.');
          store.saveCarry(account(), 'next:' + day, id, positions);
          json(res, 200, { message: '다음 거래일에 기존 매도 조건과 보유 수량을 적용합니다.' });
          return;
        }
        if (path === '/api/morning/carry/start') {
          const day = seoulDay(Date.now());
          if (approval || contract || !realtime.canApproveMorning(day) || store.read().risk.halted)
            throw new Error('일반 모의 운용 세션이 필요합니다.');
          if (!realtime.canMonitorCarry(day))
            throw new Error('이월 승인과 실시간 거래일 설정을 확인하세요.');
          const previousDay = await resolveCarryPrevious(day);
          store.morning(account(), day);
          const codes = previousDay
            ? store.carryPreviewCodes(account(), day, 'next:' + previousDay)
            : store.carry(account(), day).map((p) => p.code);
          if (!codes.length || !realtime.canMonitorCarry(day, codes))
            throw new Error('이월 승인과 실시간 거래일 설정을 확인하세요.');
          if (previousDay) store.bindNextSession(account(), previousDay, day);
          realtime.armMorning(codes);
          json(res, 200, { message: '이월 매도 감시를 시작합니다.' });
          return;
        }
        if (path === '/api/morning/close') {
          const { id } = idInput.parse(input),
            day = seoulDay(Date.now());
          const report = store.morning(account(), day),
            close = realtime.morningCloseTime(day);
          if (!report || report.id !== id || !close || approval || contract)
            throw new Error('당일 계획과 공식 거래시간을 확인하세요.');
          if (store.morningClose(id)?.hold == null) store.saveMorningClose(id, await closeMorning(report, kis, close,store.morningOrders(account(),day)));
          json(res, 200, { message: '장후 계좌와 보유 유지 결과를 기록했습니다.' });
          return;
        }
        if (path === '/api/morning/scan') {
          if (approval || contract) throw new Error('일반 앱에서 장전 목록을 수집하세요.');
          json(res, 200, {
            scan: scan.start(realtime.morningOpenTime(seoulDay(Date.now()))),
            message: '장전 시세 수집을 시작했습니다.',
          });
          return;
        }
        if (path === '/api/morning/generate') {
          const report = await generateMorning();
          json(res, 200, { report: { ...report, watch: [] }, message: '분석 시점과 근거를 저장했습니다.' });
          return;
        }
        if (path === '/api/morning/add') {
          const { id, code, expires } = z
            .object({ id: z.uuid(), code: masterCodeSchema, expires: z.int() })
            .strict()
            .parse(input);
          const report = store.morning(account(), seoulDay(Date.now()));
          const candidate = report && store.additions(report.id).find((a) => a.candidate.code === code)?.candidate;
          if (
            contract ||
            approval ||
            !report ||
            report.id !== id ||
            !candidate ||
            !report.exposureComplete ||
            (realtime.morningPrice(code) ?? 0) <= candidate.reference ||
            store.morningStopped(account(), report.day)
          )
            throw new Error('편입 조건이 만료됐습니다.');
          store.approveAddition(report, code, expires, Date.now());
          json(res, 200, { message: '새 종목을 승인했습니다. 다음 유효 신호에서 평가합니다.' });
          return;
        }
        if (path === '/api/morning/approve') {
          const { id } = idInput.parse(input),
            now = Date.now(),
            day = seoulDay(now),
            key = account();
          const report = store.morning(key, day);
          const approvalState = evaluateMorningApproval(report, day, now);
          if (!report || report.id !== id || !approvalState.allowed) {
            throw new Error('당일 장전 보고서, 모의 잔고, 거래일 설정과 위험 상태를 확인하세요.');
          }
          const codes = realtime.prepareMorning(report);
          store.approveMorning(key, day, id, new Date(now).toISOString());
          realtime.armMorning(codes, id);
          json(res, 200, { report: store.morning(key, day), message: '당일 계획의 종목과 금액을 승인했습니다.' });
          return;
        }
        if (path === '/api/trading-settings/draft' || path === '/api/trading-settings/fix') {
          if (approval || contract) { json(res,409,{error:'실행 중 계약은 읽기 전용입니다. 일반 앱에서 다음 설정을 준비하세요.'}); return; }
          const fixing = path.endsWith('/fix');
          const plan = fixing ? fixTradingDraft(store,kis,input) : saveTradingDraft(store,input);
          json(res,200,{plan,message:fixing?'전용 원장과 고정 파일을 준비했습니다.':'다음 실행 초안을 저장했습니다.'}); return;
        }
        if (path === '/api/data/master/refresh') { json(res, 200, await market.refreshMaster()); return; }
        if (path === '/api/data/daily') { json(res, 200, { run: market.start(input) }); return; }
        if (path === '/api/data/daily/step') { json(res, 200, { run: await market.step(idInput.parse(input).id) }); return; }
        if (path === '/api/market/quote') {
          const { code } = marketQuoteInput.parse(input);
          if (!store.masterData().instruments.some(row => row.code === code)) throw new Error('현재 마스터에 없는 종목입니다. 상장폐지·거래 가능 여부를 확인하세요.');
          json(res, 200, { quote: await kis.quote(code) }); return;
        }
        if (path === '/api/kis/strategies/run') { const config = z.object({ id: z.string().min(1).max(80), active: z.boolean() }).strict().parse(input); realtime.setStrategyActive(config.id, config.active); json(res, 200, { message: config.active ? 'KIS 전략 평가를 시작했습니다. 전송은 공통 승인·위험 조건을 따릅니다.' : 'KIS 전략을 정지했습니다. 접수 주문은 별도 대조하세요.' }); return; }
        if (path === '/api/kis/realtime/start') { realtime.start(codeSchema.parse((input as { code?: unknown })?.code)); json(res, 200, { message: '실시간 구독을 요청했습니다. 구독 확인 후 REST 대조가 필요합니다.' }); return; }
        if (path === '/api/kis/realtime/stop') { realtime.stop(); json(res, 200, { message: '실시간 수신을 정지했습니다. 자동 거래 재개 없음.' }); return; }
        if (path === '/api/kis/realtime/reconcile') { await realtime.reconcile(); json(res, 200, { message: '실시간 REST 대조를 확인했습니다.' }); return; }
        if (path === '/api/kis/check') { const connection = await kis.balance(); paper.observeMorningLoss(connection);store.update(state => recordConnection(state, connection)); json(res, 200, { connection, message: 'KIS 모의 잔고 조회를 확인했습니다.' }); return; }
        if (path === '/api/kis/market') {
          const code = codeSchema.parse((input as { code?: unknown })?.code);
          const quote = await kis.quote(code); const bars = await kis.bars(code);
          json(res, 200, { quote, bars, message: 'KIS 현재가와 최근 일봉을 조회했습니다. 수신 시각과 거래일을 구분하세요.' }); return;
        }
        if (path === '/api/kis/orders') { const result = await paper.refresh(); store.update(state => recordKisEvent(state, 'KIS 주문 대조 확인', 'REST 계좌·주문 대조를 확인했습니다.', 'paper', undefined, 'info')); json(res, 200, { ...result, cancellation: paper.cancellation(result.orders), message: 'KIS 모의 계좌와 당일 주문을 조회했습니다.' }); return; }
        if (path === '/api/kis/cancel-probe') {
          const { id, reconcileFirst } = idInput.extend({ reconcileFirst: z.boolean().optional() }).parse(input);
          if (!paper.cancelProbeEnabled()) { store.update(state => recordKisEvent(state, 'KIS 한정 취소 요청 차단', '전량취소 검증 승인이 없습니다.', 'paper', eventRequestId)); json(res, 409, { error: '전량취소 검증 승인이 없습니다.' }); return; }
          const order = await paper.cancelProbe(id, reconcileFirst); json(res, 200, { order, warning: true }); return;
        }
        if (path === '/api/kis/cancel' || path === '/api/kis/revise') { idInput.parse(input); store.update(state => recordKisEvent(state, 'KIS 정정·취소 요청 차단', paperCapabilities.changeOrders.reason, 'paper', eventRequestId)); json(res, 409, { error: paperCapabilities.changeOrders.reason, code: 'vts-change-blocked' }); return; }
        if (path === '/api/kis/recovery/inspect') { json(res, 200, await paper.inspectRecovery(idInput.parse(input).id)); return; }
        if (path === '/api/kis/recovery/confirm') {
          const order = await paper.confirmRecovery(paperRecoveryInput.parse(input)); json(res, 200, { order, message: order.message }); return;
        }
        if (path === '/api/kis/order') {
          const order = await paper.submit((approval?.policy ? configuredPaperOrderInput : paperOrderInput).parse(input)); json(res, 200, { order, message: order.message, warning: order.status === 'unknown' || order.status === 'rejected' }); return;
        }
        if (path === '/api/backtest/daily') { json(res, 200, { experiment: createExperiment(store, input), message: '저장 일봉의 입력과 결과를 보존했습니다.' }); return; }
        if (path === '/api/backtest/replay') { const replay = replayExperiment(store, idInput.parse(input).id); json(res, 200, { ...replay, message: replay.matches ? '고정 입력 재현 결과가 일치합니다.' : '재현 불일치: 엔진·저장 결과를 점검하세요.', warning: !replay.matches }); return; }
        if (path === '/api/backtest') {
          const config = backtestInput.parse(input); const instrument = store.read().instruments.find(s => s.code === config.code);
          if (!instrument) throw new Error('지원하지 않는 종목입니다.');
          json(res, 200, { result: backtest(instrument.history, config), message: '합성 데이터 백테스트를 계산했습니다.' }); return;
        }
        if (path === '/api/risk/halt' && haltInput.parse(input).halted) realtime.stop();
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
              if (!state.instruments.some(s => s.code === strategy.code) &&
                  !(strategy.environment === 'kis-paper' && store.masterData().instruments.some(s => s.code === strategy.code && s.tradingHalted === false && s.liquidation === false && ['ST','EF'].includes(s.group)))) throw new Error('지원하지 않는 종목입니다.');
              if (state.strategies.length >= 30) throw new Error('전략은 최대 30개까지 저장할 수 있습니다.');
              const id = randomUUID();
              state.strategies.push({ ...strategy, id, active: false, lastSignal: 'hold', lastTick: -1, revision: 1, run: 0, evaluations: [] });
              record(state, '전략 저장', strategy.name, 'info', { environment: strategy.environment, target: 'strategies' });
              return {id, revision:1};
            }
            case '/api/strategies/toggle': {
              const strategy = state.strategies.find(s => s.id === idInput.parse(input).id);
              if (!strategy) throw new Error('전략을 찾지 못했습니다.');
              if (strategy.environment === 'kis-paper') throw new Error('KIS 전략 시작·정지 경로를 사용하세요.');
              if (!strategy.active && state.risk.halted) throw new Error('신규 주문 정지 상태입니다.');
              strategy.active = !strategy.active; record(state, strategy.active ? '전략 시작' : '전략 정지', strategy.name); return {};
            }
            case '/api/kis/quantity-setting': {
              state.paperManualMaxQty = paperQuantitySetting.parse(input).maxQty;
              record(state, 'KIS 수동 주문 수량 한도 변경', `1회 최대 ${state.paperManualMaxQty}주`);
              return { maxQty: state.paperManualMaxQty, message: 'KIS 수동 주문 수량 한도를 저장했습니다.' };
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
            case '/api/events/read': {
              const { ids } = eventReadInput.parse(input); const seen = new Set(ids);
              state.events.forEach(e => { if (seen.has(e.id)) e.read = true; }); store.markPaperEventsRead(ids); return {};
            }
            default: throw new Error('지원하지 않는 API입니다.');
          }
        });
        json(res, 200, result); return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { error: '지원하지 않는 요청 방식입니다.' }); return; }
      const root = resolve('dist'); const file = path.startsWith('/assets/') || path === '/project-map.html' ? resolve(root, '.' + path) : resolve(root, 'index.html');
      if (!file.startsWith(root + sep)) { json(res, 404, { error: '파일이 없습니다.' }); return; }
      let bytes: Buffer;
      try { bytes = await readFile(file); }
      catch (error) {
        const missing = error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
        json(res, missing ? 404 : 500, { error: missing ? '파일이 없습니다.' : '파일을 읽지 못했습니다.' }); return;
      }
      const type = ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' } as Record<string, string>)[extname(file)] ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' }); res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (path.startsWith('/api/trading-settings') && error instanceof Error && 'code' in error && !(error instanceof ZodError)) {
        json(res, 500, { error: '매매 설정 원장이나 고정 파일을 처리하지 못했습니다. 저장 상태를 다시 확인하세요.' }); return;
      }
      if (path.startsWith('/api/morning') && error instanceof Error && 'code' in error && !(error instanceof ZodError)) {
        json(res, 500, { error: '장전 포트폴리오 자료나 저장소를 처리하지 못했습니다. 저장 상태를 다시 확인하세요.' }); return;
      }
      if ((path === '/api/watchlist' || path === '/api/journal' || path.startsWith('/api/strategies') || path.startsWith('/api/risk') || path.startsWith('/api/backtest/') || path.startsWith('/api/kis/') || path === '/api/events/read') && error instanceof Error && 'code' in error && error.code === 'ERR_SQLITE_ERROR') { json(res, 500, { error: storageErrorMessage }); return; }
      if (path === '/api/kis/check' || ['/api/kis/order', '/api/kis/orders', '/api/kis/recovery/inspect', '/api/kis/recovery/confirm', '/api/kis/cancel', '/api/kis/revise', '/api/kis/cancel-probe'].includes(path)) {
        try { store.update(state => {
          if (path === '/api/kis/check') recordConnection(state, kis.connection(), error instanceof KisFailure ? error.kind : null);
          else recordKisEvent(state, path.endsWith('/cancel-probe') ? 'KIS 한정 취소 요청 차단' : path.endsWith('/cancel') || path.endsWith('/revise') ? 'KIS 정정·취소 요청 차단' : path.endsWith('/inspect') ? 'KIS 불명 복구 조회 차단' : path.endsWith('/confirm') ? 'KIS 불명 복구 확인 차단' : path.endsWith('/orders') ? 'KIS 주문 대조 실패' : 'KIS 주문 요청 차단', '입력·승인·위험 한도 또는 조회 검증을 통과하지 못했습니다. 모의 매매 화면에서 원장과 제한을 확인하세요.', 'paper', eventRequestId);
        }); } catch { json(res, 500, { error: storageErrorMessage }); return; }
      }
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
  // An explicitly launched morning service collects read-only data before its verified session.
  let scanDay = '',
    reportDay = '';
  const scheduler =
    process.env.STOCK_MORNING_REPORT === '1' && !approval && !contract
      ? setInterval(() => {
          const now = Date.now(),
            day = seoulDay(now);
          if (!kis.configured() || !realtime.canApproveMorning(day)) return;
          const minutes = (Date.parse(day + 'T' + realtime.morningOpenTime(day) + ':00+09:00') - now) / 60000;
          if (minutes > 0 && minutes <= 240 && minutes > 10 && scanDay !== day) {
            scanDay = day;
            scan.start(realtime.morningOpenTime(day));
          }
          if (
            minutes <= 10 &&
            minutes > 0 &&
            reportDay !== day &&
            !generating &&
            !store.morning(account(), day)?.approvedAt
          ) {
            reportDay = day;
            void generateMorning()
              .then((report) => {
                // Observation only for today's candidates. No buy authority is armed here.
                if (!realtime.canMonitorCarry(day)) return;
                try {
                  const codes = realtime.prepareMorning(report);
                  realtime.armMorning(codes, null);
                } catch {
                  /* Saved report stays available for explicit review and activation. */
                }
              })
              .catch(() => {
                if (minutes > 1) reportDay = '';
              });
          }
        }, 60000)
      : undefined;
  scheduler?.unref();
  server.on('close', () => {
    clearInterval(scheduler);
    scan.close();
    realtime.stop();
  });
  if (ports.includes(0)) {
    server.once('listening', () => {
      const address = server.address();
      if (address && typeof address === 'object' && address.port > 0) {
        origins.add(`http://127.0.0.1:${address.port}`);
        origins.add(`http://localhost:${address.port}`);
        hosts.add(`127.0.0.1:${address.port}`);
        hosts.add(`localhost:${address.port}`);
      }
    });
  }
  return server;
}
