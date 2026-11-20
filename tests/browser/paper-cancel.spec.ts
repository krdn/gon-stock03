import { test, expect, type Page } from '@playwright/test';
import { snapshot } from '../snapshot';

const order = { requestId: '14444444-4444-4444-8444-444444444444', code: '005930', brokerId: '001', organization: '12', tradeDate: '20261119', side: 'buy', qty: 1, price: 193000, createdAt: '2026-11-19T01:00:00Z', status: 'accepted', filled: 0, remaining: 1, message: '검증용' };
const available = { candidate: { requestId: order.requestId, expiresAt: '2099-11-19T01:02:00Z' }, reason: '한정 원주문 1건' };
const blocked = { candidate: null, reason: '정정취소 전 필수 가능수량 조회는 모의투자 미지원입니다.' };
async function setup(page: Page, authorized: boolean, result: 'cancelled' | 'filled' | 'error') {
  let posts = 0, reads = 0;
  await page.route('**/api/state', route => route.fulfill({ json: snapshot() }));
  await page.route('**/api/kis/ledger', route => route.fulfill({ json: { orders: [authorized ? order : { ...order, qty: 2, price: 136300, remaining: 2 }], cancellation: authorized && !posts ? available : blocked } }));
  await page.route('**/api/kis/cancel-probe', route => {
    posts++;
    expect(route.request().postDataJSON()).toEqual({ id: order.requestId, reconcileFirst: true });
    return route.fulfill({ json: { order: { ...order, status: 'unknown' }, warning: true } });
  });
  await page.route('**/api/kis/orders', route => {
    reads++;
    if (result === 'error') return route.fulfill({ status: 500, json: { error: '대조 실패' } });
    const filled = result === 'filled' ? 1 : 0;
    return route.fulfill({ json: { orders: [{ ...order, status: result, filled, remaining: 0 }],
      brokerOrders: [{ ...order, name: '삼성전자', date: order.tradeDate, filled, remaining: 0, confirmedCancelQty: 1 - filled, cancelled: result === 'cancelled' }], cancellation: blocked } });
  });
  await page.goto('/paper');
  return { posts: () => posts, reads: () => reads };
}

for (const result of ['cancelled', 'filled', 'error'] as const) {
  test('승인 원주문만 잔량 취소 확인 후 대조 · ' + result, async ({ page }) => {
    const calls = await setup(page, true, result);
    const open = page.getByRole('button', { name: '잔량 전부 취소' });
    await open.click();
    const dialog = page.getByRole('dialog', { name: '미체결 잔량을 취소할까요?' });
    await expect(dialog).toContainText('주문번호 001');
    await dialog.getByRole('button', { name: '돌아가기' }).click();
    expect(calls.posts()).toBe(0);
    await open.click();
    await dialog.getByRole('button', { name: '잔량 취소 요청' }).click();
    await expect(page.getByText(result === 'error' ? '대조 실패 · 최종 취소 수량을 확인할 수 없습니다.' :
      result === 'cancelled' ? 'KIS 대조 · 체결 0주 · 취소확인 1주 · 잔량 0주' : 'KIS 대조 · 체결 1주 · 취소확인 0주 · 잔량 0주', { exact: true })).toBeVisible();
    expect(calls.posts()).toBe(1); expect(calls.reads()).toBe(1);
    await expect(open).toBeDisabled();
    await page.reload(); await expect(page.getByText(blocked.reason)).toBeVisible();
    await expect(open).toBeDisabled();
  });
}
test('일반 모의 계좌에서는 전송 없이 취소 결과만 조회한다', async ({ page }) => {
  const calls = await setup(page, false, 'cancelled');
  await expect(page.getByText(blocked.reason)).toBeVisible();
  await expect(page.getByRole('button', { name: '잔량 전부 취소' })).toBeDisabled();
  await page.getByRole('button', { name: '취소 결과 조회' }).click();
  await expect(page.getByRole('columnheader', { name: '취소확인' })).toBeVisible();
  expect(calls.posts()).toBe(0); expect(calls.reads()).toBe(1);
});

test('모바일 부분체결 주문의 확인창·취소 대조 결과가 화면 폭 안에 남는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const partial = { ...order, status: 'partial', qty: 3, filled: 1, remaining: 2 };
  const final = { ...partial, status: 'cancelled', remaining: 0 };
  let cancels = 0, reads = 0;
  await page.route('**/api/state', route => route.fulfill({ json: snapshot() }));
  await page.route('**/api/kis/ledger', route => route.fulfill({ json: { orders: [partial], cancellation: available } }));
  await page.route('**/api/kis/cancel-probe', route => {
    cancels++;
    return route.fulfill({ json: { order: { ...partial, status: 'unknown' }, warning: true } });
  });
  await page.route('**/api/kis/orders', route => {
    reads++;
    return route.fulfill({ json: { orders: [final], cancellation: blocked, brokerOrders: [
      { ...final, date: final.tradeDate, name: '격리 예시', confirmedCancelQty: 2, cancelled: true }
    ] } });
  });
  await page.goto('/paper');
  const open = page.getByRole('button', { name: '잔량 전부 취소' });
  await open.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('주문 3주 · 체결 1주 · 취소 요청 잔량 2주');
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();
  expect(cancels).toBe(0);
  await open.press('Enter');
  await dialog.getByRole('button', { name: '잔량 취소 요청' }).press('Enter');
  await expect(page.getByText('KIS 대조 · 체결 1주 · 취소확인 2주 · 잔량 0주')).toBeVisible();
  await expect(open).toBeDisabled();
  expect([cancels, reads]).toEqual([1, 1]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
