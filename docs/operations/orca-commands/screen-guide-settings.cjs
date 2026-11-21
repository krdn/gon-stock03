// Run with Orca's packaged Electron in Node mode. This only reads or saves the named preset.
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { readFileSync, realpathSync } = require('node:fs');
const { dirname, join } = require('node:path');

const id = 'gon-stock03-screen-guide';
const label = '화면 시각화 문서 생성·갱신';
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');

async function main() {
  const [mode, repoPath, previousHash, ...extra] = process.argv.slice(2);
  if (!['verify', 'create', 'update'].includes(mode) || !repoPath || extra.length ||
      (mode === 'update' ? !/^[a-f0-9]{64}$/.test(previousHash ?? '') : previousHash !== undefined)) {
    throw new Error('Usage: verify|create <repo-path> or update <repo-path> <registered-sha256>');
  }
  const origin = execFileSync('git', ['-C', repoPath, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  assert.ok(/^(https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)krdn\/gon-stock03(?:\.git)?$/.test(origin), '다른 Git 저장소입니다.');
  const cli = process.env.ORCA_CLI_COMMAND || 'orca-ide';
  const lookup = JSON.parse(execFileSync(cli, ['repo', 'show', '--repo', 'path:' + realpathSync(repoPath), '--json'], { encoding: 'utf8' }));
  assert.equal(lookup.ok, true);
  const repo = lookup.result.repo;
  assert.equal(realpathSync(repo.path), realpathSync(repoPath));
  assert.ok(typeof repo.id === 'string' && repo.id.trim());

  const app = join(dirname(process.execPath), 'resources', 'app.asar', 'out');
  const { RuntimeClient } = require(join(app, 'cli/runtime/client.js'));
  const { TerminalQuickCommandsUpdate } = require(join(app, 'shared/rpc-contract/terminal/terminal-quick-command-params.js'));
  const { terminalQuickCommandMatchesRepo } = require(join(app, 'shared/terminal/quick-commands/terminal-quick-commands.js'));
  const client = new RuntimeClient();
  const prompt = readFileSync(join(__dirname, 'screen-guide.txt'), 'utf8');
  const target = { id, label, agent: 'codex', action: 'agent-prompt', scope: { type: 'repo', repoId: repo.id }, prompt };
  const mutation = TerminalQuickCommandsUpdate.parse({ mutation: { type: 'upsert', command: target } });
  assert.deepEqual(mutation.mutation.command, target, 'Orca 정규화가 원문을 바꿉니다. 파일 끝 개행과 등록 필드를 확인하세요.');

  async function list(reader) {
    const response = await reader.call('settings.getTerminalQuickCommands', {});
    assert.equal(response.ok, true);
    return response.result.terminalQuickCommands;
  }
  const before = await list(client);
  const matches = before.filter(c => c.id === id || (c.label === label && terminalQuickCommandMatchesRepo(c, repo.id)));
  assert.ok(matches.length <= 1, '중복된 이름 또는 명령 ID를 확인하세요.');
  const existing = matches[0];
  if (existing) {
    const { prompt: oldPrompt, ...fields } = existing;
    const { prompt: newPrompt, ...expectedFields } = target;
    assert.deepEqual(fields, expectedFields, '같은 이름·ID가 다른 설정에 사용되고 있습니다.');
    if (mode === 'update') assert.equal(sha256(oldPrompt), previousHash, '등록본이 달라졌습니다. 다시 대조하세요.');
    if (mode === 'create' && oldPrompt !== newPrompt) throw new Error('기존 본문이 다릅니다. 이전 등록본을 보존하고 update를 사용하세요.');
  } else if (mode !== 'create') {
    throw new Error('이 프로젝트에 등록된 대상 명령이 없습니다.');
  }
  if (mode !== 'verify' && existing?.prompt !== prompt) {
    const response = await client.call('settings.updateTerminalQuickCommands', mutation);
    assert.equal(response.ok, true);
  }
  const after = await list(new RuntimeClient());
  const saved = after.filter(c => c.id === id);
  assert.equal(saved.length, 1);
  const observed = saved[0];
  if (sha256(observed.prompt) !== sha256(prompt)) {
    throw new Error(`본문이 다릅니다. 등록 SHA-256 ${sha256(observed.prompt)} / 파일 ${sha256(prompt)}`);
  }
  assert.deepEqual(observed, target);
  assert.ok(terminalQuickCommandMatchesRepo(observed, repo.id));
  assert.equal(terminalQuickCommandMatchesRepo(observed, null), false);
  // An unrelated concurrent settings change must be reported, never rolled back by this helper.
  assert.ok(before.filter(c => c.id !== id).every(c => after.some(other =>
    other.id === c.id && isDeepStrictEqual(other, c))), '다른 설정도 변경됐습니다. 목록을 다시 확인하세요.');
  console.log(JSON.stringify({ id, label, scope: 'Project', agent: 'Codex', bytes: Buffer.byteLength(prompt), sha256: sha256(prompt) }));
}

main().catch(error => { console.error(error.message.split('\n')[0]); process.exitCode = 1; });
