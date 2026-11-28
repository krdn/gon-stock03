import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

export const kisVariables = ['KIS_APP_KEY', 'KIS_APP_SECRET', 'KIS_CANO', 'KIS_ACNT_PRDT_CD'] as const;
export const optionalVariables = ['OPENDART_API_KEY'] as const;
export const DEFAULT_STOCK_PROJECT_ID = '890430d6-ff44-4317-9d91-64d912e0d67a';
export const DEFAULT_STOCK_SECRET_PATH = '/stock';
export const DEFAULT_INFISICAL_DOMAIN = 'https://app.infisical.com';
export const DEFAULT_AUTH_FILE = '.secrets/infisical-dev.json';

const MAX_AUTH_FILE_BYTES = 16_384;
const REQUEST_TIMEOUT_MS = 15_000;

const safeSecret = z.string().refine(
  value => value.length > 0 && value === value.trim() && !/[\x00-\x1f\x7f]/.test(value),
);
const httpsDomain = z.string().refine(value => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
});
const machineAuthSchema = z.object({
  clientId: safeSecret,
  clientSecret: safeSecret,
  projectId: safeSecret,
  domain: httpsDomain.optional(),
  organizationSlug: safeSecret.optional(),
}).strict();

export const secretRecordSchema = z.object({
  secretKey: z.string(),
  secretValue: z.string(),
}).refine(record => optionalVariables.some(key => key === record.secretKey) || !record.secretValue.includes('\0'));

export type SecretRecord = z.infer<typeof secretRecordSchema>;

export interface MachineAuthConfig {
  clientId: string;
  clientSecret: string;
  projectId: string;
  domain: string;
  organizationSlug?: string;
}

export type MachineAuthResult =
  | { kind: 'none' }
  | { kind: 'ok'; config: MachineAuthConfig }
  | { kind: 'error'; reason: string };

export type ApplyKisResult =
  | { ok: true }
  | { ok: false; diagnosis: string };

export type FetchKisSecretsResult =
  | { ok: true; records: SecretRecord[] }
  | { ok: false; reason: string };

/**
 * INFISICAL_DOMAIN 환경변수 또는 기본 Infisical HTTPS 도메인을 검증·정규화해 반환한다.
 * 잘못된 형식이 지정된 경우 null을 반환한다.
 */
export function resolveInfisicalDomain(env: NodeJS.ProcessEnv): string | null {
  const raw = env.INFISICAL_DOMAIN;
  if (raw === undefined || raw === '') return DEFAULT_INFISICAL_DOMAIN;
  if (!httpsDomain.safeParse(raw).success) return null;
  return raw.replace(/\/+$/, '');
}

/**
 * Infisical Machine Identity(Universal Auth) 설정을 환경변수 또는 로컬 파일에서 안전하게 읽는다.
 * 환경변수가 일부라도 존재하면 CLI 폴백 없이 필수 항목·형식을 검증해 실패를 명시한다.
 */
export function readMachineAuthConfig(env: NodeJS.ProcessEnv, cwd = process.cwd()): MachineAuthResult {
  const hasEnvClient = Boolean(env.INFISICAL_CLIENT_ID !== undefined && env.INFISICAL_CLIENT_ID !== '');
  const hasEnvSecret = Boolean(env.INFISICAL_CLIENT_SECRET !== undefined && env.INFISICAL_CLIENT_SECRET !== '');
  if (hasEnvClient || hasEnvSecret) {
    const invalidFields: string[] = [];
    if (!safeSecret.safeParse(env.INFISICAL_CLIENT_ID ?? '').success) invalidFields.push('INFISICAL_CLIENT_ID');
    if (!safeSecret.safeParse(env.INFISICAL_CLIENT_SECRET ?? '').success) invalidFields.push('INFISICAL_CLIENT_SECRET');
    if (!safeSecret.safeParse(env.INFISICAL_PROJECT_ID ?? '').success) invalidFields.push('INFISICAL_PROJECT_ID');
    const rawDomain = env.INFISICAL_DOMAIN;
    if (rawDomain !== undefined && rawDomain !== '' && !httpsDomain.safeParse(rawDomain).success) {
      invalidFields.push('INFISICAL_DOMAIN');
    }
    const rawOrgSlug = env.INFISICAL_ORGANIZATION_SLUG;
    if (rawOrgSlug !== undefined && rawOrgSlug !== '' && !safeSecret.safeParse(rawOrgSlug).success) {
      invalidFields.push('INFISICAL_ORGANIZATION_SLUG');
    }
    if (invalidFields.length > 0) {
      return {
        kind: 'error',
        reason: `환경변수 누락 또는 형식을 확인하세요 (${invalidFields.join(', ')}).`,
      };
    }
    return {
      kind: 'ok',
      config: {
        clientId: env.INFISICAL_CLIENT_ID!,
        clientSecret: env.INFISICAL_CLIENT_SECRET!,
        projectId: env.INFISICAL_PROJECT_ID!,
        domain: (rawDomain || DEFAULT_INFISICAL_DOMAIN).replace(/\/+$/, ''),
        ...(rawOrgSlug ? { organizationSlug: rawOrgSlug } : {}),
      },
    };
  }

  if (env.INFISICAL_AUTH_FILE === '') return { kind: 'none' };
  const filePath = resolve(cwd, env.INFISICAL_AUTH_FILE || DEFAULT_AUTH_FILE);
  let fd: number;
  try {
    fd = openSync(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return { kind: 'none' };
    if (code === 'ELOOP') return { kind: 'error', reason: '머신 인증 파일에 심볼릭 링크는 허용하지 않습니다.' };
    return { kind: 'error', reason: '머신 인증 파일을 읽지 못했습니다.' };
  }

  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_AUTH_FILE_BYTES) {
      return { kind: 'error', reason: '머신 인증 파일 형식이 올바르지 않습니다.' };
    }
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
      return { kind: 'error', reason: '머신 인증 파일 권한을 0600으로 제한하세요 (chmod 600 .secrets/infisical-dev.json).' };
    }
    const dirStat = lstatSync(dirname(filePath));
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
      return { kind: 'error', reason: '머신 인증 디렉터리에 심볼릭 링크는 허용하지 않습니다.' };
    }
    if (process.platform !== 'win32' && (dirStat.mode & 0o077) !== 0) {
      return { kind: 'error', reason: '머신 인증 디렉터리 권한을 0700으로 제한하세요.' };
    }
    const raw = readFileSync(fd, 'utf8');
    const parsed = machineAuthSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return {
        kind: 'error',
        reason: '머신 인증 파일의 필수 항목(clientId, clientSecret, projectId) 또는 https domain 형식을 확인하세요.',
      };
    }
    let resolvedDomain = parsed.data.domain?.replace(/\/+$/, '');
    if (!resolvedDomain) {
      const envDomain = resolveInfisicalDomain(env);
      if (!envDomain) {
        return { kind: 'error', reason: 'INFISICAL_DOMAIN은 인증정보·쿼리가 없는 HTTPS 주소여야 합니다.' };
      }
      resolvedDomain = envDomain;
    }
    return {
      kind: 'ok',
      config: {
        clientId: parsed.data.clientId,
        clientSecret: parsed.data.clientSecret,
        projectId: parsed.data.projectId,
        domain: resolvedDomain,
        ...(parsed.data.organizationSlug ? { organizationSlug: parsed.data.organizationSlug } : {}),
      },
    };
  } catch {
    return {
      kind: 'error',
      reason: '머신 인증 파일의 JSON 형식과 필수 항목을 확인하세요.',
    };
  } finally {
    closeSync(fd);
  }
}

export function applyOptionalRecords(env: NodeJS.ProcessEnv, records: SecretRecord[]): void {
  for (const key of optionalVariables) {
    const value = records.findLast(record => record.secretKey === key)?.secretValue;
    if (!env[key]?.trim() && safeSecret.safeParse(value).success) env[key] = value;
  }
}

/**
 * 조회한 비밀 목록에서 KIS 필수 4개 키를 all-or-nothing으로 검증·주입한다.
 * 실패 시 비밀값 없이 누락·충돌 키 이름만 진단 문자열로 반환한다.
 */
export function applyKisRecords(env: NodeJS.ProcessEnv, records: SecretRecord[]): ApplyKisResult {
  const values = new Map(records.map(record => [record.secretKey, record.secretValue]));
  const missingKeys = kisVariables.filter(key => !values.get(key)?.trim());
  const conflictKeys = kisVariables.filter(key => env[key]?.trim() && values.get(key)?.trim() && env[key] !== values.get(key));
  if (!missingKeys.length && !conflictKeys.length) {
    for (const key of kisVariables) env[key] = values.get(key);
    applyOptionalRecords(env, records);
    return { ok: true };
  }
  const details: string[] = [];
  if (missingKeys.length) details.push(`누락 항목: ${missingKeys.join(', ')}`);
  if (conflictKeys.length) details.push(`기존 환경변수와 불일치: ${conflictKeys.join(', ')}`);
  return { ok: false, diagnosis: details.length ? ` (${details.join(' · ')})` : '' };
}

const loginResponseSchema = z.object({
  accessToken: z.string().refine(value => value.length > 0 && !/[\x00-\x1f\x7f]/.test(value)),
});
const secretsResponseSchema = z.object({
  secrets: z.array(secretRecordSchema),
  imports: z.array(z.object({ secrets: z.array(secretRecordSchema) })).optional(),
});

/**
 * Infisical Universal Auth로 단기 Access Token을 메모리 발급받은 뒤 dev /kis 비밀을 조회한다.
 * 토큰과 비밀 응답 원문은 오류 사유에 포함하지 않는다.
 */
export async function fetchKisSecretsViaUniversalAuth(
  config: MachineAuthConfig,
  transport: typeof fetch = fetch,
  { projectId = config.projectId, secretPath = '/kis' }: { projectId?: string; secretPath?: string } = {},
): Promise<FetchKisSecretsResult> {
  let accessToken: string;
  try {
    const loginRes = await transport(`${config.domain}/api/v1/auth/universal-auth/login`, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        ...(config.organizationSlug ? { organizationSlug: config.organizationSlug } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!loginRes.ok) {
      return { ok: false, reason: `Universal Auth 인증 실패 (HTTP ${loginRes.status})` };
    }
    const parsedLogin = loginResponseSchema.safeParse(await loginRes.json());
    if (!parsedLogin.success) {
      return { ok: false, reason: 'Universal Auth 응답 형식을 확인할 수 없습니다' };
    }
    accessToken = parsedLogin.data.accessToken;
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === 'TimeoutError';
    return { ok: false, reason: timeout ? 'Universal Auth 요청 시간 초과' : 'Universal Auth 연결 또는 응답 확인 실패' };
  }

  try {
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
    const v4Query = new URLSearchParams({
      projectId,
      environment: 'dev',
      secretPath,
      viewSecretValue: 'true',
      expandSecretReferences: 'true',
      includeImports: 'true',
      recursive: 'false',
    });
    let secretsRes = await transport(`${config.domain}/api/v4/secrets?${v4Query}`, {
      method: 'GET',
      redirect: 'error',
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (secretsRes.status === 404) {
      const v3Query = new URLSearchParams({
        workspaceId: projectId,
        environment: 'dev',
        secretPath,
        expandSecretReferences: 'true',
        include_imports: 'true',
      });
      secretsRes = await transport(`${config.domain}/api/v3/secrets/raw?${v3Query}`, {
        method: 'GET',
        redirect: 'error',
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    }
    if (!secretsRes.ok) {
      return { ok: false, reason: `Infisical 비밀 조회 실패 (HTTP ${secretsRes.status})` };
    }
    const parsedSecrets = secretsResponseSchema.safeParse(await secretsRes.json());
    if (!parsedSecrets.success) {
      return { ok: false, reason: 'Infisical 비밀 응답 형식을 확인할 수 없습니다' };
    }
    const imported = (parsedSecrets.data.imports ?? []).flatMap(entry => entry.secrets);
    return { ok: true, records: [...imported, ...parsedSecrets.data.secrets] };
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === 'TimeoutError';
    return { ok: false, reason: timeout ? 'Infisical 비밀 조회 시간 초과' : 'Infisical 비밀 조회 연결 또는 응답 확인 실패' };
  }
}

/**
 * 자식 프로세스 환경에서 INFISICAL_* 자격증명·설정 변수를 제거한다.
 */
export function stripInfisicalEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !name.startsWith('INFISICAL_')));
}
