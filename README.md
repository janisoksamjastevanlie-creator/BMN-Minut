# SIMAN BMN BPS Minut

## Menjalankan server dan menyimpan data bersama

Server aplikasi dan database SQLite berjalan di laptop yang menjadi host. Gunakan Node.js 22.5 atau lebih baru.

1. Install dependensi: `npm install`.
2. Salin `.env.example` menjadi `.env`, lalu atur `ADMIN_NIP` dan `ADMIN_PASSWORD`. Kata sandi harus unik dan minimal 12 karakter. Jangan membagikan atau memasukkan `.env` ke Git.
3. Jalankan `npm run dev`, lalu buka `http://localhost:3000`.
4. Masuk dengan NIP dan kata sandi administrator dari `.env`. Saat pertama kali masuk, data aplikasi di browser host disalin ke database SQLite lokal.
5. Dari menu **Manajemen Pengguna**, atur kata sandi minimal 12 karakter untuk setiap pegawai. Akun pegawai yang sudah ada belum memiliki kata sandi sampai administrator menetapkannya.

Database berada di `data/siman.sqlite`. Hentikan server sebelum menyalin file database untuk membuat cadangan. Simpan cadangan di lokasi aman.

## Deployment Node.js ke Hostinger

Project ini adalah aplikasi React/Vite dengan backend Node.js/Express, autentikasi session, dan database SQLite melalui `node:sqlite`. `src/db/schema.sql` adalah skema rancangan PostgreSQL dan **bukan** database yang dipakai server saat berjalan; jangan mengimpor file tersebut sebagai pengganti database aplikasi. Backend memerlukan Node.js 22.5 atau lebih baru karena menggunakan `node:sqlite`. Pilih preset Express, branch `main`, Node.js `22.x`, dan root `./` pada layar deploy.

Hostinger menyebut Node.js web app tersedia untuk paket Business dan Cloud; fitur/limitasi dapat berubah. Verifikasi paket aktif, kemampuan menjalankan proses Express berkelanjutan, port yang disediakan, izin filesystem, dan khususnya penyimpanan persisten yang bisa ditulis sebelum memilih target deployment. Lihat [panduan Node.js app Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/) dan [versi Node.js yang didukung](https://www.hostinger.com/support/how-to-select-the-node-js-version-for-your-application/).

### Pengaturan build dan start

- Build command: `npm run build`
- Start command: `npm start`
- Root directory: `./`
- Runtime: Node.js `22.x` (pastikan runtime minor-nya sekurang-kurangnya `22.5`)
- Health check bila diminta: `GET /api/health` (balasan `{"status":"ok"}` jika server dan SQLite tersedia)

Server membaca `PORT` dari environment hosting dan, saat `NODE_ENV=production`, mendengarkan pada `0.0.0.0` secara default. `HOST` dapat diatur secara eksplisit jika instruksi paket hosting mensyaratkannya. Development lokal tetap mengikat `127.0.0.1`. Gunakan domain dengan HTTPS; backend melayani frontend hasil build dan API dari origin yang sama sehingga tidak memerlukan konfigurasi CORS lintas-origin atau `.htaccess`.

### Siapkan database dan rahasia sebelum deploy

1. Identifikasi database produksi yang akan dipakai. Database saat ini ialah file SQLite `siman.sqlite`; tabel aplikasi, autentikasi, sesi, dan notifikasi berada di file tersebut. Tidak ada koneksi MySQL/MariaDB yang dikonfigurasi di backend.
2. **Jangan deploy lalu melakukan login pertama untuk menginisialisasi data nyata.** Jika database pada hosting belum berisi `app_data`, alur login administrator pertama dapat mengirim data awal yang tersedia di browser, termasuk data contoh. Jangan gunakan data contoh untuk sistem produksi.
3. Hentikan server lokal, buat dan verifikasi backup lengkap folder `data`, lalu salin database dari server lokal ke lokasi persisten privat di hosting melalui cara transfer aman yang didukung Hostinger (misalnya SFTP atau terminal). Pertahankan `siman.sqlite` utuh; jangan mengedit file ketika proses server masih berjalan. Uji restore pada salinan sebelum cutover. Jangan meletakkan database di `public_html`, dalam Git, atau folder yang dapat diunduh web.
4. Set `DATA_DIRECTORY` ke path absolut yang bisa ditulis oleh app dan tetap persisten melintasi restart/redeploy. Jika platform tidak menjamin persistence folder tersebut atau tidak mendukung operasi file SQLite dengan benar, **jangan deploy database produksi SQLite di sana**: hentikan cutover dan rancang migrasi terpisah ke database server dengan backup, migrasi skema yang benar, dan perubahan backend yang diuji terlebih dahulu. Jangan mengimpor `src/db/schema.sql` sebagai pengganti migrasi SQLite.
5. Isi environment variables di hPanel/secret manager, bukan di source code:
   - `NODE_ENV=production`
   - `DATA_DIRECTORY=<path-absolut-ke-storage-persisten>`
   - `ADMIN_NIP` dan `ADMIN_PASSWORD` yang kuat. Password ini hanya menjadi bootstrap untuk database **baru**; `INSERT OR IGNORE` tidak mereset kredensial pada akun yang sudah ada dalam database hasil pemulihan.
   - `APP_PUBLIC_URL=https://<domain-anda>` agar tautan notifikasi tidak menunjuk ke localhost.
   - `WHATSAPP_PROVIDER=fonnte`, `FONNTE_TOKEN`, `FONNTE_API_URL=https://api.fonnte.com/send`, serta `FONNTE_WEBHOOK_SECRET` (minimal 32 karakter acak) jika mengaktifkan Fonnte. Jangan menaruh nilai rahasia pada command build atau variable berawalan `VITE_`.
   - `PORT` biasanya disediakan hosting. Jangan override kecuali petunjuk Hostinger pada aplikasi Anda meminta nilai tertentu. `HOST` biasanya tidak perlu diisi karena production default ke `0.0.0.0`.
6. Pastikan satu instance aplikasi menulis ke database pada satu waktu. SQLite berada di disk lokal dan tidak sesuai untuk beberapa app replica yang berbagi direktori jaringan biasa tanpa dukungan locking yang teruji.

### Deploy, uji, dan rollback

1. Konfirmasi paket hPanel mendukung Node.js web app dan persistent storage; pastikan database produksi sudah dibackup dan berhasil dipulihkan di staging.
2. Sambungkan GitHub `janisoksamjastevanlie-creator/BMN-Minut`, pilih `main`, preset Express, Node `22.x`, dan root `./`. Masukkan environment production pada pengaturan app sebelum start.
3. Jalankan `npm run build`, lalu `npm start`. Periksa log startup dan `https://<domain-anda>/api/health`; respons sehat tidak membuktikan seluruh transaksi sudah berfungsi.
4. Aktifkan SSL/HTTPS di hPanel. Uji login/logout, data yang diimpor (jumlah pengguna/aset/transaksi dibanding backup), tambah/edit melalui akun uji yang diizinkan, reload, session cookie, dokumen/gambar, endpoint webhook, dan restart kemudian pastikan data tetap ada. Uji dahulu pada staging; jangan melakukan transaksi percobaan pada data resmi.
5. Daftarkan URL webhook Fonnte `https://<domain-anda>/api/whatsapp/webhook` hanya setelah HTTPS aktif dan `FONNTE_WEBHOOK_SECRET` cocok. Kirim pesan uji ke nomor yang diizinkan lalu periksa status provider dan log tanpa mencatat token.
6. Untuk rollback, hentikan app, pertahankan salinan database terkini, deploy ulang commit stabil sebelumnya melalui hPanel/Git, dan pulihkan backup database yang sesuai hanya setelah aplikasi berhenti. Jangan restore backup lama di atas database yang lebih baru tanpa menilai kehilangan transaksi.

Deployment/cutover online belum dilakukan atau diverifikasi oleh panduan ini. Persistensi disk, lokasi/path database, port reverse proxy, secret manager, dan opsi backup harus dipastikan pada paket Hostinger aktual terlebih dahulu.

### Catatan audit yang perlu ditangani

- Dependency `xlsx` diperbarui ke SheetJS Community Edition 0.20.3 dari CDN resmi SheetJS karena versi yang berisi perbaikan advisory belum tersedia di npm. Ini mempertahankan dukungan impor `.xlsx`, `.xls`, CSV, dan TSV serta ekspor template. Proses instalasi dependency saat deploy harus dapat mengakses `cdn.sheetjs.com`. Pertahankan URL dependency terkunci di `package.json`/`package-lock.json`; jangan menggantinya dengan paket `xlsx` dari npm yang versinya rentan. Verifikasi ulang `npm audit --omit=dev` saat update dependency berikutnya.
- Upload dokumen/gambar saat ini dikodekan sebagai Data URL, disimpan di state aplikasi, lalu seluruh state dikirim sebagai JSON ke `/api/state`; batas parser backend adalah 25 MB total request. Encoding Base64 memperbesar ukuran file, sehingga batas 25 MB yang ditampilkan UI tidak menjamin file sebesar itu dapat tersinkron. File tersimpan di SQLite, bukan direktori upload terpisah. Uji dengan salinan data staging; jangan memperbesar batas request tanpa validasi ukuran dan pengujian pemakaian memori.
- Build produksi berhasil saat audit, tetapi bundle JavaScript melebihi 500 kB setelah minifikasi. Ini peringatan performa, bukan kegagalan build.

## Akses jarak jauh dengan Tailscale

1. Install Tailscale di laptop server dan perangkat pengguna; hubungkan perangkat ke tailnet yang sama dan hanya izinkan anggota yang berwenang.
2. Pastikan aplikasi berjalan dengan `npm run dev`.
3. Jalankan `tailscale serve --bg localhost:3000` di laptop server. Buka URL HTTPS tailnet yang ditampilkan Tailscale dari perangkat lain yang terhubung.
4. Jika Vite menolak nama host tailnet, masukkan nama host tersebut ke `TUNNEL_HOST` di `.env`, lalu mulai ulang server.

Server hanya mendengarkan di `127.0.0.1`; jangan meneruskan port 3000 atau port SQLite langsung ke internet. Perangkat pengguna harus tersambung ke Tailscale agar dapat membuka aplikasi.

Setelah ada perubahan dari perangkat lain, muat ulang halaman untuk mengambil data terbaru. Bila server mendeteksi penyimpanan bersamaan, aplikasi menolak penimpaan dan meminta halaman dimuat ulang.

## Notifikasi Permohonan Barang melalui WhatsApp

1. Pilih provider dengan `WHATSAPP_PROVIDER` (`meta` atau `twilio`; default `meta`). Untuk Meta, simpan **Phone Number ID** dan access token di `.env` sebagai `WHATSAPP_PHONE_NUMBER_ID` dan `WHATSAPP_ACCESS_TOKEN`. Untuk Twilio, isi `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY` (API Key SID), `TWILIO_API_KEY_SECRET`, dan `TWILIO_WHATSAPP_FROM` dari Twilio Console. `TWILIO_API_KEY_SID` tetap diterima sebagai nama alias lama. Jangan masukkan credential ke kode frontend, membagikannya melalui chat, atau menyimpan `.env` ke Git.
2. Provider Twilio menggunakan `TWILIO_WHATSAPP_FROM` hanya sebagai sender. Nomor tujuan diambil dari field `phone` semua pengguna dengan role `Administrator` dalam koleksi pengguna backend; nomor ganda dideduplikasi dan nomor dinormalisasi saat pengiriman (termasuk `08...` menjadi kode negara Indonesia) tanpa mengubah data tersimpan.
3. Provider Twilio mengirim notifikasi kepada seluruh Administrator bernomor valid setelah permohonan tersimpan, saat permohonan disetujui, dan saat permohonan dihapus/dibatalkan. Provider Meta mempertahankan routing notifikasi yang sudah ada. Pengiriman memakai deduplikasi event yang tersimpan; event yang sudah dicoba tidak dikirim ulang otomatis.
4. Mulai ulang server setelah mengubah `.env`. Kegagalan pengiriman tidak membatalkan penyimpanan/status permohonan. Hasil dan error dicatat backend dengan nomor penerima tersamarkan; credential dan authorization header tidak dicatat.
5. Untuk Meta, teks bebas hanya dapat dikirim dalam jendela layanan pelanggan WhatsApp 24 jam. Untuk pesan di luar jendela tersebut, siapkan template utility yang disetujui Meta dengan satu placeholder body (`{{1}}`), lalu atur `WHATSAPP_TEMPLATE_NAME` dan `WHATSAPP_TEMPLATE_LANGUAGE`. Versi Graph API dapat diubah melalui `WHATSAPP_GRAPH_API_VERSION`. Untuk Twilio, gunakan sender WhatsApp yang diaktifkan/terdaftar di akun Twilio (Sandbox atau sender produksi).
6. Respons create-message Twilio mengonfirmasi bahwa pesan dibuat/diantrikan oleh provider; itu belum membuktikan pesan telah diterima di perangkat. Konfirmasi delivery memerlukan callback/status delivery dari Twilio.

Jika nomor penerima atau konfigurasi API belum tersedia, atau Meta menolak pesan, aplikasi melaporkan kegagalan notifikasi. Tindakan yang sama tidak dikirim ulang otomatis.

## Menggunakan Fonnte

1. Jika token pernah dibagikan atau dipublikasikan, cabut dan buat token baru di dashboard Fonnte. Jangan salin token ke source code, browser, tiket, atau log.
2. Atur `WHATSAPP_PROVIDER="fonnte"`, `FONNTE_TOKEN`, dan `FONNTE_WEBHOOK_SECRET` di `.env` atau secret manager server. Buat secret webhook acak dengan panjang minimal 32 karakter dan masukkan nilai yang sama pada pengaturan secret webhook Fonnte. Endpoint API dibatasi ke `https://api.fonnte.com/send`.
3. Daftarkan URL publik HTTPS `https://<domain>/api/whatsapp/webhook` sebagai webhook Fonnte dan aktifkan opsi secret. Webhook harus mengirim JSON berisi `secret`, `sender`, `timestamp`, dan `message` atau `text`. Jika tersedia, `inboxid` dipakai sebagai kunci idempotensi; jika tidak, aplikasi membuat kunci dari pengirim, waktu, dan konten pesan. Pesan tanpa timestamp yang valid ditolak.
4. Mulai ulang server. Akun WhatsApp pengguna ditautkan melalui menu akun WhatsApp di aplikasi; chatbot hanya menggunakan akun tertaut dan izin baca yang sudah diterapkan aplikasi. Notifikasi permohonan dikirim kepada pemohon tertaut dan petugas tertaut yang memiliki izin persetujuan/pengelolaan persediaan. Event lain menggunakan izin yang terkait event.
5. API Fonnte menggunakan form-data dan header `Authorization` tanpa awalan `Bearer`. Respons `status: true` berarti provider menerima/memproses permintaan, bukan bukti pesan telah sampai ke perangkat. Status pengiriman akhir Fonnte tidak dipantau oleh aplikasi saat ini.
6. Pengiriman gagal dicatat dengan nomor tersamarkan dan tidak dicoba ulang otomatis. API send Fonnte yang digunakan di sini tidak menjanjikan kunci idempotensi; retry otomatis setelah timeout berisiko mengirim pesan ganda. Pengiriman ulang manual/dashboard admin belum tersedia.

Dalam development, server mendengarkan hanya di `127.0.0.1`; di production, server memakai `0.0.0.0` secara default untuk reverse proxy hosting. Tailscale memberi akses kepada perangkat di tailnet, tetapi tidak membuat webhook dapat diakses Fonnte. Untuk chatbot/webhook online, deploy backend dan SQLite pada host yang sesuai, sediakan domain HTTPS publik, secret manager, backup database, serta uji di staging. Deployment publik belum dilakukan atau diverifikasi oleh perubahan ini; jangan membuka port SQLite atau server development langsung ke internet.

Dokumentasi yang diverifikasi:
- [Fonnte Send API](https://docs.fonnte.com/api-send-message/)
- [Fonnte webhook reply](https://docs.fonnte.com/webhook-reply-message/)
- [Fonnte Node.js webhook example](https://docs.fonnte.com/webhook-reply-message-with-nodejs/)
- [Fonnte webhook secret update](https://docs.fonnte.com/update-6-february-2025/)
