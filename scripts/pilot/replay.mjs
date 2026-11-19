import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:4314';
const browser = await chromium.launch();
const codes = ['005930', '000660', '069500', '035420'];
const instruments = codes.map(code => ({ code, name: code, isin: '', exchange: 'KOSPI', kind: 'stock', group: 'ST' }));
const clean = await (await fetch(base + '/api/state')).json();
const results = [];
async function scenario(name, run) {
  const page = await browser.newPage();
  try { const { observed, expected } = await run(page); results.push({name, observed, expected, pass: Object.keys(expected).every(k => observed[k] === expected[k])}); }
  finally { await page.close(); }
}
async function market(page, stateHandler) {
  let quotes = 0, stateResponses = 0;
  await page.route('**/api/data/master', route => route.fulfill({json: { instruments, sources: [], removed: [] }}));
  await page.route('**/api/market/quote', route => { quotes++; return route.fulfill({status:503,body:'fixture quote'}); });
  await page.route('**/api/state', route => {stateResponses++; return stateHandler(route);});
  await page.goto(base + '/watchlist');
  await page.getByRole('heading', {name:'나의 관심종목'}).waitFor();
  return {quotes:()=>quotes, states:()=>stateResponses};
}
try {
  await scenario('first 503 and confirmed empty after retry', async page => {
    await page.clock.install();
    let failed = true;
    const requests = await market(page, route => failed ? route.fulfill({status:503, body:'fixture'}) : route.fulfill({json:{...clean,watchlist:[]}}));
    await page.waitForFunction(() => document.body.textContent.includes('화면 미리보기') && document.body.textContent.includes('다시 확인'));
    await page.getByRole('button',{name:'마스터 갱신',exact:true}).waitFor();
    await page.clock.runFor(16000);
    assert.ok(requests.states() > 0);
    const previewRows = await page.locator('tbody tr').count(), quoteRequests = requests.quotes();
    failed = false;
    await page.getByRole('button',{name:'다시 확인',exact:true}).click();
    await page.getByText('관심종목이 없습니다',{exact:true}).waitFor();
    return {observed:{previewRows,quoteRequests,confirmedEmpty:true},expected:{previewRows:0,quoteRequests:0,confirmedEmpty:true}};
  });
  await scenario('confirmed list survives later 503', async page => {
    let fail = false;
    const requests = await market(page, route => fail ? route.fulfill({status:503,body:'fixture'}) : route.fulfill({json:{...clean,watchlist:[codes[0]]}}));
    const row = page.locator('tbody tr').filter({hasText:codes[0]});
    await row.waitFor();
    fail = true;
    await page.clock.install();
    const response = page.waitForResponse(res => res.url().endsWith('/api/state') && res.status()===503);
    await page.clock.runFor(4000); await response;
    await page.getByRole('button',{name:'다시 확인',exact:true}).waitFor();
    assert.ok(requests.states() >= 2);
    return {observed:{savedRows:await row.count(),toggleDisabled:await row.getByRole('button',{name:/관심 해제/}).isDisabled()},expected:{savedRows:1,toggleDisabled:true}};
  });
  await scenario('journal draft survives failed save', async page => {
    await page.goto(base+'/journal');
    const input = page.getByLabel('매매 메모');
    await input.fill('오프라인 초안');
    await page.route('**/api/journal', route=> route.fulfill({status:500,json:{error:'요청과 이벤트 저장에 실패했습니다. 저장소 상태를 확인하세요.'}}));
    await page.getByRole('button',{name:'일지 저장'}).click();
    await page.getByRole('alert').filter({hasText:'저장에 실패'}).waitFor();
    return {observed:{draft:await input.inputValue(),savedEntries:await page.locator('.journal-entry').filter({hasText:'오프라인 초안'}).count()},expected:{draft:'오프라인 초안',savedEntries:0}};
  });
  console.log(JSON.stringify({replay: results}));
  process.exitCode = results.every(x=>x.pass) ? 0 : 1;
} finally { await browser.close(); }
