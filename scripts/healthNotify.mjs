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
import { periksaKanalFonnte } from './fonnteChannel.mjs';

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

// Sebab asli dari Fonnte (dikirim lewat error.sebab) jauh lebih berguna daripada
// "gagal=1". Diterjemahkan per awalan agar tidak perlu menebak jawaban provider.
const SEBAB_FONNTE = [
  [/disconnected device/, 'perangkat WhatsApp Fonnte terputus — sambungkan ulang di dashboard Fonnte (pindai QR)'],
  [/credit habis|insufficient credit|no credit/, 'kredit Fonnte habis — top up di dashboard Fonnte'],
  [/expired|kedaluwarsa/, 'paket Fonnte kedaluwarsa — perpanjang di dashboard Fonnte'],
  [/invalid token|unauthorized|token/, 'token Fonnte tidak berlaku — periksa FONNTE_TOKEN'],
  [/invalid number|nomor/, 'nomor tujuan ditolak Fonnte — periksa WHATSAPP_RECIPIENT_NUMBER']
];

export function jelaskanKesalahan(error) {
  const awal = String(error?.message || error).slice(0, 160);
  const sebab = String(error?.sebab || '').slice(0, 120);
  if (!sebab) {
    const petunjuk = Object.entries(PETUNJUK).find(([pesan]) => awal.startsWith(pesan))?.[1];
    return petunjuk ? `${awal} — ${petunjuk}` : awal;
  }
  const petunjuk = SEBAB_FONNTE.find(([pola]) => pola.test(sebab.toLowerCase()))?.[1];
  return `${awal.replace(/\.$/, '')} (sebab: ${sebab})${petunjuk ? ` — ${petunjuk}` : ''}`;
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
  periksaKanal = periksaKanalFonnte,
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
  let kanal = null;

  await muatEnv();

  const config = bacaKonfigurasi();
  const siap = siapkanPeringatan({ recipientsArg, config });
  if (siap.alasan) {
    const item = { mask: '-', status: 'dilewati', detail: siap.alasan };
    return {
      hasil: [item],
      terkirim,
      gagal: 0,
      kanal: null,
      dilewati: true,
      rangkuman: () => `dilewati (${siap.alasan})`
    };
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
  if (terkirim === 0 && gagal > 0) {
    // Semua percobaan gagal: tanyakan status perangkatnya, sebab "gagal=1" saja
    // tidak membedakan server lambat dari WhatsApp yang memang tidak bisa dipakai.
    // Hanya dipanggil pada jalur gagal supaya pemeriksaan rutin tidak menambah
    // permintaan ke Fonnte.
    try {
      // Diperiksa dengan objek Fonnte yang sama seperti pengiriman (token +
      // apiUrl), bukan konfigurasi WhatsApp utuh: konfigurasi utuh tidak punya
      // field itu sehingga jawabannya selalu "tidak lengkap".
      kanal = await periksaKanal({ config: config.fonnte });
    } catch {
      kanal = { siap: false, status: 'tidak_terkenal', catatan: 'status perangkat tidak dapat dibaca' };
    }
  }
  return {
    hasil,
    terkirim,
    gagal,
    dilewati: false,
    kanal,
    rangkuman: () => `terkirim=${terkirim} gagal=${gagal} tujuan=${siap.tujuan.length}`
  };
}
