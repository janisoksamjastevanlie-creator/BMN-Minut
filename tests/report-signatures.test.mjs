import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveReportSigner } from '../src/utils/reportSignatures.mjs';

const user = (overrides = {}) => ({
  id: 'user-1',
  name: 'Pegawai BPS',
  nip: '123456789012345678',
  email: 'pegawai@example.test',
  role: 'Kepala Sub Bagian Umum',
  unitKerja: 'Subbagian Umum',
  ...overrides
});

test('report signatures resolve an exact role only when one active user matches', () => {
  assert.deepEqual(
    resolveReportSigner({ heading: 'Kepala Sub Bagian Umum', role: 'Kepala Sub Bagian Umum' }, [user()]),
    { name: 'Pegawai BPS', nip: '123456789012345678', message: null }
  );
  assert.equal(
    resolveReportSigner({ heading: 'Kepala Sub Bagian Umum', role: 'Kepala Sub Bagian Umum' }, [
      user({ role: 'Pimpinan' })
    ]).name,
    null
  );
});

test('report signatures do not choose randomly when a role has multiple active users', () => {
  const resolution = resolveReportSigner(
    { heading: 'Kepala Sub Bagian Umum', role: 'Kepala Sub Bagian Umum' },
    [user(), user({ id: 'user-2', name: 'Pegawai Kedua' })]
  );

  assert.equal(resolution.name, null);
  assert.match(resolution.message, /2 pengguna aktif/);
});

test('recorded applicant names take precedence and only a unique user match supplies NIP', () => {
  assert.deepEqual(
    resolveReportSigner({ heading: 'Pemohon', name: 'Nama dari permohonan' }, [
      user({ name: 'Nama dari permohonan', nip: '987654321012345678' })
    ]),
    { name: 'Nama dari permohonan', nip: '987654321012345678', message: null }
  );

  const ambiguous = resolveReportSigner({ heading: 'Pemohon', name: 'Nama sama' }, [
    user({ name: 'Nama sama' }),
    user({ id: 'user-2', name: 'Nama sama', nip: '111111111111111111' })
  ]);
  assert.equal(ambiguous.name, 'Nama sama');
  assert.equal(ambiguous.nip, null);
  assert.match(ambiguous.message, /lebih dari satu akun/);
});

test('missing applicant data stays explicit and never falls back to the current user', () => {
  assert.deepEqual(
    resolveReportSigner({
      heading: 'Pemohon',
      emptyMessage: 'Pemohon tidak tercatat pada data transaksi ini.'
    }, [user()]),
    { name: null, nip: null, message: 'Pemohon tidak tercatat pada data transaksi ini.' }
  );
});
