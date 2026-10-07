import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Search, X, Box, Package, Building, FileText, ArrowRight, CornerDownLeft } from 'lucide-react';

export const GlobalSearchModal: React.FC = () => {
  const {
    isGlobalSearchOpen,
    setIsGlobalSearchOpen,
    assets,
    inventoryItems,
    rooms,
    documents,
    setSelectedAsset,
    setSelectedInventoryItem,
    setActiveView
  } = useApp();

  const [query, setQuery] = useState('');

  // Handle Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen(true);
      } else if (e.key === 'Escape' && isGlobalSearchOpen) {
        setIsGlobalSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGlobalSearchOpen, setIsGlobalSearchOpen]);

  if (!isGlobalSearchOpen) return null;

  const cleanQuery = query.toLowerCase().trim();

  const filteredAssets = cleanQuery
    ? assets
        .filter(
          a =>
            a.namaBarang.toLowerCase().includes(cleanQuery) ||
            a.kodeBarang.toLowerCase().includes(cleanQuery) ||
            String(a.nup).includes(cleanQuery) ||
            a.merkType.toLowerCase().includes(cleanQuery) ||
            a.ruanganNama.toLowerCase().includes(cleanQuery)
        )
        .slice(0, 5)
    : [];

  const filteredInventory = cleanQuery
    ? inventoryItems
        .filter(
          i =>
            i.nama.toLowerCase().includes(cleanQuery) ||
            i.kodeBarang.toLowerCase().includes(cleanQuery) ||
            i.binCode.toLowerCase().includes(cleanQuery) ||
            i.rak.toLowerCase().includes(cleanQuery)
        )
        .slice(0, 5)
    : [];

  const filteredRooms = cleanQuery
    ? rooms
        .filter(
          r =>
            r.name.toLowerCase().includes(cleanQuery) ||
            r.code.toLowerCase().includes(cleanQuery) ||
            r.picName.toLowerCase().includes(cleanQuery)
        )
        .slice(0, 3)
    : [];

  const filteredDocs = cleanQuery
    ? documents
        .filter(
          d =>
            d.judul.toLowerCase().includes(cleanQuery) ||
            d.nomorDokumen.toLowerCase().includes(cleanQuery)
        )
        .slice(0, 3)
    : [];

  const hasResults =
    filteredAssets.length > 0 ||
    filteredInventory.length > 0 ||
    filteredRooms.length > 0 ||
    filteredDocs.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Search Input Box */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-3">
          <Search className="w-5 h-5 text-blue-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ketik kata kunci pencarian (misal: Laptop, Kertas A4, Tata Usaha, NUP 12)..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-400 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setIsGlobalSearchOpen(false)}
            className="px-2 py-1 rounded bg-slate-800 text-[11px] text-slate-400 hover:text-white"
          >
            ESC
          </button>
        </div>

        {/* Results Area */}
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4">
          {!cleanQuery ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              <p>Mulai ketik untuk mencari di seluruh database SIMAN-BMN</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <span className="px-2 py-1 bg-slate-800/80 rounded-md text-[11px] cursor-pointer hover:bg-slate-700" onClick={() => setQuery('Laptop')}>
                  💻 Laptop
                </span>
                <span className="px-2 py-1 bg-slate-800/80 rounded-md text-[11px] cursor-pointer hover:bg-slate-700" onClick={() => setQuery('Kertas HVS')}>
                  📄 Kertas HVS
                </span>
                <span className="px-2 py-1 bg-slate-800/80 rounded-md text-[11px] cursor-pointer hover:bg-slate-700" onClick={() => setQuery('Rusak Berat')}>
                  ⚠️ Rusak Berat
                </span>
                <span className="px-2 py-1 bg-slate-800/80 rounded-md text-[11px] cursor-pointer hover:bg-slate-700" onClick={() => setQuery('IPDS')}>
                  🏢 Ruang IPDS
                </span>
              </div>
            </div>
          ) : !hasResults ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              Tidak ditemukan hasil untuk &quot;<span className="text-slate-200">{query}</span>&quot;
            </div>
          ) : (
            <>
              {/* Asset Results */}
              {filteredAssets.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Box className="w-3.5 h-3.5" />
                    <span>Aset BMN ({filteredAssets.length})</span>
                  </div>
                  <div className="space-y-1">
                    {filteredAssets.map(asset => (
                      <div
                        key={asset.id}
                        onClick={() => {
                          setSelectedAsset(asset);
                          setActiveView('assets');
                          setIsGlobalSearchOpen(false);
                        }}
                        className="p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div>
                          <div className="font-semibold text-white">{asset.namaBarang}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            NUP {asset.nup} • {asset.kodeBarang} • {asset.ruanganNama}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                            asset.kondisi === 'Baik' ? 'bg-emerald-500/10 text-emerald-400' :
                            asset.kondisi === 'Rusak Ringan' ? 'bg-amber-500/10 text-amber-400' :
                            'bg-rose-500/10 text-rose-400'
                          }`}>
                            {asset.kondisi}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Inventory Results */}
              {filteredInventory.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    <span>Persediaan ATK & ARK ({filteredInventory.length})</span>
                  </div>
                  <div className="space-y-1">
                    {filteredInventory.map(item => (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedInventoryItem(item);
                          setActiveView('inventory');
                          setIsGlobalSearchOpen(false);
                        }}
                        className="p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div>
                          <div className="font-semibold text-white">{item.nama}</div>
                          <div className="text-[11px] text-cyan-400 font-mono">
                            {item.binCode} • {item.rak} • Stok: {item.stokSaatIni} {item.satuan}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                            item.status === 'Aman' ? 'bg-emerald-500/10 text-emerald-400' :
                            item.status === 'Menipis' ? 'bg-amber-500/10 text-amber-400' :
                            'bg-rose-500/10 text-rose-400'
                          }`}>
                            {item.status}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Room Results */}
              {filteredRooms.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5" />
                    <span>Ruangan Kantor ({filteredRooms.length})</span>
                  </div>
                  <div className="space-y-1">
                    {filteredRooms.map(room => (
                      <div
                        key={room.id}
                        onClick={() => {
                          setActiveView('office-3d');
                          setIsGlobalSearchOpen(false);
                        }}
                        className="p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div>
                          <div className="font-semibold text-white">{room.name}</div>
                          <div className="text-[11px] text-slate-400">
                            {room.code} • Lt. {room.floor} • PIC: {room.picName}
                          </div>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Document Results */}
              {filteredDocs.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Dokumen & Berita Acara ({filteredDocs.length})</span>
                  </div>
                  <div className="space-y-1">
                    {filteredDocs.map(doc => (
                      <div
                        key={doc.id}
                        onClick={() => {
                          setActiveView('documents');
                          setIsGlobalSearchOpen(false);
                        }}
                        className="p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div>
                          <div className="font-semibold text-white">{doc.judul}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {doc.nomorDokumen} • {doc.jenis}
                          </div>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span>Navigasi instan ke data BPS Minut</span>
          <div className="flex items-center gap-2">
            <span>Pilih dengan Enter</span>
            <CornerDownLeft className="w-3 h-3 text-slate-400" />
          </div>
        </div>
      </div>
    </div>
  );
};
