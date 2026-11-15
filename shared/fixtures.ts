import type { Instrument, State } from './model.ts';

const series = (base: number, phase: number) => Array.from({ length: 120 }, (_, i) => Math.round((base * (0.93 + i * 0.00055 + Math.sin(i / 6 + phase) * 0.025 + Math.sin(i * 1.7) * 0.004)) / 10) * 10);
export const instrumentSeeds: Instrument[] = [
  ['005930', '삼성전자', 'KOSPI', '반도체', 72800, 1.82, 12420800],
  ['000660', 'SK하이닉스', 'KOSPI', '반도체', 192500, 2.67, 3850100],
  ['035420', 'NAVER', 'KOSPI', '인터넷', 187200, -0.85, 980200],
  ['005380', '현대차', 'KOSPI', '자동차', 242000, 0.62, 1288000],
  ['069500', 'KODEX 200', 'ETF', '지수', 36200, 0.94, 5208100],
  ['229200', 'KODEX 코스닥150', 'ETF', '지수', 12650, -1.17, 3802000],
  ['035720', '카카오', 'KOSPI', '인터넷', 41600, -1.42, 2108300],
  ['247540', '에코프로비엠', 'KOSDAQ', '이차전지', 164300, 1.23, 720500],
].map((row, index) => ({ code: row[0] as string, name: row[1] as string, market: row[2] as Instrument['market'], sector: row[3] as string, price: row[4] as number, change: row[5] as number, volume: row[6] as number, history: series(row[4] as number, index) }));

export function initialState(): State {
  const instruments = structuredClone(instrumentSeeds);
  instruments.forEach(s => { s.history[s.history.length - 1] = s.price; });
  return {
    cash: 8_341_000, startingEquity: 12_211_500, instruments,
    positions: [{ code: '005930', qty: 30, average: 70200 }, { code: '000660', qty: 5, average: 184000 }, { code: '069500', qty: 20, average: 35100 }],
    orders: [], watchlist: ['005930', '000660', '069500', '035420'],
    strategies: [{ id: 'ma-01', name: '추세를 따라가는 5·20', code: '069500', fast: 5, slow: 20, qty: 1, active: false, lastSignal: 'hold', lastTick: -1 }],
    risk: { maxOrder: 1_000_000, maxPosition: 4_000_000, dailyLoss: 300_000, halted: false },
    events: [{ id: 'welcome', time: new Date().toISOString(), level: 'info', title: '로컬 데모 워크스페이스', detail: '가격·잔고·120개 봉은 합성 데이터입니다. KIS 모의투자 연결은 별도로 확인합니다.', read: false }],
    journal: [], tick: 0, playing: false, revision: 0, updatedAt: new Date().toISOString(),
  };
}
