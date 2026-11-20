import { DatabaseSync } from 'node:sqlite';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { paperLedgerSchema, type PaperLedger } from '../shared/contracts.ts';
import type { PaperOrder } from '../shared/model.ts';
import type { Store } from './store.ts';
import { planStem } from '../shared/trading-plan.ts';

const observedTime = z.iso.datetime({ offset: true });
function milliseconds(value: unknown) {
  const at = observedTime.safeParse(value);
  return at.success ? Date.parse(at.data) : -Infinity;
}

// Earlier ledgers kept successful per-order matches in paper_audit, before the timestamp
// was tracked separately for unchanged orders. Only the broker evidence time counts.
export function displayOrders(db: DatabaseSync): (PaperOrder & { lastMatchedAt?: string })[] {
  const hasAudit = db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='paper_audit'").get();
  const previousMatch = hasAudit ? `(
    SELECT json_extract(a.body, '$.evidence.observedAt') FROM paper_audit a
    WHERE a.request_id = o.request_id AND json_extract(a.body, '$.action') IN ('reconcile', 'recovery-confirm')
      AND json_extract(a.body, '$.after') IN ('accepted', 'partial', 'filled', 'cancelled')
      AND json_extract(a.body, '$.evidence.tradeDate') = json_extract(o.body, '$.tradeDate')
      AND json_type(a.body, '$.evidence.observedAt') = 'text'
      AND julianday(json_extract(a.body, '$.evidence.observedAt')) IS NOT NULL
    ORDER BY julianday(json_extract(a.body, '$.evidence.observedAt')) DESC LIMIT 1)` : 'NULL';
  const hasChecks = db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='paper_order_checks'").get();
  const recorded = hasChecks ? '(SELECT observed_at FROM paper_order_checks WHERE request_id=o.request_id)' : 'NULL';
  return db.prepare(`SELECT o.body, ${recorded} AS checked, ${previousMatch} AS legacy
    FROM paper_orders o ORDER BY o.rowid DESC`).all().map(row => {
    const order: PaperOrder = JSON.parse(String(row.body));
    const at = Math.max(milliseconds(row.checked), milliseconds(row.legacy));
    return Number.isFinite(at) ? { ...order, lastMatchedAt: new Date(at).toISOString() } : order;
  });
}

const archiveEntry = z.object({ label: z.string().trim().min(1).max(100), file: z.string().min(1) });

function registeredArchives(active: string) {
  try {
    return z.array(archiveEntry).parse(JSON.parse(readFileSync(active + '.history.json', 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new Error('지난 실행 등록 목록을 읽지 못했습니다.');
  }
}

export function orderHistory(store: Store) {
  const orders: PaperLedger['orders'] = [];
  const unavailable: string[] = [];
  if (store.path === ':memory:') return { orders, unavailable, sourceCount: 0 };
  const active = realpathSync(store.path), root = dirname(active);
  const entries = registeredArchives(active);
  for (const pin of store.pinnedRuns()) {
    const folder = planStem(pin.kind, pin.draftId), run = planStem(pin.kind, pin.runId);
    entries.push({ label: `${pin.kind === 'once' ? '한정 실행' : '전략 실행'} · ${pin.runId.slice(0, 8)}`, file: `trading-runs/${folder}/${run}.sqlite` });
  }
  const seen = new Set<string>();
  let sourceCount = 0;
  for (const [index, { label, file }] of entries.entries()) {
    const path = resolve(root, file), child = relative(root, path);
    if (path === active || seen.has(path)) continue;
    let db: DatabaseSync | undefined;
    try {
      if (isAbsolute(file) || child.startsWith('..' + sep) || !file.endsWith('.sqlite') ||
          realpathSync(path) !== path) throw new Error('invalid archive');
      const fileStat = statSync(path);
      if (!fileStat.isFile() || fileStat.nlink !== 1 || (process.getuid && fileStat.uid !== process.getuid())) throw new Error('invalid archive');
      db = new DatabaseSync(path, { readOnly: true });
      const safe = paperLedgerSchema.parse({ orders: displayOrders(db) });
      for (const order of safe.orders) orders.push({ ...order, sourceLabel: label, sourceId: String(index) });
      seen.add(path);
      sourceCount++;
    } catch {
      unavailable.push(label);
    } finally { db?.close(); }
  }
  orders.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return { orders, unavailable, sourceCount };
}
