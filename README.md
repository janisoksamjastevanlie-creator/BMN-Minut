# SIMAN BMN BPS Minut

## Menjalankan server dan menyimpan data bersama

Server aplikasi dan database SQLite berjalan di laptop yang menjadi host. Gunakan Node.js 22.5 atau lebih baru.

1. Install dependensi: `npm install`.
2. Salin `.env.example` menjadi `.env`, lalu atur `ADMIN_NIP` dan `ADMIN_PASSWORD`. Kata sandi harus unik dan minimal 12 karakter. Jangan membagikan atau memasukkan `.env` ke Git.
3. Jalankan `npm run dev`, lalu buka `http://localhost:3000`.
4. Masuk dengan NIP dan kata sandi administrator dari `.env`. Saat pertama kali masuk, data aplikasi di browser host disalin ke database SQLite lokal.
5. Dari menu **Manajemen Pengguna**, atur kata sandi minimal 12 karakter untuk setiap pegawai. Akun pegawai yang sudah ada belum memiliki kata sandi sampai administrator menetapkannya.

Database berada di `data/siman.sqlite`. Hentikan server sebelum menyalin file database untuk membuat cadangan. Simpan cadangan di lokasi aman.

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

Server saat ini hanya mendengarkan di `127.0.0.1`. Tailscale memberi akses kepada perangkat di tailnet, tetapi tidak membuat webhook dapat diakses Fonnte. Untuk chatbot/webhook online, deploy backend dan SQLite pada host yang sesuai, sediakan domain HTTPS publik, secret manager, backup database, serta uji di staging. Deployment publik belum dilakukan atau diverifikasi oleh perubahan ini; jangan membuka port SQLite atau server dev langsung ke internet.

Dokumentasi yang diverifikasi:
- [Fonnte Send API](https://docs.fonnte.com/api-send-message/)
- [Fonnte webhook reply](https://docs.fonnte.com/webhook-reply-message/)
- [Fonnte Node.js webhook example](https://docs.fonnte.com/webhook-reply-message-with-nodejs/)
- [Fonnte webhook secret update](https://docs.fonnte.com/update-6-february-2025/)
