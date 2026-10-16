import assert from 'node:assert/strict';
import test from 'node:test';
import { assignNewRequestNumbers, getNextRequestNumber } from '../requestNumber.mjs';

const requestNumber = sequence => `REQ-BPS7106/2026/${String(sequence).padStart(4, '0')}`;

test('uses the highest existing sequence instead of the request count', () => {
  const existing = [
    { nomorPermintaan: requestNumber(1) },
    { nomorPermintaan: requestNumber(3) }
  ];

  assert.equal(getNextRequestNumber(existing, 2026), requestNumber(4));
});

test('reassigns a duplicate submitted number against the latest server requests', () => {
  const current = [{ id: 'remote', nomorPermintaan: requestNumber(8) }];
  const submitted = [
    { id: 'remote', nomorPermintaan: requestNumber(8) },
    { id: 'local', nomorPermintaan: requestNumber(8), tanggal: '2026-10-17' }
  ];

  const result = assignNewRequestNumbers(current, submitted);

  assert.deepEqual(result.assignedNumbers, { local: requestNumber(9) });
  assert.equal(result.requests[0].nomorPermintaan, requestNumber(8));
  assert.equal(result.requests[1].nomorPermintaan, requestNumber(9));
});

test('assigns unique numbers when several new requests arrive in one save', () => {
  const current = [{ id: 'existing', nomorPermintaan: requestNumber(4) }];
  const submitted = [
    { id: 'first', nomorPermintaan: requestNumber(5), tanggal: '2026-10-17' },
    { id: 'second', nomorPermintaan: requestNumber(5), tanggal: '2026-10-17' }
  ];

  const result = assignNewRequestNumbers(current, submitted);

  assert.deepEqual(result.assignedNumbers, {
    first: requestNumber(5),
    second: requestNumber(6)
  });
  assert.equal(new Set(result.requests.map(request => request.nomorPermintaan)).size, 2);
});

test('starts a new sequence for the request date year', () => {
  const result = assignNewRequestNumbers(
    [{ id: 'old', nomorPermintaan: requestNumber(50) }],
    [{ id: 'new', nomorPermintaan: requestNumber(51), tanggal: '2027-01-01' }]
  );

  assert.deepEqual(result.assignedNumbers, { new: 'REQ-BPS7106/2027/0001' });
});
