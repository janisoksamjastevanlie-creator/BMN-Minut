import { BmnAsset, OfficeRoom } from '../types';

export const UNLOCATED_ASSET_ROOM_NAME = 'Belum berlokasi';

export interface ImportedRoomLocation {
  label: string;
  name: string;
  code: string;
}

type RoomReference = Pick<OfficeRoom, 'id' | 'name' | 'code'>;

const normalize = (value: string): string => value.trim().toLocaleLowerCase('id-ID');

export const parseImportedRoomLocation = (value: string | null | undefined): ImportedRoomLocation => {
  const label = value?.trim() || '';
  if (!label || /^(belum berlokasi|belum ditentukan|tidak diketahui|n\/a|-)$/i.test(label)) {
    return { label: UNLOCATED_ASSET_ROOM_NAME, name: UNLOCATED_ASSET_ROOM_NAME, code: '' };
  }

  const codedLocation = /^(\d{4,})\s*[-–—]\s*(.+)$/.exec(label);
  if (codedLocation) {
    return {
      label,
      code: codedLocation[1],
      name: codedLocation[2].trim()
    };
  }

  return { label, name: label, code: '' };
};

export const findImportedRoom = <TRoom extends RoomReference>(
  location: ImportedRoomLocation,
  rooms: TRoom[]
): TRoom | undefined => {
  const normalizedName = normalize(location.name);
  const normalizedLabel = normalize(location.label);
  return rooms.find(room =>
    normalize(room.name) === normalizedName ||
    normalize(room.name) === normalizedLabel ||
    (location.code !== '' && normalize(room.code) === normalize(location.code))
  );
};

export const getMissingImportedRoomLocations = (
  locations: string[],
  rooms: RoomReference[]
): ImportedRoomLocation[] => {
  const seen = new Set<string>();
  return locations
    .map(parseImportedRoomLocation)
    .filter(location => {
      const key = location.code ? `code:${normalize(location.code)}` : `name:${normalize(location.name)}`;
      if (seen.has(key) || findImportedRoom(location, rooms)) return false;
      seen.add(key);
      return true;
    });
};

export const linkImportedAssetsToRooms = (
  assets: Omit<BmnAsset, 'id'>[],
  existingRooms: OfficeRoom[]
): { assets: Omit<BmnAsset, 'id'>[]; newRooms: OfficeRoom[] } => {
  const nextRooms = [...existingRooms];
  const locationsToCreate = getMissingImportedRoomLocations(
    assets.map(asset => asset.ruanganNama),
    nextRooms
  );
  const newRooms: OfficeRoom[] = [];

  locationsToCreate.forEach((location, index) => {
    const matchingAsset = assets.find(asset =>
      parseImportedRoomLocation(asset.ruanganNama).name.toLocaleLowerCase('id-ID') ===
      location.name.toLocaleLowerCase('id-ID')
    );
    const floorMatch = /(?:lantai|lt\.?)\s*(\d+)/i.exec(location.name);
    const floor = floorMatch ? Number(floorMatch[1]) : 1;
    const baseCode = location.code || `IMP-${location.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20) || 'RUANG'}`;
    let code = baseCode;
    let suffix = 2;
    while (nextRooms.some(room => room.code.trim().toLocaleLowerCase('id-ID') === code.toLocaleLowerCase('id-ID'))) {
      code = `${baseCode.slice(0, 25)}-${suffix}`;
      suffix += 1;
    }

    const roomIndex = existingRooms.length + index;
    const name = location.name.toLocaleLowerCase('id-ID');
    const roomType: NonNullable<OfficeRoom['roomType']> = name === 'belum berlokasi'
      ? 'Lainnya'
      : name.includes('gudang') ? 'Gudang'
        : name.includes('aula') || name.includes('rapat') ? 'Ruang Rapat'
          : name.includes('server') ? 'Ruang Server'
            : name.includes('arsip') ? 'Arsip & Dokumen'
              : name.includes('pst') || name.includes('pelayanan') ? 'Layanan Publik'
                : 'Ruang Kerja';
    const newRoom: OfficeRoom = {
      id: `rm-import-${crypto.randomUUID()}`,
      code,
      name: location.name,
      floor,
      building: matchingAsset?.gedung.trim() || 'Gedung Kantor BPS Minahasa Utara',
      picName: matchingAsset?.penanggungJawab.trim() || 'Belum ditetapkan',
      picNip: '',
      color: '#3b82f6',
      position3D: [12 + (roomIndex % 4) * 4.5, 0.9 + (floor - 1) * 1.6, Math.floor(roomIndex / 4) * 4.5],
      size3D: [3, 1.8, 3],
      description: `Ruangan dibuat otomatis dari lokasi pada file impor aset: ${location.label}.`,
      roomType,
      capacity: 0,
      areaSqm: 0
    };
    newRooms.push(newRoom);
    nextRooms.push(newRoom);
  });

  const linkedAssets = assets.map(asset => {
    const location = parseImportedRoomLocation(asset.ruanganNama);
    const room = findImportedRoom(location, nextRooms);
    if (!room) throw new Error(`Ruangan untuk lokasi "${location.label}" gagal disiapkan.`);
    return {
      ...asset,
      ruanganId: room.id,
      ruanganNama: room.name,
      gedung: room.building,
      penanggungJawab: asset.penanggungJawab.trim() || room.picName
    };
  });

  return { assets: linkedAssets, newRooms };
};
