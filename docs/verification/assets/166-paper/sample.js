(() => {
  if (location.origin !== 'http://127.0.0.1:4458') return;
  const scenario = new URL(location.href).searchParams.get('sample');
  if (scenario === '166' || scenario === '166-input')
    sessionStorage.setItem('ux166-on', scenario);
  if (!sessionStorage.getItem('ux166-on')) return;
  const accepted = {
    code: '005930',
    requestId: '16600000-0000-4000-8000-000000000001',
    brokerId: '0000000166',
    organization: '166',
    side: 'buy',
    qty: 3,
    price: 72000,
    tradeDate: '20261120',
    createdAt: '2026-11-20T00:10:00Z',
    status: 'partial',
    filled: 1,
    remaining: 2,
    message: '예시 주문',
  };
  const unresolved = {
    ...accepted,
    requestId: '16600000-0000-4000-8000-000000000002',
    brokerId: undefined,
    status: 'unknown',
    filled: 0,
    remaining: 3,
    message: '예시 응답 불명',
  };
  const row = (o) => ({
    ...o,
    name: '합성 예시 종목',
    date: o.tradeDate,
    cancelled: o.status === 'cancelled',
    confirmedCancelQty: o.status === 'cancelled' ? 2 : 0,
  });
  const recoveryRows = () => [
    sessionStorage.getItem('ux166-recovered')
      ? { ...unresolved, brokerId: '0000000167', status: 'accepted' }
      : unresolved,
    sessionStorage.getItem('ux166-cancelled')
      ? { ...accepted, status: 'cancelled', remaining: 0 }
      : accepted,
  ];
  const manual = () =>
    JSON.parse(sessionStorage.getItem('ux166-receipts') || '[]');
  const inputOnly = sessionStorage.getItem('ux166-on') === '166-input';
  const orders = () => inputOnly ? manual() : recoveryRows();
  const info = () => ({
    candidate:
      inputOnly || sessionStorage.getItem('ux166-cancelled')
        ? null
        : { requestId: accepted.requestId, expiresAt: '2099-11-20T00:12:00Z' },
    reason: inputOnly
      ? '격리 예시 · 취소 대상 없음'
      : '격리 예시 · 모의 승인 원주문',
  });
  const original = window.fetch.bind(window);
  const json = (data, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  window.fetch = (resource, options) => {
    const url = new URL(
      resource instanceof Request ? resource.url : resource,
      location.href,
    );
    if (url.origin !== location.origin)
      return json({ error: '예시 외부 접근 차단' }, 403);
    if (!url.pathname.startsWith('/api/')) return original(resource, options);
    if (
      ['/api/state', '/api/trading-settings'].includes(url.pathname) &&
      (!options?.method || options.method === 'GET')
    )
      return original(resource, options);
    if (url.pathname === '/api/kis/quantity-setting')
      return original(resource, options);
    const path = url.pathname;
    const data = JSON.parse(options?.body || '{}');
    if (path === '/api/kis/ledger')
      return json({ orders: orders(), cancellation: info() });
    if (path === '/api/kis/order' && inputOnly) {
      const receipts = manual();
      const existing = receipts.find((o) => o.requestId === data.requestId);
      if (existing) return json({ order: existing, message: '합성 접수 확인' });
      const order = {
        ...accepted,
        ...data,
        brokerId: String(16600 + receipts.length),
        status: 'accepted',
        filled: 0,
        remaining: data.qty,
        message: '합성 접수 · 체결 전',
      };
      sessionStorage.setItem(
        'ux166-receipts',
        JSON.stringify([order, ...receipts]),
      );
      return json({ order, message: order.message });
    }
    if (path === '/api/kis/market')
      return json({
        quote: {
          code: data.code,
          price: 75000,
          change: 0,
          upper: 90000,
          lower: 50000,
          tickSize: 100,
          stopped: false,
          receivedAt: new Date().toISOString(),
        },
        bars: [],
      });
    if (path === '/api/kis/orders')
      return json({
        orders: orders(),
        brokerOrders: orders()
          .filter((o) => o.brokerId)
          .map(row),
        cancellation: info(),
      });
    if (path === '/api/kis/recovery/inspect')
      return json({
        order: unresolved,
        evidenceId: 'sample166',
        evidence: {
          tradeDate: unresolved.tradeDate,
          observedAt: new Date().toISOString(),
        },
        candidates: [row({ ...unresolved, brokerId: '0000000167' })],
      });
    if (path === '/api/kis/recovery/confirm') {
      sessionStorage.setItem('ux166-recovered', '1');
      return json({ order: recoveryRows()[0] });
    }
    if (path === '/api/kis/cancel-probe') {
      sessionStorage.setItem('ux166-cancelled', '1');
      return json({ order: { ...accepted, status: 'unknown' }, warning: true });
    }
    return json({ error: '격리 예시 · 요청 차단' }, 403);
  };
  document.addEventListener('DOMContentLoaded', () => {
    const tag = document.createElement('span');
    tag.textContent = '합성 예시 · 4458';
    Object.assign(tag.style, {
      position: 'fixed',
      bottom: '4px',
      right: '8px',
      zIndex: '10',
      padding: '3px 7px',
      background: '#243842',
      color: 'white',
      borderRadius: '4px',
      font: '12px sans-serif',
      pointerEvents: 'none',
    });
    document.body.appendChild(tag);
  });
})();
