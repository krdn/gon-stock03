/** Each indicator ends at the last supplied observation. */
export function sma(values: readonly number[], period: number) {
  return values.length < period ? NaN : values.slice(-period).reduce((sum, v) => sum + v, 0) / period;
}
function smooth(values: readonly number[], period: number, weight: number) {
  let value = sma(values.slice(0, period), period);
  for (let i = period; i < values.length; i++) value += weight * (values[i] - value);
  return value;
}
export const ema = (v: readonly number[], n: number) => smooth(v, n, 2 / (n + 1));
export const wilder = (v: readonly number[], n: number) => smooth(v, n, 1 / n);
export const rollingHighest = (v: readonly number[], n: number) => v.length < n ? NaN : Math.max(...v.slice(-n));
export const rollingLowest = (v: readonly number[], n: number) => v.length < n ? NaN : Math.min(...v.slice(-n));
export const averageVolume = sma;
export function atr(bars: readonly { high: number; low: number; close: number }[], period: number) {
  const ranges = bars.map(({high, low}, i) => i === 0 ? high - low : Math.max(high, bars[i-1].close) - Math.min(low, bars[i-1].close));
  return wilder(ranges, period);
}
export function rsi(closes: readonly number[], period: number) {
  const changes = closes.slice(1).map((v, i) => v - closes[i]);
  const gain = wilder(changes.map(v => Math.max(v, 0)), period);
  const loss = wilder(changes.map(v => Math.max(-v, 0)), period);
  return loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
}
