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

export function bollinger(closes: readonly number[], period: number, multiplier: number) {
  const window = closes.slice(-period);
  const mid = sma(window, period);
  const variance = window.reduce((sum, value) => sum + (value - mid) ** 2, 0) / period;
  const width = multiplier * Math.sqrt(variance);
  return {mid, upper: mid + width, lower: mid - width};
}

// Each EMA starts at its own period SMA; align both series at the first slow EMA.
export function macd(closes: readonly number[], fast: number, slow: number, signal: number) {
  let short = ema(closes.slice(0, slow), fast);
  let long = sma(closes.slice(0, slow), slow);
  const line = [short - long];
  for (const close of closes.slice(slow)) {
    short += (2 / (fast + 1)) * (close - short);
    long += (2 / (slow + 1)) * (close - long);
    line.push(short - long);
  }
  const previous = line.slice(0, -1);
  return {value: line.at(-1)!, prevHist: previous.at(-1)! - ema(previous, signal),
    hist: line.at(-1)! - ema(line, signal)};
}

export function dmi(bars: readonly {high:number; low:number; close:number}[], period: number) {
  let tr = 0, positive = 0, negative = 0, plusDI = 0, minusDI = 0;
  const dx: number[] = [];
  let prevPlus = 0, prevMinus = 0;
  for (const [i, bar] of bars.entries()) {
    const prev = bars[i - 1];
    const up = prev ? bar.high - prev.high : 0;
    const down = prev ? prev.low - bar.low : 0;
    const range = prev ? Math.max(bar.high, prev.close) - Math.min(bar.low, prev.close) : bar.high - bar.low;
    const decay = i < period ? 1 : 1 - 1 / period;
    tr = tr * decay + range;
    positive = positive * decay + (up > 0 && up > down ? up : 0);
    negative = negative * decay + (down > 0 && down > up ? down : 0);
    if (i < period - 1) continue;
    prevPlus = plusDI; prevMinus = minusDI;
    plusDI = tr ? 100 * positive / tr : 0;
    minusDI = tr ? 100 * negative / tr : 0;
    dx.push(plusDI + minusDI ? 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI) : 0);
  }
  return {plusDI, minusDI, adx: wilder(dx, period), prev: {plusDI:prevPlus, minusDI:prevMinus, adx:wilder(dx.slice(0,-1), period)}};
}
