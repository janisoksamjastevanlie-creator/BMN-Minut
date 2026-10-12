export function buildFonnteRequestNotification(inventoryRequest, action, note, actorName, eventDate) {
  const items = Array.isArray(inventoryRequest.items) && inventoryRequest.items.length
    ? inventoryRequest.items
    : [{
        namaBarang: inventoryRequest.namaBarang,
        jumlahDiminta: inventoryRequest.jumlahDiminta,
        jumlahDisetujui: inventoryRequest.jumlahDisetujui,
        satuan: inventoryRequest.satuan
      }];
  const usesApprovedQuantity = ['Disetujui', 'Diproses', 'Selesai'].includes(inventoryRequest.status);
  const itemLines = items.slice(0, 8).map(item => {
    const quantity = usesApprovedQuantity
      ? item.jumlahDisetujui || inventoryRequest.jumlahDisetujui || item.jumlahDiminta
      : item.jumlahDiminta;
    return `- ${String(item.namaBarang || '-').slice(0, 80)}: ${quantity ?? '-'} ${String(item.satuan || '').slice(0, 20)}`;
  });
  if (items.length > itemLines.length) itemLines.push(`- dan ${items.length - itemLines.length} jenis barang lainnya`);
  const numberLine = `Nomor Permohonan: ${String(inventoryRequest.nomorPermintaan || '-').slice(0, 100)}`;
  const applicantLine = `Nama Pemohon: ${String(inventoryRequest.pemohonNama || '-').slice(0, 100)}`;
  const itemHeading = `${usesApprovedQuantity ? 'Barang dan Jumlah Disetujui' : 'Daftar Barang'} (${items.length} jenis):`;
  const safeActorName = String(actorName || '-').slice(0, 100);
  const safeEventDate = String(eventDate || inventoryRequest.tanggal || '-').slice(0, 40);
  const noteLines = note || inventoryRequest.catatan
    ? [`Catatan/Alasan: ${String(note || inventoryRequest.catatan).slice(0, 500)}`]
    : [];

  if (action === 'submitted') {
    return {
      title: 'Permohonan barang diajukan',
      lines: [
        numberLine,
        applicantLine,
        `Tanggal Pengajuan: ${String(inventoryRequest.tanggal || '-').slice(0, 40)}`,
        `Daftar Barang (${items.length} jenis):`,
        ...itemLines,
        'Status: MENUNGGU VERIFIKASI',
        ...noteLines
      ]
    };
  }
  if (action === 'cancelled') {
    return {
      title: 'Permohonan barang dibatalkan',
      lines: [
        numberLine,
        applicantLine,
        `Tanggal Pembatalan: ${safeEventDate}`,
        'Status: DIBATALKAN',
        ...noteLines
      ]
    };
  }
  if (inventoryRequest.status === 'Diverifikasi') {
    return {
      title: 'Permohonan barang diverifikasi',
      lines: [
        numberLine,
        applicantLine,
        'Hasil Verifikasi: DIVERIFIKASI',
        `Petugas Verifikasi: ${safeActorName}`,
        `Tanggal Verifikasi: ${safeEventDate}`,
        'Status Terbaru: DIVERIFIKASI',
        ...noteLines
      ]
    };
  }
  if (inventoryRequest.status === 'Disetujui') {
    return {
      title: 'Permohonan barang disetujui',
      lines: [
        numberLine,
        applicantLine,
        `Penyetuju: ${safeActorName}`,
        `Tanggal Persetujuan: ${safeEventDate}`,
        itemHeading,
        ...itemLines,
        'Status Persetujuan: DISETUJUI',
        ...noteLines
      ]
    };
  }
  if (inventoryRequest.status === 'Diproses') {
    return {
      title: 'Barang sedang disiapkan',
      lines: [
        numberLine,
        applicantLine,
        itemHeading,
        ...itemLines,
        `Petugas: ${safeActorName}`,
        `Tanggal Persiapan: ${safeEventDate}`,
        'Status Terbaru: DIPROSES'
      ]
    };
  }
  if (inventoryRequest.status === 'Selesai') {
    return {
      title: 'Barang telah diterima',
      lines: [
        numberLine,
        applicantLine,
        'Barang dan Jumlah Diterima:',
        ...itemLines,
        `Petugas: ${safeActorName}`,
        `Tanggal Penerimaan: ${safeEventDate}`,
        'Status: BARANG TELAH DITERIMA'
      ]
    };
  }
  return {
    title: inventoryRequest.status === 'Ditolak'
      ? 'Permohonan barang ditolak'
      : `Status permohonan barang: ${inventoryRequest.status}`,
    lines: [
      numberLine,
      applicantLine,
      `Petugas: ${safeActorName}`,
      `Tanggal Perubahan: ${safeEventDate}`,
      `Status Terbaru: ${String(inventoryRequest.status || '-').toLocaleUpperCase('id-ID').slice(0, 50)}`,
      ...noteLines
    ]
  };
}
