import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.ts';

const childPrelude = `
  import assert from 'node:assert/strict';
  import { chmodSync, statSync } from 'node:fs';
  import { Store } from ${JSON.stringify(new URL('../server/store.ts', import.meta.url).href)};
  const path = process.argv[1];
`;
function child(path: string, source: string) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', childPrelude + source, path], {
    encoding: 'utf8', timeout: 15000,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('KIS_'))),
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
}

for (const mask of [0o022, 0o077]) for (const existing of ['new', 'closed', 'wal']) {
  test(`private SQLite files with umask ${mask.toString(8)} and ${existing} database`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'stock03-permissions-')); const path = join(dir, 'state.sqlite');
    chmodSync(dir, 0o755); const directoryBefore = statSync(dir);
    try {
      if (existing !== 'new') child(path, `
        process.umask(0o022);
        const store = new Store(path);
        store.update(state => { state.cash = 123456; });
        ${existing === 'closed' ? 'store.close();' : ''}
        for (const suffix of ${JSON.stringify(existing === 'closed' ? [''] : ['', '-wal', '-shm'])}) chmodSync(path + suffix, 0o644);
        process.exit(0);
      `);
      const before = existing === 'new' ? undefined : statSync(path);
      child(path, `
        process.umask(${mask});
        let store = new Store(path);
        for (let attempt = 0; attempt < 2; attempt++) {
          for (const suffix of ['', '-wal', '-shm']) assert.equal(statSync(path + suffix).mode & 0o777, 0o600, suffix || 'DB');
          ${existing !== 'new' ? 'assert.equal(store.read().cash, 123456);' : ''}
          assert.equal(process.umask(), ${mask});
          store.close();
          if (!attempt) store = new Store(path);
        }
      `);
      const after = statSync(path);
      if (before) assert.deepEqual([after.ino, after.uid, after.gid], [before.ino, before.uid, before.gid]);
      const directoryAfter = statSync(dir);
      assert.deepEqual([directoryAfter.mode, directoryAfter.uid, directoryAfter.gid], [directoryBefore.mode, directoryBefore.uid, directoryBefore.gid]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

for (const suffix of ['', '-wal', '-shm']) for (const kind of ['symlink', 'hardlink', 'directory']) {
  test(`rejects ${kind} at DB${suffix} without changing the backup`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'stock03-permission-failure-')); const path = join(dir, 'state.sqlite');
    const backup = join(dir, 'backup.sqlite');
    try {
      const store = new Store(path); store.close(); copyFileSync(path, backup); chmodSync(backup, 0o644);
      const bytes = readFileSync(backup), before = statSync(backup);
      if (!suffix) rmSync(path);
      if (kind === 'symlink') symlinkSync(backup, path + suffix);
      else if (kind === 'hardlink') linkSync(backup, path + suffix);
      else mkdirSync(path + suffix);
      assert.throws(() => new Store(path));
      assert.deepEqual(readFileSync(backup), bytes);
      assert.equal(statSync(backup).mode, before.mode);
      if (suffix) assert.deepEqual(readFileSync(path), bytes);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('unwritable DB fails without truncation, and memory Store needs no files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stock03-permission-denied-')); const path = join(dir, 'state.sqlite');
  try {
    writeFileSync(path, 'preserve', { mode: 0o400 });
    assert.throws(() => new Store(path), { code: 'EACCES' });
    assert.equal(readFileSync(path, 'utf8'), 'preserve');
    const store = new Store(':memory:'); assert.ok(store.read()); store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
