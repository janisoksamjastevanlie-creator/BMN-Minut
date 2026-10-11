const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function indexed(rows) {
  if (!Array.isArray(rows)) return null;
  const map = new Map();
  for (const row of rows) {
    if (!row || (typeof row.id !== 'string' && typeof row.id !== 'number') || map.has(row.id)) return null;
    map.set(row.id, row);
  }
  return map;
}

function mergeCollection(key, baseRows, localRows, remoteRows) {
  const base = indexed(baseRows);
  const local = indexed(localRows);
  const remote = indexed(remoteRows);
  if (!base || !local || !remote) {
    if (same(remoteRows, baseRows)) return { value: localRows };
    if (same(remoteRows, localRows)) return { value: remoteRows };
    return { conflict: key };
  }

  const locallyChanged = new Set();
  const remotelyChanged = new Set();
  for (const id of new Set([...base.keys(), ...local.keys()])) {
    if (!same(base.get(id), local.get(id))) locallyChanged.add(id);
  }
  for (const id of new Set([...base.keys(), ...remote.keys()])) {
    if (!same(base.get(id), remote.get(id))) remotelyChanged.add(id);
  }

  for (const id of locallyChanged) {
    if (remotelyChanged.has(id) && !same(local.get(id), remote.get(id))) {
      return { conflict: `${key} (${id})` };
    }
  }
  for (const id of locallyChanged) {
    if (!base.has(id) && remote.has(id) && !same(local.get(id), remote.get(id))) {
      return { conflict: `${key} (${id})` };
    }
  }

  const merged = [];
  for (const row of remoteRows) {
    if (!locallyChanged.has(row.id)) {
      merged.push(row);
      continue;
    }
    const localRow = local.get(row.id);
    if (localRow !== undefined) merged.push(localRow);
  }

  const localAdds = localRows.filter(row => !base.has(row.id) && !remote.has(row.id));
  return { value: [...localAdds, ...merged] };
}

export function mergeStateAfterConflict(baseState, localState, remoteState) {
  const mergedState = { ...remoteState };
  const conflicts = [];
  for (const [key, localValue] of Object.entries(localState)) {
    const baseValue = baseState?.[key];
    const remoteValue = remoteState?.[key];
    if (same(localValue, baseValue)) continue;
    const result = mergeCollection(key, baseValue, localValue, remoteValue);
    if (result.conflict) conflicts.push(result.conflict);
    else mergedState[key] = result.value;
  }
  return { mergedState, conflicts };
}
