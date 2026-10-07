import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { History, Search, ShieldCheck, Terminal, Filter, Calendar } from 'lucide-react';

export const AuditTrailView: React.FC = () => {
  const { auditLogs } = useApp();
  const [filterModul, setFilterModul] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filteredLogs = auditLogs.filter(l => {
    const matchModul = filterModul === 'all' || l.modul === filterModul;
    const matchSearch =
      search === '' ||
      l.aktivitas.toLowerCase().includes(search.toLowerCase()) ||
      l.userName.toLowerCase().includes(search.toLowerCase()) ||
      l.detail.toLowerCase().includes(search.toLowerCase());
    return matchModul && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-white">Log Audit Trail & Jejak Aktivitas</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold font-mono">
              {auditLogs.length} Entri Log
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Pencatatan transparan seluruh mutasi data BMN, transaksi gudang, approval, dan aktivitas pengguna
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-emerald-400 flex items-center gap-1.5 font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Immutable Security Logs</span>
          </div>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {(['all', 'ASET_BMN', 'PERSEDIAAN', 'AUTH', 'DOKUMEN', 'SISTEM'] as const).map(m => (
            <button
              key={m}
              onClick={() => setFilterModul(m)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                filterModul === m
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {m === 'all' ? 'Semua Modul' : m}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari aktivitas, nama pengguna..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3">Waktu & Tanggal</th>
                <th className="py-3 px-3">Pengguna</th>
                <th className="py-3 px-3">Modul</th>
                <th className="py-3 px-4">Aktivitas Dilakukan</th>
                <th className="py-3 px-4">Rincian Perubahan Data</th>
                <th className="py-3 px-3 text-right">Alamat IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-3 whitespace-nowrap">
                    <div className="font-semibold text-white">{log.waktu}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{log.tanggal}</div>
                  </td>

                  <td className="py-3 px-3">
                    <div className="font-medium text-slate-200">{log.userName}</div>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-blue-300 font-semibold">
                      {log.userRole}
                    </span>
                  </td>

                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      log.modul === 'ASET_BMN' ? 'bg-blue-500/10 text-blue-400' :
                      log.modul === 'PERSEDIAAN' ? 'bg-amber-500/10 text-amber-400' :
                      log.modul === 'AUTH' ? 'bg-emerald-500/10 text-emerald-400' :
                      'bg-purple-500/10 text-purple-400'
                    }`}>
                      {log.modul}
                    </span>
                  </td>

                  <td className="py-3 px-4 font-semibold text-white">
                    {log.aktivitas}
                  </td>

                  <td className="py-3 px-4 text-slate-300 text-[11px] leading-relaxed max-w-md">
                    {log.detail}
                  </td>

                  <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-400">
                    {log.ipAddress}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
