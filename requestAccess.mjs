// Otorisasi perubahan permohonan barang di sisi server. Status dan izin mengikuti alur yang sudah ada.
const TRANSITIONS = {
  Diajukan: { Diverifikasi: 'review', Ditolak: 'review' },
  Diverifikasi: { Disetujui: 'approve', Ditolak: 'approve' },
  Disetujui: { Diproses: 'manage' },
  Diproses: { Selesai: 'manage' }
};

export function validateRequestAuthorization(
  user,
  previousRequests,
  nextRequests,
  hasPermission,
  previousAuditLogs = [],
  nextAuditLogs = []
) {
  if (!Array.isArray(previousRequests) || !Array.isArray(nextRequests)) return null;
  const can = permission => hasPermission(user, permission);
  const isPimpinan = String(user?.role ?? '').trim().toLowerCase() === 'pimpinan';
  const canApprove = can('approveRequests') && !isPimpinan;
  const canManage = can('manageInventory');
  const canRequest = can('requestSupplies');
  const allowedBy = {
    review: canApprove || canManage,
    approve: canApprove,
    manage: canManage
  };

  const previousById = new Map(previousRequests.map(item => [item.id, item]));
  const nextIds = new Set(nextRequests.map(item => item.id));
  const previousAuditLogIds = new Set(
    (Array.isArray(previousAuditLogs) ? previousAuditLogs : []).map(log => log.id)
  );
  const auditLogs = Array.isArray(nextAuditLogs) ? nextAuditLogs : [];

  for (const old of previousRequests) {
    if (!nextIds.has(old.id) && !(canApprove || canManage)) {
      const isOwnRequest = String(old.pemohonNama || '').trim().toLocaleLowerCase('id-ID')
        === String(user?.name || '').trim().toLocaleLowerCase('id-ID');
      const canCancelOwnRequest = canRequest && !canApprove && !canManage && !isPimpinan
        && isOwnRequest && old.status === 'Diajukan';
      if (!canCancelOwnRequest) return 'Anda tidak berwenang menghapus permohonan barang.';

      const requiredPrefix = `Permohonan ${old.id} dibatalkan. Alasan: `;
      const cancellationHasReason = auditLogs.some(log => {
        if (previousAuditLogIds.has(log.id) || log.userId !== user?.id ||
            log.aktivitas !== 'Pembatalan Permohonan Barang' ||
            typeof log.detail !== 'string' || !log.detail.startsWith(requiredPrefix)) {
          return false;
        }
        const reason = log.detail.slice(requiredPrefix.length).trim();
        return reason.length >= 5 && reason.length <= 500;
      });
      if (!cancellationHasReason) return 'Alasan pembatalan wajib diisi (minimal 5 karakter).';
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
