import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { securityHeaders } from '../securityHeaders.mjs';

function createResponse() {
  const headers = {};
  return {
    headers,
    setHeader(name, value) { headers[name] = value; }
  };
}

test('security response headers are set and middleware continues handling the request', () => {
  const response = createResponse();
  let handled = false;
  securityHeaders({}, response, () => { handled = true; });
  assert.equal(handled, true);
  assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(response.headers['X-Frame-Options'], 'SAMEORIGIN');
  assert.equal(response.headers['Referrer-Policy'], 'no-referrer');
  assert.ok(String(response.headers['Permissions-Policy']).includes('microphone=()'));
});

test('async scrypt produces the same digest as a matching scryptSync comparison', async () => {
  const { promisify } = await import('node:util');
  const scryptAsync = promisify(crypto.scrypt);
  const salt = crypto.randomBytes(16);
  const digest = await scryptAsync('kata-sandi-tes-panjang-12', salt, 64);
  assert.ok(digest instanceof Buffer);
  assert.ok(crypto.timingSafeEqual(digest, crypto.scryptSync('kata-sandi-tes-panjang-12', salt, 64)));
});
