import { planLimits } from '../../shared/trading-plan';
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

    // KIS 모의 환경으로 전환 시 초안·evidence가 유지되며 확정 일봉 기반 안내와 함께 저장 가능
    await page.getByLabel('전략 환경').selectOption('kis-paper');
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('donchian_breakout');
    await expect(page.getByLabel('환경별 사용 가능 여부')).toContainText('KIS 모의: 확정 일봉 기반');
    await expect(
      page.getByText('전용 원장에 고정된 직전 KRX 개장일 확정 일봉 신호로 당일 1회 집행합니다.'),
    ).toBeVisible();
    await expect(page.getByText(hash.slice(0, 8))).toBeVisible();

    await page.getByLabel('전략 이름').fill('검증된 돈키안 샹들리에');
    await page.getByRole('button', { name: '전략 저장', exact: true }).click();

    const savedCard = page.locator('.studio-card').filter({
      has: page.getByRole('heading', { name: '검증된 돈키안 샹들리에', exact: true }),
    });
    await expect(savedCard).toBeVisible();
    await expect(savedCard).toContainText('KIS 모의: 확정 일봉 기반');
    await expect(savedCard).toContainText(`검증 실험 연결 · ${hash.slice(0, 8)}`);
    await expect(savedCard).toContainText('돈키안 돌파');
    await expect(savedCard).toContainText('ATR(10)×2.5');
    await expect(savedCard).not.toContainText('저장 일봉 백테스트 전용');
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

test('KIS 모의 실시간 준비 상태에서 종가 확정형+샹들리에 카드는 시작 가능하고 미지원 3종(돌파·패리티·기본 SMA 101-120)만 차단한다', async ({ page }) => {
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
      name: 'KIS 확정 일봉 돈키안',
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
      name: 'KIS 확정 일봉 EMA',
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
    {
      id: 'kis-macd-chandelier',
      name: 'KIS 확정 일봉 MACD 샹들리에',
      code: '005930',
      fast: 5,
      slow: 20,
      qty: 1,
      active: false,
      lastSignal: 'hold',
      lastTick: -1,
      environment: 'kis-paper',
      revision: 1,
      rule: { kind: 'macd_momentum', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, requireZeroLineAbove: false },
      overlay: { chandelier: { atrPeriod: 14, atrMultiplier: 3 } },
    },
    {
      id: 'kis-vb',
      name: 'KIS 미지원 윌리엄스 돌파',
      code: '005930',
      fast: 5,
      slow: 20,
      qty: 1,
      active: false,
      lastSignal: 'hold',
      lastTick: -1,
      environment: 'kis-paper',
      revision: 1,
      rule: {
        kind: 'volatility_breakout',
        k: 0.5,
        useAdaptiveNoise: false,
        noiseLookback: 20,
        trendMaPeriod: 20,
        holdDays: 1,
      },
    },
    {
      id: 'kis-sma-parity',
      name: 'KIS 미지원 SMA 패리티',
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
      overlay: { volatilityParity: { volLookback: 20, targetAnnualVolPct: 20, maxAllocationPct: 100 } },
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
    const id = `kis-saved-${savedBodies.length}`;
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
  const donchianCard = page.locator('.studio-card').filter({ has: page.getByRole('heading', { name: 'KIS 확정 일봉 돈키안', exact: true }) });
  const emaCard = page.locator('.studio-card').filter({ has: page.getByRole('heading', { name: 'KIS 확정 일봉 EMA', exact: true }) });
  const macdCard = page.locator('.studio-card').filter({ has: page.getByRole('heading', { name: 'KIS 확정 일봉 MACD 샹들리에', exact: true }) });
  const vbCard = page.locator('.studio-card').filter({ has: page.getByRole('heading', { name: 'KIS 미지원 윌리엄스 돌파', exact: true }) });
  const parityCard = page.locator('.studio-card').filter({ has: page.getByRole('heading', { name: 'KIS 미지원 SMA 패리티', exact: true }) });

  // 지원: 기본 SMA(이벤트 단위) + 종가 확정형 10종 + 샹들리에(봉 단위) → 전략 시작 활성화
  await expect(smaCard).toContainText('단기 5이벤트');
  await expect(smaCard).toContainText('장기 20이벤트');
  await expect(smaCard.getByRole('button', { name: '전략 시작', exact: true })).toBeEnabled();
  await expect(donchianCard).toContainText('KIS 모의: 확정 일봉 기반');
  await expect(donchianCard.getByRole('button', { name: '전략 시작', exact: true })).toBeEnabled();
  await expect(emaCard).toContainText('KIS 모의: 확정 일봉 기반');
  await expect(emaCard).toContainText('단기 5봉');
  await expect(emaCard).toContainText('장기 20봉');
  await expect(emaCard).not.toContainText('5이벤트');
  await expect(emaCard.getByRole('button', { name: '전략 시작', exact: true })).toBeEnabled();
  await expect(macdCard).toContainText('KIS 모의: 확정 일봉 기반');
  await expect(macdCard.getByRole('button', { name: '전략 시작', exact: true })).toBeEnabled();

  // 미지원 ①·②: 윌리엄스 돌파, 변동성 패리티 → 전략 시작 비활성화 + 차단 사유
  await expect(vbCard.getByRole('button', { name: '전략 시작', exact: true })).toBeDisabled();
  await expect(vbCard).toContainText('전략 시작 차단');
  await expect(vbCard).toContainText('윌리엄스 변동성 돌파와 변동성 패리티 수량 조절은 저장 일봉 백테스트 전용입니다.');
  await expect(parityCard.getByRole('button', { name: '전략 시작', exact: true })).toBeDisabled();
  await expect(parityCard).toContainText('전략 시작 차단');
  await expect(parityCard).toContainText('윌리엄스 변동성 돌파와 변동성 패리티 수량 조절은 저장 일봉 백테스트 전용입니다.');

  // Major 3: 편집 폼 단위 정합화 — 기본 무필터 SMA(5/20)는 '이벤트', EMA·필터·샹들리에 확정 일봉 모드는 '봉'
  await expect(page.getByLabel('단기 평균 (이벤트)')).toBeVisible();
  await expect(page.getByLabel('장기 평균 (이벤트)')).toBeVisible();
  await page.getByLabel('평균 방식').selectOption('ema');
  await expect(page.getByLabel('단기 평균 (봉)')).toBeVisible();
  await expect(page.getByLabel('장기 평균 (봉)')).toBeVisible();
  await page.getByLabel('평균 방식').selectOption('sma');
  await expect(page.getByLabel('단기 평균 (이벤트)')).toBeVisible();
  await page.getByLabel('샹들리에 ATR 청산 오버레이 사용').check();
  await expect(page.getByLabel('단기 평균 (봉)')).toBeVisible();
  await expect(page.getByLabel('장기 평균 (봉)')).toBeVisible();
  await page.getByLabel('샹들리에 ATR 청산 오버레이 사용').uncheck();
  await expect(page.getByLabel('단기 평균 (이벤트)')).toBeVisible();

  // RuleConfigSection 배지·안내: MACD+샹들리에(확정 일봉 기반) → 저장 후 카드 시작 활성 확인
  const envBadges = page.getByLabel('환경별 사용 가능 여부');
  const ruleSelect = page.getByRole('combobox', { name: '전략 규칙', exact: true });
  await ruleSelect.selectOption('macd_momentum');
  await page.getByLabel('샹들리에 ATR 청산 오버레이 사용').check();
  await expect(envBadges.locator('.badge.teal')).toContainText(['KIS 모의: 확정 일봉 기반']);
  await expect(
    page.getByText('전용 원장에 고정된 직전 KRX 개장일 확정 일봉 신호로 당일 1회 집행합니다.'),
  ).toBeVisible();
  await page.getByLabel('전략 이름').fill('신규 MACD 샹들리에');
  await page.getByLabel('대상 종목').selectOption('005930');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  const savedMacdCard = page.locator('.studio-card').filter({
    has: page.getByRole('heading', { name: '신규 MACD 샹들리에', exact: true }),
  });
  await expect(savedMacdCard).toBeVisible();
  await expect(savedMacdCard).toContainText('KIS 모의: 확정 일봉 기반');
  await expect(savedMacdCard.getByRole('button', { name: '전략 시작', exact: true })).toBeEnabled();

  // 미지원 ③: 기본 무필터 SMA 5/110은 체결가 단위('이벤트')·경고 배지 유지 + 정지 상태 저장 허용 + 저장 카드의 전략 시작 버튼만 blocked로 비활성화
  await page.getByLabel('샹들리에 ATR 청산 오버레이 사용').uncheck();
  await ruleSelect.selectOption('ma_crossover');
  await page.getByLabel('전략 이름').fill('KIS 장기 110 SMA');
  await page.getByLabel('대상 종목').selectOption('005930');
  await page.getByLabel('단기 평균 (이벤트)').fill('5');
  await page.getByLabel('장기 평균 (이벤트)').fill('110');
  await expect(page.getByLabel('단기 평균 (이벤트)')).toBeVisible();
  await expect(page.getByLabel('장기 평균 (이벤트)')).toBeVisible();
  await expect(
    envBadges.locator('.badge.warning').filter({ hasText: 'KIS 모의 · 시작 제한 (정지 저장만 가능)' }),
  ).toBeVisible();
  await expect(page.getByText(/101-120 구간은 정지 상태로 저장/)).toBeVisible();
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();

  expect(savedBodies).toHaveLength(2);
  const slow110Card = page.locator('.studio-card').filter({
    has: page.getByRole('heading', { name: 'KIS 장기 110 SMA', exact: true }),
  });
  await expect(slow110Card).toBeVisible();
  await expect(slow110Card).toContainText('단기 5이벤트');
  await expect(slow110Card).toContainText('장기 110이벤트');
  await expect(slow110Card).not.toContainText('110봉');
  await expect(slow110Card).toContainText('정지');
  await expect(slow110Card).toContainText('전략 시작 차단');
  await expect(slow110Card).toContainText('실시간 체결가 기본 SMA의 장기 기간은 100 이하여야 합니다.');
  await expect(slow110Card.getByRole('button', { name: '전략 시작', exact: true })).toBeDisabled();
});

test('전략 스튜디오와 백테스트 상단 사용방법 도움말 패널의 4탭 전환·키보드 접근성·닫기가 동작한다', async ({ page }) => {
  for (const route of ['/strategies', '/backtest', '/backtest?source=demo']) {
    await page.goto(route);
    await waitWorkbenchReady(page);

    const toggle = page.getByRole('button', { name: '사용방법 도움말', exact: true });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).not.toHaveAttribute('aria-controls');

    // 도움말 열기
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panelId = await toggle.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
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
    await expect(activePanel).toContainText('H0STCNT0');
    await expect(activePanel).toContainText('종가 확정형 10종');
    await expect(activePanel).toContainText('19 샹들리에 청산');
    await expect(activePanel).toContainText('고정 이후 추가 수집한 일봉은 기존 전용 원장에 자동 반영되지 않습니다');
    await expect(activePanel).toContainText('05 윌리엄스 변동성 돌파');
    await expect(activePanel).toContainText('20 변동성 패리티');
    await expect(activePanel).toContainText('101-120');
    await expect(activePanel).toContainText('정지 상태(active=false) 저장과 저장 일봉 백테스트는 가능하지만');
    await expect(activePanel).toContainText('KIS 실시간 시작 계약 상한(100 이하)에 따라 전략 시작과 계약 고정은 차단');
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

    // 닫기 버튼으로 패널 접힘 및 토글 버튼 포커스 복귀·dangling aria-controls 제거 확인
    await helpRegion.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(helpRegion).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).not.toHaveAttribute('aria-controls');
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

test('신규 7종 규칙 선택·프리셋 적용·정수/소수/대소 역전/범위 밖/badInput 검증이 동작한다', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', req => {
    if (req.method() === 'POST') posts.push(new URL(req.url()).pathname);
  });

  await page.goto('/strategies?environment=kis-paper');
  await waitWorkbenchReady(page);

  const ruleSelect = page.getByRole('combobox', { name: '전략 규칙', exact: true });
  const options = await ruleSelect.locator('option').evaluateAll(els => els.map(el => (el as HTMLOptionElement).value));
  expect(options).toHaveLength(16);
  expect(options).toEqual(
    expect.arrayContaining([
      'ma_crossover',
      'donchian_breakout',
      'volatility_breakout',
      'rsi2_pullback',
      'macd_momentum',
      'adx_dmi_trend',
      'bollinger_squeeze',
      'ttm_squeeze',
      'bollinger_percent_b',
      'low_volume_pullback',
      'disparity_reversion',
    ]),
  );

  // 1. MACD 히스토그램: 프리셋·체크박스·대소 역전·정수 소수·badInput 검증
  await ruleSelect.selectOption('macd_momentum');
  await expect(page.getByLabel('단기 EMA (봉)')).toHaveValue('12');
  await expect(page.getByLabel('장기 EMA (봉)')).toHaveValue('26');
  await expect(page.getByLabel('시그널 EMA (봉)')).toHaveValue('9');
  await expect(page.getByLabel('MACD > 0 (제로선 위에서만 매수)')).not.toBeChecked();
  await expect(page.getByRole('button', { name: '기본', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: '보수적', exact: true }).click();
  await expect(page.getByLabel('MACD > 0 (제로선 위에서만 매수)')).toBeChecked();
  await expect(page.getByRole('button', { name: '보수적', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: '공격적', exact: true }).click();
  await expect(page.getByLabel('단기 EMA (봉)')).toHaveValue('8');
  await expect(page.getByLabel('장기 EMA (봉)')).toHaveValue('17');
  await expect(page.getByLabel('MACD > 0 (제로선 위에서만 매수)')).not.toBeChecked();

  // 대소 역전 차단
  await page.getByLabel('단기 EMA (봉)').fill('20');
  await page.getByLabel('장기 EMA (봉)').fill('15');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('MACD 단기 기간은 장기 기간보다 작아야 합니다.');
  await expect(page.getByLabel('단기 EMA (봉)')).toBeFocused();

  // 정수 필드에 소수 입력 차단
  await page.getByLabel('단기 EMA (봉)').fill('12.5');
  await page.getByLabel('장기 EMA (봉)').fill('26');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('MACD 단기 EMA 기간은 3-30 사이의 정수로 입력하세요.');
  await expect(page.getByLabel('단기 EMA (봉)')).toBeFocused();

  // badInput('1e') 차단
  const macdFast = page.getByLabel('단기 EMA (봉)');
  await macdFast.fill('');
  await macdFast.focus();
  await page.keyboard.type('1e');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('올바른 숫자를 입력하세요.');
  await expect(macdFast).toBeFocused();

  // 2. ADX·DMI 추세: 프리셋 및 소수/범위 검증
  await ruleSelect.selectOption('adx_dmi_trend');
  await expect(page.getByLabel('DI 기간 (봉)')).toHaveValue('14');
  await expect(page.getByLabel('ADX 기준')).toHaveValue('25');
  await page.getByRole('button', { name: '보수적', exact: true }).click();
  await expect(page.getByLabel('ADX 기준')).toHaveValue('30');
  await page.getByLabel('DI 기간 (봉)').fill('14.5');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('DI 기간은 7-30 사이의 정수로 입력하세요.');
  await page.getByLabel('DI 기간 (봉)').fill('14');
  await page.getByLabel('ADX 기준').fill('50');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('ADX 기준은 15-40 범위');

  // 3. 볼린저 스퀴즈: 프리셋 및 범위 검증
  await ruleSelect.selectOption('bollinger_squeeze');
  await page.getByRole('button', { name: '공격적', exact: true }).click();
  await expect(page.getByLabel('표준편차 배수')).toHaveValue('1.8');
  await expect(page.getByLabel('수축 비교 기간 (봉)')).toHaveValue('40');
  await expect(page.getByLabel('수축 하위 분위수 (%)')).toHaveValue('35');
  await page.getByLabel('수축 하위 분위수 (%)').fill('5');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('수축 하위 분위수는 10-50 범위');

  // 4. TTM 스퀴즈: 프리셋 및 범위 검증
  await ruleSelect.selectOption('ttm_squeeze');
  await expect(page.getByLabel('계산 기간 (봉)')).toHaveValue('20');
  await expect(page.getByLabel('볼린저 배수')).toHaveValue('2');
  await expect(page.getByLabel('켈트너 배수')).toHaveValue('1.5');
  await page.getByRole('button', { name: '공격적', exact: true }).click();
  await expect(page.getByLabel('계산 기간 (봉)')).toHaveValue('14');
  await page.getByLabel('켈트너 배수').fill('0.5');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('켈트너 배수는 1-2.5 범위');

  // 5. 볼린저 %B 반등: 프리셋 및 범위 검증
  await ruleSelect.selectOption('bollinger_percent_b');
  await expect(page.getByLabel('RSI 기간 (봉)')).toHaveValue('14');
  await expect(page.getByLabel('청산 목표 %B (이상)')).toHaveValue('0.55');
  await page.getByRole('button', { name: '보수적', exact: true }).click();
  await expect(page.getByLabel('볼린저 표준편차 배수')).toHaveValue('2.2');
  await expect(page.getByLabel('RSI 과매도 기준 (이하)')).toHaveValue('30');
  await page.getByLabel('청산 목표 %B (이상)').fill('0.2');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('청산 목표 %B는 0.4-1 범위');

  // 6. 거래량 고갈 눌림목: 프리셋 및 정수/범위 검증
  await ruleSelect.selectOption('low_volume_pullback');
  await page.getByRole('button', { name: '보수적', exact: true }).click();
  await expect(page.getByLabel('눌림 기간 (봉)')).toHaveValue('4');
  await expect(page.getByLabel('최대 거래량 비율 (배)')).toHaveValue('0.55');
  await page.getByLabel('눌림 기간 (봉)').fill('3.5');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('눌림 기간은 2-7 사이의 정수로 입력하세요.');
  await page.getByLabel('눌림 기간 (봉)').fill('3');
  await page.getByLabel('단기 추세선 (봉)').fill('35');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('단기 추세선은 10-30 사이의 정수로 입력하세요.');

  // 7. 이격도 복원: 프리셋 및 범위 검증
  await ruleSelect.selectOption('disparity_reversion');
  await page.getByRole('button', { name: '공격적', exact: true }).click();
  await expect(page.getByLabel('이동평균 기간 (봉)')).toHaveValue('15');
  await expect(page.getByLabel('매수 이격도 (%, 이하)')).toHaveValue('95');
  await expect(page.getByLabel('매도 이격도 (%, 이상)')).toHaveValue('100.5');
  await expect(page.getByLabel('손절 기준 (%)')).toHaveValue('6');
  await page.getByLabel('매수 이격도 (%, 이하)').fill('99');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('매수 이격도는 85-97 범위');
  await page.getByLabel('매수 이격도 (%, 이하)').fill('93');
  await page.getByLabel('손절 기준 (%)').fill('15');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('손절 기준은 2-10 범위');

  expect(posts).toEqual([]);
});

test('DEMO 종가 전용 분기: MACD·%B는 백테스트/저장 성공하고 일봉 전용 신규 5종은 안내·차단한다', async ({ page }) => {
  await page.goto('/strategies');
  await waitWorkbenchReady(page);
  await expect(page.getByLabel('전략 환경')).toBeEnabled();

  const ruleSelect = page.getByRole('combobox', { name: '전략 규칙', exact: true });

  // DEMO 저장 허용 1: MACD 히스토그램
  await ruleSelect.selectOption('macd_momentum');
  await expect(page.getByText('DEMO · 지원')).toBeVisible();
  await page.getByRole('button', { name: '보수적', exact: true }).click();
  await page.getByLabel('전략 이름').fill('DEMO MACD 모멘텀');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  const macdCard = page.locator('.studio-card').filter({
    has: page.getByRole('heading', { name: 'DEMO MACD 모멘텀', exact: true }),
  });
  await expect(macdCard).toBeVisible();
  await expect(macdCard).toContainText('MACD 히스토그램');
  await expect(macdCard).toContainText('12/26/9봉');
  await expect(macdCard).toContainText('MACD > 0');

  // DEMO 저장 허용 2: 볼린저 %B 반등
  await ruleSelect.selectOption('bollinger_percent_b');
  await expect(page.getByText('DEMO · 지원')).toBeVisible();
  await page.getByRole('button', { name: '공격적', exact: true }).click();
  await page.getByLabel('전략 이름').fill('DEMO 볼린저 %B');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  const pbCard = page.locator('.studio-card').filter({
    has: page.getByRole('heading', { name: 'DEMO 볼린저 %B', exact: true }),
  });
  await expect(pbCard).toBeVisible();
  await expect(pbCard).toContainText('볼린저 %B 반등');
  await expect(pbCard).toContainText('14봉 · 1.8σ');
  await expect(pbCard).toContainText('RSI(10)');

  // DEMO 저장 차단: 신규 일봉 전용 5종은 POST 없이 경고 표시
  const blockedPosts: string[] = [];
  page.on('request', req => {
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/strategies') {
      blockedPosts.push(req.url());
    }
  });
  for (const kind of [
    'adx_dmi_trend',
    'bollinger_squeeze',
    'ttm_squeeze',
    'low_volume_pullback',
    'disparity_reversion',
  ] as const) {
    await ruleSelect.selectOption(kind);
    await expect(page.getByText('DEMO · 미지원')).toBeVisible();
    await page.getByLabel('전략 이름').fill(`DEMO 차단 ${kind}`);
    await page.getByRole('button', { name: '전략 저장', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('DEMO는 종가만 제공합니다');
  }
  expect(blockedPosts).toEqual([]);

  // /backtest?source=demo: MACD·%B 성공(최상위 fast/slow 없음) vs 일봉 전용 5종 차단(POST 0건)
  const demoPayloads: Record<string, unknown>[] = [];
  page.on('request', req => {
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/backtest') {
      demoPayloads.push(req.postDataJSON() as Record<string, unknown>);
    }
  });

  await page.goto('/backtest?source=demo');
  await waitWorkbenchReady(page);
  const btSelect = page.getByRole('combobox', { name: '전략 규칙', exact: true });
  const runBtn = page.getByRole('button', { name: '백테스트 실행', exact: true });
  await expect(runBtn).toBeEnabled();

  for (const kind of ['macd_momentum', 'bollinger_percent_b'] as const) {
    await btSelect.selectOption(kind);
    await runBtn.click();
    const result = page.getByRole('region', { name: '합성 실험 결과' });
    await expect(result).toBeVisible();
    await expect(result.getByLabel('단순 보유 벤치마크 비교')).toBeVisible();
  }
  expect(demoPayloads).toHaveLength(2);
  for (const sent of demoPayloads) {
    expect(sent).not.toHaveProperty('fast');
    expect(sent).not.toHaveProperty('slow');
    expect(sent).toHaveProperty('rule');
  }

  for (const kind of ['adx_dmi_trend', 'bollinger_squeeze', 'ttm_squeeze', 'low_volume_pullback', 'disparity_reversion'] as const) {
    await btSelect.selectOption(kind);
    await runBtn.click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('DEMO는 종가만 제공합니다');
  }
  expect(demoPayloads).toHaveLength(2);
});

test('신규 7종 저장 일봉 백테스트 실행 및 /strategies ↔ /backtest 왕복·evidence 배지·KIS 모의 확정 일봉 기반 저장', async ({ page }) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');
  const fixture = v2DailyFixture('005930');
  store.saveDaily(fixture.run, fixture.bars);

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4336]);
  await new Promise<void>(resolve => server.listen(4336, '127.0.0.1', resolve));

  const dailyPayloads: Record<string, unknown>[] = [];
  await page.route('**/api/**', async route => {
    const req = route.request();
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/backtest/daily') {
      dailyPayloads.push(req.postDataJSON() as Record<string, unknown>);
    }
    const response = await route.fetch({ url: req.url().replace(':4314', ':4336') });
    await route.fulfill({ response });
  });

  try {
    await page.goto('/backtest');
    await waitWorkbenchReady(page);
    const btSelect = page.getByRole('combobox', { name: '전략 규칙', exact: true });
    const runBtn = page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true });
    await expect(runBtn).toBeEnabled();

    const newKinds = [
      'macd_momentum',
      'adx_dmi_trend',
      'bollinger_squeeze',
      'ttm_squeeze',
      'bollinger_percent_b',
      'low_volume_pullback',
      'disparity_reversion',
    ] as const;

    const result = page.getByRole('region', { name: '저장 일봉 실험 결과' });
    for (const kind of newKinds) {
      await btSelect.selectOption(kind);
      await runBtn.click();
      await expect(result).toBeVisible();
      await expect(result.getByLabel('단순 보유 벤치마크 비교')).toBeVisible();
    }

    expect(dailyPayloads).toHaveLength(7);
    newKinds.forEach((kind, idx) => {
      const sent = dailyPayloads[idx];
      expect(sent).not.toHaveProperty('fast');
      expect(sent).not.toHaveProperty('slow');
      expect((sent.rule as { kind: string }).kind).toBe(kind);
    });

    // 마지막 결과(disparity_reversion)에서 해시 추출 후 전략 스튜디오로 전달
    await result.getByText('재현 입력·출처 확인', { exact: true }).click();
    const hash = (await result.getByTestId('experiment-hash').textContent())?.trim() ?? '';
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    await result.getByRole('button', { name: '이 설정으로 전략 만들기', exact: true }).click();
    await expect(page).toHaveURL(/\/strategies#strategy-editor$/);
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('disparity_reversion');
    await expect(page.getByLabel('이동평균 기간 (봉)')).toHaveValue('20');
    await expect(page.getByLabel('매수 이격도 (%, 이하)')).toHaveValue('93');
    await expect(page.getByLabel('매도 이격도 (%, 이상)')).toHaveValue('99.5');
    await expect(page.getByLabel('손절 기준 (%)')).toHaveValue('5');
    await expect(page.getByText(hash.slice(0, 8))).toBeVisible();

    // KIS 모의 전환 시 초안·evidence 유지 + 확정 일봉 기반 배지 표시 + 저장 허용
    await page.getByLabel('전략 환경').selectOption('kis-paper');
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('disparity_reversion');
    await expect(page.getByLabel('환경별 사용 가능 여부')).toContainText('KIS 모의: 확정 일봉 기반');
    await expect(page.getByText(hash.slice(0, 8))).toBeVisible();
    await page.getByLabel('전략 이름').fill('검증된 이격도 복원');
    await page.getByRole('button', { name: '전략 저장', exact: true }).click();

    const savedCard = page.locator('.studio-card').filter({
      has: page.getByRole('heading', { name: '검증된 이격도 복원', exact: true }),
    });
    await expect(savedCard).toBeVisible();
    await expect(savedCard).toContainText('KIS 모의: 확정 일봉 기반');
    await expect(savedCard).toContainText(`검증 실험 연결 · ${hash.slice(0, 8)}`);
    await expect(savedCard).toContainText('이격도 복원');
    await expect(savedCard).toContainText('≤ 93% / ≥ 99.5%');
    await expect(savedCard).toContainText('-5%');
    await expect(savedCard).toContainText('정지');
    await expect(savedCard).not.toContainText('저장 일봉 백테스트 전용');
    await expect(savedCard.getByRole('button', { name: '전략 시작', exact: true })).toBeDisabled();
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('10종 도움말 사전·문맥 가이드 동적 전환·지원 환경별 체결 가정 분리 및 390px 모바일 무넘침 검증', async ({ page }) => {
  const storedOnlyKinds = [
    'donchian_breakout',
    'adx_dmi_trend',
    'bollinger_squeeze',
    'ttm_squeeze',
    'low_volume_pullback',
    'disparity_reversion',
  ] as const;
  const demoCompatibleKinds = ['ma_crossover', 'rsi2_pullback', 'macd_momentum', 'bollinger_percent_b'] as const;

  for (const route of ['/strategies', '/backtest']) {
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(route);
    await waitWorkbenchReady(page);

    // 1. 상단 도움말 패널 사전 탭에 단일 11종 + 다종목 5종 + 오버레이 2종(총 18카드) 모두 표시 및 환경별 체결 가정 분리 확인
    await page.getByRole('button', { name: '사용방법 도움말', exact: true }).click();
    const helpRegion = page.getByRole('region', { name: '전략 스튜디오 및 백테스트 사용방법 도움말' });
    await expect(helpRegion.locator('[role="tabpanel"]')).toHaveCount(4);
    await helpRegion.getByRole('tab', { name: '전략·입력 항목 사전', exact: true }).click();

    const dictPanel = helpRegion.locator('[role="tabpanel"]:not([hidden])');
    const cards = dictPanel.locator('article.research-help-card');
    await expect(cards).toHaveCount(18);

    for (const kind of storedOnlyKinds) {
      const card = cards.filter({ has: page.locator('code', { hasText: new RegExp(`^${kind}$`) }) });
      await expect(card).toHaveCount(1);
      await expect(card).toContainText('저장 일봉에서는 종가 판정 후 다음 봉 시가에 체결한다고 가정합니다. DEMO에서는 사용할 수 없습니다.');
      await expect(card).not.toContainText('다음 합성 봉 종가');
    }
    for (const kind of demoCompatibleKinds) {
      const card = cards.filter({ has: page.locator('code', { hasText: new RegExp(`^${kind}$`) }) });
      await expect(card).toHaveCount(1);
      await expect(card).toContainText('다음 합성 봉 종가에 체결한다고 가정합니다.');
    }

    // 2. 문맥별 입력 항목 설명이 신규 7종 전환마다 동적 갱신 확인
    const ruleSelect = page.getByRole('combobox', { name: '전략 규칙', exact: true });
    const helpDetails = page.locator('details.rule-field-help');
    await helpDetails.locator('summary').click();

    const expectedContext: [string, string, string][] = [
      ['macd_momentum', 'MACD 히스토그램', '단기 12봉 / 장기 26봉 / 시그널 9봉 / 제로선 위 필터 꺼짐'],
      ['adx_dmi_trend', 'ADX·DMI 추세', 'DI 기간 14봉 / ADX 기준 25 이상'],
      ['bollinger_squeeze', '볼린저 스퀴즈', '밴드 20봉 / 표준편차 2배 / 수축 비교 60봉 / 하위 25% 이하'],
      ['ttm_squeeze', 'TTM 스퀴즈', '기간 20봉 / 볼린저 2배 / 켈트너 1.5배'],
      ['bollinger_percent_b', '볼린저 %B 반등', '볼린저 20봉 / 표준편차 2배 / RSI 14봉 / RSI 35 이하 / 청산 %B 0.55 이상'],
      ['low_volume_pullback', '거래량 고갈 눌림목', '눌림 3봉 / 최대 거래량 0.65배 이하 / 단기 추세 20봉 / 장기 추세 60봉'],
      ['disparity_reversion', '이격도 복원', '이동평균 20봉 / 매수 93% 이하 / 매도 99.5% 이상 / 손절 5% 이하'],
    ];

    for (const [kind, title, presetSnippet] of expectedContext) {
      await ruleSelect.selectOption(kind);
      await expect(helpDetails.locator('summary')).toHaveText(`현재 선택한 규칙(${title}) 입력 항목 설명 보기`);
      await expect(helpDetails).toContainText(presetSnippet);
    }

    // 3. 모바일 390px에서 10종 선택기·문맥 가이드·도움말 사전 열림 상태로 가로 넘침 없음 확인
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(390);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
  }
});

test('백테스트 데이터 출처(DEMO ↔ 저장 일봉) 전환 시 편집 중인 규칙·파라미터·비용이 보존되고 비용 오류 시 초점이 이동한다', async ({ page }) => {
  const fixture = v2DailyFixture('005930');
  await page.route('**/api/state', route => route.fulfill({ json: snapshot() }));
  await page.route('**/api/data/daily', route => route.fulfill({ json: { runs: [fixture.run] } }));
  await page.route('**/api/backtest/experiments', route => route.fulfill({ json: { experiments: [] } }));
  const posts: string[] = [];
  page.on('request', req => {
    if (req.method() === 'POST') posts.push(new URL(req.url()).pathname);
  });

  // Major 1: 저장 일봉에서 MACD 규칙·파라미터·비용 편집 → DEMO 전환 → 저장 일봉 복귀 시 보존
  await page.goto('/backtest');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true })).toBeEnabled();

  await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('macd_momentum');
  await page.getByLabel('단기 EMA (봉)').fill('11');
  await page.getByLabel('장기 EMA (봉)').fill('28');
  await page.getByLabel('MACD > 0 (제로선 위에서만 매수)').check();
  await page.getByLabel('초기 자금 (원)').fill('25000000');

  const sourceSelect = page.getByLabel('데이터 출처');
  await sourceSelect.selectOption('demo');
  await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('macd_momentum');
  await expect(page.getByLabel('단기 EMA (봉)')).toHaveValue('11');
  await expect(page.getByLabel('장기 EMA (봉)')).toHaveValue('28');
  await expect(page.getByLabel('MACD > 0 (제로선 위에서만 매수)')).toBeChecked();
  await expect(page.getByLabel('초기 자금 (원)')).toHaveValue('25000000');

  // Minor 2 (DEMO): 비용 범위 오류 시 POST 차단 및 해당 입력 포커스 이동
  const demoRun = page.getByRole('button', { name: '백테스트 실행', exact: true });
  await page.getByLabel('초기 자금 (원)').fill('1');
  await demoRun.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('초기 자금은 100,000원 이상');
  await expect(page.getByLabel('초기 자금 (원)')).toBeFocused();

  await page.getByLabel('초기 자금 (원)').fill('25000000');
  await page.getByLabel('수수료 (bp, 1bp = 0.01%)').fill('150');
  await demoRun.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('수수료는 0-100bp 범위');
  await expect(page.getByLabel('수수료 (bp, 1bp = 0.01%)')).toBeFocused();

  await page.getByLabel('수수료 (bp, 1bp = 0.01%)').fill('1.5');
  await page.getByLabel('슬리피지 (bp)').fill('-1');
  await demoRun.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('슬리피지는 0-100bp 범위');
  await expect(page.getByLabel('슬리피지 (bp)')).toBeFocused();
  await page.getByLabel('슬리피지 (bp)').fill('5');

  // DEMO에서 ADX로 변경한 뒤 다시 저장 일봉으로 전환해도 유지 확인
  await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('adx_dmi_trend');
  await page.getByLabel('DI 기간 (봉)').fill('18');
  await page.getByLabel('ADX 기준').fill('32');

  await sourceSelect.selectOption('stored');
  await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('adx_dmi_trend');
  await expect(page.getByLabel('DI 기간 (봉)')).toHaveValue('18');
  await expect(page.getByLabel('ADX 기준')).toHaveValue('32');
  await expect(page.getByLabel('초기 자금 (원)')).toHaveValue('25000000');

  // Minor 2 (저장 일봉): 초기 자금 범위 오류 시 POST 차단 및 포커스 이동
  await page.getByLabel('초기 자금 (원)').fill('1');
  await page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('초기 자금은 100,000원 이상');
  await expect(page.getByLabel('초기 자금 (원)')).toBeFocused();

  expect(posts).toEqual([]);
});

test('KIS 모의 확정 일봉 다중 규칙 전략은 /settings/trading/strategy 1→2→3단계·초안 저장·재열기·요약 배너를 정상 통과하고 레거시 SMA 변질 복사를 차단한다', async ({ page }) => {
  const confirmedDailyNotice =
    '고정 시점의 검증 완료 일봉을 전용 원장에 복사하여 세션 직전 개장일 봉과 일치할 때 당일 1회 집행하며, 고정 이후 추가 수집한 일봉은 기존 전용 원장에 자동 반영되지 않습니다.';
  const state = snapshot();
  state.strategies = [
    {
      id: 'kis-macd-chandelier',
      name: 'KIS MACD 샹들리에',
      code: '005930',
      fast: 5,
      slow: 20,
      qty: 2,
      active: false,
      lastSignal: 'hold',
      lastTick: -1,
      environment: 'kis-paper',
      revision: 1,
      rule: { kind: 'macd_momentum', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, requireZeroLineAbove: false },
      overlay: { chandelier: { atrPeriod: 14, atrMultiplier: 3 } },
    },
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
  ];
  let savedPlan: import('../../shared/trading-plan').PlanRecord | undefined;
  let activeContract: import('../../shared/trading-plan').TradingTerms | null = null;
  const posts: string[] = [];

  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/trading-settings', route =>
    route.fulfill({
      json: {
        active: activeContract,
        canFix: !activeContract,
        plans: activeContract ? {} : savedPlan ? { strategy: savedPlan } : {},
      },
    }),
  );
  await page.route('**/api/trading-settings/draft', async route => {
    posts.push('/api/trading-settings/draft');
    const body = route.request().postDataJSON() as { terms: import('../../shared/trading-plan').TradingTerms };
    const strategy = state.strategies.find(
      s => body.terms.kind === 'strategy' && s.id === body.terms.strategyId,
    )!;
    savedPlan = {
      draft: {
        id: '11111111-2222-4333-8444-555555555555',
        runId: 'run-macd-1',
        fixed: false,
        symbol: strategy.code,
        fast: strategy.fast,
        slow: strategy.slow,
        qty: strategy.qty,
        rule: strategy.rule,
        overlay: strategy.overlay,
        limits: planLimits(state),
        terms: body.terms,
      },
    };
    await route.fulfill({ json: { plan: savedPlan } });
  });

  // 1단계: 실제 규칙·파라미터 요약·확정 일봉 안내·5/20 교차 오표시 없음·레거시 복사 차단·한도·조건으로 활성
  await page.goto('/settings/trading/strategy/1?strategy=kis-macd-chandelier');
  await waitWorkbenchReady(page);
  await expect(page.getByLabel('저장 KIS 전략')).toHaveValue('kis-macd-chandelier');
  await expect(page.getByRole('main')).toContainText('MACD 히스토그램 (12/26/9) · 샹들리에 ATR(14)×3');
  await expect(page.getByRole('main')).toContainText(confirmedDailyNotice);
  await expect(page.getByRole('main')).not.toContainText('5/20 교차');
  await expect(page.getByRole('main')).not.toContainText('계약 대상이 아닙니다');
  await expect(page.getByRole('button', { name: '종목·수량·교차 주기로 새 전략 만들기' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '한도·조건으로', exact: true })).toBeEnabled();

  await page.getByLabel('시작 (KST)').fill('2099-01-05T09:00');
  await page.getByLabel('종료 (KST)').fill('2099-01-05T11:00');
  await page.getByRole('button', { name: '한도·조건으로', exact: true }).click();

  // 2단계: 실제 규칙·파라미터 요약 및 초안 저장 진행
  await expect(page).toHaveURL(/\/settings\/trading\/strategy\/2/);
  await expect(page.getByRole('main')).toContainText('MACD 히스토그램 (12/26/9) · 샹들리에 ATR(14)×3');
  await expect(page.getByRole('button', { name: '초안 저장 및 검토', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '초안 저장 및 검토', exact: true }).click();

  // 3단계: 저장 대상 실제 규칙·파라미터 요약·검토 표 신호 규칙 행·5/20 오표시 없음·확정 일봉 안내·재열기 유지
  await expect(page).toHaveURL(/\/settings\/trading\/strategy\/3/);
  await expect(page.getByRole('main')).toContainText(
    '저장 대상 005930 · MACD 히스토그램 (12/26/9) · 샹들리에 ATR(14)×3 · 2주',
  );
  await expect(page.getByRole('row', { name: /신호 규칙/ })).toContainText(
    'MACD 히스토그램 (12/26/9) · 샹들리에 ATR(14)×3',
  );
  await expect(page.getByRole('main')).toContainText(confirmedDailyNotice);
  await expect(page.getByRole('main')).not.toContainText('5/20');
  await expect(page.getByRole('button', { name: '다음 실행 고정', exact: true })).toBeEnabled();
  expect(posts).toEqual(['/api/trading-settings/draft']);

  // 재열기(reload) 후에도 3단계 요약·확정 일봉 안내가 동일하게 유지됨
  await page.reload();
  await waitWorkbenchReady(page);
  await expect(page.getByRole('main')).toContainText(
    '저장 대상 005930 · MACD 히스토그램 (12/26/9) · 샹들리에 ATR(14)×3 · 2주',
  );
  await expect(page.getByRole('row', { name: /신호 규칙/ })).toContainText(
    'MACD 히스토그램 (12/26/9) · 샹들리에 ATR(14)×3',
  );
  await expect(page.getByRole('main')).toContainText(confirmedDailyNotice);
  await expect(page.getByRole('main')).not.toContainText('5/20');

  // 상단 저장 계약 목차 배너 및 활성 계약(읽기 전용)에서도 실제 규칙·파라미터 요약 표시
  await page.goto('/settings/trading');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('link', { name: /다음 전략 계약/ })).toContainText(
    'MACD 히스토그램 (12/26/9) · 샹들리에 ATR(14)×3',
  );

  activeContract = savedPlan!.draft.terms;
  await page.reload();
  await waitWorkbenchReady(page);
  await expect(page.getByText('전용 실행 원장 · 읽기 전용')).toBeVisible();
  await expect(page.getByRole('main')).toContainText('MACD 히스토그램 (12/26/9) · 샹들리에 ATR(14)×3');
  await expect(page.getByRole('main')).toContainText(confirmedDailyNotice);
  await expect(page.getByRole('main')).not.toContainText('5/20');
  activeContract = null;

  // Major 1 & Major 2 회귀:
  // (a) rule·overlay가 없는 레거시 previousPlan(fast=2, slow=5)은 같은 strategyId의 현재 전략으로 왜곡되지 않고 '2/5 교차' 보존
  savedPlan = {
    ...savedPlan!,
    previous: {
      id: 'legacy-prev-sma',
      runId: 'run-legacy-prev',
      fixed: true,
      symbol: '005930',
      fast: 2,
      slow: 5,
      qty: 1,
      limits: planLimits(state),
      terms: {
        kind: 'strategy',
        strategyId: 'kis-macd-chandelier',
        revision: 1,
        startsAt: '2099-01-05T00:00:00.000Z',
        endsAt: '2099-01-05T02:00:00.000Z',
        maxOrderAmount: 100000,
        maxAttempts: 1,
        maxTotalAmount: 100000,
        sellPolicy: 'deny',
      },
    },
  };
  await page.goto('/settings/trading/strategy/3?strategy=kis-macd-chandelier');
  await waitWorkbenchReady(page);
  const legacyCompareRow = page.getByRole('row', { name: /신호 규칙/ });
  await expect(legacyCompareRow.locator('td').nth(0)).toHaveText('2/5 교차');
  await expect(legacyCompareRow.locator('td').nth(1)).toHaveText('MACD 히스토그램 (12/26/9) · 샹들리에 ATR(14)×3');

  // (b) 동일 종류(MACD)지만 파라미터가 다른 이전 고정본(8/26/9 · MACD > 0) vs 다음 설정(12/26/9)이 비교표에서 구분 표시됨
  savedPlan = {
    ...savedPlan!,
    previous: {
      ...savedPlan!.previous!,
      fast: 5,
      slow: 20,
      rule: { kind: 'macd_momentum', fastPeriod: 8, slowPeriod: 26, signalPeriod: 9, requireZeroLineAbove: true },
      overlay: { chandelier: { atrPeriod: 14, atrMultiplier: 3 } },
    },
  };
  await page.reload();
  await waitWorkbenchReady(page);
  const paramCompareRow = page.getByRole('row', { name: /신호 규칙/ });
  await expect(paramCompareRow.locator('td').nth(0)).toHaveText(
    'MACD 히스토그램 (8/26/9 · MACD > 0) · 샹들리에 ATR(14)×3',
  );
  await expect(paramCompareRow.locator('td').nth(1)).toHaveText('MACD 히스토그램 (12/26/9) · 샹들리에 ATR(14)×3');

  // (c) rule·overlay 없는 레거시 draft 스냅샷(fast=2, slow=5)은 목차 요약(planConditions)에서도 '2/5 교차'로 보존됨
  savedPlan = { draft: savedPlan!.previous! && { ...savedPlan!.draft, fast: 2, slow: 5, rule: undefined, overlay: undefined } };
  await page.goto('/settings/trading');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('link', { name: /다음 전략 계약/ })).toContainText('2/5 교차');
  await expect(page.getByRole('link', { name: /다음 전략 계약/ })).not.toContainText('MACD 히스토그램');

  // 1단계에서 '전략 스튜디오에서 이 설정으로 새 전략 만들기' 클릭 시 선택 다중 규칙·오버레이 초안이 채워져 열림
  await page.goto('/settings/trading/strategy/1?strategy=kis-macd-chandelier');
  await waitWorkbenchReady(page);
  await page.getByRole('link', { name: '전략 스튜디오에서 이 설정으로 새 전략 만들기' }).first().click();
  await expect(page).toHaveURL(/\/strategies\?environment=kis-paper#strategy-editor$/);
  await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('macd_momentum');
  await expect(page.getByLabel('단기 EMA (봉)')).toHaveValue('12');
  await expect(page.getByLabel('장기 EMA (봉)')).toHaveValue('26');
  await expect(page.getByLabel('시그널 EMA (봉)')).toHaveValue('9');
  await expect(page.getByLabel('샹들리에 ATR 청산 오버레이 사용')).toBeChecked();
  await expect(page.getByLabel('ATR 기간 (봉)')).toHaveValue('14');
  await expect(page.getByLabel('ATR 배수')).toHaveValue('3');

  // 기본 SMA 전략으로 전환하면 5/20 교차 요약·빠른 생성 버튼·한도·조건으로 버튼이 정상 복원됨
  await page.goto('/settings/trading/strategy/1?strategy=kis-macd-chandelier');
  await waitWorkbenchReady(page);
  await page.getByLabel('저장 KIS 전략').selectOption('kis-basic-sma');
  await expect(page.getByRole('main')).toContainText('5/20 교차');
  await expect(page.getByRole('button', { name: '종목·수량·교차 주기로 새 전략 만들기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '한도·조건으로', exact: true })).toBeEnabled();
});

test('활성 프리셋 재클릭 시 evidence가 유지되고 샹들리에·거래량 필터 활성 시 DEMO 배지가 동적으로 경고 전환된다', async ({ page }) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');
  const fixture = v2DailyFixture('005930');
  store.saveDaily(fixture.run, fixture.bars);

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4337]);
  await new Promise<void>(resolve => server.listen(4337, '127.0.0.1', resolve));

  await page.route('**/api/**', async route => {
    const response = await route.fetch({ url: route.request().url().replace(':4314', ':4337') });
    await route.fulfill({ response });
  });

  try {
    // 1. MACD 기본 프리셋 일봉 백테스트 → '이 설정으로 전략 만들기'로 evidence 연결
    await page.goto('/backtest');
    await waitWorkbenchReady(page);
    await expect(page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true })).toBeEnabled();
    await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('macd_momentum');
    await page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true }).click();
    const result = page.getByRole('region', { name: '저장 일봉 실험 결과' });
    await expect(result).toBeVisible();
    await result.getByText('재현 입력·출처 확인', { exact: true }).click();
    const hash = (await result.getByTestId('experiment-hash').textContent())?.trim() ?? '';

    await result.getByRole('button', { name: '이 설정으로 전략 만들기', exact: true }).click();
    await expect(page).toHaveURL(/\/strategies#strategy-editor$/);
    const evidenceBanner = page.locator('.studio-evidence');
    await expect(evidenceBanner).toBeVisible();
    await expect(evidenceBanner).toContainText(hash.slice(0, 8));

    // Minor 1: 이미 활성화된 '기본' 프리셋 버튼 재클릭 시 evidence 배지 유지
    const basicBtn = page.getByRole('button', { name: '기본', exact: true });
    await expect(basicBtn).toHaveAttribute('aria-pressed', 'true');
    await basicBtn.click();
    await expect(evidenceBanner).toBeVisible();
    await expect(evidenceBanner).toContainText(hash.slice(0, 8));

    // Minor 3: MACD(DEMO 지원)에서 샹들리에 켜면 DEMO 배지가 '현재 설정 제한 (저장 일봉 필요)' 경고 톤으로 전환 + evidence 해제
    const envBadges = page.getByLabel('환경별 사용 가능 여부');
    await expect(envBadges).toContainText('DEMO · 지원');
    await page.getByLabel('샹들리에 ATR 청산 오버레이 사용').check();
    await expect(envBadges).toContainText('DEMO · 현재 설정 제한 (저장 일봉 필요)');
    await expect(envBadges.locator('.badge.warning')).toContainText('DEMO · 현재 설정 제한 (저장 일봉 필요)');
    await expect(evidenceBanner).toHaveCount(0);

    // 샹들리에 해제 시 원래 'DEMO · 지원' 복귀
    await page.getByLabel('샹들리에 ATR 청산 오버레이 사용').uncheck();
    await expect(envBadges).toContainText('DEMO · 지원');

    // Minor 3: ma_crossover 거래량 필터 입력 시에도 DEMO 배지가 경고 톤으로 전환
    await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('ma_crossover');
    await expect(envBadges).toContainText('DEMO · 거래량 필터 끔');
    await page.getByLabel('최소 상대 거래량 (배, 선택)').fill('1.5');
    await expect(envBadges).toContainText('DEMO · 현재 설정 제한 (저장 일봉 필요)');
    await page.getByLabel('최소 상대 거래량 (배, 선택)').fill('');
    await expect(envBadges).toContainText('DEMO · 거래량 필터 끔');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('다른 수집 기록의 저장 실험을 불러와 폼을 수정한 뒤 브라우저 뒤로→앞으로 이동해도 stale 결과와 전략 만들기 버튼이 재결합되지 않는다', async ({ page }) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');
  const fixtureA = v2DailyFixture('005930');
  const fixtureB = v2DailyFixture('00A123');
  store.saveDaily(fixtureA.run, fixtureA.bars);
  store.saveDaily(fixtureB.run, fixtureB.bars);

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4338]);
  await new Promise<void>(resolve => server.listen(4338, '127.0.0.1', resolve));

  await page.route('**/api/**', async route => {
    const response = await route.fetch({ url: route.request().url().replace(':4314', ':4338') });
    await route.fulfill({ response });
  });

  try {
    // 1. 수집 기록 A(005930)에서 MACD 기본 실험 저장
    await page.goto('/backtest');
    await waitWorkbenchReady(page);
    await expect(page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true })).toBeEnabled();
    await page.getByLabel('일봉 수집 기록').selectOption(fixtureA.run.id);
    await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('macd_momentum');
    await page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true }).click();
    const result = page.getByRole('region', { name: '저장 일봉 실험 결과' });
    await expect(result).toBeVisible();

    // 2. 수집 기록 B(00A123)로 이동한 뒤 저장 실험 목록에서 A 실험을 불러옴(cross-run transfer.current 경로)
    await page.getByLabel('일봉 수집 기록').selectOption(fixtureB.run.id);
    await expect(page).toHaveURL(new RegExp(`run=${fixtureB.run.id}`));
    const savedSelect = page.getByLabel('저장 실험');
    const expOptionValue = await savedSelect.locator('option', { hasText: '005930' }).getAttribute('value');
    expect(expOptionValue).toBeTruthy();
    await savedSelect.selectOption(expOptionValue!);
    await page.getByRole('button', { name: '저장 실험 불러오기', exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`run=${fixtureA.run.id}`));
    await expect(result).toBeVisible();
    await expect(result.getByRole('button', { name: '이 설정으로 전략 만들기', exact: true })).toBeVisible();

    // 3. 파라미터를 수정해 결과를 해제한 뒤 브라우저 뒤로(B) → 앞으로(A) 이동
    await page.getByLabel('단기 EMA (봉)').fill('8');
    await expect(result).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`run=${fixtureB.run.id}`));
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`run=${fixtureA.run.id}`));

    // 4. 수정된 파라미터(8)가 유지되고 이전 저장 실험 결과와 '이 설정으로 전략 만들기'가 재결합되지 않음을 확인
    await expect(page.getByLabel('단기 EMA (봉)')).toHaveValue('8');
    await expect(result).toHaveCount(0);
    await expect(page.getByRole('button', { name: '이 설정으로 전략 만들기', exact: true })).toHaveCount(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('3A-2: 윌리엄스 변동성 돌파·변동성 패리티 프리셋/입력 검증·v2 저장 일봉 백테스트(SMA+패리티 포함)·왕복·카드 태그 검증', async ({ page }) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');
  const fixtureA = v2DailyFixture('005930');
  const fixtureB = v2DailyFixture('00A123');
  store.saveDaily(fixtureA.run, fixtureA.bars);
  store.saveDaily(fixtureB.run, fixtureB.bars);

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4339]);
  await new Promise<void>(resolve => server.listen(4339, '127.0.0.1', resolve));

  const dailyPayloads: Record<string, unknown>[] = [];
  await page.route('**/api/**', async route => {
    const req = route.request();
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/backtest/daily') {
      dailyPayloads.push(req.postDataJSON() as Record<string, unknown>);
    }
    const response = await route.fetch({ url: req.url().replace(':4314', ':4339') });
    await route.fulfill({ response });
  });

  try {
    // 1. 전략 스튜디오(KIS 모의): volatility_breakout 프리셋 & 입력 검증(범위/정수/badInput) + volatilityParity 검증
    await page.goto('/strategies?environment=kis-paper');
    await waitWorkbenchReady(page);

    const ruleSelect = page.getByRole('combobox', { name: '전략 규칙', exact: true });
    await ruleSelect.selectOption('volatility_breakout');
    await expect(page.getByLabel('돌파 계수 k')).toHaveValue('0.5');
    await expect(page.getByLabel('적응형 노이즈 k 사용 (직전 노이즈 평균 적용)')).not.toBeChecked();
    await expect(page.getByLabel('노이즈 평균 기간 (봉)')).toHaveValue('20');
    await expect(page.getByLabel('상승 추세 SMA 기간 (봉)')).toHaveValue('20');
    await expect(page.getByLabel('보유 거래일 수 (일)')).toHaveValue('1');
    await expect(page.getByRole('button', { name: '기본', exact: true })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: '보수적', exact: true }).click();
    await expect(page.getByLabel('돌파 계수 k')).toHaveValue('0.6');
    await expect(page.getByLabel('적응형 노이즈 k 사용 (직전 노이즈 평균 적용)')).toBeChecked();
    await expect(page.getByLabel('노이즈 평균 기간 (봉)')).toHaveValue('20');
    await expect(page.getByLabel('상승 추세 SMA 기간 (봉)')).toHaveValue('60');
    await expect(page.getByLabel('보유 거래일 수 (일)')).toHaveValue('1');

    await page.getByRole('button', { name: '공격적', exact: true }).click();
    await expect(page.getByLabel('돌파 계수 k')).toHaveValue('0.4');
    await expect(page.getByLabel('적응형 노이즈 k 사용 (직전 노이즈 평균 적용)')).not.toBeChecked();
    await expect(page.getByLabel('노이즈 평균 기간 (봉)')).toHaveValue('10');
    await expect(page.getByLabel('상승 추세 SMA 기간 (봉)')).toHaveValue('5');
    await expect(page.getByLabel('보유 거래일 수 (일)')).toHaveValue('2');

    // 돌파 계수 범위 밖·정수 필드 소수·badInput 검증
    await page.getByLabel('돌파 계수 k').fill('1.2');
    await page.getByRole('button', { name: '이 설정으로 백테스트', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('돌파 계수 k는 0.1-1 범위');
    await expect(page.getByLabel('돌파 계수 k')).toBeFocused();

    await page.getByLabel('돌파 계수 k').fill('0.5');
    await page.getByLabel('보유 거래일 수 (일)').fill('1.5');
    await page.getByRole('button', { name: '이 설정으로 백테스트', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('보유 거래일 수는 1-10 사이의 정수로 입력하세요.');
    await expect(page.getByLabel('보유 거래일 수 (일)')).toBeFocused();

    const vbKInput = page.getByLabel('돌파 계수 k');
    await vbKInput.fill('');
    await vbKInput.focus();
    await page.keyboard.type('1e');
    await page.getByRole('button', { name: '이 설정으로 백테스트', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('올바른 숫자를 입력하세요.');
    await expect(vbKInput).toBeFocused();

    // 기본 프리셋 복원 + 변동성 패리티 활성화 후 범위·정수·badInput 검증
    await page.getByRole('button', { name: '기본', exact: true }).click();
    const parityCheckbox = page.getByLabel('20 변동성 패리티 · 목표 변동성 수량 조절 오버레이 (선택)');
    await parityCheckbox.check();
    await expect(page.getByLabel('변동성 관측 기간 (봉)')).toHaveValue('20');
    await expect(page.getByLabel('목표 연환산 변동성 (%)')).toHaveValue('20');
    await expect(page.getByLabel('최대 배정 비중 (%)')).toHaveValue('100');

    await page.getByLabel('변동성 관측 기간 (봉)').fill('15.5');
    await page.getByRole('button', { name: '이 설정으로 백테스트', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('변동성 관측 기간은 10-60 사이의 정수로 입력하세요.');
    await expect(page.getByLabel('변동성 관측 기간 (봉)')).toBeFocused();

    await page.getByLabel('변동성 관측 기간 (봉)').fill('20');
    await page.getByLabel('목표 연환산 변동성 (%)').fill('3');
    await page.getByRole('button', { name: '이 설정으로 백테스트', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('목표 연환산 변동성은 5-60% 범위');
    await expect(page.getByLabel('목표 연환산 변동성 (%)')).toBeFocused();

    await page.getByLabel('목표 연환산 변동성 (%)').fill('20');
    await page.getByLabel('최대 배정 비중 (%)').fill('120');
    await page.getByRole('button', { name: '이 설정으로 백테스트', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('최대 배정 비중은 10-100% 범위');
    await expect(page.getByLabel('최대 배정 비중 (%)')).toBeFocused();

    await page.getByLabel('최대 배정 비중 (%)').fill('50');
    await page.getByLabel('대상 종목').selectOption('005930');
    await page.getByRole('button', { name: '이 설정으로 백테스트', exact: true }).click();

    // 2. 저장 일봉 백테스트로 초안 전달 및 실행 (volatility_breakout + volatilityParity)
    await expect(page).toHaveURL(/\/backtest$/);
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('volatility_breakout');
    await expect(page.getByLabel('20 변동성 패리티 · 목표 변동성 수량 조절 오버레이 (선택)')).toBeChecked();
    await expect(page.getByLabel('최대 배정 비중 (%)')).toHaveValue('50');

    const runBtn = page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true });
    await expect(runBtn).toBeEnabled();
    await runBtn.click();

    const result = page.getByRole('region', { name: '저장 일봉 실험 결과' });
    await expect(result).toBeVisible();
    await expect(result).toContainText('윌리엄스 변동성 돌파');
    await expect(result).toContainText('변동성 패리티(20일 · 목표 20% · 최대 50%)');
    await expect(result).toContainText('전일 변동폭 기준 당일 목표가 상향 돌파');
    await expect(result).toContainText('목표 보유 기간 경과 시가 청산');
    await expect(result.getByLabel('단순 보유 벤치마크 비교')).toBeVisible();

    expect(dailyPayloads).toHaveLength(1);
    expect(dailyPayloads[0]).not.toHaveProperty('fast');
    expect(dailyPayloads[0]).not.toHaveProperty('slow');
    expect((dailyPayloads[0].rule as { kind: string }).kind).toBe('volatility_breakout');
    expect(dailyPayloads[0].overlay).toEqual({
      volatilityParity: { volLookback: 20, targetAnnualVolPct: 20, maxAllocationPct: 50 },
    });

    await result.getByText('재현 입력·출처 확인', { exact: true }).click();
    const vbHash = (await result.getByTestId('experiment-hash').textContent())?.trim() ?? '';
    expect(vbHash).toMatch(/^[a-f0-9]{64}$/);
    await result.getByRole('button', { name: '고정 입력으로 재현 검증', exact: true }).click();
    await expect(result).toContainText('재현 일치');

    // 3. 기본 SMA 5/20 + volatilityParity 조합도 v1이 아닌 v2 경로로 전송되는지 검증 (Reviewer Minor 1)
    await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('ma_crossover');
    await expect(page.getByLabel('20 변동성 패리티 · 목표 변동성 수량 조절 오버레이 (선택)')).toBeChecked();
    await runBtn.click();
    await expect(result).toBeVisible();
    await expect(result.getByLabel('단순 보유 벤치마크 비교')).toBeVisible();

    expect(dailyPayloads).toHaveLength(2);
    expect(dailyPayloads[1]).not.toHaveProperty('fast');
    expect(dailyPayloads[1]).not.toHaveProperty('slow');
    expect(dailyPayloads[1].rule).toEqual({ kind: 'ma_crossover', maType: 'sma', fast: 5, slow: 20 });
    expect(dailyPayloads[1].overlay).toEqual({
      volatilityParity: { volLookback: 20, targetAnnualVolPct: 20, maxAllocationPct: 50 },
    });

    // 4. 출처 전환(stored ↔ demo) 시 volatility_breakout + volatilityParity 입력 보존 확인
    await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('volatility_breakout');
    await page.getByLabel('돌파 계수 k').fill('0.7');
    await page.getByLabel('목표 연환산 변동성 (%)').fill('15');
    const sourceSelect = page.getByLabel('데이터 출처');
    await sourceSelect.selectOption('demo');
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('volatility_breakout');
    await expect(page.getByLabel('돌파 계수 k')).toHaveValue('0.7');
    await expect(page.getByLabel('20 변동성 패리티 · 목표 변동성 수량 조절 오버레이 (선택)')).toBeChecked();
    await expect(page.getByLabel('목표 연환산 변동성 (%)')).toHaveValue('15');
    await sourceSelect.selectOption('stored');
    await expect(page.getByLabel('돌파 계수 k')).toHaveValue('0.7');
    await expect(page.getByLabel('목표 연환산 변동성 (%)')).toHaveValue('15');

    // 5. 다른 수집 기록에서 저장 실험 불러온 뒤 volatilityParity 필드 수정 후 뒤로→앞으로 이동 시 stale 결과 미재결합 확인
    await page.getByLabel('일봉 수집 기록').selectOption(fixtureB.run.id);
    await expect(page).toHaveURL(new RegExp(`run=${fixtureB.run.id}`));
    const savedSelect = page.getByLabel('저장 실험');
    const vbOptionValue = await savedSelect.locator('option', { hasText: '윌리엄스 변동성 돌파' }).getAttribute('value');
    expect(vbOptionValue).toBeTruthy();
    await savedSelect.selectOption(vbOptionValue!);
    await page.getByRole('button', { name: '저장 실험 불러오기', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`run=${fixtureA.run.id}`));
    await expect(result).toBeVisible();
    await expect(result.getByTestId('experiment-hash')).toHaveText(vbHash);

    await page.getByLabel('최대 배정 비중 (%)').fill('80');
    await expect(result).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`run=${fixtureB.run.id}`));
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`run=${fixtureA.run.id}`));
    await expect(page.getByLabel('최대 배정 비중 (%)')).toHaveValue('80');
    await expect(result).toHaveCount(0);

    // 6. 다시 저장 실험 불러와 '이 설정으로 전략 만들기' → KIS 모의 저장 → evidence 배지·카드 태그·시작 비활성화 확인
    await page.getByLabel('저장 실험').selectOption(vbOptionValue!);
    await page.getByRole('button', { name: '저장 실험 불러오기', exact: true }).click();
    await expect(result).toBeVisible();
    await result.getByRole('button', { name: '이 설정으로 전략 만들기', exact: true }).click();
    await expect(page).toHaveURL(/\/strategies#strategy-editor$/);
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('volatility_breakout');
    await expect(page.getByLabel('20 변동성 패리티 · 목표 변동성 수량 조절 오버레이 (선택)')).toBeChecked();
    await expect(page.getByText(vbHash.slice(0, 8))).toBeVisible();

    await page.getByLabel('전략 환경').selectOption('kis-paper');
    await expect(page.getByText(vbHash.slice(0, 8))).toBeVisible();
    await page.getByLabel('전략 이름').fill('검증된 변동성 돌파 패리티');
    await page.getByRole('button', { name: '전략 저장', exact: true }).click();

    const savedCard = page.locator('.studio-card').filter({
      has: page.getByRole('heading', { name: '검증된 변동성 돌파 패리티', exact: true }),
    });
    await expect(savedCard).toBeVisible();
    await expect(savedCard).toContainText(`검증 실험 연결 · ${vbHash.slice(0, 8)}`);
    await expect(savedCard).toContainText('윌리엄스 변동성 돌파');
    await expect(savedCard).toContainText('k=0.5');
    await expect(savedCard).toContainText('추세 SMA 20봉');
    await expect(savedCard).toContainText('보유 1일');
    await expect(savedCard).toContainText('변동성 패리티 20일 · 목표 20% · 최대 50%');
    await expect(savedCard).toContainText('전략 시작 차단');
    await expect(savedCard.getByRole('button', { name: '전략 시작', exact: true })).toBeDisabled();
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('3A-2: volatility_breakout 및 SMA+volatilityParity는 DEMO 저장·백테스트를 POST 0건으로 차단하고 동적 경고 배지를 표시한다', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', req => {
    if (req.method() === 'POST') posts.push(new URL(req.url()).pathname);
  });

  // 1. /strategies (DEMO)
  await page.goto('/strategies');
  await waitWorkbenchReady(page);
  const envBadges = page.getByLabel('환경별 사용 가능 여부');
  const ruleSelect = page.getByRole('combobox', { name: '전략 규칙', exact: true });

  // ma_crossover 기본 SMA + volatilityParity 체크 → DEMO·KIS 동적 경고 배지 & 저장 차단
  await expect(envBadges).toContainText('DEMO · 거래량 필터 끔');
  const parityCheck = page.getByLabel('20 변동성 패리티 · 목표 변동성 수량 조절 오버레이 (선택)');
  await parityCheck.check();
  await expect(
    envBadges.locator('.badge.warning').filter({ hasText: 'DEMO · 현재 설정 제한 (저장 일봉 필요)' }),
  ).toBeVisible();
  await expect(
    envBadges.locator('.badge.warning').filter({ hasText: 'KIS 모의 · 시작 제한 (정지 저장만 가능)' }),
  ).toBeVisible();
  await page.getByLabel('전략 이름').fill('DEMO 패리티 차단');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('DEMO는 종가만 제공합니다');

  // 해제 시 복귀
  await parityCheck.uncheck();
  await expect(envBadges).toContainText('DEMO · 거래량 필터 끔');

  // volatility_breakout 선택 → DEMO 미지원·KIS 시작 제한 배지 & 저장 차단
  await ruleSelect.selectOption('volatility_breakout');
  await expect(envBadges).toContainText('DEMO · 미지원');
  await expect(
    envBadges.locator('.badge.warning').filter({ hasText: 'KIS 모의 · 시작 제한 (정지 저장만 가능)' }),
  ).toBeVisible();
  await page.getByLabel('전략 이름').fill('DEMO 돌파 차단');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('DEMO는 종가만 제공합니다');

  // 2. /backtest?source=demo
  await page.goto('/backtest?source=demo');
  await waitWorkbenchReady(page);
  const btRun = page.getByRole('button', { name: '백테스트 실행', exact: true });
  await expect(btRun).toBeEnabled();

  await page.getByLabel('20 변동성 패리티 · 목표 변동성 수량 조절 오버레이 (선택)').check();
  await expect(
    page
      .getByLabel('환경별 사용 가능 여부')
      .locator('.badge.warning')
      .filter({ hasText: 'DEMO · 현재 설정 제한 (저장 일봉 필요)' }),
  ).toBeVisible();
  await expect(
    page
      .getByLabel('환경별 사용 가능 여부')
      .locator('.badge.warning')
      .filter({ hasText: 'KIS 모의 · 시작 제한 (정지 저장만 가능)' }),
  ).toBeVisible();
  await btRun.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('DEMO는 종가만 제공합니다');

  await page.getByLabel('20 변동성 패리티 · 목표 변동성 수량 조절 오버레이 (선택)').uncheck();
  await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('volatility_breakout');
  await btRun.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('DEMO는 종가만 제공합니다');

  expect(posts).toEqual([]);
});

test('3B-2: TradingSettings는 미지원 3종(volatility_breakout, SMA+volatilityParity, 기본 무필터 SMA slow>100)을 1-3단계 전면 차단하고 실제 요약·스튜디오 초안을 전달한다', async ({ page }) => {
  const state = snapshot();
  state.strategies = [
    {
      id: 'kis-vb-only',
      name: 'KIS 변동성 돌파 단독',
      code: '005930',
      fast: 5,
      slow: 20,
      qty: 1,
      active: false,
      lastSignal: 'hold',
      lastTick: -1,
      environment: 'kis-paper',
      revision: 1,
      rule: {
        kind: 'volatility_breakout',
        k: 0.5,
        useAdaptiveNoise: false,
        noiseLookback: 20,
        trendMaPeriod: 20,
        holdDays: 1,
      },
    },
    {
      id: 'kis-vb-parity',
      name: 'KIS 변동성 돌파 패리티',
      code: '005930',
      fast: 5,
      slow: 20,
      qty: 3,
      active: false,
      lastSignal: 'hold',
      lastTick: -1,
      environment: 'kis-paper',
      revision: 1,
      rule: {
        kind: 'volatility_breakout',
        k: 0.6,
        useAdaptiveNoise: true,
        noiseLookback: 20,
        trendMaPeriod: 60,
        holdDays: 1,
      },
      overlay: { volatilityParity: { volLookback: 20, targetAnnualVolPct: 15, maxAllocationPct: 60 } },
    },
    {
      id: 'kis-sma-parity',
      name: 'KIS SMA 변동성 패리티',
      code: '005930',
      fast: 5,
      slow: 20,
      qty: 2,
      active: false,
      lastSignal: 'hold',
      lastTick: -1,
      environment: 'kis-paper',
      revision: 1,
      rule: { kind: 'ma_crossover', maType: 'sma', fast: 5, slow: 20 },
      overlay: { volatilityParity: { volLookback: 20, targetAnnualVolPct: 20, maxAllocationPct: 80 } },
    },
    {
      id: 'kis-sma-110',
      name: 'KIS 기본 SMA 5/110',
      code: '005930',
      fast: 5,
      slow: 110,
      qty: 1,
      active: false,
      lastSignal: 'hold',
      lastTick: -1,
      environment: 'kis-paper',
      revision: 1,
      rule: { kind: 'ma_crossover', maType: 'sma', fast: 5, slow: 110 },
    },
  ];
  const posts: string[] = [];
  page.on('request', req => {
    if (req.method() === 'POST') posts.push(new URL(req.url()).pathname);
  });

  let activeDraftStrategyId = 'kis-sma-parity';
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/trading-settings', route => {
    const target = state.strategies.find(s => s.id === activeDraftStrategyId)!;
    return route.fulfill({
      json: {
        active: null,
        canFix: true,
        plans: {
          strategy: {
            draft: {
              id: 'draft-blocked-strategy',
              runId: 'run-blocked-strategy',
              fixed: false,
              symbol: target.code,
              fast: target.fast,
              slow: target.slow,
              qty: target.qty,
              rule: target.rule,
              overlay: target.overlay,
              limits: {
                manualQty: 5,
                maxOrder: 1000000,
                maxPosition: 4000000,
                dailyLoss: 300000,
                halted: false,
              },
              terms: {
                kind: 'strategy',
                strategyId: target.id,
                revision: 1,
                startsAt: '2099-01-05T00:00:00.000Z',
                endsAt: '2099-01-05T02:00:00.000Z',
                maxOrderAmount: 100000,
                maxAttempts: 1,
                maxTotalAmount: 100000,
                sellPolicy: 'deny',
              },
            },
          },
        },
      },
    });
  });

  // 1. SMA + volatilityParity: 1-3단계 차단 및 실제 규칙·오버레이 요약 표시(5/20 교차 오표시 없음)
  await page.goto('/settings/trading/strategy/1?strategy=kis-sma-parity');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('main')).toContainText('이동평균 교차 (SMA 5/20) · 변동성 패리티(20일 · 목표 20% · 최대 80%)');
  await expect(page.getByRole('main')).toContainText('윌리엄스 변동성 돌파와 변동성 패리티 수량 조절은 저장 일봉 백테스트 전용입니다.');
  await expect(page.getByRole('main')).not.toContainText('5/20 교차');
  await expect(page.getByRole('button', { name: '한도·조건으로', exact: true })).toBeDisabled();

  await page.goto('/settings/trading/strategy/2?strategy=kis-sma-parity');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('main')).toContainText('이동평균 교차 (SMA 5/20) · 변동성 패리티(20일 · 목표 20% · 최대 80%)');
  await expect(page.getByRole('button', { name: '초안 저장 및 검토', exact: true })).toBeDisabled();

  await page.goto('/settings/trading/strategy/3?strategy=kis-sma-parity');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('main')).toContainText(
    '저장 대상 005930 · 이동평균 교차 (SMA 5/20) · 변동성 패리티(20일 · 목표 20% · 최대 80%) · 2주',
  );
  await expect(page.getByRole('button', { name: '다음 실행 고정', exact: true })).toBeDisabled();

  // 2. 무필터 기본 SMA slow > 100 (5/110): 1-3단계 전면 차단 및 차단 사유 확인
  activeDraftStrategyId = 'kis-sma-110';
  await page.goto('/settings/trading/strategy/1?strategy=kis-sma-110');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('main')).toContainText('이동평균 교차 (SMA 5/110)');
  await expect(page.getByRole('main')).toContainText('실시간 체결가 기본 SMA의 장기 기간은 100 이하여야 합니다.');
  await expect(page.getByRole('button', { name: '한도·조건으로', exact: true })).toBeDisabled();

  await page.goto('/settings/trading/strategy/2?strategy=kis-sma-110');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('main')).toContainText('실시간 체결가 기본 SMA의 장기 기간은 100 이하여야 합니다.');
  await expect(page.getByRole('button', { name: '초안 저장 및 검토', exact: true })).toBeDisabled();

  await page.goto('/settings/trading/strategy/3?strategy=kis-sma-110');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('main')).toContainText('저장 대상 005930 · 이동평균 교차 (SMA 5/110) · 1주');
  await expect(page.getByRole('button', { name: '다음 실행 고정', exact: true })).toBeDisabled();

  // 3. volatility_breakout 단독(패리티 미결합): 1-3단계 전면 차단(POST 0건) 및 실제 파라미터 요약 확인
  activeDraftStrategyId = 'kis-vb-only';
  await page.goto('/settings/trading/strategy/1?strategy=kis-vb-only');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('main')).toContainText('윌리엄스 변동성 돌파 (k=0.5 · 추세 SMA20 · 보유 1일)');
  await expect(page.getByRole('main')).toContainText(
    '윌리엄스 변동성 돌파와 변동성 패리티 수량 조절은 저장 일봉 백테스트 전용입니다.',
  );
  await expect(page.getByRole('main')).not.toContainText('5/20 교차');
  await expect(page.getByRole('button', { name: '한도·조건으로', exact: true })).toBeDisabled();

  await page.goto('/settings/trading/strategy/2?strategy=kis-vb-only');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('main')).toContainText('윌리엄스 변동성 돌파 (k=0.5 · 추세 SMA20 · 보유 1일)');
  await expect(page.getByRole('button', { name: '초안 저장 및 검토', exact: true })).toBeDisabled();

  await page.goto('/settings/trading/strategy/3?strategy=kis-vb-only');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('main')).toContainText(
    '저장 대상 005930 · 윌리엄스 변동성 돌파 (k=0.5 · 추세 SMA20 · 보유 1일) · 1주',
  );
  await expect(page.getByRole('button', { name: '다음 실행 고정', exact: true })).toBeDisabled();

  // 4. volatility_breakout + volatilityParity: 1단계 요약·차단 및 스튜디오 초안 전달 확인
  activeDraftStrategyId = 'kis-vb-parity';
  await page.goto('/settings/trading/strategy/1?strategy=kis-vb-parity');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('main')).toContainText(
    '윌리엄스 변동성 돌파 (적응형 노이즈 20봉 · 추세 SMA60 · 보유 1일) · 변동성 패리티(20일 · 목표 15% · 최대 60%)',
  );
  await expect(page.getByRole('main')).not.toContainText('5/20 교차');
  await expect(page.getByRole('button', { name: '한도·조건으로', exact: true })).toBeDisabled();

  await page.getByRole('link', { name: '전략 스튜디오에서 이 설정으로 새 전략 만들기' }).first().click();
  await expect(page).toHaveURL(/\/strategies\?environment=kis-paper#strategy-editor$/);
  await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('volatility_breakout');
  await expect(page.getByLabel('돌파 계수 k')).toHaveValue('0.6');
  await expect(page.getByLabel('적응형 노이즈 k 사용 (직전 노이즈 평균 적용)')).toBeChecked();
  await expect(page.getByLabel('상승 추세 SMA 기간 (봉)')).toHaveValue('60');
  await expect(page.getByLabel('20 변동성 패리티 · 목표 변동성 수량 조절 오버레이 (선택)')).toBeChecked();
  await expect(page.getByLabel('목표 연환산 변동성 (%)')).toHaveValue('15');
  await expect(page.getByLabel('최대 배정 비중 (%)')).toHaveValue('60');

  expect(posts).toEqual([]);
});

test('3A-2: 도움말 13카드 사전·volatility_breakout·volatilityParity 문맥 가이드 및 390px 모바일 무넘침 검증', async ({ page }) => {
  for (const route of ['/strategies', '/backtest']) {
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(route);
    await waitWorkbenchReady(page);

    // 상단 도움말 사전 18카드 및 volatility_breakout·volatilityParity 확인
    await page.getByRole('button', { name: '사용방법 도움말', exact: true }).click();
    const helpRegion = page.getByRole('region', { name: '전략 스튜디오 및 백테스트 사용방법 도움말' });
    await helpRegion.getByRole('tab', { name: '전략·입력 항목 사전', exact: true }).click();
    const dictPanel = helpRegion.locator('[role="tabpanel"]:not([hidden])');
    const cards = dictPanel.locator('article.research-help-card');
    await expect(cards).toHaveCount(18);

    const vbCard = cards.filter({ has: page.locator('code', { hasText: /^volatility_breakout$/ }) });
    await expect(vbCard).toHaveCount(1);
    await expect(vbCard).toContainText('돌파 계수 k 0.5 / 적응형 노이즈 꺼짐 / 노이즈 20봉 / 추세 SMA 20봉 / 보유 1일');
    await expect(vbCard).toContainText('수익 미보장');
    await expect(vbCard).toContainText('DEMO에서는 사용할 수 없고 KIS 모의에서는 정지 상태(active=false) 저장만 가능하며 시작·계약 고정은 차단됩니다.');
    await expect(vbCard).toContainText('max(시가, 목표가)');

    const macdCard = cards.filter({ has: page.locator('code', { hasText: /^macd_momentum$/ }) });
    await expect(macdCard).toContainText('KIS 모의(확정 일봉 기반 당일 1회)');
    await expect(macdCard).toContainText('계약 고정 후 추가 수집 일봉 자동 미반영');

    const chandelierCard = cards.filter({ has: page.locator('code', { hasText: /^chandelier$/ }) });
    await expect(chandelierCard).toContainText('KIS 모의(확정 일봉 기반 당일 1회, 종가형 10종 결합)');
    await expect(chandelierCard).toContainText('계약 고정 후 추가 수집 일봉 자동 미반영');

    const parityCard = cards.filter({ has: page.locator('code', { hasText: /^volatilityParity$/ }) });
    await expect(parityCard).toHaveCount(1);
    await expect(parityCard).toContainText('20 변동성 패리티 · RMS 포지션 사이징');
    await expect(parityCard).toContainText('관측 기간 20봉 / 목표 연환산 변동성 20% / 최대 배정 비중 100%');
    await expect(parityCard).toContainText('DEMO에서는 사용할 수 없으며, KIS 모의에서는 정지 상태(active=false) 저장만 가능하고 시작·계약 고정은 차단됩니다.');

    // 문맥 가이드 전환 확인
    await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('volatility_breakout');
    await page.getByLabel('20 변동성 패리티 · 목표 변동성 수량 조절 오버레이 (선택)').check();
    const helpDetails = page.locator('details.rule-field-help');
    await helpDetails.locator('summary').click();
    await expect(helpDetails.locator('summary')).toHaveText('현재 선택한 규칙(윌리엄스 변동성 돌파) 입력 항목 설명 보기');
    await expect(helpDetails).toContainText('돌파 계수 k 0.5 / 적응형 노이즈 꺼짐 / 노이즈 20봉 / 추세 SMA 20봉 / 보유 1일');
    await expect(helpDetails).toContainText('20 변동성 패리티 · RMS 포지션 사이징 (사용 중)');

    // 390px 모바일 가로 넘침 없음 확인
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(390);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
  }
});
