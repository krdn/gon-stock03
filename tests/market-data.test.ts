import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.ts';
import { KisClient } from '../server/kis.ts';
import { MarketData, parseMaster } from '../server/market-data.ts';
import { addDays, dailyInput, masterSourceLabel } from '../shared/market-data.ts';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTestServer } from './test-server.ts';

const credentials = { key: 'fixture-key', secret: 'fixture-secret', account: '00000000', product: '01' };
const row = (date: string) => ({ stck_bsop_date: date, stck_oprc: '100', stck_hgpr: '110', stck_lwpr: '90', stck_clpr: '105', acml_vol: '42' });

test('daily API persists paged progress and provenance, resumes failures and does not mix DEMO', async () => {
  const store = new Store(':memory:'); const id = randomUUID(); let fail = false; const windows: string[][] = [];
  const kis = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) return Response.json({ access_token: 'fixture-token', expires_in: 86400 });
    const query = new URL(String(url)).searchParams;
    assert.equal(query.get('FID_INPUT_ISCD'), '005930'); assert.equal(query.get('FID_ORG_ADJ_PRC'), '1');
    windows.push([query.get('FID_INPUT_DATE_1')!, query.get('FID_INPUT_DATE_2')!]);
    if (fail) return new Response('fixture-secret', { status: 429 });
    return Response.json({ rt_cd: '0', output2: [row(query.get('FID_INPUT_DATE_1')!)] });
  }, 0);
  const { url, close } = await startTestServer(store, kis);
  const post = async (path: string, input: unknown) => {
    const response = await fetch(`${url}/api/data/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workbench': 'local' }, body: JSON.stringify(input) });
    assert.equal(response.status, 200); return response.json();
  };
  try {
    const before = store.read();
    const input = { id, code: '005930', from: '20260101', to: '20260415', adjustment: 'raw' };
    const { run: initial } = await post('daily', input);
    assert.equal(initial.nextDate, '20260101'); assert.equal(windows.length, 0);
    const { run: first } = await post('daily/step', { id });
    assert.equal(first.nextDate, '20260401'); assert.equal(first.status.pages, 1); assert.equal(first.status.complete, false);
    fail = true;
    const { run: failed } = await post('daily/step', { id });
    assert.equal(failed.status.phase, 'partial'); assert.equal(failed.nextDate, first.nextDate); assert.equal(failed.status.pages, 1);
    assert.ok(!JSON.stringify(failed).includes('fixture-secret'));
    assert.match(failed.status.error, /HTTP 429/); assert.match(failed.status.error, /연결·인증·제한/);
    fail = false;
    const { run: done } = await post('daily/step', { id });
    assert.equal(done.nextDate, null); assert.equal(done.coverageComplete, true); assert.equal(done.quality.state, 'unverified');
    assert.equal(done.status.complete, false); assert.equal(done.status.lastSuccessAt, null);
    await post('daily/step', { id }); assert.equal(windows.length, 3);
    const stored = await (await fetch(`${url}/api/data/daily/${id}`)).json();
    assert.deepEqual(stored.bars.map((b: { date: string }) => b.date), ['20260101', '20260401']);
    assert.equal(stored.bars[0].code, '005930'); assert.equal(stored.bars[0].adjustment, 'raw');
    assert.equal(stored.bars[0].source, 'kis-rest'); assert.ok(stored.bars[0].collectedAt); assert.equal(stored.bars[0].volume, 42);
    assert.deepEqual(store.read(), before);
  } finally { await close(); store.close(); }
});

const config = <T extends object = Record<never, never>>(extra = {} as T) => ({ id: randomUUID(), code: '005930', from: '20260102', to: '20260105', adjustment: 'adjusted' as const, ...extra });
const clientFor = (output2: unknown[]) => new KisClient(credentials, async url => String(url).endsWith('/tokenP') ? Response.json({ access_token: 'fixture-token', expires_in: 86400 }) : Response.json({ rt_cd: '0', output2 }), 0);

test('master ZIP download validates CP949, stock/ETF groups, leading zeroes and atomic market replacement', async () => {
  const store = new Store(':memory:'); let fail = false;
  const service = new MarketData(store, clientFor([]), async (url, init) => {
    assert.equal(init?.redirect, 'error'); assert.ok(String(url).startsWith('https://new.real.download.dws.co.kr/common/master/'));
    if (fail && String(url).includes('kosdaq')) return new Response('bad', { status: 503 });
    const market = String(url).includes('kospi') ? 'kospi' : 'kosdaq';
    return new Response(readFileSync(new URL(`./fixtures/${market}-master.zip`, import.meta.url)));
  });
  try {
    const result = await service.refreshMaster();
    assert.equal(result.instruments.length, 4);
    assert.equal(result.instruments.find(row => row.code === '005930')?.name, '삼성전자');
    assert.equal(result.instruments.find(row => row.code === '069500')?.kind, 'etf');
    assert.equal(result.instruments.find(row => row.code === '00088K')?.kind, 'stock');
    assert.ok(result.sources.every(source => source.phase === 'ready' && source.sha256?.length === 64 && source.lastSuccessAt));
    fail = true; const retry = await service.refreshMaster();
    assert.equal(retry.instruments.length, 4); assert.equal(retry.sources.find(row => row.exchange === 'KOSDAQ')?.phase, 'error');
    assert.deepEqual(retry.instruments, result.instruments);
    assert.ok(retry.sources.every(source => source.phase === 'error'));
    assert.equal(retry.sources.find(row => row.exchange === 'KOSPI')?.lastSuccessAt, result.sources.find(row => row.exchange === 'KOSPI')?.lastSuccessAt);
    assert.equal(retry.sources.find(row => row.exchange === 'KOSDAQ')?.lastSuccessAt, result.sources.find(row => row.exchange === 'KOSDAQ')?.lastSuccessAt);
    const old = store.masterData();
    assert.throws(() => store.saveMasters([{ exchange: 'KOSPI', source: 'fixture', sha256: 'fixture', collectedAt: new Date().toISOString(), rows: [old.instruments[0], old.instruments[0]] }]));
    assert.deepEqual(store.masterData(), old);
  } finally { store.close(); }
});

test('a KOSDAQ to KOSPI transfer preserves one code; inconsistent market snapshots roll back together', () => {
  const store = new Store(':memory:');
  const kospi = parseMaster(Buffer.from('005930   KR7005930003Samsung'.padEnd(61) + 'ST' + ' '.repeat(225) + '\n'), 'KOSPI');
  const kosdaq = parseMaster(Buffer.from('035420   KR7035420009Naver'.padEnd(61) + 'ST' + ' '.repeat(219) + '\n'), 'KOSDAQ');
  try {
    store.saveMasters([kospi, kosdaq]);
    const moved = { ...kosdaq.rows[0], exchange: 'KOSPI' as const };
    store.saveMasters([{ ...kospi, rows: [...kospi.rows, moved] }, { ...kosdaq, rows: [] }]);
    assert.equal(store.masterData().instruments.length, 2);
    assert.equal(store.masterData().instruments.find(row => row.code === '035420')?.exchange, 'KOSPI');
    const previous = store.masterData();
    assert.throws(() => store.saveMasters([{ ...kospi, rows: [...kospi.rows, moved] }, kosdaq]));
    assert.deepEqual(store.masterData(), previous);
  } finally { store.close(); }
});

test('unrecognized source and missing successful collection stay unconfirmed', () => {
  const state = { exchange: 'KOSPI' as const, source: 'https://unrecognized.test/master', phase: 'ready' as const,
    lastSuccessAt: new Date().toISOString(), observedAt: new Date().toISOString(), sha256: 'a'.repeat(64), count: 1, error: null };
  assert.equal(masterSourceLabel(state), '목록 출처 미확인');
  assert.equal(masterSourceLabel({ ...state, source: 'synthetic', lastSuccessAt: null }), '목록 출처 미확인');
});

test('master rejects malformed, empty and duplicate data without accepting a shifted layout', () => {
  const line = '005930   KR7000000000Example'.padEnd(61) + 'ST' + ' '.repeat(225);
  assert.throws(() => parseMaster(Buffer.from('broken'), 'KOSPI'), /고정폭/);
  assert.throws(() => parseMaster(Buffer.from(''), 'KOSPI'), /없습니다/);
  assert.throws(() => parseMaster(Buffer.from(line + '\n' + line + '\n'), 'KOSPI'), /중복/);
  assert.throws(() => parseMaster(Buffer.from(line + 'X\n'), 'KOSPI'), /없습니다/);
});

test('an interrupted master refresh is persisted as incomplete instead of retaining a ready label', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stock03-master-restart-')); const path = join(directory, 'data.sqlite');
  const store = new Store(path); let recovery: Store | undefined; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const service = new MarketData(store, clientFor([]), async () => { await gate; return new Response('', { status: 503 }); });
  store.saveMasters([{ ...parseMaster(Buffer.from('005930   KR7005930003Example'.padEnd(61) + 'ST' + ' '.repeat(225)), 'KOSPI'), source: 'https://example.test/master' }]);
  const pending = service.refreshMaster();
  try {
    const loading = store.masterData();
    assert.equal(loading.sources.length, 2); assert.ok(loading.sources.every(source => source.phase === 'loading'));
    assert.equal(loading.sources.find(s => s.exchange === 'KOSPI')?.source, 'https://example.test/master');
    recovery = new Store(path);
    assert.ok(recovery.masterData().sources.every(source => source.phase === 'error' && source.error?.includes('재시작')));
    release();
    const retry = await pending;
    assert.equal(retry.sources.find(s => s.exchange === 'KOSPI')?.source, 'https://example.test/master');
  } finally { release(); await pending; recovery?.close(); store.close(); rmSync(directory, { recursive: true }); }
});

test('calendar dates distinguish gaps, holidays, unexpected days and identical duplicate observations', async () => {
  const store = new Store(':memory:');
  try {
    const service = new MarketData(store, clientFor([row('20260102'), row('20260102'), row('20260105')]));
    const input = config({ calendar: { source: 'https://example.test/calendar-fixture', dates: ['20260105', '20260102'] } });
    service.start(input); const done = await service.step(input.id);
    assert.equal(done.status.complete, true); assert.equal(done.status.phase, 'ready'); assert.ok(done.status.lastSuccessAt);
    assert.equal(done.quality.state, 'passed'); assert.equal(done.quality.duplicates, 1); assert.equal(store.dailyBars(input.id).length, 2);
    assert.equal(done.calendar?.source, input.calendar.source);
    assert.equal(service.start(input).status.complete, true);
    assert.throws(() => service.start({ ...input, adjustment: 'raw' }), /조건/);
    const missing = config({ calendar: { source: 'https://example.test/calendar-fixture', dates: ['20260102'] } });
    service.start(missing); const mismatch = await service.step(missing.id);
    assert.equal(mismatch.quality.state, 'failed'); assert.deepEqual(mismatch.quality.unexpectedDates, ['20260105']); assert.equal(mismatch.status.complete, false);
    const gaps = new MarketData(store, clientFor([row('20260102')]));
    const expected = config({ calendar: { source: 'https://example.test/calendar-fixture', dates: ['20260102', '20260105'] } });
    gaps.start(expected); const gap = await gaps.step(expected.id);
    assert.deepEqual(gap.quality.missingDates, ['20260105']); assert.equal(gap.status.complete, false);
    const unknown = config(); gaps.start(unknown); const unverified = await gaps.step(unknown.id);
    assert.equal(unverified.quality.state, 'unverified'); assert.deepEqual(unverified.quality.candidateMissingDates, ['20260105']);
  } finally { store.close(); }
});

test('bad dates, OHLC, out-of-window rows, too many rows and conflicting duplicates never advance the checkpoint', async () => {
  for (const rows of [
    [row('20260230')], [row('20260101')], [{ ...row('20260102'), stck_hgpr: '99' }],
    [{ ...row('20260102'), acml_vol: '9007199254740992' }], [row('20260102'), { ...row('20260102'), stck_clpr: '106' }],
    Array.from({ length: 101 }, () => row('20260102')), [{ ...row('20260102'), stck_clpr: '' }],
    [{ ...row('20260102'), stck_oprc: '0', stck_hgpr: '0', stck_lwpr: '0', stck_clpr: '0', acml_vol: '0' }],
    [{ ...row('20260102'), stck_oprc: '0', stck_hgpr: '0', stck_lwpr: '0', stck_clpr: '0' }],
    [{ ...row('20260102'), stck_oprc: '0', stck_lwpr: '0' }],
  ]) {
    const store = new Store(':memory:');
    try {
      const service = new MarketData(store, clientFor(rows)); const input = config(); service.start(input);
      const failed = await service.step(input.id);
      assert.equal(failed.status.phase, 'error'); assert.equal(failed.nextDate, input.from); assert.equal(failed.status.pages, 0);
      assert.deepEqual(store.dailyBars(input.id), []);
      assert.match(failed.status.error ?? '', /원천 데이터/);
    } finally { store.close(); }
  }
});

test('empty windows are recorded, zero-volume suspensions are retained and no gap is filled synthetically', async () => {
  const store = new Store(':memory:');
  try {
    const service = new MarketData(store, clientFor([])); const input = config(); service.start(input);
    const empty = await service.step(input.id);
    assert.deepEqual(empty.quality.emptyWindows, [{ from: input.from, to: input.to }]);
    assert.equal(empty.status.complete, false); assert.equal(empty.quality.state, 'unverified'); assert.equal(store.dailyBars(input.id).length, 0);
    const suspended = new MarketData(store, clientFor([{ ...row('20260102'), stck_oprc: '0', stck_hgpr: '0', stck_lwpr: '0', acml_vol: '0' }]));
    const next = config(); suspended.start(next); await suspended.step(next.id);
    assert.equal(store.dailyBars(next.id)[0].volume, 0); assert.equal(store.dailyBars(next.id)[0].open, 0);
  } finally { store.close(); }
});

test('SQLite restart retains progress and atomic page rollback retains the old cursor', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stock03-data-')); const path = join(directory, 'data.sqlite'); let store = new Store(path);
  try {
    const input = config({ to: '20260501' }); let service = new MarketData(store, clientFor([row('20260102')]));
    service.start(input); const first = await service.step(input.id); const before = store.dailyBars(input.id);
    assert.throws(() => store.saveDaily({ ...first, nextDate: null }, [before[0], before[0]]));
    assert.equal(store.dailyRun(input.id)?.nextDate, first.nextDate); assert.deepEqual(store.dailyBars(input.id), before);
    store.saveDaily({ ...first, status: { ...first.status, phase: 'loading' } });
    store.close(); store = new Store(path);
    assert.equal(store.dailyRun(input.id)?.status.phase, 'partial'); assert.match(store.dailyRun(input.id)?.status.error ?? '', /재시작/);
    service = new MarketData(store, clientFor([row(first.nextDate!)]));
    const done = await service.step(input.id); assert.equal(done.coverageComplete, true); assert.equal(store.dailyBars(input.id).length, 2);
    assert.equal(store.dailyBars(input.id)[0].collectedAt, before[0].collectedAt);
  } finally { store.close(); rmSync(directory, { recursive: true }); }
});

test('collection serializes concurrent steps and rejects next-day resumption and unfinished days', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-15T01:00:00Z') });
  const store = new Store(':memory:'); let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }); let calls = 0;
  const kis = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) return Response.json({ access_token: 'fixture-token', expires_in: 86400 });
    calls++; await gate; return Response.json({ rt_cd: '0', output2: [row('20260102')] });
  }, 0);
  try {
    const service = new MarketData(store, kis); const input = config({ to: '20260501' }); service.start(input);
    assert.throws(() => service.start(config({ from: '20261115', to: '20261115' })), /오늘/);
    const first = service.step(input.id); await assert.rejects(service.step(input.id), /수집 중/);
    release(); await first; assert.equal(calls, 1);
    t.mock.timers.tick(86_400_000); await assert.rejects(service.step(input.id), /새 ID/); assert.equal(calls, 1);
  } finally { release(); store.close(); }
});

test('input validates real dates, leading zeroes, calendar uniqueness and range; windows cross leap years', () => {
  assert.equal(addDays('20240228', 1), '20240229'); assert.equal(addDays('20241231', 1), '20250101');
  for (const change of [{ from: '20260230' }, { code: 5930 }, { from: '20260106' }, { to: '20370102' }, { adjustment: 'unknown' },
    { calendar: { source: 'no-url', dates: [] } }, { calendar: { source: 'https://example.test', dates: ['20260102', '20260102'] } },
    { calendar: { source: 'https://example.test', dates: ['20260106'] } }]) assert.equal(dailyInput.safeParse(config(change)).success, false, JSON.stringify(change));
  assert.equal(dailyInput.parse(config({ code: '00088K' })).code, '00088K');
  assert.doesNotThrow(() => assert.equal(dailyInput.safeParse(config({ from: 'bad', to: 'later' })).success, false));
});

test('a request crossing Seoul midnight cannot append a different adjustment vintage', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-15T14:59:59Z') });
  const store = new Store(':memory:');
  const kis = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) return Response.json({ access_token: 'fixture-token', expires_in: 86400 });
    t.mock.timers.tick(2000); return Response.json({ rt_cd: '0', output2: [row('20260102')] });
  }, 0);
  try {
    const service = new MarketData(store, kis); const input = config(); service.start(input);
    const result = await service.step(input.id);
    assert.equal(result.status.complete, false); assert.equal(result.status.pages, 0); assert.equal(result.nextDate, input.from);
    assert.deepEqual(store.dailyBars(input.id), []);
  } finally { store.close(); }
});
