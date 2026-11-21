import { KisClient } from '../../../../server/kis.ts';
if (process.env.STOCK_DB !== ':memory:' || process.env.STOCK_PORT !== '4455'
    || Object.keys(process.env).some(name => /^(KIS_|INFISICAL_)/.test(name))) {
  throw new Error('4455의 빈 환경과 메모리 DB에서만 예시를 시작할 수 있습니다.');
}

globalThis.fetch = async () => { throw new Error('검토용 예시 서버는 외부에 연결하지 않습니다.'); };
KisClient.prototype.quote = async function (code: string) {
  if (code === '999999') throw new Error('예시 종목 조회 실패');
  return { code, price: code === '000660' ? 128000 : 64000, change: 1.2, upper: 150000, lower: 35000, tickSize: 100, stopped: false, sector: '검토용 예시', receivedAt: new Date().toISOString() };
};
KisClient.prototype.bars = async function (code: string) {
  const rows = [];
  const date = new Date('2026-04-01T00:00:00Z');
  while (rows.length < 100) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) rows.push({ date: date.toISOString().slice(0,10).replaceAll('-',''), close: (code === '000660' ? 124000 : 60000) + rows.length * 40 });
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return rows;
};
await import('../../../../server/index.ts');
