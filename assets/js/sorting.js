import { getWeights01 } from './controls.js';

export function updateSortState(lastSort, key) {
  if (lastSort.key === key) {
    lastSort.dir = (lastSort.dir === "asc" ? "desc" : "asc");
  } else {
    lastSort.key = key;
    lastSort.dir = (key === "Name" ? "asc" : "desc");
  }
  return lastSort;
}

export function compareRows(a, b, sort) {
  const dir = (sort.dir === "asc") ? 1 : -1;
  const key = sort.key;

  const av = getSortValue(a, key);
  const bv = getSortValue(b, key);

  if (key === "Name") return (String(av).localeCompare(String(bv))) * dir;

  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;

  return (av - bv) * dir;
}

function getSortValue(row, key) {
  switch(key) {
    case "Name": return row.Name || "";
    case "Score": return row.Score01 ?? null;
    case "TTK": return row.TTK ?? null;
    case "DPS": return row.DPS ?? null;
    case "Sustain": return row.Sustain ?? null;
    case "Reload": return row.Reload ?? null;
    case "Range": return row.Range ?? null;
    case "HeadDep": return row.HeadDep ?? null;
    case "ArmorCons":
    case "Armor": return row.ArmorCons ?? null;
    case "ArmorBP": return row.ArmorBreakpointScore ?? null;
    case "Vol": return row.Vol ?? null;
    default: return row.Score01 ?? null;
  }
}

export function computeScore(weightedMetrics) {
  const wts = getWeights01();
  const score01 =
    ((weightedMetrics.nTTK ?? 0) * wts.ttk) +
    ((weightedMetrics.nSustain ?? 0) * wts.sustain) +
    ((weightedMetrics.nHandling ?? 0) * wts.handling) +
    ((weightedMetrics.nRange ?? 0) * wts.range) +
    ((weightedMetrics.nReload ?? 0) * wts.reload) +
    ((weightedMetrics.nArmor ?? 0) * wts.armor);

  return { score01, score: Math.round(Math.min(Math.max(score01,0),1) * 1000) / 10 };
}
