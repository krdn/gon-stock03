import { expect, test, type Page } from '@playwright/test';
import { strategyInput } from '../../shared/contracts';
import type { DailyRun, StoredBar } from '../../shared/market-data';
import { emptyStatus } from '../../shared/status';
import { snapshot } from '../snapshot';

/** 초기 `/api/state` 스냅샷 로드 및 `<Routes key={instanceId}>` 안정화 완료를 대기한다. */
async function waitWorkbenchReady(page: Page) {
  await expect(page.getByText('로컬 서버 연결', { exact: true })).toBeVisible();
}

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
    id: code === '00A123' ? '22222222-3333-4444-8555-666666666666' : '11111111-2222-4333-8444-555555555555',
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
  await waitWorkbenchReady(page);
  await expect(page.getByLabel('전략 환경')).toBeEnabled();

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
    await waitWorkbenchReady(page);
    await expect(page.getByLabel('대상 종목')).toBeEnabled();
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
    await expect(page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true })).toBeEnabled();
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
    await waitWorkbenchReady(page);
    await expect(page.getByRole('button', { name: '저장 실험 불러오기', exact: true })).toBeEnabled();
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
    await expect(savedCard.getByRole('button', { name: '전략 시작', exact: true })).toBeDisabled();

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
  await waitWorkbenchReady(page);
  await expect(page.getByRole('button', { name: '백테스트 실행', exact: true })).toBeEnabled();

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

test('영숫자 종목(00A123) 백테스트에서 전략 스튜디오로 이동 시 규칙·오버레이·evidence를 보존하고 환경 전환 시 편집값을 롤백하지 않는다', async ({ page }) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');
  const fixture = v2DailyFixture('00A123');
  store.saveDaily(fixture.run, fixture.bars);

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4335]);
  await new Promise<void>(resolve => server.listen(4335, '127.0.0.1', resolve));

  await page.route('**/api/**', async route => {
    const response = await route.fetch({ url: route.request().url().replace(':4314', ':4335') });
    await route.fulfill({ response });
  });

  try {
    // Major 1: 영숫자 일봉 코드(00A123) 돈키안+샹들리에 실행 → 전략 스튜디오 전달 보존 확인
    await page.goto('/backtest');
    await waitWorkbenchReady(page);
    await expect(page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true })).toBeEnabled();

    await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('donchian_breakout');
    await page.getByLabel('진입 고가 기간 (봉)').fill('15');
    await page.getByLabel('청산 저가 기간 (봉)').fill('6');
    await page.getByLabel('샹들리에 ATR 청산 오버레이 사용').check();
    await page.getByLabel('ATR 기간 (봉)').fill('12');
    await page.getByLabel('ATR 배수').fill('2.8');
    await page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true }).click();

    const result = page.getByRole('region', { name: '저장 일봉 실험 결과' });
    await expect(result).toBeVisible();
    await result.getByText('재현 입력·출처 확인', { exact: true }).click();
    const hash = (await result.getByTestId('experiment-hash').textContent())?.trim() ?? '';
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    await result.getByRole('button', { name: '이 설정으로 전략 만들기', exact: true }).click();
    await expect(page).toHaveURL(/\/strategies#strategy-editor$/);
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('donchian_breakout');
    await expect(page.getByLabel('진입 고가 기간 (봉)')).toHaveValue('15');
    await expect(page.getByLabel('청산 저가 기간 (봉)')).toHaveValue('6');
    await expect(page.getByLabel('샹들리에 ATR 청산 오버레이 사용')).toBeChecked();
    await expect(page.getByLabel('ATR 기간 (봉)')).toHaveValue('12');
    await expect(page.getByText(hash.slice(0, 8))).toBeVisible();
    await expect(page.getByText(/백테스트 종목\(00A123\)은 영숫자 코드로 전략 저장/)).toBeVisible();

    // Major 2: 파라미터·이름·수량 수정으로 evidence 해제 후 환경 전환 시 편집값 유지 및 evidence 미부활 확인
    await page.getByLabel('전략 이름').fill('수정한 돈키안 초안');
    await page.getByLabel('회당 수량 (주)').fill('4');
    await page.getByLabel('진입 고가 기간 (봉)').fill('18');
    await expect(page.getByText(hash.slice(0, 8))).toHaveCount(0);

    await page.getByLabel('전략 환경').selectOption('kis-paper');
    await expect(page.getByLabel('전략 이름')).toHaveValue('수정한 돈키안 초안');
    await expect(page.getByLabel('회당 수량 (주)')).toHaveValue('4');
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('donchian_breakout');
    await expect(page.getByLabel('진입 고가 기간 (봉)')).toHaveValue('18');
    await expect(page.getByLabel('샹들리에 ATR 청산 오버레이 사용')).toBeChecked();
    await expect(page.getByText(hash.slice(0, 8))).toHaveCount(0);

    await page.getByLabel('전략 환경').selectOption('demo');
    await expect(page.getByLabel('전략 이름')).toHaveValue('수정한 돈키안 초안');
    await expect(page.getByLabel('진입 고가 기간 (봉)')).toHaveValue('18');
    await expect(page.getByText(hash.slice(0, 8))).toHaveCount(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('음수 필터·무효 오버레이 입력은 백테스트 이동과 실행에서 묵살하지 않고 경고로 차단한다', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', req => {
    if (req.method() === 'POST') posts.push(new URL(req.url()).pathname);
  });

  // Minor 1a: /strategies에서 최소 상대 거래량 -1 → 백테스트 이동 차단
  await page.goto('/strategies');
  await waitWorkbenchReady(page);
  await page.getByLabel('최소 상대 거래량 (배, 선택)').fill('-1');
  await page.getByRole('button', { name: '이 설정으로 백테스트', exact: true }).click();
  await expect(page).toHaveURL(/\/strategies$/);
  await expect(page.getByRole('alert')).toContainText('최소 상대 거래량은 0-5 범위');

  // Minor 1b: /strategies에서 추세 필터 -1 → 백테스트 이동 차단
  await page.getByLabel('최소 상대 거래량 (배, 선택)').fill('');
  await page.getByLabel('장기 추세 필터 (봉, 선택)').fill('-1');
  await page.getByRole('button', { name: '이 설정으로 백테스트', exact: true }).click();
  await expect(page).toHaveURL(/\/strategies$/);
  await expect(page.getByRole('alert')).toContainText('장기 추세 필터는 20-240');

  // Minor 1c: /strategies에서 샹들리에 ATR 기간 -1 → 백테스트 이동 차단
  await page.getByLabel('장기 추세 필터 (봉, 선택)').fill('');
  await page.getByLabel('샹들리에 ATR 청산 오버레이 사용').check();
  await page.getByLabel('ATR 기간 (봉)').fill('-1');
  await page.getByRole('button', { name: '이 설정으로 백테스트', exact: true }).click();
  await expect(page).toHaveURL(/\/strategies$/);
  await expect(page.getByRole('alert')).toContainText('샹들리에 청산 ATR 기간은 7-30');

  // Minor 1d: /backtest?source=demo에서 최소 상대 거래량 -1 → 실행 차단 및 POST 미전송
  await page.goto('/backtest?source=demo');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('button', { name: '백테스트 실행', exact: true })).toBeEnabled();
  await page.getByLabel('최소 상대 거래량 (배, 선택)').fill('-1');
  await page.getByRole('button', { name: '백테스트 실행', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('최소 상대 거래량은 0-5 범위');

  // Minor 1e (2차 보완): 선택 숫자 필터에 불완전 숫자('1e', validity.badInput) 입력 시 빈 필터 묵살·v1 전송 없이 차단
  const demoVol = page.getByLabel('최소 상대 거래량 (배, 선택)');
  await demoVol.fill('');
  await demoVol.focus();
  await page.keyboard.type('1e');
  await page.getByRole('button', { name: '백테스트 실행', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('올바른 숫자를 입력하세요.');
  await expect(demoVol).toBeFocused();

  // /strategies에서도 불완전 숫자('1e') 입력 시 백테스트 이동 차단
  await page.goto('/strategies');
  await waitWorkbenchReady(page);
  const stratVol = page.getByLabel('최소 상대 거래량 (배, 선택)');
  await stratVol.focus();
  await page.keyboard.type('1e');
  await page.getByRole('button', { name: '이 설정으로 백테스트', exact: true }).click();
  await expect(page).toHaveURL(/\/strategies$/);
  await expect(page.getByRole('alert')).toContainText('올바른 숫자를 입력하세요.');
  await expect(stratVol).toBeFocused();
  expect(posts).toEqual([]);
});

test('저장 일봉 백테스트에서 수집 구간(run.from-run.to) 밖 날짜 입력은 POST 없이 경고와 초점으로 차단한다', async ({ page }) => {
  const fixture = v2DailyFixture('005930');
  await page.route('**/api/state', route => route.fulfill({ json: snapshot() }));
  await page.route('**/api/data/daily', route => route.fulfill({ json: { runs: [fixture.run] } }));
  await page.route('**/api/backtest/experiments', route => route.fulfill({ json: { experiments: [] } }));
  const dailyPosts: string[] = [];
  page.on('request', req => {
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/backtest/daily') {
      dailyPosts.push(new URL(req.url()).pathname);
    }
  });

  await page.goto('/backtest');
  await waitWorkbenchReady(page);
  const executeBtn = page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true });
  await expect(executeBtn).toBeEnabled();

  // 시작일이 run.from(2026-01-05) 이전인 경우 차단 + 시작일 포커스
  const fromInput = page.getByLabel('시작일', { exact: true });
  const toInput = page.getByLabel('종료일', { exact: true });
  await fromInput.fill('2025-12-31');
  await executeBtn.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('시작일은 수집 구간');
  await expect(fromInput).toBeFocused();

  // 시작일 복원 후 종료일이 run.to 이후인 경우 차단 + 종료일 포커스
  await fromInput.fill('2026-01-05');
  await toInput.fill('2026-12-31');
  await executeBtn.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('종료일은 수집 구간');
  await expect(toInput).toBeFocused();
  expect(dailyPosts).toEqual([]);
});

test('KIS 모의 실시간 준비 상태에서도 미지원 규칙 카드는 시작 버튼을 비활성화하고 기본 SMA 5/110은 정지 저장 후 시작만 차단한다', async ({ page }) => {
  const state = snapshot();
  const now = new Date().toISOString();
  state.status.observedAt = now;
  state.status.lastSuccessAt = now;
  state.realtime = {
    phase: 'ready',
    required: true,
    ordersAllowed: true,
    fresh: true,
    message: 'REST 대조 완료',
    code: '005930',
    lastQuoteAt: now,
    quoteSeconds: 10,
    lastNoticeAt: null,
    reconciledAt: now,
    price: 73000,
  };
  state.strategies = [
    {
      id: 'kis-basic-sma',
      name: 'KIS 기본 SMA',
      code: '005930',
      fast: 5,
      slow: 20,
      qty: 1,
      active: false,
      lastSignal: 'hold',
      lastTick: -1,
      environment: 'kis-paper',
      revision: 1,
      rule: { kind: 'ma_crossover', maType: 'sma', fast: 5, slow: 20 },
    },
    {
      id: 'kis-donchian',
      name: 'KIS 미지원 돈키안',
      code: '005930',
      fast: 5,
      slow: 20,
      qty: 1,
      active: false,
      lastSignal: 'hold',
      lastTick: -1,
      environment: 'kis-paper',
      revision: 1,
      rule: { kind: 'donchian_breakout', entryLookback: 20, exitLookback: 10, volumeMultiplier: 1 },
      overlay: { chandelier: { atrPeriod: 14, atrMultiplier: 3 } },
    },
    {
      id: 'kis-ema',
      name: 'KIS 미지원 EMA',
      code: '005930',
      fast: 5,
      slow: 20,
      qty: 1,
      active: false,
      lastSignal: 'hold',
      lastTick: -1,
      environment: 'kis-paper',
      revision: 1,
      rule: { kind: 'ma_crossover', maType: 'ema', fast: 5, slow: 20 },
    },
  ];
  await page.route('**/api/state', route => {
    const current = new Date().toISOString();
    return route.fulfill({
      json: {
        ...state,
        status: { ...state.status, observedAt: current, lastSuccessAt: current },
        realtime: { ...state.realtime!, lastQuoteAt: current, reconciledAt: current },
      },
    });
  });

  const savedBodies: unknown[] = [];
  await page.route('**/api/strategies', async route => {
    const parsed = strategyInput.parse(route.request().postDataJSON());
    savedBodies.push(parsed);
    const id = 'kis-sma-110';
    state.strategies.push({
      ...parsed,
      id,
      active: false,
      lastSignal: 'hold',
      lastTick: -1,
      revision: 1,
      run: 0,
      evaluations: [],
    });
    state.revision += 1;
    await route.fulfill({ json: { id, revision: 1 } });
  });

  await page.goto('/strategies?environment=kis-paper');
  await waitWorkbenchReady(page);

  const smaCard = page.locator('.studio-card').filter({ has: page.getByRole('heading', { name: 'KIS 기본 SMA', exact: true }) });
  const donchianCard = page.locator('.studio-card').filter({ has: page.getByRole('heading', { name: 'KIS 미지원 돈키안', exact: true }) });
  const emaCard = page.locator('.studio-card').filter({ has: page.getByRole('heading', { name: 'KIS 미지원 EMA', exact: true }) });

  await expect(smaCard.getByRole('button', { name: '전략 시작', exact: true })).toBeEnabled();
  await expect(donchianCard.getByRole('button', { name: '전략 시작', exact: true })).toBeDisabled();
  await expect(donchianCard).toContainText('전략 시작 차단');
  await expect(emaCard.getByRole('button', { name: '전략 시작', exact: true })).toBeDisabled();
  await expect(emaCard).toContainText('전략 시작 차단');

  // Major (2차 보완): KIS 기본 SMA 5/110은 정지 상태로 저장 허용 + 저장 카드의 전략 시작 버튼만 blocked로 비활성화
  await page.getByLabel('전략 이름').fill('KIS 장기 110 SMA');
  await page.getByLabel('대상 종목').selectOption('005930');
  await page.getByLabel('단기 평균 (이벤트)').fill('5');
  await page.getByLabel('장기 평균 (이벤트)').fill('110');
  await expect(page.getByText(/101-120 구간은 정지 상태로 저장/)).toBeVisible();
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();

  expect(savedBodies).toHaveLength(1);
  const slow110Card = page.locator('.studio-card').filter({
    has: page.getByRole('heading', { name: 'KIS 장기 110 SMA', exact: true }),
  });
  await expect(slow110Card).toBeVisible();
  await expect(slow110Card).toContainText('정지');
  await expect(slow110Card).toContainText('전략 시작 차단');
  await expect(slow110Card).toContainText('장기 기간 100 이하만 지원');
  await expect(slow110Card.getByRole('button', { name: '전략 시작', exact: true })).toBeDisabled();
});

test('전략 스튜디오와 백테스트 상단 사용방법 도움말 패널의 4탭 전환·키보드 접근성·닫기가 동작한다', async ({ page }) => {
  for (const route of ['/strategies', '/backtest', '/backtest?source=demo']) {
    await page.goto(route);
    await waitWorkbenchReady(page);

    const toggle = page.getByRole('button', { name: '사용방법 도움말', exact: true });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const panelId = await toggle.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();

    // 도움말 열기
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const helpRegion = page.getByRole('region', { name: '전략 스튜디오 및 백테스트 사용방법 도움말' });
    await expect(helpRegion).toBeVisible();
    await expect(helpRegion).toHaveAttribute('id', panelId!);

    const tablist = helpRegion.getByRole('tablist', { name: '도움말 주제' });
    const tabs = tablist.getByRole('tab');
    await expect(tabs).toHaveCount(4);

    // Major 1: 4개 탭 모든 aria-controls 대상 tabpanel이 DOM에 존재하고 aria-labelledby 역참조가 일치하며 비활성 3개는 hidden
    const allTabPanels = helpRegion.locator('[role="tabpanel"]');
    await expect(allTabPanels).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      const tab = tabs.nth(i);
      const tabId = await tab.getAttribute('id');
      const controlsId = await tab.getAttribute('aria-controls');
      expect(tabId).toBeTruthy();
      expect(controlsId).toBeTruthy();
      const controlled = helpRegion.locator(`[id="${controlsId}"]`);
      await expect(controlled).toHaveCount(1);
      await expect(controlled).toHaveAttribute('role', 'tabpanel');
      await expect(controlled).toHaveAttribute('aria-labelledby', tabId!);
      if (i === 0) {
        await expect(controlled).toBeVisible();
        await expect(controlled).not.toHaveAttribute('hidden', '');
      } else {
        await expect(controlled).toBeHidden();
        await expect(controlled).toHaveAttribute('hidden', '');
      }
    }

    // 1번 탭(처음부터 따라하기) 기본 선택, /data#inventory-daily 링크 및 KIS 저장 일봉·v2 기준가 구분 문구 확인
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    const activePanel = helpRegion.getByRole('tabpanel');
    await expect(activePanel).toHaveCount(1);
    await expect(activePanel).toContainText('1단계');
    await expect(activePanel).toContainText('저장 일봉은 첫 봉 시가, DEMO는 첫 합성 봉 종가');
    await expect(activePanel).toContainText('KIS 저장 일봉 실험');
    await expect(activePanel).toContainText('DEMO 합성 백테스트는 기능 검증 전용으로 전략 연결·재현 검증 미제공');
    await expect(helpRegion.getByRole('link', { name: '데이터 상태 (/data)' })).toHaveAttribute(
      'href',
      '/data#inventory-daily',
    );

    // 키보드 화살표(ArrowRight / ArrowLeft / End / Home)로 4개 탭 전환 및 보완 문구 확인
    await tabs.nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(allTabPanels.nth(0)).toBeHidden();
    await expect(allTabPanels.nth(1)).toBeVisible();
    await expect(activePanel).toContainText('ma_crossover');
    await expect(activePanel).toContainText('SMA, 단기 5 / 장기 20 (추세·거래량 필터 꺼짐)');
    await expect(activePanel).toContainText('donchian_breakout');
    await expect(activePanel).toContainText('진입 고가 20봉 / 청산 저가 10봉 / 최소 거래량 1배 초과');
    await expect(activePanel).toContainText('이상(>=)');
    await expect(activePanel).toContainText('이하(<=)');
    await expect(activePanel).toContainText('입력 허용 범위 0.5-5 (양끝 포함)');
    await expect(activePanel).toContainText('rsi2_pullback');
    await expect(activePanel).toContainText('RSI 기간 2봉 / 과매도 기준 10 이하 / 장기 추세선 200봉 / 청산 단기선 5봉 / 최대 보유 10봉');
    await expect(activePanel).toContainText('수익 미보장');
    await expect(activePanel).not.toContainText('즉시 익절');
    await expect(activePanel).toContainText('chandelier');
    await expect(activePanel).toContainText('기본 꺼짐 (활성화 시 초기값: ATR 기간 14봉 / ATR 배수 3배)');
    await expect(activePanel).toContainText('저장 일봉에서는 봉의 종가가 추적 손절선 이하(<=)이면');
    await expect(activePanel).toContainText('다음 봉 시가에 체결한다고 가정합니다. DEMO에서는 샹들리에를 사용할 수 없습니다.');
    await expect(activePanel).not.toContainText('DEMO는 다음 봉 종가');

    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(2)).toBeFocused();
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
    await expect(allTabPanels.nth(1)).toBeHidden();
    await expect(allTabPanels.nth(2)).toBeVisible();
    await expect(activePanel).toContainText('v1 경로라 단순 보유 비교 미표시');
    await expect(activePanel).toContainText('KIS 저장 일봉은 첫 봉 시가, DEMO 합성은 첫 합성 봉 종가');
    await expect(activePanel).toContainText('최대 낙폭 (MDD)');
    await expect(activePanel).toContainText('KIS 저장 일봉 실험에서만 제공됩니다');
    await expect(activePanel).toContainText('SHA256은 저장된 입력 스냅샷의 해시를 대조');
    await expect(activePanel).toContainText('엔진을 다시 실행한 뒤 기존 저장 결과와 동등성을 별도로 비교');

    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(3)).toBeFocused();
    await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true');
    await expect(allTabPanels.nth(2)).toBeHidden();
    await expect(allTabPanels.nth(3)).toBeVisible();
    await expect(activePanel).toContainText('101-120');
    await expect(activePanel).toContainText('정지 상태(active=false) 저장과 저장 일봉 백테스트는 가능하지만');
    await expect(activePanel).toContainText('KIS 실시간 시작 계약 상한(100 이하)에 따라 전략 시작은 차단');
    await expect(activePanel).toContainText('검증 실험 연결 배지가 왜 사라졌나요?');

    await page.keyboard.press('Home');
    await expect(tabs.nth(0)).toBeFocused();
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('End');
    await expect(tabs.nth(3)).toBeFocused();
    await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('ArrowLeft');
    await expect(tabs.nth(2)).toBeFocused();
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');

    // 닫기 버튼으로 패널 접힘 및 토글 버튼 포커스 복귀 확인
    await helpRegion.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(helpRegion).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  }
});

test('RuleConfigSection 문맥별 입력 항목 설명이 선택 규칙 변경에 따라 갱신되고 모바일 390px에서 넘치지 않는다', async ({ page }) => {
  for (const route of ['/strategies', '/backtest']) {
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(route);
    await waitWorkbenchReady(page);

    const ruleSelect = page.getByRole('combobox', { name: '전략 규칙', exact: true });
    const helpDetails = page.locator('details.rule-field-help');
    await expect(helpDetails).toBeVisible();
    await expect(helpDetails.locator('summary')).toHaveText('현재 선택한 규칙(이동평균 교차) 입력 항목 설명 보기');

    // 접이식 가이드 열기 및 이동평균 교차 항목 설명·기본 프리셋 초기값 확인
    await helpDetails.locator('summary').click();
    await expect(helpDetails).toContainText('SMA, 단기 5 / 장기 20 (추세·거래량 필터 꺼짐)');
    await expect(helpDetails).toContainText('단기 / 장기 평균');
    await expect(helpDetails).toContainText('장기 추세 필터 (선택)');
    await expect(helpDetails).toContainText('샹들리에 ATR 청산 오버레이 (선택 사항)');
    await expect(helpDetails).toContainText('기본 꺼짐 (활성화 시 초기값: ATR 기간 14봉 / ATR 배수 3배)');

    // 돈키안 돌파로 전환 시 제목과 설명 내용(이상/이하·범위/초과 분리) 즉시 갱신 확인
    await ruleSelect.selectOption('donchian_breakout');
    await expect(helpDetails.locator('summary')).toHaveText('현재 선택한 규칙(돈키안 돌파) 입력 항목 설명 보기');
    await expect(helpDetails).toContainText('진입 고가 20봉 / 청산 저가 10봉 / 최소 거래량 1배 초과');
    await expect(helpDetails).toContainText('이상(>=)');
    await expect(helpDetails).toContainText('이하(<=)');
    await expect(helpDetails).toContainText('입력 허용 범위 0.5-5 (양끝 포함)');

    // RSI 단기 눌림목으로 전환 + 샹들리에 체크 시 갱신(수익 미보장·종가 판정/다음 봉 체결) 확인
    await ruleSelect.selectOption('rsi2_pullback');
    await expect(helpDetails.locator('summary')).toHaveText('현재 선택한 규칙(RSI 단기 눌림목) 입력 항목 설명 보기');
    await expect(helpDetails).toContainText('RSI 기간 2봉 / 과매도 기준 10 이하 / 장기 추세선 200봉 / 청산 단기선 5봉 / 최대 보유 10봉');
    await expect(helpDetails).toContainText('수익 미보장');
    await expect(helpDetails).not.toContainText('즉시 익절');

    await page.getByLabel('샹들리에 ATR 청산 오버레이 사용').check();
    await expect(helpDetails).toContainText('샹들리에 ATR 청산 오버레이 (사용 중)');
    await expect(helpDetails).toContainText('저장 일봉에서는 봉의 종가가 추적 손절선 이하(<=)이면');
    await expect(helpDetails).toContainText('다음 봉 시가에 체결한다고 가정합니다. DEMO에서는 샹들리에를 사용할 수 없습니다.');
    await expect(helpDetails).not.toContainText('DEMO는 다음 봉 종가');

    // 모바일 390px 뷰포트에서 상단 도움말(4개 탭 전체)과 문맥별 입력 항목 설명을 연 상태로 가로 넘침 없음 확인
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '사용방법 도움말', exact: true }).click();
    const helpRegion = page.getByRole('region', { name: '전략 스튜디오 및 백테스트 사용방법 도움말' });
    await expect(helpRegion).toBeVisible();

    const tabs = helpRegion.getByRole('tab');
    for (let i = 0; i < 4; i++) {
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(390);
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
    }
  }
});
