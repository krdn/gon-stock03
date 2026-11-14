import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Store } from './store.ts';
import { makeServer } from './http.ts';
import { advanceTick, halt, record } from './engine.ts';

const port = Number(process.env.STOCK_PORT ?? 4304);
const path = process.env.STOCK_DB === ':memory:' ? ':memory:' : resolve(process.env.STOCK_DB ?? '.local/workspace.sqlite');
if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
const store = new Store(path); if (path !== ':memory:') chmodSync(path, 0o600);
const server = makeServer(store, undefined, [4303, port]);
const playback = setInterval(() => {
  if (!store.read().playing) return;
  try { store.update(advanceTick); }
  catch { store.update(state => { halt(state, true); record(state, '데모 재생 실패', '상태를 확인한 뒤 재개하세요.', 'error'); }); }
}, 3000);
server.listen(port, '127.0.0.1', () => console.log(`GON Stock local server: http://127.0.0.1:${port}`));
function stop() { clearInterval(playback); server.close(() => { store.close(); process.exit(0); }); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
