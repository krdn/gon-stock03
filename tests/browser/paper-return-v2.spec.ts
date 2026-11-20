import { expect, test, type Page } from '@playwright/test';

const paper = '/paper?code=005930';
const settings = '수량 한도 변경';
const backToOrder = '주문 입력으로 돌아가기';
const views = [
  { name: 'PC', width: 1440, height: 900 },
  { name: '모바일', width: 390, height: 844 },
];
const sample = { code: '000660', side: '매도', qty: '4', price: '72500' };
const defaults = { code: '005930', side: '매수', qty: '1', price: '' };

async function openPaper(page: Page, path = paper) {
  await page.goto(path);
  await expect(page.getByText('앱의 KIS 주문 기록 없음', { exact: true })).toBeVisible();
}

async function enterOrder(page: Page, input = sample) {
  await page.getByLabel('KIS 종목코드').fill(input.code);
  await page.getByRole('button', { name: input.side, exact: true }).click();
  await page.getByLabel('수량 (주)', { exact: true }).fill(input.qty);
  await page.getByLabel('지정가 (원)').fill(input.price);
}

async function readOrder(page: Page) {
  await expect(page.getByText('앱의 KIS 주문 기록 없음', { exact: true })).toBeVisible();
  return {
    code: await page.getByLabel('KIS 종목코드').inputValue(),
    side: await page.getByRole('button', { name: /^(매수|매도)$/, pressed: true }).innerText(),
    qty: await page.getByLabel('수량 (주)', { exact: true }).inputValue(),
    price: await page.getByLabel('지정가 (원)').inputValue(),
  };
}

async function mockQuote(page: Page) {
  await page.route('**/api/kis/market', route => route.fulfill({ json: {
    quote: { code: route.request().postDataJSON().code, price: 75000, change: 0, tickSize: 100,
      stopped: false, upper: 90000, lower: 50000, receivedAt: new Date().toISOString() }, bars: [],
  } }));
}

async function expectOrder(page: Page, input: typeof sample) {
  await expect.poll(() => readOrder(page)).toEqual(input);
}

for (const viewport of views) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('설정 저장·새로고침·뒤로·앞으로·명시적 복귀가 같은 주문 입력을 보존한다', async ({ page }, info) => {
      await openPaper(page);
      await enterOrder(page);
      const posts: string[] = [];
      page.on('request', request => {
        if (request.method() === 'POST') posts.push(new URL(request.url()).pathname);
      });
      await page.getByRole('link', { name: settings }).click();
      const limit = page.getByLabel('주문당 수량 상한 (주)');
      await expect(limit).toBeEnabled();
      const initialLimit = await limit.inputValue();
      const savedLimit = initialLimit === '8' ? '9' : '8';
      try {
        await limit.fill(savedLimit);
        await page.getByRole('button', { name: '수량 한도 저장' }).click();
        await expect(page.getByText(`저장된 수동 주문 한도 ${savedLimit}주`)).toBeVisible();
        await page.reload();
        await expect(limit).toHaveValue(savedLimit);
        await page.goBack();
        await expectOrder(page, sample);
        await page.goForward();
        await expect(limit).toHaveValue(savedLimit);
        await page.getByRole('link', { name: backToOrder }).click();
        const returned = await readOrder(page);
        const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'KIS 모의 주문', exact: true }) });
        await panel.scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath('return.png') });
        await info.attach('복귀 입력', { body: JSON.stringify(returned), contentType: 'application/json' });
        expect(returned).toEqual(sample);
        await expect(panel).toContainText('290,000');
        await expect(page.getByLabel('수량 (주)', { exact: true })).toHaveAttribute('max', savedLimit);
        await expect(page.getByRole('button', { name: 'KIS 모의 주문 확인' })).toBeDisabled();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(posts).toEqual(['/api/kis/quantity-setting']);
      } finally {
        const restore = await page.request.post('/api/kis/quantity-setting', {
          headers: { 'x-workbench': 'local' }, data: { maxQty: Number(initialLimit) },
        });
        expect(restore.ok()).toBe(true);
      }
    });

    test('같은 종목의 새 이력과 다른 종목으로 직접 진입해도 각 주문 입력을 분리한다', async ({ page }) => {
      await openPaper(page, '/paper');
      await enterOrder(page);
      await page.getByRole('link', { name: settings }).click();
      await expect(page.getByRole('link', { name: backToOrder })).toBeVisible();
      await openPaper(page, '/paper?code=000660');
      await expectOrder(page, { ...defaults, code: '000660' });
      const second = { code: '005930', side: '매수', qty: '2', price: '71000' };
      await enterOrder(page, second);
      await page.getByRole('link', { name: settings }).click();
      await page.getByRole('link', { name: backToOrder }).click();
      await expectOrder(page, second);
      await openPaper(page, '/paper?code=069500');
      await expectOrder(page, { ...defaults, code: '069500' });
      await page.goBack(); // 두 번째 명시적 복귀
      await expectOrder(page, second);
      await page.goBack(); // 두 번째 설정
      await expect(page.getByRole('link', { name: backToOrder })).toBeVisible();
      await page.goBack(); // 두 번째 입력
      await expectOrder(page, second);
      await page.goBack(); // 첫 번째 설정
      await page.getByRole('link', { name: backToOrder }).click();
      await expectOrder(page, sample);
    });

    test('복귀 뒤 편집·새로고침은 현재 이력에만 적용하고 새 폼을 비운다', async ({ page }) => {
      await openPaper(page);
      await enterOrder(page);
      await page.getByRole('link', { name: settings }).click();
      await page.getByRole('link', { name: backToOrder }).click();
      const edit = { ...sample, qty: '3', price: '70100' };
      await enterOrder(page, edit);
      await page.reload();
      await expectOrder(page, edit);
      const menu = page.getByRole('button', { name: '메뉴 열기' });
      if (await menu.isVisible()) await menu.click();
      await page.locator('nav a[href="/paper"]').click();
      await expectOrder(page, defaults);
      await page.goBack();
      await expectOrder(page, edit);
      await page.goBack();
      await page.getByRole('link', { name: backToOrder }).click();
      await expectOrder(page, sample);
    });

    test('같은 복귀 키를 받은 링크도 목적지 종목이 다르면 기본 입력을 연다', async ({ page }) => {
      await openPaper(page);
      await enterOrder(page);
      await page.getByRole('link', { name: settings }).click();
      await expect(page.getByRole('link', { name: backToOrder })).toBeVisible();
      // Keep this valid settings history state and vary only its destination symbol.
      await page.evaluate(() => {
        const url = new URL(location.href);
        url.searchParams.set('code', '069500');
        history.replaceState(history.state, '', url);
      });
      await page.reload();
      await page.getByRole('link', { name: backToOrder }).click();
      await expectOrder(page, { ...defaults, code: '069500' });
    });

    test('확정 거부한 주문은 복귀 입력을 보존해 새로고침 후 수정할 수 있다', async ({ page }) => {
      await mockQuote(page);
      let attempts = 0;
      await page.route('**/api/kis/order', route => {
        attempts++;
        return route.fulfill({ status: 400, json: { error: '승인 지정가 불일치' } });
      });
      const defaultStockInput = { ...sample, code: defaults.code };
      await openPaper(page, '/paper');
      await enterOrder(page, defaultStockInput);
      await page.getByRole('link', { name: settings }).click();
      await expect(page.getByRole('link', { name: backToOrder })).toHaveAttribute('href', '/paper?code=005930');
      await page.getByRole('link', { name: backToOrder }).click();
      await page.getByRole('button', { name: '시세·일봉 조회' }).click();
      await page.getByRole('button', { name: 'KIS 모의 주문 확인', exact: true }).click();
      await page.getByRole('button', { name: 'KIS 모의 주문 전송', exact: true }).click();
      await expect(page.getByRole('link', { name: '지정가 적용 조건 확인' })).toBeVisible();
      await page.reload();
      await expectOrder(page, defaultStockInput);
      await expect(page.getByText('전송 결과 미확인', { exact: true })).toHaveCount(0);
      expect(attempts).toBe(1);
    });

    test('전송 응답 유실 후 설정 왕복이 전송된 초안을 되살리거나 동일 요청을 바꾸지 않는다', async ({ page }) => {
      const sent: unknown[] = [];
      await page.route('**/api/kis/order', route => {
        sent.push(route.request().postDataJSON());
        return route.abort();
      });
      await mockQuote(page);
      await openPaper(page);
      await enterOrder(page);
      await page.getByRole('link', { name: settings }).click();
      await page.getByRole('link', { name: backToOrder }).click();
      await page.getByRole('button', { name: '시세·일봉 조회' }).click();
      await page.getByRole('button', { name: 'KIS 모의 주문 확인', exact: true }).click();
      await page.getByRole('button', { name: 'KIS 모의 주문 전송', exact: true }).click();
      await expect(page.getByText('전송 결과 미확인', { exact: true })).toBeVisible();
      expect(sent).toEqual([{ code: sample.code, side: 'sell', qty: 4, price: 72500, requestId: expect.any(String) }]);
      // The same mounted form still shows the failed send, but this is no longer an editable draft.
      await page.getByRole('button', { name: '돌아가기', exact: true }).click();
      await page.getByRole('link', { name: settings }).click();
      await page.getByRole('link', { name: backToOrder }).click();
      await expectOrder(page, { ...defaults, code: sample.code });
      await page.reload();
      await expectOrder(page, { ...defaults, code: sample.code });
      await page.goBack();
      await expect(page.getByRole('link', { name: backToOrder })).toBeVisible();
      await page.goBack();
      await expectOrder(page, { ...defaults, code: sample.code });
      await page.goBack();
      await page.getByRole('link', { name: backToOrder }).click();
      await expectOrder(page, { ...defaults, code: sample.code });

      const other = { code: '069500', side: '매수', qty: '2', price: '35000' };
      await enterOrder(page, other);
      await page.getByRole('link', { name: settings }).click();
      await page.getByRole('link', { name: backToOrder }).click();
      await expectOrder(page, other);
      await page.getByRole('button', { name: '시세·일봉 조회' }).click();
      await expect(page.getByLabel('대상 종목')).toHaveValue(other.code);
      await expect(page.getByRole('button', { name: 'KIS 모의 주문 확인', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: '동일 요청 확인' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText('종목 000660 · 매도');
      await expect(dialog).toContainText('4주 × 72,500원');
      expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('kis-paper-pending')!))).toEqual(sent[0]);
      expect(sent).toHaveLength(1);
      await page.route('**/api/kis/order', route => {
        const input = route.request().postDataJSON();
        sent.push(input);
        return route.fulfill({ json: { order: { ...input, status: 'accepted', createdAt: '2026-11-20T01:00:00Z',
          tradeDate: '20261120', filled: 0, remaining: input.qty, message: '격리 예시 접수' } } });
      });
      await dialog.getByRole('button', { name: 'KIS 모의 주문 전송' }).click();
      await expect(page.getByText('전송 결과 미확인', { exact: true })).toHaveCount(0);
      expect(sent).toEqual([sent[0], sent[0]]);
      await page.reload();
      await expectOrder(page, other);
    });
  });
}
