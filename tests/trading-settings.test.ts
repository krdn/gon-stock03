import { createExperiment } from '../server/backtest.ts';
import { STRATEGY_CATALOG } from '../shared/strategy-rules.ts';
import { strategyContractSchema } from '../server/strategy-contract.ts';
import { dailyFixture } from './backtest-fixture.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.ts';
import { KisClient } from '../server/kis.ts';
import { PaperBroker, type PaperApproval } from '../server/paper.ts';
import { makeServer } from '../server/http.ts';
import { orderHistory } from '../server/order-history.ts';
import { activeTerms, fixTradingDraft, readPreparedRun, saveTradingDraft } from '../server/trading-plans.ts';
import type { StrategyContract } from '../server/strategy-contract.ts';
import type { TradingTerms } from '../shared/trading-plan.ts';
import { startTestServer } from './test-server.ts';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'stock03-ui-plans-'));
  const store = new Store(join(dir, 'source.sqlite'));
  const kis = new KisClient({ key: 'fixture', secret: 'fixture', account: '00000000', product: '01' }, () => {
    throw Error('unexpected broker transport');
  });
  store.update((s) => {
    s.paperManualMaxQty = 8;
    s.risk.maxOrder = 320000;
    s.strategies.push({
      id: 'ui-strategy',
      name: 'KIS',
      environment: 'kis-paper',
      code: '005930',
      qty: 2,
      revision: 3,
      fast: 2,
      slow: 3,
      active: false,
      lastSignal: 'hold',
      lastTick: -1,
    });
  });
  return {
    dir,
    store,
    kis,
    close() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
const onceDraft: TradingTerms = {
  kind: 'once',
  date: '2099-01-05',
  code: '005930',
  orderType: 'limit',
  maxQty: 5,
  maxAmount: 150000,
  cancelProbe: true,
  allowExistingHolding: true,
};
const strategyDraft: TradingTerms = {
  kind: 'strategy',
  strategyId: 'ui-strategy',
  revision: 3,
  startsAt: '2099-01-05T09:00:00+09:00',
  endsAt: '2099-01-05T10:00:00+09:00',
  maxOrderAmount: 180000,
  maxTotalAmount: 360000,
  maxAttempts: 2,
  sellPolicy: 'deny',
};

for (const terms of [onceDraft, strategyDraft])
  test(`saving, fixing and reopening ${terms.kind} keeps origin/pinned terms and broker idle`, () => {
    const f = fixture();
    try {
      const args = { expectedId: null, terms };
      const plan = saveTradingDraft(f.store, args);
      assert.throws(() => saveTradingDraft(f.store, args), /다른 화면/);
      assert.equal(f.store.paperOrders().length, 0);
      const input = { kind: terms.kind, expectedId: plan.draft.id };
      const fixed = fixTradingDraft(f.store, f.kis, input);
      assert.equal(fixed.draft.fixed, true);
      assert.throws(() => fixTradingDraft(f.store, f.kis, input), /고정/);
      assert.equal(readdirSync(join(f.dir, 'trading-runs')).length, 1);
      const stem = (terms.kind === 'once' ? 'approval' : 'strategy') + '-' + plan.draft.id;
      const file = join(
        f.dir,
        'trading-runs',
        stem,
        (terms.kind === 'once' ? 'approval' : 'strategy') + '-' + fixed.draft.runId + '.json',
      );
      assert.equal(statSync(file).mode & 0o777, 0o600);
      const old = readFileSync(file);
      const history = orderHistory(f.store);
      assert.equal(history.sourceCount, 1); assert.deepEqual(history.unavailable, []);
      const prepared = readPreparedRun(file, terms.kind);
      assert.throws(() => readPreparedRun(file, terms.kind, join(f.dir, 'other.sqlite')), /원장/);
      const st = new Store(prepared.path, {
        contract: terms.kind === 'strategy' ? (prepared.config as StrategyContract) : undefined,
      });
      try {
        const approval = terms.kind === 'once' ? (prepared.config as PaperApproval) : undefined;
        const contract = terms.kind === 'strategy' ? (prepared.config as StrategyContract) : undefined;
        const broker = new PaperBroker(st, f.kis, approval, contract);
        assert.deepEqual(activeTerms(approval, contract), plan.draft.terms);
        assert.equal(st.read().paperManualMaxQty, 8);
        assert.equal(st.read().risk.maxOrder, 320000);
        assert.equal(
          st.read().strategies.some((s) => s.active),
          false,
        );
        assert.equal(st.paperOrders().length, 0);
        if (approval) {
          const other = new Store(join(f.dir, 'other.sqlite'));
          try {
            assert.throws(() => new PaperBroker(other, f.kis, approval), /원장/);
          } finally {
            other.close();
          }
          st.claimPaperRun();
          assert.throws(() => st.claimPaperRun(), /이미/);
          const { ledgerPath, accountFingerprint, ...stripped } = approval;
          assert.throws(() => new PaperBroker(st, f.kis, stripped), /원장|승인/);
        } else assert.equal(broker.strategyBudget()?.attempts, 0);
      } finally {
        st.close();
      }
      const updated = terms.kind === 'once' ? { ...terms, maxQty: 4 } : { ...terms, maxAttempts: 1 };
      const next = saveTradingDraft(f.store, { terms: updated, expectedId: plan.draft.id });
      assert.notEqual(next.draft.id, plan.draft.id);
      assert.deepEqual(next.previous, fixed.draft);
      assert.deepEqual(readFileSync(file), old);
      if (terms.kind === 'strategy') {
        f.store.update((s) => {
          s.strategies.at(-1)!.revision = 4;
        });
        assert.throws(
          () => fixTradingDraft(f.store, f.kis, { kind: 'strategy', expectedId: next.draft.id }),
          /revision/,
        );
        assert.throws(() => readPreparedRun(file, 'strategy'), /revision/);
      }
    } finally {
      f.close();
    }
  });
test('review rejects unsupported and expired conditions before creating a ledger', () => {
  const f = fixture();
  try {
    assert.throws(() => saveTradingDraft(f.store, { expectedId: null, terms: { ...onceDraft, orderType: 'market' } }));
    const p = saveTradingDraft(f.store, { expectedId: null, terms: { ...onceDraft, date: '2020-01-01' } });
    assert.throws(() => fixTradingDraft(f.store, f.kis, { kind: 'once', expectedId: p.draft.id }), /실행일/);
    assert.equal(f.store.tradingPlan('once')!.draft.fixed, false);
  } finally {
    f.close();
  }
});
test('approved HTTP server exposes a public copy and refuses trading settings writes', async () => {
  const f = fixture(),
    approval = { date: '2099-01-05', requestId: randomUUID(), code: '005930' as const };
  const srv = await startTestServer(f.store, f.kis, approval);
  try {
    const base = srv.url + '/api/';
    const view = await (await fetch(base + 'trading-settings')).json();
    assert.equal(view.active.kind, 'once');
    assert.equal(view.canFix, false);
    assert.ok(!JSON.stringify(view).includes(approval.requestId));
    for (const action of ['trading-settings/draft', 'trading-settings/fix', 'risk', 'kis/quantity-setting']) {
      const res = await fetch(base + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Workbench': 'local' },
        body: '{}',
      });
      assert.equal(res.status, 409);
    }
    const halt = await fetch(base + 'risk/halt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Workbench': 'local' },
      body: JSON.stringify({ halted: true }),
    });
    assert.equal(halt.status, 200);
    assert.equal(f.store.read().risk.halted, true);
    assert.equal(f.store.tradingPlan('once'), undefined);
    assert.equal(f.store.paperOrders().length, 0);
  } finally {
    await srv.close();
    f.close();
  }
});

test('named manifests start an idle server only with the matching account and original ledger', async () => {
  const { spawn } = await import('node:child_process');
  const { renameSync } = await import('node:fs');
  const f = fixture();
  try {
    for (const terms of [onceDraft, strategyDraft]) {
      const plan = saveTradingDraft(f.store, { expectedId: null, terms });
      const fixed = fixTradingDraft(f.store, f.kis, { kind: terms.kind, expectedId: plan.draft.id }).draft;
      const prefix = terms.kind === 'once' ? 'approval' : 'strategy';
      const manifest = join(f.dir, 'trading-runs', prefix + '-' + plan.draft.id, prefix + '-' + fixed.runId + '.json');
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        STOCK_PORT: '0',
        KIS_APP_KEY: 'fixture',
        KIS_APP_SECRET: 'fixture',
        KIS_CANO: '00000000',
        KIS_ACNT_PRDT_CD: '01',
      };
      for (const name of [
        'KIS_PAPER_APPROVAL',
        'KIS_STRATEGY_CONTRACT',
        'KIS_PAPER_APPROVAL_FILE',
        'KIS_STRATEGY_CONTRACT_FILE',
        'STOCK_DB',
      ])
        delete env[name];
      env[terms.kind === 'once' ? 'KIS_PAPER_APPROVAL_FILE' : 'KIS_STRATEGY_CONTRACT_FILE'] = manifest;
      const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const closed = once(child, 'exit');
      try {
        const baseUrl = await new Promise<string>((done, reject) => {
          let out = '';
          const timer = setTimeout(() => reject(Error('server startup timed out')), 10000);
          child.stdout.on('data', (data) => {
            out += String(data);
            const match = /GON Stock local server: (http:\/\/127\.0\.0\.1:\d+)\r?\n/.exec(out);
            if (match) {
              clearTimeout(timer);
              done(match[1]);
            }
          });
          child.once('exit', () => {
            clearTimeout(timer);
            reject(Error('server exited before ready'));
          });
        });
        const base = baseUrl + '/api/';
        const settings = await (await fetch(base + 'trading-settings')).json();
        const ledger = await (await fetch(base + 'kis/ledger')).json();
        assert.equal(settings.active.kind, terms.kind);
        assert.equal(settings.canFix, false);
        assert.deepEqual(ledger.orders, []);
      } finally {
        child.kill('SIGTERM');
        await closed;
      }
      const wrong = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
        env: { ...env, KIS_CANO: '00000001' },
        stdio: 'ignore',
      });
      assert.notEqual((await once(wrong, 'exit'))[0], 0);
      const dbPath = manifest.replace(/\.json$/, '.sqlite');
      renameSync(dbPath, dbPath + '.saved');
      assert.throws(() => readPreparedRun(manifest, terms.kind), /원장/);
    }
  } finally {
    f.close();
  }
});

test('retry after manifest publication and source DB rollback recovers the same run ID', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const f = fixture(),
    db = new DatabaseSync(f.store.path);
  try {
    const draft = saveTradingDraft(f.store, { expectedId: null, terms: onceDraft }).draft;
    db.exec("CREATE TRIGGER fail_pin BEFORE UPDATE ON trading_plans BEGIN SELECT RAISE(FAIL,'fixture rollback'); END");
    const args = { kind: 'once', expectedId: draft.id };
    assert.throws(() => fixTradingDraft(f.store, f.kis, args), /fixture rollback/);
    assert.equal(f.store.tradingPlan('once')?.draft.fixed, false);
    const folder = join(f.dir, 'trading-runs', `approval-${draft.id}`);
    const name = readdirSync(folder).find((v) => v.endsWith('.json'))!;
    const bytes = readFileSync(join(folder, name));
    assert.throws(() => readPreparedRun(join(folder, name), 'once'), /고정 완료/);
    db.exec('DROP TRIGGER fail_pin');
    const fixed = fixTradingDraft(f.store, f.kis, args);
    assert.equal(name, `approval-${fixed.draft.runId}.json`);
    assert.deepEqual(readFileSync(join(folder, name)), bytes);
    assert.equal(readdirSync(join(f.dir, 'trading-runs')).length, 1);
  } finally {
    db.close();
    f.close();
  }
});

test('fix requires re-review if the common risk limits changed after draft save', () => {
  const f = fixture();
  try {
    const draft = saveTradingDraft(f.store, { expectedId: null, terms: onceDraft }).draft;
    f.store.update((s) => {
      s.risk.maxOrder += 1000;
    });
    assert.throws(() => fixTradingDraft(f.store, f.kis, { kind: 'once', expectedId: draft.id }), /한도가 변경/);
    const next = saveTradingDraft(f.store, { expectedId: draft.id, terms: onceDraft }).draft;
    assert.notEqual(next.id, draft.id);
    assert.equal(next.limits.maxOrder, 321000);
    assert.equal(fixTradingDraft(f.store, f.kis, { kind: 'once', expectedId: next.id }).draft.fixed, true);
  } finally {
    f.close();
  }
});

test('새 마스터 종목으로 구형 전략 초안이나 원시 계약을 처음 바인딩할 수 없다', () => {
  const f = fixture();
  try {
    f.store.update((s) => {
      s.strategies.at(-1)!.code = '123456';
    });
    assert.throws(() => saveTradingDraft(f.store, { expectedId: null, terms: strategyDraft }), /확장 종목/);
    const raw = {
      ...strategyDraft,
      contractId: randomUUID(),
      ledgerPath: f.store.path,
      accountFingerprint: f.kis.accountFingerprint(),
      code: '123456',
      fast: 2,
      slow: 3,
      qty: 2,
    };
    assert.throws(() => f.store.bindStrategyContract(raw as StrategyContract), /확장 종목/);
    assert.equal(f.store.strategyContract(), undefined);
  } finally {
    f.close();
  }
});

test('확정 일봉 10종 계약·샹들리에 고정, 적격 일봉 복제 및 재개', () => {
  for (const {presets} of Object.values(STRATEGY_CATALOG)) {
    const rule = presets.basic;
    if (rule.kind === 'volatility_breakout') continue;
    const f = fixture();
    try {
      const overlay = {chandelier:{atrPeriod:7,atrMultiplier:2}};
      f.store.update(s => {
        const strategy = s.strategies.at(-1)!;
        Object.assign(strategy,{rule,overlay});
        if (rule.kind === 'ma_crossover') Object.assign(strategy,{fast:rule.fast,slow:rule.slow});
      });
      const {run,bars} = dailyFixture();
      run.code = '005930';
      bars.forEach(b => { b.code = run.code; });
      run.triggerSource = 'manual_sync';
      f.store.saveDaily(run,bars);
      createExperiment(f.store,{...dailyFixture().input,code:run.code});
      const later = {...run,id:randomUUID(),startedAt:'2026-01-25T01:00:00.000Z'};
      f.store.saveDaily(later,bars);
      f.store.saveDaily({...run,triggerSource:'manual',id:randomUUID(),quality:{...run.quality,state:'unverified'}},bars);
      const {draft} = saveTradingDraft(f.store,{terms:strategyDraft,expectedId:null});
      assert.deepEqual(draft.rule,rule);
      assert.deepEqual(draft.overlay,overlay);
      f.store.update(s => { s.strategies.at(-1)!.overlay = undefined; });
      assert.throws(()=>fixTradingDraft(f.store,f.kis,{kind:'strategy',expectedId:draft.id}),/조건을 다시 확인/);
      f.store.update(s => { s.strategies.at(-1)!.overlay = overlay; });
      const fixed = fixTradingDraft(f.store,f.kis,{kind:'strategy',expectedId:draft.id}).draft;
      const file = join(f.dir,'trading-runs','strategy-'+draft.id,'strategy-'+fixed.runId+'.json');
      const {path, config} = readPreparedRun(file,'strategy');
      const contract = config as StrategyContract;
      assert.deepEqual(contract.rule,rule);
      assert.deepEqual(contract.overlay,overlay);
      const seed = new Store(path,{contract});
      try {
        assert.deepEqual(seed.dailyRuns(),[later,run]);
        assert.deepEqual(seed.dailyBars(later.id),bars);
        assert.deepEqual(seed.dailyBars(run.id),bars);
        assert.equal(seed.read().strategies[0].active,false);
      } finally { seed.close(); }
    } finally { f.close(); }
  }
});

test('기본 SMA의 생략·비활성 필터와 빈 오버레이는 같은 레거시 계약이다', () => {
  const f = fixture();
  try {
    const {draft} = saveTradingDraft(f.store,{terms:strategyDraft,expectedId:null});
    const fixed = fixTradingDraft(f.store,f.kis,{kind:'strategy',expectedId:draft.id}).draft;
    const file = join(f.dir,'trading-runs','strategy-'+draft.id,'strategy-'+fixed.runId+'.json');
    const bytes = readFileSync(file,'utf8');
    assert.ok(!bytes.includes('"rule"') && !bytes.includes('"overlay"'));
    f.store.update(s => Object.assign(s.strategies.at(-1)!, {rule:{kind:'ma_crossover',maType:'sma',fast:2,slow:3,regimePeriod:null,minRelativeVolume:0}, overlay:{}}));
    const config = readPreparedRun(file,'strategy').config;
    assert.equal(readFileSync(file,'utf8'),bytes);
    assert.equal(strategyContractSchema.safeParse({...config,slow:110}).success,false);
    assert.equal(strategyContractSchema.safeParse({...config,slow:110,overlay:{chandelier:{atrPeriod:7,atrMultiplier:2}}}).success,true);
    assert.equal(strategyContractSchema.safeParse({...config,rule:{kind:'ma_crossover',maType:'ema',fast:3,slow:4}}).success,false);
    assert.equal(strategyContractSchema.safeParse({...config,rule:STRATEGY_CATALOG.volatility_breakout.presets.basic}).success,false);
    assert.equal(strategyContractSchema.safeParse({...config,overlay:{volatilityParity:{volLookback:10,targetAnnualVolPct:20,maxAllocationPct:100}}}).success,false);
  } finally { f.close(); }
});
