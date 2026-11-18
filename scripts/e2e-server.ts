process.env.STOCK_PORT = '4314';
process.env.STOCK_DB = ':memory:';
delete process.env.KIS_STRATEGY_CONTRACT;
for (const key of ['KIS_WS_SESSION', 'KIS_WS_APPROVAL_KEY', 'KIS_HTS_ID', 'KIS_APP_KEY', 'KIS_APP_SECRET', 'KIS_CANO', 'KIS_ACNT_PRDT_CD']) process.env[key] = '';
await import('../server/index.ts');
export {};
