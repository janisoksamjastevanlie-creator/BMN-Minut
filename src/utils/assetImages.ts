/**
 * Helper to provide curated, high-quality, realistic photos for BMN Assets and Persediaan (ATK/ARK)
 * Matching official BPS inventory items
 */

export const getAssetPhotoUrl = (namaBarang: string, kategori?: string): string => {
  const n = (namaBarang || '').toLowerCase();
  const k = (kategori || '').toLowerCase();

  if (n.includes('thinkpad')) {
    return 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('dell latitude') || n.includes('expertbook') || n.includes('laptop') || n.includes('notebook')) {
    return 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('all-in-one') || n.includes('aio') || n.includes('ideacentre')) {
    return 'https://images.unsplash.com/photo-1547082299-de196ea013d6?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('prodesk') || n.includes('desktop') || n.includes('pc') || n.includes('computer')) {
    return 'https://images.unsplash.com/photo-1587831990711-23ca6441447b?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('laserjet') || (n.includes('printer') && n.includes('laser'))) {
    return 'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('ecotank') || n.includes('epson') || n.includes('printer')) {
    return 'https://images.unsplash.com/photo-1589739900243-4b52cd9b104e?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('scanner') || n.includes('fujitsu')) {
    return 'https://images.unsplash.com/photo-1563770660941-20978e870e26?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('proyektor') || n.includes('projector') || n.includes('lumens')) {
    return 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('kamera') || n.includes('canon') || n.includes('dslr') || n.includes('eos')) {
    return 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('server') || n.includes('poweredge') || n.includes('xeon')) {
    return 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('ups') || n.includes('riello') || n.includes('power')) {
    return 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('ac split') || n.includes('daikin') || n.includes('panasonic') || n.includes('ac ')) {
    return 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('meja') || n.includes('desk') || n.includes('eselon')) {
    return 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('kursi') || n.includes('chair') || n.includes('ergonomis') || n.includes('chitose')) {
    return 'https://images.unsplash.com/photo-1580481077195-c3a821a58875?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('lemari') || n.includes('fireproof') || n.includes('arsip')) {
    return 'https://images.unsplash.com/photo-1595515106969-1ce29566ff1c?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('filing') || n.includes('cabinet') || n.includes('laci')) {
    return 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('innova') || n.includes('kijang') || n.includes('venturer')) {
    return 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('hilux') || n.includes('double cabin') || n.includes('4x4')) {
    return 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('vario') || n.includes('motor') || n.includes('honda')) {
    return 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('drone') || n.includes('dji') || n.includes('mavic')) {
    return 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('sound') || n.includes('baretone') || n.includes('speaker') || n.includes('audio')) {
    return 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=600&q=80';
  }

  // Fallback by category
  if (k.includes('kendaraan')) {
    return 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80';
  }
  if (k.includes('mebel') || k.includes('furnitur')) {
    return 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=600&q=80';
  }
  if (k.includes('kantor')) {
    return 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=600&q=80';
  }
  return 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=600&q=80';
};

export const getInventoryPhotoUrl = (namaItem: string, subkategori?: string, jenis?: string): string => {
  const n = (namaItem || '').toLowerCase();
  const s = (subkategori || '').toLowerCase();

  if (n.includes('kertas') || n.includes('hvs') || n.includes('paperone') || n.includes('sinar dunia') || n.includes('continuous')) {
    return 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('toner') || n.includes('tinta') || n.includes('cartridge') || n.includes('catridge')) {
    return 'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('pulpen') || n.includes('pen') || n.includes('pilot') || n.includes('standard') || n.includes('pensil')) {
    return 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('spidol') || n.includes('marker') || n.includes('snowman') || n.includes('highlighter') || n.includes('stabilo')) {
    return 'https://images.unsplash.com/photo-1585336261026-7f5ed6945899?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('map') || n.includes('ordner') || n.includes('bantex') || n.includes('box file') || n.includes('folder') || n.includes('snelhechter')) {
    return 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('stapler') || n.includes('staples') || n.includes('gunting') || n.includes('cutter') || n.includes('lem')) {
    return 'https://images.unsplash.com/photo-1585336261026-7f5ed6945899?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('clip') || n.includes('binder') || n.includes('klip') || n.includes('post-it') || n.includes('sticky')) {
    return 'https://images.unsplash.com/photo-1587614382346-4ec70e388b28?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('lakban') || n.includes('selotip') || n.includes('tape') || n.includes('isolasi') || n.includes('perekat')) {
    return 'https://images.unsplash.com/photo-1516962215378-7fa2e137ae93?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('amplop') || n.includes('samson')) {
    return 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('tisu') || n.includes('tissue') || n.includes('paseo')) {
    return 'https://images.unsplash.com/photo-1584556812952-905ffd0c611a?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('soap') || n.includes('sabun') || n.includes('lifebuoy') || n.includes('dettol') || n.includes('yuri')) {
    return 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('pembersih') || n.includes('karbol') || n.includes('cling') || n.includes('pel') || n.includes('sapu') || n.includes('kemoceng')) {
    return 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('kopi') || n.includes('teh') || n.includes('gula') || n.includes('snack')) {
    return 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('baterai') || n.includes('battery') || n.includes('alkaline')) {
    return 'https://images.unsplash.com/photo-1619725002198-6a689b72f41d?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('plastik sampah') || n.includes('trash bag')) {
    return 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('glade') || n.includes('pengharum') || n.includes('kamper')) {
    return 'https://images.unsplash.com/photo-1615397349754-cfa2066a298e?auto=format&fit=crop&w=600&q=80';
  }

  if (jenis === 'ARK' || s.includes('sanitasi') || s.includes('kebersihan')) {
    return 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80';
  }
  return 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=600&q=80';
};

export const ASSET_PHOTO_PRESETS = [
  { label: 'Laptop Lenovo / Dell / Asus', url: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=600&q=80' },
  { label: 'PC Desktop & Monitor', url: 'https://images.unsplash.com/photo-1587831990711-23ca6441447b?auto=format&fit=crop&w=600&q=80' },
  { label: 'PC All-in-One', url: 'https://images.unsplash.com/photo-1547082299-de196ea013d6?auto=format&fit=crop&w=600&q=80' },
  { label: 'Printer HP / Canon Laser', url: 'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?auto=format&fit=crop&w=600&q=80' },
  { label: 'Printer Epson Inkjet', url: 'https://images.unsplash.com/photo-1589739900243-4b52cd9b104e?auto=format&fit=crop&w=600&q=80' },
  { label: 'Scanner Dokumen Fujitsu', url: 'https://images.unsplash.com/photo-1563770660941-20978e870e26?auto=format&fit=crop&w=600&q=80' },
  { label: 'Proyektor Epson LCD', url: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=600&q=80' },
  { label: 'Kamera DSLR Canon EOS', url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=600&q=80' },
  { label: 'Server Dell PowerEdge', url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=600&q=80' },
  { label: 'AC Daikin / Panasonic', url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=600&q=80' },
  { label: 'Meja Kerja Eselon / Staf', url: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=600&q=80' },
  { label: 'Kursi Kerja Ergonomis', url: 'https://images.unsplash.com/photo-1580481077195-c3a821a58875?auto=format&fit=crop&w=600&q=80' },
  { label: 'Lemari Arsip & Filing Cabinet', url: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=600&q=80' },
  { label: 'Mobil Dinas Operasional', url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80' },
  { label: 'Motor Dinas Honda Vario', url: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=600&q=80' },
  { label: 'Drone DJI Pemetaan', url: 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=600&q=80' }
];

export const INVENTORY_PHOTO_PRESETS = [
  { label: 'Kertas HVS A4 / F4', url: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=600&q=80' },
  { label: 'Pulpen / Bolpoin / Gel Pen', url: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=80' },
  { label: 'Spidol / Highlighter', url: 'https://images.unsplash.com/photo-1585336261026-7f5ed6945899?auto=format&fit=crop&w=600&q=80' },
  { label: 'Map / Ordner / Box File', url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80' },
  { label: 'Stapler / Staples / Cutter', url: 'https://images.unsplash.com/photo-1585336261026-7f5ed6945899?auto=format&fit=crop&w=600&q=80' },
  { label: 'Tinta & Toner Printer', url: 'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?auto=format&fit=crop&w=600&q=80' },
  { label: 'Lakban & Selotip', url: 'https://images.unsplash.com/photo-1516962215378-7fa2e137ae93?auto=format&fit=crop&w=600&q=80' },
  { label: 'Tisu Kotak / Roll Paseo', url: 'https://images.unsplash.com/photo-1584556812952-905ffd0c611a?auto=format&fit=crop&w=600&q=80' },
  { label: 'Sabun Cuci Tangan & Disinfektan', url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80' },
  { label: 'Pembersih Lantai Karbol & Kaca', url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80' },
  { label: 'Sapu & Pel Lantai', url: 'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=600&q=80' },
  { label: 'Plastik Sampah Hitam', url: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=600&q=80' },
  { label: 'Pengharum Ruangan Glade', url: 'https://images.unsplash.com/photo-1615397349754-cfa2066a298e?auto=format&fit=crop&w=600&q=80' },
  { label: 'Kopi, Teh & Gula Pantry', url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80' }
];
