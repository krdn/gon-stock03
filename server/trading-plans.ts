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
  planLimits,
  type PlanKind,
  type PlanVersion,
  type TradingTerms,
  type TradingSettingsData,
} from '../shared/trading-plan.ts';
import { DEFAULT_PAPER_MAX_QTY } from '../shared/contracts.ts';
import type { State } from '../shared/model.ts';
import { Store } from './store.ts';
import { paperApprovalSchema, type PaperApproval } from './paper.ts';
import { assertStrategyIdentity, strategyContractSchema, type StrategyContract } from './strategy-contract.ts';
import { koreaDate, type KisClient } from './kis.ts';

const kindSchema = z.enum(['once', 'strategy']);
const saveInput = z.object({ expectedId: z.uuid().nullable(), terms: tradingTerms }).strict();
const fixInput = z.object({ kind: kindSchema, expectedId: z.uuid() }).strict();

function selectedStrategy(state: State, terms: Extract<TradingTerms, { kind: 'strategy' }>) {
  const strategy = state.strategies.find((s) => s.id === terms.strategyId && s.environment === 'kis-paper');
  if (!strategy || strategy.revision !== terms.revision)
    throw new Error('저장 전략 revision이 달라졌습니다. 대상을 다시 선택하세요.');
  return strategy;
}
function validWindow(terms: TradingTerms) {
  if (terms.kind === 'once') {
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
      old &&
      JSON.stringify(old.draft.terms) === JSON.stringify(terms) &&
      JSON.stringify(old.draft.limits) === JSON.stringify(limits)
    )
      return old;
    const draft: PlanVersion = {
      id: randomUUID(),
      terms,
      fixed: false,
      limits,
      ...(strategy && { symbol: strategy.code, fast: strategy.fast, slow: strategy.slow, qty: strategy.qty }),
    };
    return { draft, previous: old?.draft.fixed ? old.draft : old?.previous };
  });
}
export function planStem(kind: PlanKind, id: string) {
  return (kind === 'once' ? 'approval-' : 'strategy-') + id;
}

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
        strategy.qty !== draft.qty)
    )
      throw new Error('저장 전략 조건을 다시 확인하세요.');
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
        ? paperApprovalSchema.parse({
            date: terms.date,
            requestId: runId,
            ledgerPath,
            accountFingerprint,
            code: terms.code,
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
          else seed.bindStrategyContract(config);
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
  const config = kind === 'once' ? paperApprovalSchema.parse(raw) : strategyContractSchema.parse(raw);
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
        if (
          row?.request_id !== runId ||
          row.binding !== JSON.stringify([expected, config.accountFingerprint, !!config.cancelProbe])
        )
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
  return { config, path: expected };
}
