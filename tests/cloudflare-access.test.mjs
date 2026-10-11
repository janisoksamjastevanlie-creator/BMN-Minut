import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { createCloudflareAccessVerifier } from '../cloudflareAccess.mjs';

const issuer = 'https://example.cloudflareaccess.com';
const audience = 'access-app-audience';
const now = 1_800_000_000_000;
const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = pair.publicKey.export({ format: 'jwk' });
jwk.kid = 'key-1';
jwk.alg = 'RS256';
jwk.use = 'sig';

function signToken(claimOverrides = {}, headerOverrides = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-1', ...headerOverrides })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iss: issuer,
    aud: [audience],
    sub: 'identity-1',
    email: 'employee@example.gov',
    iat: now / 1000,
    exp: now / 1000 + 60,
    ...claimOverrides
  })).toString('base64url');
  const content = `${header}.${claims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(content), pair.privateKey).toString('base64url');
  return `${content}.${signature}`;
}

function verifier() {
  const requests = [];
  const access = createCloudflareAccessVerifier({
    teamDomain: issuer,
    audience,
    now: () => now,
    fetchImpl: async url => {
      requests.push(url);
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'max-age=300' }
      });
    }
  });
  return { verify: access.verify, requests };
}

test('validates Cloudflare Access signatures, issuer, audience and time claims', async () => {
  const { verify, requests } = verifier();
  const claims = await verify(signToken());

  assert.equal(claims.email, 'employee@example.gov');
  assert.equal(requests.length, 1);
});

test('rejects tokens with a different audience or expired claims', async () => {
  const { verify } = verifier();

  await assert.rejects(verify(signToken({ aud: ['another-app'] })), /claims are invalid/);
  await assert.rejects(verify(signToken({ exp: now / 1000 - 60 })), /claims are invalid/);
});

test('rejects unsupported signing algorithms and invalid signatures', async () => {
  const { verify } = verifier();
  const wrongAlgorithm = signToken({}, { alg: 'HS256' });

  await assert.rejects(verify(wrongAlgorithm), /algorithm or key ID/);
  const valid = signToken();
  const parts = valid.split('.');
  const signature = Buffer.from(parts[2], 'base64url');
  signature[0] ^= 1;
  await assert.rejects(verify(`${parts[0]}.${parts[1]}.${signature.toString('base64url')}`), /signature is invalid/);
});
