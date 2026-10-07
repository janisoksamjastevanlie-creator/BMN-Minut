import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { OfficeTwin3D } from '../components/3d/OfficeTwin3D';
import { OfficeRoom, BmnAsset } from '../types';
import { AssetDetailModal } from '../components/bmn/AssetDetailModal';
import { canAccessView } from '../utils/rbac';
import { Building2, Boxes, ShieldAlert, CheckCircle, Search, Eye, ArrowRight, Plus } from 'lucide-react';

export const AssetMapping3DView: React.FC = () => {
  const { rooms, assets, setActiveView, setIsRoomModalOpen, setEditingRoom, currentUser, hasPermission } = useApp();
  const [selectedRoomId, setSelectedRoomId] = useState<string>(rooms[0]?.id || '');
  const [selectedAsset, setSelectedAsset] = useState<BmnAsset | null>(null);

  const canManageRooms = canAccessView('rooms', hasPermission, currentUser);
  const activeRoom = rooms.find(r => r.id === selectedRoomId) || rooms[0];
  const roomAssets = activeRoom ? assets.filter(a => a.ruanganId === activeRoom.id) : [];
  const baikCount = roomAssets.filter(a => a.kondisi === 'Baik').length;
  const rusakCount = roomAssets.filter(a => a.kondisi !== 'Baik').length;
  const totalNilai = roomAssets.reduce((sum, a) => sum + a.nilaiPerolehan, 0);

  if (!activeRoom) return null;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-white">3D Asset Mapping Kantor BPS Minahasa Utara</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
              Digital Twin Interaktif
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Navigasi visualisasi 3D seluruh ruangan kerja, penempatan peralatan BMN, dan status fisik terkini
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canManageRooms && (
            <>
              <button
                onClick={() => setActiveView('rooms')}
                className="px-3.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold flex items-center gap-2 transition-colors border border-blue-500/30"
              >
                <Building2 className="w-4 h-4 text-blue-400" />
                <span>Manajemen Ruangan & DBR</span>
              </button>

              <button
                onClick={() => {
                  setEditingRoom(null);
                  setIsRoomModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/30"
              >
                <Plus className="w-4 h-4" />
                <span>+ Buat Ruangan</span>
              </button>
            </>
          )}

          <button
            onClick={() => setActiveView('assets')}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors border border-slate-700"
          >
            <Boxes className="w-4 h-4 text-slate-400" />
            <span>Tabel Semua Aset</span>
          </button>
        </div>
      </div>

      {/* 3D Model Twin */}
      <OfficeTwin3D onSelectRoom={room => setSelectedRoomId(room.id)} />

      {/* Room Selector Quick Chips */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Pilih Ruangan Langsung:
          </div>
          {canManageRooms && (
            <button
              onClick={() => {
                setEditingRoom(null);
                setIsRoomModalOpen(true);
              }}
              className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Ruangan Baru</span>
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {rooms.map(room => {
            const count = assets.filter(a => a.ruanganId === room.id).length;
            const isSelected = activeRoom.id === room.id;
            return (
              <button
                key={room.id}
                onClick={() => setSelectedRoomId(room.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 border ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/20'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <span>{room.name}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detailed Inventory Table for Selected Room */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" />
              <span>Inventaris: {activeRoom.name} ({activeRoom.code})</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              PIC: {activeRoom.picName} • Lt. {activeRoom.floor} • {roomAssets.length} unit aset terdaftar
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Baik: {baikCount}
            </span>
            <span className="px-2.5 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
              Perlu Servis: {rusakCount}
            </span>
            <span className="px-2.5 py-1 rounded bg-blue-500/10 text-blue-300 font-bold border border-blue-500/20">
              Rp {totalNilai.toLocaleString('id-ID')}
            </span>
          </div>
        </div>

        {/* Assets List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {roomAssets.slice(0, 15).map(asset => (
            <div
              key={asset.id}
              onClick={() => setSelectedAsset(asset)}
              className="p-3.5 rounded-xl bg-slate-950/70 hover:bg-slate-800/80 border border-slate-800 cursor-pointer transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                    NUP #{asset.nup}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    asset.kondisi === 'Baik' ? 'bg-emerald-500/10 text-emerald-400' :
                    asset.kondisi === 'Rusak Ringan' ? 'bg-amber-500/10 text-amber-400' :
                    'bg-rose-500/10 text-rose-400'
                  }`}>
                    {asset.kondisi}
                  </span>
                </div>
                <h4 className="text-xs font-bold text-white mt-1.5 line-clamp-1">{asset.namaBarang}</h4>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">{asset.merkType}</div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-900 flex items-center justify-between text-[11px]">
                <span className="text-emerald-400 font-mono font-semibold">
                  Rp {asset.nilaiBuku.toLocaleString('id-ID')}
                </span>
                <span className="text-blue-400 hover:underline flex items-center gap-1 font-semibold text-[10px]">
                  <span>Detail & QR</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedAsset && (
        <AssetDetailModal
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
        />
      )}
    </div>
  );
};
