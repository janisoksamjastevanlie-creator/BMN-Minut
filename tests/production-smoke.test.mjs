import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('production server fails safely when required MySQL configuration is missing', async () => {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    ADMIN_NIP: '199011042013011005',
    ADMIN_PASSWORD: 'test-admin-password-only'
  };
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) delete env[key];

  const serverProcess = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env,
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let output = '';
  serverProcess.stderr.setEncoding('utf8');
  serverProcess.stderr.on('data', chunk => { output = `${output}${chunk}`.slice(-4000); });
  const [code] = await new Promise((resolve, reject) => {
    serverProcess.once('error', reject);
    serverProcess.once('exit', (exitCode, signal) => resolve([exitCode, signal]));
    setTimeout(() => {
      serverProcess.kill('SIGKILL');
      reject(new Error('Server did not fail promptly when MySQL settings were absent.'));
    }, 5000).unref();
  });
  assert.equal(code, 1);
  assert.match(output, /DB_HOST, DB_USER, DB_PASSWORD, DB_NAME/);
});
