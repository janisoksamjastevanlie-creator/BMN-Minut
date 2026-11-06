// Notifikasi lokal sebagai cadangan ketika jalur WhatsApp tidak berfungsi.
//
// Pemantau dijalankan dari Task Scheduler di laptop ini, jadi ia punya satu
// saluran yang selalu tersedia tanpa kredensial apa pun: notifikasi Windows itu
// sendiri. Tanpa cadangan ini, perangkat Fonnte yang terputus membuat pemantau
// buta sekaligus bisu — gangguan server serius tidak sampai ke mana-mana dan yang
// tercatat hanya "gagal=1".
//
// Perintahnya dibangun di modul terpisah supaya pengutipannya bisa diuji. Ini
// pelajaran yang sama dengan peluncur .vbs: kutip yang salah baru ketahuan
// berjam-jam kemudian, itu pun kalau ada yang melihat.
import { execFile } from 'node:child_process';
import process from 'node:process';

export function kutipPowerShell(teks) {
  // Teks PowerShell satu kutip hanya perlu menggandakan tanda kutip satu.
  // Karakter kontrol dihapus lewat daftar kode, bukan lewat pola: ekspresi
  // reguler untuk rentang kontrol ditolak penyaring kode dan mudah salah tulis.
  let aman = '';
  let jedaTerakhir = false;
  for (const karakter of String(teks)) {
    const kode = karakter.charCodeAt(0);
    if (kode === 10 || kode === 13) {
      // Baris baru akan memutus perintah; diganti pemisah, sekali untuk tiap
      // pasangan CR-LF.
      if (!jedaTerakhir) aman += ' / ';
      jedaTerakhir = true;
    } else if (kode < 32 || kode === 127) {
      aman += ' ';
      jedaTerakhir = false;
    } else {
      aman += karakter;
      jedaTerakhir = false;
    }
  }
  return `'${aman.replace(/'/g, "''")}'`;
}

function bersihkan(nilai, maksimal) {
  // Notifikasi balon hanya menampilkan satu-dua baris, jadi baris baru diubah
  // menjadi pemisah titik-tengah alih-alih dibuang: isinya tetap bisa dibaca.
  const teks = String(nilai || '')
    .replace(/\r?\n+/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();
  return teks.length > maksimal ? `${teks.slice(0, maksimal - 1)}…` : teks;
}

export const BATAS_JUDUL = 90;
export const BATAS_PESAN = 400;

export function susunPerintahToast({ judul, pesan, detikTampil = 12 }) {
  const detik = Math.max(3, Math.min(30, Number(detikTampil) || 12));
  const baris = [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    '$n = New-Object System.Windows.Forms.NotifyIcon',
    '$n.Icon = [System.Drawing.SystemIcons]::Warning',
    '$n.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Warning',
    `$n.BalloonTipTitle = ${kutipPowerShell(bersihkan(judul, BATAS_JUDUL))}`,
    `$n.BalloonTipText = ${kutipPowerShell(bersihkan(pesan, BATAS_PESAN))}`,
    '$n.Visible = $true',
    '$n.ShowBalloonTip(' + Math.round(detik * 1000) + ')',
    `Start-Sleep -Seconds ${detik}`,
    '$n.Visible = $false',
    '$n.Dispose()'
  ];
  return baris.join('; ');
}

export async function tampilkanToast({
  judul,
  pesan,
  detikTampil,
  jalankan = (file, args) =>
    new Promise((resolve) => {
      execFile(file, args, { windowsHide: true, timeout: 45000 }, (error, stdout, stderr) =>
        resolve({ berhasil: !error, keluaran: `${stdout || ''}${stderr || ''}`.trim().slice(0, 300) })
      );
    })
}) {
  if (process.platform !== 'win32') {
    return { berhasil: false, catatan: 'notifikasi lokal hanya tersedia di Windows' };
  }
  const perintah = susunPerintahToast({ judul, pesan, detikTampil });
  const hasil = await jalankan('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-WindowStyle',
    'Hidden',
    '-Command',
    perintah
  ]);
  return {
    ...hasil,
    catatan: hasil.berhasil
      ? 'notifikasi Windows tampil'
      : `notifikasi Windows gagal (${hasil.keluaran || 'tanpa keluaran'})`
  };
}
