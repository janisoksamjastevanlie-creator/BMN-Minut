import { BmnAsset, InventoryItem } from '../types';

export type DashboardPeriod =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'quarter'
  | 'semester'
  | 'year'
  | 'custom';

export interface DashboardFilters {
  period: DashboardPeriod;
  startDate: string;
  endDate: string;
  keyword: string;
  assetCategory: string;
  assetSubcategory: string;
  assetCondition: string;
  assetStatus: string;
  building: string;
  room: string;
  custodian: string;
  minAssetValue: string;
  maxAssetValue: string;
  inventoryType: string;
  inventoryCategory: string;
  inventorySubcategory: string;
  inventoryStatus: string;
  warehouse: string;
  rack: string;
  minStock: string;
  maxStock: string;
}

export const DEFAULT_DASHBOARD_FILTERS: DashboardFilters = {
  period: 'all',
  startDate: '',
  endDate: '',
  keyword: '',
  assetCategory: '',
  assetSubcategory: '',
  assetCondition: '',
  assetStatus: '',
  building: '',
  room: '',
  custodian: '',
  minAssetValue: '',
  maxAssetValue: '',
  inventoryType: '',
  inventoryCategory: '',
  inventorySubcategory: '',
  inventoryStatus: '',
  warehouse: '',
  rack: '',
  minStock: '',
  maxStock: ''
};

const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function getPeriodBounds(filters: DashboardFilters): { start?: string; end?: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = today.getDay();
  const mondayOffset = (dayOfWeek + 6) % 7;

  switch (filters.period) {
    case 'today':
      return { start: formatDate(today), end: formatDate(today) };
    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { start: formatDate(yesterday), end: formatDate(yesterday) };
    }
    case 'thisWeek': {
      const monday = new Date(today);
      monday.setDate(monday.getDate() - mondayOffset);
      return { start: formatDate(monday), end: formatDate(today) };
    }
    case 'lastWeek': {
      const monday = new Date(today);
      monday.setDate(monday.getDate() - mondayOffset - 7);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return { start: formatDate(monday), end: formatDate(sunday) };
    }
    case 'thisMonth':
      return { start: formatDate(new Date(today.getFullYear(), today.getMonth(), 1)), end: formatDate(today) };
    case 'lastMonth':
      return {
        start: formatDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        end: formatDate(new Date(today.getFullYear(), today.getMonth(), 0))
      };
    case 'quarter': {
      const firstMonth = Math.floor(today.getMonth() / 3) * 3;
      return { start: formatDate(new Date(today.getFullYear(), firstMonth, 1)), end: formatDate(today) };
    }
    case 'semester': {
      const firstMonth = today.getMonth() < 6 ? 0 : 6;
      return { start: formatDate(new Date(today.getFullYear(), firstMonth, 1)), end: formatDate(today) };
    }
    case 'year':
      return { start: `${today.getFullYear()}-01-01`, end: formatDate(today) };
    case 'custom':
      return {
        ...(filters.startDate ? { start: filters.startDate } : {}),
        ...(filters.endDate ? { end: filters.endDate } : {})
      };
    default:
      return {};
  }
}

export function hasInvalidDateRange(filters: DashboardFilters): boolean {
  if (filters.period === 'custom' && filters.startDate && filters.endDate) {
    return filters.startDate > filters.endDate;
  }
  return false;
}

export function hasInvalidAssetValueRange(filters: DashboardFilters): boolean {
  const minValue = filters.minAssetValue === '' ? undefined : Number(filters.minAssetValue);
  const maxValue = filters.maxAssetValue === '' ? undefined : Number(filters.maxAssetValue);
  return (minValue !== undefined && maxValue !== undefined && minValue > maxValue);
}

export function hasInvalidStockRange(filters: DashboardFilters): boolean {
  const minStock = filters.minStock === '' ? undefined : Number(filters.minStock);
  const maxStock = filters.maxStock === '' ? undefined : Number(filters.maxStock);
  return minStock !== undefined && maxStock !== undefined && minStock > maxStock;
}

export function hasInvalidDashboardRange(filters: DashboardFilters): boolean {
  return hasInvalidDateRange(filters)
    || hasInvalidAssetValueRange(filters)
    || hasInvalidStockRange(filters);
}

export function hasDashboardAssetCriteria(filters: DashboardFilters): boolean {
  return Boolean(
    filters.assetCategory || filters.assetSubcategory || filters.assetCondition
    || filters.assetStatus || filters.building || filters.room || filters.custodian
    || filters.minAssetValue || filters.maxAssetValue
  );
}

export function hasDashboardInventoryCriteria(filters: DashboardFilters): boolean {
  return Boolean(
    filters.inventoryType || filters.inventoryCategory || filters.inventorySubcategory
    || filters.inventoryStatus || filters.warehouse || filters.rack || filters.minStock || filters.maxStock
  );
}

export function matchesDashboardAssetAttributes(asset: BmnAsset, filters: DashboardFilters): boolean {
  if (hasInvalidAssetValueRange(filters)) return false;
  const minValue = filters.minAssetValue === '' ? undefined : Number(filters.minAssetValue);
  const maxValue = filters.maxAssetValue === '' ? undefined : Number(filters.maxAssetValue);
  return (!filters.assetCategory || asset.kategori === filters.assetCategory)
    && (!filters.assetSubcategory || asset.subkategori === filters.assetSubcategory)
    && (!filters.assetCondition || asset.kondisi === filters.assetCondition)
    && (!filters.assetStatus || asset.status === filters.assetStatus)
    && (!filters.building || asset.gedung === filters.building)
    && (!filters.room || asset.ruanganNama === filters.room)
    && (!filters.custodian || asset.penanggungJawab === filters.custodian)
    && (minValue === undefined || asset.nilaiPerolehan >= minValue)
    && (maxValue === undefined || asset.nilaiPerolehan <= maxValue);
}

export function matchesDashboardInventoryItem(item: InventoryItem, filters: DashboardFilters, includeKeyword = true): boolean {
  if (hasInvalidStockRange(filters)) return false;
  const minStock = filters.minStock === '' ? undefined : Number(filters.minStock);
  const maxStock = filters.maxStock === '' ? undefined : Number(filters.maxStock);
  return (!filters.inventoryType || item.jenis === filters.inventoryType)
    && (!filters.inventoryCategory || item.kategori === filters.inventoryCategory)
    && (!filters.inventorySubcategory || item.subkategori === filters.inventorySubcategory)
    && (!filters.inventoryStatus || item.status === filters.inventoryStatus)
    && (!filters.warehouse || item.lokasiGudang === filters.warehouse)
    && (!filters.rack || item.rak === filters.rack)
    && (minStock === undefined || item.stokSaatIni >= minStock)
    && (maxStock === undefined || item.stokSaatIni <= maxStock)
    && (!includeKeyword || matchesDashboardSearch(filters.keyword, [
      item.kodeBarang, item.nama, item.kategori, item.subkategori, item.jenis,
      item.satuan, item.status, item.lokasiGudang, item.rak, item.shelf, item.binCode, item.barcode
    ]));
}

export function matchesDashboardPeriod(dateValue: string | undefined, filters: DashboardFilters): boolean {
  if (filters.period === 'all') return true;
  if (hasInvalidDateRange(filters)) return false;
  const { start, end } = getPeriodBounds(filters);
  if (!start && !end) return true;
  const date = dateValue?.slice(0, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return (!start || date >= start) && (!end || date <= end);
}

export function matchesDashboardSearch(keyword: string, values: Array<string | number | undefined>): boolean {
  const query = keyword.trim().toLocaleLowerCase('id-ID');
  if (!query) return true;
  return values.some(value => String(value ?? '').toLocaleLowerCase('id-ID').includes(query));
}

export function filterDashboardAssets(assets: BmnAsset[], filters: DashboardFilters): BmnAsset[] {
  if (hasInvalidDateRange(filters) || hasInvalidAssetValueRange(filters)) return [];

  return assets.filter(asset =>
    matchesDashboardPeriod(asset.tanggalPerolehan, filters)
    && matchesDashboardAssetAttributes(asset, filters)
    && matchesDashboardSearch(filters.keyword, [
      asset.kodeBarang, asset.nup, asset.namaBarang, asset.kategori, asset.subkategori,
      asset.merkType, asset.nomorSeri, asset.kondisi, asset.status, asset.gedung,
      asset.ruanganNama, asset.penanggungJawab, asset.keterangan
    ])
  );
}

export function filterDashboardInventory(items: InventoryItem[], filters: DashboardFilters): InventoryItem[] {
  return items.filter(item => matchesDashboardInventoryItem(item, filters));
}

export function countActiveDashboardFilters(filters: DashboardFilters): number {
  return Object.entries(filters)
    .filter(([key]) => key !== 'startDate' && key !== 'endDate')
    .filter(([key, value]) => key === 'period' ? value !== 'all' : Boolean(value))
    .length;
}
