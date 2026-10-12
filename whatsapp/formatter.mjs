const TIMEZONE = 'Asia/Makassar';
const NUMBER = new Intl.NumberFormat('id-ID');

export const MENU_ITEMS = [
  { id: 'dashboard', number: 1, emoji: '📊', title: 'Dashboard' },
  { id: 'data_bmn', number: 2, emoji: '🏢', title: 'Data BMN' },
  { id: 'cari', number: 3, emoji: '🔍', title: 'Cari Aset' },
  { id: 'status_aset', number: 4, emoji: '📋', title: 'Status Aset' },
  { id: 'mutasi', number: 5, emoji: '🔄', title: 'Mutasi Aset' },
  { id: 'stok', number: 6, emoji: '📦', title: 'Stok/Barang' },
  { id: 'laporan', number: 7, emoji: '📝', title: 'Laporan' },
  { id: 'notifikasi', number: 8, emoji: '🔔', title: 'Notifikasi' },
  { id: 'akun', number: 9, emoji: '👤', title: 'Akun Saya' },
  { id: 'bantuan', number: 10, emoji: '❓', title: 'Bantuan' },
  { id: 'permohonan', number: 11, emoji: '📄', title: 'Permohonan Saya' }
];

const n = value => NUMBER.format(Number(value) || 0);

export function formatTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone: TIMEZONE, day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date).replace(/\./g, ':').replace(',', '');
  return `${parts} WITA`;
}

const text = (body, extra = {}) => ({ text: body, ...extra });
const quickReplies = (...buttons) => ({ buttons: buttons.slice(0, 3) });
const BTN_MENU = { id: 'menu', title: '📋 Menu' };

export const formatter = {
  menu() {
    const lines = MENU_ITEMS.map(item => `${item.number}. ${item.emoji} ${item.title}`);
    return text(
      ['📋 *MENU BMN-MINUT*', '', ...lines, '', 'Balas dengan angka atau ketik perintah, misalnya /cari, /dashboard, atau tulis pertanyaan Anda.'].join('\n'),
      {
        list: {
          button: 'Buka Menu',
          title: 'Menu BMN-Minut',
          rows: MENU_ITEMS.map(item => ({ id: item.id, title: `${item.emoji} ${item.title}`.slice(0, 24) }))
        }
      }
    );
  },

  notLinked() {
    return text([
      'Nomor WhatsApp Anda belum terhubung dengan akun BMN-Minut.',
      '',
      'Cara menghubungkan:',
      '1. Masuk ke BMN-Minut.',
      '2. Buka menu profil → *Integrasi WhatsApp* → *Hubungkan WhatsApp*.',
      '3. Kirim kode yang tampil (format BMN-XXXXXXXX) ke nomor ini.'
    ].join('\n'));
  },

  linked(user) {
    return text(`✅ *WhatsApp berhasil terhubung*\n\nAkun: ${user.name}\nRole: ${user.role}\n\nKetik *MENU* untuk melihat layanan.`, quickReplies(BTN_MENU));
  },

  linkInvalid() {
    return text('Kode tidak valid atau sudah kedaluwarsa. Buat kode baru dari menu *Integrasi WhatsApp* di BMN-Minut.');
  },

  linkPhoneInUse() {
    return text('Nomor ini sudah terhubung dengan akun BMN-Minut lain. Putuskan tautan lama terlebih dahulu.');
  },

  unlinked() {
    return text('Tautan WhatsApp dengan akun BMN-Minut telah diputus. Anda tidak akan menerima notifikasi lagi.');
  },

  accountInactive() {
    return text('Akun BMN-Minut yang terhubung dengan nomor ini tidak aktif. Hubungi administrator.');
  },

  denied() {
    return text('Maaf, role Anda tidak memiliki izin untuk fitur ini.', quickReplies(BTN_MENU));
  },

  rateLimited() {
    return text('Permintaan terlalu banyak. Silakan coba beberapa saat lagi.');
  },

  unsupported() {
    return text('Saat ini saya hanya dapat memproses pesan teks. Ketik *MENU* untuk melihat layanan.');
  },

  unknown() {
    return text('Maaf, saya belum memahami permintaan tersebut. Ketik *MENU* untuk melihat layanan yang tersedia.', quickReplies(BTN_MENU));
  },

  failure() {
    return text('Maaf, terjadi kendala saat memproses permintaan. Data belum dapat diperiksa; silakan coba lagi beberapa saat lagi.');
  },

  providerDown() {
    return text('Maaf, layanan WhatsApp sedang mengalami gangguan. Pesan belum dapat dikirim.');
  },

  help() {
    return text([
      '❓ *BANTUAN BMN-MINUT*',
      '',
      'BMN adalah Barang Milik Negara. Aplikasi ini mencatat aset BMN dan persediaan, termasuk barang masuk/keluar serta permohonan barang.',
      'Menu dan data yang dapat dibuka mengikuti izin akun. Chatbot hanya membaca informasi; tindakan transaksi tetap melalui aplikasi.',
      '',
      'Perintah yang tersedia:',
      '/menu — daftar layanan',
      '/dashboard — ringkasan aset',
      '/cari — cari aset (contoh: cari laptop NUP 12)',
      '/status — status aset',
      '/mutasi — status mutasi aset',
      '/pemeliharaan — status tiket pemeliharaan',
      '/stok — status persediaan',
      '/laporan — ringkasan laporan',
      '/notif — pekerjaan yang perlu tindakan',
      '/permohonan — status permohonan barang Anda',
      'Riwayat transaksi — buka Persediaan / kartu stok atau Laporan sesuai izin akun.',
      'Contoh periode: "transaksi barang masuk bulan Oktober 2026" atau "permohonan saya dari 2026-10-01 sampai 2026-10-12".',
      'Contoh lanjutan: setelah menanyakan stok kertas A4, ketik "Kalau tinta printer?".',
      'Nama pengguna aktif hanya tersedia bagi akun dengan izin Manajemen Pengguna.',
      '/akun — informasi akun',
      'NOTIF ON / NOTIF OFF — atur notifikasi otomatis',
      'PUTUSKAN — putuskan tautan WhatsApp',
      '',
      'Anda juga dapat bertanya biasa, misalnya "berapa aset rusak berat?".'
    ].join('\n'), quickReplies(BTN_MENU, { id: 'cari', title: '🔍 Cari Aset' }, { id: 'dashboard', title: '📊 Dashboard' }));
  },

  searchPrompt() {
    return text([
      '🔍 *CARI BMN*',
      '',
      'Kirim kata kunci pencarian. Anda dapat menyertakan:',
      '• Nama barang atau merk (laptop, thinkpad)',
      '• Kode Barang (3.10.01.02.001)',
      '• NUP (NUP 12)',
      '• Lokasi (lokasi gudang)',
      '• Kondisi (baik, rusak ringan, rusak berat)',
      '',
      'Contoh: _laptop NUP 12_',
      'Ketik *BATAL* untuk membatalkan.'
    ].join('\n'));
  },

  searchCancelled() {
    return text('Pencarian dibatalkan.', quickReplies(BTN_MENU));
  },

  searchResults(result, appUrl) {
    if (!result.total) {
      return text('🔎 *HASIL PENCARIAN BMN*\n\nTidak ada aset yang cocok. Coba kata kunci lain.', quickReplies({ id: 'cari', title: '🔍 Cari Lagi' }, BTN_MENU));
    }
    const blocks = result.items.map(item => [
      `Nama:\n${item.nama}`,
      `Kode Barang:\n${item.kodeBarang}`,
      `NUP:\n${item.nup}`,
      item.merkType ? `Merk/Tipe:\n${item.merkType}` : null,
      `Lokasi:\n${item.lokasi || '-'}`,
      `Kondisi:\n${item.kondisi}`,
      `Status:\n${item.status}`
    ].filter(Boolean).join('\n\n'));
    const more = result.total > result.items.length
      ? `\n\nMenampilkan ${result.items.length} dari ${n(result.total)} hasil. Persempit pencarian dengan NUP atau kode barang.`
      : '';
    return text(
      `🔎 *HASIL PENCARIAN BMN*\n\n${blocks.join('\n\n──────────\n\n')}${more}\n\nUntuk detail lengkap:\nBuka sistem BMN-Minut.\n${appUrl}`,
      quickReplies({ id: 'cari', title: '🔍 Cari Lagi' }, BTN_MENU)
    );
  },

  assetCount(result) {
    const { filter } = result;
    const parts = [];
    if (filter.kondisi) parts.push(`kondisi ${filter.kondisi}`);
    if (filter.status) parts.push(`status ${filter.status}`);
    if (filter.nama) parts.push(`"${filter.nama}"`);
    if (filter.lokasi) parts.push(`lokasi ${filter.lokasi}`);
    if (filter.kategori) parts.push(`kategori ${filter.kategori}`);
    const groups = result.kelompok ? [
      '', `Per ${filter.kelompok}:`,
      ...result.kelompok.map(item => `• ${item.nama}: ${n(item.count)}`),
      ...(result.totalKelompok > result.kelompok.length ? [`Menampilkan ${result.kelompok.length} dari ${n(result.totalKelompok)} kelompok.`] : [])
    ].join('\n') : '';
    return text(`📊 *JUMLAH ASET*\n\nAset ${parts.length ? parts.join(', ') : 'terdaftar (tidak termasuk yang dihapuskan)'}: *${n(result.count)}*${groups}`, quickReplies({ id: 'dashboard', title: '📊 Dashboard' }, BTN_MENU));
  },

  dashboard(data, now = new Date()) {
    const lines = [
      '📊 *DASHBOARD BMN-MINUT*',
      '',
      `Total Aset: ${n(data.totalAset)}`,
      `Baik: ${n(data.baik)}`,
      `Rusak Ringan: ${n(data.rusakRingan)}`,
      `Rusak Berat: ${n(data.rusakBerat)}`
    ];
    if (data.persediaanMenipis !== null) {
      lines.push('', `Persediaan Menipis: ${n(data.persediaanMenipis)}`, `Persediaan Habis: ${n(data.persediaanHabis)}`);
    }
    lines.push('', 'Terakhir diperbarui:', formatTimestamp(now));
    return text(lines.join('\n'), quickReplies({ id: 'cari', title: '🔍 Cari Aset' }, { id: 'notifikasi', title: '🔔 Notifikasi' }, BTN_MENU));
  },

  dataBmn(data) {
    return text([
      '🏢 *DATA BMN*',
      '',
      `Total aset aktif tercatat: ${n(data.totalAset)}`,
      `Baik: ${n(data.baik)}`,
      `Rusak Ringan: ${n(data.rusakRingan)}`,
      `Rusak Berat: ${n(data.rusakBerat)}`,
      '',
      'Gunakan *CARI BMN* untuk mencari aset tertentu.'
    ].join('\n'), quickReplies({ id: 'cari', title: '🔍 Cari Aset' }, BTN_MENU));
  },

  assetStatus(data) {
    const rows = Object.entries(data.byStatus).map(([status, count]) => `${status}: ${n(count)}`);
    return text(`📋 *STATUS ASET*\n\n${rows.join('\n') || 'Belum ada data aset.'}\n\nTotal: ${n(data.total)}`, quickReplies(BTN_MENU));
  },

  mutations(data) {
    const rows = Object.entries(data.byStatus).map(([status, count]) => `${status}: ${n(count)}`);
    const open = data.open.map(item => `• ${item.nomor} — ${item.aset}\n  ${item.dari} → ${item.ke} (${item.status})`);
    return text([
      '🔄 *MUTASI ASET*',
      '',
      rows.join('\n') || 'Belum ada data mutasi.',
      ...(open.length ? ['', '*Sedang berjalan:*', ...open] : [])
    ].join('\n'), quickReplies(BTN_MENU));
  },

  maintenance(data) {
    return text([
      '🛠️ *PEMELIHARAAN BMN*',
      '',
      ...(data.items.length ? data.items.map(item =>
        `• ${item.nomor || 'Nomor belum tercatat'} — ${item.aset || 'Aset belum tercatat'}\n` +
        `  ${item.jenis || 'Jenis belum tercatat'}: ${item.status}\n` +
        `  Mulai: ${item.mulai || 'Belum tercatat'}; selesai: ${item.selesai || 'Belum tercatat'}`
      ) : ['Tiket pemeliharaan tidak ditemukan dalam filter ini.']),
      ...(data.total > data.items.length ? [`Menampilkan ${data.items.length} dari ${n(data.total)} tiket.`] : []),
      '',
      'Perubahan tiket tetap dilakukan melalui menu Pemeliharaan sesuai izin akun.'
    ].join('\n'), quickReplies(BTN_MENU));
  },

  inventory(data) {
    const items = data.items.map(item => `• ${item.nama}: ${n(item.stok)} ${item.satuan} (${item.status})`);
    return text([
      '📦 *STOK / PERSEDIAAN*',
      '',
      `Jenis barang: ${n(data.totalJenis)}`,
      `Menipis: ${n(data.menipis)}`,
      `Habis: ${n(data.habis)}`,
      ...(items.length ? ['', '*Perlu perhatian:*', ...items] : [])
    ].join('\n'), quickReplies(BTN_MENU));
  },

  inventorySearch(data) {
    if (!data.total) {
      return text(`📦 *STOK BARANG*\n\nBarang${data.query ? ` "${data.query}"` : ''}${data.status ? ` berstatus ${data.status}` : ''} tidak ditemukan dalam cakupan akses dan filter ini.`, quickReplies(BTN_MENU));
    }
    const items = data.items.map(item => `• ${item.nama}: ${n(item.stok)} ${item.satuan} (${item.status})`);
    return text([
      '📦 *STOK BARANG*',
      '',
      ...(data.status ? [`Status: ${data.status}`, ''] : []),
      ...items,
      ...(data.total > data.items.length ? ['', `Menampilkan ${data.items.length} dari ${n(data.total)} hasil.`] : [])
    ].join('\n'), quickReplies(BTN_MENU));
  },

  myRequests(data) {
    const title = data.scope === 'petugas' ? 'PERMOHONAN BARANG' : 'PERMOHONAN SAYA';
    if (!data.total) {
      return text(`📄 *${title}*\n\nPermohonan tidak ditemukan dalam cakupan akses dan filter ini.`, quickReplies(BTN_MENU));
    }
    const items = data.items.flatMap(item => [
      `• ${item.nomor} — ${item.status} (${item.tanggal})`,
      ...(item.barang.length
        ? item.barang.map(barang => `  - ${barang.nama}: ${n(barang.jumlah)} ${barang.satuan}${barang.disetujui == null ? '' : `; disetujui ${n(barang.disetujui)}`}`)
        : ['  - Rincian barang belum tersedia.']),
      ...(item.jumlahBarangLain ? [`  - ${n(item.jumlahBarangLain)} barang lainnya.`] : []),
      ...(item.status === 'Ditolak'
        ? [`  - Alasan penolakan: ${item.alasanPenolakan || 'Belum dicatat di sistem.'}`]
        : []),
      ...(item.catatan && item.status !== 'Ditolak' ? [`  - Catatan: ${item.catatan}`] : [])
    ]);
    return text([
      `📄 *${title}*`,
      '',
      `Total: ${n(data.total)}`,
      `Belum selesai: ${n(data.pending)}`,
      ...(data.periode ? [`Periode: ${data.periode}`] : []),
      '',
      ...items,
      '',
      'Status yang ditampilkan adalah status saat ini. Riwayat perubahan status, nama petugas pemroses, dan waktu persetujuan belum tersedia melalui chatbot.'
    ].join('\n'), quickReplies(BTN_MENU));
  },

  inventoryTransactions(data) {
    return text([
      '📦 *TRANSAKSI PERSEDIAAN*',
      '',
      `Total dokumen: ${n(data.totalDokumen)}`,
      `Rincian barang: ${n(data.total)}`,
      ...(data.periode ? [`Periode: ${data.periode}`] : []),
      '',
      ...(data.items.length ? data.items.map(item =>
        `• ${item.nomor} (${item.tanggal}) — ${item.jenis}\n  ${item.barang}: ${n(item.jumlah)} ${item.satuan}\n  ${item.status}`
      ) : ['Transaksi tidak ditemukan dalam cakupan akses dan filter ini.']),
      ...(data.total > data.items.length ? [`Menampilkan ${data.items.length} dari ${n(data.total)} rincian barang.`] : []),
      '',
      'Riwayat lengkap tersedia di menu Persediaan sesuai izin akun. Status yang tidak tercatat tidak dapat disimpulkan.'
    ].join('\n'), quickReplies(BTN_MENU));
  },

  users(data) {
    return text([
      '👤 *PENGGUNA AKTIF*', '',
      `Total dalam filter: ${n(data.total)}`,
      ...data.items.map(item => `• ${item.nama} — ${item.role}${item.unitKerja ? ` (${item.unitKerja})` : ''}`),
      ...(data.total > data.items.length ? [`Menampilkan ${data.items.length} pengguna. Persempit pertanyaan dengan role.`] : []),
      ...(!data.total ? ['Pengguna tidak ditemukan dalam cakupan akses dan filter ini.'] : [])
    ].join('\n'), quickReplies(BTN_MENU));
  },

  requestProcedure() {
    return text([
      '📄 *PROSEDUR PERMOHONAN BARANG*',
      '',
      '1. Masuk ke aplikasi BMN-Minut.',
      '2. Buka menu Permohonan Barang (ATK).',
      '3. Tambahkan barang dan jumlah yang diperlukan.',
      '4. Lengkapi keperluan, lalu ajukan permohonan.',
      '5. Pantau tahapan verifikasi, persetujuan, persiapan, dan penerimaan di aplikasi.',
      '',
      'Persetujuan dan perubahan status tetap harus dilakukan melalui aplikasi sesuai kewenangan pengguna.'
    ].join('\n'), quickReplies(BTN_MENU));
  },

  reports(data) {
    return text([
      '📝 *LAPORAN BMN-MINUT*',
      '',
      `Mutasi berjalan: ${n(data.mutasiBerjalan)}`,
      `Pemeliharaan berjalan: ${n(data.pemeliharaanBerjalan)}`,
      `Penghapusan berjalan: ${n(data.penghapusanBerjalan)}`,
      `Stock opname berjalan: ${n(data.stockOpnameBerjalan)}`,
      `Dokumen terarsip: ${n(data.dokumenTotal)}`,
      '',
      'Laporan resmi dapat dicetak dari menu Laporan di BMN-Minut.'
    ].join('\n'), quickReplies(BTN_MENU));
  },

  pending(data, appUrl) {
    if (!data.items.length) return text('🔔 *NOTIFIKASI BMN-BPSMINUT*\n\nTidak ada pekerjaan yang membutuhkan tindakan Anda saat ini.', quickReplies(BTN_MENU));
    return text([
      '🔔 *NOTIFIKASI BMN-BPSMINUT*',
      '',
      ...data.items.map(item => `• ${n(item.count)} ${item.label}`),
      '',
      'Silakan buka Dashboard BMN-Minut untuk memproses.',
      appUrl
    ].join('\n'), quickReplies(BTN_MENU));
  },

  account(data, account) {
    return text([
      '👤 *AKUN SAYA*',
      '',
      `Nama: ${data.nama}`,
      `NIP: ${data.nip}`,
      `Role: ${data.role}`,
      `Unit Kerja: ${data.unitKerja || '-'}`,
      `Notifikasi WhatsApp: ${account.notify_enabled ? 'Aktif' : 'Nonaktif'}`,
      '',
      'Ketik NOTIF ON / NOTIF OFF untuk mengatur notifikasi, atau PUTUSKAN untuk memutus tautan.'
    ].join('\n'), quickReplies(BTN_MENU));
  },

  notifyChanged(enabled) {
    return text(enabled ? '🔔 Notifikasi WhatsApp diaktifkan.' : '🔕 Notifikasi WhatsApp dinonaktifkan.', quickReplies(BTN_MENU));
  },

  reminder(items, appUrl) {
    return [
      '⏰ *PENGINGAT BMN-MINUT*',
      '',
      'Pekerjaan yang membutuhkan tindakan:',
      ...items.map(item => `• ${n(item.count)} ${item.label}`),
      '',
      'Silakan buka BMN-Minut untuk memprosesnya.',
      appUrl
    ].join('\n');
  },

  notification(title, lines, appUrl) {
    return ['🔔 *NOTIFIKASI BMN-BPSMINUT*', '', `*${title}*`, ...lines, '', 'Silakan buka BMN-Minut untuk detail.', appUrl].join('\n');
  }
};
