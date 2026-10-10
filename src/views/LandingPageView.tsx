import React from 'react';
import { useApp } from '../context/AppContext';
import { OfficeTwin3D } from '../components/3d/OfficeTwin3D';
import {
  Box,
  Boxes,
  Building,
  Warehouse,
  QrCode,
  FileText,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  Cpu
} from 'lucide-react';

export const LandingPageView: React.FC = () => {
  const { setActiveView } = useApp();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-600 selection:text-white">
      {/* Top Navbar */}
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-700 to-indigo-800 p-0.5 shadow-md shadow-blue-900/30">
              <div className="w-full h-full rounded-[10px] bg-slate-950 flex items-center justify-center">
                <img src="/bps-minut-logo.png" alt="Logo BPS Minahasa Utara" className="w-full h-full object-contain" />
              </div>
            </div>

            <div>
              <span className="font-extrabold text-white text-base">BMN BPS MINUT</span>
              <span className="text-[10px] font-bold text-blue-400 ml-2 uppercase tracking-widest hidden sm:inline">
                BPS Minahasa Utara
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveView('dashboard')}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors border border-slate-700"
            >
              Jelajahi Dashboard
            </button>
            <button
              onClick={() => setActiveView('login')}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/20 flex items-center gap-1.5"
            >
              <span>Masuk ke Sistem</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-12 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Digital Asset Management • 3D Digital Twin • Inventory SAKTI</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
            Sistem Informasi Manajemen <br />
            <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-400 bg-clip-text text-transparent">
              Aset BMN & Persediaan
            </span>
          </h1>

          <p className="text-sm sm:text-base text-slate-300 font-medium">
            BADAN PUSAT STATISTIK KABUPATEN MINAHASA UTARA
          </p>

          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Platform enterprise modern untuk mengelola seluruh Barang Milik Negara (BMN) dan persediaan ATK & ARK secara terpadu dengan visualisasi 3D Digital Twin kantor dan gudang.
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => setActiveView('dashboard')}
              className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-xl shadow-blue-600/25 flex items-center gap-2"
            >
              <span>Buka Dashboard Utama</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => setActiveView('login')}
              className="px-6 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
            >
              Masuk Akun Pengelola
            </button>
          </div>
        </div>

        {/* 3D Office Twin Interactive Showcase */}
        <div className="mt-12">
          <div className="text-center mb-3">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Visualisasi Digital Twin Interaktif Gedung Kantor
            </span>
          </div>
          <OfficeTwin3D />
        </div>
      </section>

      {/* 7 Feature Pillars Section as requested in Prompt #43 */}
      <section className="py-16 bg-slate-900/60 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black text-white">7 Komponen Inti BMN BPS MINUT</h2>
            <p className="text-xs text-slate-400">Arsitektur terintegrasi standar Badan Pusat Statistik</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* 1. Manajemen BMN */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <Box className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">1. Manajemen BMN</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pencatatan 500+ aset negara, nomor registrasi NUP unik, perhitungan depresiasi nilai buku, dan status kondisi fisik.
              </p>
            </div>

            {/* 2. Persediaan ATK & ARK */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Boxes className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">2. Persediaan ATK & ARK</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Manajemen barang habis pakai, penerimaan barang masuk, pengeluaran dinas, dan kartu stok digital otomatis.
              </p>
            </div>

            {/* 3. 3D Asset Mapping */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                <Building className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">3. 3D Asset Mapping</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Eksplorasi gedung kantor BPS Minahasa Utara dalam format 3D. Klik ruangan untuk mengetahui rincian inventaris BMN.
              </p>
            </div>

            {/* 4. 3D Warehouse */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Warehouse className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">4. 3D Warehouse</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Visualisasi gudang persediaan 5 rak industrial (Rak A s/d E) dengan kode slot penyimpanan presisi (e.g. WH-A-02-05).
              </p>
            </div>

            {/* 5. Barcode & QR Code */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <QrCode className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">5. Barcode & QR Code</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pencetakan stiker label inventaris resmi BPS serta pemindai kamera untuk inventarisasi dan pelaporan cepat.
              </p>
            </div>

            {/* 6. Laporan Digital Resmi */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">6. Laporan Digital</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Rekonsiliasi berkala dengan KPKNL Manado, Berita Acara Stock Opname, serta ekspor ke format Excel dan PDF siap cetak.
              </p>
            </div>

            {/* 7. Audit & Transparansi */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5 md:col-span-2 lg:col-span-1">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">7. Audit & Transparansi</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pencatatan jejak audit trail seluruh operasi, verifikasi pengajuan pemindahan, dan kontrol akses berjenjang (RBAC).
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Branding (Prompt #44) */}
      <footer className="border-t border-slate-800 py-8 px-4 text-center text-xs text-slate-400 space-y-2">
        <div className="font-bold text-slate-300">
          BADAN PUSAT STATISTIK KABUPATEN MINAHASA UTARA
        </div>
        <div>
          BMN BPS MINUT — Sistem Informasi Manajemen Aset BMN & Persediaan
        </div>
        <div className="text-slate-400 text-[11px]">
          © 2026 BPS Kabupaten Minahasa Utara. Seluruh hak cipta dilindungi undang-undang.
        </div>
      </footer>
    </div>
  );
};
