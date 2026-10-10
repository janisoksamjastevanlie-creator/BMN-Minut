import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

test('production server binds the configured host and serves health/auth routes from persistent SQLite path', async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'siman-hosting-smoke-'));
  const port = await getFreePort();
  const password = 'test-admin-password-only';
  const serverProcess = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      DATA_DIRECTORY: dataDirectory,
      ADMIN_NIP: '199011042013011005',
      ADMIN_PASSWORD: password
    },
    stdio: ['ignore', 'ignore', 'pipe']
  });

  let serverOutput = '';
  serverProcess.stderr.setEncoding('utf8');
  serverProcess.stderr.on('data', chunk => { serverOutput = `${serverOutput}${chunk}`.slice(-4000); });

  const waitForExit = () => new Promise(resolve => {
    if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) return resolve(true);
    const timeout = setTimeout(() => resolve(false), 1500);
    timeout.unref();
    serverProcess.once('exit', () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    let health;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (serverProcess.exitCode !== null) {
        throw new Error(`Production server exited before health check (${serverProcess.exitCode}). ${serverOutput}`);
      }
      try {
        health = await fetch(`${baseUrl}/api/health`);
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    assert.ok(health, `Production server did not start. ${serverOutput}`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nip: '199011042013011005', password })
    });
    assert.equal(login.status, 200);
    const { user } = await login.json();
    assert.equal(user.role, 'Administrator');

    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
    assert.ok(cookie);
    const state = await fetch(`${baseUrl}/api/state`, { headers: { Cookie: cookie } });
    assert.equal(state.status, 200);
    assert.equal((await state.json()).initialized, false);

    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie }
    });
    assert.equal(logout.status, 200);
    const session = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(session.status, 401);
  } finally {
    if (serverProcess.exitCode === null && serverProcess.signalCode === null) {
      serverProcess.kill('SIGTERM');
      if (!await waitForExit()) {
        serverProcess.kill('SIGKILL');
        if (!await waitForExit()) throw new Error('Could not stop the production smoke-test server.');
      }
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
