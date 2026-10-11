import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessView, getHomeView, getFirstAllowedView } from '../src/utils/rbac.ts';

const allow = () => true;

test('Pimpinan hanya mendapat Dashboard Pimpinan', () => {
  const user = { role: ' Pimpinan ' };
  assert.equal(getHomeView(user), 'executive');
  assert.equal(canAccessView('executive', allow, user), true);
  assert.equal(canAccessView('dashboard', allow, user), false);
  assert.equal(getFirstAllowedView(allow, user), 'executive');
});

test('Selain Pimpinan hanya mendapat Dashboard Utama', () => {
  for (const role of ['Administrator', 'Pengelola BMN', 'Operator']) {
    const user = { role };
    assert.equal(getHomeView(user), 'dashboard');
    assert.equal(canAccessView('dashboard', allow, user), true);
    assert.equal(canAccessView('executive', allow, user), false);
  }
});
