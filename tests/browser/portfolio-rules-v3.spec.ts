import { expect, test, type Page } from '@playwright/test';
import { addDays, type DailyRun, type StoredBar } from '../../shared/market-data';
import { portfolioOnly } from '../../shared/portfolio-rules';
import { emptyStatus } from '../../shared/status';
import { snapshot } from '../snapshot';

/** 초기 `/api/state` 스냅샷 로드 및 워크스페이스 연결 안정화 완료를 대기한다. */
async function waitWorkbenchReady(page: Page) {
  await expect(page.getByText('로컬 서버 연결', { exact: true })).toBeVisible();
}

/** 다종목 자산배분(`dual_momentum`·`faber_gtaa`) 테스트용 260봉 동일 달력 일봉 fixture를 생성한다. */
function portfolioDailyFixture(
  code: string,
  id: string,
  options: {
    barCount?: number;
    startDate?: string;
    startedAt?: string;
    captureDate?: string;
    adjustment?: 'adjusted' | 'raw';
    priceFn: (i: number) => number;
  },
) {
  const barCount = options.barCount ?? 150;
  const startDate = options.startDate ?? '20250102';
  const startedAt = options.startedAt ?? '2026-06-01T01:00:00.000Z';
  const adjustment = options.adjustment ?? 'adjusted';
  const dates: string[] = [];
  for (let offset = 0; dates.length < barCount; offset++) {
    const candidate = addDays(startDate, offset);
    const iso = `${candidate.slice(0, 4)}-${candidate.slice(4, 6)}-${candidate.slice(6)}`;
    const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) dates.push(candidate);
  }
  const captureDate = options.captureDate ?? addDays(dates.at(-1)!, 2);
  const run: DailyRun = {
    id,
    code,
    from: dates[0],
    to: dates.at(-1)!,
    adjustment,
    source: 'kis-rest',
    exchange: 'KRX',
    endpoint: '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
    startedAt,
    captureDate,
    coverageComplete: true,
    nextDate: null,
    calendar: { source: 'https://example.test/v3-fixture-calendar', dates },
    status: {
      ...emptyStatus('kis-paper'),
      phase: 'ready',
      complete: true,
      observedAt: startedAt,
      lastSuccessAt: startedAt,
      pages: 1,
    },
    quality: {
      state: 'passed',
      missingDates: [],
      unexpectedDates: [],
      candidateMissingDates: [],
      duplicates: 0,
      emptyWindows: [],
    },
  };
  const bars: StoredBar[] = dates.map((date, i) => {
    const close = Math.max(1000, Math.round(options.priceFn(i)));
    const open = Math.max(1000, close - 50);
    return {
      date,
      open,
      high: Math.max(open, close) + 200,
      low: Math.min(open, close) - 200,
      close,
      volume: 150000,
      code,
      adjustment,
      source: 'kis-rest',
      collectedAt: startedAt,
    };
  });
  return { run, bars, dates };
}

test('4A-2: 저장 일봉 다종목(dual_momentum·faber_gtaa) v3 실행·리밸런싱·종목 코드·동일 비중 벤치마크·재현·수동 runId·차단·출처 전환·stale 방지', async ({
  page,
}) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');

  // 069500(최신 run과 구 run 2개), 005930, 00088K(안전자산) 동일 거래일 150봉 저장
  const runA = portfolioDailyFixture('069500', 'aaaaaaaa-1111-4111-8111-111111111111', {
    barCount: 150,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => (i < 45 ? 30000 + i * 220 : i < 95 ? 40000 - (i - 45) * 180 : 31000 + (i - 95) * 260),
  });
  const runAOld = portfolioDailyFixture('069500', 'aaaaaaaa-0000-4000-8000-000000000000', {
    barCount: 150,
    startedAt: '2026-05-01T01:00:00.000Z',
    priceFn: i => (i < 45 ? 30000 + i * 200 : 39000 - (i - 45) * 120),
  });
  const runB = portfolioDailyFixture('005930', 'bbbbbbbb-2222-4222-8222-222222222222', {
    barCount: 150,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => (i < 60 ? 50000 - i * 120 : 42800 + (i - 60) * 300),
  });
  const runSafe = portfolioDailyFixture('00088K', 'cccccccc-3333-4333-8333-333333333333', {
    barCount: 150,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 20000 + i * 15,
  });

  store.saveDaily(runAOld.run, runAOld.bars);
  store.saveDaily(runA.run, runA.bars);
  store.saveDaily(runB.run, runB.bars);
  store.saveDaily(runSafe.run, runSafe.bars);

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4341]);
  await new Promise<void>(resolve => server.listen(4341, '127.0.0.1', resolve));

  const dailyPayloads: Record<string, unknown>[] = [];
  await page.route('**/api/**', async route => {
    const req = route.request();
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/backtest/daily') {
      dailyPayloads.push(req.postDataJSON() as Record<string, unknown>);
    }
    const response = await route.fetch({ url: req.url().replace(':4314', ':4341') });
    await route.fulfill({ response });
  });

  try {
    await page.goto('/backtest');
    await waitWorkbenchReady(page);
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toBeEnabled();

    // 1. ETF 듀얼 모멘텀 선택 → 환경 배지, 공통 오버레이 비활성화, 자동 매핑(최신 startedAt 우선) 확인
    await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('dual_momentum');
    const envBadges = page.getByLabel('환경별 사용 가능 여부');
    await expect(envBadges).toContainText('저장 일봉: 다종목 자산배분 (v3)');
    await expect(envBadges).toContainText('DEMO: 미지원');
    await expect(envBadges).toContainText('KIS 모의: 시작 불가 (저장 일봉 백테스트 전용)');
    await expect(page.getByLabel('샹들리에 ATR 청산 오버레이 사용')).toBeDisabled();
    await expect(page.getByLabel('20 변동성 패리티 · 목표 변동성 수량 조절 오버레이 (선택)')).toBeDisabled();

    // 자동 매핑: 069500은 최신 startedAt(runA) 자동 선택, 005930은 runB 자동 선택
    await expect(page.getByLabel('069500 일봉 수집 기록')).toHaveValue(runA.run.id);
    await expect(page.getByLabel('005930 일봉 수집 기록')).toHaveValue(runB.run.id);

    // 안전자산 00088K 입력 + 공격적 프리셋(관측 20, 리밸런싱 10) 적용
    await page.getByLabel('안전자산 종목코드 (선택 · 비우면 현금 보유)').fill('00088K');
    await expect(page.getByLabel('00088K 일봉 수집 기록')).toHaveValue(runSafe.run.id);
    await page.getByRole('button', { name: '공격적', exact: true }).click();
    await expect(page.getByLabel('모멘텀 관측 기간 (봉)')).toHaveValue('20');
    await expect(page.getByLabel('리밸런싱 주기 (봉)')).toHaveValue('10');

    // 2. 수집 필요 종목(999999) 입력 시 경고 표시 및 실행 차단(POST 0건)
    await page.getByLabel('위험 자산 2', { exact: true }).fill('999999');
    await expect(page.getByLabel('바스켓 종목별 일봉 수집 기록')).toContainText('수집 필요');
    await expect(page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true })).toBeDisabled();
    expect(dailyPayloads).toHaveLength(0);

    // 정상 종목 005930 복구
    await page.getByLabel('위험 자산 2', { exact: true }).fill('005930');
    const runBtn = page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true });
    await expect(runBtn).toBeEnabled();

    // 3. 역순 날짜 및 공통 가능 기간 범위 밖 날짜 클라이언트 차단(POST 0건 + alert + 포커스)
    const fromInput = page.locator('input[name="from"]');
    const toInput = page.locator('input[name="to"]');
    const savedFrom = await fromInput.inputValue();
    const savedTo = await toInput.inputValue();

    await fromInput.fill('2025-07-01');
    await toInput.fill('2025-02-01');
    await runBtn.click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('시작일은 종료일보다 늦을 수 없습니다.');
    await expect(fromInput).toBeFocused();
    expect(dailyPayloads).toHaveLength(0);

    await fromInput.fill('2024-01-01');
    await toInput.fill(savedTo);
    await runBtn.click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('공통 가능 기간');
    await expect(fromInput).toBeFocused();
    expect(dailyPayloads).toHaveLength(0);

    await fromInput.fill(savedFrom);
    await toInput.fill(savedTo);

    // 4. dual_momentum v3 실행 → strictObject 페이로드·결과·리밸런싱·종목 코드·벤치마크·재현 검증
    await runBtn.click();
    const result = page.getByRole('region', { name: '저장 일봉 실험 결과' });
    await expect(result).toBeVisible();

    expect(dailyPayloads).toHaveLength(1);
    const dmSent = dailyPayloads[0];
    expect(dmSent).not.toHaveProperty('code');
    expect(dmSent).not.toHaveProperty('runId');
    expect(dmSent).not.toHaveProperty('fast');
    expect(dmSent).not.toHaveProperty('slow');
    expect(dmSent).not.toHaveProperty('overlay');
    expect(dmSent).toHaveProperty('runs');
    expect((dmSent.rule as { kind: string }).kind).toBe('dual_momentum');

    await expect(result.getByLabel('위험 자산 동일 비중 벤치마크 비교')).toBeVisible();
    await expect(result.getByRole('heading', { name: '리밸런싱 내역', exact: true })).toBeVisible();
    await expect(result.getByRole('columnheader', { name: '종목별 목표 비중' })).toBeVisible();
    await expect(result.getByRole('columnheader', { name: '종목 코드' })).toBeVisible();
    await expect(result.getByRole('columnheader', { name: '매매 사유' })).toBeVisible();

    await result.getByText('재현 입력·출처 확인', { exact: true }).click();
    await expect(result).toContainText('daily-portfolio-next-open-v3');
    const dmHash = (await result.getByTestId('experiment-hash').textContent())?.trim() ?? '';
    expect(dmHash).toMatch(/^[a-f0-9]{64}$/);
    await result.getByRole('button', { name: '고정 입력으로 재현 검증', exact: true }).click();
    await expect(result).toContainText('재현 일치');

    // 5. 수동 runId 드롭다운 변경(069500 → runAOld) 후 faber_gtaa 실행 검증
    await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('faber_gtaa');
    await page.getByRole('button', { name: '공격적', exact: true }).click();
    await expect(page.getByLabel('추세 이동평균 기간 (봉)')).toHaveValue('60');
    await expect(page.getByLabel('리밸런싱 주기 (봉)')).toHaveValue('10');
    await page.getByLabel('069500 일봉 수집 기록').selectOption(runAOld.run.id);
    await expect(page.getByLabel('069500 일봉 수집 기록')).toHaveValue(runAOld.run.id);

    await runBtn.click();
    await expect(result).toBeVisible();
    expect(dailyPayloads).toHaveLength(2);
    const gtaaSent = dailyPayloads[1];
    expect((gtaaSent.rule as { kind: string }).kind).toBe('faber_gtaa');
    expect(gtaaSent.runs).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: '069500', runId: runAOld.run.id })]),
    );
    await expect(result.getByRole('heading', { name: '리밸런싱 내역', exact: true })).toBeVisible();
    await expect(result).toContainText('종가가 이동평균을 초과한 위험 자산');

    // 6. DEMO ↔ 저장 일봉 출처 전환 시 다종목 ruleForm·costs 보존 확인
    await page.locator('input[name="capital"]').fill('20000000');
    const sourceSelect = page.getByLabel('데이터 출처');
    await sourceSelect.selectOption('demo');
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('faber_gtaa');
    await expect(page.getByLabel('추세 이동평균 기간 (봉)')).toHaveValue('60');
    await expect(page.locator('input[name="capital"]')).toHaveValue('20000000');
    await expect(page.getByRole('main')).toContainText(portfolioOnly);
    await sourceSelect.selectOption('stored');
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('faber_gtaa');
    await expect(page.getByLabel('추세 이동평균 기간 (봉)')).toHaveValue('60');
    await expect(page.locator('input[name="capital"]')).toHaveValue('20000000');

    // 7. 저장 실험 불러온 뒤 runId 수정 → 브라우저 뒤로→앞으로 이동 시 stale 결과 미재결합 확인
    const savedSelect = page.getByLabel('저장 실험');
    const dmOpt = await savedSelect.locator('option', { hasText: 'ETF 듀얼 모멘텀' }).getAttribute('value');
    expect(dmOpt).toBeTruthy();
    await savedSelect.selectOption(dmOpt!);
    await page.getByRole('button', { name: '저장 실험 불러오기', exact: true }).click();
    await expect(result).toBeVisible();
    await expect(result.getByTestId('experiment-hash')).toHaveText(dmHash);

    await page.getByLabel('069500 일봉 수집 기록').selectOption(runAOld.run.id);
    await expect(result).toHaveCount(0);
    await page.goBack();
    await page.goForward();
    await expect(result).toHaveCount(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('4A-2: 전략 스튜디오 다종목 왕복·evidence 해제·DEMO 차단(POST 0건)·KIS 모의 저장 및 시작 비활성화·카드 백테스트 자동 매핑', async ({
  page,
}) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');

  const runA = portfolioDailyFixture('069500', 'dddddddd-1111-4111-8111-111111111111', {
    barCount: 150,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 30000 + i * 180,
  });
  const runB = portfolioDailyFixture('005930', 'eeeeeeee-2222-4222-8222-222222222222', {
    barCount: 150,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 50000 + i * 90,
  });
  const runSafe = portfolioDailyFixture('00088K', 'ffffffff-3333-4333-8333-333333333333', {
    barCount: 150,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 20000 + i * 10,
  });
  store.saveDaily(runA.run, runA.bars);
  store.saveDaily(runB.run, runB.bars);
  store.saveDaily(runSafe.run, runSafe.bars);
  store.saveMasters([
    {
      exchange: 'KOSPI',
      source: 'fixture',
      collectedAt: '2026-06-02T01:00:00.000Z',
      sha256: 'a'.repeat(64),
      rows: [
        { code: '069500', name: 'KODEX 200', exchange: 'KOSPI', kind: 'etf', isin: 'KR7069500007', group: 'EF', tradingHalted: false, liquidation: false },
        { code: '005930', name: '삼성전자', exchange: 'KOSPI', kind: 'stock', isin: 'KR7005930003', group: 'ST', tradingHalted: false, liquidation: false },
        { code: '00088K', name: '채권ETF', exchange: 'KOSPI', kind: 'etf', isin: 'KR700088K001', group: 'EF', tradingHalted: false, liquidation: false },
      ],
    },
  ]);

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4342]);
  await new Promise<void>(resolve => server.listen(4342, '127.0.0.1', resolve));

  const strategyPosts: Record<string, unknown>[] = [];
  const demoBacktestPosts: unknown[] = [];
  await page.route('**/api/**', async route => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;
    if (req.method() === 'POST' && pathname === '/api/strategies') {
      strategyPosts.push(req.postDataJSON() as Record<string, unknown>);
    }
    if (req.method() === 'POST' && pathname === '/api/backtest') {
      demoBacktestPosts.push(req.postDataJSON());
    }
    const response = await route.fetch({ url: req.url().replace(':4314', ':4342') });
    await route.fulfill({ response });
  });

  try {
    // 1. DEMO 전략 스튜디오에서 다종목 저장 시도 → POST 0건 + portfolioOnly 알림
    await page.goto('/strategies');
    await waitWorkbenchReady(page);
    await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('dual_momentum');
    await page.getByLabel('안전자산 종목코드 (선택 · 비우면 현금 보유)').fill('00088K');
    await expect(page.getByLabel('대표 종목 (위험 자산 1 자동 동기화)')).toHaveValue('069500');
    await page.getByRole('button', { name: '전략 저장', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(portfolioOnly);
    expect(strategyPosts).toHaveLength(0);

    // 2. DEMO 백테스트 실행 시도 → POST 0건 + portfolioOnly 알림
    await page.goto('/backtest?source=demo');
    await waitWorkbenchReady(page);
    await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('dual_momentum');
    await page.getByRole('button', { name: '백테스트 실행', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(portfolioOnly);
    expect(demoBacktestPosts).toHaveLength(0);

    // 3. 저장 일봉 백테스트에서 dual_momentum 실행 → '이 설정으로 전략 만들기' → evidence 연결 및 변경 시 해제 확인
    await page.goto('/backtest');
    await waitWorkbenchReady(page);
    await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('dual_momentum');
    await page.getByRole('button', { name: '공격적', exact: true }).click();
    await page.getByLabel('안전자산 종목코드 (선택 · 비우면 현금 보유)').fill('00088K');
    await page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true }).click();
    const result = page.getByRole('region', { name: '저장 일봉 실험 결과' });
    await expect(result).toBeVisible();
    await result.getByText('재현 입력·출처 확인', { exact: true }).click();
    const expHash = (await result.getByTestId('experiment-hash').textContent())?.trim() ?? '';

    await result.getByRole('button', { name: '이 설정으로 전략 만들기', exact: true }).click();
    await expect(page).toHaveURL(/\/strategies#strategy-editor$/);
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('dual_momentum');
    await expect(page.getByLabel('대표 종목 (위험 자산 1 자동 동기화)')).toHaveValue('069500');
    await expect(page.getByText(expHash.slice(0, 8))).toBeVisible();

    // 바스켓 순서 변경 시 evidence 즉시 해제 및 대표 종목 자동 동기화 확인
    await page.getByRole('button', { name: '위험 자산 2 위로 이동', exact: true }).click();
    await expect(page.getByLabel('대표 종목 (위험 자산 1 자동 동기화)')).toHaveValue('005930');
    await expect(page.getByText(expHash.slice(0, 8))).toHaveCount(0);

    // 다시 저장 실험 불러와 '이 설정으로 전략 만들기' → KIS 모의 저장 (overlay 생략 확인)
    await page.goto('/backtest');
    await waitWorkbenchReady(page);
    await expect(page.getByRole('button', { name: '저장 실험 불러오기', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '저장 실험 불러오기', exact: true }).click();
    await expect(result).toBeVisible();
    await result.getByRole('button', { name: '이 설정으로 전략 만들기', exact: true }).click();
    await expect(page).toHaveURL(/\/strategies#strategy-editor$/);
    await page.getByLabel('전략 환경').selectOption('kis-paper');
    await expect(page.getByText(expHash.slice(0, 8))).toBeVisible();
    await page.getByLabel('전략 이름').fill('KIS 듀얼 모멘텀 검증');
    await page.getByRole('button', { name: '전략 저장', exact: true }).click();

    expect(strategyPosts).toHaveLength(1);
    expect(strategyPosts[0]).not.toHaveProperty('overlay');
    expect(strategyPosts[0].code).toBe('069500');
    expect(strategyPosts[0].environment).toBe('kis-paper');
    expect(strategyPosts[0].evidence).toEqual({ experimentId: expHash, inputHash: expHash });

    const savedCard = page.locator('.studio-card').filter({
      has: page.getByRole('heading', { name: 'KIS 듀얼 모멘텀 검증', exact: true }),
    });
    await expect(savedCard).toBeVisible();
    await expect(savedCard).toContainText('저장 일봉: 다종목 자산배분 (v3)');
    await expect(savedCard).toContainText(`검증 실험 연결 · ${expHash.slice(0, 8)}`);
    await expect(savedCard).toContainText('069500 / 005930');
    await expect(savedCard).toContainText('00088K');
    await expect(savedCard).toContainText(portfolioOnly);
    await expect(savedCard.getByRole('button', { name: '전략 시작', exact: true })).toBeDisabled();

    // 4. 카드의 '이 설정으로 백테스트' 클릭 → /backtest?source=stored&strategyId=... 이동 및 적격 runId 자동 매핑 확인
    await savedCard.getByRole('link', { name: '이 설정으로 백테스트', exact: true }).click();
    await expect(page).toHaveURL(/\/backtest\?source=stored&strategyId=/);
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('dual_momentum');
    await expect(page.getByLabel('위험 자산 1', { exact: true })).toHaveValue('069500');
    await expect(page.getByLabel('위험 자산 2', { exact: true })).toHaveValue('005930');
    await expect(page.getByLabel('안전자산 종목코드 (선택 · 비우면 현금 보유)')).toHaveValue('00088K');
    await expect(page.getByLabel('모멘텀 관측 기간 (봉)')).toHaveValue('20');
    await expect(page.getByLabel('리밸런싱 주기 (봉)')).toHaveValue('10');
    await expect(page.getByLabel('069500 일봉 수집 기록')).toHaveValue(runA.run.id);
    await expect(page.getByLabel('005930 일봉 수집 기록')).toHaveValue(runB.run.id);
    await expect(page.getByLabel('00088K 일봉 수집 기록')).toHaveValue(runSafe.run.id);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('4A-2: TradingSettings는 다종목 전략(dual_momentum·faber_gtaa) 1-3단계 직접 URL 진입을 전면 차단하고 실제 요약·스튜디오 초안을 전달한다', async ({
  page,
}) => {
  const state = snapshot();
  state.strategies = [
    {
      id: 'kis-dual-momentum',
      name: 'KIS 듀얼 모멘텀',
      code: '069500',
      fast: 5,
      slow: 20,
      qty: 1,
      active: false,
      lastSignal: 'hold',
      lastTick: -1,
      environment: 'kis-paper',
      revision: 1,
      rule: {
        kind: 'dual_momentum',
        assets: ['069500', '005930'],
        safeAsset: '00088K',
        lookbackDays: 60,
        rebalanceDays: 20,
      },
    },
    {
      id: 'kis-faber-gtaa',
      name: 'KIS 파버 GTAA',
      code: '069500',
      fast: 5,
      slow: 20,
      qty: 2,
      active: false,
      lastSignal: 'hold',
      lastTick: -1,
      environment: 'kis-paper',
      revision: 1,
      rule: {
        kind: 'faber_gtaa',
        assets: ['069500', '005930'],
        safeAsset: null,
        smaPeriod: 120,
        rebalanceDays: 20,
      },
    },
  ];

  const posts: string[] = [];
  page.on('request', req => {
    if (req.method() === 'POST') posts.push(new URL(req.url()).pathname);
  });

  let activeDraftStrategyId = 'kis-dual-momentum';
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
              id: 'draft-portfolio-blocked',
              runId: 'run-portfolio-blocked',
              fixed: false,
              symbol: target.code,
              fast: target.fast,
              slow: target.slow,
              qty: target.qty,
              rule: target.rule,
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

  // 1. dual_momentum 1·2·3단계 전면 차단 및 실제 규칙 요약(5/20 교차 오표시 금지)
  const dmSummary = 'ETF 듀얼 모멘텀 (관측 60봉 · 리밸런싱 20봉 · 위험 069500/005930 · 안전 00088K)';
  await page.goto('/settings/trading/strategy/1?strategy=kis-dual-momentum');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('main')).toContainText(dmSummary);
  await expect(page.getByRole('main')).toContainText(portfolioOnly);
  await expect(page.getByRole('main')).not.toContainText('5/20 교차');
  await expect(page.getByRole('button', { name: '한도·조건으로', exact: true })).toBeDisabled();

  await page.goto('/settings/trading/strategy/2?strategy=kis-dual-momentum');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('main')).toContainText(dmSummary);
  await expect(page.getByRole('main')).toContainText(portfolioOnly);
  await expect(page.getByRole('button', { name: '초안 저장 및 검토', exact: true })).toBeDisabled();

  await page.goto('/settings/trading/strategy/3?strategy=kis-dual-momentum');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('main')).toContainText(`저장 대상 069500 · ${dmSummary} · 1주`);
  await expect(page.getByRole('main')).toContainText(portfolioOnly);
  await expect(page.getByRole('button', { name: '다음 실행 고정', exact: true })).toBeDisabled();

  // 2. faber_gtaa 1·2·3단계 차단 및 스튜디오 초안 전달 링크 검증
  activeDraftStrategyId = 'kis-faber-gtaa';
  const gtaaSummary = '파버 GTAA (SMA 120봉 · 리밸런싱 20봉 · 위험 069500/005930 · 안전 현금)';
  await page.goto('/settings/trading/strategy/1?strategy=kis-faber-gtaa');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('main')).toContainText(gtaaSummary);
  await expect(page.getByRole('main')).toContainText(portfolioOnly);
  await expect(page.getByRole('main')).not.toContainText('5/20 교차');
  await expect(page.getByRole('button', { name: '한도·조건으로', exact: true })).toBeDisabled();

  await page.goto('/settings/trading/strategy/2?strategy=kis-faber-gtaa');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('main')).toContainText(gtaaSummary);
  await expect(page.getByRole('button', { name: '초안 저장 및 검토', exact: true })).toBeDisabled();

  await page.goto('/settings/trading/strategy/3?strategy=kis-faber-gtaa');
  await waitWorkbenchReady(page);
  await expect(page.getByRole('main')).toContainText(`저장 대상 069500 · ${gtaaSummary} · 2주`);
  await expect(page.getByRole('button', { name: '다음 실행 고정', exact: true })).toBeDisabled();

  // 스튜디오 초안 전달 링크 클릭 시 faber_gtaa 설정 전달 확인
  await page.goto('/settings/trading/strategy/1?strategy=kis-faber-gtaa');
  await waitWorkbenchReady(page);
  await page.getByRole('link', { name: '전략 스튜디오에서 이 설정으로 새 전략 만들기' }).first().click();
  await expect(page).toHaveURL(/\/strategies\?environment=kis-paper#strategy-editor$/);
  await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('faber_gtaa');
  await expect(page.getByLabel('추세 이동평균 기간 (봉)')).toHaveValue('120');
  await expect(page.getByLabel('위험 자산 1', { exact: true })).toHaveValue('069500');
  await expect(page.getByLabel('위험 자산 2', { exact: true })).toHaveValue('005930');

  expect(posts).toEqual([]);
});

test('4A-2: 도움말 15카드 사전·dual_momentum·faber_gtaa 문맥 가이드·WAI-ARIA 4탭 및 390px 모바일 무넘침 검증', async ({
  page,
}) => {
  for (const route of ['/strategies', '/backtest']) {
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(route);
    await waitWorkbenchReady(page);

    const helpBtn = page.getByRole('button', { name: '사용방법 도움말', exact: true });
    await expect(helpBtn).toHaveAttribute('aria-expanded', 'false');
    await expect(helpBtn).not.toHaveAttribute('aria-controls');
    await helpBtn.click();
    await expect(helpBtn).toHaveAttribute('aria-expanded', 'true');
    await expect(helpBtn).toHaveAttribute('aria-controls', /.+/);

    const helpRegion = page.getByRole('region', { name: '전략 스튜디오 및 백테스트 사용방법 도움말' });
    await expect(helpRegion.locator('[role="tabpanel"]')).toHaveCount(4);
    await helpRegion.getByRole('tab', { name: '전략·입력 항목 사전', exact: true }).click();
    const dictPanel = helpRegion.locator('[role="tabpanel"]:not([hidden])');
    const cards = dictPanel.locator('article.research-help-card');
    await expect(cards).toHaveCount(18);

    const dmCard = cards.filter({ has: page.locator('code', { hasText: /^dual_momentum$/ }) });
    await expect(dmCard).toHaveCount(1);
    await expect(dmCard).toContainText('13 ETF 듀얼 모멘텀');
    await expect(dmCard).toContainText('모멘텀 관측 60봉 / 리밸런싱 20봉');
    await expect(dmCard).toContainText('거래일 달력이 100% 일치');
    await expect(dmCard).toContainText('생존 편향');
    await expect(dmCard).toContainText('앞 순서 종목이 우선');
    await expect(dmCard).toContainText('소폭 축소 매도가 발생할 수 있으며');
    await expect(dmCard).toContainText('입력 순서 뒤쪽 종목의 체결 수량이 줄어들 수 있습니다');

    const gtaaCard = cards.filter({ has: page.locator('code', { hasText: /^faber_gtaa$/ }) });
    await expect(gtaaCard).toHaveCount(1);
    await expect(gtaaCard).toContainText('14 파버 GTAA');
    await expect(gtaaCard).toContainText('추세 SMA 120봉 / 리밸런싱 20봉');
    await expect(gtaaCard).toContainText('거래일 달력이 100% 일치');
    await expect(gtaaCard).toContainText('위험 자산 동일 비중 첫 시가 보유');
    await expect(gtaaCard).toContainText('소폭 축소 매도가 발생할 수 있으며');
    await expect(gtaaCard).toContainText('입력 순서 뒤쪽 종목의 체결 수량이 줄어들 수 있습니다');

    // 문맥 가이드 전환 확인
    const ruleSelect = page.getByRole('combobox', { name: '전략 규칙', exact: true });
    const helpDetails = page.locator('details.rule-field-help');
    await helpDetails.locator('summary').click();

    await ruleSelect.selectOption('dual_momentum');
    await expect(helpDetails.locator('summary')).toHaveText('현재 선택한 규칙(ETF 듀얼 모멘텀) 입력 항목 설명 보기');
    await expect(helpDetails).toContainText('모멘텀 관측 60봉 / 리밸런싱 20봉');

    await ruleSelect.selectOption('faber_gtaa');
    await expect(helpDetails.locator('summary')).toHaveText('현재 선택한 규칙(파버 GTAA) 입력 항목 설명 보기');
    await expect(helpDetails).toContainText('추세 SMA 120봉 / 리밸런싱 20봉');

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

test('4A-2 보완 Major 1: v3 재현 응답에서 rebalances·benchmark·trades[].code 누락 시 matches=true라도 오류로 거부한다', async ({
  page,
}) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');

  const runA = portfolioDailyFixture('069500', '11111111-aaaa-4111-8111-111111111111', {
    barCount: 120,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => (i < 50 ? 30000 + i * 200 : 40000 - (i - 50) * 150),
  });
  const runB = portfolioDailyFixture('005930', '22222222-bbbb-4222-8222-222222222222', {
    barCount: 120,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => (i < 50 ? 50000 - i * 100 : 45000 + (i - 50) * 260),
  });
  store.saveDaily(runA.run, runA.bars);
  store.saveDaily(runB.run, runB.bars);

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4343]);
  await new Promise<void>(resolve => server.listen(4343, '127.0.0.1', resolve));

  let corruptMode: 'missing-rebalances' | 'missing-benchmark' | 'missing-trade-code' = 'missing-rebalances';
  await page.route('**/api/**', async route => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;
    const response = await route.fetch({ url: req.url().replace(':4314', ':4343') });
    if (req.method() === 'POST' && pathname === '/api/backtest/replay') {
      const json = (await response.json()) as {
        result: Record<string, unknown>;
        matches: boolean;
        inputHash: string;
      };
      const corrupted = structuredClone(json);
      corrupted.matches = true;
      if (corruptMode === 'missing-rebalances') {
        delete corrupted.result.rebalances;
      } else if (corruptMode === 'missing-benchmark') {
        delete corrupted.result.benchmark;
      } else if (corruptMode === 'missing-trade-code') {
        const trades = corrupted.result.trades as Record<string, unknown>[];
        if (trades.length > 0) delete trades[0].code;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corrupted) });
      return;
    }
    await route.fulfill({ response });
  });

  try {
    await page.goto('/backtest');
    await waitWorkbenchReady(page);
    await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('dual_momentum');
    await page.getByRole('button', { name: '공격적', exact: true }).click();
    await page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true }).click();

    const result = page.getByRole('region', { name: '저장 일봉 실험 결과' });
    await expect(result).toBeVisible();
    const verifyBtn = result.getByRole('button', { name: '고정 입력으로 재현 검증', exact: true });

    for (const mode of ['missing-rebalances', 'missing-benchmark', 'missing-trade-code'] as const) {
      corruptMode = mode;
      await verifyBtn.click();
      await expect(result.getByRole('alert')).toContainText('재현 응답 형식이 올바르지 않습니다.');
      await expect(result).not.toContainText('재현 일치');
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('4A-2 보완 Major 2: 저장 일봉의 수동 날짜(from/to)·다종목 수정주가 정책·종목별 runId가 DEMO 왕복 후에도 보존된다', async ({
  page,
}) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');

  const adjA = portfolioDailyFixture('069500', '33333333-1111-4111-8111-111111111111', {
    barCount: 140,
    adjustment: 'adjusted',
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 30000 + i * 140,
  });
  const adjB = portfolioDailyFixture('005930', '33333333-2222-4222-8222-222222222222', {
    barCount: 140,
    adjustment: 'adjusted',
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 50000 + i * 110,
  });
  const rawANew = portfolioDailyFixture('069500', '44444444-1111-4111-8111-111111111111', {
    barCount: 140,
    adjustment: 'raw',
    startedAt: '2026-06-03T01:00:00.000Z',
    priceFn: i => 30000 + i * 160,
  });
  const rawAOld = portfolioDailyFixture('069500', '44444444-0000-4000-8000-000000000000', {
    barCount: 140,
    adjustment: 'raw',
    startedAt: '2026-05-01T01:00:00.000Z',
    priceFn: i => 30000 + i * 120,
  });
  const rawB = portfolioDailyFixture('005930', '44444444-2222-4222-8222-222222222222', {
    barCount: 140,
    adjustment: 'raw',
    startedAt: '2026-06-03T01:00:00.000Z',
    priceFn: i => 50000 + i * 95,
  });
  store.saveDaily(adjA.run, adjA.bars);
  store.saveDaily(adjB.run, adjB.bars);
  store.saveDaily(rawAOld.run, rawAOld.bars);
  store.saveDaily(rawANew.run, rawANew.bars);
  store.saveDaily(rawB.run, rawB.bars);

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4344]);
  await new Promise<void>(resolve => server.listen(4344, '127.0.0.1', resolve));

  const dailyPayloads: Record<string, unknown>[] = [];
  await page.route('**/api/**', async route => {
    const req = route.request();
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/backtest/daily') {
      dailyPayloads.push(req.postDataJSON() as Record<string, unknown>);
    }
    const response = await route.fetch({ url: req.url().replace(':4314', ':4344') });
    await route.fulfill({ response });
  });

  try {
    await page.goto('/backtest');
    await waitWorkbenchReady(page);
    await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('dual_momentum');
    await page.getByRole('button', { name: '공격적', exact: true }).click();

    // 수정주가 정책을 원주가(raw)로 변경하고, 069500 runId를 구 기록(rawAOld)으로 수동 변경, 날짜도 좁은 구간으로 수정
    await page.getByLabel('수정주가 정책').selectOption('raw');
    await expect(page.getByLabel('069500 일봉 수집 기록')).toHaveValue(rawANew.run.id);
    await page.getByLabel('069500 일봉 수집 기록').selectOption(rawAOld.run.id);
    await expect(page.getByLabel('069500 일봉 수집 기록')).toHaveValue(rawAOld.run.id);

    const customFrom = '2025-02-03';
    const customTo = '2025-06-20';
    await page.locator('input[name="from"]').fill(customFrom);
    await page.locator('input[name="to"]').fill(customTo);

    // DEMO 탭 → 저장 일봉 탭 왕복
    const sourceSelect = page.getByLabel('데이터 출처');
    await sourceSelect.selectOption('demo');
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('dual_momentum');
    await sourceSelect.selectOption('stored');

    // 복원 검증: 정책(raw), 수동 runId(rawAOld), 수동 날짜(from/to) 모두 commonRange로 초기화되지 않고 유지
    await expect(page.getByLabel('수정주가 정책')).toHaveValue('raw');
    await expect(page.getByLabel('069500 일봉 수집 기록')).toHaveValue(rawAOld.run.id);
    await expect(page.getByLabel('005930 일봉 수집 기록')).toHaveValue(rawB.run.id);
    await expect(page.locator('input[name="from"]')).toHaveValue(customFrom);
    await expect(page.locator('input[name="to"]')).toHaveValue(customTo);

    // 보존된 조건으로 실행 시 정확한 raw·수동 runId·수동 날짜 페이로드 전송 확인
    await page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true }).click();
    await expect(page.getByRole('region', { name: '저장 일봉 실험 결과' })).toBeVisible();
    expect(dailyPayloads).toHaveLength(1);
    expect(dailyPayloads[0].adjustment).toBe('raw');
    expect(dailyPayloads[0].from).toBe('20250203');
    expect(dailyPayloads[0].to).toBe('20250620');
    expect(dailyPayloads[0].runs).toEqual(
      expect.arrayContaining([
        { code: '069500', runId: rawAOld.run.id },
        { code: '005930', runId: rawB.run.id },
      ]),
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('4A-2 보완 Minor 1: location.state 없이 /backtest?source=stored&strategyId=<다종목전략ID> 직접 진입 시 1회 복원되고 이후 편집을 덮어쓰지 않는다', async ({
  page,
}) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');

  const runA = portfolioDailyFixture('069500', '55555555-1111-4111-8111-111111111111', {
    barCount: 120,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 30000 + i * 150,
  });
  const runB = portfolioDailyFixture('005930', '55555555-2222-4222-8222-222222222222', {
    barCount: 120,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 50000 + i * 100,
  });
  const runSafe = portfolioDailyFixture('00088K', '55555555-3333-4333-8333-333333333333', {
    barCount: 120,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 20000 + i * 20,
  });
  store.saveDaily(runA.run, runA.bars);
  store.saveDaily(runB.run, runB.bars);
  store.saveDaily(runSafe.run, runSafe.bars);

  const strategyId = 'direct-url-portfolio-strategy';
  store.update(state => {
    state.strategies.push({
      id: strategyId,
      name: '직접 진입 듀얼 모멘텀',
      code: '069500',
      fast: 5,
      slow: 20,
      qty: 1,
      active: false,
      lastSignal: 'hold',
      lastTick: -1,
      environment: 'kis-paper',
      revision: 1,
      rule: {
        kind: 'dual_momentum',
        assets: ['069500', '005930'],
        safeAsset: '00088K',
        lookbackDays: 40,
        rebalanceDays: 15,
      },
    });
  });

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4345]);
  await new Promise<void>(resolve => server.listen(4345, '127.0.0.1', resolve));

  await page.route('**/api/**', async route => {
    const response = await route.fetch({ url: route.request().url().replace(':4314', ':4345') });
    await route.fulfill({ response });
  });

  try {
    // location.state 없이 URL 쿼리만으로 직접 진입
    await page.goto(`/backtest?source=stored&strategyId=${encodeURIComponent(strategyId)}`);
    await waitWorkbenchReady(page);

    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('dual_momentum');
    await expect(page.getByLabel('위험 자산 1', { exact: true })).toHaveValue('069500');
    await expect(page.getByLabel('위험 자산 2', { exact: true })).toHaveValue('005930');
    await expect(page.getByLabel('안전자산 종목코드 (선택 · 비우면 현금 보유)')).toHaveValue('00088K');
    await expect(page.getByLabel('모멘텀 관측 기간 (봉)')).toHaveValue('40');
    await expect(page.getByLabel('리밸런싱 주기 (봉)')).toHaveValue('15');
    await expect(page.getByLabel('069500 일봉 수집 기록')).toHaveValue(runA.run.id);
    await expect(page.getByLabel('005930 일봉 수집 기록')).toHaveValue(runB.run.id);
    await expect(page.getByLabel('00088K 일봉 수집 기록')).toHaveValue(runSafe.run.id);

    // 1회 복원 가드 확인: 사용자가 관측 기간을 55로 수정하고 출처 탭을 왕복해도 40으로 되돌아가지 않음
    await page.getByLabel('모멘텀 관측 기간 (봉)').fill('55');
    const sourceSelect = page.getByLabel('데이터 출처');
    await sourceSelect.selectOption('demo');
    await expect(page.getByLabel('모멘텀 관측 기간 (봉)')).toHaveValue('55');
    await sourceSelect.selectOption('stored');
    await expect(page.getByLabel('모멘텀 관측 기간 (봉)')).toHaveValue('55');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('4A-2 2차 보완 Major 1: 단일 종목 005930 선택·수동 날짜 변경 후 DEMO ↔ 저장 일봉 왕복 시 005930 runId·코드·수동 날짜가 그대로 유지된다', async ({
  page,
}) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');

  // 00088K가 먼저(daily.runs[0]), 005930이 두 번째로 저장되도록 구성
  const runFirst = portfolioDailyFixture('00088K', '66666666-1111-4111-8111-111111111111', {
    barCount: 90,
    startedAt: '2026-06-05T01:00:00.000Z',
    priceFn: i => 20000 + i * 50,
  });
  const runSecond = portfolioDailyFixture('005930', '77777777-2222-4222-8222-222222222222', {
    barCount: 90,
    startedAt: '2026-06-01T01:00:00.000Z',
    priceFn: i => 55000 + Math.sin(i / 5) * 3000 + i * 40,
  });
  // store.dailyRuns()는 최신 저장 역순으로 반환하므로 005930 먼저, 00088K를 나중에 저장해 daily.runs[0]이 00088K가 되게 구성
  store.saveDaily(runSecond.run, runSecond.bars);
  store.saveDaily(runFirst.run, runFirst.bars);

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4346]);
  await new Promise<void>(resolve => server.listen(4346, '127.0.0.1', resolve));

  const dailyPayloads: Record<string, unknown>[] = [];
  await page.route('**/api/**', async route => {
    const req = route.request();
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/backtest/daily') {
      dailyPayloads.push(req.postDataJSON() as Record<string, unknown>);
    }
    const response = await route.fetch({ url: req.url().replace(':4314', ':4346') });
    await route.fulfill({ response });
  });

  try {
    await page.goto('/backtest');
    await waitWorkbenchReady(page);
    await expect(page.getByLabel('일봉 수집 기록')).toHaveValue(runFirst.run.id);

    // 두 번째 단일 종목(005930) 선택 후 시작일 수동 수정
    await page.getByLabel('일봉 수집 기록').selectOption(runSecond.run.id);
    await expect(page.getByLabel('일봉 수집 기록')).toHaveValue(runSecond.run.id);

    const customFrom = '2025-02-03';
    await page.locator('input[name="from"]').fill(customFrom);
    await expect(page.locator('input[name="from"]')).toHaveValue(customFrom);

    // DEMO → 저장 일봉 출처 왕복
    const sourceSelect = page.getByLabel('데이터 출처');
    await sourceSelect.selectOption('demo');
    await sourceSelect.selectOption('stored');

    // 복귀 시 005930 runId와 수동 시작일이 그대로 유지되어야 함 (00088K로 바뀌거나 날짜 이식 금지)
    await expect(page.getByLabel('일봉 수집 기록')).toHaveValue(runSecond.run.id);
    await expect(page.locator('input[name="from"]')).toHaveValue(customFrom);

    await page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true }).click();
    await expect(page.getByRole('region', { name: '저장 일봉 실험 결과' })).toBeVisible();

    expect(dailyPayloads).toHaveLength(1);
    expect(dailyPayloads[0].runId).toBe(runSecond.run.id);
    expect(dailyPayloads[0].code).toBe('005930');
    expect(dailyPayloads[0].from).toBe('20250203');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('4A-2 2차 보완 Minor 1: 미등록 strategyId 직접 진입 시 role=alert 경고 및 POST 0건 차단 후 규칙 재선택 시 정상 실행된다', async ({
  page,
}) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');

  const runA = portfolioDailyFixture('005930', '88888888-1111-4111-8111-111111111111', {
    barCount: 90,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 50000 + Math.sin(i / 4) * 2500 + i * 35,
  });
  store.saveDaily(runA.run, runA.bars);

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4347]);
  await new Promise<void>(resolve => server.listen(4347, '127.0.0.1', resolve));

  const posts: string[] = [];
  await page.route('**/api/**', async route => {
    const req = route.request();
    if (req.method() === 'POST') posts.push(new URL(req.url()).pathname);
    const response = await route.fetch({ url: req.url().replace(':4314', ':4347') });
    await route.fulfill({ response });
  });

  try {
    await page.goto('/backtest?source=stored&strategyId=missing-strategy-id');
    await waitWorkbenchReady(page);

    // 1. 미등록 strategyId 경고(role="alert") 표시 확인
    const alert = page.getByRole('main').getByRole('alert').first();
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('요청한 전략을 찾지 못했습니다.');

    // 2. 실행 클릭 시 POST 0건 차단 확인
    const runBtn = page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true });
    await expect(runBtn).toBeEnabled();
    await runBtn.click();
    expect(posts).toEqual([]);
    await expect(page.getByRole('main').getByRole('alert').first()).toContainText('요청한 전략을 찾지 못했습니다.');

    // 3. 사용자가 명시적으로 규칙을 다시 선택한 뒤 차단 해제 및 정상 실행 확인
    await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('macd_momentum');
    await expect(page).not.toHaveURL(/strategyId=/);
    await expect(page.getByRole('main')).not.toContainText('요청한 전략을 찾지 못했습니다.');

    await runBtn.click();
    await expect(page.getByRole('region', { name: '저장 일봉 실험 결과' })).toBeVisible();
    expect(posts).toEqual(['/api/backtest/daily']);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('4A-2 3차 보완 Major 1: /api/state가 /api/data/daily보다 늦게 응답해도 단일 종목 strategyId(005930) 직접 진입 시 005930 runId로 동기화되어 실행된다', async ({
  page,
}) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');

  // store.dailyRuns()는 최신 저장 역순이므로 005930 먼저, 00088K를 나중에 저장해 daily.runs[0] = 00088K, daily.runs[1] = 005930 구성
  const runSamsung = portfolioDailyFixture('005930', '99999999-2222-4222-8222-222222222222', {
    barCount: 90,
    startedAt: '2026-06-01T01:00:00.000Z',
    priceFn: i => 55000 + Math.sin(i / 4) * 3000 + i * 40,
  });
  const runDefault = portfolioDailyFixture('00088K', '99999999-1111-4111-8111-111111111111', {
    barCount: 90,
    startedAt: '2026-06-05T01:00:00.000Z',
    priceFn: i => 20000 + i * 40,
  });
  store.saveDaily(runSamsung.run, runSamsung.bars);
  store.saveDaily(runDefault.run, runDefault.bars);

  const strategyId = 'delayed-single-samsung-strategy';
  store.update(state => {
    state.strategies.push({
      id: strategyId,
      name: '삼성전자 MACD 직접 진입',
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
        kind: 'macd_momentum',
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        requireZeroLineAbove: false,
      },
    });
  });

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4348]);
  await new Promise<void>(resolve => server.listen(4348, '127.0.0.1', resolve));

  let dailyResolved = false;
  let releaseState = () => {};
  const dailyDone = new Promise<void>(resolve => {
    releaseState = resolve;
  });
  const dailyPayloads: Record<string, unknown>[] = [];
  await page.route('**/api/**', async route => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;
    if (req.method() === 'POST' && pathname === '/api/backtest/daily') {
      dailyPayloads.push(req.postDataJSON() as Record<string, unknown>);
    }
    if (req.method() === 'GET' && pathname === '/api/state' && !dailyResolved) {
      await dailyDone;
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    const response = await route.fetch({ url: req.url().replace(':4314', ':4348') });
    await route.fulfill({ response });
    if (req.method() === 'GET' && pathname === '/api/data/daily' && !dailyResolved) {
      dailyResolved = true;
      releaseState?.();
    }
  });

  try {
    await page.goto(`/backtest?source=stored&strategyId=${encodeURIComponent(strategyId)}`);
    await waitWorkbenchReady(page);

    // /api/state 지연 도착 후에도 00088K 기본 폴백에 고정되지 않고 005930 runId와 macd_momentum으로 동기화됨
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('macd_momentum');
    await expect(page.getByLabel('일봉 수집 기록')).toHaveValue(runSamsung.run.id);

    await page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true }).click();
    await expect(page.getByRole('region', { name: '저장 일봉 실험 결과' })).toBeVisible();

    expect(dailyPayloads).toHaveLength(1);
    expect(dailyPayloads[0].runId).toBe(runSamsung.run.id);
    expect(dailyPayloads[0].code).toBe('005930');
  } finally {
    releaseState?.();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('4A-2 3차 보완 Minor 1: 전략 카드 클릭 후 삭제된 strategyId를 새로고침하면 location.state가 남아도 role=alert 경고 및 POST 0건 차단한다', async ({
  page,
}) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');

  const runA = portfolioDailyFixture('005930', 'aaaaaaaa-9999-4999-8999-999999999999', {
    barCount: 90,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 52000 + Math.sin(i / 4) * 2000 + i * 30,
  });
  store.saveDaily(runA.run, runA.bars);

  const strategyId = 'card-then-deleted-strategy';
  store.update(state => {
    state.strategies.push({
      id: strategyId,
      name: '삭제 예정 카드 전략',
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
        kind: 'macd_momentum',
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        requireZeroLineAbove: false,
      },
    });
  });

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4349]);
  await new Promise<void>(resolve => server.listen(4349, '127.0.0.1', resolve));

  let hideStrategy = false;
  const posts: string[] = [];
  await page.route('**/api/**', async route => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;
    if (req.method() === 'POST') posts.push(pathname);
    const response = await route.fetch({ url: req.url().replace(':4314', ':4349') });
    if (req.method() === 'GET' && pathname === '/api/state' && hideStrategy) {
      const json = (await response.json()) as { strategies: { id: string }[] };
      json.strategies = json.strategies.filter(item => item.id !== strategyId);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
      return;
    }
    await route.fulfill({ response });
  });

  try {
    // 1. 전략 카드에서 '이 설정으로 백테스트' 클릭 → location.state + ?strategyId=... 함께 진입
    await page.goto('/strategies?environment=kis-paper');
    await waitWorkbenchReady(page);
    const card = page.locator('.studio-card').filter({
      has: page.getByRole('heading', { name: '삭제 예정 카드 전략', exact: true }),
    });
    await expect(card).toBeVisible();
    await card.getByRole('link', { name: '이 설정으로 백테스트', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/backtest\\?source=stored&strategyId=${strategyId}`));
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('macd_momentum');

    // 2. 서버 상태에서 해당 전략 삭제 후 새로고침 (History의 location.state.strategyDraft는 유지됨)
    hideStrategy = true;
    await page.reload();
    await waitWorkbenchReady(page);

    // 3. role="alert" 경고 표시 및 실행 클릭 시 POST 0건 차단 확인
    const alert = page.getByRole('main').getByRole('alert').first();
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('요청한 전략을 찾지 못했습니다.');

    const runBtn = page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true });
    await expect(runBtn).toBeEnabled();
    await runBtn.click();
    expect(posts).toEqual([]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('4B-2: 15종 전략 선택·15/16 프리셋·입력 범위 검증(role=alert+포커스)·17카드 도움말(원안 변형 고지)·390px 모바일 무넘침 검증', async ({
  page,
}) => {
  const posts: string[] = [];
  page.on('request', req => {
    if (req.method() === 'POST') posts.push(new URL(req.url()).pathname);
  });

  for (const route of ['/strategies', '/backtest']) {
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(route);
    await waitWorkbenchReady(page);

    const ruleSelect = page.getByRole('combobox', { name: '전략 규칙', exact: true });
    const options = await ruleSelect.locator('option').evaluateAll(els => els.map(el => (el as HTMLOptionElement).value));
    expect(options).toHaveLength(16);
    expect(options).toEqual(
      expect.arrayContaining(['dual_momentum', 'faber_gtaa', 'krx_sector_rs', 'clenow_momentum', 'price_regime']),
    );
    await expect(page.getByText('16종 전략 지원 · 저장 일봉 16종(다종목 5종 포함) / DEMO 종가 전용 4종')).toBeVisible();

    // 15 KRX 섹터 상대강도 프리셋(보수적/기본/공격적) 및 최소 준비 봉 확인
    await ruleSelect.selectOption('krx_sector_rs');
    await expect(page.getByLabel('상대강도 관측 기간 (봉)')).toHaveValue('20');
    await expect(page.getByLabel('상위 선정 종목 수 (K)')).toHaveValue('2');
    await expect(page.getByLabel('종목당 최대 비중 상한 (%)')).toHaveValue('50');
    await expect(page.getByLabel('리밸런싱 주기 (봉)')).toHaveValue('20');
    await expect(page.getByText('최소 준비 봉: 22봉 (판정 21봉 + 다음 봉 시가 체결 1봉)')).toBeVisible();

    await page.getByRole('button', { name: '보수적', exact: true }).click();
    await expect(page.getByLabel('상대강도 관측 기간 (봉)')).toHaveValue('60');
    await expect(page.getByLabel('종목당 최대 비중 상한 (%)')).toHaveValue('40');
    await expect(page.getByText('최소 준비 봉: 62봉 (판정 61봉 + 다음 봉 시가 체결 1봉)')).toBeVisible();

    await page.getByRole('button', { name: '공격적', exact: true }).click();
    await expect(page.getByLabel('상대강도 관측 기간 (봉)')).toHaveValue('10');
    await expect(page.getByLabel('상위 선정 종목 수 (K)')).toHaveValue('3');
    await expect(page.getByLabel('종목당 최대 비중 상한 (%)')).toHaveValue('60');
    await expect(page.getByLabel('리밸런싱 주기 (봉)')).toHaveValue('10');
    await expect(page.getByText('최소 준비 봉: 12봉 (판정 11봉 + 다음 봉 시가 체결 1봉)')).toBeVisible();

    // 16 클레노우 회귀 모멘텀 프리셋(보수적/기본/공격적) 및 최소 준비 봉 확인
    await ruleSelect.selectOption('clenow_momentum');
    await expect(page.getByLabel('회귀 모멘텀 기간 (봉)')).toHaveValue('90');
    await expect(page.getByLabel('Wilder ATR 기간 (봉)')).toHaveValue('20');
    await expect(page.getByLabel('종목 추세 SMA 기간 (봉)')).toHaveValue('100');
    await expect(page.getByLabel('상위 선정 종목 수 (K)')).toHaveValue('2');
    await expect(page.getByLabel('종목당 위험예산 (bp)')).toHaveValue('20');
    await expect(page.getByLabel('리밸런싱 주기 (봉)')).toHaveValue('20');
    await expect(page.getByText('최소 준비 봉: 101봉 (판정 100봉 + 다음 봉 시가 체결 1봉)')).toBeVisible();

    await page.getByRole('button', { name: '보수적', exact: true }).click();
    await expect(page.getByLabel('회귀 모멘텀 기간 (봉)')).toHaveValue('120');
    await expect(page.getByLabel('종목 추세 SMA 기간 (봉)')).toHaveValue('200');
    await expect(page.getByLabel('종목당 위험예산 (bp)')).toHaveValue('10');
    await expect(page.getByText('최소 준비 봉: 201봉 (판정 200봉 + 다음 봉 시가 체결 1봉)')).toBeVisible();

    await page.getByRole('button', { name: '공격적', exact: true }).click();
    await expect(page.getByLabel('회귀 모멘텀 기간 (봉)')).toHaveValue('60');
    await expect(page.getByLabel('Wilder ATR 기간 (봉)')).toHaveValue('14');
    await expect(page.getByLabel('종목 추세 SMA 기간 (봉)')).toHaveValue('60');
    await expect(page.getByLabel('상위 선정 종목 수 (K)')).toHaveValue('3');
    await expect(page.getByLabel('종목당 위험예산 (bp)')).toHaveValue('35');
    await expect(page.getByText('최소 준비 봉: 61봉 (판정 60봉 + 다음 봉 시가 체결 1봉)')).toBeVisible();

    // 18카드 도움말 사전 및 원안 대비 변형 범위 고지 검증
    const helpBtn = page.getByRole('button', { name: '사용방법 도움말', exact: true });
    await expect(helpBtn).toHaveAttribute('aria-expanded', 'false');
    await expect(helpBtn).not.toHaveAttribute('aria-controls');
    await helpBtn.click();
    await expect(helpBtn).toHaveAttribute('aria-expanded', 'true');
    const helpRegion = page.getByRole('region', { name: '전략 스튜디오 및 백테스트 사용방법 도움말' });
    await expect(helpRegion.locator('[role="tabpanel"]')).toHaveCount(4);
    await helpRegion.getByRole('tab', { name: '전략·입력 항목 사전', exact: true }).click();

    const dictPanel = helpRegion.locator('[role="tabpanel"]:not([hidden])');
    const cards = dictPanel.locator('article.research-help-card');
    await expect(cards).toHaveCount(18);

    const rsCard = cards.filter({ has: page.locator('code', { hasText: /^krx_sector_rs$/ }) });
    await expect(rsCard).toHaveCount(1);
    await expect(rsCard).toContainText('15 KRX 섹터 상대강도');
    await expect(rsCard).toContainText('동일 시점 섹터·ETF 구성비·중복 섹터 합산·섹터 잔여 한도는 미구현');
    await expect(rsCard).toContainText('선정 위험자산별 상한(safeAsset 미적용)');

    const clenowCard = cards.filter({ has: page.locator('code', { hasText: /^clenow_momentum$/ }) });
    await expect(clenowCard).toHaveCount(1);
    await expect(clenowCard).toContainText('16 클레노우 회귀 모멘텀');
    await expect(clenowCard).toContainText('별도 시장 지수 200일 레짐과 고정 종목 100일 조건을 종목별 설정 SMA(regimeSmaPeriod) 초과');
    await expect(clenowCard).toContainText('252βR²');
    await expect(clenowCard).toContainText('대체 비중(1/K)은 ATR 위험예산을 보장하지 않으며');
    await expect(clenowCard).toContainText('조회 시작일 첫 봉부터 평활');

    // 문맥 가이드 전환 확인
    const helpDetails = page.locator('details.rule-field-help');
    await helpDetails.locator('summary').click();
    await expect(helpDetails.locator('summary')).toHaveText('현재 선택한 규칙(클레노우 회귀 모멘텀) 입력 항목 설명 보기');
    await ruleSelect.selectOption('krx_sector_rs');
    await expect(helpDetails.locator('summary')).toHaveText('현재 선택한 규칙(KRX 섹터 상대강도) 입력 항목 설명 보기');

    // 390px 모바일 무넘침 확인
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(390);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
  }

  // /strategies에서 15·16 입력 범위/비정수 검증 (role="alert" + 포커스 이동 + POST 0건)
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/strategies?environment=kis-paper');
  await waitWorkbenchReady(page);
  const ruleSelect = page.getByRole('combobox', { name: '전략 규칙', exact: true });
  const saveBtn = page.getByRole('button', { name: '전략 저장', exact: true });

  await ruleSelect.selectOption('krx_sector_rs');
  const rsLookback = page.getByLabel('상대강도 관측 기간 (봉)');
  await rsLookback.fill('5');
  await saveBtn.click();
  await expect(page.getByRole('alert')).toContainText('상대강도 관측 기간은 10-120 사이의 정수로 입력하세요.');
  await expect(rsLookback).toBeFocused();

  await rsLookback.fill('20');
  const rsCap = page.getByLabel('종목당 최대 비중 상한 (%)');
  await rsCap.fill('15');
  await saveBtn.click();
  await expect(page.getByRole('alert')).toContainText('종목당 최대 비중 상한은 20-100 사이의 정수로 입력하세요.');
  await expect(rsCap).toBeFocused();

  await ruleSelect.selectOption('clenow_momentum');
  const atrInput = page.getByLabel('Wilder ATR 기간 (봉)');
  await atrInput.fill('20.5');
  await saveBtn.click();
  await expect(page.getByRole('alert')).toContainText('Wilder ATR 기간은 10-60 사이의 정수로 입력하세요.');
  await expect(atrInput).toBeFocused();

  await atrInput.fill('20');
  const riskInput = page.getByLabel('종목당 위험예산 (bp)');
  await riskInput.fill('150');
  await saveBtn.click();
  await expect(page.getByRole('alert')).toContainText('종목당 위험예산은 5-100 사이의 정수로 입력하세요.');
  await expect(riskInput).toBeFocused();

  expect(posts).toEqual([]);
});

test('4B-2: 43거래일 환경에서 16 기본 준비 봉 부족 경고·오류, 15 기본·16 커스텀 실행·리밸런싱·무신호 0건 안내·재현·전략 왕복(?strategyId=) 검증', async ({
  page,
}) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');

  // 43거래일 동일 달력 fixture: 상승 위험자산 2종 + 안전자산 1종 + 하락 위험자산 2종(무신호 0건 검증)
  const runA = portfolioDailyFixture('069500', '15151515-1111-4111-8111-111111111111', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 30000 + i * 260,
  });
  const runB = portfolioDailyFixture('005930', '15151515-2222-4222-8222-222222222222', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 50000 + i * 180,
  });
  const runSafe = portfolioDailyFixture('00088K', '15151515-3333-4333-8333-333333333333', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 20000 + i * 10,
  });
  const runFallA = portfolioDailyFixture('114800', '15151515-4444-4444-8444-444444444444', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 40000 - i * 350,
  });
  const runFallB = portfolioDailyFixture('122630', '15151515-5555-4555-8555-555555555555', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 35000 - i * 280,
  });
  for (const fx of [runA, runB, runSafe, runFallA, runFallB]) store.saveDaily(fx.run, fx.bars);
  store.saveMasters([
    {
      exchange: 'KOSPI',
      source: 'fixture',
      collectedAt: '2026-06-02T01:00:00.000Z',
      sha256: 'b'.repeat(64),
      rows: [
        { code: '069500', name: 'KODEX 200', exchange: 'KOSPI', kind: 'etf', isin: 'KR7069500007', group: 'EF', tradingHalted: false, liquidation: false },
        { code: '005930', name: '삼성전자', exchange: 'KOSPI', kind: 'stock', isin: 'KR7005930003', group: 'ST', tradingHalted: false, liquidation: false },
        { code: '00088K', name: '채권ETF', exchange: 'KOSPI', kind: 'etf', isin: 'KR700088K001', group: 'EF', tradingHalted: false, liquidation: false },
      ],
    },
  ]);

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4351]);
  await new Promise<void>(resolve => server.listen(4351, '127.0.0.1', resolve));

  await page.route('**/api/**', async route => {
    const response = await route.fetch({ url: route.request().url().replace(':4314', ':4351') });
    await route.fulfill({ response });
  });

  try {
    await page.goto('/backtest');
    await waitWorkbenchReady(page);
    const ruleSelect = page.getByRole('combobox', { name: '전략 규칙', exact: true });
    const runBtn = page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true });
    const result = page.getByRole('region', { name: '저장 일봉 실험 결과' });

    // 1. 43거래일 환경에서 16 기본 프리셋(101봉 필요) 선택 → 준비 봉 부족 경고 표시 및 실행 시 부족 오류 확인
    await ruleSelect.selectOption('clenow_momentum');
    await expect(page.getByText('보유 공통 거래일 43봉 / 현재 규칙 최소 필요 101봉')).toBeVisible();
    await expect(
      page.getByText(
        '준비 봉 부족 · 선택 기간 공통 거래일(43봉)이 현재 규칙의 최소 필요 봉 수(101봉 = 판정 100봉 + 다음 봉 시가 체결 1봉)보다 부족합니다.',
      ),
    ).toBeVisible();
    await runBtn.click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('최소 101봉이 필요합니다.');

    // 2. 15 KRX 섹터 상대강도 기본 프리셋(22봉 필요) 실행 성공 → 리밸런싱 내역·재현 일치 확인
    await ruleSelect.selectOption('krx_sector_rs');
    await page.getByLabel('안전자산 종목코드 (선택 · 비우면 현금 보유)').fill('00088K');
    await expect(page.getByText('보유 공통 거래일 43봉 / 현재 규칙 최소 필요 22봉')).toBeVisible();
    await expect(page.getByText('준비 봉 부족')).toHaveCount(0);

    await runBtn.click();
    await expect(result).toBeVisible();
    await expect(result.getByRole('heading', { name: '리밸런싱 내역', exact: true })).toBeVisible();
    await expect(result).toContainText('상대강도 상위');
    await expect(result).toContainText('(한도 50%)');
    await result.getByRole('button', { name: '고정 입력으로 재현 검증', exact: true }).click();
    await expect(result).toContainText('재현 일치');

    // 3. 16 클레노우 회귀 모멘텀 저기간 커스텀(회귀 20·ATR 10·추세 SMA 20 → 21봉 필요) 실행 → 리밸런싱·재현·전략 저장·?strategyId= 복원 확인
    await ruleSelect.selectOption('clenow_momentum');
    await page.getByLabel('회귀 모멘텀 기간 (봉)').fill('20');
    await page.getByLabel('Wilder ATR 기간 (봉)').fill('10');
    await page.getByLabel('종목 추세 SMA 기간 (봉)').fill('20');
    await page.getByLabel('리밸런싱 주기 (봉)').fill('10');
    await expect(page.getByText('보유 공통 거래일 43봉 / 현재 규칙 최소 필요 21봉')).toBeVisible();
    await expect(page.getByText('준비 봉 부족')).toHaveCount(0);

    await runBtn.click();
    await expect(result).toBeVisible();
    await expect(result).toContainText('회귀 모멘텀 상위');
    await expect(result).toContainText('(ATR 역가중)');
    await result.getByRole('button', { name: '고정 입력으로 재현 검증', exact: true }).click();
    await expect(result).toContainText('재현 일치');

    await result.getByRole('button', { name: '이 설정으로 전략 만들기', exact: true }).click();
    await expect(page).toHaveURL(/\/strategies#strategy-editor$/);
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('clenow_momentum');
    await expect(page.getByLabel('회귀 모멘텀 기간 (봉)')).toHaveValue('20');
    await expect(page.getByLabel('Wilder ATR 기간 (봉)')).toHaveValue('10');
    await expect(page.getByLabel('종목 추세 SMA 기간 (봉)')).toHaveValue('20');

    await page.getByLabel('전략 환경').selectOption('kis-paper');
    await page.getByLabel('전략 이름').fill('KIS 클레노우 43봉 검증');
    await page.getByRole('button', { name: '전략 저장', exact: true }).click();

    const savedCard = page.locator('.studio-card').filter({
      has: page.getByRole('heading', { name: 'KIS 클레노우 43봉 검증', exact: true }),
    });
    await expect(savedCard).toBeVisible();
    await expect(savedCard).toContainText('저장 일봉: 다종목 자산배분 (v3)');
    await expect(savedCard).toContainText('회귀 20봉');
    await expect(savedCard).toContainText('ATR 10봉');
    await expect(savedCard).toContainText('추세 SMA 20봉');
    await expect(savedCard).toContainText('069500 / 005930');
    await expect(savedCard).toContainText('00088K');
    await expect(savedCard).toContainText(portfolioOnly);
    await expect(savedCard.getByRole('button', { name: '전략 시작', exact: true })).toBeDisabled();

    // location.state 없이 ?strategyId= 직접 진입 복원 확인
    const href = await savedCard.getByRole('link', { name: '이 설정으로 백테스트', exact: true }).getAttribute('href');
    expect(href).toMatch(/\/backtest\?source=stored&strategyId=/);
    await page.goto(href!);
    await waitWorkbenchReady(page);
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('clenow_momentum');
    await expect(page.getByLabel('회귀 모멘텀 기간 (봉)')).toHaveValue('20');
    await expect(page.getByLabel('Wilder ATR 기간 (봉)')).toHaveValue('10');
    await expect(page.getByLabel('종목 추세 SMA 기간 (봉)')).toHaveValue('20');
    await expect(page.getByLabel('안전자산 종목코드 (선택 · 비우면 현금 보유)')).toHaveValue('00088K');

    // 4. 하락장 무신호(rebalances > 0, trades === 0) 시 준비 봉 충족 구분 안내 확인
    await ruleSelect.selectOption('krx_sector_rs');
    await page.getByLabel('위험 자산 1', { exact: true }).fill('114800');
    await page.getByLabel('위험 자산 2', { exact: true }).fill('122630');
    await page.getByLabel('안전자산 종목코드 (선택 · 비우면 현금 보유)').fill('');
    await runBtn.click();
    await expect(result).toBeVisible();
    await expect(result).toContainText('양의 상대강도·고점 유지 자산 없음');
    await expect(result).toContainText('체결 횟수');
    await expect(result).toContainText('0회');
    await expect(result).toContainText(
      '준비 봉 충족 · 리밸런싱 판정 완료 (적격 위험 자산 없음으로 현금/안전자산 유지)',
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('4B-2: TradingSettings는 15(krx_sector_rs)·16(clenow_momentum) 1-3단계 직접 URL 진입을 portfolioOnly로 전면 차단하고 실제 요약·초안을 전달한다', async ({
  page,
}) => {
  const state = snapshot();
  state.strategies = [
    {
      id: 'kis-krx-sector-rs',
      name: 'KIS KRX 섹터 상대강도',
      code: '069500',
      fast: 5,
      slow: 20,
      qty: 1,
      active: false,
      lastSignal: 'hold',
      lastTick: -1,
      environment: 'kis-paper',
      revision: 1,
      rule: {
        kind: 'krx_sector_rs',
        assets: ['069500', '005930'],
        safeAsset: '00088K',
        rsLookbackDays: 20,
        topK: 2,
        maxWeightPct: 50,
        rebalanceDays: 20,
      },
    },
    {
      id: 'kis-clenow-momentum',
      name: 'KIS 클레노우 회귀 모멘텀',
      code: '069500',
      fast: 5,
      slow: 20,
      qty: 2,
      active: false,
      lastSignal: 'hold',
      lastTick: -1,
      environment: 'kis-paper',
      revision: 1,
      rule: {
        kind: 'clenow_momentum',
        assets: ['069500', '005930'],
        safeAsset: null,
        regressionDays: 90,
        atrPeriod: 20,
        regimeSmaPeriod: 100,
        topK: 2,
        riskPerAssetBps: 20,
        rebalanceDays: 20,
      },
    },
  ];

  const posts: string[] = [];
  page.on('request', req => {
    if (req.method() === 'POST') posts.push(new URL(req.url()).pathname);
  });

  let activeDraftStrategyId = 'kis-krx-sector-rs';
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
              id: 'draft-rotation-blocked',
              runId: 'run-rotation-blocked',
              fixed: false,
              symbol: target.code,
              fast: target.fast,
              slow: target.slow,
              qty: target.qty,
              rule: target.rule,
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

  const rsSummary = 'KRX 섹터 상대강도 (관측 20봉 · 상위 2종 · 한도 50% · 리밸런싱 20봉 · 위험 069500/005930 · 안전 00088K)';
  for (const [step, btnName] of [
    [1, '한도·조건으로'],
    [2, '초안 저장 및 검토'],
    [3, '다음 실행 고정'],
  ] as const) {
    await page.goto(`/settings/trading/strategy/${step}?strategy=kis-krx-sector-rs`);
    await waitWorkbenchReady(page);
    await expect(page.getByRole('main')).toContainText(rsSummary);
    await expect(page.getByRole('main')).toContainText(portfolioOnly);
    await expect(page.getByRole('main')).not.toContainText('5/20 교차');
    await expect(page.getByRole('button', { name: btnName, exact: true })).toBeDisabled();
  }

  activeDraftStrategyId = 'kis-clenow-momentum';
  const clenowSummary =
    '클레노우 회귀 모멘텀 (회귀 90봉 · ATR 20봉 · 추세 SMA 100봉 · 상위 2종 · 위험예산 20bp · 리밸런싱 20봉 · 위험 069500/005930 · 안전 현금)';
  for (const [step, btnName] of [
    [1, '한도·조건으로'],
    [2, '초안 저장 및 검토'],
    [3, '다음 실행 고정'],
  ] as const) {
    await page.goto(`/settings/trading/strategy/${step}?strategy=kis-clenow-momentum`);
    await waitWorkbenchReady(page);
    await expect(page.getByRole('main')).toContainText(clenowSummary);
    await expect(page.getByRole('main')).toContainText(portfolioOnly);
    await expect(page.getByRole('main')).not.toContainText('5/20 교차');
    await expect(page.getByRole('button', { name: btnName, exact: true })).toBeDisabled();
  }

  await page.goto('/settings/trading/strategy/1?strategy=kis-clenow-momentum');
  await waitWorkbenchReady(page);
  await page.getByRole('link', { name: '전략 스튜디오에서 이 설정으로 새 전략 만들기' }).first().click();
  await expect(page).toHaveURL(/\/strategies\?environment=kis-paper#strategy-editor$/);
  await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('clenow_momentum');
  await expect(page.getByLabel('회귀 모멘텀 기간 (봉)')).toHaveValue('90');
  await expect(page.getByLabel('종목 추세 SMA 기간 (봉)')).toHaveValue('100');

  expect(posts).toEqual([]);
});

test('4B-2 보완 Major 1: 다종목 체결 0건 시 무신호·안전자산 1주 미만·위험자산 1주 미만 3분기 문구를 정확히 구분한다', async ({
  page,
}) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');

  // 43거래일 동일 달력: 고가 상승 위험자산 2종(1주 시가 > 120,000원), 하락 위험자산 2종, 고가 안전자산 1종(1주 시가 > 150,000원)
  const runHighA = portfolioDailyFixture('069500', '16161616-1111-4111-8111-111111111111', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 120000 + i * 350,
  });
  const runHighB = portfolioDailyFixture('005930', '16161616-2222-4222-8222-222222222222', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 130000 + i * 300,
  });
  const runFallA = portfolioDailyFixture('114800', '16161616-3333-4333-8333-333333333333', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 40000 - i * 350,
  });
  const runFallB = portfolioDailyFixture('122630', '16161616-4444-4444-8444-444444444444', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 35000 - i * 280,
  });
  const runHighSafe = portfolioDailyFixture('00088K', '16161616-5555-4555-8555-555555555555', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 150000 + i * 50,
  });
  for (const fx of [runHighA, runHighB, runFallA, runFallB, runHighSafe]) store.saveDaily(fx.run, fx.bars);

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4352]);
  await new Promise<void>(resolve => server.listen(4352, '127.0.0.1', resolve));

  await page.route('**/api/**', async route => {
    const response = await route.fetch({ url: route.request().url().replace(':4314', ':4352') });
    await route.fulfill({ response });
  });

  try {
    await page.goto('/backtest');
    await waitWorkbenchReady(page);
    const ruleSelect = page.getByRole('combobox', { name: '전략 규칙', exact: true });
    const runBtn = page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true });
    const result = page.getByRole('region', { name: '저장 일봉 실험 결과' });

    await ruleSelect.selectOption('krx_sector_rs');
    await page.locator('input[name="capital"]').fill('100000');

    // ① 무신호·목표 비중 0 (안전자산 미지정): 적격 위험 자산 없음으로 현금/안전자산 유지
    await page.getByLabel('위험 자산 1', { exact: true }).fill('114800');
    await page.getByLabel('위험 자산 2', { exact: true }).fill('122630');
    await page.getByLabel('안전자산 종목코드 (선택 · 비우면 현금 보유)').fill('');
    await runBtn.click();
    await expect(result).toBeVisible();
    await expect(result).toContainText(
      '준비 봉 충족 · 리밸런싱 판정 완료 (적격 위험 자산 없음으로 현금/안전자산 유지)',
    );
    await expect(result).not.toContainText('1주 시가 미만');

    // ② 무신호·안전자산 100% 배정이나 1주 시가(150,000원+) 미만 예산 체결 0건
    await page.getByLabel('안전자산 종목코드 (선택 · 비우면 현금 보유)').fill('00088K');
    await runBtn.click();
    await expect(result).toBeVisible();
    await expect(result).toContainText(
      '준비 봉 충족 · 리밸런싱 판정 완료 (적격 위험 자산 없음 · 안전자산 배정 예산이 수수료·슬리피지 포함 1주 시가 미만이어서 체결 0건)',
    );
    await expect(result).not.toContainText('현금/안전자산 유지');

    // ③ 상승 바스켓 + maxWeightPct 20% + 초기 자금 100,000원 → 위험 자산 선정(weight>0)되었으나 1주 시가 미만 체결 0건
    await page.getByLabel('위험 자산 1', { exact: true }).fill('069500');
    await page.getByLabel('위험 자산 2', { exact: true }).fill('005930');
    await page.getByLabel('안전자산 종목코드 (선택 · 비우면 현금 보유)').fill('');
    await page.getByLabel('종목당 최대 비중 상한 (%)').fill('20');
    await runBtn.click();
    await expect(result).toBeVisible();
    await expect(result).toContainText('상대강도 상위');
    await expect(result).toContainText(
      '준비 봉 충족 · 리밸런싱 판정 완료 (적격 위험 자산이 선정되었으나 배정 예산이 수수료·슬리피지 포함 1주 시가 미만이어서 체결 0건)',
    );
    await expect(result).not.toContainText('적격 위험 자산 없음');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('4B-2 보완 Minor 1: 선택 구간 내 중간 거래일 1일이 누락된 바스켓은 사전 경고와 함께 POST 0건으로 클라이언트 차단한다', async ({
  page,
}) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');

  const runA = portfolioDailyFixture('069500', '17171717-1111-4111-8111-111111111111', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 30000 + i * 200,
  });
  const runB = portfolioDailyFixture('005930', '17171717-2222-4222-8222-222222222222', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 50000 + i * 150,
  });
  const missingDate = runB.dates[20];
  runB.run.calendar = {
    source: runB.run.calendar!.source,
    dates: runB.run.calendar!.dates.filter(d => d !== missingDate),
  };
  runB.bars = runB.bars.filter(b => b.date !== missingDate);

  store.saveDaily(runA.run, runA.bars);
  store.saveDaily(runB.run, runB.bars);

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4353]);
  await new Promise<void>(resolve => server.listen(4353, '127.0.0.1', resolve));

  const dailyPayloads: unknown[] = [];
  await page.route('**/api/**', async route => {
    const req = route.request();
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/backtest/daily') {
      dailyPayloads.push(req.postDataJSON());
    }
    const response = await route.fetch({ url: req.url().replace(':4314', ':4353') });
    await route.fulfill({ response });
  });

  try {
    await page.goto('/backtest');
    await waitWorkbenchReady(page);
    await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('krx_sector_rs');

    const expectedMsg = `선택 기간 내 바스켓 종목의 거래일 달력이 일치하지 않습니다 (069500 / 005930 · ${missingDate}).`;
    await expect(page.getByText(expectedMsg)).toBeVisible();

    await page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(expectedMsg);
    expect(dailyPayloads).toHaveLength(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('5-2: 18 가격 레짐 프리셋·입력 검증(role=alert+포커스)·18카드 도움말·ArrowRight 탭 이동·08/17 제외 FAQ·390px 모바일 무넘침 검증', async ({
  page,
}) => {
  const posts: string[] = [];
  page.on('request', req => {
    if (req.method() === 'POST') posts.push(new URL(req.url()).pathname);
  });

  for (const route of ['/strategies', '/backtest']) {
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(route);
    await waitWorkbenchReady(page);

    const ruleSelect = page.getByRole('combobox', { name: '전략 규칙', exact: true });
    const options = await ruleSelect.locator('option').evaluateAll(els => els.map(el => (el as HTMLOptionElement).value));
    expect(options).toHaveLength(16);
    expect(options).toContain('price_regime');
    await expect(page.getByText('16종 전략 지원 · 저장 일봉 16종(다종목 5종 포함) / DEMO 종가 전용 4종')).toBeVisible();

    await ruleSelect.selectOption('price_regime');
    await expect(page.getByLabel('위험 자산 1 (레짐 판정 기준 자산)', { exact: true })).toHaveValue('069500');
    await expect(page.getByText('위험 자산 1이 레짐 판정 기준 자산(추세 SMA·실현 연변동성 계산)')).toBeVisible();
    await expect(page.getByLabel('샹들리에 ATR 청산 오버레이 사용')).toBeDisabled();
    await expect(page.getByLabel('20 변동성 패리티 · 목표 변동성 수량 조절 오버레이 (선택)')).toBeDisabled();

    // 기본 / 보수적 / 공격적 프리셋 및 최소 준비 봉 검증
    await expect(page.getByLabel('추세 SMA 기간 (봉)')).toHaveValue('200');
    await expect(page.getByLabel('변동성 관측 기간 (봉)')).toHaveValue('20');
    await expect(page.getByLabel('최대 연변동성 한도 (%)')).toHaveValue('25');
    await expect(page.getByLabel('경계 위험 노출 비중 (%)')).toHaveValue('50');
    await expect(page.getByLabel('리밸런싱 주기 (봉)')).toHaveValue('20');
    await expect(page.getByText('최소 준비 봉: 201봉 (판정 200봉 + 다음 봉 시가 체결 1봉)')).toBeVisible();

    await page.getByRole('button', { name: '보수적', exact: true }).click();
    await expect(page.getByLabel('추세 SMA 기간 (봉)')).toHaveValue('200');
    await expect(page.getByLabel('변동성 관측 기간 (봉)')).toHaveValue('60');
    await expect(page.getByLabel('최대 연변동성 한도 (%)')).toHaveValue('20');
    await expect(page.getByLabel('경계 위험 노출 비중 (%)')).toHaveValue('30');
    await expect(page.getByLabel('리밸런싱 주기 (봉)')).toHaveValue('20');
    await expect(page.getByText('최소 준비 봉: 201봉 (판정 200봉 + 다음 봉 시가 체결 1봉)')).toBeVisible();

    await page.getByRole('button', { name: '공격적', exact: true }).click();
    await expect(page.getByLabel('추세 SMA 기간 (봉)')).toHaveValue('100');
    await expect(page.getByLabel('변동성 관측 기간 (봉)')).toHaveValue('20');
    await expect(page.getByLabel('최대 연변동성 한도 (%)')).toHaveValue('35');
    await expect(page.getByLabel('경계 위험 노출 비중 (%)')).toHaveValue('70');
    await expect(page.getByLabel('리밸런싱 주기 (봉)')).toHaveValue('10');
    await expect(page.getByText('최소 준비 봉: 101봉 (판정 100봉 + 다음 봉 시가 체결 1봉)')).toBeVisible();

    // 도움말 18카드·[원안 대비 변형 범위]·ArrowRight 키보드 4탭 이동·08/17 아키텍처 제외 FAQ 확인
    const helpBtn = page.getByRole('button', { name: '사용방법 도움말', exact: true });
    await expect(helpBtn).toHaveAttribute('aria-expanded', 'false');
    await expect(helpBtn).not.toHaveAttribute('aria-controls');
    await helpBtn.click();
    await expect(helpBtn).toHaveAttribute('aria-expanded', 'true');
    await expect(helpBtn).toHaveAttribute('aria-controls', /.+/);

    const helpRegion = page.getByRole('region', { name: '전략 스튜디오 및 백테스트 사용방법 도움말' });
    const tabs = helpRegion.getByRole('tab');
    await expect(tabs).toHaveCount(4);
    await expect(helpRegion.locator('[role="tabpanel"]')).toHaveCount(4);

    await tabs.nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');

    const dictPanel = helpRegion.locator('[role="tabpanel"]:not([hidden])');
    const cards = dictPanel.locator('article.research-help-card');
    await expect(cards).toHaveCount(18);

    const regimeCard = cards.filter({ has: page.locator('code', { hasText: /^price_regime$/ }) });
    await expect(regimeCard).toHaveCount(1);
    await expect(regimeCard).toContainText('18 가격 레짐 (매크로 대용)');
    await expect(regimeCard).toContainText('[원안 대비 변형 범위]');
    await expect(regimeCard).toContainText('FRED 빈티지');
    await expect(regimeCard).toContainText('중앙은행 발표 시각');
    await expect(regimeCard).toContainText('첫 번째 위험 자산(assets[0])');
    await expect(regimeCard).toContainText('기본 201봉 · 보수적 201봉 · 공격적 101봉');

    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(2)).toBeFocused();
    await expect(helpRegion.locator('[role="tabpanel"]:not([hidden])')).toContainText('18 가격 레짐 (매크로 대용)');

    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(3)).toBeFocused();
    const faqPanel = helpRegion.locator('[role="tabpanel"]:not([hidden])');
    await expect(faqPanel).toContainText(
      'Q. 설계 문서의 20대 전략 중 08 갭·초반 거래량과 17 공시 드리프트·희석 차단 전략은 왜 목록에 없나요?',
    );
    await expect(faqPanel).toContainText('18종 구현(단일 11 · 다종목 5 · 오버레이 2)');
    await expect(faqPanel).toContainText('08 갭·초반 거래량');
    await expect(faqPanel).toContainText('17 공시 드리프트·희석 차단');
    await expect(faqPanel).toContainText('OpenDART');

    // 문맥 가이드 전환 확인
    const helpDetails = page.locator('details.rule-field-help');
    await helpDetails.locator('summary').click();
    await expect(helpDetails.locator('summary')).toHaveText(
      '현재 선택한 규칙(가격 레짐 (매크로 대용)) 입력 항목 설명 보기',
    );
    await expect(helpDetails).toContainText('[원안 대비 변형 범위]');

    // 390px 모바일 가로 넘침 없음 확인
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(390);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
  }

  // /strategies에서 price_regime 5개 필드 정수·범위 검증 (role="alert" + 포커스 + POST 0건)
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/strategies?environment=kis-paper');
  await waitWorkbenchReady(page);
  await page.getByRole('combobox', { name: '전략 규칙', exact: true }).selectOption('price_regime');
  const saveBtn = page.getByRole('button', { name: '전략 저장', exact: true });

  const checks: [string, string, string, string][] = [
    ['추세 SMA 기간 (봉)', '19', '추세 SMA 기간은 20~250 사이의 정수여야 합니다.', '200'],
    ['변동성 관측 기간 (봉)', '10.5', '변동성 관측 기간은 10~60 사이의 정수여야 합니다.', '20'],
    ['최대 연변동성 한도 (%)', '81', '최대 연변동성 한도는 5~80 사이의 정수(%)여야 합니다.', '25'],
    ['경계 위험 노출 비중 (%)', '101', '경계 위험 노출 비중은 0~100 사이의 정수(%)여야 합니다.', '50'],
    ['리밸런싱 주기 (봉)', '4', '리밸런싱 주기는 5~60 사이의 정수여야 합니다.', '20'],
  ];
  for (const [label, bad, message, valid] of checks) {
    const input = page.getByLabel(label);
    await input.fill(bad);
    await saveBtn.click();
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(input).toBeFocused();
    await input.fill(valid);
  }

  expect(posts).toEqual([]);
});

test('5-2: 43거래일 원장에서 18 가격 레짐 프리셋 준비 봉 부족 경고·커스텀 3상태 리밸런싱·재현·API 저장 실험 불러오기→편집기 복원·KIS 모의 저장 차단 검증', async ({
  page,
}) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const { createExperiment } = await import('../../server/backtest.ts');
  const store = new Store(':memory:');

  // 43거래일 동일 달력: 069500(위험 자산 1)이 3상태(위험선호 → 경계 → 위험회피)를 모두 거치도록 구성
  const regimeCloses = [
    ...Array.from({ length: 20 }, (_, i) => 30000 + i * 150),
    31500, 35500, 31500, 36500, 38500,
    33000, 30500, 28000, 26000, 24000,
    ...Array.from({ length: 13 }, (_, i) => 24500 + i * 100),
  ];
  const runA = portfolioDailyFixture('069500', '18181818-1111-4111-8111-111111111111', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => regimeCloses[i],
  });
  const runB = portfolioDailyFixture('005930', '18181818-2222-4222-8222-222222222222', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 50000 + i * 120,
  });
  const runSafe = portfolioDailyFixture('00088K', '18181818-3333-4333-8333-333333333333', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 20000 + i * 10,
  });
  for (const fx of [runA, runB, runSafe]) store.saveDaily(fx.run, fx.bars);
  store.saveMasters([
    {
      exchange: 'KOSPI',
      source: 'fixture',
      collectedAt: '2026-06-02T01:00:00.000Z',
      sha256: 'c'.repeat(64),
      rows: [
        { code: '069500', name: 'KODEX 200', exchange: 'KOSPI', kind: 'etf', isin: 'KR7069500007', group: 'EF', tradingHalted: false, liquidation: false },
        { code: '005930', name: '삼성전자', exchange: 'KOSPI', kind: 'stock', isin: 'KR7005930003', group: 'ST', tradingHalted: false, liquidation: false },
        { code: '00088K', name: '채권ETF', exchange: 'KOSPI', kind: 'etf', isin: 'KR700088K001', group: 'EF', tradingHalted: false, liquidation: false },
      ],
    },
  ]);

  // API로 사전 생성된 price_regime 저장 실험(목록 불러오기 → 편집기 왕복 복원 검증용)
  const apiExperiment = createExperiment(store, {
    runs: [
      { code: '069500', runId: runA.run.id },
      { code: '005930', runId: runB.run.id },
      { code: '00088K', runId: runSafe.run.id },
    ],
    source: 'kis-rest',
    from: runA.dates[0],
    to: runA.dates.at(-1)!,
    adjustment: 'adjusted',
    capital: 10000000,
    feeBps: 1.5,
    slippageBps: 5,
    rule: {
      kind: 'price_regime',
      assets: ['069500', '005930'],
      safeAsset: '00088K',
      trendSmaPeriod: 22,
      volLookback: 12,
      maxAnnualVolPct: 30,
      cautionExposurePct: 40,
      rebalanceDays: 7,
    },
  });

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4354]);
  await new Promise<void>(resolve => server.listen(4354, '127.0.0.1', resolve));

  const strategyPosts: Record<string, unknown>[] = [];
  await page.route('**/api/**', async route => {
    const req = route.request();
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/strategies') {
      strategyPosts.push(req.postDataJSON() as Record<string, unknown>);
    }
    const response = await route.fetch({ url: req.url().replace(':4314', ':4354') });
    await route.fulfill({ response });
  });

  try {
    await page.goto('/backtest');
    await waitWorkbenchReady(page);
    const ruleSelect = page.getByRole('combobox', { name: '전략 규칙', exact: true });
    const runBtn = page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true });
    const result = page.getByRole('region', { name: '저장 일봉 실험 결과' });

    // 1. 43거래일 원장에서 기본(201봉)·보수적(201봉)·공격적(101봉) 프리셋 선택 시 준비 봉 부족 사전 경고 확인
    await ruleSelect.selectOption('price_regime');
    await expect(page.getByText('보유 공통 거래일 43봉 / 현재 규칙 최소 필요 201봉')).toBeVisible();
    await expect(
      page.getByText(
        '준비 봉 부족 · 선택 기간 공통 거래일(43봉)이 현재 규칙의 최소 필요 봉 수(201봉 = 판정 200봉 + 다음 봉 시가 체결 1봉)보다 부족합니다.',
      ),
    ).toBeVisible();

    await page.getByRole('button', { name: '보수적', exact: true }).click();
    await expect(page.getByText('보유 공통 거래일 43봉 / 현재 규칙 최소 필요 201봉')).toBeVisible();
    await expect(page.getByText('준비 봉 부족')).toBeVisible();

    await page.getByRole('button', { name: '공격적', exact: true }).click();
    await expect(page.getByText('보유 공통 거래일 43봉 / 현재 규칙 최소 필요 101봉')).toBeVisible();
    await expect(
      page.getByText(
        '준비 봉 부족 · 선택 기간 공통 거래일(43봉)이 현재 규칙의 최소 필요 봉 수(101봉 = 판정 100봉 + 다음 봉 시가 체결 1봉)보다 부족합니다.',
      ),
    ).toBeVisible();

    // 2. 커스텀 설정(추세 SMA 20 · 변동성 10 · 한도 25% · 경계 50% · 리밸런싱 5봉 → 최소 필요 21봉) 실행·3상태 리밸런싱·재현 일치 확인
    await page.getByLabel('안전자산 종목코드 (선택 · 비우면 현금 보유)').fill('00088K');
    await page.getByLabel('추세 SMA 기간 (봉)').fill('20');
    await page.getByLabel('변동성 관측 기간 (봉)').fill('10');
    await page.getByLabel('최대 연변동성 한도 (%)').fill('25');
    await page.getByLabel('경계 위험 노출 비중 (%)').fill('50');
    await page.getByLabel('리밸런싱 주기 (봉)').fill('5');
    await expect(page.getByText('보유 공통 거래일 43봉 / 현재 규칙 최소 필요 21봉')).toBeVisible();
    await expect(page.getByText('준비 봉 부족')).toHaveCount(0);

    await runBtn.click();
    await expect(result).toBeVisible();
    await expect(result.getByRole('heading', { name: '리밸런싱 내역', exact: true })).toBeVisible();
    await expect(result).toContainText('레짐 위험선호');
    await expect(result).toContainText('레짐 경계');
    await expect(result).toContainText('레짐 위험회피');
    await result.getByRole('button', { name: '고정 입력으로 재현 검증', exact: true }).click();
    await expect(result).toContainText('재현 일치');

    // 3. API로 사전 생성된 저장 실험 불러오기 → 폼 복원 → 전략 스튜디오 편집기 왕복 복원 → KIS 모의 정지 저장 및 시작 비활성화
    const savedSelect = page.getByLabel('저장 실험');
    await savedSelect.selectOption(apiExperiment.id);
    await page.getByRole('button', { name: '저장 실험 불러오기', exact: true }).click();
    await expect(result).toBeVisible();
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('price_regime');
    await expect(page.getByLabel('추세 SMA 기간 (봉)')).toHaveValue('22');
    await expect(page.getByLabel('변동성 관측 기간 (봉)')).toHaveValue('12');
    await expect(page.getByLabel('최대 연변동성 한도 (%)')).toHaveValue('30');
    await expect(page.getByLabel('경계 위험 노출 비중 (%)')).toHaveValue('40');
    await expect(page.getByLabel('리밸런싱 주기 (봉)')).toHaveValue('7');

    await result.getByRole('button', { name: '이 설정으로 전략 만들기', exact: true }).click();
    await expect(page).toHaveURL(/\/strategies#strategy-editor$/);
    await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('price_regime');
    await expect(page.getByLabel('위험 자산 1 (레짐 판정 기준 자산)', { exact: true })).toHaveValue('069500');
    await expect(page.getByLabel('추세 SMA 기간 (봉)')).toHaveValue('22');
    await expect(page.getByLabel('변동성 관측 기간 (봉)')).toHaveValue('12');
    await expect(page.getByLabel('최대 연변동성 한도 (%)')).toHaveValue('30');
    await expect(page.getByLabel('경계 위험 노출 비중 (%)')).toHaveValue('40');
    await expect(page.getByLabel('리밸런싱 주기 (봉)')).toHaveValue('7');
    await expect(page.getByText(apiExperiment.inputHash.slice(0, 8))).toBeVisible();

    // DEMO 저장 차단 확인(POST 0건)
    await page.getByRole('button', { name: '전략 저장', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(portfolioOnly);
    expect(strategyPosts).toHaveLength(0);

    // KIS 모의 정지 저장 및 시작 버튼 비활성화 확인
    await page.getByLabel('전략 환경').selectOption('kis-paper');
    await page.getByLabel('전략 이름').fill('KIS 가격 레짐 43봉 검증');
    await page.getByRole('button', { name: '전략 저장', exact: true }).click();
    expect(strategyPosts).toHaveLength(1);
    expect(strategyPosts[0]).not.toHaveProperty('overlay');

    const savedCard = page.locator('.studio-card').filter({
      has: page.getByRole('heading', { name: 'KIS 가격 레짐 43봉 검증', exact: true }),
    });
    await expect(savedCard).toBeVisible();
    await expect(savedCard).toContainText('저장 일봉: 다종목 자산배분 (v3)');
    await expect(savedCard).toContainText('판정 자산(위험 1) 069500');
    await expect(savedCard).toContainText('추세 SMA 22봉');
    await expect(savedCard).toContainText('변동성 관측 12봉');
    await expect(savedCard).toContainText('연변동성 한도 ≤ 30%');
    await expect(savedCard).toContainText('경계 노출 40%');
    await expect(savedCard).toContainText('리밸런싱 7봉');
    await expect(savedCard).toContainText('069500 / 005930');
    await expect(savedCard).toContainText('00088K');
    await expect(savedCard).toContainText(portfolioOnly);
    await expect(savedCard.getByRole('button', { name: '전략 시작', exact: true })).toBeDisabled();
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});

test('5-2: TradingSettings는 18 가격 레짐(price_regime) 1-3단계 직접 URL 진입을 portfolioOnly로 차단하고 실제 요약·스튜디오 초안을 전달한다', async ({
  page,
}) => {
  const state = snapshot();
  state.strategies = [
    {
      id: 'kis-price-regime',
      name: 'KIS 가격 레짐',
      code: '069500',
      fast: 5,
      slow: 20,
      qty: 1,
      active: false,
      lastSignal: 'hold',
      lastTick: -1,
      environment: 'kis-paper',
      revision: 1,
      rule: {
        kind: 'price_regime',
        assets: ['069500', '005930'],
        safeAsset: '00088K',
        trendSmaPeriod: 200,
        volLookback: 20,
        maxAnnualVolPct: 25,
        cautionExposurePct: 50,
        rebalanceDays: 20,
      },
    },
  ];

  const posts: string[] = [];
  page.on('request', req => {
    if (req.method() === 'POST') posts.push(new URL(req.url()).pathname);
  });

  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/trading-settings', route => {
    const target = state.strategies[0];
    return route.fulfill({
      json: {
        active: null,
        canFix: true,
        plans: {
          strategy: {
            draft: {
              id: 'draft-price-regime-blocked',
              runId: 'run-price-regime-blocked',
              fixed: false,
              symbol: target.code,
              fast: target.fast,
              slow: target.slow,
              qty: target.qty,
              rule: target.rule,
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

  const regimeSummary =
    '가격 레짐 (매크로 대용) (추세 SMA 200봉 · 변동성 관측 20봉 · 연변동성 한도 25% · 경계 50% · 리밸런싱 20봉 · 위험 069500/005930 · 안전 00088K)';
  for (const [step, btnName] of [
    [1, '한도·조건으로'],
    [2, '초안 저장 및 검토'],
    [3, '다음 실행 고정'],
  ] as const) {
    await page.goto(`/settings/trading/strategy/${step}?strategy=kis-price-regime`);
    await waitWorkbenchReady(page);
    await expect(page.getByRole('main')).toContainText(regimeSummary);
    await expect(page.getByRole('main')).toContainText(portfolioOnly);
    await expect(page.getByRole('main')).not.toContainText('5/20 교차');
    await expect(page.getByRole('button', { name: btnName, exact: true })).toBeDisabled();
  }

  await page.goto('/settings/trading/strategy/1?strategy=kis-price-regime');
  await waitWorkbenchReady(page);
  await page.getByRole('link', { name: '전략 스튜디오에서 이 설정으로 새 전략 만들기' }).first().click();
  await expect(page).toHaveURL(/\/strategies\?environment=kis-paper#strategy-editor$/);
  await expect(page.getByRole('combobox', { name: '전략 규칙', exact: true })).toHaveValue('price_regime');
  await expect(page.getByLabel('추세 SMA 기간 (봉)')).toHaveValue('200');
  await expect(page.getByLabel('변동성 관측 기간 (봉)')).toHaveValue('20');
  await expect(page.getByLabel('최대 연변동성 한도 (%)')).toHaveValue('25');
  await expect(page.getByLabel('경계 위험 노출 비중 (%)')).toHaveValue('50');

  expect(posts).toEqual([]);
});

test('5-2 1차 보완: 동일 바스켓 양방향 전환 시 레짐 판정 라벨 즉시 갱신 및 price_regime 체결 0건 문구 정밀 구분', async ({
  page,
}) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const store = new Store(':memory:');

  // 43거래일 동일 달력:
  // - 069500: 고가 변동성 상승(i=19에서 종가 > SMA20, 연변동성 > 25% → 레짐 경계; 1주 시가 > 120,000원)
  // - 114800: 지속 하락(i=19에서 종가 <= SMA20 → 레짐 위험회피)
  // - 005930: 고가 위험자산 2(1주 시가 > 130,000원)
  // - 00088K: 고가 안전자산(1주 시가 > 150,000원)
  const cautionCloses = [
    ...Array.from({ length: 10 }, () => 120000),
    115000, 130000, 118000, 134000, 120000, 138000, 124000, 142000, 128000, 150000,
    ...Array.from({ length: 23 }, (_, i) => 148000 + i * 200),
  ];
  const runCaution = portfolioDailyFixture('069500', '19191919-1111-4111-8111-111111111111', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => cautionCloses[i],
  });
  const runRiskB = portfolioDailyFixture('005930', '19191919-2222-4222-8222-222222222222', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 130000 + i * 200,
  });
  const runRiskOff = portfolioDailyFixture('114800', '19191919-3333-4333-8333-333333333333', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 40000 - i * 350,
  });
  const runHighSafe = portfolioDailyFixture('00088K', '19191919-4444-4444-8444-444444444444', {
    barCount: 43,
    startedAt: '2026-06-02T01:00:00.000Z',
    priceFn: i => 150000 + i * 50,
  });
  for (const fx of [runCaution, runRiskB, runRiskOff, runHighSafe]) store.saveDaily(fx.run, fx.bars);

  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4355]);
  await new Promise<void>(resolve => server.listen(4355, '127.0.0.1', resolve));

  await page.route('**/api/**', async route => {
    const response = await route.fetch({ url: route.request().url().replace(':4314', ':4355') });
    await route.fulfill({ response });
  });

  try {
    await page.goto('/backtest');
    await waitWorkbenchReady(page);
    const ruleSelect = page.getByRole('combobox', { name: '전략 규칙', exact: true });
    const basketRuns = page.getByLabel('바스켓 종목별 일봉 수집 기록');
    const runBtn = page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true });
    const result = page.getByRole('region', { name: '저장 일봉 실험 결과' });

    // Minor 1: 동일 바스켓에서 dual_momentum → price_regime → dual_momentum 양방향 전환 시 레짐 판정 라벨 즉시 갱신
    await ruleSelect.selectOption('dual_momentum');
    await expect(basketRuns).toContainText('위험 자산 1 · 069500');
    await expect(basketRuns).not.toContainText('레짐 판정');

    await ruleSelect.selectOption('price_regime');
    await expect(basketRuns).toContainText('위험 자산 1 (레짐 판정) · 069500');

    await ruleSelect.selectOption('dual_momentum');
    await expect(basketRuns).toContainText('위험 자산 1 · 069500');
    await expect(basketRuns).not.toContainText('레짐 판정');

    // Major 1: price_regime 체결 0건 3분기 + 위험회피/경계 노출 0% 구분 검증
    await ruleSelect.selectOption('price_regime');
    await page.locator('input[name="capital"]').fill('100000');
    await page.getByLabel('추세 SMA 기간 (봉)').fill('20');
    await page.getByLabel('변동성 관측 기간 (봉)').fill('10');
    await page.getByLabel('최대 연변동성 한도 (%)').fill('25');
    await page.getByLabel('리밸런싱 주기 (봉)').fill('25');

    // ① 경계 노출 0% · 안전자산 비움 → 현금 유지
    await page.getByLabel('경계 위험 노출 비중 (%)').fill('0');
    await page.getByLabel('안전자산 종목코드 (선택 · 비우면 현금 보유)').fill('');
    await runBtn.click();
    await expect(result).toBeVisible();
    await expect(result).toContainText('레짐 경계');
    await expect(result).toContainText(
      '준비 봉 충족 · 리밸런싱 판정 완료 (가격 레짐 경계 노출 0% 판정으로 현금 유지)',
    );
    await expect(result).not.toContainText('적격 위험 자산 없음');

    // ② 경계 노출 0% · 고가 안전자산(150,000원+) → 안전자산 1주 시가 미만 체결 0건
    await page.getByLabel('안전자산 종목코드 (선택 · 비우면 현금 보유)').fill('00088K');
    await runBtn.click();
    await expect(result).toBeVisible();
    await expect(result).toContainText(
      '준비 봉 충족 · 리밸런싱 판정 완료 (가격 레짐 경계 노출 0% 판정 · 안전자산 배정 예산이 수수료·슬리피지 포함 1주 시가 미만이어서 체결 0건)',
    );
    await expect(result).not.toContainText('적격 위험 자산 없음');

    // ③ 경계 노출 50% · 고가 위험자산 2종 → 위험 노출 배정되었으나 1주 시가 미만 체결 0건
    await page.getByLabel('경계 위험 노출 비중 (%)').fill('50');
    await page.getByLabel('안전자산 종목코드 (선택 · 비우면 현금 보유)').fill('');
    await runBtn.click();
    await expect(result).toBeVisible();
    await expect(result).toContainText(
      '준비 봉 충족 · 리밸런싱 판정 완료 (가격 레짐 위험 노출이 배정되었으나 배정 예산이 수수료·슬리피지 포함 1주 시가 미만이어서 체결 0건)',
    );
    await expect(result).not.toContainText('적격 위험 자산 없음');

    // ④ 위험회피(하락 종목 114800) · 안전자산 비움 → 위험회피 판정으로 현금 유지
    await page.getByLabel('위험 자산 1 (레짐 판정 기준 자산)', { exact: true }).fill('114800');
    await runBtn.click();
    await expect(result).toBeVisible();
    await expect(result).toContainText('레짐 위험회피');
    await expect(result).toContainText(
      '준비 봉 충족 · 리밸런싱 판정 완료 (가격 레짐 위험회피 판정으로 현금 유지)',
    );
    await expect(result).not.toContainText('적격 위험 자산 없음');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});
