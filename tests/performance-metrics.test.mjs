import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { logExternalServiceTiming, logSlowDatabaseQuery, performanceTiming } from '../performanceMetrics.mjs';

test('slow database timing logs query labels without SQL values', () => {
  const messages = [];
  const originalWarn = console.warn;
  console.warn = message => messages.push(String(message));
  try {
    logSlowDatabaseQuery('SELECT * FROM users WHERE email = ? AND token = ?', 321);
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(messages, [
    '[performance] database_query operation=SELECT table=users duration_ms=321'
  ]);
});

test('fast database queries are not logged', () => {
  const messages = [];
  const originalWarn = console.warn;
  console.warn = message => messages.push(String(message));
  try {
    logSlowDatabaseQuery('SELECT * FROM users WHERE id = ?', 249);
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(messages, []);
});

test('endpoint timing logs status, duration and response size only', () => {
  const messages = [];
  const originalInfo = console.info;
  console.info = message => messages.push(String(message));
  const response = new EventEmitter();
  response.statusCode = 502;
  response.getHeader = name => name === 'content-length' ? '123' : undefined;
  let nextCalled = false;
  try {
    performanceTiming('POST /api/whatsapp/request-events')(
      { method: 'POST' },
      response,
      () => { nextCalled = true; }
    );
    response.emit('finish');
  } finally {
    console.info = originalInfo;
  }

  assert.equal(nextCalled, true);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /^\[performance\] endpoint=POST \/api\/whatsapp\/request-events method=POST status=502 duration_ms=\d+ response_bytes=123$/);
});

test('external service timing omits error details and recipient data', () => {
  const messages = [];
  const originalInfo = console.info;
  console.info = message => messages.push(String(message));
  try {
    logExternalServiceTiming('fonnte', Date.now() - 12, {
      success: false,
      sentCount: 0,
      failedCount: 1,
      error: 'private provider detail'
    });
  } finally {
    console.info = originalInfo;
  }

  assert.equal(messages.length, 1);
  assert.match(messages[0], /provider=fonnte outcome=failure/);
  assert.match(messages[0], /failed=1/);
  assert.doesNotMatch(messages[0], /private provider detail/);
});
