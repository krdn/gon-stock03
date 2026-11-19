import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseAst } from 'rolldown/parseAst';
import { screens } from '../../src/specs';

type Kind = 'acceptance' | 'failure' | 'behavior';
type Check = [kind: Kind, requirement: string, state: string, file: string | null, test: string | null, level?: string, reference?: string];
const checks: Record<string, Check[]> = JSON.parse(readFileSync('scripts/pilot/checks.json', 'utf8'));
const registry = new Map(screens.map(screen => ['/' + screen.id, screen] as const));
const common = '공통 서비스';
const rows: object[] = [];

function row(feature: string, kind: string, requirement: string, state: string, evidenceLevel: string, reason: string, details: Record<string, unknown> = {}) {
  rows.push({ feature, kind, requirement, state, evidenceLevel, status: '미측정', reason, executionSha: null, observation: null, ...details });
}

function isFile(path: string) {
  return statSync(path, { throwIfNoEntry: false })?.isFile() === true;
}

// ESTree의 구문 노드만 순회한다. 검사 파일과 라우터 모듈은 실행하지 않는다.
type AstNode = { type: string; [field: string]: unknown };
function isNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string';
}

function child(node: AstNode | undefined, field: string) {
  const value = node?.[field];
  return isNode(value) ? value : undefined;
}

function children(node: AstNode | undefined, field: string): AstNode[] {
  const value = node?.[field];
  return Array.isArray(value) ? value.filter(isNode) : [];
}

function eachChild(node: AstNode, visit: (node: AstNode) => void) {
  for (const value of Object.values(node)) {
    if (isNode(value)) visit(value);
    else if (Array.isArray(value)) for (const item of value) if (isNode(item)) visit(item);
  }
}

function parse(file: string) {
  const text = readFileSync(file, 'utf8');
  const program = parseAst(text, { lang: file.endsWith('.tsx') ? 'tsx' : file.endsWith('.jsx') ? 'jsx' : 'ts' }, file);
  return { text, program };
}

function member(node: AstNode | undefined, object: string, property: string) {
  return node?.type === 'MemberExpression' && !node.computed && child(node, 'object')?.name === object && child(node, 'property')?.name === property;
}

function literal(node: AstNode | undefined) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  return undefined;
}

const testFiles = new Map<string, Set<string> | null>();
function testNames(file: string) {
  if (!testFiles.has(file)) {
    if (!isFile(file)) {
      testFiles.set(file, null);
    } else {
      const { text, program } = parse(file);
      const names = new Set<string>();
      function visit(node: AstNode) {
        if (node.type === 'CallExpression') {
          const callee = child(node, 'callee');
          if (callee?.name === 'test' || callee?.name === 'it' || member(callee, 'test', 'only') || member(callee, 'it', 'only')) {
            const title = children(node, 'arguments')[0];
            const name = literal(title);
            if (name !== undefined) names.add(name);
            else if (title?.type === 'TemplateLiteral' && typeof title.start === 'number' && typeof title.end === 'number') names.add(text.slice(title.start + 1, title.end - 1));
          }
        }
        eachChild(node, visit);
      }
      if (isNode(program)) visit(program);
      testFiles.set(file, names);
    }
  }
  return testFiles.get(file);
}

function* jsxFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* jsxFiles(path);
    else if (entry.isFile() && /\.[jt]sx$/.test(entry.name)) yield path;
  }
}

const routes = new Map<string, string[]>();
for (const file of jsxFiles('src')) {
  const { text, program } = parse(file);
  function visit(node: AstNode, parentPath: string, screenVariable: string, parent?: AstNode) {
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') && parent?.type === 'CallExpression' && member(child(parent, 'callee'), 'screens', 'map')) {
      const parameter = children(node, 'params')[0]?.name;
      screenVariable = typeof parameter === 'string' ? parameter : '';
    }
    const tag = child(node, 'openingElement');
    if (tag && child(tag, 'name')?.name === 'Route') {
      const attr = children(tag, 'attributes').find(item => item.type === 'JSXAttribute' && child(item, 'name')?.name === 'path');
      if (attr) {
        const value = child(attr, 'value');
        const expr = value?.type === 'JSXExpressionContainer' ? child(value, 'expression') : value;
        const pathText = literal(expr);
        let parts: string[] = [];
        if (pathText !== undefined) parts = [pathText];
        else if (screenVariable && expr?.type === 'BinaryExpression' && expr.operator === '+' && literal(child(expr, 'left')) === '/' && member(child(expr, 'right'), screenVariable, 'id')) parts = [...registry.keys()];
        const line = text.slice(0, Number(tag.start)).split('\n').length;
        const location = `${file}:${line}`;
        if (!parts.length) row(text.slice(Number(attr.start), Number(attr.end)), 'route', '라우트 경로 식별', '동적 경로', '라우팅 소스', '경로식을 해석할 수 없음', { source: location });
        for (const part of parts) {
          const path = part.startsWith('/') || (!parentPath && part === '*') ? part : `${parentPath.replace(/\/$/, '')}/${part}`;
          const locations = routes.get(path) ?? [];
          locations.push(location);
          routes.set(path, locations);
          for (const nested of children(node, 'children')) visit(nested, path, screenVariable, node);
        }
        return;
      }
    }
    eachChild(node, nested => visit(nested, parentPath, screenVariable, node));
  }
  if (isNode(program)) visit(program, '', '');
}

const features = new Set([...registry.keys(), ...routes.keys(), ...Object.keys(checks), common]);
for (const feature of features) {
  const screen = registry.get(feature);
  const entries = checks[feature] ?? [];
  if (feature !== common && !routes.has(feature)) row(feature, 'route', '라우트 선언', '경로 없음', '라우팅 소스', '명세 또는 매핑에 있는 경로를 라우터에서 찾을 수 없음');
  if (!entries.length) row(feature, screen ? 'screen' : 'feature', '기능별 검사 연결', '매핑 없음', '근거 미연결', '기능의 상태별 검사 매핑 없음', { sources: routes.get(feature) ?? [] });
  if (screen) {
    const source = screen.work.evidence;
    if (!source || !isFile(source)) row(feature, 'design', '설계 명세의 구현 근거', '파일 없음', '설계 소스', '명세에 지정한 구현 파일을 찾을 수 없음', { source });
    for (const kind of ['acceptance', 'failure'] as const) {
      for (const requirement of screen[kind]) {
        if (!entries.some(([k, text]) => k === kind && text === requirement)) row(feature, kind, requirement, '상태별 근거 미연결', '근거 미연결', '현재 명세 문구와 일치하는 매핑 없음');
      }
    }
  }
  for (const [kind, requirement, state, file, test, level, reference] of entries) {
    const reasons: string[] = [];
    if (kind !== 'behavior' && !screen?.[kind].includes(requirement)) reasons.push('매핑의 원래 명세 문구가 사라지거나 변경됨');
    if (file && test) {
      const titles = testNames(file);
      if (!titles) reasons.push('테스트 파일 없음');
      else if (!titles.has(test)) reasons.push('지정 파일에 해당 테스트 선언 없음');
      else reasons.push('검사 선언 확인, 실행 SHA와 관찰 결과 없음');
    } else reasons.push(reference ? '기록 참조, 이 실행에서 독립 관찰 없음' : '관찰 근거 없음');
    const evidence = level ?? (file?.startsWith('tests/browser/') ? '브라우저 재생' : '서버·통합 검사');
    row(feature, kind, requirement, state, evidence, reasons.join(' / '), { testPath: file, testName: test, ...(reference ? { reference } : {}) });
  }
}

console.log(JSON.stringify({ rows }, null, 2));
