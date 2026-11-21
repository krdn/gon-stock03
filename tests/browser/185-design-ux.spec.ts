import { expect, test } from '@playwright/test';
import { snapshot } from '../snapshot';

const expectedIssues = [
  ['dashboard', 150], ['market', 161], ['watchlist', 169], ['trade', 158], ['orders', 151],
  ['portfolio', 174], ['strategies', 175], ['backtest', 180], ['risk', 168], ['journal', 182],
  ['alerts', 179], ['data', 173], ['settings', 162], ['design', 185], ['paper', 166],
] as const;
const repository = 'https://github.com/krdn/gon-stock03';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`design first viewport and history keep the feedback target at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('**/api/state', route => route.fulfill({ json: snapshot() }));
    const mutations: string[] = [];
    page.on('request', req => { if (req.method() !== 'GET') mutations.push(req.method()); });
    await page.goto('/design');
    await expect(page.getByRole('group', { name: '로컬 상태', exact: true })).toContainText('정상');
    const topics = page.getByRole('group', { name: '설계 주제' }).getByRole('button');
    for (const topic of await topics.all()) await expect(topic).toBeInViewport({ ratio: 1 });
    const orders = page.locator('.screen-map').getByRole('button', { name: '주문·체결' });
    await expect(orders).toBeInViewport({ ratio: 1 });
    await orders.focus();
    await page.keyboard.press('Enter');
    const result = page.getByRole('region', { name: '주문·체결 설계 상세' });
    await expect(result).toBeFocused();
    const opinion = result.getByRole('link', { name: /주문·체결 의견 남기기/ });
    await expect(opinion).toHaveAttribute('href', repository + '/issues/151#issuecomment-new');
    await expect(opinion).toBeInViewport({ ratio: 1 });
    await result.getByRole('link', { name: '화면 열기' }).click();
    await expect(page).toHaveURL(/\/orders$/);
    await page.goBack();
    await page.reload();
    await expect(result.getByRole('heading', { name: '주문·체결', exact: true })).toBeInViewport({ ratio: 1 });
    await expect(opinion).toBeInViewport({ ratio: 1 });
    await page.getByRole('group', { name: '설계 주제' }).getByRole('button', { name: '화면별 상세' }).click();
    await page.goBack();
    await expect(page.getByRole('heading', { name: '화면 지도' })).toBeVisible();
    expect(mutations).toEqual([]);
  });
}

test('design screen issues match their topic including the linked trading settings', async ({ page }) => {
  await page.route('**/api/state', route => route.fulfill({ json: snapshot() }));
  for (const [id, issue] of expectedIssues) {
    await page.goto('/design?screen=' + id);
    const feedback = page.locator('.design-feedback');
    await expect(feedback).toHaveAttribute('href', repository + '/issues/' + issue + '#issuecomment-new');
    const name = await page.locator('.design-screen-detail h2').innerText();
    await expect(feedback).toHaveAccessibleName(name + ' 의견 남기기 새 탭');
  }
  await page.goto('/design?screen=settings');
  await expect(page.getByRole('link', { name: /매매 설정 의견 남기기/ })).toHaveAttribute('href', repository + '/issues/152#issuecomment-new');
  await page.getByRole('link', { name: '매매 설정 열기' }).click();
  await expect(page).toHaveURL(/\/settings\/trading(?:\/general)?$/);
  await page.goBack();
  await expect(page.locator('.design-screen-detail h2')).toHaveText('연결·설정');
});

test('design missing addresses, partial account and offline local data retain the right evidence', async ({ page }) => {
  const state = snapshot();
  state.connection.status = { ...state.connection.status, phase: 'partial', pages: 1, error: '예시 두 번째 페이지 누락' };
  let offline = false;
  await page.route('**/api/state', route => offline ? route.fulfill({ status: 503 }) : route.fulfill({ json: state }));
  for (const invalid of ['', 'unknown']) {
    await page.goto('/design?screen=' + invalid);
    await expect(page.getByRole('heading', { name: '화면을 찾을 수 없습니다' })).toBeVisible();
    await expect(page.locator('.design-feedback')).toHaveCount(0);
    await expect(page.getByRole('link', { name: '화면 열기', exact: true })).toHaveCount(0);
  }
  const topics = page.getByRole('group', { name: '설계 주제' });
  await topics.getByRole('button', { name: '화면별 상세' }).click();
  await expect(page.locator('.design-screen-detail h2')).toHaveText('대시보드');
  await expect(page.getByRole('group', { name: 'KIS 계좌 상태' })).toContainText('부분실패');
  await page.getByRole('group', { name: '설계 화면 선택' }).getByRole('button', { name: /설계실/ }).click();
  await expect(page).toHaveURL(/screen=design/);
  await expect(page.locator('.design-feedback')).toHaveAttribute('href', repository + '/issues/185#issuecomment-new');
  offline = true;
  await page.reload();
  await expect(page.getByRole('button', { name: '다시 확인' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'KIS 계좌 상태' })).toContainText('미연결');
  await expect(page.locator('.design-screen-detail h2')).toHaveText('설계실');
  offline = false;
  await page.getByRole('button', { name: '다시 확인' }).click();
  await expect(page.getByRole('group', { name: '로컬 상태', exact: true })).toContainText('정상');
  await page.goto('/design?tab=flow&step=bad');
  await expect(page.getByRole('status').filter({ hasText: '주소의 주문 단계' })).toBeVisible();
  await page.getByRole('button', { name: /체결·취소/ }).press('Enter');
  await page.reload();
  await expect(page.locator('.step-detail')).toContainText('장중 미관측');
});

test('mobile design separates the local guide from its GitHub file in keyboard order', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/state', route => route.fulfill({ json: snapshot() }));
  await page.goto('/design');
  const guide = page.getByRole('link', { name: '이 PC에서 검토 지도 열기 (새 탭)', exact: true });
  const file = page.getByRole('link', { name: 'GitHub에서 검토 지도 파일 열기 (새 탭)', exact: true });
  await expect(guide).toHaveAttribute('href', 'http://127.0.0.1:4328/guide.html');
  await expect(guide).toHaveAttribute('target', '_blank');
  await expect(file).toHaveAttribute('href', /^https:\/\/github\.com\/krdn\/gon-stock03\/blob\/[a-f0-9]{40}\/docs\/architecture\/figures\/v1-guide\.html$/);
  await expect(file).toHaveAttribute('target', '_blank');
  await expect(page.getByText(/GitHub 파일 페이지에서 Download raw file/)).toBeVisible();
  await guide.focus();
  await expect(guide).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Tab');
  await expect(file).toBeFocused();
  await expect(file).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
