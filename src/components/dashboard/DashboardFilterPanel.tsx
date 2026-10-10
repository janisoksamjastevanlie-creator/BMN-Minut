import React from 'react';
import { BmnAsset, InventoryItem, OfficeRoom } from '../../types';
import {
  countActiveDashboardFilters,
  DashboardFilters,
  DEFAULT_DASHBOARD_FILTERS,
  hasInvalidDashboardRange
} from '../../utils/dashboardFilters';
import { Filter, RotateCcw, X } from 'lucide-react';

interface DashboardFilterPanelProps {
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
  assets: BmnAsset[];
  inventoryItems: InventoryItem[];
  rooms: OfficeRoom[];
  assetResultCount: number;
  inventoryResultCount: number;
}

const controlClassName = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40';

const uniqueValues = (values: Array<string | undefined>): string[] =>
  [...new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b, 'id'));

export const DashboardFilterPanel: React.FC<DashboardFilterPanelProps> = ({
  filters,
  onChange,
  assets,
  inventoryItems,
  rooms,
  assetResultCount,
  inventoryResultCount
}) => {
  const activeCount = countActiveDashboardFilters(filters);
  const subcategories = uniqueValues(assets
    .filter(asset => !filters.assetCategory || asset.kategori === filters.assetCategory)
    .map(asset => asset.subkategori));
  const roomNames = uniqueValues(rooms
    .filter(room => !filters.building || room.building === filters.building)
    .map(room => room.name)
    .concat(assets
      .filter(asset => !filters.building || asset.gedung === filters.building)
      .map(asset => asset.ruanganNama)));
  const inventorySubcategories = uniqueValues(inventoryItems
    .filter(item => !filters.inventoryCategory || item.kategori === filters.inventoryCategory)
    .map(item => item.subkategori));
  const racks = uniqueValues(inventoryItems
    .filter(item => !filters.warehouse || item.lokasiGudang === filters.warehouse)
    .map(item => item.rak));

  const update = <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => {
    const next = { ...filters, [key]: value };
    if (key === 'period' && value !== 'custom') {
      next.startDate = '';
      next.endDate = '';
    }
    if (key === 'assetCategory') next.assetSubcategory = '';
    if (key === 'building') next.room = '';
    if (key === 'inventoryCategory') next.inventorySubcategory = '';
    if (key === 'warehouse') next.rack = '';
    onChange(next);
  };

  const clearOne = (key: keyof DashboardFilters) => {
    if (key === 'period') {
      onChange({ ...filters, period: 'all', startDate: '', endDate: '' });
      return;
    }
    update(key, DEFAULT_DASHBOARD_FILTERS[key]);
  };

  const activeChips = (Object.keys(filters) as Array<keyof DashboardFilters>)
    .filter(key => key === 'period' ? filters.period !== 'all' : Boolean(filters[key]))
    .map(key => {
      const labels: Record<keyof DashboardFilters, string> = {
        period: 'Periode',
        startDate: 'Mulai',
        endDate: 'Sampai',
        keyword: 'Cari',
        assetCategory: 'Kategori aset',
        assetSubcategory: 'Subkategori aset',
        assetCondition: 'Kondisi',
        assetStatus: 'Status aset',
        building: 'Gedung',
        room: 'Ruangan',
        custodian: 'Penanggung jawab',
        minAssetValue: 'Nilai min.',
        maxAssetValue: 'Nilai maks.',
        inventoryType: 'Jenis persediaan',
        inventoryCategory: 'Kategori persediaan',
        inventorySubcategory: 'Subkategori persediaan',
        inventoryStatus: 'Status stok',
        warehouse: 'Gudang',
        rack: 'Rak',
        minStock: 'Stok min.',
        maxStock: 'Stok maks.'
      };
      const value = key === 'period'
        ? filters.period === 'custom'
          ? [filters.startDate, filters.endDate].filter(Boolean).join(' – ') || 'Rentang khusus'
          : periodLabels[filters.period]
        : filters[key];
      return { key, label: labels[key], value: String(value) };
    });

  return (
    <section aria-label="Filter dashboard" className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-xl sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-500/15 text-blue-300">
            <Filter className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Filter Dashboard</h2>
            <p className="text-[11px] text-slate-400">Diterapkan langsung pada ringkasan dan aktivitas terkait.</p>
          </div>
          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-200">
            {activeCount} aktif
          </span>
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_DASHBOARD_FILTERS })}
          disabled={activeCount === 0}
          className="inline-flex items-center justify-center gap-1.5 self-start rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:self-auto"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset filter
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(200px,0.8fr)_minmax(150px,0.7fr)_minmax(150px,0.7fr)]">
        <label className="text-[11px] font-semibold text-slate-300">
          Pencarian detail
          <input
            className={`${controlClassName} mt-1`}
            type="search"
            value={filters.keyword}
            onChange={event => update('keyword', event.target.value)}
            placeholder="Nama, kode, NUP, ruang, barang..."
          />
        </label>
        <label className="text-[11px] font-semibold text-slate-300">
          Periode aset & aktivitas
          <select className={`${controlClassName} mt-1`} value={filters.period} onChange={event => update('period', event.target.value as DashboardFilters['period'])}>
            {Object.entries(periodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {filters.period === 'custom' ? (
          <>
            <label className="text-[11px] font-semibold text-slate-300">
              Dari tanggal
              <input className={`${controlClassName} mt-1`} type="date" value={filters.startDate} max={filters.endDate || undefined} onChange={event => update('startDate', event.target.value)} />
            </label>
            <label className="text-[11px] font-semibold text-slate-300">
              Sampai tanggal
              <input className={`${controlClassName} mt-1`} type="date" value={filters.endDate} min={filters.startDate || undefined} onChange={event => update('endDate', event.target.value)} />
            </label>
          </>
        ) : (
          <div className="md:col-span-2 flex items-center rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-[11px] text-slate-400">
            Periode diterapkan pada tanggal perolehan aset dan tanggal aktivitas yang tersedia.
          </div>
        )}
      </div>

      <details className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40">
        <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-slate-300 marker:text-blue-400">
          Filter lanjutan aset dan persediaan
        </summary>
        <div className="grid grid-cols-1 gap-3 border-t border-slate-800 p-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="sm:col-span-2 xl:col-span-4">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-blue-300">Aset BMN</h3>
          </div>
          <Select label="Kategori aset" value={filters.assetCategory} options={uniqueValues(assets.map(asset => asset.kategori))} onChange={value => update('assetCategory', value)} />
          <Select label="Subkategori aset" value={filters.assetSubcategory} options={subcategories} onChange={value => update('assetSubcategory', value)} />
          <Select label="Kondisi" value={filters.assetCondition} options={uniqueValues(assets.map(asset => asset.kondisi))} onChange={value => update('assetCondition', value)} />
          <Select label="Status aset" value={filters.assetStatus} options={uniqueValues(assets.map(asset => asset.status))} onChange={value => update('assetStatus', value)} />
          <Select label="Gedung" value={filters.building} options={uniqueValues([...rooms.map(room => room.building), ...assets.map(asset => asset.gedung)])} onChange={value => update('building', value)} />
          <Select label="Ruangan" value={filters.room} options={roomNames} onChange={value => update('room', value)} />
          <Select label="Penanggung jawab" value={filters.custodian} options={uniqueValues(assets.map(asset => asset.penanggungJawab))} onChange={value => update('custodian', value)} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Nilai perolehan min. (Rp)" value={filters.minAssetValue} onChange={value => update('minAssetValue', value)} />
            <NumberField label="Nilai perolehan maks. (Rp)" value={filters.maxAssetValue} onChange={value => update('maxAssetValue', value)} />
          </div>

          <div className="sm:col-span-2 xl:col-span-4 mt-2 border-t border-slate-800 pt-3">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Persediaan</h3>
          </div>
          <Select label="Jenis" value={filters.inventoryType} options={uniqueValues(inventoryItems.map(item => item.jenis))} onChange={value => update('inventoryType', value)} />
          <Select label="Kategori persediaan" value={filters.inventoryCategory} options={uniqueValues(inventoryItems.map(item => item.kategori))} onChange={value => update('inventoryCategory', value)} />
          <Select label="Subkategori persediaan" value={filters.inventorySubcategory} options={inventorySubcategories} onChange={value => update('inventorySubcategory', value)} />
          <Select label="Status stok" value={filters.inventoryStatus} options={uniqueValues(inventoryItems.map(item => item.status))} onChange={value => update('inventoryStatus', value)} />
          <Select label="Gudang" value={filters.warehouse} options={uniqueValues(inventoryItems.map(item => item.lokasiGudang))} onChange={value => update('warehouse', value)} />
          <Select label="Rak" value={filters.rack} options={racks} onChange={value => update('rack', value)} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Saldo stok min." value={filters.minStock} onChange={value => update('minStock', value)} />
            <NumberField label="Saldo stok maks." value={filters.maxStock} onChange={value => update('maxStock', value)} />
          </div>
        </div>
      </details>

      {activeChips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Filter aktif">
          {activeChips.map(chip => (
            <span key={chip.key} className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[10px] text-slate-300">
              <span className="text-slate-500">{chip.label}:</span> {chip.value}
              <button type="button" onClick={() => clearOne(chip.key)} aria-label={`Hapus filter ${chip.label}`} className="ml-0.5 rounded-full p-0.5 text-slate-400 hover:bg-slate-800 hover:text-white">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {hasInvalidDashboardRange(filters) && (
        <p role="alert" className="mt-3 text-xs text-rose-300">Rentang tanggal atau nilai minimum tidak boleh melebihi nilai maksimum.</p>
      )}
      <p role="status" aria-live="polite" className="mt-3 text-[11px] text-slate-400">
        Hasil sesuai filter: {assetResultCount.toLocaleString('id-ID')} aset dan {inventoryResultCount.toLocaleString('id-ID')} jenis persediaan.
      </p>
    </section>
  );
};

const periodLabels: Record<DashboardFilters['period'], string> = {
  all: 'Semua periode',
  today: 'Hari ini',
  yesterday: 'Kemarin',
  thisWeek: 'Minggu ini',
  lastWeek: 'Minggu lalu',
  thisMonth: 'Bulan ini',
  lastMonth: 'Bulan lalu',
  quarter: 'Triwulan berjalan',
  semester: 'Semester berjalan',
  year: 'Tahun berjalan',
  custom: 'Rentang khusus'
};

const Select: React.FC<{ label: string; value: string; options: string[]; onChange: (value: string) => void }> = ({ label, value, options, onChange }) => (
  <label className="text-[11px] font-semibold text-slate-300">
    {label}
    <select className={`${controlClassName} mt-1`} value={value} onChange={event => onChange(event.target.value)}>
      <option value="">Semua</option>
      {options.map(option => <option key={option} value={option}>{option}</option>)}
    </select>
  </label>
);

const NumberField: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => (
  <label className="text-[10px] font-semibold text-slate-400">
    {label}
    <input className={`${controlClassName} mt-1`} type="number" min="0" step="any" value={value} onChange={event => onChange(event.target.value)} />
  </label>
);
