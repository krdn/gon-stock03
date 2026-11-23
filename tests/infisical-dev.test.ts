import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import viteConfig from '../vite.config.ts';
import {
  applyKisRecords,
  DEFAULT_INFISICAL_DOMAIN,
  fetchKisSecretsViaUniversalAuth,
  readMachineAuthConfig,
  stripInfisicalEnv,
} from '../scripts/infisical-dev.ts';

const baseConfig = {
  clientId: 'fixture-client-id',
  clientSecret: 'fixture-client-secret',
  projectId: 'fixture-project-id',
  domain: DEFAULT_INFISICAL_DOMAIN,
};

const fullSecrets = [
  { secretKey: 'KIS_APP_KEY', secretValue: 'fixture-app' },
  { secretKey: 'KIS_APP_SECRET', secretValue: 'fixture-secret' },
  { secretKey: 'KIS_CANO', secretValue: '12345678' },
  { secretKey: 'KIS_ACNT_PRDT_CD', secretValue: '01' },
  { secretKey: 'KIS_STRATEGY_CONTRACT', secretValue: 'unexpected-contract' },
];

test('readMachineAuthConfig reads valid env credentials without falling back to CLI and keeps PROJECT_ID-only on CLI', () => {
  const projectIdOnly = readMachineAuthConfig({
    INFISICAL_PROJECT_ID: 'fixture-project-id',
    INFISICAL_AUTH_FILE: '',
  });
  assert.equal(projectIdOnly.kind, 'none');

  const res = readMachineAuthConfig({
    INFISICAL_CLIENT_ID: 'fixture-client-id',
    INFISICAL_CLIENT_SECRET: 'fixture-client-secret',
    INFISICAL_PROJECT_ID: 'fixture-project-id',
    INFISICAL_DOMAIN: 'https://eu.infisical.com/',
  });
  assert.equal(res.kind, 'ok');
  if (res.kind === 'ok') {
    assert.equal(res.config.domain, 'https://eu.infisical.com');
    assert.equal(res.config.projectId, 'fixture-project-id');
  }

  const missingProject = readMachineAuthConfig({
    INFISICAL_CLIENT_ID: 'fixture-client-id',
    INFISICAL_CLIENT_SECRET: 'fixture-client-secret',
  });
  assert.equal(missingProject.kind, 'error');
  if (missingProject.kind === 'error') {
    assert.match(missingProject.reason, /INFISICAL_PROJECT_ID/);
    assert.doesNotMatch(missingProject.reason, /fixture-client/);
  }

  const badDomain = readMachineAuthConfig({
    INFISICAL_CLIENT_ID: 'fixture-client-id',
    INFISICAL_CLIENT_SECRET: 'fixture-client-secret',
    INFISICAL_PROJECT_ID: 'fixture-project-id',
    INFISICAL_DOMAIN: 'http://insecure.local',
  });
  assert.equal(badDomain.kind, 'error');
});

test('readMachineAuthConfig enforces 0600 file, 0700 directory, size, https domain, and rejects symlinks', () => {
  const root = mkdtempSync(join(tmpdir(), 'gon-infisical-auth-'));
  try {
    const missing = readMachineAuthConfig({}, root);
    assert.equal(missing.kind, 'none');

    const secretsDir = join(root, '.secrets');
    mkdirSync(secretsDir, { mode: 0o700 });
    const filePath = join(secretsDir, 'infisical-dev.json');
    writeFileSync(filePath, JSON.stringify({
      clientId: 'fixture-client-id',
      clientSecret: 'fixture-client-secret',
      projectId: 'fixture-project-id',
    }), { mode: 0o600 });

    const valid = readMachineAuthConfig({}, root);
    assert.equal(valid.kind, 'ok');

    const withEnvDomain = readMachineAuthConfig({ INFISICAL_DOMAIN: 'https://eu.infisical.com/' }, root);
    assert.equal(withEnvDomain.kind, 'ok');
    if (withEnvDomain.kind === 'ok') assert.equal(withEnvDomain.config.domain, 'https://eu.infisical.com');

    const badEnvDomain = readMachineAuthConfig({ INFISICAL_DOMAIN: 'http://insecure.local' }, root);
    assert.equal(badEnvDomain.kind, 'error');

    chmodSync(filePath, 0o644);
    const looseFile = readMachineAuthConfig({}, root);
    assert.equal(looseFile.kind, 'error');
    if (looseFile.kind === 'error') assert.match(looseFile.reason, /0600/);

    chmodSync(filePath, 0o600);
    chmodSync(secretsDir, 0o755);
    const groupReadDir = readMachineAuthConfig({}, root);
    assert.equal(groupReadDir.kind, 'error');
    if (groupReadDir.kind === 'error') assert.match(groupReadDir.reason, /0700/);

    chmodSync(secretsDir, 0o700);
    const linkPath = join(secretsDir, 'link.json');
    symlinkSync(filePath, linkPath);
    const linked = readMachineAuthConfig({ INFISICAL_AUTH_FILE: linkPath }, root);
    assert.equal(linked.kind, 'error');
    if (linked.kind === 'error') assert.match(linked.reason, /심볼릭 링크/);

    const dirLink = join(root, 'linked-dir');
    symlinkSync(secretsDir, dirLink);
    const linkedDirFile = readMachineAuthConfig({ INFISICAL_AUTH_FILE: join(dirLink, 'infisical-dev.json') }, root);
    assert.equal(linkedDirFile.kind, 'error');
    if (linkedDirFile.kind === 'error') assert.match(linkedDirFile.reason, /심볼릭 링크/);

    writeFileSync(filePath, JSON.stringify({
      clientId: 'fixture-client-id',
      clientSecret: 'fixture-client-secret',
      projectId: 'fixture-project-id',
      domain: 'http://insecure.local',
    }), { mode: 0o600 });
    const badFileDomain = readMachineAuthConfig({}, root);
    assert.equal(badFileDomain.kind, 'error');

    writeFileSync(filePath, 'x'.repeat(20_000), { mode: 0o600 });
    const oversized = readMachineAuthConfig({}, root);
    assert.equal(oversized.kind, 'error');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fetchKisSecretsViaUniversalAuth verifies v4 query contract, imports override, v3 404 fallback, and hides secrets on errors', async () => {
  const calls: string[] = [];
  const v4 = await fetchKisSecretsViaUniversalAuth(baseConfig, async (url, init) => {
    calls.push(String(url));
    if (String(url).endsWith('/api/v1/auth/universal-auth/login')) {
      assert.equal(init?.method, 'POST');
      assert.equal(init?.redirect, 'error');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.clientId, baseConfig.clientId);
      assert.equal(body.clientSecret, baseConfig.clientSecret);
      return Response.json({ accessToken: 'fixture-jwt-token', expiresIn: 7200 });
    }
    const parsedUrl = new URL(String(url));
    assert.equal(parsedUrl.pathname, '/api/v4/secrets');
    assert.equal(parsedUrl.searchParams.get('projectId'), baseConfig.projectId);
    assert.equal(parsedUrl.searchParams.get('environment'), 'dev');
    assert.equal(parsedUrl.searchParams.get('secretPath'), '/kis');
    assert.equal(parsedUrl.searchParams.get('viewSecretValue'), 'true');
    assert.equal(parsedUrl.searchParams.get('expandSecretReferences'), 'true');
    assert.equal(parsedUrl.searchParams.get('includeImports'), 'true');
    assert.equal(parsedUrl.searchParams.get('recursive'), 'false');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer fixture-jwt-token');
    return Response.json({
      imports: [{ secrets: [{ secretKey: 'KIS_APP_KEY', secretValue: 'imported-older-key' }] }],
      secrets: fullSecrets,
    });
  });
  assert.equal(v4.ok, true);
  assert.equal(calls.length, 2);
  if (v4.ok) {
    const env: NodeJS.ProcessEnv = {};
    const applied = applyKisRecords(env, v4.records);
    assert.equal(applied.ok, true);
    assert.equal(env.KIS_APP_KEY, 'fixture-app');
    assert.equal(env.KIS_STRATEGY_CONTRACT, undefined);
  }

  const v3Calls: string[] = [];
  const v3 = await fetchKisSecretsViaUniversalAuth(baseConfig, async url => {
    v3Calls.push(String(url));
    if (String(url).endsWith('/login')) return Response.json({ accessToken: 'fixture-jwt-token' });
    if (String(url).includes('/api/v4/secrets')) return new Response('not found', { status: 404 });
    assert.match(String(url), /\/api\/v3\/secrets\/raw\?/);
    return Response.json({ secrets: fullSecrets });
  });
  assert.equal(v3.ok, true);
  assert.equal(v3Calls.length, 3);

  for (const mode of ['login-401', 'secrets-500', 'bad-json', 'throw'] as const) {
    const bad = await fetchKisSecretsViaUniversalAuth(baseConfig, async url => {
      if (mode === 'throw') throw new Error('fixture-client-secret fixture-jwt-token');
      if (String(url).endsWith('/login')) {
        return mode === 'login-401' ? new Response('fixture-client-secret', { status: 401 }) : Response.json({ accessToken: 'fixture-jwt-token' });
      }
      if (mode === 'bad-json') return new Response('fixture-jwt-token');
      return new Response('fixture-app-secret', { status: 500 });
    });
    assert.equal(bad.ok, false);
    if (!bad.ok) {
      for (const secret of ['fixture-client-id', 'fixture-client-secret', 'fixture-jwt-token', 'fixture-app-secret']) {
        assert.ok(!bad.reason.includes(secret));
      }
    }
  }
});

test('applyKisRecords stays all-or-nothing and stripInfisicalEnv removes INFISICAL_* variables', () => {
  const partialEnv: NodeJS.ProcessEnv = {};
  const partial = applyKisRecords(partialEnv, fullSecrets.slice(0, 3));
  assert.equal(partial.ok, false);
  if (!partial.ok) assert.match(partial.diagnosis, /KIS_ACNT_PRDT_CD/);
  assert.equal(partialEnv.KIS_APP_KEY, undefined);

  const conflictEnv: NodeJS.ProcessEnv = { KIS_APP_KEY: 'other-secret-key' };
  const conflict = applyKisRecords(conflictEnv, fullSecrets);
  assert.equal(conflict.ok, false);
  if (!conflict.ok) {
    assert.match(conflict.diagnosis, /KIS_APP_KEY/);
    assert.doesNotMatch(conflict.diagnosis, /other-secret-key|fixture-app/);
  }
  assert.equal(conflictEnv.KIS_APP_SECRET, undefined);

  const stripped = stripInfisicalEnv({ KIS_APP_KEY: 'k', INFISICAL_CLIENT_SECRET: 's', INFISICAL_PROJECT_ID: 'p' });
  assert.equal(stripped.KIS_APP_KEY, 'k');
  assert.equal(stripped.INFISICAL_CLIENT_SECRET, undefined);
  assert.equal(stripped.INFISICAL_PROJECT_ID, undefined);
});

test('scripts/dev.ts uses machine auth file without invoking CLI and handles machine error or CLI timeout safely', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gon-dev-machine-'));
  try {
    const secretsDir = join(dir, '.secrets');
    mkdirSync(secretsDir, { mode: 0o700 });
    const authFile = join(secretsDir, 'infisical-dev.json');
    writeFileSync(authFile, JSON.stringify({
      clientId: 'fixture-client-id',
      clientSecret: 'fixture-client-secret',
      projectId: 'fixture-project-id',
    }), { mode: 0o600 });

    const preload = join(dir, 'preload.mjs');
    writeFileSync(preload, `
      import assert from 'node:assert/strict';
      import cp from 'node:child_process';
      import { syncBuiltinESMExports } from 'node:module';
      import { EventEmitter } from 'node:events';

      cp.spawnSync = () => {
        if (process.env.EXPECT_CLI_TIMEOUT === '1') {
          return { status: null, error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }) };
        }
        assert.fail('CLI must not run for machine auth cases');
      };
      globalThis.fetch = async (url) => {
        if (String(url).endsWith('/api/v1/auth/universal-auth/login')) {
          return Response.json({ accessToken: 'fixture-jwt-token', expiresIn: 7200 });
        }
        return Response.json({
          secrets: [
            { secretKey: 'KIS_APP_KEY', secretValue: 'fixture-app' },
            { secretKey: 'KIS_APP_SECRET', secretValue: 'fixture-secret' },
            { secretKey: 'KIS_CANO', secretValue: '12345678' },
            { secretKey: 'KIS_ACNT_PRDT_CD', secretValue: '01' },
          ],
        });
      };
      cp.spawn = (command, args, options) => {
        const env = options?.env ?? {};
        assert.equal(command, 'npm');
        assert.ok(Object.keys(env).every(key => !key.startsWith('INFISICAL_')));
        if (args[1] === 'dev:server' && process.env.EXPECT_INJECTED === '1') {
          assert.equal(env.KIS_APP_KEY, 'fixture-app');
          assert.equal(env.KIS_APP_SECRET, 'fixture-secret');
          assert.equal(env.KIS_CANO, '12345678');
          assert.equal(env.KIS_ACNT_PRDT_CD, '01');
        } else {
          assert.ok(Object.keys(env).every(key => !key.startsWith('KIS_')));
        }
        console.log('CHILD ' + args[1]);
        const child = new EventEmitter();
        child.kill = () => true;
        process.nextTick(() => child.emit('exit', 0));
        return child;
      };
      syncBuiltinESMExports();
    `);

    const runDev = (extra: NodeJS.ProcessEnv) => spawnSync(
      process.execPath,
      ['--import', 'tsx', '--import', pathToFileURL(preload).href, 'scripts/dev.ts'],
      {
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          INFISICAL_CLIENT_ID: undefined,
          INFISICAL_CLIENT_SECRET: undefined,
          INFISICAL_PROJECT_ID: undefined,
          KIS_APP_KEY: undefined,
          KIS_APP_SECRET: undefined,
          KIS_CANO: undefined,
          KIS_ACNT_PRDT_CD: undefined,
          ...extra,
        },
      },
    );

    const ok = runDev({ INFISICAL_AUTH_FILE: authFile, EXPECT_INJECTED: '1' });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /CHILD dev:server/);
    assert.match(ok.stdout, /CHILD dev:web/);
    assert.doesNotMatch(ok.stdout + ok.stderr, /fixture-client|fixture-jwt|fixture-secret/);

    chmodSync(authFile, 0o644);
    const badPerm = runDev({ INFISICAL_AUTH_FILE: authFile, EXPECT_INJECTED: '0' });
    assert.equal(badPerm.status, 0, badPerm.stderr);
    assert.match(badPerm.stderr, /0600/);
    assert.match(badPerm.stdout, /CHILD dev:server/);

    const cliTimeout = runDev({ INFISICAL_AUTH_FILE: '', EXPECT_CLI_TIMEOUT: '1', EXPECT_INJECTED: '0' });
    assert.equal(cliTimeout.status, 0, cliTimeout.stderr);
    assert.match(cliTimeout.stderr, /CLI 응답 시간 초과/);
    assert.match(cliTimeout.stdout, /CHILD dev:server/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Vite dev server blocks HTTP access to .secrets/infisical-dev.json and .local files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gon-vite-deny-'));
  try {
    const secretsDir = join(root, '.secrets');
    mkdirSync(secretsDir, { mode: 0o700 });
    const authFile = join(secretsDir, 'infisical-dev.json');
    writeFileSync(authFile, JSON.stringify({
      clientId: 'fixture-vite-client',
      clientSecret: 'fixture-vite-secret',
      projectId: 'fixture-vite-project',
    }), { mode: 0o600 });

    const server = await createServer({
      ...viteConfig,
      configFile: false,
      root,
      server: { ...viteConfig.server, host: '127.0.0.1', port: 0, ws: false },
      optimizeDeps: { noDiscovery: true },
      logLevel: 'silent',
    });
    try {
      await server.listen();
      const port = (server.httpServer?.address() as AddressInfo).port;
      const base = `http://127.0.0.1:${port}`;
      for (const path of [
        '/.secrets/infisical-dev.json',
        '/.secrets/infisical-dev.json?raw',
        '/.secrets/infisical-dev.json?url',
        '/.secrets/infisical-dev.json?import',
        `/@fs${authFile}?import`,
      ]) {
        const res = await fetch(base + path);
        assert.equal(res.status, 403, `${path} must return 403, got ${res.status}`);
        const text = await res.text();
        assert.ok(!text.includes('fixture-vite-secret'), `${path} leaked secret`);
        assert.ok(!text.includes('fixture-vite-client'), `${path} leaked clientId`);
      }
    } finally {
      await server.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
