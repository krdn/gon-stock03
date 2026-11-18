import { readFileSync, realpathSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { KisClient, KisNotSent, KisRejected, koreaDate } from '../server/kis.ts';
import { PaperBroker } from '../server/paper.ts';
import { Realtime } from '../server/realtime.ts';
import { Store } from '../server/store.ts';
import type { PaperOrder } from '../shared/model.ts';
import { paperRecoveryInput } from '../shared/contracts.ts';

const instruction = z.object({
  requestId: z.uuid(), code: z.string().regex(/^\d{6}$/), side: z.enum(['buy', 'sell']),
  qty: z.int().positive(), price: z.int().nonnegative(), orderType: z.literal('market').optional(),
}).strict().refine(o => (o.orderType === 'market' ? o.price === 0 : o.price > 0) && Number.isSafeInteger(o.price * o.qty));

function checkSession() {
  const session = Realtime.configuration()?.session;
  const time = Date.now();
  if (!session?.verified || session.date.replaceAll('-', '') !== koreaDate() ||
      !(time >= Date.parse(session.date + 'T' + session.open + ':00+09:00') &&
        time < Date.parse(session.date + 'T' + session.close + ':00+09:00'))) {
    throw new KisNotSent('당일 확인된 모의 거래시간 밖입니다.');
  }
}

export async function testOrder(store: Store, kis: KisClient, raw: unknown, checkOpen = checkSession) {
  const order = instruction.parse(raw);
  const rows = store.paperOrders();
  const existing = rows.find(o => o.requestId === order.requestId);
  if (existing) {
    if (existing.code !== order.code || existing.side !== order.side || existing.price !== order.price ||
        existing.qty !== order.qty || existing.orderType !== order.orderType) throw new Error('같은 요청 ID의 주문 내용이 다릅니다.');
    return existing;
  }
  if (rows.some(o => o.status === 'unknown' || o.status === 'sending')) throw new Error('기존 테스트 주문의 응답 불명을 먼저 대조하세요.');
  checkOpen();
  const local: PaperOrder = { ...order, createdAt: new Date().toISOString(), tradeDate: koreaDate(), status: 'sending', filled: 0, remaining: order.qty, message: '전용 모의 테스트' };
  store.savePaper(local, { actor: 'local-user', action: 'sending', before: null });
  try {
    Object.assign(local, await kis.submit(order, checkOpen), { status: 'accepted' });
  } catch (error) {
    local.status = error instanceof KisRejected || error instanceof KisNotSent ? 'rejected' : 'unknown';
    local.message = error instanceof Error ? error.message : '전송 결과 미확정';
  }
  store.savePaper(local, { actor: 'system', action: 'response', before: 'sending' });
  return local;
}

function summary(o: PaperOrder) {
  return { requestId: o.requestId, code: o.code, status: o.status, filled: o.filled, remaining: o.remaining };
}

async function main() {
  const [command = 'status', arg, ...extra] = process.argv.slice(2);
  if (extra.length || !['status', 'orders', 'submit', 'batch', 'inspect', 'confirm'].includes(command) ||
      (['status', 'orders', 'batch', 'confirm'].includes(command) ? arg !== undefined : !arg)) {
    throw new Error('사용법: vts:test [status | orders | submit JSON | batch < orders.jsonl | inspect UUID | confirm < 확인.json]');
  }
  // Await batch input before taking the ledger lock. Validate every line before the first POST.
  const batch = command === 'batch' ? readFileSync(0, 'utf8').trim().split(/\r?\n/).map(line => instruction.parse(JSON.parse(line))) :
    command === 'submit' ? [instruction.parse(JSON.parse(arg!))] : [];
  const kis = KisClient.fromEnvironment();
  const root = fileURLToPath(new URL('../.local/vts-test-runner/', import.meta.url));
  const folder = join(root, kis.accountFingerprint());
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  if (realpathSync(folder) !== folder) throw new Error('전용 원장의 실제 경로를 확인하세요.');
  const lock = new DatabaseSync(join(folder, 'lock.sqlite'));
  try {
    // An OS-released SQLite lock also protects Store startup recovery across CLI invocations.
    lock.exec('BEGIN IMMEDIATE');
    const store = new Store(join(folder, 'ledger.sqlite'), {});
    try {
      const paper = new PaperBroker(store, kis);
      if (command === 'status') {
        const account = await kis.balance(true);
        console.log(JSON.stringify({ mode: 'vts-test-runner', connected: account.connected, complete: account.status.complete, observedAt: account.status.observedAt, localOrders: store.paperOrders().length, maxOrderAmount: null, maxAttempts: null, signalExpiryMs: null }));
      } else if (command === 'orders') {
        console.log(JSON.stringify((await paper.refresh(true)).orders.map(summary)));
      } else if (command === 'inspect') {
        const preview = await paper.inspectRecovery(z.uuid().parse(arg));
        console.log(JSON.stringify({ evidenceId: preview.evidenceId, candidates: preview.candidates.map(o => ({brokerId:o.brokerId,organization:o.organization,date:o.date,code:o.code,side:o.side,qty:o.qty,price:o.price,filled:o.filled,remaining:o.remaining})) }));
      } else if (command === 'confirm') {
        console.log(JSON.stringify(summary(await paper.confirmRecovery(paperRecoveryInput.parse(JSON.parse(readFileSync(0, 'utf8')))))));
      } else {
        for (const input of batch) {
          const order = await testOrder(store, kis, input);
          console.log(JSON.stringify(summary(order)));
          if (order.status === 'unknown' || order.status === 'rejected') { process.exitCode = 1; break; }
        }
      }
    } finally { store.close(); }
  } finally { lock.close(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.umask(0o077);
  main().catch(error => {
    console.error(error instanceof z.ZodError ? '테스트 입력 형식을 확인하세요.' : error instanceof SyntaxError ? 'JSON 입력 형식을 확인하세요.' : error.message);
    process.exitCode = 1;
  });
}
