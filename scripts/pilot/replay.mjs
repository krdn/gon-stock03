import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium, errors } from 'playwright';

const base = 'http://127.0.0.1:4314';
const codes = ['005930', '000660', '069500', '035420'];
const instruments = codes.map(code => ({ code, name: code, isin: '', exchange: 'KOSPI', kind: 'stock', group: 'ST' }));
const results = [];

async function boundaryEvidence() {
  const interfaces = readFileSync('/proc/net/dev', 'utf8').trim().split('\n').slice(2).map(line => line.split(':')[0].trim());
  const routes = readFileSync('/proc/net/route', 'utf8').trim().split('\n').slice(1).length;
  const credentialNames = Object.keys(process.env).filter(name => /^(?:KIS_|INFISICAL_|GH_TOKEN$|GITHUB_TOKEN$|OPENAI_API_KEY$|CODEX_API_KEY$)/.test(name));
  assert.deepEqual(interfaces, ['lo']);
  assert.equal(routes, 0);
  assert.equal(credentialNames.length, 0);
  const absent = ['/home/gon', '/input/.git', '/input/.local', '/run/docker.sock'];
  for (const path of absent) assert.equal(existsSync(path), false, path);
  for (const port of [4303, 4304]) {
    await assert.rejects(fetch('http://127.0.0.1:' + port, {signal: AbortSignal.timeout(1000)}), error => error.cause?.code === 'ECONNREFUSED');
  }
  return { interfaces, routes, credentialNames: credentialNames.length, absent, refusedPorts: [4303, 4304] };
}

const boundary = await boundaryEvidence();
const stateResponse = await fetch(base + '/api/state');
assert.equal(stateResponse.status, 200);
const clean = await stateResponse.json();
const browser = await chromium.launch();
const runtime = { node: process.version, playwright: createRequire(import.meta.url)('playwright/package.json').version, chromium: browser.version() };

async function visible(locator) {
  try {
    await locator.waitFor({ state: 'visible' });
    return true;
  } catch (error) {
    if (error instanceof errors.TimeoutError) return false;
    throw error;
  }
}

async function scenario(name, run) {
  const page = await browser.newPage();
  page.setDefaultTimeout(4000);
  try {
    const { observed, expected } = await run(page);
    results.push({name, observed, expected, pass: Object.entries(expected).every(([key, value]) => observed[key] === value)});
  } catch (error) {
    if (!(error instanceof errors.TimeoutError || error instanceof assert.AssertionError || error.message.includes('strict mode violation'))) throw error;
    results.push({name, pass: false, observed: {}, error: error.message.split('\n')[0]});
  } finally {
    await page.close();
  }
}

async function market(page, stateHandler) {
  const marketRequests = [];
  let states = 0;
  const marketPath = url => url.pathname.startsWith('/api/market/');
  // Also observe fetch at the call site so a late network event cannot make an issued request look like zero.
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window);
    window.__pilotMarketFetches = 0;
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input, location.href);
      if (url.pathname.startsWith('/api/market/')) window.__pilotMarketFetches++;
      return fetch(input, init);
    };
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (marketPath(url)) marketRequests.push({ path: url.pathname, body: request.postData() });
  });
  await page.route('**/api/data/master', route => route.fulfill({json: { instruments, sources: [], removed: [] }}));
  await page.route(marketPath, route => route.fulfill({status: 503, body: 'fixture quote'}));
  await page.route('**/api/state', route => { states++; return stateHandler(route); });
  await page.goto(base + '/watchlist');
  await page.getByRole('heading', {name: '나의 관심종목'}).waitFor();
  return {marketRequests, states: () => states};
}

try {
  await scenario('first 503 and confirmed empty after retry', async page => {
    await page.clock.install();
    let failed = true;
    const requests = await market(page, route => failed ? route.fulfill({status: 503, body: 'fixture'}) : route.fulfill({json: {...clean, watchlist: []}}));
    await page.waitForFunction(() => document.body.textContent.includes('화면 미리보기') && document.body.textContent.includes('다시 확인'));
    await page.getByRole('button', {name: '마스터 갱신', exact: true}).waitFor();
    await page.clock.runFor(16000);
    assert.ok(requests.states() > 0);
    const previewRows = await page.locator('tbody tr').count();
    const issuedMarketFetches = await page.evaluate(() => window.__pilotMarketFetches);
    const quoteRequests = requests.marketRequests.length;
    failed = false;
    await page.getByRole('button', {name: '다시 확인', exact: true}).click();
    const confirmedEmpty = await visible(page.getByText('관심종목이 없습니다', {exact: true})) && await page.locator('tbody tr').count() === 0;
    return {observed: {previewRows, quoteRequests, issuedMarketFetches, confirmedEmpty}, expected: {previewRows: 0, quoteRequests: 0, issuedMarketFetches: 0, confirmedEmpty: true}};
  });
  await scenario('confirmed list survives later 503', async page => {
    await page.clock.install();
    let fail = false;
    const requests = await market(page, route => fail ? route.fulfill({status: 503, body: 'fixture'}) : route.fulfill({json: {...clean, watchlist: [codes[0]]}}));
    const row = page.locator('tbody tr').filter({hasText: codes[0]});
    await row.waitFor();
    await page.getByRole('button', {name: '마스터 갱신', exact: true}).waitFor();
    await page.clock.runFor(1000);
    const quoteSeen = requests.marketRequests.some(request => {
      if (request.path !== '/api/market/quote') return false;
      try { return JSON.parse(request.body)?.code === codes[0]; }
      catch { return false; }
    });
    const response = page.waitForResponse(res => new URL(res.url()).pathname === '/api/state' && res.status() === 503);
    fail = true;
    await Promise.all([response, page.clock.runFor(4000)]);
    await page.getByRole('button', {name: '다시 확인', exact: true}).waitFor();
    assert.ok(requests.states() >= 2);
    const toggleDisabled = await row.getByRole('button', {name: /관심 해제/}).isDisabled();
    return {observed: {savedRows: await row.count(), toggleDisabled, quoteSeen}, expected: {savedRows: 1, toggleDisabled: true, quoteSeen: true}};
  });
  await scenario('journal draft survives failed save', async page => {
    await page.goto(base + '/journal');
    const input = page.getByLabel('매매 메모');
    await page.locator('form button:enabled').waitFor();
    await input.fill('오프라인 초안');
    await page.route('**/api/journal', route => route.fulfill({status: 500, json: {error: '요청과 이벤트 저장에 실패했습니다. 저장소 상태를 확인하세요.'}}));
    await page.getByRole('button', {name: '일지 저장'}).click();
    const failureVisible = await visible(page.getByRole('alert').filter({hasText: '저장에 실패'}));
    const savedEntries = await page.locator('.journal-entry').filter({hasText: '오프라인 초안'}).count();
    return {observed: {draft: await input.inputValue(), savedEntries, failureVisible}, expected: {draft: '오프라인 초안', savedEntries: 0, failureVisible: true}};
  });
  console.log(JSON.stringify({runtime, boundary, replay: results}));
  process.exitCode = results.every(item => item.pass) ? 0 : 1;
} finally {
  await browser.close();
}
