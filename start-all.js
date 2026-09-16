import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n==================================================');
console.log('       🏥 CareOClock — Starting All Services       ');
console.log('==================================================\n');

const services = [
  {
    name: 'AI-ENGINE',
    cwd: path.join(__dirname, 'ai-engine'),
    cmd: 'python',
    args: ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'],
    color: '\x1b[35m', // Magenta
  },
  {
    name: 'BACKEND  ',
    cwd: path.join(__dirname, 'server'),
    cmd: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'dev'],
    color: '\x1b[34m', // Blue
  },
  {
    name: 'FRONTEND ',
    cwd: path.join(__dirname, 'client'),
    cmd: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'dev'],
    color: '\x1b[32m', // Green
  },
];

const children = [];

function startService(service) {
  const child = spawn(service.cmd, service.args, {
    cwd: service.cwd,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  child.stdout.on('data', (data) => {
    const lines = data.toString().trimEnd().split('\n');
    for (const line of lines) {
      console.log(`${service.color}[${service.name}]\x1b[0m ${line}`);
    }
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().trimEnd().split('\n');
    for (const line of lines) {
      console.error(`${service.color}[${service.name}]\x1b[0m ${line}`);
    }
  });

  child.on('exit', (code, signal) => {
    console.log(`${service.color}[${service.name}]\x1b[0m exited with code ${code || signal}`);
  });

  children.push(child);
}

for (const service of services) {
  startService(service);
}

console.log('Services launching:');
console.log('  ➜ AI Engine:  http://127.0.0.1:8000');
console.log('  ➜ Backend:    http://127.0.0.1:5000');
console.log('  ➜ Frontend:   http://127.0.0.1:5173\n');
console.log('Press Ctrl+C to terminate all services.\n');

function shutdown() {
  console.log('\nStopping all services...');
  for (const child of children) {
    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t']);
      } catch {
        child.kill('SIGTERM');
      }
    } else {
      child.kill('SIGTERM');
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
