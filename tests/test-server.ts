import { once } from 'node:events';
import { makeServer } from '../server/http.ts';
import type { Store } from '../server/store.ts';
import type { KisClient } from '../server/kis.ts';
import type { PaperApproval } from '../server/paper.ts';
import type { RealtimeConfig, SocketFactory } from '../server/realtime.ts';
import type { StrategyContract } from '../server/strategy-contract.ts';

/**
 * OS가 할당한 임시 포트(127.0.0.1:0)로 로컬 테스트 서버를 기동한다.
 */
export async function startTestServer(
  store: Store,
  kis?: KisClient,
  approval?: PaperApproval,
  realtimeOptions?: { config?: RealtimeConfig; connect?: SocketFactory; now?: () => number },
  contract?: StrategyContract,
  checkInstrument?: () => void,
) {
  const server = makeServer(store, kis, [0], approval, realtimeOptions, contract, checkInstrument);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('테스트 서버 포트를 확인할 수 없습니다.');
  const port = address.port;
  return {
    server,
    port,
    url: `http://127.0.0.1:${port}`,
    async close() {
      if (!server.listening) return;
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}
