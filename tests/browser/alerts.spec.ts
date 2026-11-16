import { test, expect } from '@playwright/test';
import { snapshot } from '../snapshot';

test('alerts separate environments and link causes without executing broker requests', async ({ page }) => {
  await page.clock.install(); const state = snapshot();
  state.events = [
    { id: 'paper:1', time: '2026-11-16T07:00:00Z', title: 'KIS 불명 복구 확인', detail: '응답 불명 → 접수 · 미체결', level: 'info', read: false, environment: 'kis-paper', target: 'paper', requestId: 'fdcd2e60-96f6-483b-ac3a-b0fefecf34a8' },
    { id: 'risk', time: '2026-11-16T06:00:00Z', title: '신규 주문 긴급정지', detail: '기접수 주문은 별도 취소', level: 'warning', read: false, environment: 'shared', target: 'risk' },
    { id: 'connection', time: '2026-11-16T05:00:00Z', title: 'KIS 연결 확인 실패', detail: '인증 만료', level: 'error', read: true, environment: 'kis-paper', target: 'settings' },
  ];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  const posts: string[] = []; page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.goto('/alerts');
  await expect(page.locator('.topbar')).toContainText('DEMO / KIS 모의 · 운영 이벤트');
  await expect(page.locator('.event')).toHaveCount(3);
  await expect(page.locator('.event').first()).toContainText('KIS 모의');
  await expect(page.locator('.event').first()).toContainText('fdcd2e60');
  await expect(page.locator('.event').first().getByRole('link', { name: '원인 화면' })).toHaveAttribute('href', '/paper');
  await expect(page.locator('.event').nth(1)).toContainText('공통 위험');
  await page.getByRole('button', { name: '오류', exact: true }).click();
  await expect(page.locator('.event')).toHaveCount(1);
  await expect(page.locator('.event').getByRole('link', { name: '원인 화면' })).toHaveAttribute('href', '/settings');
  const polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await polled;
  await expect(page.locator('.event')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: '원인 화면' }).click(); await expect(page).toHaveURL(/\/settings/); expect(posts).toEqual([]);
});

test('failed read save retains unread events and successful save survives reload', async ({ page }) => {
  await page.goto('/alerts'); await expect(page.locator('.unread-dot').first()).toBeVisible();
  await page.route('**/api/events/read', route => route.fulfill({ status: 500, json: { error: '요청과 이벤트 저장에 실패했습니다. 저장소 상태를 확인하세요.' } }));
  await page.getByRole('button', { name: '모두 읽음' }).click();
  await expect(page.getByRole('alert')).toContainText('저장소 상태');
  await expect(page.locator('.unread-dot').first()).toBeVisible();
  await page.unroute('**/api/events/read'); await page.getByRole('button', { name: '모두 읽음' }).click();
  await expect(page.locator('.unread-dot')).toHaveCount(0); await page.reload(); await expect(page.locator('.unread-dot')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '모두 읽음' })).toBeDisabled();
});

test('same revision receives new audits and read acknowledgement excludes events not yet shown', async ({ page }) => {
  const state = snapshot();
  state.events = [{ id: 'paper:first', time: '2026-11-16T07:00:00Z', title: 'KIS 주문 응답', detail: '접수 · 미체결', level: 'info', read: false, target: 'paper', environment: 'kis-paper' }];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/events/read', route => {
    expect(route.request().postDataJSON()).toEqual({ ids: ['paper:first'] });
    state.events[0].read = true;
    state.events.unshift({ id: 'paper:new', time: '2026-11-16T07:01:00Z', title: 'KIS 주문 대조', detail: '응답 불명 · 대조 필요', level: 'warning', read: false, target: 'paper', environment: 'kis-paper' });
    return route.fulfill({ json: {} });
  });
  await page.goto('/alerts'); await expect(page.locator('.event')).toHaveCount(1);
  await page.getByRole('button', { name: '모두 읽음' }).click();
  await expect(page.locator('.event')).toHaveCount(2);
  await expect(page.locator('.event').first()).toContainText('미읽음');
  await expect(page.locator('.unread-dot')).toHaveCount(1);
});
