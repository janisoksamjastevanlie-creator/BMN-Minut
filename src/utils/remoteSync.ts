// Keputusan sinkronisasi otomatis.
//
// Masalah aslinya: ketika satu orang mengubah data, pengguna lain harus memuat
// ulang halaman sendiri untuk melihat perubahan itu — dan admin tidak selalu sadar
// perlu melakukan itu. Peramban kini menanyakan satu angka (revision) secara rutin;
// hanya ketika angkanya naik dan perangkat ini tidak sedang menyimpan sesuatu,
// data penuh ditarik. Fungsi murni ini memegang aturan itu supaya bisa diuji
// tanpa React dan tanpa server.

export type RemoteSyncAction = 'pull' | 'skip';

export interface RemoteSyncInput {
  revisionFromServer: unknown;
  localRevision: number;
  hasUnsavedChanges: boolean;
  pendingServerActions: number;
  persistenceWaiters: number;
  isSyncBlocked: boolean;
  isRecovering: boolean;
}

export interface RemoteSyncDecision {
  action: RemoteSyncAction;
  reason: string;
}

export function decideRemoteSync(input: RemoteSyncInput): RemoteSyncDecision {
  const remote = Number(input.revisionFromServer);
  if (!Number.isInteger(remote) || remote < 0) return { action: 'skip', reason: 'revision_server_tidak_sah' };
  if (remote <= input.localRevision) return { action: 'skip', reason: 'belum_ada_perubahan' };
  if (input.isSyncBlocked) return { action: 'skip', reason: 'konflik_menunggu_pilihan_pengguna' };
  if (input.isRecovering) return { action: 'skip', reason: 'koneksi_sedang_pulih' };
  if (input.hasUnsavedChanges) return { action: 'skip', reason: 'masih_ada_perubahan_lokal' };
  if (input.pendingServerActions > 0) return { action: 'skip', reason: 'aksi_server_masih_berjalan' };
  if (input.persistenceWaiters > 0) return { action: 'skip', reason: 'penyimpanan_masih_berjalan' };
  return { action: 'pull', reason: 'data_server_lebih_baru' };
}

export function isRemoteSyncVisible(): boolean {
  if (typeof document === 'undefined') return false;
  return document.visibilityState === 'visible';
}
