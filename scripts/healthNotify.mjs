// Pengiriman peringatan pemantau kesehatan lewat WhatsApp (Fonnte).
//
// Pemantau berjalan dari penjadwal tugas, yaitu di luar proses aplikasi, jadi
// tidak punya kolam database maupun sesi login. Yang dipakai hanya konfigurasi
// yang sama dengan aplikasi: WHATSAPP_PROVIDER dan FONNTE_TOKEN. Provider lain
// (Meta/Twilio) sengaja belum didukung di jalur ini karena butuh kredensial
// tambahan dan antrean pengiriman milik aplikasi; kalau provider itu yang
// terpasang, peringatan dilewati dengan sebab yang jelas, tidak diam-diam.
//
// Nomor tujuan diambil dari --recipient / WATCHDOG_RECIPIENTS bila diisi, kalau
// tidak memakai WHATSAPP_RECIPIENT_NUMBER yang memang sudah dipakai aplikasi
// untuk pengujian. Nomor tidak pernah dicetak apa adanya: yang tampil hanya
// empat digit terakhir.
import { getWhatsAppConfig } from '../whatsapp/config.mjs';
import { sendFonnteMessage } from '../whatsapp/fonnte.mjs';
import { maskPhone, normalizePhone } from '../whatsapp/security.mjs';

export function bagiNomor(nilai) {
  return String(nilai || '')
    .split(/[\s,;]+/)
    .map(item => normalizePhone(item))
    .filter(Boolean);
}

export function daftarTujuan({ recipientsArg, testRecipient }) {
  const dariArgumen = bagiNomor(recipientsArg);
  const dariKonfigurasi = testRecipient ? [normalizePhone(testRecipient)] : [];
  return [...new Set([...dariArgumen, ...dariKonfigurasi])].filter(Boolean);
}

// Dipisah supaya pemasang tugas dan pengujian dapat memeriksa arah pesan tanpa
// ikut mengirim apa pun.
// Pesan galat Fonnte sengaja tidak memuat isi jawaban provider (dijaga oleh uji
// fonnte.test.mjs), jadi penyebab yang mungkin ditambahkan di sisi pemantau
// sebagai petunjuk yang aman, bukan sebagai kutipan dari Fonnte.
const PETUNJUK = {
  'Fonnte API tidak menerima pesan.': 'kemungkinan kredit habis atau perangkat Fonnte sedang tidak aktif — periksa dashboard Fonnte',
  'Fonnte API menolak pesan': 'kemungkinan token Fonnte tidak berlaku — periksa FONNTE_TOKEN',
  'Fonnte API tidak dapat dihubungi.': 'jaringan laptop ke api.fonnte.com terputus',
  'Fonnte API melewati batas waktu.': 'api.fonnte.com tidak menjawab dalam 15 detik',
  'Nomor tujuan tidak valid.': 'periksa WHATSAPP_RECIPIENT_NUMBER atau --recipient'
};

export function jelaskanKesalahan(error) {
  const awal = String(error?.message || error).slice(0, 160);
  const petunjuk = Object.entries(PETUNJUK).find(([pesan]) => awal.startsWith(pesan))?.[1];
  return petunjuk ? `${awal} — ${petunjuk}` : awal;
}

export function siapkanPeringatan({ recipientsArg, config }) {
  if (config.provider !== 'fonnte') {
    return { alasan: `provider ${config.provider} belum didukung pemantau mandiri, gunakan --recipient di aplikasi` };
  }
  if (!config.fonnte.token || !config.validFonnteApiUrl) {
    return { alasan: 'FONNTE_TOKEN atau FONNTE_API_URL belum terisi benar' };
  }
  const tujuan = daftarTujuan({ recipientsArg, testRecipient: config.meta.testRecipient });
  if (!tujuan.length) return { alasan: 'nomor tujuan peringatan belum diisi (--recipient atau WHATSAPP_RECIPIENT_NUMBER)' };
  return { tujuan };
}

export async function kirimPeringatan({
  pesan,
  recipientsArg,
  kirim = sendFonnteMessage,
  muatEnv = async () => {
    if (process.env.FONNTE_TOKEN) return;
    try {
      // Penjadwal tugas tidak mewarisi shell interaktif, jadi .env dimuat bila
      // memang belum ada di lingkungan.
      await import('dotenv/config');
    } catch {
      // Tidak ada dotenv atau tidak ada .env: konfigurasi dibaca apa adanya.
    }
  },
  bacaKonfigurasi = () => getWhatsAppConfig(process.env)
}) {
  const hasil = [];
  let terkirim = 0;

  await muatEnv();

  const config = bacaKonfigurasi();
  const siap = siapkanPeringatan({ recipientsArg, config });
  if (siap.alasan) {
    const item = { mask: '-', status: 'dilewati', detail: siap.alasan };
    return { hasil: [item], terkirim, dilewati: true, rangkuman: () => `dilewati (${siap.alasan})` };
  }

  let gagal = 0;
  for (const phone of siap.tujuan) {
    try {
      const jawaban = await kirim(config.fonnte, phone, pesan);
      terkirim += 1;
      hasil.push({
        mask: maskPhone(phone),
        status: 'terkirim',
        detail: jawaban?.requestId ? `request ${jawaban.requestId}` : ''
      });
    } catch (error) {
      gagal += 1;
      hasil.push({ mask: maskPhone(phone), status: 'gagal', detail: jelaskanKesalahan(error) });
    }
  }
  return {
    hasil,
    terkirim,
    dilewati: false,
    rangkuman: () => `terkirim=${terkirim} gagal=${gagal} tujuan=${siap.tujuan.length}`
  };
}
