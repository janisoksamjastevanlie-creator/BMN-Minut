// Penyusun peluncur senyap untuk Windows Task Scheduler.
//
// Tugas terjadwal yang menjalankan node langsung akan menampilkan jendela konsol
// selama beberapa detik setiap lima menit — mengganggu dan membuat orang
// mematikan jadwalnya. Peluncur .vbs memanggil shell.Run dengan jendela 0
// (tersembunyi). Aturan kutipnya mudah salah dan kegagalannya baru terlihat
// berjam-jam kemudian, jadi teks ini disusun di modul terpisah yang bisa diuji.
export function kutipVbs(barisPerintah) {
  // Literal VB menandai akhir teks dengan tanda kutip ganda di dalam teks.
  return `"${String(barisPerintah).replace(/"/g, '""')}"`;
}

export function susunPeluncur({ root, node, script, logFile, flags = ['--notify'] }) {
  const bagian = [node, '--env-file-if-exists=.env', script, ...flags, `--log=${logFile}`]
    .map(item => (String(item).includes(' ') ? `"${item}"` : item));
  return [
    "' Pemantau berjalan senyap: tanpa jendela konsol yang berkedip tiap lima menit.",
    'Set shell = CreateObject("WScript.Shell")',
    `shell.CurrentDirectory = "${root}"`,
    `shell.Run ${kutipVbs(bagian.join(' '))}, 0, False`,
    ''
  ].join('\r\n');
}
