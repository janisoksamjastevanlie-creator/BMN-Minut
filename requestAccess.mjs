// Otorisasi perubahan permohonan barang di sisi server. Status dan izin mengikuti alur yang sudah ada.
const TRANSITIONS = {
  Diajukan: { Diverifikasi: 'review', Ditolak: 'review' },
  Diverifikasi: { Disetujui: 'approve', Ditolak: 'approve' },
  Disetujui: { Diproses: 'manage' },
  Diproses: { Selesai: 'manage' }
};

export function validateRequestAuthorization(user, previousRequests, nextRequests, hasPermission) {
  if (!Array.isArray(previousRequests) || !Array.isArray(nextRequests)) return null;
  const can = permission => hasPermission(user, permission);
  const isPimpinan = String(user?.role ?? '').trim().toLowerCase() === 'pimpinan';
  const canApprove = can('approveRequests') && !isPimpinan;
  const canManage = can('manageInventory');
  const allowedBy = {
    review: canApprove || canManage,
    approve: canApprove,
    manage: canManage
  };

  const previousById = new Map(previousRequests.map(item => [item.id, item]));
  const nextIds = new Set(nextRequests.map(item => item.id));

  for (const old of previousRequests) {
    if (!nextIds.has(old.id) && !(canApprove || canManage)) {
      return 'Anda tidak berwenang menghapus permohonan barang.';
    }
  }

  for (const request of nextRequests) {
    const old = previousById.get(request.id);
    if (!old) {
      if (!can('requestSupplies')) return 'Anda tidak berwenang mengajukan permohonan barang.';
      continue;
    }
    if (JSON.stringify(old) === JSON.stringify(request)) continue;

    if (old.status === request.status) {
      if (!(canApprove || canManage)) return 'Anda tidak berwenang mengubah permohonan barang.';
      continue;
    }
    const required = TRANSITIONS[old.status]?.[request.status];
    if (!required) {
      return `Perubahan status permohonan dari ${old.status} ke ${request.status} tidak diizinkan.`;
    }
    if (!allowedBy[required]) {
      return required === 'approve'
        ? 'Hanya pejabat yang berwenang yang dapat menyetujui atau menolak permohonan pada tahap ini.'
        : 'Anda tidak berwenang mengubah status permohonan ini.';
    }
  }
  return null;
}
