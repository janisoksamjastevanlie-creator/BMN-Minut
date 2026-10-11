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
    DATA_BACKEND: 'operational',
    ADMIN_NIP: '199011042013011005',
    ADMIN_PASSWORD: 'test-admin-password-only'
  };
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) env[key] = '';

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
    }, 15000).unref();
  });
  assert.equal(code, 1);
  assert.match(output, /DB_HOST, DB_USER, DB_PASSWORD, DB_NAME/);
});

test('development server allows an empty database password and reaches the connection attempt', async () => {
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    DATA_BACKEND: 'legacy',
    DB_HOST: '127.0.0.1',
    DB_PORT: '1',
    DB_USER: 'test-user',
    DB_PASSWORD: '',
    DB_NAME: 'test-database',
    ADMIN_NIP: '199011042013011005',
    ADMIN_PASSWORD: 'test-admin-password-only'
  };
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
      reject(new Error('Server did not reach the database connection attempt.'));
    }, 15000).unref();
  });
  assert.equal(code, 1);
  assert.match(output, /Could not connect to or validate the configured database/);
  assert.doesNotMatch(output, /Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME/);
});

test('production server refuses legacy state mode before opening a database connection', async () => {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    DATA_BACKEND: 'legacy',
    DB_HOST: '127.0.0.1',
    DB_PORT: '3308',
    DB_USER: 'staging-user',
    DB_PASSWORD: 'test-only',
    DB_NAME: 'bmnminut',
    ADMIN_NIP: '199011042013011005',
    ADMIN_PASSWORD: 'test-admin-password-only'
  };
  const serverProcess = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  serverProcess.stdout.setEncoding('utf8');
  serverProcess.stderr.setEncoding('utf8');
  serverProcess.stdout.on('data', chunk => { output += chunk; });
  serverProcess.stderr.on('data', chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      serverProcess.kill();
      reject(new Error('Server did not reject production legacy mode promptly.'));
    }, 15000).unref();
    serverProcess.once('error', reject);
    serverProcess.once('exit', value => {
      clearTimeout(timeout);
      resolve(value);
    });
  });

  assert.equal(code, 1);
  assert.match(output, /Production requires DATA_BACKEND=operational/);
});

test('production server fails before connecting when Cloudflare Access configuration is missing', async () => {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    DATA_BACKEND: 'operational',
    ADMIN_NIP: '199011042013011005',
    ADMIN_PASSWORD: 'test-admin-password-only',
    DB_HOST: '127.0.0.1',
    DB_PORT: '3306',
    DB_USER: 'test-user',
    DB_PASSWORD: 'test-password',
    DB_NAME: 'test-database',
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: '',
    CLOUDFLARE_ACCESS_AUD: ''
  };

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
      reject(new Error('Server did not fail promptly when Cloudflare Access settings were absent.'));
    }, 15000).unref();
  });

  assert.equal(code, 1);
  assert.match(output, /CLOUDFLARE_ACCESS_TEAM_DOMAIN and CLOUDFLARE_ACCESS_AUD/);
});
