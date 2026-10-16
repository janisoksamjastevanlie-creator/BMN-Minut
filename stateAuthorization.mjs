import { isDeepStrictEqual } from 'node:util';

export function authorizeChangedCollections({
  user,
  state,
  current,
  permissionsByCollection,
  userHasPermission
}) {
  const collections = Object.keys(permissionsByCollection);
  if (!Object.values(current).some(value => value !== null)) return user.role === 'Administrator';

  const changed = collections.filter(key => !isDeepStrictEqual(current[key], state[key]));
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
