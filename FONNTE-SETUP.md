# Setup Fonnte dan chatbot BMN-Minut di Hostinger

## 1. Bukti pemeriksaan dan batasnya

Pemeriksaan 12 Oktober 2026:

- Source memakai React/Vite, Express (`server.mjs`), dan `mysql2`. Build proyek: `npm run build`; start: `npm start`. Kedua perintah ini berasal dari source, bukan bukti nilai build/start yang sedang tersimpan di hPanel.
- hPanel untuk `bmnbpsminut.online` menampilkan Express, Node 22.x, root `./`, GitHub BMN-Minut, branch `main`, deployment commit `049f1568` pada 21:13, status Selesai.
- `GET https://bmnbpsminut.online/api/health` mengembalikan `{"status":"ok"}`.
- GET webhook mengembalikan 403, bukan endpoint balasan GET. GET `/api/whatsapp/me` tanpa sesi mengembalikan 401.
- Ini belum membuktikan mode database, database tujuan, kecocokan skema, perangkat Fonnte terhubung, secret cocok, atau pesan sampai.
- Nilai environment, kredensial database, token, dan API key tidak dibuka. Koneksi database produksi belum diverifikasi langsung.
- Screenshot Setting AI hanya membuktikan adanya formulir AI; bukan bukti Flow/webhook aktif.

Pemeriksaan langsung dashboard Fonnte setelah login, 12 Oktober 2026 sekitar 22:13 WITA:

- Satu perangkat BMN BPS MINUT berstatus `connect`, paket Regular, kedaluwarsa 11 November 2026. Dashboard menampilkan kuota AI 510 dan jumlah AI Data 4; isi AI Data tidak dibuka.
- Device -> Edit: Webhook pesan masuk, Connect, Message Status, dan Chaining semuanya kosong. Auto Read dan Inbox aktif; Response Source adalah Autoreply.
- Setting AI menampilkan nama BMN BPS Minut Chatbot, bahasa Indonesia, dan Data only No. Halaman mengalami error JavaScript saat memuat checkbox style, sehingga status style tersimpan belum dapat dipastikan.
- Flow menampilkan node Start dan Global saja, tanpa alur balasan yang terlihat. Editor menyediakan AI, API, Webhook, dan HTTP; ketersediaan node tidak membuktikan adanya koneksi backend atau pembatasan role.
- Webhook Log tidak memiliki baris kejadian; pesan generik keberhasilan bukan bukti webhook aplikasi pernah dipanggil.
- Tidak ada konfigurasi disimpan, pesan dikirim, atau tombol resend ditekan. Token tidak digunakan atau disalin ke dokumentasi. Secret Fonnte dan kesesuaiannya dengan backend belum diverifikasi.

Pemeriksaan lanjutan sekitar 22:29 WITA:

- Health produksi kembali HTTP 200 (`status: ok`), GET webhook 403, dan `/api/whatsapp/me` tanpa login 401. Ini bukan uji pesan masuk/keluar atau verifikasi database tujuan.
- hPanel masih menampilkan deployment selesai untuk `049f1568` dan deploy otomatis aktif. Perubahan lokal berikutnya belum dipush/deploy.
- Ilustrasi resmi `Screenshot_573.png` pada dokumentasi pembaruan 6 Februari 2025 menampilkan kolom Url dan Secret key pada node Webhook di Flow. Ini memperbaiki dugaan sebelumnya tentang lokasi secret di Device -> Edit. Kontrak field JSON/header yang dikirim akun aktual tetap belum terverifikasi; jangan mengubah validasi backend berdasarkan dugaan.

Jangan mengganti database aktif, menyalin `.env.example` ke produksi, atau menghubungkan database baru melalui tombol "Hubungkan" di hPanel. Jangan menjalankan migrasi, startup legacy, seed, impor data, atau restore database untuk menyiapkan chatbot.

## 2. Metode integrasi

WhatsApp -> Fonnte -> POST webhook aplikasi -> validasi secret/payload -> akun WhatsApp tertaut -> profil dan permission terbaru -> intent/filter tervalidasi -> fungsi baca backend -> format jawaban -> API send Fonnte.

AI WhatsApp hanya mengklasifikasikan maksud dan filter. Jawaban data disusun secara deterministik oleh backend, bukan oleh model yang diberi akses SQL atau seluruh database. Data aktual dimuat ulang melalui koneksi aplikasi sebelum pesan diproses. Chat web memakai `/api/ai/chat`; konteks terbatas yang sudah disaring dikirim ke provider AI. Tinjau kebijakan data provider sebelum menggunakannya.

AI native Fonnte memakai Flow, kuota AI, dan AI Data. Tidak ada bukti bahwa AI native tersebut membaca database BMN-Minut atau memeriksa role aplikasi. Dokumentasi menyatakan autoreply tidak berjalan bila webhook digunakan. Jangan menganggap Flow AI native dan webhook backend bekerja bersamaan. Evaluasi perubahan sumber balasan terlebih dahulu; notifikasi keluar tetap memakai API send yang sudah ada.

Tidak ada widget web native Fonnte yang terverifikasi dalam pemeriksaan ini. Tombol AI Chatbot di aplikasi menawarkan chat backend atau tautan WhatsApp yang hanya aktif setelah nomor bot dikonfirmasi.

## 3. Lokasi memasukkan konfigurasi

**H**: hPanel -> website `bmnbpsminut.online` -> menu aplikasi -> **Variabel environment**. Nama menu ini terlihat dalam navigasi hPanel. Isi langsung di panel; jangan kirim nilai rahasia ke percakapan atau menekan tombol untuk memperlihatkannya saat halaman dibagikan.

**F**: dashboard Fonnte -> **Device -> Edit** untuk Auto Read dan webhook global perangkat. Ilustrasi resmi menempatkan **Secret key pada node Webhook di Flow**, bukan pada formulir Edit yang diaudit. Pengaturan rahasia dilakukan operator tanpa membagikan nilainya. Jangan memakai Account Token sebagai pengganti token perangkat pengiriman.

**AI**: console provider Groq atau Gemini yang sudah digunakan aplikasi. Pilih satu provider yang valid; jangan membuat akun/key berbayar baru tanpa meninjau kebutuhan, biaya, kuota, dan privasi.

Semua contoh nomor/dokumen di panduan ini bersifat ilustratif, bukan nomor bot atau data produksi.

## 4. A - Data dari Fonnte

| Pengaturan | Fungsi dan sumber | Format tanpa rahasia | Tempat isi | Wajib | Uji |
|---|---|---|---|---|---|
| Status perangkat dan nomor bot | Device; cocokkan nomor yang benar-benar terhubung. Jangan buka QR | Nomor internasional `62...`, tanpa `+`/spasi | H: `WHATSAPP_BOT_NUMBER` | Wajib sebelum link WhatsApp diaktifkan; dianjurkan untuk anti-loop | Operator memastikan perangkat terhubung dan nomor cocok |
| Token perangkat | Token untuk API send; ambil sendiri dari perangkat yang dipakai. Label kontrol perlu dicek di akun | String rahasia; contoh nilai sengaja tidak diberikan | H: `FONNTE_TOKEN` | Ya untuk balasan/notifikasi | Satu pesan ke nomor uji yang diizinkan; periksa diterima di perangkat |
| Webhook URL | URL penerima pesan; pilih satu jalur Fonnte yang mendukung autentikasi | `https://bmnbpsminut.online/api/whatsapp/webhook` | F, bukan frontend | Ya untuk chatbot WhatsApp | Pesan dari nomor uji memicu POST; GET 403 tidak memverifikasi kemampuan menerima POST |
| Auto Read | F; syarat webhook menurut dokumentasi | On | F | Ya | Pesan masuk muncul pada status webhook aplikasi |
| Secret key webhook | Ilustrasi resmi pembaruan 6 Februari 2025: node Webhook di Flow | Secret acak minimal 32 karakter; jangan pakai token sebagai secret | Node Flow dan H: `FONNTE_WEBHOOK_SECRET`, nilai identik; verifikasi dukungan akun dahulu | Ya untuk receiver aplikasi ini | Payload Fonnte harus cocok dengan field JSON `secret` yang diperiksa kode; bila format akun berbeda, hentikan dan verifikasi metadata payload tanpa isi rahasia. Jangan menonaktifkan validasi |
| Inbox | Fitur resmi opsional untuk `inboxid` | On bila tersedia | F | Opsional, dianjurkan | Pesan masuk memiliki ID stabil; duplikat diproses satu kali |
| Flow / autoreply / AI Data / kuota | Inventaris fitur native Fonnte, bukan koneksi database | Catat status saja, bukan data rahasia | F; jangan upload data pengguna/transaksi | Tidak dibutuhkan oleh klasifikasi AI backend | Pastikan tidak ada dua jalur balasan yang bertentangan |

## 5. B - Environment Hostinger

| Variabel | Fungsi / sumber | Format aman | Wajib atau opsional | Uji |
|---|---|---|---|---|
| `WHATSAPP_PROVIDER` | Pilih transport; H, pertahankan provider yang sudah valid | `fonnte` | Wajib untuk jalur ini; jangan mengganti provider notifikasi tanpa verifikasi | `/api/whatsapp/me` dengan sesi mengembalikan provider fonnte |
| `FONNTE_TOKEN` | Token perangkat dari F | Rahasia, isi langsung | Wajib | Pengiriman nyata ke nomor uji |
| `FONNTE_WEBHOOK_SECRET` | Cocok dengan F | Rahasia >=32 karakter | Wajib | Secret salah ditolak; pesan Fonnte sah diterima |
| `FONNTE_API_URL` | Endpoint resmi send | `https://api.fonnte.com/send` | Opsional; default sama | Tidak perlu mengganti URL valid |
| `WHATSAPP_BOT_NUMBER` | Nomor dari F, bukan nomor pribadi pemohon | `62...` | Untuk link dan anti-loop | Cocok dengan perangkat |
| `WHATSAPP_BOT_VERIFIED` | Konfirmasi operator atas nomor bot, bukan health check otomatis | `false`; `true` setelah cocok | Opsional, wajib true untuk link web | Link baru muncul setelah semua syarat lengkap |
| `APP_PUBLIC_URL` | Origin tautan aplikasi | `https://bmnbpsminut.online` | Diperlukan untuk tautan produksi benar | Tautan jawaban tidak menunjuk localhost |
| `WHATSAPP_RATE_LIMIT_MAX` | Batas pesan per pengirim per proses | `15` | Opsional, default 15 | Pesan ke-16 dalam satu jendela dibatasi pada tes mock |
| `WHATSAPP_RATE_LIMIT_WINDOW_SECONDS` | Jendela pembatasan | `60` | Opsional, default 60 | Batas reset setelah jendela |
| `WHATSAPP_REMINDERS_ENABLED`, `WHATSAPP_REMINDER_HOUR` | Pengingat yang sudah ada | `true` / `false`; jam `8` | Opsional; pertahankan nilai lama | Jangan mengubahnya sebagai bagian setup chatbot |

`WHATSAPP_WEBHOOK_URL` dipakai untuk validasi URL Twilio, bukan pengganti URL yang didaftarkan di Fonnte. `WHATSAPP_RECIPIENT_NUMBER` bukan sandbox universal untuk Fonnte; jangan menganggap variabel tersebut mengalihkan semua pesan Fonnte ke satu nomor uji.

## 6. C - Konfigurasi AI backend

Masukkan seluruh nilai berikut di **H**, mengambil key/model dari **AI**:

| Variabel | Fungsi / contoh nonrahasia | Wajib | Uji |
|---|---|---|---|
| `WHATSAPP_AI_PROVIDER` | `groq` atau `gemini`; pakai provider yang sudah tersedia | Untuk AI teks bebas | Status AI configured pada halaman pengaturan aplikasi |
| `WHATSAPP_AI_ENABLED` | `true` untuk klasifikasi; `false` tetap memungkinkan perintah deterministik | Opsional, default aktif | Perintah tetap bekerja tanpa AI; teks bebas memakai provider saat aktif |
| `GROQ_API_KEY` | Key rahasia console Groq | Hanya jika provider groq | Pertanyaan bebas berhasil tanpa error provider |
| `GROQ_MODEL` | ID model yang masih tersedia pada akun; default kode `llama-3.3-70b-versatile` bukan jaminan ketersediaan | Opsional, verifikasi model | Tidak ada penolakan model/kuota |
| `GEMINI_API_KEY` | Key rahasia console Gemini | Hanya jika provider gemini | Pertanyaan bebas berhasil |
| `WHATSAPP_AI_MODEL` | ID model Gemini; default kode `gemini-2.5-flash`, verifikasi akun | Opsional | Tidak ada penolakan model/kuota |

Tanpa pilihan eksplisit, kode memilih Groq jika key Groq tersedia; selain itu Gemini. Pilihan eksplisit menghindari ketidakjelasan. Jangan masukkan key pada variabel `VITE_*`. Kuota Fonnte AI native berbeda dari kuota/biaya Groq atau Gemini. Integrasi ini tidak membuat layanan/key baru atau mengaktifkan paket berbayar.

## 7. D - Database dan runtime yang harus dikonfirmasi

Operator hosting harus memeriksa langsung, tanpa membagikan nilainya:

| Pengaturan | Fungsi / lokasi | Format aman | Wajib | Uji |
|---|---|---|---|---|
| `DATA_BACKEND` | H; adapter data aplikasi | `operational` atau `legacy` sesuai deployment nyata; jangan ubah hanya untuk chatbot | Ya | Cocok dengan versi aplikasi dan skema aktif |
| `DB_HOST`, `DB_PORT`, `DB_NAME` | H; database tujuan yang sudah digunakan | Host privat, port numerik, nama database aktif; tidak perlu dibagikan | Ya | Operator menjalankan `SELECT DATABASE()` dan pemeriksaan skema secara read-only pada koneksi yang sama |
| `DB_USER`, `DB_PASSWORD` | H; akun koneksi aplikasi | Rahasia; pertahankan nilai valid | Ya sesuai runtime | Koneksi app sehat; jangan buka port database |
| `DB_CONNECTION_LIMIT` | H; pool koneksi | `10` default | Opsional | Tidak ada error pool |
| `NODE_ENV`, `PORT`, `HOST` | H; proses/reverse proxy | `production`; PORT dari hosting; HOST sesuai deployment | Sesuai runtime | Health HTTPS dan proses persisten |
| `ACCESS_REQUIRED`, `CLOUDFLARE_ACCESS_TEAM_DOMAIN`, `CLOUDFLARE_ACCESS_AUD` | H; kebijakan akses aplikasi yang sudah ada | Pertahankan konfigurasi aktual | Sesuai kebijakan yang sedang berlaku | Login tetap bekerja; jangan membuka seluruh aplikasi demi webhook |

Kedua mode lokal memakai MySQL/MariaDB, bukan SQLite. `operational` membaca tabel relasional; `legacy` membaca `app_data` dan dapat melakukan startup DDL/seed. Jangan memindahkan produksi ke mode legacy atau menyalakan server lokal menggunakan kredensial produksi untuk audit.

Tabel bisnis yang dipetakan source meliputi `users`, `roles`, `inventory_requests`, `inventory_request_items`, `inventory_items`, `stock_in`, `stock_in_items`, `stock_out`, `stock_out_items`, `bmn_assets`, `asset_maintenance`, `asset_movements`. Identitas/sesi: `auth_users`, `sessions`; tautan dan kepemilikan: `whatsapp_accounts`, `whatsapp_request_owners`.

Pastikan tabel teknis WhatsApp yang sudah dibutuhkan aplikasi tersedia. Jangan membuatnya otomatis pada produksi. Bila tidak cocok, hentikan dan evaluasi kebutuhan terpisah. Permohonan lama tanpa mapping pemilik tidak akan ditampilkan kepada pemohon; tidak ada backfill otomatis berbasis nama.

## 8. E/F - Webhook, HTTPS, dan deployment

1. Catat commit deployment, konfigurasi nonrahasia, provider lama, dan webhook lama. Simpan cadangan secara privat; jangan menaruh secret di Git.
2. Pastikan HTTPS aktif. Jangan menonaktifkan autentikasi aplikasi. Jika ada lapisan Access/WAF, jalur webhook spesifik harus dapat dicapai Fonnte dan tetap dilindungi secret; kebijakan akun lain tidak berubah.
3. Tambahkan hanya environment yang kurang di H. Jangan mengganti seluruh `.env` atau menghubungkan database baru.
4. Auto Read harus aktif. Untuk jalur bersertakan secret, ilustrasi resmi menunjukkan Flow Start -> node Webhook dengan Url dan Secret key. Verifikasi bahwa akun mengirim JSON `secret` yang diperlukan backend sebelum menyimpan/mengaktifkan jalur tersebut. Bila jalur Flow dipilih, evaluasi perubahan Response Source ke Flow dan jangan mengaktifkan webhook global sekaligus. Jangan gunakan query URL atau dugaan header untuk secret; jangan melonggarkan validasi. Pemilihan Flow tidak memerlukan node AI native karena klasifikasi tetap dilakukan backend.
5. API send memakai POST form-data `target`/`message`, Authorization token tanpa awalan Bearer. Kode memakai timeout 15 detik. Tidak ada retry otomatis setelah timeout, untuk menghindari pesan ganda.
6. Build proyek `npm run build`, start `npm start`; cocokkan dengan pengaturan deployment aktual sebelum mengubah perintah hPanel. Gunakan alur GitHub/deployment yang sudah ada.
7. Deployment terakhir yang terlihat hanya membuktikan commit `049f1568` terpasang. Perubahan lokal lanjutan tidak otomatis terdeploy.
8. Setelah restart/redeploy yang disetujui, periksa health, login, status integrasi, dan tes nomor khusus. Jangan menekan restart untuk sekadar pemeriksaan.

## 9. Pengujian bertahap dan kriteria lulus

Validasi lokal setelah penambahan pemeliharaan/konteks sebelumnya: 64 tes terarah lulus. Batch lanjutan: 73 tes terarah lulus, mencakup pergantian barang pada follow-up, data terbaru, periode kalender, hitungan dokumen/rincian terpisah, kategori/lokasi, direktori pengguna terbatas, bantuan publik, dan pengabaian grup. `npm run lint` dan `npm run build` berhasil; build masih memberi peringatan ukuran bundle. Pengujian kegagalan provider/database menggunakan tiruan, bukan gangguan produksi. Pengiriman dan penerimaan WhatsApp nyata serta verifikasi database produksi belum diuji; pemeriksaan akun Fonnte hanya membuktikan konfigurasi yang terlihat, bukan keberhasilan integrasi.

Perintah tes terarah:

```powershell
node --test .\tests\fonnte.test.mjs .\tests\whatsapp-ai.test.mjs .\tests\web-chat.test.mjs .\tests\request-access.test.mjs .\tests\request-stock-validation.test.mjs
```

File batch lokal: `whatsapp/tools.mjs`, `whatsapp/chatbot.mjs`, `whatsapp/ai.mjs`, `whatsapp/formatter.mjs`, `whatsapp/fonnte.mjs`, `whatsapp/service.mjs`, `ai/webchat.mjs`, tiga berkas tes chatbot, `README.md`, dan panduan baru ini. Tidak ada perubahan UI, entry point, koneksi/skema database, middleware login, definisi role, atau alur notifikasi transaksi pada batch ini.

Ringkasan commit yang disarankan: `feat: complete permission-scoped chatbot queries and follow-up context`. Sebelum push, tinjau hanya berkas integrasi tersebut; jangan sertakan berkas audit/PDF yang tidak terkait. Push ke branch yang dipakai hPanel dapat memicu deploy otomatis dan restart aplikasi. Sesudah deploy, verifikasi commit aktif, health, login, dan pesan uji; jangan menganggap build lokal sebagai deployment.

Tes lokal menggunakan database/provider tiruan. Tes berikut di produksi hanya dilakukan dengan akun/nomor uji yang diizinkan dan data bisnis yang sudah ada:

| Kasus | Hasil yang diharapkan |
|---|---|
| Nomor belum tertaut | Tidak menerima data aplikasi; mendapat cara menautkan/prosedur publik |
| Nomor tertaut | Identitas berasal dari mapping dan akun aktif, bukan klaim role dalam pesan |
| `status permohonan saya nomor <nomor aktual>` | Hanya dokumen milik pengguna |
| Nomor permohonan milik pengguna lain | Tidak ada data bagi pemohon biasa |
| Petugas berwenang | Cakupan sesuai permission yang sudah ada |
| `brp stok brg kertas a4 dong` | Stok dari data terbaru, atau tidak ditemukan |
| `pemeliharaan nomor <nomor aktual>` | Izin manageMaintenance; hanya kolom tiket yang diizinkan |
| `yang ditolak?` setelah permohonan | Filter lanjutan pada pengguna yang sama, izin diperiksa ulang |
| `Kalau tinta printer?` setelah stok kertas A4 | Ganti nama barang, baca ulang stok; tidak membawa jawaban lama |
| `transaksi barang masuk bulan Oktober 2026` | Hanya periode tersebut; dokumen unik dan rincian dihitung terpisah |
| Periode invalid/relatif atau permohonan dibatalkan | Keterbatasan eksplisit, bukan hasil seluruh periode atau riwayat buatan |
| `jumlah aset berdasarkan kategori` / `per lokasi` | Kelompok catatan aset aktif, maksimal lima kelompok ditampilkan |
| `siapa Administrator?` | Hanya manageUsers; nama/role/unit, tidak memuat kontak atau kredensial |
| Pesan grup | Diakui HTTP 200 tetapi tidak diproses/ditautkan/dibalas oleh chatbot pribadi |
| Pengguna berganti/nonaktif/izin dicabut | Konteks lama tidak membuka data; izin tetap diperiksa |
| Duplikat inboxid | Satu pemrosesan/balasan pada tes mock; konfirmasi payload nyata |
| Secret salah | 401; jangan mencoba memakai token produksi sebagai bahan tes |
| Provider/AI/database gagal | Pesan kesalahan aman, bukan angka/klaim sukses palsu |
| Jawaban panjang | Kanal Fonnte dibatasi 4000 karakter |
| Notifikasi lama | Uji regresi mock; amati transaksi operasional berikutnya yang memang sah, jangan membuat transaksi palsu |

Log runtime tersedia sebagai kontrol pada dashboard hPanel. Baca hanya status/error yang relevan; jangan membagikan isi mentah yang memuat nomor, pesan, secret, atau data pribadi. `status: true` dari API send berarti diterima provider, bukan bukti delivered; cek WhatsApp perangkat uji.

## 10. Risiko dan rollback

- Fonnte adalah layanan unofficial; dokumentasi menyatakan risiko banned dan tidak ada SLA fixed. Pertimbangkan kebijakan instansi.
- Rate limit berada di memori per proses dan reset saat restart; deployment banyak instance perlu evaluasi terpisah.
- Tanpa inboxid/timestamp, deduplikasi fallback berbasis bucket waktu tidak menjamin deteksi retry lintas bucket.
- Receiver mengirim HTTP 200 sebelum pemrosesan selesai. Tidak ada antrean durable/retry otomatis; kegagalan setelah acknowledgment perlu diperiksa operator, bukan diputar ulang tanpa analisis.
- Konteks lanjutan menyimpan hanya user ID, intent, dan filter pada tabel sesi yang sudah ada, TTL 10 menit. Tidak menyimpan salinan jawaban/record bisnis untuk konteks.
- Log percakapan baru menyimpan metadata tanpa isi pesan atau jawaban. Log lama tidak dibersihkan oleh perubahan ini; retensi lama tetap berlaku. Inbox Fonnte yang saat ini aktif tetap dapat menyimpan isi pesan di provider, dan tidak diubah selama audit.
- Nama petugas pemroses permohonan dan riwayat pembatalan tidak tersedia pada koleksi baca yang digunakan. Jangan menyimpulkan keduanya dari role atau catatan notifikasi. Filter periode pemeliharaan, periode relatif, rentang beberapa bulan dalam bahasa bebas, dan beberapa status sekaligus belum didukung.
- Proses WhatsApp menulis catatan teknis, deduplikasi, dan sesi; startup/retensi memangkas log teknis lama. Integrasi bukan proses database sepenuhnya read-only, walaupun fungsi bisnis chatbot hanya membaca.
- Jawaban WhatsApp deterministik tidak menjamin semua bahasa bebas dipahami. AI classifier dapat gagal atau salah memilih filter. Filter pengecualian tertentu dijawab sebagai belum didukung, bukan dipaksakan.
- Rollback aplikasi: deploy ulang commit terakhir yang telah diverifikasi dan pulihkan hanya perubahan konfigurasi integrasi yang dicatat. Evaluasi dampak autoreply/webhook sebelum memulihkan webhook lama.
- Jangan reset Git/worktree, restore database lama, hapus tabel, atau rollback data bisnis. Snapshot source disimpan privat di session workspace sebelum perubahan; secret produksi tidak disalin.

## 11. Checklist produksi

- [ ] Database dan mode aktif diverifikasi tanpa perubahan skema/data.
- [ ] Mapping akun WhatsApp dan pemilik permohonan benar.
- [ ] Nomor perangkat/secret/token diisi operator langsung, tanpa dibagikan.
- [ ] Provider AI yang sudah dipilih valid; biaya/privasi telah ditinjau.
- [ ] Webhook benar-benar terdaftar, Auto Read aktif, payload secret kompatibel.
- [ ] Deployment commit yang dimaksud sudah selesai; login/health tetap bekerja.
- [ ] Nomor uji diizinkan dan balasan diterima nyata.
- [ ] Tes akses sendiri/lain dan permission lulus.
- [ ] Tidak ada notifikasi ganda atau perubahan alur transaksi.
- [ ] Rollback source/config tercatat tanpa restore database.

## Referensi resmi

- [Send API](https://docs.fonnte.com/api-send-message/)
- [Webhook URL dan Auto Read](https://docs.fonnte.com/webhook-url/)
- [Webhook reply Node.js](https://docs.fonnte.com/webhook-reply-message-with-nodejs/)
- [Webhook secret dan Inbox](https://docs.fonnte.com/update-6-february-2025/)
- [AI native dan Flow](https://docs.fonnte.com/ai-getting-started/)
- [FAQ risiko layanan](https://fonnte.com)
