import { KisClient } from '../server/kis.ts';
try {
  const result = await KisClient.fromEnvironment().balance();
  console.log(JSON.stringify({ connected: result.connected, mode: result.mode, checkedAt: result.checkedAt, positionCount: result.balance?.positions.length, message: result.message }));
} catch (error) {
  console.log(JSON.stringify({ connected: false, mode: 'paper', message: error instanceof Error ? error.message : '연결 실패' })); process.exitCode = 1;
}
