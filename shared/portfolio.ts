import type { Connection } from './model.ts';

type Holding = NonNullable<Connection['balance']>['positions'][number];
export function portfolioValue(cash: number, holdings: Holding[]) {
  const positions = holdings.filter(p => p.qty > 0).map(p => {
    const value = p.price !== null && p.price > 0 ? p.price * p.qty : null;
    return { ...p, value, profit: value === null ? null : value - p.average * p.qty };
  });
  const unpriced = positions.filter(p => p.value === null).length;
  const invested = unpriced ? null : positions.reduce((sum, p) => sum + p.value!, 0);
  const profit = unpriced ? null : positions.reduce((sum, p) => sum + p.profit!, 0);
  const total = invested === null ? null : cash + invested;
  const weight = (value: number | null) => value !== null && total !== null && total > 0 ? value / total * 100 : null;
  return { cash, positions: positions.map(p => ({ ...p, weight: weight(p.value) })), unpriced, invested, profit, total, cashWeight: weight(cash), investedWeight: weight(invested) };
}
