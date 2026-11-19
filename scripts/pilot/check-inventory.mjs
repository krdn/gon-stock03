// Run from the repository root with the lockfile dependencies prepared.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const inventory = cwd => JSON.parse(execFileSync(process.execPath,
  ['--import', 'tsx', 'scripts/pilot/inventory.ts'], {cwd, encoding: 'utf8'}));
const original = inventory(process.cwd());
const fixture = mkdtempSync(join(tmpdir(), 'pilot-inventory-'));
try {
  for (const path of ['src', 'tests', 'package.json', 'scripts/pilot/inventory.ts', 'scripts/pilot/checks.json']) {
    cpSync(path, join(fixture, path), {recursive: true});
  }
  symlinkSync(resolve('node_modules'), join(fixture, 'node_modules'), 'dir');
  appendFileSync(join(fixture, 'src/specs.ts'), '\nscreens[0].acceptance.push("추가 수용 조건 표식");\nscreens.push({...screens[0], id:"pilot-screen-probe"});\n');
  const router = join(fixture, 'src/App.tsx');
  const routes = readFileSync(router, 'utf8');
  assert.ok(routes.includes('</Routes>'));
  writeFileSync(router, routes.replace('</Routes>', '<Route path="/pilot-route-probe" element={<span/>}/></Routes>'));
  const example = original.rows.find(row => row.feature === '/dashboard' && row.lookup === 'declared');
  const testFile = join(fixture, example.testPath);
  const suite = readFileSync(testFile, 'utf8');
  assert.ok(suite.includes(example.testName));
  writeFileSync(testFile, suite.replaceAll(example.testName, 'renamed pilot test declaration'));
  const {rows} = inventory(fixture);
  const mutation = {
    newScreen: rows.some(row => row.feature === '/pilot-screen-probe' && row.reason.includes('매핑 없음')),
    newRoute: rows.some(row => row.feature === '/pilot-route-probe' && row.reason.includes('매핑 없음')),
    newRequirement: rows.some(row => row.feature === '/dashboard' && row.requirement === '추가 수용 조건 표식' && row.reason.includes('매핑 없음')),
    missingTest: rows.some(row => row.testName === example.testName && row.lookup === 'missingTitle'),
  };
  const linkedTestsByFeature = Object.fromEntries([...new Set(original.rows.map(row => row.feature))].sort().map(
    feature => [feature, original.rows.filter(row => row.feature === feature && row.lookup === 'declared').length]));
  assert.ok(Object.values(mutation).every(Boolean));
  console.log(JSON.stringify({...original.summary, unknown: original.rows.filter(row => row.status === '미측정').length, linkedTestsByFeature, mutation}, null, 2));
} finally {
  rmSync(fixture, {recursive: true, force: true});
}
