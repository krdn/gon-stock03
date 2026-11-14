import { spawn } from 'node:child_process';
const children = ['dev:server', 'dev:web'].map(script => spawn('npm', ['run', script], { stdio: 'inherit' }));
let stopping = false;
function stop() { if (stopping) return; stopping = true; children.forEach(child => child.kill('SIGTERM')); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
children.forEach(child => child.on('exit', code => { stop(); process.exitCode = code ?? 0; }));
