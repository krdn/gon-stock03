import { test, expect, type Page } from '@playwright/test';
import { snapshot } from '../snapshot';

const order = { requestId: '11111111-1111-4111-8111-111111111111', code: '005930', side: 'buy', qty: 2, price: 70000, createdAt: '2026-11-16T01:00:00Z', tradeDate: '20261116', status: 'unknown', filled: 0, remaining: 2, message: '응답 불명' };
async function setup(page: Page) {
  await page.route('**/api/state', route => route.fulfill({ json: snapshot() }));
  await page.route('**/api/kis/ledger', route => route.fulfill({ json: { orders: [] } }));
  await page.route('**/api/kis/market', route => route.fulfill({ json: { quote: { code: '005930', price: 75000, change: 0, upper: 90000, lower: 50000, tickSize: 100, stopped: false, receivedAt: new Date().toISOString() }, bars: [] } }));
}
test('paper market refresh preserves edited limit price and quantity', async ({ page }) => {
  await setup(page); await page.goto('/paper?code=005930');
  await page.getByRole('button', { name: '시세·일봉 조회' }).click();
  await expect(page.getByLabel('지정가 (원)')).toHaveValue('75000');
  await page.getByLabel('지정가 (원)').fill('70000'); await page.getByLabel('수량 (주)').fill('2');
  await page.getByRole('button', { name: '시세·일봉 조회' }).click();
  await expect(page.getByRole('button', { name: 'KIS 모의 주문 확인', exact: true })).toBeEnabled();
  await expect(page.getByLabel('지정가 (원)')).toHaveValue('70000'); await expect(page.getByLabel('수량 (주)')).toHaveValue('2');
  await page.screenshot({ path: 'docs/verification/assets/paper/desktop-input.png', fullPage: true });
});
test('paper ambiguous transport preserves request and payload across close and reload', async ({ page }) => {
  await setup(page); const sent: unknown[] = [];
  await page.route('**/api/kis/order', async route => { sent.push(route.request().postDataJSON()); await route.abort(); });
  await page.goto('/paper'); await page.getByRole('button', { name: '시세·일봉 조회' }).click();
  await page.getByRole('button', { name: 'KIS 모의 주문 확인', exact: true }).click();
  await page.getByRole('button', { name: 'KIS 모의 주문 전송', exact: true }).click();
  await expect(page.getByText('전송 결과 미확인', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '돌아가기', exact: true }).click(); await page.reload();
  await expect(page.getByText('전송 결과 미확인', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'KIS 모의 주문 확인', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '동일 요청 확인', exact: true }).click();
  await page.screenshot({ path: 'docs/verification/assets/paper/mobile-confirmation.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'KIS 모의 주문 전송', exact: true }).click();
  await expect.poll(() => sent.length).toBe(2); expect(sent[1]).toEqual(sent[0]);
});
test('paper ledger identifies statuses and explicit recovery at mobile width', async ({ page }) => {
  await setup(page); await page.setViewportSize({ width: 390, height: 844 });
  const statuses = ['unknown', 'accepted', 'partial', 'filled', 'cancelled', 'rejected'] as const;
  await page.route('**/api/kis/ledger', route => route.fulfill({ json: { orders: statuses.map((status, i) => ({ ...order, requestId: i ? `stored-${i}` : order.requestId, status, filled: status === 'filled' ? 2 : status === 'partial' ? 1 : 0, remaining: status === 'filled' || status === 'cancelled' ? 0 : status === 'partial' ? 1 : 2, message: '' })) } }));
  const candidate = { brokerId: '1234', organization: '999', date: order.tradeDate, code: order.code, name: '삼성전자', side: 'buy', qty: 2, price: 70000, filled: 1, remaining: 1, cancelled: false };
  let inspections = 0, confirmations = 0;
  await page.route('**/api/kis/recovery/inspect', route => { inspections++; return route.fulfill({ json: { order, evidenceId: 'evidence-1', evidence: { observedAt: new Date().toISOString(), tradeDate: order.tradeDate }, candidates: [candidate] } }); });
  await page.route('**/api/kis/recovery/confirm', route => { confirmations++; expect(route.request().postDataJSON()).toEqual({ id: order.requestId, evidenceId: 'evidence-1', brokerId: '1234', organization: '999', confirmed: true }); return route.fulfill({ json: { order: { ...order, status: 'partial', brokerId: '1234', filled: 1, remaining: 1 } } }); });
  await page.goto('/paper?code=005930');
  await expect(page.getByText(order.requestId, { exact: true })).toBeVisible();
  expect(inspections).toBe(0); expect(confirmations).toBe(0);
  await page.getByRole('button', { name: '불명 복구 조회', exact: true }).click();
  await expect(page.getByText('1234', { exact: false }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: '선택 주문 연결', exact: true })).toBeDisabled();
  await page.locator('.table-scroll').evaluateAll(elements => elements.forEach(element => { element.scrollLeft = 0; }));
  await page.screenshot({ path: 'docs/verification/assets/paper/mobile-recovery.png', fullPage: true });
  await page.getByLabel('KIS 앱의 주문번호·거래일·종목·방향·수량·가격을 확인했습니다').check();
  await page.getByRole('button', { name: '선택 주문 연결', exact: true }).click();
  await expect.poll(() => confirmations).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('paper late market response cannot overwrite another symbol or edited input', async ({ page }) => {
  await setup(page); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/kis/market', async route => { await gate; await route.fulfill({ json: { quote: { code: '005930', price: 75000, change: 0, stopped: false, receivedAt: new Date().toISOString() }, bars: [] } }); });
  await page.goto('/paper'); const response = page.waitForResponse('**/api/kis/market');
  await page.getByRole('button', { name: '시세·일봉 조회' }).click();
  await page.getByLabel('KIS 종목코드').fill('000660'); await page.getByLabel('지정가 (원)').fill('123000'); release(); await response;
  await expect(page.getByRole('button', { name: '시세·일봉 조회' })).toBeEnabled();
  await expect(page.getByLabel('지정가 (원)')).toHaveValue('123000');
  await expect(page.getByLabel('대상 종목')).toHaveValue('먼저 종목 조회');
});
test('paper malformed ledger fails closed and recovery without unique evidence cannot confirm', async ({ page }) => {
  await setup(page); await page.route('**/api/kis/ledger', route => route.fulfill({ json: { orders: 'invalid' } }));
  await page.goto('/paper'); await expect(page.getByText('주문 원장 조회 실패', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'KIS 모의 주문 확인', exact: true })).toBeDisabled();
  await page.route('**/api/kis/ledger', route => route.fulfill({ json: { orders: [order] } }));
  await page.route('**/api/kis/recovery/inspect', route => route.fulfill({ json: { order, evidenceId: 'evidence-1', evidence: { observedAt: new Date().toISOString(), tradeDate: order.tradeDate }, candidates: [] } }));
  await page.reload(); await page.getByRole('button', { name: '불명 복구 조회', exact: true }).click();
  await expect(page.getByText('유일한 후보 없음 · 불명 유지', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '선택 주문 연결', exact: true })).toBeDisabled();
});
test('paper stored receipt resolves transport ambiguity without another order POST', async ({ page }) => {
  await setup(page); let posts = 0;
  await page.addInitScript(input => sessionStorage.setItem('kis-paper-pending', JSON.stringify(input)), { requestId: order.requestId, code: order.code, side: order.side, price: order.price, qty: order.qty });
  await page.route('**/api/kis/order', route => { posts++; return route.abort(); });
  await page.route('**/api/kis/ledger', route => route.fulfill({ json: { orders: [{ ...order, status: 'accepted', brokerId: '1234' }] } }));
  await page.goto('/paper'); await expect(page.getByText(order.requestId, { exact: true })).toBeVisible();
  await expect(page.getByText('전송 결과 미확인', { exact: true })).toHaveCount(0); expect(posts).toBe(0);
  expect(await page.evaluate(() => sessionStorage.getItem('kis-paper-pending'))).toBeNull();
});
test('paper broker refresh failure preserves previous rows and input with stale warning', async ({ page }) => {
  await setup(page); let calls = 0;
  await page.route('**/api/kis/orders', route => ++calls === 1 ? route.fulfill({ json: { orders: [order], brokerOrders: [{ brokerId: '1234', date: order.tradeDate, code: order.code, name: '삼성전자', side: 'buy', qty: 2, price: 70000, filled: 1, remaining: 1, cancelled: false, organization: '999' }] } }) : route.fulfill({ status: 500, json: { error: '실패' } }));
  await page.goto('/paper'); await page.getByLabel('지정가 (원)').fill('71000');
  await page.getByRole('button', { name: '계좌·주문 조회' }).click(); await expect(page.getByText('삼성전자', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '계좌·주문 조회' }).click(); await expect(page.getByRole('alert').filter({ hasText: '계좌·주문 조회 실패' })).toContainText('이전 조회값은 최신이 아닙니다');
  await expect(page.getByText('삼성전자', { exact: true })).toBeVisible(); await expect(page.getByLabel('지정가 (원)')).toHaveValue('71000');
});
test('paper definitive preflight rejection permits correction but ambiguous retry stays pinned', async ({ page }) => {
  await setup(page); const requests: { requestId: string; price: number }[] = [];
  await page.route('**/api/kis/order', route => { requests.push(route.request().postDataJSON()); return route.fulfill({ status: 400, json: { error: '1회 주문 한도를 초과했습니다.' } }); });
  await page.goto('/paper'); await page.getByRole('button', { name: '시세·일봉 조회' }).click();
  await page.getByRole('button', { name: 'KIS 모의 주문 확인', exact: true }).click(); await page.getByRole('button', { name: 'KIS 모의 주문 전송', exact: true }).click();
  await expect(page.getByRole('button', { name: 'KIS 모의 주문 전송', exact: true })).toBeEnabled();
  await expect(page.getByText('전송 결과 미확인', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '돌아가기', exact: true }).click(); await page.getByLabel('지정가 (원)').fill('70000');
  await page.route('**/api/kis/order', route => { requests.push(route.request().postDataJSON()); return route.abort(); });
  await page.getByRole('button', { name: 'KIS 모의 주문 확인', exact: true }).click(); await page.getByRole('button', { name: 'KIS 모의 주문 전송', exact: true }).click();
  await expect(page.getByRole('button', { name: 'KIS 모의 주문 전송', exact: true })).toBeEnabled();
  await page.route('**/api/kis/order', route => route.fulfill({ status: 400, json: { error: '조회 검증 실패' } }));
  await page.getByRole('button', { name: 'KIS 모의 주문 전송', exact: true }).click();
  await expect(page.getByRole('button', { name: 'KIS 모의 주문 전송', exact: true })).toBeEnabled();
  await expect(page.getByText('전송 결과 미확인', { exact: true })).toBeVisible();
  expect(requests[0].requestId).not.toBe(requests[1].requestId); expect(requests[1].price).toBe(70000);
});

for (const path of ['/paper', '/orders']) test(`market order ledger shows market pricing on ${path}`, async ({ page }) => {
  await setup(page);
  const marketOrder = { ...order, orderType: 'market', price: 0, qty: 1, remaining: 1, status: 'accepted', brokerId: '1234' };
  await page.route('**/api/kis/ledger', route => route.fulfill({ json: { orders: [marketOrder] } }));
  await page.goto(path);
  if (path === '/orders') await page.getByRole('button', { name: 'KIS 모의 원장', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: order.requestId });
  await expect(row).toContainText('시장가');
  await expect(row).not.toContainText('0원');
});

test('manual share limit is editable above five, survives reload and respects a tighter fixed approval', async ({page}) => {
  const state = snapshot(); let maxQty = 5, saves = 0;
  await setup(page);
  await page.route('**/api/state', r => r.fulfill({json:{...state,paperManualMaxQty:maxQty}}));
  await page.route('**/api/kis/quantity-setting', r => {
    maxQty=r.request().postDataJSON().maxQty; saves++;
    return r.fulfill({json:{maxQty,message:'저장했습니다.'}});
  });
  await page.goto('/paper');
  const setting=page.getByLabel('주문당 수량 상한 (주)');
  await expect(setting).toHaveValue('5');
  await setting.fill('8'); await page.getByRole('button',{name:'수량 한도 저장'}).click();
  await expect(page.getByText('저장된 수동 주문 한도 8주')).toBeVisible();
  await page.reload(); await expect(setting).toHaveValue('8');
  await expect(page.getByLabel('수량 (주)',{exact:true})).toHaveAttribute('max','8');
  await page.route('**/api/kis/ledger', r => r.fulfill({json:{orders:[],minimumRun:{active:true,requestId:order.requestId,maxQty:3}}}));
  await page.reload();
  await expect(page.getByText(/이번 1회 승인 상한 3주 · 적용 한도 3주/)).toBeVisible();
  await expect(page.getByLabel('수량 (주)',{exact:true})).toHaveAttribute('max','3');
  expect(saves).toBe(1);
});
