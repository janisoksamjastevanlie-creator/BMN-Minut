import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRequestAuthorization } from '../requestAccess.mjs';

const perms = {
  Pemohon: { requestSupplies: true },
  Pimpinan: { approveRequests: true, requestSupplies: true },
  Kasubag: { approveRequests: true },
  Operator: { requestSupplies: true, manageInventory: true }
};
const has = (user, p) => user.role === 'Administrator' || Boolean(perms[user.role]?.[p]);
const user = role => ({ id: `user-${role}`, role, name: role });
const run = (role, before, after) => validateRequestAuthorization(user(role), [before], [after], has);
const req = status => ({ id: 'r1', status });

test('Pemohon tidak dapat menyetujui atau menolak', () => {
  assert.ok(run('Pemohon', req('Diverifikasi'), req('Disetujui')));
  assert.ok(run('Pemohon', req('Diverifikasi'), req('Ditolak')));
  assert.ok(run('Pemohon', req('Diajukan'), req('Ditolak')));
  assert.ok(run('Pemohon', req('Diajukan'), req('Disetujui')));
});

test('Pemohon tidak dapat menghapus atau mengubah permohonan', () => {
  assert.ok(validateRequestAuthorization(user('Pemohon'), [req('Diajukan')], [], has));
  assert.ok(run('Pemohon', req('Diajukan'), { ...req('Diajukan'), keperluan: 'x' }));
});

test('Pemohon hanya dapat membatalkan permohonan sendiri yang diajukan dengan alasan', () => {
  const requester = user('Pemohon');
  const ownSubmittedRequest = { ...req('Diajukan'), pemohonNama: requester.name };
  const cancellationLog = {
    id: 'cancel-log',
    userId: requester.id,
    aktivitas: 'Pembatalan Permohonan Barang',
    detail: 'Permohonan r1 dibatalkan. Alasan: Salah memilih barang'
  };
  assert.equal(validateRequestAuthorization(
    requester, [ownSubmittedRequest], [], has, [], [cancellationLog]
  ), null);
  assert.ok(validateRequestAuthorization(requester, [ownSubmittedRequest], [], has, [], []));
  assert.ok(validateRequestAuthorization(
    requester,
    [{ ...ownSubmittedRequest, status: 'Diverifikasi' }],
    [],
    has,
    [],
    [cancellationLog]
  ));
  assert.ok(validateRequestAuthorization(
    requester,
    [{ ...ownSubmittedRequest, pemohonNama: 'Pengguna lain' }],
    [],
    has,
    [],
    [cancellationLog]
  ));
  assert.ok(validateRequestAuthorization(
    requester,
    [ownSubmittedRequest],
    [],
    has,
    [],
    [{ ...cancellationLog, detail: 'Permohonan r1 dibatalkan. Alasan: no' }]
  ));
  const pimpinan = user('Pimpinan');
  assert.ok(validateRequestAuthorization(
    pimpinan,
    [{ ...ownSubmittedRequest, pemohonNama: pimpinan.name }],
    [],
    has,
    [],
    [{ ...cancellationLog, userId: pimpinan.id }]
  ));
});

test('Pemohon tetap dapat mengajukan permohonan baru', () => {
  assert.equal(validateRequestAuthorization(user('Pemohon'), [], [req('Diajukan')], has), null);
});

test('Pimpinan hanya memantau', () => {
  assert.ok(run('Pimpinan', req('Diverifikasi'), req('Disetujui')));
});

test('Pejabat berwenang dapat memutuskan, tidak dapat ganda', () => {
  assert.equal(run('Kasubag', req('Diverifikasi'), req('Disetujui')), null);
  assert.equal(run('Kasubag', req('Diverifikasi'), req('Ditolak')), null);
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
