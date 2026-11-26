import { test, expect } from '@playwright/test';
test('KIS 포트폴리오에서 계획 요약과 상세 근거를 따로 확인한다', async ({ page }) => {
  const report = {
    id: 'fixture',
    day: '2026-11-16',
    createdAt: '2026-11-15T23:55:00Z',
    cutoff: '2026-11-15T23:55:00Z',
    cash: 1000000,
    equity: 1000000,
    holdings: [],
    conclusion: '가격과 거래량을 확인했어.',
    exposureComplete: true,
    universe: 3000,
    evaluated: 2000,
    watch: [],
    candidates: [
      {
        code: '005930',
        name: '삼성전자',
        held: 0,
        closes: [69000, 70000],
        asOf: '20261113',
        reference: 70000,
        exit: 65000,
        limit: 80000,
        relativeVolume: 1.4,
      },
    ],
    retainedCash: 920000,
    dailyLoss: 10000,
    news: [],
    gaps: [],
    indicators: [],
    approvedAt: null,
  };
  let approved = false;
  await page.route('**/api/morning', (route) =>
    route.fulfill({
      json: { report: { ...report, approvedAt: approved ? report.createdAt : null }, signals: [] },
    }),
  );
  await page.route('**/api/morning/approve', (route) => {
    approved = true;
    return route.fulfill({ json: { message: '승인됨' } });
  });
  await page.goto('/portfolio');
  const summary = page.getByText('근거와 종목별 매매 조건 보기');
  await expect(summary).toBeVisible();
  await expect(page.getByText('삼성전자 · 005930')).not.toBeVisible();
  await summary.click();
  await expect(page.getByText('삼성전자 · 005930')).toBeVisible();
  await page.getByRole('button', { name: '오늘 모의 운용 승인' }).click();
  await expect(page.getByText('오늘 계획 승인됨')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('장전 브리핑은 AI 요약·반대 근거 인용·수집 실패 경고·후보 매칭·승인 차단을 명확히 분리 표시한다', async ({
  page,
}) => {
  const report = {
    id: 'fixture-briefing',
    day: '2026-11-24',
    createdAt: '2026-11-23T23:55:00Z',
    cutoff: '2026-11-23T23:55:00Z',
    cash: 1000000,
    equity: 1000000,
    holdings: [],
    conclusion: '최근 고점과 거래량을 함께 확인해 보유 종목과 새 후보를 골랐어.',
    exposureComplete: true,
    universe: 3000,
    evaluated: 2000,
    watch: [],
    candidates: [
      {
        code: '005930',
        name: '삼성전자',
        held: 0,
        closes: [69000, 70000],
        asOf: '20261123',
        reference: 70000,
        exit: 65000,
        limit: 80000,
        relativeVolume: 1.8,
      },
    ],
    retainedCash: 920000,
    dailyLoss: 10000,
    news: [],
    gaps: ['장전 마감 후 열람용 보고서 · 당일 승인 불가', 'ETF 구성 종목 중복 비중 미측정'],
    approvalBlocked: true,
    approvalBlockReasons: ['장전 마감 후 열람용 보고서 · 당일 승인 불가'],
    indicators: [],
    approvedAt: null,
    analysis: {
      model: 'claude-opus-5-5',
      takeaway: '연준의 물가 경계와 삼성전자 메모리 출하 확대가 동시에 관측됐어.',
      coverage: {
        attempted: 3,
        collected: 2,
        failed: 1,
        failedPublishers: ['ECB'],
      },
      views: [
        {
          publisher: 'Federal Reserve',
          title: 'Monetary policy statement',
          url: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary.htm',
          publishedAt: '2026-11-23T20:00:00Z',
          finding: '서비스 물가 고착으로 금리 인하 속도가 제한될 수 있어.',
          quote: 'Inflation remains elevated in core services.',
          matchedCodes: [],
        },
      ],
      counter: {
        publisher: 'Samsung Newsroom',
        title: '삼성전자 메모리 공급 확대',
        url: 'https://news.samsung.com/kr/memory-expansion',
        publishedAt: '2026-11-23T21:00:00Z',
        finding: '삼성전자 고대역폭 메모리 출하 확대가 실적 방어 요인이야.',
        quote: 'High bandwidth memory shipments rose sharply in Q4.',
        matchedCodes: ['005930'],
      },
    },
  };
  await page.route('**/api/morning', (route) =>
    route.fulfill({
      json: {
        approval: {
          allowed: false,
          reasons: ['장전 마감 후 열람용 보고서 · 당일 승인 불가'],
        },
        report,
        signals: [],
      },
    }),
  );
  await page.goto('/portfolio');

  // 1) 승인 차단 블록 분리 표시 + 승인 버튼 비노출
  const blockSection = page.getByRole('status', { name: '당일 승인 차단 사유' });
  await expect(blockSection).toBeVisible();
  await expect(blockSection).toContainText('장전 마감 후 열람용 보고서 · 당일 승인 불가');
  await expect(page.getByRole('button', { name: '오늘 모의 운용 승인' })).toHaveCount(0);

  // 2) 서버 규칙 판단 vs AI 공개 원문 브리핑 분리 + 수집 일부 실패 경고 + 반대 근거 인용 대칭 표시
  await expect(page.getByRole('region', { name: '서버 규칙 판단' })).toBeVisible();
  const briefing = page.getByRole('region', { name: 'AI 공개 원문 브리핑' });
  await expect(briefing).toBeVisible();
  await expect(briefing).toContainText('선택 원문 3개 중 2개만 분석');
  await expect(briefing).toContainText('ECB');
  const contrast = page.getByRole('region', { name: '주요 근거와 반대 관점 대비' });
  await expect(contrast).toContainText('“Inflation remains elevated in core services.”');
  await expect(contrast).toContainText('“High bandwidth memory shipments rose sharply in Q4.”');
  await expect(contrast).toContainText('원문 일치 · 삼성전자');

  // 3) 상세 펼침 시 후보별 결정론 근거 연결 표시
  await page.getByText('근거와 종목별 매매 조건 보기').click();
  const candidateEvidence = page.getByRole('region', { name: '삼성전자 관련 공개 원문' });
  await expect(candidateEvidence).toBeVisible();
  await expect(candidateEvidence).toContainText('투자 추천 아님');
  await expect(candidateEvidence).toContainText('High bandwidth memory shipments rose sharply in Q4.');

  // 4) 모바일 390px 가로 넘침 없음
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('승인 후 감시 재개 차단·과거 보고서 경고 보존·전량 실패 집계·동일 출처 대비 제외·안전 URL을 검증한다', async ({
  page,
}) => {
  const baseReport = {
    id: 'fixture-resume',
    day: '2026-11-24',
    createdAt: '2026-11-23T23:55:00Z',
    cutoff: '2026-11-23T23:55:00Z',
    cash: 1000000,
    equity: 1000000,
    holdings: [],
    conclusion: '가격과 거래량을 확인했어.',
    exposureComplete: true,
    universe: 3000,
    evaluated: 2000,
    watch: [],
    candidates: [],
    retainedCash: 1000000,
    dailyLoss: 10000,
    news: [{ publisher: '주의', title: '위험 스킴 테스트', url: 'javascript:alert(1)', publishedAt: '2026-11-23T20:00:00Z' }],
    gaps: ['장전 마감 후 열람용 보고서 · 당일 승인 불가'],
    indicators: [],
    approvedAt: '2026-11-23T23:56:00Z',
    analysisCoverage: { attempted: 2, collected: 0, failed: 2, failedPublishers: ['미국 연준', '유럽중앙은행'] },
  };
  const pastReport = {
    ...baseReport,
    id: 'fixture-past',
    day: '2026-11-23',
    approvedAt: null,
    analysisCoverage: undefined,
    candidates: [
      {
        code: '005930',
        name: '삼성전자',
        held: 0,
        closes: [69000, 70000],
        asOf: '20261122',
        reference: 70000,
        exit: 65000,
        limit: 80000,
        relativeVolume: 1.5,
      },
    ],
    analysis: {
      model: 'claude-opus-5-5',
      takeaway: '과거 동일 기관 저장 보고서',
      views: [
        {
          publisher: '미국 연준',
          url: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary.htm',
          publishedAt: '2026-11-22T20:00:00Z',
          finding: '첫 번째 연준 자료',
          quote: 'Inflation remains elevated.',
        },
      ],
      counter: {
        publisher: '미 연준 연구진',
        url: 'https://www.federalreserve.gov/econres/notes/feds-notes/2026.htm',
        publishedAt: '2026-11-22T21:00:00Z',
        finding: '같은 연준 호스트 연구 자료',
        quote: '삼성전자 메모리 공급과 성장 둔화를 함께 언급했다.',
      },
    },
  };
  await page.route('**/api/morning**', (route) => {
    const url = new URL(route.request().url());
    const day = url.searchParams.get('day');
    if (day === '2026-11-23') {
      return route.fulfill({
        json: { days: ['2026-11-24', '2026-11-23'], report: pastReport, signals: [] },
      });
    }
    return route.fulfill({
      json: {
        days: ['2026-11-24', '2026-11-23'],
        run: { armed: false, buyId: null, subscriptions: 0, phase: 'stopped', session: '2026-11-24' },
        approval: { allowed: false, reasons: ['긴급정지가 켜져 있어 당일 승인을 차단했습니다.'] },
        report: baseReport,
        signals: [],
      },
    });
  });

  await page.goto('/portfolio');
  // 1) 승인 후 감시 재개 차단: 사유 표시 + 재개 버튼 비활성
  const resumeBlock = page.getByRole('status', { name: '감시 재개 차단 사유' });
  await expect(resumeBlock).toBeVisible();
  await expect(resumeBlock).toContainText('긴급정지가 켜져 있어 당일 승인을 차단했습니다.');
  await expect(page.getByRole('button', { name: '승인한 계획 감시 재개' })).toBeDisabled();

  // 2) r.analysis가 없어도 전량 수집 실패(2/0/2) 호스트 경고 표시
  const coverageWarn = page.getByRole('status', { name: '공개 원문 수집 상태' });
  await expect(coverageWarn).toBeVisible();
  await expect(coverageWarn).toContainText('선택 원문 2개 중 0개 수집');
  await expect(coverageWarn).toContainText('유럽중앙은행');

  // 3) javascript: URL은 <a> 링크로 렌더링되지 않음
  await page.getByText('근거와 종목별 매매 조건 보기').click();
  await expect(page.getByText('위험 스킴 테스트')).toBeVisible();
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);

  // 4) 과거 거래일 선택: 상세에서 장후 작성 경고가 소실되지 않고, 동일 기관 구 보고서는 대비 카드 미표시 및 후보/전체 라벨 일치
  await page.getByLabel('보고서 날짜').selectOption('2026-11-23');
  await expect(page.getByRole('region', { name: '주요 근거와 반대 관점 대비' })).toHaveCount(0);
  await page.getByText('근거와 종목별 매매 조건 보기').click();
  await expect(page.getByText('장전 마감 후 열람용 보고서 · 당일 승인 불가')).toBeVisible();
  const pastCandidateEvidence = page.getByRole('region', { name: '삼성전자 관련 공개 원문' });
  await expect(pastCandidateEvidence).toContainText('추가 관점 · 동일 출처');
  await expect(pastCandidateEvidence).not.toContainText('반대 관점');
  await expect(page.getByRole('region', { name: '전체 공개 원문 분석 근거' })).toContainText('추가 관점 · 동일 출처');
});

// 장후 마감 경고·주말 400 차단 테스트용 기본 보고서 픽스처를 생성한다.
function closeWarningFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fixture-close-warning',
    day: '2026-11-24',
    createdAt: '2026-11-23T23:55:00Z',
    cutoff: '2026-11-23T23:55:00Z',
    cash: 1000000,
    equity: 1000000,
    holdings: [],
    conclusion: '가격과 거래량을 확인했어.',
    exposureComplete: true,
    universe: 3000,
    evaluated: 2000,
    watch: [],
    candidates: [
      {
        code: '005930',
        name: '삼성전자',
        held: 0,
        closes: [69000, 70000],
        asOf: '20261123',
        reference: 70000,
        exit: 65000,
        limit: 80000,
        relativeVolume: 1.5,
      },
    ],
    retainedCash: 920000,
    dailyLoss: 10000,
    news: [],
    gaps: [],
    indicators: [],
    approvedAt: '2026-11-23T23:56:00Z',
    ...overrides,
  };
}

test('주말 400 차단 시 오류 원문을 alert로 표시하고 10초 폴링 성공 후에도 유지한다', async ({ page }) => {
  await page.clock.install();
  const weekendMessage = '주말에는 장전 보고서를 생성하지 않습니다. 평일 공휴일은 현재 차단 대상이 아닙니다.';
  let morningReads = 0;
  await page.route('**/api/morning', (route) => {
    morningReads++;
    return route.fulfill({ json: { report: null, signals: [], closeWarning: null } });
  });
  await page.route('**/api/morning/generate', (route) =>
    route.fulfill({ status: 400, json: { error: weekendMessage } }),
  );

  await page.goto('/portfolio');
  const panel = page.locator('.panel', { has: page.getByRole('heading', { name: '오늘의 운용 계획' }) });
  const generateButton = panel.getByRole('button', { name: '운용 계획 보기' });
  await expect(generateButton).toBeEnabled();

  await generateButton.click();
  await expect(panel.getByRole('alert')).toContainText(weekendMessage);
  await expect(panel).not.toContainText('보고서 상태 미확인');
  await expect(panel).toContainText('저장된 계획이 없어. 장전 자료를 모아 보자.');

  const readsBeforePoll = morningReads;
  const pollResponse = page.waitForResponse(
    (res) => res.url().includes('/api/morning') && res.request().method() === 'GET' && res.ok(),
  );
  await page.clock.fastForward(10500);
  await pollResponse;
  expect(morningReads).toBeGreaterThan(readsBeforePoll);

  await expect(panel.getByRole('alert')).toContainText(weekendMessage);
  await expect(panel).not.toContainText('보고서 상태 미확인');
});

test('MISSING_VERIFIED_SESSION 경고 시 자동 마감 호출 없이 장후 결과 확인 버튼을 비활성화한다', async ({
  page,
}) => {
  let closeCalls = 0;
  page.on('request', (req) => {
    if (req.url().includes('/api/morning/close')) closeCalls++;
  });
  await page.route('**/api/morning', (route) =>
    route.fulfill({
      json: {
        report: closeWarningFixture(),
        close: null,
        closeWarning: {
          missing: true,
          reason: 'missing',
          canClose: false,
          reasonCode: 'MISSING_VERIFIED_SESSION',
          reasons: ['장후 마감 기록이 없습니다.', '당일 검증된 거래 세션이 없어 마감할 수 없습니다.'],
        },
        signals: [],
      },
    }),
  );

  await page.goto('/portfolio');
  const warning = page.locator('.morning-close-warn');
  await expect(warning).toBeVisible();
  await expect(warning).toHaveAttribute('id', 'morning-close-warning');
  await expect(warning).toHaveAttribute('role', 'status');
  await expect(warning).toHaveAttribute('aria-label', '장후 마감 상태');
  await expect(warning).not.toHaveClass(/portfolio-warning/);
  await expect(warning).toContainText('장후 마감 누락');
  await expect(warning).toContainText('수동 마감할 수 없습니다.');
  await expect(warning).toContainText('당일 검증된 거래 세션이 없어 마감할 수 없습니다.');

  const closeButton = page.getByRole('button', { name: '장후 결과 확인' });
  await expect(closeButton).toBeVisible();
  await expect(closeButton).toBeDisabled();
  await expect(closeButton).toHaveAttribute('aria-describedby', 'morning-close-warning');
  expect(closeCalls).toBe(0);
});

test('과거 승인일은 장후 마감 경고를 표시하고 미승인 비거래일(11-22)은 경고를 표시하지 않는다', async ({
  page,
}) => {
  const days = ['2026-11-24', '2026-11-23', '2026-11-22'];
  await page.route('**/api/morning**', (route) => {
    const day = new URL(route.request().url()).searchParams.get('day');
    if (day === '2026-11-23') {
      return route.fulfill({
        json: {
          days,
          report: closeWarningFixture({ id: 'fixture-past-approved', day: '2026-11-23' }),
          close: null,
          closeWarning: {
            missing: true,
            reason: 'missing',
            canClose: false,
            reasonCode: 'PAST_TRADING_DAY',
            reasons: ['장후 마감 기록이 없습니다.', '해당 거래일의 수동 마감 기한이 지났습니다.'],
          },
          signals: [],
        },
      });
    }
    if (day === '2026-11-22') {
      return route.fulfill({
        json: {
          days,
          report: closeWarningFixture({ id: 'fixture-sunday-unapproved', day: '2026-11-22', approvedAt: null }),
          close: null,
          closeWarning: null,
          signals: [],
        },
      });
    }
    return route.fulfill({
      json: {
        days,
        report: closeWarningFixture({ id: 'fixture-today', day: '2026-11-24', approvedAt: null }),
        close: null,
        closeWarning: null,
        signals: [],
      },
    });
  });

  await page.goto('/portfolio');
  await page.getByLabel('보고서 날짜').selectOption('2026-11-23');
  const warning = page.getByRole('status', { name: '장후 마감 상태' });
  await expect(warning).toBeVisible();
  await expect(warning).toHaveClass(/morning-close-warn/);
  await expect(warning).toContainText('해당 거래일의 수동 마감 기한이 지났습니다.');

  await page.getByLabel('보고서 날짜').selectOption('2026-11-22');
  await expect(page.getByRole('heading', { name: '2026-11-22 운용 계획' })).toBeVisible();
  await expect(page.locator('.morning-close-warn')).toHaveCount(0);
});

test('canClose가 true이면 수동 마감 후 경고가 해제되고 390px 모바일 가로 넘침과 키보드 포커스가 정상이다', async ({
  page,
}) => {
  let closed = false;
  await page.route('**/api/morning', (route) =>
    route.fulfill({
      json: {
        report: closeWarningFixture({ id: 'fixture-manual-close', day: '2026-11-24' }),
        close: closed
          ? {
              change: 12000,
              contribution: { gross: 15000, estimatedCost: 3000, net: 12000, fills: 1 },
              difference: 5000,
              predictions: [{ code: '005930', reference: 70000, close: 72000 }],
            }
          : null,
        closeWarning: closed
          ? null
          : {
              missing: true,
              reason: 'missing',
              canClose: true,
              reasonCode: 'MISSING_CLOSE',
              reasons: ['장후 마감 기록이 없습니다.'],
            },
        signals: [],
      },
    }),
  );
  await page.route('**/api/morning/close', (route) => {
    closed = true;
    return route.fulfill({ json: { message: '장후 계좌와 보유 유지 결과를 기록했습니다.' } });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/portfolio');

  const warning = page.locator('.morning-close-warn');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('장후 마감이 필요합니다.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );

  const closeButton = page.getByRole('button', { name: '장후 결과 확인' });
  await expect(closeButton).toBeEnabled();
  await expect(closeButton).toHaveAttribute('aria-describedby', 'morning-close-warning');

  const summary = page.getByText('근거와 종목별 매매 조건 보기');
  await summary.focus();
  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByText(/장후 계좌 변동 12,000원/)).toBeVisible();
  await expect(page.locator('.morning-close-warn')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
});
