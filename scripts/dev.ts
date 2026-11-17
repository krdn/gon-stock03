import { spawn } from 'node:child_process';
import { Realtime } from '../server/realtime.ts';

const realtime = process.argv.includes('--realtime');
let approvalKey: string | undefined;
if (realtime) {
  try {
    const config = Realtime.configuration();
    const appkey = process.env.KIS_APP_KEY, secretkey = process.env.KIS_APP_SECRET;
    if (!appkey?.trim() || !secretkey?.trim() || !config?.htsId.trim()) throw new Error();
    const response = await fetch('https://openapivts.koreainvestment.com:29443/oauth2/Approval', {
      method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', appkey, secretkey }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error();
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || !('approval_key' in result) || typeof result.approval_key !== 'string' || !result.approval_key.trim()) throw new Error();
    approvalKey = result.approval_key;
    console.log('WebSocket 접속키 발급 성공 · 서버에만 전달 · 실제 구독은 별도 시작');
  } catch {
    console.error('WebSocket 준비 실패 · Infisical 인증값·HTS ID·세션 설정·네트워크를 확인하세요. 앱을 시작하지 않습니다.');
    process.exit(1);
  }
}
const children = ['dev:server', 'dev:web'].map(script => {
  const env = { ...process.env };
  if (realtime) {
    delete env.KIS_WS_APPROVAL_KEY;
    if (script === 'dev:server') env.KIS_WS_APPROVAL_KEY = approvalKey;
  }
  return spawn('npm', ['run', script], { stdio: 'inherit', env });
});
let stopping = false;
function stop() { if (stopping) return; stopping = true; children.forEach(child => child.kill('SIGTERM')); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
children.forEach(child => child.on('exit', code => { stop(); process.exitCode = code ?? 0; }));
