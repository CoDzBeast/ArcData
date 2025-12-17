export function updateSortState(lastSort, key) {
  if (lastSort.key === key) {
    lastSort.dir = lastSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    lastSort.key = key;
    lastSort.dir = key === 'Name' ? 'asc' : 'desc';
  }
  return lastSort;
}

export function compareRows(a, b, sort) {
  const dir = sort.dir === 'asc' ? 1 : -1;
  const key = sort.key;
  const av = getSortValue(a, key);
  const bv = getSortValue(b, key);
  if (key === 'Name') return String(av).localeCompare(String(bv)) * dir;
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return (av - bv) * dir;
}

function getSortValue(row, key) {
  switch (key) {
    case 'Name': return row.Name || '';
    case 'Score': return row.Score01 ?? null;
    case 'RoleDom': return row.RoleDominanceIndex ?? null;
    case 'OutlierIndex': return row.OutlierIndex ?? null;
    case 'CounterScore': return row.CounterScore01 ?? null;
    case 'TTK': return row.TTK ?? null;
    case 'DPS': return row.DPS ?? null;
    case 'DamagePerCycle': return row.DamagePerCycle ?? null;
    case 'Sustain': return row.Sustain ?? null;
    case 'Engage': return row.EngagementCapacity ?? null;
    case 'Reload': return row.Reload ?? null;
    case 'Handling': return row.Handling ?? null;
    case 'Range': return row.Range ?? null;
    case 'HeadDep': return row.HeadDep ?? null;
    case 'CritLeverage': return row.CritLeverage ?? null;
    case 'ArmorCons':
    case 'Armor': return row.ArmorCons ?? null;
    case 'ArmorPen': return row.ArmorPen ?? null;
    case 'ArmorBP': return row.ArmorBreak ?? null;
    case 'SkillCeiling': return row.SkillCeilingScore01 ?? null;
    case 'SkillFloor': return row.SkillFloorScore01 ?? null;
    case 'Consistency': return row.Consistency ?? null;
    case 'Vol': return row.Volatility ?? null;
    case 'Exposure': return row.ExposureTime ?? null;
    case 'Mobility': return row.MobilityCost ?? null;
    default: return row.Score01 ?? null;
  }
}
