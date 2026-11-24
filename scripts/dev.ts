import { spawn, spawnSync } from 'node:child_process';
import { z } from 'zod';
import { Realtime } from '../server/realtime.ts';
import {
  applyKisRecords,
  fetchKisSecretsViaUniversalAuth,
  kisVariables,
  readMachineAuthConfig,
  resolveInfisicalDomain,
  secretRecordSchema,
  stripInfisicalEnv,
} from './infisical-dev.ts';

async function loadDevCredentials(env: NodeJS.ProcessEnv) {
  if (kisVariables.every(key => env[key]?.trim())) return;

  const machineAuth = readMachineAuthConfig(env);
  if (machineAuth.kind === 'error') {
    console.warn(`Infisical 머신 인증 설정을 사용할 수 없습니다: ${machineAuth.reason} 로컬 데모를 시작합니다.`);
    return;
  }
  if (machineAuth.kind === 'ok') {
    console.info('Infisical 머신 인증으로 KIS 모의 계좌 설정을 불러오는 중입니다.');
    const fetched = await fetchKisSecretsViaUniversalAuth(machineAuth.config);
    if (!fetched.ok) {
      console.warn(`Infisical 머신 인증에 실패했습니다 (${fetched.reason}). Client ID/Secret·프로젝트 ID·dev /kis 읽기 권한을 확인한 뒤 npm run dev를 다시 실행하세요. 로컬 데모를 시작합니다.`);
      return;
    }
    const applied = applyKisRecords(env, fetched.records);
    if (applied.ok) return;
    console.warn(`Infisical 머신 인증으로 KIS 설정을 불러오지 못했습니다${applied.diagnosis}. dev /kis 읽기 권한과 기존 환경변수를 확인한 뒤 npm run dev를 다시 실행하세요. 로컬 데모를 시작합니다.`);
    return;
  }

  console.info('Infisical에서 KIS 모의 계좌 설정을 불러오는 중입니다.');
  const cliArgs = [
    'secrets-manager', 'secrets', 'get', ...kisVariables, '--env', 'dev', '--path', '/kis', '-o', 'json', '--silent',
  ];
  let result = spawnSync('infisical', cliArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 });
  const isTimeout = (res: typeof result) => (res.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT';
  if (isTimeout(result) && process.stdin.isTTY && process.stdout.isTTY) {
    const loginDomain = resolveInfisicalDomain(env);
    if (!loginDomain) {
      console.warn('INFISICAL_DOMAIN 형식이 올바르지 않아 대화형 로그인을 시작하지 못했습니다.');
    } else {
      console.info('Infisical CLI 응답이 시간 초과되었습니다(로그인 세션 만료 가능). 대화형 로그인을 시작합니다.');
      const login = spawnSync('infisical', ['login', '--domain', loginDomain], { stdio: 'inherit' });
      if (login.status === 0) {
        result = spawnSync('infisical', cliArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 });
      }
    }
  }
  let diagnosis = '';
  if (result.status === 0) {
    try {
      const records = z.array(secretRecordSchema).parse(JSON.parse(result.stdout));
      const applied = applyKisRecords(env, records);
      if (applied.ok) return;
      diagnosis = applied.diagnosis;
    } catch { /* CLI output may contain secrets. Report only the recovery steps below. */ }
  } else if (isTimeout(result)) {
    diagnosis = ' (CLI 응답 시간 초과 · Infisical 로그인 세션 만료 가능)';
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
const rawServerEnv = { ...process.env };
if (realtime) rawServerEnv.KIS_WS_APPROVAL_KEY = approvalKey;
else await loadDevCredentials(rawServerEnv);
const serverEnv = stripInfisicalEnv(rawServerEnv);
const webEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('KIS_') && !name.startsWith('INFISICAL_')));
const children = [
  spawn('npm', ['run', 'dev:server'], { stdio: 'inherit', env: serverEnv }),
  spawn('npm', ['run', 'dev:web'], { stdio: 'inherit', env: webEnv }),
];
let stopping = false;
function stop() { if (stopping) return; stopping = true; children.forEach(child => child.kill('SIGTERM')); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
children.forEach(child => child.on('exit', code => { stop(); process.exitCode = code ?? 0; }));
