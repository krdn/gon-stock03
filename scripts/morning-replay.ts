import { readFileSync } from 'node:fs';
import { compareMorningPolicies } from '../server/morning-replay.ts';
if (!process.argv[2]) throw new Error('시간순 국내 장중 관측 JSON 경로를 지정하세요.');
console.log(JSON.stringify(compareMorningPolicies(JSON.parse(readFileSync(process.argv[2], 'utf8'))), null, 2));
