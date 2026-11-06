module.exports = {
  apps: [
    {
      name: 'bmn-minut',
      script: 'server.mjs',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      // Restart otomatis bila proses gagal bangun (port belum bebas, database belum siap).
      listen_timeout: 20000,
      kill_timeout: 12000,
      wait_ready: false,
      // Penanda memori: proses yang tumbuh tanpa batas membuat server berhenti merespon,
      // lebih baik di restart oleh pm2 daripada menggantung.
      max_memory_restart: '1G',
      // Jumlah restart beruntun dibatasi supaya kegagalan konfigurasi tidak memicu restart loop.
      min_uptime: '15s',
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production'
        // Batas runtime (DB_QUEUE_LIMIT, STATE_CACHE_TTL_MS, REQUEST_TIMEOUT_MS,
        // STATE_REQUEST_TIMEOUT_MS, STATE_WRITE_CONCURRENCY) diatur di .env aplikasi,
        // tidak di sini, supaya nilai environment pm2 tidak menimpa file .env.
      }
    }
  ]
};
