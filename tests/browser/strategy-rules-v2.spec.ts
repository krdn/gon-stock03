import { expect, test } from '@playwright/test';
import type { DailyRun, StoredBar } from '../../shared/market-data';
import { emptyStatus } from '../../shared/status';

/** v2 돈키안·샹들리에·RSI 백테스트가 실제 거래와 벤치마크를 생성하도록 구성한 90봉 결정론 fixture. */
function v2DailyFixture(code = '005930') {
  const at = '2026-06-01T01:00:00.000Z';
  const dates: string[] = [];
  const cursor = new Date('2026-01-05T00:00:00Z');
  while (dates.length < 90) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(cursor.toISOString().slice(0, 10).replaceAll('-', ''));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const run: DailyRun = {
    id: '11111111-2222-4333-8444-555555555555',
    code,
    from: dates[0],
    to: dates.at(-1)!,
    adjustment: 'adjusted',
    source: 'kis-rest',
    exchange: 'KRX',
    endpoint: '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
    startedAt: at,
    captureDate: '20260601',
    coverageComplete: true,
    nextDate: null,
    calendar: { source: 'https://example.test/v2-fixture-calendar', dates },
    status: { ...emptyStatus('kis-paper'), phase: 'ready', complete: true, observedAt: at, lastSuccessAt: at, pages: 1 },
    quality: { state: 'passed', missingDates: [], unexpectedDates: [], candidateMissingDates: [], duplicates: 0, emptyWindows: [] },
  };
  const bars: StoredBar[] = dates.map((date, i) => {
    const close = i < 25 ? 50000 : i < 40 ? 58000 + (i - 25) * 400 : i < 55 ? 64000 - (i - 40) * 900 : i < 72 ? 52000 + (i - 55) * 500 : 48000;
    const open = i === 0 ? close : close - 100;
    const high = Math.max(open, close) + 600;
    const low = Math.min(open, close) - 600;
    const volume = i === 25 || i === 58 ? 500000 : 100000;
    return {
      date,
      open,
      high,
      low,
      close,
      volume,
      code,
      adjustment: 'adjusted',
      source: 'kis-rest',
      collectedAt: at,
    };
  });
  return { run, bars };
}

test('전략 스튜디오에서 다중 규칙 선택·3줄 안내·프리셋·오류 검증·미지원 안내가 동작한다', async ({ page }) => {
  await page.goto('/strategies');

  const ruleSelect = page.getByRole('combobox', { name: '전략 규칙', exact: true });
  await expect(ruleSelect).toHaveValue('ma_crossover');
  await expect(page.getByText('단기선이 장기선을 위로 넘을 때 사요.')).toBeVisible();
  await expect(page.getByRole('button', { name: '기본', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // 보수적·공격적 프리셋 전환 확인
  await page.getByRole('button', { name: '보수적', exact: true }).click();
  await expect(page.getByLabel('단기 평균 (봉)')).toHaveValue('20');
  await expect(page.getByLabel('장기 평균 (봉)')).toHaveValue('60');
  await expect(page.getByRole('button', { name: '보수적', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: '공격적', exact: true }).click();
  await expect(page.getByLabel('단기 평균 (봉)')).toHaveValue('3');
  await expect(page.getByLabel('장기 평균 (봉)')).toHaveValue('10');

  // 돈키안 돌파 선택 시 3줄 안내·환경 배지·DEMO 미지원 안내 확인
  await ruleSelect.selectOption('donchian_breakout');
  await expect(page.getByText('거래량이 늘면서 이전 고점에 도달하면 사요.')).toBeVisible();
  await expect(page.getByText('DEMO · 미지원')).toBeVisible();
  await expect(page.getByText(/DEMO는 종가만 제공합니다/)).toBeVisible();

  // 청산 기간 >= 진입 기간 검증 오류 확인
  await page.getByLabel('진입 고가 기간 (봉)').fill('15');
  await page.getByLabel('청산 저가 기간 (봉)').fill('15');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('청산 기간은 진입 기간보다 작아야 합니다.');

  // 정상 기간으로 되돌린 뒤 DEMO 저장 시도 시 서버 거부 오류 표시 및 초안 유지 확인
  await page.getByRole('button', { name: '기본', exact: true }).click();
  await page.getByLabel('전략 이름').fill('DEMO 돈키안 거부 확인');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('DEMO는 종가만 제공합니다');
  await expect(page.getByLabel('전략 이름')).toHaveValue('DEMO 돈키안 거부 확인');

  // RSI 단기 눌림목은 DEMO에서 저장 가능하며 카드에 규칙 요약 표시
  await ruleSelect.selectOption('rsi2_pullback');
  await expect(page.getByText('장기 상승 추세에서 단기 과매도가 나타나면 사요.')).toBeVisible();
  await page.getByRole('button', { name: '공격적', exact: true }).click();
  await expect(page.getByLabel('과매도 기준 (RSI 이하)')).toHaveValue('20');
  await expect(page.getByLabel('장기 추세선 (봉)')).toHaveValue('60');
  await page.getByLabel('전략 이름').fill('DEMO RSI 눌림목');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();

  const card = page.locator('.studio-card').filter({ has: page.getByRole('heading', { name: 'DEMO RSI 눌림목', exact: true }) });
  await expect(card).toBeVisible();
  await expect(card).toContainText('RSI 단기 눌림목');
  await expect(card).toContainText('RSI(2)');
  await expect(card).toContainText('장기선');
});

test('전략 스튜디오 ↔ 저장 일봉 백테스트 v2 왕복·벤치마크·매매 사유·evidence 배지·모바일 390px 검증', async ({ page }) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');
  const fixture = v2DailyFixture('005930');
  store.saveDaily(fixture.run, fixture.bars);

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4334]);
  await new Promise<void>(resolve => server.listen(4334, '127.0.0.1', resolve));

  const dailyPayloads: unknown[] = [];
  await page.route('**/api/**', async route => {
    const req = route.request();
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/backtest/daily') {
      dailyPayloads.push(req.postDataJSON());
    }
    const response = await route.fetch({ url: req.url().replace(':4314', ':4334') });
    await route.fulfill({ response });
  });

  try {
    // 1. 전략 스튜디오에서 돈키안 돌파 + 샹들리에 오버레이 설정 후 백테스트로 이동
    await page.goto('/strategies');
    await page.getByLabel('대상 종목').selectOption('005930');
    await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('donchian_breakout');
    await page.getByRole('button', { name: '공격적', exact: true }).click();
    await page.getByLabel('샹들리에 ATR 청산 오버레이 사용').check();
    await page.getByLabel('ATR 기간 (봉)').fill('10');
    await page.getByLabel('ATR 배수').fill('2.5');
    await page.getByRole('button', { name: '이 설정으로 백테스트', exact: true }).click();

    await expect(page).toHaveURL(/\/backtest$/);
    await expect(page.getByText(/전략 스튜디오 초안 적용/)).toBeVisible();
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('donchian_breakout');
    await expect(page.getByLabel('진입 고가 기간 (봉)')).toHaveValue('10');
    await expect(page.getByLabel('샹들리에 ATR 청산 오버레이 사용')).toBeChecked();
    await expect(page.getByLabel('ATR 기간 (봉)')).toHaveValue('10');
    await expect(page.getByLabel('ATR 배수')).toHaveValue('2.5');

    // 2. 저장 일봉 v2 백테스트 실행 → strictObject 계약(최상위 fast/slow 없음), benchmark, reason 검증
    await page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true }).click();
    const result = page.getByRole('region', { name: '저장 일봉 실험 결과' });
    await expect(result).toBeVisible();

    expect(dailyPayloads).toHaveLength(1);
    const sent = dailyPayloads[0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('fast');
    expect(sent).not.toHaveProperty('slow');
    expect(sent).toHaveProperty('rule');
    expect(sent).toHaveProperty('overlay');

    // 벤치마크 비교 및 거래 매매 사유 표시 확인
    const benchmark = result.getByLabel('단순 보유 벤치마크 비교');
    await expect(benchmark).toBeVisible();
    await expect(benchmark).toContainText('전략 vs 단순 보유 비교');
    await expect(benchmark).toContainText('단순 보유 (벤치마크)');
    await expect(result.getByRole('columnheader', { name: '매매 사유' })).toBeVisible();
    await expect(result).toContainText('직전 채널 상단 돌파와 거래량 증가');

    // 재현 검증 일치 및 해시 추출
    await result.getByText('재현 입력·출처 확인', { exact: true }).click();
    await expect(result).toContainText('daily-rules-next-open-v2');
    const hash = (await result.getByTestId('experiment-hash').textContent())?.trim() ?? '';
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    await result.getByRole('button', { name: '고정 입력으로 재현 검증', exact: true }).click();
    await expect(result).toContainText('재현 일치');

    // 모바일 390px에서 v2 결과 화면 가로 넘침 없음 확인
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1050 });

    // 새로고침 후 v2 저장 실험 불러오기 동작 확인
    await page.reload();
    await page.getByRole('button', { name: '저장 실험 불러오기', exact: true }).click();
    await expect(result).toBeVisible();
    await expect(result.getByTestId('experiment-hash')).toHaveText(hash);
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('donchian_breakout');

    // 3. 백테스트 결과에서 '이 설정으로 전략 만들기' → /strategies#strategy-editor로 이동 + evidence 연결 저장
    await result.getByRole('button', { name: '이 설정으로 전략 만들기', exact: true }).click();
    await expect(page).toHaveURL(/\/strategies#strategy-editor$/);
    await expect(page.getByLabel('대상 종목')).toHaveValue('005930');
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('donchian_breakout');
    await expect(page.getByLabel('샹들리에 ATR 청산 오버레이 사용')).toBeChecked();
    await expect(page.getByText(hash.slice(0, 8))).toBeVisible();

    // KIS 모의 환경으로 전환 시 초안·evidence가 유지되며 저장 가능
    await page.getByLabel('전략 환경').selectOption('kis-paper');
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('donchian_breakout');
    await expect(page.getByText(/장전 레벨 트리거 계약 연결 후 활성화/)).toBeVisible();
    await expect(page.getByText(hash.slice(0, 8))).toBeVisible();

    await page.getByLabel('전략 이름').fill('검증된 돈키안 샹들리에');
    await page.getByRole('button', { name: '전략 저장', exact: true }).click();

    const savedCard = page.locator('.studio-card').filter({
      has: page.getByRole('heading', { name: '검증된 돈키안 샹들리에', exact: true }),
    });
    await expect(savedCard).toBeVisible();
    await expect(savedCard).toContainText(`검증 실험 연결 · ${hash.slice(0, 8)}`);
    await expect(savedCard).toContainText('돈키안 돌파');
    await expect(savedCard).toContainText('ATR(10)×2.5');

    // 모바일 390px에서 전략 스튜디오 가로 넘침 없음 확인
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('DEMO 합성 백테스트 v2는 최상위 fast·slow 없이 rule을 전송하고 벤치마크를 표시한다', async ({ page }) => {
  const demoPayloads: unknown[] = [];
  page.on('request', req => {
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/backtest') {
      demoPayloads.push(req.postDataJSON());
    }
  });

  await page.goto('/backtest?source=demo');
  await page.getByRole('combobox', { name: '평균 방식', exact: true }).selectOption('ema');
  await page.getByLabel('단기 (봉)', { exact: true }).fill('3');
  await page.getByLabel('장기 (봉)', { exact: true }).fill('8');
  await page.getByRole('button', { name: '백테스트 실행', exact: true }).click();

  const result = page.getByRole('region', { name: '합성 실험 결과' });
  await expect(result).toBeVisible();
  await expect(result.getByLabel('단순 보유 벤치마크 비교')).toBeVisible();
  await expect(result).toContainText('EMA 3/8');

  expect(demoPayloads).toHaveLength(1);
  const sent = demoPayloads[0] as Record<string, unknown>;
  expect(sent).not.toHaveProperty('fast');
  expect(sent).not.toHaveProperty('slow');
  expect(sent).toHaveProperty('rule');
});
