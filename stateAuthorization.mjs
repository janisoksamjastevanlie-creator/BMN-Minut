import { isDeepStrictEqual } from 'node:util';

export function resolveRequestUser(profile, userId, users, claims, accessRequired) {
  const currentProfile = Array.isArray(users) ? users.find(user => user.id === userId) : undefined;
  if (Array.isArray(users) && !currentProfile) {
    return { user: null, error: 'Akun tidak lagi terdaftar di sistem.' };
  }
  if (currentProfile?.statusAktif === false || profile.statusAktif === false) {
    return { user: null, error: 'Akun dinonaktifkan.' };
  }

  const user = currentProfile ? { ...profile, ...currentProfile } : { ...profile };
  user.id = userId;
  if (accessRequired) {
    const email = String(user.email || '').trim().toLowerCase();
    const claimEmail = String(claims?.email || '').trim().toLowerCase();
    const matches = Array.isArray(users) ? users.filter(candidate =>
      candidate.statusAktif !== false &&
      String(candidate.email || '').trim().toLowerCase() === claimEmail
    ) : [];
    if (!email || !claimEmail || matches.length !== 1 ||
        matches[0].id !== user.id || email !== claimEmail) {
      return { user: null, error: 'Identitas Cloudflare Access tidak cocok dengan akun aplikasi.' };
    }
  }

  return { user, error: null };
}

export function getChangedCollections(current, next, collections) {
  return collections.filter(key => !isDeepStrictEqual(current[key], next[key]));
}

export function getChangedUserProfiles(previousUsers, nextUsers) {
  const previousById = new Map((previousUsers || []).map(user => [user.id, user]));
  return (nextUsers || []).filter(user => {
    const previous = previousById.get(user.id);
    return !previous || JSON.stringify(previous) !== JSON.stringify(user);
  });
}

// Restores hidden fields exactly as stored: absent fields stay absent (an `undefined`
// property breaks isDeepStrictEqual) and key order follows the stored row so that
// JSON.stringify-based workflow checks treat untouched rows as unchanged.
function restoreStoredFields(row, stored, fields) {
  for (const field of fields) {
    if (Object.hasOwn(stored, field)) row[field] = stored[field];
    else delete row[field];
  }
  const order = new Map(Object.keys(stored).map((key, index) => [key, index]));
  const entries = Object.entries(row).sort(([a], [b]) =>
    (order.get(a) ?? order.size) - (order.get(b) ?? order.size));
  for (const [key] of entries) delete row[key];
  for (const [key, value] of entries) row[key] = value;
}

export function restoreRestrictedFinancialData(next, current) {
  const preserve = (collection, idField, fields) => {
    const previousById = new Map((current[collection] || []).map(row => [row[idField], row]));
    for (const row of next[collection] || []) {
      const previous = previousById.get(row[idField]);
      if (!previous) continue;
      restoreStoredFields(row, previous, fields);
    }
  };
  preserve('inventoryItems', 'id', ['hargaSatuan', 'totalNilai']);
  preserve('stockInList', 'id', ['hargaSatuan', 'totalHarga']);
  const documents = new Map((current.documents || []).map(row => [row.id, row]));
  for (const document of next.documents || []) {
    const previous = documents.get(document.id);
    if (!previous) continue;
    const receiptItems = new Map((previous.items || []).map(item => [item.id, item]));
    for (const item of document.items || []) {
      const old = receiptItems.get(item.id);
      if (!old) continue;
      restoreStoredFields(item, old, ['hargaSatuan', 'totalHarga', 'subtotal']);
    }
    restoreStoredFields(document, previous, ['totalNilaiNota']);
  }
}

export function authorizeChangedCollections({
  user,
  state,
  current,
  permissionsByCollection,
  userHasPermission
}) {
  const collections = Object.keys(permissionsByCollection);
  if (!Object.values(current).some(value => value !== null)) return user.role === 'Administrator';

  const changed = getChangedCollections(current, state, collections);
  for (const key of changed) {
    if (key === 'notifications' || user.role === 'Administrator') continue;
    if (key === 'roles') return false;
    if (key === 'users') {
      if (!userHasPermission(user, 'manageUsers', current)) return false;
      const previousUsers = current.users || [];
      const nextUsers = state.users || [];
      const previousAdminIds = previousUsers.filter(item => item.role === 'Administrator').map(item => item.id);
      if (previousAdminIds.some(id => !nextUsers.some(item => item.id === id && item.role === 'Administrator'))) return false;
      for (const item of nextUsers) {
        const previous = previousUsers.find(existing => existing.id === item.id);
        if ((!previous && item.role === 'Administrator') ||
            (previous && previous.role !== item.role) ||
            (previous?.role === 'Administrator' && !isDeepStrictEqual(previous, item))) {
          return false;
        }
      }
      continue;
    }
    if (key === 'auditLogs') {
      const previousLogs = current.auditLogs || [];
      const nextLogs = state.auditLogs || [];
      if (!userHasPermission(user, 'systemSettings', current) &&
          previousLogs.some(log => !isDeepStrictEqual(nextLogs.find(item => item.id === log.id), log))) {
        return false;
      }
      continue;
    }
    const permissions = permissionsByCollection[key];
    if (permissions === null) continue;
    if (!permissions?.some(permission => userHasPermission(user, permission, current))) return false;
  }
  return true;
}
