import test from 'node:test';
import assert from 'node:assert/strict';
import { canDeleteInventoryRequests, validateRequestAuthorization } from '../requestAccess.mjs';

const perms = {
  Pemohon: { requestSupplies: true },
  Pimpinan: { approveRequests: true, requestSupplies: true },
  Kasubag: { approveRequests: true },
  Operator: { requestSupplies: true, manageInventory: true }
};
const has = (user, p) => user.role === 'Administrator' || Boolean(perms[user.role]?.[p]);
const user = role => ({ id: `user-${role}`, role, name: role });
const run = (role, before, after, previousAuditLogs = [], nextAuditLogs = []) =>
  validateRequestAuthorization(user(role), [before], [after], has, previousAuditLogs, nextAuditLogs);
const req = status => ({ id: 'r1', status });

test('permanent deletion is restricted to Administrator and inventory-authorized Operator/Pengelola BMN', () => {
  assert.equal(canDeleteInventoryRequests(user('Administrator'), () => false), true);
  assert.equal(canDeleteInventoryRequests(user('Operator'), has), true);
  assert.equal(canDeleteInventoryRequests(user('Pengelola BMN'), () => true), true);
  assert.equal(canDeleteInventoryRequests(user('Operator'), () => false), false);
  assert.equal(canDeleteInventoryRequests(user('Pengelola BMN'), () => false), false);
  for (const role of ['Pemohon', 'Kasubag', 'Pimpinan', 'Role Lain']) {
    assert.equal(canDeleteInventoryRequests(user(role), () => true), false);
  }
  assert.equal(canDeleteInventoryRequests(null, () => true), false);
});

test('Pemohon tidak dapat menyetujui atau menolak', () => {
  assert.ok(run('Pemohon', req('Diverifikasi'), req('Disetujui')));
  assert.ok(run('Pemohon', req('Diverifikasi'), req('Ditolak')));
  assert.ok(run('Pemohon', req('Diajukan'), req('Ditolak')));
  assert.ok(run('Pemohon', req('Diajukan'), req('Disetujui')));
});

test('permohonan tidak dapat dihapus dan Pemohon tidak dapat mengubah data', () => {
  assert.ok(validateRequestAuthorization(user('Pemohon'), [req('Diajukan')], [], has));
  assert.ok(validateRequestAuthorization(user('Administrator'), [req('Diajukan')], [], has));
  assert.ok(run('Pemohon', req('Diajukan'), { ...req('Diajukan'), keperluan: 'x' }));
});

test('Pemohon hanya dapat membatalkan permohonan sendiri berdasarkan ID dengan alasan', () => {
  const requester = user('Pemohon');
  const ownSubmittedRequest = { ...req('Diajukan'), pemohonNama: requester.name, pemohonUserId: requester.id };
  const cancelledRequest = { ...ownSubmittedRequest, status: 'Dibatalkan' };
  const cancellationLog = {
    id: 'cancel-log',
    userId: requester.id,
    aktivitas: 'Pembatalan Permohonan Barang',
    detail: 'Permohonan r1 dibatalkan. Alasan: Salah memilih barang'
  };
  assert.equal(validateRequestAuthorization(
    requester, [ownSubmittedRequest], [cancelledRequest], has, [], [cancellationLog]
  ), null);
  assert.ok(validateRequestAuthorization(requester, [ownSubmittedRequest], [], has, [], []));
  assert.ok(validateRequestAuthorization(
    requester,
    [{ ...ownSubmittedRequest, status: 'Diverifikasi' }],
    [{ ...ownSubmittedRequest, status: 'Dibatalkan' }],
    has,
    [],
    [cancellationLog]
  ));
  assert.ok(validateRequestAuthorization(
    requester,
    [{ ...ownSubmittedRequest, pemohonUserId: 'user-lain' }],
    [{ ...ownSubmittedRequest, pemohonUserId: 'user-lain', status: 'Dibatalkan' }],
    has,
    [],
    [cancellationLog]
  ));
  assert.ok(validateRequestAuthorization(
    requester,
    [ownSubmittedRequest],
    [cancelledRequest],
    has,
    [],
    [{ ...cancellationLog, detail: 'Permohonan r1 dibatalkan. Alasan: no' }]
  ));
  const pimpinan = user('Pimpinan');
  assert.ok(validateRequestAuthorization(
    pimpinan,
    [{ ...ownSubmittedRequest, pemohonNama: pimpinan.name }],
    [{ ...ownSubmittedRequest, pemohonNama: pimpinan.name, status: 'Dibatalkan' }],
    has,
    [],
    [{ ...cancellationLog, userId: pimpinan.id }]
  ));
});

test('petugas berwenang dapat membatalkan permohonan yang belum diserahkan, tetapi tidak yang terminal', () => {
  const operator = user('Operator');
  const pending = { ...req('Disetujui'), pemohonUserId: 'user-Pemohon' };
  const cancelled = { ...pending, status: 'Dibatalkan' };
  const cancellationLog = {
    id: 'operator-cancel-log',
    userId: operator.id,
    aktivitas: 'Pembatalan Permohonan Barang',
    detail: 'Permohonan r1 dibatalkan. Alasan: Stok perlu dialihkan'
  };
  assert.equal(validateRequestAuthorization(
    operator, [pending], [cancelled], has, [], [cancellationLog]
  ), null);
  assert.ok(validateRequestAuthorization(
    operator, [{ ...pending, status: 'Menunggu Konfirmasi' }], [cancelled], has, [], [cancellationLog]
  ));
  assert.ok(validateRequestAuthorization(
    operator, [cancelled], [{ ...cancelled, catatan: 'Perubahan' }], has, [], [cancellationLog]
  ));
});

test('penolakan memerlukan alasan baru yang jelas', () => {
  const before = { ...req('Diverifikasi'), catatan: 'Catatan lama' };
  assert.equal(run('Kasubag', before, { ...before, status: 'Ditolak', catatan: 'Ditolak: Stok tidak mencukupi' }), null);
  assert.ok(run('Kasubag', before, { ...before, status: 'Ditolak', catatan: 'Catatan lama' }));
  assert.ok(run('Kasubag', before, { ...before, status: 'Ditolak', catatan: 'Ditolak: no' }));
});

test('Pemohon tetap dapat mengajukan permohonan baru', () => {
  assert.equal(validateRequestAuthorization(user('Pemohon'), [], [req('Diajukan')], has), null);
});

test('Pimpinan hanya memantau', () => {
  assert.ok(run('Pimpinan', req('Diverifikasi'), req('Disetujui')));
});

test('Pejabat berwenang dapat memutuskan, tidak dapat ganda', () => {
  assert.equal(run('Kasubag', req('Diverifikasi'), req('Disetujui')), null);
  assert.equal(run('Kasubag', req('Diverifikasi'), {
    ...req('Ditolak'),
    catatan: 'Ditolak: Stok tidak mencukupi'
  }), null);
  assert.ok(run('Kasubag', req('Disetujui'), req('Ditolak')));
  assert.ok(run('Kasubag', req('Selesai'), req('Disetujui')));
});

test('Operator memverifikasi dan memproses tetapi tidak menyetujui', () => {
  assert.equal(run('Operator', req('Diajukan'), req('Diverifikasi')), null);
  assert.equal(run('Operator', req('Disetujui'), req('Diproses')), null);
  assert.ok(run('Operator', req('Diverifikasi'), req('Disetujui')));
});

test('Administrator tidak dibatasi pada alur yang sah', () => {
  assert.equal(run('Administrator', req('Diverifikasi'), req('Disetujui')), null);
});
