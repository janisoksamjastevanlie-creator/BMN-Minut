import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchNotificationDelivery } from '../whatsapp/notification-delivery.mjs';

function responseRecorder() {
  return {
    statusCode: 200,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
  };
}

test('deferred delivery acknowledges the saved event without waiting for the provider', async () => {
  const response = responseRecorder();
  let finish;
  let delivered = false;
  const provider = new Promise(resolve => { finish = resolve; });
  await dispatchNotificationDelivery({
    response, deferred: true,
    deliver: async () => { await provider; delivered = true; return { success: true }; },
    onFailure: () => assert.fail('Successful delivery must not be marked failed')
  });
  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.body, { success: true, queued: true });
  assert.equal(delivered, false);
  finish();
  await provider;
  await Promise.resolve();
  assert.equal(delivered, true);
});

test('deferred provider failure is recorded even after acknowledgment', async () => {
  const response = responseRecorder();
  let fail;
  const provider = new Promise((_resolve, reject) => { fail = reject; });
  let recorded;
  const failure = new Promise(resolve => { recorded = resolve; });
  await dispatchNotificationDelivery({
    response, deferred: true, deliver: () => provider, onFailure: recorded
  });
  fail(new Error('Provider unavailable'));
  await failure;
  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.body, { success: true, queued: true });
});

test('synchronous callers retain delivery success and failure responses', async () => {
  for (const result of [
    { success: true, sentCount: 1 },
    { success: false, sentCount: 0, error: 'Provider unavailable' }
  ]) {
    const response = responseRecorder();
    let failures = 0;
    await dispatchNotificationDelivery({
      response, deferred: false, deliver: async () => result,
      onFailure: async () => { failures += 1; }
    });
    assert.equal(response.statusCode, result.success ? 200 : 502);
    assert.deepEqual(response.body, result);
    assert.equal(failures, result.success ? 0 : 1);
  }
});

test('unexpected provider errors are surfaced and recorded without leaking details', async () => {
  const response = responseRecorder();
  let failures = 0;
  await dispatchNotificationDelivery({
    response, deferred: false,
    deliver: async () => { throw new Error('private provider credentials'); },
    onFailure: async () => { failures += 1; }
  });
  assert.equal(response.statusCode, 502);
  assert.equal(response.body.success, false);
  assert.doesNotMatch(response.body.error, /private provider credentials/);
  assert.equal(failures, 1);
});
