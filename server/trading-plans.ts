import { assertRealtimeRule } from '../shared/strategy-rules.ts';
import { DatabaseSync } from 'node:sqlite';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  tradingTerms,
  planStem,
  planLimits,
  type PlanKind,
  type PlanVersion,
  type TradingTerms,
  type TradingSettingsData,
} from '../shared/trading-plan.ts';
import { approvalBinding, sessionBounds } from '../shared/trading-policy.ts';
import type { MasterInstrument, MasterState } from '../shared/market-data.ts';
import { DEFAULT_PAPER_MAX_QTY } from '../shared/contracts.ts';
import type { State } from '../shared/model.ts';
import { Store } from './store.ts';
import { preparedApprovalSchema, type PaperApproval } from './paper.ts';
import { eligibleDailyRun, sameStrategyConditions, assertStrategyIdentity, strategyContractSchema, type StrategyContract } from './strategy-contract.ts';
import { koreaDate, type KisClient } from './kis.ts';

const kindSchema = z.enum(['once', 'strategy']);
const saveInput = z.object({ expectedId: z.uuid().nullable(), terms: tradingTerms }).strict();
const fixInput = z.object({ kind: kindSchema, expectedId: z.uuid() }).strict();

function selectedStrategy(state: State, terms: Extract<TradingTerms, { kind: 'strategy' }>) {
  const strategy = state.strategies.find((s) => s.id === terms.strategyId && s.environment === 'kis-paper');
  if (!strategy || strategy.revision !== terms.revision)
    throw new Error('저장 전략 revision이 달라졌습니다. 대상을 다시 선택하세요.');
  if (!terms.policy && !state.instruments.some((row) => row.code === strategy.code))
    throw new Error('확장 종목은 매매설정의 새 전략 정책을 고정해야 합니다.');
  assertRealtimeRule(strategy.rule, strategy.overlay, strategy.slow);
  return strategy;
}
function assetKind(
  code: string,
  maxDays: number,
  row?: MasterInstrument,
  source?: MasterState,
  removed = false,
): 'stock' | 'etf' {
  if (!row && !removed && !source && (code === '005930' || code === '069500'))
    return code === '069500' ? 'etf' : 'stock';
  if (
    !row ||
    !source ||
    source.phase !== 'ready' ||
    !source.lastSuccessAt ||
    Date.parse(source.lastSuccessAt) > Date.now() ||
    !(Date.now() - Date.parse(source.lastSuccessAt) < maxDays * 86400000) ||
    row.tradingHalted !== false ||
    row.liquidation !== false ||
    !['ST', 'EF'].includes(row.group)
  )
    throw new Error(
      '고정한 유효기간 안의 KRX 주식·ETF 마스터와 거래정지·정리매매 상태를 확인하세요. 데이터 화면에서 마스터를 갱신하세요.',
    );
  return row.kind;
}
function validWindow(terms: TradingTerms) {
  if (terms.kind === 'once') {
    if (terms.policy) {
      const window = sessionBounds(terms.date, terms.policy.session, terms.policy.exchangeNotice);
      if (!window || Date.now() >= window.end) throw new Error('남은 KRX 실행 시간창을 확인하세요.');
      return;
    }
    const day = new Date(terms.date + 'T12:00:00+09:00').getUTCDay();
    if (
      terms.date.replaceAll('-', '') < koreaDate() ||
      Date.parse(terms.date + 'T15:30:00+09:00') <= Date.now() ||
      day === 0 ||
      day === 6
    )
      throw new Error('평일 15:30 KST 이전의 유효한 실행일을 선택하세요.');
    return;
  }
  // There must be a future weekday session overlapping the contract. The live session gate still applies.
  const begin = Math.max(Date.now(), Date.parse(terms.startsAt)),
    end = Date.parse(terms.endsAt);
  const day = new Date(begin + 9 * 3600000).toISOString().slice(0, 10);
  const open = Date.parse(day + 'T09:00:00+09:00');
  if (terms.policy) {
    // Four consecutive dates cover normal weekday sessions. A dated notice can be much later.
    const dates = new Set(['2026-11-19', terms.policy.exchangeNotice?.date].filter((d): d is string => !!d));
    for (let offset = 0; offset < 4; offset++) dates.add(new Date(open + offset * 86400000).toISOString().slice(0, 10));
    for (const date of dates) {
      const window = sessionBounds(date, terms.policy.session, terms.policy.exchangeNotice);
      if (window && Math.max(begin, window.start) < Math.min(end, window.end)) return;
    }
    throw new Error('전략 계약 기간과 설정한 KRX 시간창이 겹치지 않습니다.');
  }
  for (let offset = 0; offset < 4; offset++) {
    const start = open + offset * 86400000;
    const weekday = new Date(start).getUTCDay();
    if (weekday > 0 && weekday < 6 && Math.max(begin, start) < Math.min(end, start + 6.5 * 3600000)) return;
  }
  throw new Error('계약 기간에 남은 평일 거래시간(09:00~15:30 KST)이 없습니다.');
}
export function activeTerms(approval?: PaperApproval, contract?: StrategyContract): TradingTerms | null {
  if (approval)
    return {
      kind: 'once',
      code: approval.code ?? '069500',
      date: approval.date,
      orderType: approval.orderType ?? 'limit',
      maxQty: approval.maxQty ?? 1,
      maxAmount: approval.maxAmount ?? 100000,
      allowExistingHolding: !!approval.allowExistingHolding,
      cancelProbe: !!approval.cancelProbe,
      ...(approval.policy && { policy: approval.policy }),
    };
  if (contract) {
    const { strategyId, revision, startsAt, endsAt, maxOrderAmount, maxAttempts, maxTotalAmount, sellPolicy } =
      contract;
    return {
      kind: 'strategy',
      strategyId,
      revision,
      startsAt,
      endsAt,
      maxOrderAmount,
      maxAttempts,
      maxTotalAmount,
      sellPolicy,
      ...(contract.policy && { policy: contract.policy }),
    };
  }
  return null;
}
export function tradingSettings(
  store: Store,
  approval?: PaperApproval,
  contract?: StrategyContract,
): TradingSettingsData {
  const active = activeTerms(approval, contract);
  return {
    active,
    plans: active ? {} : { once: store.tradingPlan('once'), strategy: store.tradingPlan('strategy') },
    canFix: !active && store.path !== ':memory:',
    ...(contract && { usage: store.strategyUsage() }),
  };
}
export function saveTradingDraft(store: Store, raw: unknown) {
  const { expectedId, terms } = saveInput.parse(raw);
  return store.changeTradingPlan(terms.kind, expectedId, (old) => {
    const state = store.read(),
      limits = planLimits(state);
    const strategy = terms.kind === 'strategy' ? selectedStrategy(state, terms) : undefined;
    if (
      old && (!strategy || (strategy.code === old.draft.symbol && strategy.qty === old.draft.qty && strategy.fast === old.draft.fast && strategy.slow === old.draft.slow && sameStrategyConditions(strategy, old.draft))) &&
      JSON.stringify(old.draft.terms) === JSON.stringify(terms) &&
      JSON.stringify(old.draft.limits) === JSON.stringify(limits)
    )
      return old;
    const draft: PlanVersion = {
      id: randomUUID(),
      terms,
      fixed: false,
      limits,
      ...(strategy?.rule && { rule: strategy.rule }),
      ...(strategy?.overlay && { overlay: strategy.overlay }),
      ...(strategy && { symbol: strategy.code, fast: strategy.fast, slow: strategy.slow, qty: strategy.qty }),
    };
    return { draft, previous: old?.draft.fixed ? old.draft : old?.previous };
  });
}
export { planStem } from '../shared/trading-plan.ts';

export function fixTradingDraft(store: Store, kis: KisClient, raw: unknown) {
  const { kind, expectedId } = fixInput.parse(raw);
  if (store.path === ':memory:') throw new Error('고정하려면 디스크에 저장된 일반 원장이 필요합니다.');
  return store.changeTradingPlan(kind, expectedId, (old) => {
    if (!old || old.draft.fixed) throw new Error('이미 고정됐거나 저장된 초안이 없습니다.');
    const { draft } = old,
      terms = draft.terms,
      state = store.read();
    if (JSON.stringify(draft.limits) !== JSON.stringify(planLimits(state)))
      throw new Error('일반 한도가 변경됐습니다. 한도 단계에서 초안을 다시 저장하세요.');
    validWindow(terms);
    const strategy = terms.kind === 'strategy' ? selectedStrategy(state, terms) : undefined;
    if (
      strategy &&
      (strategy.code !== draft.symbol ||
        strategy.fast !== draft.fast ||
        strategy.slow !== draft.slow ||
        strategy.qty !== draft.qty || !sameStrategyConditions(strategy, draft))
    )
      throw new Error('저장 전략 조건을 다시 확인하세요.');
    let instrumentKind: 'stock' | 'etf' | undefined;
    if (terms.policy) {
      const code = terms.kind === 'once' ? terms.code : strategy!.code;
      const master = store.masterData();
      const row = master.instruments.find((r) => r.code === code);
      const source = master.sources.find((r) => r.exchange === (row?.exchange ?? 'KOSPI'));
      instrumentKind = assetKind(
        code,
        terms.policy.masterDays,
        row,
        source,
        master.removed.some((r) => r.code === code),
      );
    }
    const root = join(dirname(realpathSync(store.path)), 'trading-runs');
    mkdirSync(root, { recursive: true, mode: 0o700 });
    if (realpathSync(root) !== root) throw new Error('전용 원장 디렉터리 경로를 확인하세요.');
    const folder = join(root, planStem(kind, draft.id));
    let runId: string = randomUUID();
    if (existsSync(folder)) {
      if (realpathSync(folder) !== folder) throw new Error('고정 디렉터리의 실제 경로를 확인하세요.');
      const manifests = readdirSync(folder).filter((name) => name.endsWith('.json'));
      if (manifests.length !== 1) throw new Error('고정 디렉터리의 파일을 확인하세요.');
      const prefix = kind === 'once' ? 'approval-' : 'strategy-';
      const name = manifests[0];
      if (!name.startsWith(prefix)) throw new Error('고정 파일 종류를 확인하세요.');
      runId = z.uuid().parse(name.slice(prefix.length, -5));
    }
    const stem = planStem(kind, runId),
      ledgerPath = join(folder, stem + '.sqlite');
    const accountFingerprint = kis.accountFingerprint();
    const config =
      terms.kind === 'once'
        ? preparedApprovalSchema.parse({
            date: terms.date,
            requestId: runId,
            ledgerPath,
            accountFingerprint,
            code: terms.code,
            ...(terms.policy && { policy: terms.policy, assetKind: instrumentKind }),
            maxQty: terms.maxQty,
            maxAmount: terms.maxAmount,
            ...(terms.orderType === 'market' && { orderType: 'market' }),
            ...(terms.allowExistingHolding && { allowExistingHolding: true }),
            ...(terms.cancelProbe && { cancelProbe: true }),
          })
        : strategyContractSchema.parse({
            ...termsWithoutKind(terms),
            contractId: runId,
            ledgerPath,
            accountFingerprint,
            code: strategy!.code,
            fast: strategy!.fast,
            slow: strategy!.slow,
            qty: strategy!.qty,
            ...(draft.rule && { rule: draft.rule }),
            ...(draft.overlay && { overlay: draft.overlay }),
          });
    const contents =
      JSON.stringify({ version: 1, draftId: draft.id, sourceLedger: realpathSync(store.path), config }) + '\n';
    if (existsSync(folder)) {
      // A crash after publication but before SQLite commit must not allocate another run.
      const manifest = join(folder, stem + '.json');
      if (realpathSync(folder) !== folder || !existsSync(ledgerPath) || readFileSync(manifest, 'utf8') !== contents)
        throw new Error('고정 경로가 사용 중입니다. 기존 원장을 확인하세요.');
      inspectPreparedRun(manifest, kind, ledgerPath, false);
    } else {
      const staging = mkdtempSync(join(root, '.prepare-'));
      try {
        const seed = new Store(join(staging, stem + '.sqlite'));
        try {
          seed.update((s) => {
            s.risk = { ...state.risk };
            s.paperManualMaxQty = state.paperManualMaxQty ?? DEFAULT_PAPER_MAX_QTY;
            if (strategy)
              s.strategies = [
                {
                  ...strategy,
                  active: false,
                  lastSignal: 'hold',
                  lastTick: -1,
                  run: 0,
                  lastEvent: undefined,
                  evaluations: [],
                },
              ];
          });
          if ('requestId' in config) seed.configurePaperRun(config);
          else {
            for (const run of store.dailyRuns().reverse())
              if (eligibleDailyRun(run, config.code)) seed.saveDaily(run, store.dailyBars(run.id), undefined, { preserveHistory: true });
            seed.bindStrategyContract(config);
          }
        } finally {
          seed.close();
        }
        writeFileSync(join(staging, stem + '.json'), contents, { flag: 'wx', mode: 0o600 });
        renameSync(staging, folder);
      } finally {
        if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
      }
    }
    return { ...old, draft: { ...draft, runId, fixed: true } };
  });
}
function termsWithoutKind({ kind, ...rest }: Extract<TradingTerms, { kind: 'strategy' }>) {
  return rest;
}

// Only a named manifest and its original neighbouring ledger are valid; no "latest" lookup.
export function readPreparedRun(file: string, kind: PlanKind, db?: string) {
  return inspectPreparedRun(file, kind, db, true);
}
function inspectPreparedRun(file: string, kind: PlanKind, db: string | undefined, requirePublished: boolean) {
  const path = resolve(file),
    stat = lstatSync(path);
  if (
    !stat.isFile() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o077) !== 0 ||
    stat.uid !== process.getuid?.() ||
    realpathSync(path) !== path
  )
    throw new Error('고정 파일 권한·경로를 확인하세요.');
  const bundle = z
    .object({ version: z.literal(1), draftId: z.uuid(), sourceLedger: z.string().min(1), config: z.unknown() })
    .strict()
    .parse(JSON.parse(readFileSync(path, 'utf8')));
  const raw = bundle.config;
  const config = kind === 'once' ? preparedApprovalSchema.parse(raw) : strategyContractSchema.parse(raw);
  const stem = planStem(kind, 'requestId' in config ? config.requestId : config.contractId);
  const expected = join(dirname(path), stem + '.sqlite');
  if (
    basename(path) !== stem + '.json' ||
    basename(dirname(path)) !== planStem(kind, bundle.draftId) ||
    config.ledgerPath !== expected ||
    !config.accountFingerprint ||
    (db && resolve(db) !== expected) ||
    !existsSync(expected) ||
    realpathSync(expected) !== expected
  )
    throw new Error('고정 파일의 원래 전용 원장을 확인하세요.');
  const source = new DatabaseSync(bundle.sourceLedger, { readOnly: true });
  try {
    const runId = 'requestId' in config ? config.requestId : config.contractId;
    if (
      requirePublished &&
      !source
        .prepare('SELECT 1 FROM trading_pins WHERE run_id=? AND draft_id=? AND kind=?')
        .get(runId, bundle.draftId, kind)
    ) {
      throw new Error('일반 원장에서 고정 완료된 실행만 시작할 수 있습니다.');
    }
    const ledger = new DatabaseSync(expected, { readOnly: true });
    try {
      if ('requestId' in config) {
        const row = ledger.prepare('SELECT request_id,binding FROM paper_run WHERE id=1').get();
        if (row?.request_id !== runId || row.binding !== approvalBinding(config))
          throw new Error('고정 시 준비한 승인 원장이 아닙니다.');
      } else {
        if (ledger.prepare('SELECT body FROM strategy_contract WHERE id=1').get()?.body !== JSON.stringify(config))
          throw new Error('고정 시 준비한 전략 원장이 아닙니다.');
        const state = JSON.parse(String(source.prepare('SELECT body FROM workspace WHERE id=1').get()?.body)) as State;
        assertStrategyIdentity(
          config,
          state.strategies.find((s) => s.id === config.strategyId),
        );
      }
    } finally {
      ledger.close();
    }
  } finally {
    source.close();
  }
  // A stale master blocks new sends, while the same ledger remains available for reconciliation.
  const checkInstrument =
    'policy' in config && config.policy
      ? () => {
          const db = new DatabaseSync(bundle.sourceLedger, { readOnly: true });
          try {
            db.exec('PRAGMA busy_timeout = 5000; BEGIN');
            const record = db.prepare('SELECT body FROM market_instruments WHERE code=?').get(config.code!);
            const row: MasterInstrument | undefined = record && JSON.parse(String(record.body));
            const market = db.prepare('SELECT body FROM market_master WHERE exchange=?').get(row?.exchange ?? 'KOSPI');
            const removed = !!db.prepare('SELECT 1 FROM market_removed WHERE code=?').get(config.code!);
            const kind = assetKind(
              config.code!,
              config.policy!.masterDays,
              row,
              market && JSON.parse(String(market.body)),
              removed,
            );
            if ('assetKind' in config && config.assetKind !== kind)
              throw new Error('고정한 종목 유형과 현재 마스터가 다릅니다.');
          } finally {
            db.close();
          }
        }
      : undefined;
  return { config, path: expected, checkInstrument };
}
