# SIMAN BMN BPS Minut

> **Status integrasi:** backend kini memiliki mode operasional yang menolak legacy mode di production, memvalidasi skema tanpa startup DDL/seeding, membaca tabel relasional, dan mengarahkan penyimpanan state melalui adapter transaksional. Namun integrasi itu belum lulus validasi menyeluruh di staging. Snapshot yang tersedia hanya skema tanpa data; akun, role, dan transaksi nyata belum dapat diuji. Cloudflare Access, domain HTTPS, Tunnel, dan URL publik juga belum dikonfigurasi atau diverifikasi. **Belum siap deploy.** Lihat [laporan kesiapan database operasional](./OPERATIONAL-DATABASE-READINESS.md) dan [deployment readiness checklist](./DEPLOYMENT-CHECKLIST.md).

## Menjalankan server dan menyimpan data bersama

Mode server legacy hanya untuk pengembangan terisolasi. Backend memerlukan Node.js 22.5 atau lebih baru dan MySQL non-operasional yang dapat dijangkau. Mode ini membuat tabel `auth_users`, `sessions`, `app_data`, dan `app_meta`, serta dapat membuat akun bootstrap dari `ADMIN_NIP`/`ADMIN_PASSWORD`. Jangan gunakan kredensial atau database operasional. Jangan membagikan atau memasukkan `.env` ke Git.

Untuk development lokal, `DB_PASSWORD` boleh kosong hanya jika akun MariaDB lokal memang telah diverifikasi menerima koneksi tanpa password; production selalu memerlukan password non-kosong.

Jalankan `npm install`, `npm run dev`, lalu buka `http://localhost:3000`. Pilih administrator, lalu gunakan **Manajemen Pengguna** untuk menetapkan kata sandi minimal 12 karakter bagi tiap pegawai. Data aplikasi, sesi, dan catatan WhatsApp disimpan di MySQL, bukan di file lokal.

## Arsip dokumen privat di backend

Upload dokumen disimpan oleh backend pada disk privat, di luar folder `public` dan `dist`, dengan salinan cadangan biner pada tabel MySQL `document_files`. Metadata dan cadangan disimpan dalam transaksi yang sama; upload tidak dianggap berhasil jika cadangan gagal disimpan. Backend tidak mengirim cadangan sebagai base64 pada sinkronisasi state. Akses lihat, unduh, pulihkan, dan hapus memakai endpoint aplikasi dengan pemeriksaan sesi dan izin. Berkas tidak disajikan sebagai file statis dan tidak memiliki tautan publik.

Untuk menjalankan fitur:

1. Atur `DOCUMENT_STORAGE_DIR` ke folder privat yang persisten dan dapat ditulis oleh proses Node.js. Jika tidak diatur, backend memakai `data/documents` di direktori aplikasi. Di Hostinger, gunakan folder persisten di luar direktori web publik dan direktori rilis/build; pastikan deploy atau pergantian release tidak menghapusnya.
2. Atur `DOCUMENT_MAX_FILE_SIZE_MB` sesuai batas memori, timeout, dan batas request pada hosting/reverse proxy. Default `25`; nilai yang diizinkan `1`–`100` MB. Batas proxy harus sekurang-kurangnya sama dengan batas aplikasi.
3. Pada database operasional yang disetujui, terapkan satu kali migrasi aditif `migrations/document-host-storage-v1.sql` sebelum menjalankan versi aplikasi ini. Server tidak menjalankan DDL otomatis. Uji migrasi serta upload, unduh, dan hapus di staging terlebih dahulu.
4. Backup database dan folder penyimpanan dokumen secara terkoordinasi. Prosedur pemulihan harus mengembalikan keduanya ke titik waktu yang sama; jangan membersihkan atau mengganti folder tersebut saat deploy.
5. Pastikan `max_allowed_packet` MySQL cukup besar untuk ukuran lampiran ditambah overhead query, serta kuota database mencukupi. Mode operasional menggunakan tabel `document_files` dari migrasi adapter yang sudah tersedia; mode legacy membuat tabel cadangan ini saat inisialisasi. Tidak ada startup DDL tambahan di mode operasional.

Jika berkas disk tidak ditemukan, endpoint membaca salinan MySQL dengan pemeriksaan checksum dan ukuran sebelum mengirim PDF/gambar. Berkas lama yang masih ada di disk dicadangkan saat pertama kali dibuka; ini bukan backup massal, jadi jangan hapus disk lama sebelum seluruh lampiran dicadangkan. Hapus dokumen juga menghapus salinan cadangannya.

Jika disk **dan** cadangan sama-sama tidak tersedia, data nota tetap ditampilkan tetapi viewer tidak memuat pesan JSON sebagai PDF/gambar. Pengelola dokumen dapat memilih **Unggah ulang berkas asli** pada detail nota (`PUT /api/documents/:id/file`). Endpoint hanya menerima file dengan checksum dan ukuran identik dengan lampiran awal; nomor nota, item, tanggal, dan nilai tidak diubah. Tanpa file asli, pulihkan folder `DOCUMENT_STORAGE_DIR` dari backup hosting; metadata saja tidak dapat mengembalikan isi berkas yang hilang. Preview dan unduh memeriksa respons API terlebih dahulu, lalu memakai URL Blob lokal dengan cleanup saat modal ditutup.

Tes integrasi `tests/document-api.integration.test.mjs` bersifat opt-in (`BMN_DOCUMENT_INTEGRATION=1`), hanya menerima konfigurasi MySQL localhost dari `.env`, dan membuat/menghapus database uji unik serta folder sementara miliknya sendiri. Tes memerlukan izin membuat database lokal; tidak memakai database aplikasi yang sudah ada.

Backend membuat direktori/file dengan permission privat (`0700`/`0600` pada platform yang mendukungnya), menerima format dokumen yang diizinkan saja, memakai nama file acak di disk, dan memeriksa checksum ketika berkas diunduh. Konfigurasi Hostinger yang sebenarnya, persistensi setelah deploy, backup/restore, serta upload langsung ke hosting masih harus diverifikasi sebelum fitur dinyatakan aktif. Folder yang pernah dibuat di Google Drive tidak dihapus, tetapi tidak lagi digunakan aplikasi.

## Deployment Node.js ke Hostinger

> **Deployment belum diaktifkan.** Catatan Hostinger di bawah hanya menjelaskan bentuk runtime; jangan gunakan langkah lama yang membuat database kosong atau bootstrap akun. Production wajib memakai `DATA_BACKEND=operational`, skema operasional yang sudah disetujui, akun yang diprovisikan untuk pengguna nyata, Cloudflare Access, dan origin HTTPS yang diverifikasi. Jangan menghubungkan instance ini ke produksi atau mengaktifkan DNS/cutover sebelum ada persetujuan eksplisit.

Project ini adalah aplikasi React/Vite dengan backend Node.js/Express dan MySQL melalui driver `mysql2/promise`. Backend memerlukan Node.js 22.5 atau lebih baru. `src/db/schema.sql` adalah skema rancangan PostgreSQL dan **bukan** skema aplikasi yang berjalan. Production memakai skema operasional yang sudah disiapkan manual; server tidak membuat atau memigrasikan skema saat startup.

### URL halaman aplikasi

Frontend memakai History API tanpa router tambahan. URL menu utama: `/dashboard`, `/aset-bmn`, `/manajemen-ruangan`, `/asset-mapping-3d`, `/pemindahan-aset`, `/pemeliharaan-aset`, `/penghapusan-bmn`, `/master-persediaan`, `/gudang-3d`, `/permohonan-barang-atk`, `/stock-opname`, `/dokumen-bast`, `/laporan-resmi-bps`, `/audit-trail`, `/manajemen-pengguna`, dan `/pengaturan-sistem`. Halaman autentikasi `/login`; halaman pimpinan `/dashboard-pimpinan`; kartu stok `/kartu-stok`. Express melayani SPA untuk halaman langsung/refresh, tetapi URL API yang tidak dikenal membalas JSON 404, bukan HTML.

Sesi aplikasi memakai cookie HTTP-only dan masa berlaku tetap 12 jam; tidak ada refresh token atau perpanjangan diam-diam. Jika endpoint sinkronisasi membalas 401, aplikasi meminta pengguna masuk kembali dan mencoba menggabungkan perubahan lokal yang belum tersimpan dengan state server setelah login. Konflik ditahan untuk pemeriksaan, bukan ditimpa otomatis.

Setelah logout berhasil dikonfirmasi server, aplikasi memuat ulang penuh halaman `/login`. Jika logout gagal, halaman tidak dimuat ulang dan pesan kegagalan tetap ditampilkan.

Setelah perubahan data berhasil disimpan, halaman otomatis reload penuh pada URL yang sama untuk mengambil data terbaru dari server. Reload menunggu antrean penyimpanan, tindakan server, dan pencatatan event notifikasi WhatsApp; pengiriman ke provider berjalan di backend tanpa menahan transaksi atau reload. Respons `202` dengan `queued: true` dari `/api/whatsapp/request-events` berarti event tercatat, bukan pesan sudah terkirim. Kegagalan pengiriman dicatat pada `whatsapp_notification_events` dan log server. Pemanggil yang tidak mengirim `deferDelivery: true` tetap menerima hasil pengiriman langsung.

Pengajuan beserta audit dan notifikasi aplikasi disimpan dalam satu sinkronisasi. Antrean memakai perubahan lokal terbaru dan respons server mengembalikan data permohonan yang sudah dinormalisasi (termasuk identitas pemohon, nomor, dan waktu penyerahan), sehingga penyimpanan berikutnya tidak mengirim ulang versi lama. Pembacaan state dan revisi memakai snapshot transaksi yang sama; konfirmasi menerima revisi yang lebih baru tanpa mengulang mutasi stok. Permintaan sinkronisasi dan tindakan penerimaan memiliki batas waktu 30 detik; jika hasil tidak pasti, aplikasi memeriksa data server sebelum menyatakan berhasil atau meminta percobaan ulang. Perubahan lokal yang belum tersinkron, kegagalan penyimpanan, atau konflik menahan reload. Membuka halaman atau masuk tanpa melakukan perubahan tidak memicu reload berulang. Formulir yang belum dikirim akan tertutup saat reload.

Tes alur permohonan `tests/request-workflow.integration.test.mjs` dapat dijalankan dengan `BMN_REQUEST_INTEGRATION=1`. Tes membuat database dan folder sementara miliknya sendiri, menguji akun Pemohon/Operator/Kasubag dari pengajuan hingga penerimaan bersamaan, lalu menghapus data uji. Default koneksi dibaca dari `.env` dan wajib localhost; `BMN_REQUEST_TEST_DB_PORT` dapat menunjuk instance MySQL lokal terisolasi dengan `BMN_REQUEST_TEST_DB_USER`/`BMN_REQUEST_TEST_DB_PASSWORD`. Provider WhatsApp dinonaktifkan pada tes ini sehingga tidak mengirim pesan nyata.

Hostinger menyebut Node.js web app tersedia untuk paket Business dan Cloud; fitur/limitasi dapat berubah. Verifikasi paket aktif, kemampuan menjalankan proses Express berkelanjutan, port yang disediakan, konektivitas ke MySQL Hostinger, kuota koneksi, penyimpanan file yang persisten, dan opsi backup. Aplikasi membutuhkan disk privat yang tetap tersedia melewati deploy untuk menyimpan dokumen. Lihat [panduan Node.js app Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/) dan [versi Node.js yang didukung](https://www.hostinger.com/support/how-to-select-the-node-js-version-for-your-application/).

### Pengaturan build dan start

- Build command: `npm run build`
- Start command: `npm start`
- Root directory: `./`
- Runtime: Node.js `22.x` (pastikan runtime minor-nya sekurang-kurangnya `22.5`)
- Health check bila diminta: `GET /api/health` (balasan `{"status":"ok"}` jika MySQL tersedia)

Server membaca `PORT` dari environment hosting dan, saat `NODE_ENV=production`, mendengarkan pada `0.0.0.0` secara default. `HOST` dapat diatur jika instruksi paket hosting mensyaratkannya. Development lokal mengikat `127.0.0.1`. Gunakan domain HTTPS; backend melayani frontend hasil build dan API dari origin yang sama sehingga tidak memerlukan CORS lintas-origin atau `.htaccess`.

### Siapkan database dan rahasia sebelum deploy

1. Jangan membuat database produksi kosong atau menunjuk aplikasi ke database produksi sebagai bagian dari runbook ini. Pastikan target staging/prod, host, port, nama database, dan akun koneksi telah diperiksa terpisah.
2. Terapkan ekstensi skema hanya melalui prosedur migrasi manual yang disetujui dan diuji di staging. Jangan mengimpor data contoh. Backup yang tersedia saat ini schema-only, jadi pengujian data nyata tetap belum dapat dilakukan. Akun awal harus berasal dari pengguna operasional aktif dan diprovisikan secara eksplisit; startup tidak membuat akun.
   - Arsip dokumen backend memerlukan migrasi tambahan `migrations/document-host-storage-v1.sql` pada database operasional yang disetujui. Migrasi menambahkan metadata nullable dan indeks unik; server production tidak menjalankan DDL otomatis.
3. Isi environment variables di hPanel/secret manager, bukan di source code:
   - `NODE_ENV=production` dan `DATA_BACKEND=operational`.
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, dan `DB_NAME` dari target database yang disetujui. `DB_CONNECTION_LIMIT` opsional (default `10`, maksimum `100`). Jangan gunakan `ADMIN_NIP`/`ADMIN_PASSWORD` untuk bootstrap production.
   - `CLOUDFLARE_ACCESS_TEAM_DOMAIN` dan `CLOUDFLARE_ACCESS_AUD` dari administrator Cloudflare. Production gagal startup bila keduanya belum diisi.
   - `DOCUMENT_STORAGE_DIR` ke folder dokumen privat yang persisten, writable oleh proses Node.js, dan di luar folder publik/release. Kosongkan hanya untuk memakai `data/documents` di direktori aplikasi. `DOCUMENT_MAX_FILE_SIZE_MB` opsional (default `25`, maksimum `100`). Atur limit request reverse proxy paling sedikit sama besar.
   - `APP_PUBLIC_URL=https://<domain-anda>` agar tautan notifikasi tidak menunjuk ke localhost.
   - Variabel WhatsApp provider yang telah dipilih hanya jika integrasi dikonfigurasi dan diuji. Jangan kirim pesan nyata selama pengujian tanpa persetujuan terpisah; jangan menaruh rahasia pada command build atau variable berawalan `VITE_`.
   - `PORT` biasanya disediakan hosting. Jangan override kecuali petunjuk Hostinger pada aplikasi Anda meminta nilai tertentu. `HOST` biasanya tidak perlu diisi karena production default ke `0.0.0.0`.
4. Pastikan host mendukung proses Node.js persisten, database dapat dijangkau secara privat, backup dapat dipulihkan, dan koneksi cukup. Uji transaksi InnoDB pada staging sebelum deployment.

### Deploy, uji, dan rollback

1. Konfirmasi paket hPanel mendukung Node.js web app persisten dan konektivitas database privat; siapkan backup produksi yang dapat dipulihkan tanpa menimpanya.
2. Sambungkan GitHub `janisoksamjastevanlie-creator/BMN-Minut`, pilih `main`, preset Express, Node `22.x`, dan root `./`. Masukkan environment production pada pengaturan app sebelum start.
3. Setelah seluruh kriteria di [checklist deployment](./DEPLOYMENT-CHECKLIST.md) lulus, lakukan deployment hanya dengan persetujuan cutover terpisah. Uji `GET /api/health`; respons sehat hanya membuktikan reachability proses/database.
4. Verifikasi HTTPS dan Cloudflare Access pada URL final, kemudian uji fitur terlebih dahulu pada staging. Jangan jalankan transaksi uji, ubah data produksi, atau mengaktifkan DNS tanpa persetujuan eksplisit.
5. Daftarkan webhook provider hanya setelah HTTPS, secret webhook, dan kebijakan Access untuk endpoint webhook diuji. Jangan kirim pesan nyata tanpa persetujuan.
6. Untuk rollback, hentikan app, pertahankan backup MySQL terkini, deploy ulang commit stabil sebelumnya melalui hPanel/Git, dan pulihkan backup yang sesuai hanya setelah aplikasi berhenti. Jangan restore backup lama di atas database yang lebih baru tanpa menilai kehilangan transaksi.

Deployment/cutover online belum dilakukan atau diverifikasi oleh panduan ini. Verifikasi akses MySQL, koneksi/kuota, port reverse proxy, secret manager, dan opsi backup pada paket Hostinger aktual terlebih dahulu.

### Menggunakan Groq untuk chatbot WhatsApp

Atur `WHATSAPP_AI_PROVIDER=groq`, `GROQ_API_KEY`, `GROQ_MODEL`, dan `WHATSAPP_AI_ENABLED=true` pada `.env` lokal atau secret manager hosting. Gunakan API key dari Groq Console dan pastikan `GROQ_MODEL` masih tersedia pada akun Groq tersebut. Jangan menaruh API key pada frontend, Git, atau chat.

Groq hanya menerima teks pertanyaan masuk (maksimal 500 karakter) untuk mengubahnya menjadi intent dan filter yang dibatasi allowlist. Groq tidak menerima isi koleksi/database BMN. Backend memuat ulang koleksi dari database yang dikonfigurasi sebelum memproses webhook, lalu mencari dan memformat jawaban melalui tool aplikasi yang memeriksa izin pengguna. Karena itu data jawaban mengikuti backend MySQL yang benar-benar dikonfigurasi; mode development `legacy` bukan database operasional. Tinjau kebijakan privasi Groq untuk pemrosesan teks pertanyaan sebelum mengaktifkan chatbot bagi pengguna nyata.

Jika `WHATSAPP_AI_PROVIDER` tidak diisi, konfigurasi otomatis memilih Groq saat `GROQ_API_KEY` tersedia; selain itu tetap memakai Gemini untuk kompatibilitas lama. API key yang belum dikonfigurasi membuat status AI nonaktif dan tidak memicu panggilan eksternal.

### Catatan audit yang perlu ditangani

- Dependency `xlsx` diperbarui ke SheetJS Community Edition 0.20.3 dari CDN resmi SheetJS karena versi yang berisi perbaikan advisory belum tersedia di npm. Ini mempertahankan dukungan impor `.xlsx`, `.xls`, CSV, dan TSV serta ekspor template. Proses instalasi dependency saat deploy harus dapat mengakses `cdn.sheetjs.com`. Pertahankan URL dependency terkunci di `package.json`/`package-lock.json`; jangan menggantinya dengan paket `xlsx` dari npm yang versinya rentan. Verifikasi ulang `npm audit --omit=dev` saat update dependency berikutnya.
- Upload dokumen/gambar saat ini dikodekan sebagai Data URL, disimpan di state aplikasi pada MySQL, lalu seluruh state dikirim sebagai JSON ke `/api/state`; batas parser backend adalah 25 MB total request. Encoding Base64 memperbesar ukuran file, sehingga batas 25 MB yang ditampilkan UI tidak menjamin file sebesar itu dapat tersinkron. Uji pada staging; jangan memperbesar batas request tanpa validasi ukuran dan pengujian pemakaian memori.
- Build produksi berhasil saat audit, tetapi bundle JavaScript melebihi 500 kB setelah minifikasi. Ini peringatan performa, bukan kegagalan build.

## Akses jarak jauh dengan Tailscale

1. Install Tailscale di laptop server dan perangkat pengguna; hubungkan perangkat ke tailnet yang sama dan hanya izinkan anggota yang berwenang.
2. Pastikan aplikasi berjalan dengan `npm run dev`.
3. Jalankan `tailscale serve --bg localhost:3000` di laptop server. Buka URL HTTPS tailnet yang ditampilkan Tailscale dari perangkat lain yang terhubung.
4. Jika Vite menolak nama host tailnet, masukkan nama host tersebut ke `TUNNEL_HOST` di `.env`, lalu mulai ulang server.

Server hanya mendengarkan di `127.0.0.1`; jangan meneruskan port 3000 atau MySQL langsung ke internet. Perangkat pengguna harus tersambung ke Tailscale agar dapat membuka aplikasi.

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

Panduan konfigurasi per item, bukti deployment, pengujian, keterbatasan, dan rollback tersedia di [Setup Fonnte dan Hostinger](./FONNTE-SETUP.md). Jangan menganggap status deployment/health sebagai bukti chatbot WhatsApp sudah berhasil.

### Akses chatbot web dan data operasional

Tombol mengambang **AI Chatbot** tersedia setelah login. Chat web memakai `/api/ai/chat` dan provider AI backend yang sudah ada, bukan widget Fonnte. Pilihan WhatsApp membaca `/api/whatsapp/me`; tautan `wa.me` hanya ditampilkan untuk provider Fonnte yang lengkap, nomor internasional valid, dan `WHATSAPP_BOT_VERIFIED=true`. Flag tersebut merupakan konfirmasi administrator setelah nomor dicocokkan dengan perangkat Fonnte yang terhubung, bukan pemeriksaan koneksi otomatis. Jangan mengaktifkannya sebelum verifikasi perangkat. Tidak ada pesan yang dikirim ketika tombol dibuka.

Pertanyaan `status permohonan saya nomor REQ-01` dibatasi ID pemilik dari `whatsapp_request_owners`. Pertanyaan petugas tentang permohonan memakai izin `approveRequests` atau `manageInventory` yang sudah ada; tanpa izin petugas, pencarian tetap dibatasi permohonan sendiri. Data lama yang tidak memiliki pemetaan pemilik tidak ditampilkan kepada pemohon dan tidak dipetakan otomatis berdasarkan nama. Fungsi baca menampilkan nomor, tanggal, status saat ini, rincian jumlah diajukan/disetujui, dan catatan yang tersedia. Riwayat perubahan status atau waktu persetujuan tidak disimpulkan dari status saat ini.

Pertanyaan `riwayat transaksi barang keluar nomor BK-01` hanya tersedia bagi akun dengan `manageInventory` atau `viewReports`. Status transaksi yang tidak tersimpan dijawab sebagai tidak tercatat. Hasil dibatasi lima rincian; jumlah dokumen unik dan jumlah rincian barang ditampilkan terpisah. Filter periode permohonan/transaksi mendukung tanggal `YYYY-MM-DD`, rentang dua tanggal inklusif, atau satu bulan Indonesia beserta tahun (contoh `Oktober 2026`). Periode relatif/ambigu, pengecualian status, dan riwayat permohonan dibatalkan dijawab sebagai belum didukung, bukan diabaikan. AI WhatsApp hanya mengklasifikasikan intent/filter; data tidak dikirim ke model. Chat web mengirim konteks tersaring ke model backend, sehingga kebijakan privasi provider tetap perlu ditinjau. Ketika sesi berakhir atau AI belum tersedia, modal web menampilkan kesalahan, bukan jawaban cadangan dari data browser.

Pemeliharaan/perawatan memakai `manageMaintenance` dan fungsi baca tiket, dengan filter nomor, NUP, nama aset, atau status yang benar-benar tersedia. Pertanyaan lanjutan WhatsApp seperti `yang ditolak?`, `nomor REQ-01`, atau `Kalau tinta printer?` setelah pertanyaan stok memakai intent/filter pencarian sebelumnya dari tabel sesi yang sudah ada (TTL 10 menit), terikat user ID dan diperiksa ulang terhadap permission/data terbaru. Konteks tidak menyimpan record bisnis dan tidak diwariskan bila akun berganti. Chat web memakai riwayat pengguna yang dibatasi, bukan klaim identitas/izin pada riwayat assistant, untuk mengambil ulang data terbaru. Tidak ada migrasi atau layanan AI baru untuk fitur ini.

Jumlah aset dapat difilter kategori/lokasi atau dikelompokkan berdasarkan kategori/lokasi; hitungan memakai catatan aset aktif, bukan penjumlahan kolom kuantitas. Nama pengguna aktif hanya tersedia dengan `manageUsers`, maksimal lima hasil, dan hanya memuat nama, role, serta unit kerja tanpa NIP/email/nomor/kredensial. Nomor belum tertaut dapat menerima prosedur dan bantuan publik, bukan data internal. Pesan grup Fonnte diabaikan untuk mencegah jawaban akun pribadi masuk ke grup; notifikasi transaksi tetap memakai penerima lama. Log percakapan baru mencatat metadata tanpa isi pesan/jawaban; log lama tidak dihapus.

Integrasi menggunakan koneksi backend aplikasi yang sudah aktif. Perubahan chatbot ini tidak membuat database, menjalankan migrasi, atau mengubah data bisnis. Proses WhatsApp yang sudah ada tetap menulis log/deduplikasi/sesi dan memangkas catatan teknis lama sesuai retensi; jangan menjalankan server terhadap produksi sebagai tes baca saja.

Sebelum deployment, periksa mode database dan skema yang benar-benar aktif di Hostinger secara read-only, tanpa menyalin rahasia. Jangan mengganti `DATA_BACKEND` atau koneksi database demi chatbot. Di Fonnte, webhook pesan masuk harus menuju `https://<domain-aktif>/api/whatsapp/webhook`, Auto Read aktif, dan secret webhook cocok dengan environment backend. Webhook menggantikan autoreply; jangan mengubah Flow aktif tanpa mengevaluasi dampaknya. Uji dengan nomor yang diizinkan: pemohon sendiri/lain, petugas, stok aktual, pesan duplikat, secret salah, batas frekuensi, dan pengiriman jawaban. Respons API `status: true` belum membuktikan pesan sampai; verifikasi penerimaan pada perangkat uji. Build lokal tidak berarti perubahan sudah terpasang di Hostinger.

Integrasi chatbot Fonnte memakai webhook masuk Fonnte dan API send untuk membalas; Fonnte berfungsi sebagai transport WhatsApp, bukan AI yang otomatis membaca database BMN-Minut. Saat webhook dipakai, fitur autoreply Fonnte tidak berjalan. Backend BMN-Minut mengklasifikasikan pertanyaan melalui provider AI eksternal yang dipilih oleh `WHATSAPP_AI_PROVIDER` (`groq` atau `gemini`); konfigurasi tanpa API key AI tetap dapat menjalankan transport/notifikasi WhatsApp, tetapi tidak mengaktifkan klasifikasi AI.

1. Jika token pernah dibagikan atau dipublikasikan, cabut dan buat token baru di dashboard Fonnte. Jangan salin token ke source code, browser, tiket, atau log.
2. Atur `WHATSAPP_PROVIDER="fonnte"`, `FONNTE_TOKEN`, dan `FONNTE_WEBHOOK_SECRET` di `.env` atau secret manager server. Buat secret webhook acak dengan panjang minimal 32 karakter dan masukkan nilai yang sama pada pengaturan secret webhook Fonnte. Endpoint API dibatasi ke `https://api.fonnte.com/send`.
3. URL penerima adalah `https://<domain>/api/whatsapp/webhook` dengan metode POST. Ilustrasi resmi pembaruan Fonnte 6 Februari 2025 menampilkan `Secret key` pada node Webhook di Flow; kolom itu tidak terlihat pada Device -> Edit akun yang diaudit. Sebelum mengaktifkan jalur tersebut, pastikan pengaturan akun benar-benar mengirim secret yang sama dengan `FONNTE_WEBHOOK_SECRET` pada field JSON `secret`. Jangan menganggap webhook global Device -> Edit otomatis menyertakan secret atau memakai dugaan header/query URL. Jangan aktifkan jalur Flow dan webhook global sekaligus. Payload harus memuat `sender` serta `message` atau `text`; `timestamp` dan `inboxid` digunakan bila tersedia. Jika `inboxid` tidak tersedia, aplikasi membuat kunci idempotensi dari pengirim, waktu penerimaan, dan konten pesan.
4. Mulai ulang server. Akun WhatsApp pengguna ditautkan melalui menu akun WhatsApp di aplikasi; chatbot hanya menggunakan akun tertaut dan izin baca yang sudah diterapkan aplikasi. Isi `WHATSAPP_BOT_NUMBER` dengan nomor perangkat Fonnte untuk perlindungan loop tambahan. Atur `WHATSAPP_RATE_LIMIT_MAX` dan `WHATSAPP_RATE_LIMIT_WINDOW_SECONDS` bila batas default 15 pesan per 60 detik perlu disesuaikan.
5. Notifikasi permohonan memilih penerima secara independen. Pengajuan ditujukan kepada Administrator, Pengelola BMN, dan Operator; verifikasi kepada pemohon terkait serta tiga role tersebut; persetujuan hanya kepada akun WhatsApp tertaut milik pemohon; penolakan, persiapan, dan penerimaan mengikuti role/izin terkait. Nomor tidak valid atau kegagalan satu penerima tidak menghentikan penerima valid lainnya.
6. API Fonnte menggunakan form-data dan header `Authorization` tanpa awalan `Bearer`. Respons `status: true` berarti provider menerima/memproses permintaan, bukan bukti pesan telah sampai ke perangkat. Status pengiriman akhir Fonnte tidak dipantau oleh aplikasi saat ini.
7. Pengiriman gagal dicatat dengan nomor tersamarkan dan tidak dicoba ulang otomatis. API send Fonnte yang digunakan di sini tidak menjanjikan kunci idempotensi; retry otomatis setelah timeout berisiko mengirim pesan ganda. Pengiriman ulang manual/dashboard admin belum tersedia.

Dalam development, server mendengarkan hanya di `127.0.0.1`; di production, server memakai `0.0.0.0` secara default untuk reverse proxy hosting. Tailscale memberi akses kepada perangkat di tailnet, tetapi tidak membuat webhook dapat diakses Fonnte. Untuk chatbot/webhook online, deploy backend dan MySQL pada host yang sesuai, sediakan domain HTTPS publik, secret manager, backup database, serta uji di staging. Deployment publik belum dilakukan atau diverifikasi oleh perubahan ini; jangan membuka port MySQL atau server development langsung ke internet.

Dokumentasi yang diverifikasi:
- [Fonnte Send API](https://docs.fonnte.com/api-send-message/)
- [Fonnte webhook reply](https://docs.fonnte.com/webhook-reply-message/)
- [Fonnte Node.js webhook example](https://docs.fonnte.com/webhook-reply-message-with-nodejs/)
- [Fonnte webhook secret update](https://docs.fonnte.com/update-6-february-2025/)

### Integrasi event keluar ke n8n

Integrasi n8n opsional mengirim event permohonan minimal melalui HTTPS setelah perubahan tersimpan. Integrasi nonaktif secara default dan tidak mengubah autentikasi, role, database, atau notifikasi WhatsApp. Lihat [panduan impor workflow, konfigurasi backend, pengujian staging, dan rollback n8n](./automation/n8n/README.md).
