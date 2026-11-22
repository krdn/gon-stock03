// Each day starts from its observed morning holdings. Compounded returns describe
// the sequence of daily experiments, not a self-financing multi-day account.
import { z } from 'zod';

const code = z.string().regex(/^[0-9A-Z]{6}$/);
const prices = z.record(code, z.number().positive());
const daySchema = z.object({
  date: z.iso.date(),
  cash: z.number().nonnegative(),
  open: prices,
  close: prices,
  holdings: z.record(code, z.int().nonnegative()),
  events: z.array(
    z.object({
      at: z.iso.datetime({ offset: true }),
      code,
      price: z.number().positive(),
      // The signal must have been recorded before the executable price.
      signalAt: z.iso.datetime({ offset: true }),
      side: z.enum(['buy', 'sell', 'hold']),
      qty: z.int().positive(),
    }),
  ),
});
export const replayInput = z.object({
  source: z.string().min(1),
  feeBps: z.number().min(0).lt(1000),
  slippageBps: z.number().min(0).lt(1000),
  testFrom: z.iso.date(),
  days: z.array(daySchema).min(2),
});
type Day = z.infer<typeof daySchema>;
function simulate(day: Day, cost: number, stop: number, hold = false) {
  let cash = day.cash,
    stopped = false,
    worst = 0,
    peak = 0;
  const qty = { ...day.holdings },
    price = { ...day.open };
  const value = () => cash + Object.entries(qty).reduce((n, [code, q]) => n + price[code] * q, 0);
  for (const code of Object.keys(qty))
    if (!(code in price) || !(code in day.close)) throw new Error('보유 종목 시가·종가가 필요합니다.');
  const initial = value();
  if (initial <= 0) throw new Error('시작 평가액이 필요합니다.');
  peak = initial;
  let trough = initial;
  function mark() {
    const equity = value();
    trough = Math.min(trough, equity);
    peak = Math.max(peak, equity);
    worst = Math.max(worst, 1 - equity / peak);
    if ((initial - equity) / initial >= stop) stopped = true;
  }
  let previousTime = -Infinity;
  for (const e of day.events) {
    const time = Date.parse(e.at);
    if (
      time < previousTime ||
      Date.parse(e.signalAt) >= time ||
      new Date(time + 9 * 3600000).toISOString().slice(0, 10) !== day.date ||
      !(e.code in day.close)
    )
      throw new Error('신호와 체결 시각·거래일·종가를 확인하세요.');
    previousTime = time;
    price[e.code] = e.price;
    mark();
    const amount = e.price * e.qty;
    if (!hold && e.side === 'buy' && !stopped && cash >= amount * (1 + cost)) {
      cash -= amount * (1 + cost);
      qty[e.code] = (qty[e.code] ?? 0) + e.qty;
    }
    if (!hold && e.side === 'sell' && (qty[e.code] ?? 0) >= e.qty) {
      cash += amount * (1 - cost);
      qty[e.code] -= e.qty;
    }
    mark();
  }
  Object.assign(price, day.close);
  mark();
  return { net: value() / initial - 1, worst, high: peak / initial, low: trough / initial };
}
export function compareMorningPolicies(raw: unknown) {
  const input = replayInput.parse(raw),
    cost = (input.feeBps + input.slippageBps) / 10000;
  const samples: {
    date: string;
    fixed: number;
    adaptive: number;
    unrestricted: number;
    hold: number;
    drops: number[];
    highs: number[];
    lows: number[];
  }[] = [];
  const history: number[] = [];
  for (const d of input.days) {
    if (samples.length && samples.at(-1)!.date >= d.date)
      throw new Error('거래일은 중복 없이 시간 순서로 입력하세요.');
    const base = simulate(d, cost, Infinity),
      hold = simulate(d, cost, Infinity, true);
    // Research candidates only. Adaptive uses preceding hold returns, never today's close.
    const prior = history.slice(-20);
    const rms = prior.length ? Math.sqrt(prior.reduce((s, x) => s + x * x, 0) / prior.length) : 0.01;
    const fixed = simulate(d, cost, 0.01),
      adaptive = simulate(d, cost, Math.max(0.005, Math.min(0.05, 2 * rms)));
    samples.push({
      date: d.date,
      fixed: fixed.net,
      adaptive: adaptive.net,
      unrestricted: base.net,
      hold: hold.net,
      highs: [fixed.high, adaptive.high, base.high, hold.high],
      lows: [fixed.low, adaptive.low, base.low, hold.low],
      drops: [fixed.worst, adaptive.worst, base.worst, hold.worst],
    });
    history.push(hold.net);
  }
  function stats(rows: typeof samples) {
    return (['fixed', 'adaptive', 'unrestricted', 'hold'] as const).map((policy, i) => {
      let equity = 1,
        peak = 1,
        maxDrawdown = 0;
      for (const d of rows) {
        maxDrawdown = Math.max(maxDrawdown, d.drops[i], 1 - (equity * d.lows[i]) / peak);
        peak = Math.max(peak, equity * d.highs[i]);
        equity *= 1 + d[policy];
      }
      return {
        policy,
        days: rows.length,
        compoundedNet: equity - 1,
        maxDrawdown,
        worstIntradayDrawdown: rows.reduce((v, d) => Math.max(v, d.drops[i]), 0),
      };
    });
  }
  const train = samples.filter((d) => d.date < input.testFrom),
    test = samples.filter((d) => d.date >= input.testFrom);
  if (!train.length || !test.length) throw new Error('학습과 미사용 평가 기간이 모두 필요합니다.');
  return {
    source: input.source,
    feeBps: input.feeBps,
    slippageBps: input.slippageBps,
    testFrom: input.testFrom,
    train: stats(train),
    test: stats(test),
    samples,
  };
}

type Method = 'fixed' | 'adaptive' | 'unrestricted';
type Sample = ReturnType<typeof compareMorningPolicies>['samples'][number];
// Paired, non-overlapping five-session blocks reduce dependence on adjacent days.
// This is a screening rule; a passing backtest is still hypothetical.
function pairedEdge(rows: Sample[], a: Method, b: Method) {
  const blocks: number[] = [];
  for (let i = 0; i + 5 <= rows.length; i += 5) {
    blocks.push(rows.slice(i, i + 5).reduce((sum, r) => sum + r[a] - r[b], 0) / 5);
  }
  if (blocks.length < 12) return false;
  const mean = blocks.reduce((s, v) => s + v, 0) / blocks.length;
  const variance = blocks.reduce((s, v) => s + (v - mean) ** 2, 0) / (blocks.length - 1);
  return mean > 2.21 * Math.sqrt(variance / blocks.length);
}
export function researchDecision(raw: unknown, day: string) {
  const result = compareMorningPolicies(raw);
  if (result.samples.at(-1)!.date >= day) throw new Error('당일 이후 자료는 장전 연구에서 제외해야 합니다.');
  const train = result.samples.filter((s) => s.date < result.testFrom),
    test = result.samples.filter((s) => s.date >= result.testFrom);
  const candidates = result.train.filter((s) => s.policy !== 'hold').sort((a, b) => a.maxDrawdown - b.maxDrawdown);
  let chosen = candidates[0].policy as Method;
  for (const row of candidates.slice(1)) {
    const candidate = row.policy as Method;
    if (pairedEdge(train, candidate, chosen)) chosen = candidate;
  }
  const candidate = result.test.find((x) => x.policy === chosen)!,
    baseline = result.test.find((x) => x.policy === 'unrestricted')!;
  const verified =
    train.length >= 60 &&
    test.length >= 60 &&
    (pairedEdge(test, chosen, 'unrestricted') ||
      (candidate.maxDrawdown < baseline.maxDrawdown && candidate.compoundedNet >= baseline.compoundedNet));
  const recent = result.samples.slice(-20);
  const adaptive = Math.max(
    0.005,
    Math.min(0.05, 2 * Math.sqrt(recent.reduce((s, r) => s + r.hold ** 2, 0) / recent.length)),
  );
  return {
    chosen,
    verified,
    observations: result.samples.length,
    testDays: test.length,
    source: result.source,
    fraction: verified && chosen !== 'unrestricted' ? (chosen === 'fixed' ? 0.01 : adaptive) : null,
  };
}
