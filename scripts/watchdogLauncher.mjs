// Penyusun peluncur senyap untuk Windows Task Scheduler.
//
// Tugas terjadwal yang menjalankan node langsung akan menampilkan jendela konsol
// selama beberapa detik setiap lima menit — mengganggu dan membuat orang
// mematikan jadwalnya. Peluncur .vbs memanggil shell.Run dengan jendela 0
// (tersembunyi). Aturan kutip dan sintaksisnya mudah salah, dan karena jadwal
// berjalan tanpa antarmuka kegagalannya baru terlihat berjam-jam kemudian, jadi
// teks ini disusun di modul terpisah yang bisa diuji dan ditandatangani sendiri.
export function kutipVbs(barisPerintah) {
  // Literal VB menandai akhir teks dengan tanda kutip ganda di dalam teks.
  return `"${String(barisPerintah).replace(/"/g, '""')}"`;
}

// Task Scheduler menjalankan Command dengan CreateProcess, bukan ShellExecute:
// jalur .vbs telanjang (hasil schtasks /TR "...\peluncur.vbs") tidak dianggap
// executable, instansinya menggantung sebagai "berjalan", dan semua tick
// berikutnya ditolak tanpa pesan. Karena itu aksinya wscript.exe yang diberi
// argumen, dan //B menutup dialog galat skrip yang bisa menahan antrean.
export function trPeluncur(berkasVbs) {
  return `wscript.exe //B "${String(berkasVbs)}"`;
}

export function susunPeluncur({ root, node, script, logFile, flags = ['--notify'] }) {
  const bagian = [node, '--env-file-if-exists=.env', script, ...flags, `--log=${logFile}`]
    .map(item => (String(item).includes(' ') ? `"${item}"` : item));
  // Kode keluar node diambil dan dicatat. Tanda kurung pada shell.Run(...) wajib:
  // tanpa kurung, penugasan `kode = shell.Run ..., 0, True` adalah kesalahan
  // kompilasi VBScript. Dengan //B kesalahan itu tidak tampil ke siapa pun dan
  // wscript keluar dengan kode 1 — angka yang sama dipakai pemantau untuk
  // "ditemukan gangguan", sehingga jadwal yang tidak pernah menjalankan node
  // pun terlihat seperti pemantauan yang berhasil menemukan masalah.
  const panggil = `shell.Run(${kutipVbs(bagian.join(' '))}, 0, True)`;
  return [
    "' Pemantau berjalan senyap: tanpa jendela konsol yang berkedip tiap lima menit.",
    "' Argumen tunggu=True bukan hiasan: Task Scheduler mengikuti umur proses yang",
    "' dilunculkannya. Kalau peluncurnya berhenti lebih dulu sementara node masih jalan,",
    "' instansinya dianggap berjalan terus dan setiap tick berikutnya ditolak diam-diam.",
    "' Baris PELUNCUR ikut ditulis karena jadwal yang tidak menjalankan apa pun masih",
    "' bisa terlihat " + '"sukses"' + " di Task Scheduler, jadi peluncurnya yang memberi tanda.",
    "' Berkas log dibuka-tutup di sekitar shell.Run: FSO menahan berkasnya saat",
    "' dibuka, dan node menulis barisnya sendiri sambil peluncur berjalan.",
    'Set fs = CreateObject("Scripting.FileSystemObject")',
    'Set shell = CreateObject("WScript.Shell")',
    `shell.CurrentDirectory = "${root}"`,
    `Set aliran = fs.OpenTextFile("${logFile}", 8, True)`,
    'aliran.WriteLine "[" & Now & "] PELUNCUR mulai"',
    'aliran.Close',
    `kode = ${panggil}`,
    `Set aliran = fs.OpenTextFile("${logFile}", 8, True)`,
    'aliran.WriteLine "[" & Now & "] PELUNCUR selesai kode=" & kode',
    'aliran.Close',
    ''
  ].join('\r\n');
}
