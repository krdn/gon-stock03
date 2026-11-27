import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { dailyBacktestInput, experimentSchema, experimentSnapshotSchema, dailyRuleBacktestInput, ruleSnapshotSchema, type Experiment } from '../shared/backtest.ts';
import { backtestDaily, backtestRules } from './engine.ts';
import { Store } from './store.ts';

const hash = (snapshot: Experiment['snapshot']) => createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');

export function createExperiment(store: Store, body: unknown) {
  const input = (body && typeof body === 'object' && 'rule' in body ? dailyRuleBacktestInput : dailyBacktestInput).parse(body), run = store.dailyRun(input.runId);
  if (!run) throw new Error('일봉 수집 기록을 찾지 못했습니다.');
  if (run.code !== input.code || run.source !== input.source || run.adjustment !== input.adjustment) throw new Error('선택한 출처·종목·수정주가 정책이 수집 기록과 다릅니다.');
  if (input.from < run.from || input.to > run.to || input.to >= run.captureDate) throw new Error('기간이 저장 범위를 벗어나거나 수집일 이후입니다.');
  if (!run.coverageComplete || run.nextDate !== null || !run.status.complete || run.status.error || run.quality.state !== 'passed' || !run.calendar) throw new Error('부분 수집·품질 실패·달력 미대조 기록은 실행할 수 없습니다. 데이터 상태를 확인하세요.');
  const bars = store.dailyBars(run.id).filter(b => b.date >= input.from && b.date <= input.to);
  const expected = run.calendar.dates.filter(d => d >= input.from && d <= input.to).sort();
  if (expected.length !== bars.length || bars.some((b, i) => b.date !== expected[i]) || new Set(expected).size !== expected.length) throw new Error('선택 기간의 거래일 누락·중복·달력 불일치가 있습니다.');
  if (bars.some(b => b.code !== input.code || b.adjustment !== input.adjustment || b.source !== input.source ||
    ![b.open, b.high, b.low, b.close, b.volume].every(v => Number.isFinite(v) && v > 0) || b.low > Math.min(b.open, b.close) || b.high < Math.max(b.open, b.close))) throw new Error('가격·거래량 또는 출처·정책이 일치하지 않는 봉은 실행할 수 없습니다.');
  const computed = 'rule' in input ? (() => {
    const snapshot = ruleSnapshotSchema.parse({engineVersion:'daily-rules-next-open-v2', input, collection:run, bars});
    return {snapshot, result:backtestRules(snapshot.bars, snapshot.bars.map(b => b.open), input, 'daily')};
  })() : (() => {
    const snapshot = experimentSnapshotSchema.parse({engineVersion:'daily-ma-next-open-v1', input, collection:run, bars});
    return {snapshot, result:backtestDaily(snapshot.bars,input)};
  })();
  const inputHash = hash(computed.snapshot);
  const previous = store.experiment(inputHash);
  if (previous) return previous;
  const experiment = { id: inputHash, inputHash, createdAt: new Date().toISOString(), ...computed };
  store.saveExperiment(experiment); return experiment;
}
export function replayExperiment(store: Store, id: string) {
  const saved = store.experiment(id);
  if (!saved) throw new Error('저장 실험을 찾지 못했습니다.');
  const experiment = experimentSchema.parse(saved);
  if (hash(experiment.snapshot) !== experiment.inputHash || experiment.id !== experiment.inputHash) throw new Error('실험 입력 해시가 일치하지 않습니다.');
  const {snapshot} = experiment;
  const result = snapshot.engineVersion === 'daily-rules-next-open-v2'
    ? backtestRules(snapshot.bars, snapshot.bars.map(b => b.open), snapshot.input, 'daily')
    : backtestDaily(snapshot.bars, snapshot.input);
  return { result, matches: isDeepStrictEqual(result, experiment.result), inputHash: experiment.inputHash };
}
