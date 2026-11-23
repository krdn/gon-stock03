import { spawn, spawnSync } from 'node:child_process';
import { z } from 'zod';
import { Realtime } from '../server/realtime.ts';

const kisVariables = ['KIS_APP_KEY', 'KIS_APP_SECRET', 'KIS_CANO', 'KIS_ACNT_PRDT_CD'] as const;
function loadDevCredentials(env: NodeJS.ProcessEnv) {
  if (kisVariables.every(key => env[key]?.trim())) return;
  console.info('Infisical에서 KIS 모의 계좌 설정을 불러오는 중입니다.');
  const result = spawnSync('infisical', [
    'secrets-manager', 'secrets', 'get', ...kisVariables, '--env', 'dev', '--path', '/kis', '-o', 'json', '--silent',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 });
  let diagnosis = '';
  if (result.status === 0) {
    try {
      const records = z.array(z.object({
        secretKey: z.string(),
        secretValue: z.string().refine(value => !value.includes('\0')),
      })).parse(JSON.parse(result.stdout));
      const values = new Map(records.map(record => [record.secretKey, record.secretValue]));
      const missingKeys = kisVariables.filter(key => !values.get(key)?.trim());
      const conflictKeys = kisVariables.filter(key => env[key]?.trim() && values.get(key)?.trim() && env[key] !== values.get(key));
      if (!missingKeys.length && !conflictKeys.length) {
        for (const key of kisVariables) env[key] = values.get(key);
        return;
      }
      const details: string[] = [];
      if (missingKeys.length) details.push(`누락 항목: ${missingKeys.join(', ')}`);
      if (conflictKeys.length) details.push(`기존 환경변수와 불일치: ${conflictKeys.join(', ')}`);
      diagnosis = details.length ? ` (${details.join(' · ')})` : '';
    } catch { /* CLI output may contain secrets. Report only the recovery steps below. */ }
  }
  console.warn(`KIS 설정을 불러오지 못했습니다${diagnosis}. Infisical CLI 설치·로그인, dev /kis 읽기 권한과 기존 환경변수를 확인한 뒤 npm run dev를 다시 실행하세요. 로컬 데모를 시작합니다.`);
}

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
const serverEnv = { ...process.env };
if (realtime) serverEnv.KIS_WS_APPROVAL_KEY = approvalKey;
else loadDevCredentials(serverEnv);
const webEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('KIS_') && !name.startsWith('INFISICAL_')));
const children = [
  spawn('npm', ['run', 'dev:server'], { stdio: 'inherit', env: serverEnv }),
  spawn('npm', ['run', 'dev:web'], { stdio: 'inherit', env: webEnv }),
];
let stopping = false;
function stop() { if (stopping) return; stopping = true; children.forEach(child => child.kill('SIGTERM')); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
children.forEach(child => child.on('exit', code => { stop(); process.exitCode = code ?? 0; }));
