import assert from 'node:assert/strict';
import test from 'node:test';
import { createCloudflareAccessMiddleware } from '../cloudflareAccess.mjs';

function createResponse() {
  const result = { statusCode: 200, body: undefined };
  return {
    result,
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    }
  };
}

test('Cloudflare Access middleware rejects requests without a signed assertion', async () => {
  const response = createResponse();
  let nextCalled = false;
  const middleware = createCloudflareAccessMiddleware({
    required: true,
    verifier: { async verify() { throw new Error('should not be called'); } }
  });

  await middleware({ headers: {} }, response, () => { nextCalled = true; });

  assert.equal(response.result.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('Cloudflare Access middleware attaches verified claims only', async () => {
  const claims = { email: 'user@example.test', sub: 'subject-1' };
  const request = { headers: { 'cf-access-jwt-assertion': 'signed-token' } };
  let nextCalled = false;
  const middleware = createCloudflareAccessMiddleware({
    required: true,
    verifier: {
      async verify(token) {
        assert.equal(token, 'signed-token');
        return claims;
      }
    }
  });

  await middleware(request, createResponse(), () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(request.accessClaims, claims);
});

test('Cloudflare Access middleware fails closed when signing keys are unavailable', async () => {
  const response = createResponse();
  const middleware = createCloudflareAccessMiddleware({
    required: true,
    verifier: {
      async verify() {
        const error = new Error('key service unavailable');
        error.code = 'CLOUDFLARE_ACCESS_UNAVAILABLE';
        throw error;
      }
    }
  });

  await middleware(
    { headers: { 'cf-access-jwt-assertion': 'signed-token' } },
    response,
    () => assert.fail('Request must not be authorized')
  );

  assert.equal(response.result.statusCode, 503);
  assert.deepEqual(response.result.body, { error: 'Verifikasi identitas sementara tidak tersedia.' });
});

test('Cloudflare Access middleware permits bypass only when explicitly optional', async () => {
  let nextCalled = false;
  const middleware = createCloudflareAccessMiddleware({ required: false });

  await middleware({ headers: {} }, createResponse(), () => { nextCalled = true; });

  assert.equal(nextCalled, true);
});
