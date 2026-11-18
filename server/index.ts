import { mkdirSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { Store } from './store.ts';
import { makeServer } from './http.ts';
import { advanceTick, halt, record } from './engine.ts';
import { paperApprovalSchema } from './paper.ts';
import { KisClient } from './kis.ts';
import { strategyContractSchema } from './strategy-contract.ts';

const contract = process.env.KIS_STRATEGY_CONTRACT === undefined ? undefined : strategyContractSchema.parse(JSON.parse(process.env.KIS_STRATEGY_CONTRACT));
const approval = process.env.KIS_PAPER_APPROVAL === undefined ? undefined : paperApprovalSchema.parse(JSON.parse(process.env.KIS_PAPER_APPROVAL));
const port = Number(process.env.STOCK_PORT ?? 4304);
const path = process.env.STOCK_DB === ':memory:' ? ':memory:' : resolve(process.env.STOCK_DB ?? '.local/workspace.sqlite');
if (contract && (approval || !process.env.STOCK_DB || path !== contract.ledgerPath || path === ':memory:' || basename(path) !== 'strategy-' + contract.contractId + '.sqlite')) throw new Error('별도 전략 계약에는 명시한 전용 영구 원장이 필요합니다.');
if (approval && (path === ':memory:' || !process.env.STOCK_DB)) throw new Error('1회 실행에는 확인한 영구 STOCK_DB 경로가 필요합니다.');
const kis = KisClient.fromEnvironment();
if (contract && (realpathSync(path) !== contract.ledgerPath || kis.accountFingerprint() !== contract.accountFingerprint)) throw new Error('승인된 전용 원장·계좌가 아닙니다.');
if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
const store = new Store(path, { contract });
const server = makeServer(store, kis, [4303, port], approval, undefined, contract);
const playback = setInterval(() => {
  if (!store.read().playing) return;
  try { store.update(advanceTick); }
  catch { store.update(state => { halt(state, true); record(state, '데모 재생 실패', '상태를 확인한 뒤 재개하세요.', 'error'); }); }
}, 3000);
server.listen(port, '127.0.0.1', () => console.log(`GON Stock local server: http://127.0.0.1:${port}`));
function stop() { clearInterval(playback); server.close(() => { store.close(); process.exit(0); }); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
