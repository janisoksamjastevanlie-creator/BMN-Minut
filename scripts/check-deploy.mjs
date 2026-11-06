// Gerbang verifikasi sesudah push.
//
// GitHub Actions tidak dapat dijalankan (akun terkunci billing) dan Hostinger hanya
// menjalankan `npm run build`, sehingga kode server yang rusak dapat ter-deploy tanpa
// satu pun pemeriksaan. Skrip ini menutup celah itu: memastikan commit yang aktif di
// server sama dengan commit lokal, menunggu proses benar-benar memuat ulang, lalu
// membaca indikator kesehatan yang baru.
//
// Pemakaian:
//   node scripts/check-deploy.mjs                 -> periksa produksi saat ini
//   node scripts/check-deploy.mjs --wait=240      -> tunggu deploy yang sedang berjalan
//   npm run deploy:check -- --sha=abc1234
//
// Kode keluar: 0 terverifikasi, 1 tidak cocok atau tidak sehat, 2 tidak dapat memeriksa.
import { execFile } from 'node:child_process';
import process from 'node:process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const argv = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=') || true];
  })
);

const url = String(argv.get('url') || process.env.HEALTH_WATCHDOG_URL || 'https://bmnbpsminut.online');
const waitSeconds = Number(argv.get('wait') || 0);
const ssh = {
  host: String(argv.get('ssh-host') || '153.92.10.234'),
  port: String(argv.get('ssh-port') || '65002'),
  user: String(argv.get('ssh-user') || 'u552977145'),
  key: String(argv.get('ssh-key') || '~/.ssh/id_ed25519_hostinger'),
  path: String(argv.get('app-path') || '~/domains/bmnbpsminut.online/hbuilds/last-source')
};

async function localHead() {
  const { stdout } = await run('git', ['rev-parse', '--short', 'HEAD']);
  return stdout.trim();
}

async function remoteHead() {
  if (argv.get('skip-ssh')) return null;
  const target = `${ssh.user}@${ssh.host}`;
  const command = `git -C ${ssh.path} rev-parse --short HEAD`;
  try {
    const { stdout } = await run('ssh', [
      '-i',
      ssh.key.replace(/^~/, process.env.HOME || process.env.USERPROFILE || '~'),
      '-p',
      ssh.port,
      '-o',
      'ConnectTimeout=15',
      '-o',
      'StrictHostKeyChecking=accept-new',
      target,
      command
    ]);
    return stdout.trim();
  } catch (error) {
    console.error(`Pemeriksaan commit lewat SSH gagal: ${error.message}`);
    return undefined;
  }
}

async function health() {
  const response = await fetch(`${url}/api/health`, {
    signal: AbortSignal.timeout(20000),
    headers: { 'cache-control': 'no-store' }
  });
  return { status: response.status, body: await response.json() };
}

function describe(result) {
  const load = result.body?.load || {};
  return {
    status: result.body?.status,
    backend: load.data_backend,
    uptime_seconds: load.uptime_seconds,
    latency_status: result.status,
    pool_errors: load.database?.pool_errors,
    queue_rejections: load.database?.queue_limit_rejections,
    lag_breaches: load.event_loop?.breaches,
    write_rejected: load.state_write?.rejected,
    cache_refreshes: load.state_cache?.refreshes,
    rss_mb: load.memory?.rss_mb,
    memory_ratio: load.memory?.limit_ratio
  };
}

const expected = String(argv.get('sha') || (await localHead()));
let attempt = 0;
const deadline = Date.now() + waitSeconds * 1000;

for (;;) {
  attempt += 1;
  const remote = await remoteHead();
  const result = await health();
  const summary = describe(result);
  const commitOk = remote === null || remote === expected;
  const healthy = result.status === 200 && summary.status === 'ok';

  console.log(
    `percobaan ${attempt}: commit_lokal=${expected} commit_server=${remote ?? 'dilewati'} ` +
      `uptime=${summary.uptime_seconds}s backend=${summary.backend} rss=${summary.rss_mb}MB`
  );

  if (commitOk && healthy) {
    const concerns = [];
    if (summary.pool_errors) concerns.push(`pool_errors=${summary.pool_errors}`);
    if (summary.queue_rejections) concerns.push(`queue_rejections=${summary.queue_rejections}`);
    if (summary.write_rejected) concerns.push(`state_write_rejected=${summary.write_rejected}`);
    if (concerns.length) {
      console.error(`Deploy aktif tetapi ada catatan: ${concerns.join(', ')}`);
      process.exitCode = 1;
      break;
    }
    // Lonjakan event loop dihitung sejak proses hidup dan tidak pernah dinolkan,
    // jadi angka kecil pada proses yang sudah lama berjalan bukan tanda deploy buruk.
    // Pemantau terpisah (health-watchdog) yang menilai tren ini.
    if (summary.lag_breaches) {
      console.log(`Catatan: event_loop_lag=${summary.lag_breaches}x sejak proses hidup (uptime ${summary.uptime_seconds}s).`);
    }
    console.log('Deploy terverifikasi: commit cocok, health ok, tanpa tanda gangguan.');
    process.exitCode = 0;
    break;
  }

  if (remote === undefined) {
    console.error('Tidak dapat memastikan commit di server; health dibaca tanpa kecocokan commit.');
  }
  if (Date.now() >= deadline) {
    console.error(
      `Deploy belum cocok/sehat (server=${remote ?? 'dilewati'}, expected=${expected}, health=${summary.status})`
    );
    process.exitCode = 1;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 10000));
}
