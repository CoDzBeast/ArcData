import { OVERALL_HIT_WEIGHTS } from './constants.js';
import { clamp, safeNum, stddev, normalize, invert01, weightedAverage } from './utils.js';

export function getZoneTTK(d, zone, armor) {
  if (zone !== "Overall") return safeNum(d[`${zone} TTK ${armor}`]);

  const h = safeNum(d[`Head TTK ${armor}`]);
  const b = safeNum(d[`Body TTK ${armor}`]);
  const l = safeNum(d[`Leg TTK ${armor}`]);

  return weightedAverage([
    [OVERALL_HIT_WEIGHTS.Head, h],
    [OVERALL_HIT_WEIGHTS.Body, b],
    [OVERALL_HIT_WEIGHTS.Leg,  l]
  ]);
}

export function getZoneSTK(d, zone, armor) {
  if (zone !== "Overall") return safeNum(d[`${zone} STK ${armor}`]);

  const h = safeNum(d[`Head STK ${armor}`]);
  const b = safeNum(d[`Body STK ${armor}`]);
  const l = safeNum(d[`Leg STK ${armor}`]);

  return weightedAverage([
    [OVERALL_HIT_WEIGHTS.Head, h],
    [OVERALL_HIT_WEIGHTS.Body, b],
    [OVERALL_HIT_WEIGHTS.Leg,  l]
  ]);
}

// Approx sustained DPS (supports Overall by passing computed ttk/stk via fallback branch)
export function sustainedDpsApprox(d, ttkKey, stkKey, overrideTTK=null, overrideSTK=null) {
  const DPS = safeNum(d.DPS);
  const ttk = (overrideTTK !== null) ? overrideTTK : safeNum(d[ttkKey]);
  const stk = (overrideSTK !== null) ? overrideSTK : safeNum(d[stkKey]);
  const mag = safeNum(d.Mag);
  const reload = safeNum(d.Reload);

  if (!DPS || !reload || !mag) return null;
  if (!ttk || !stk || stk <= 1) {
    const spsFallback = 10;
    const timeFiring = (mag - 1) / spsFallback;
    if (!isFinite(timeFiring) || timeFiring <= 0) return null;
    const dmgMag = DPS * timeFiring;
    return dmgMag / (timeFiring + reload);
  }

  const sps = (stk - 1) / ttk;
  if (!isFinite(sps) || sps <= 0) return null;

  const timeFiring = (mag - 1) / sps;
  if (!isFinite(timeFiring) || timeFiring <= 0) return null;

  const dmgMag = DPS * timeFiring;
  return dmgMag / (timeFiring + reload);
}

export function handlingIndex(d) {
  const stab = safeNum(d.Stability) ?? 0;
  const agil = safeNum(d.Agility) ?? 0;
  const stlh = safeNum(d.Stealth) ?? 0;
  return (stab * 0.4) + (agil * 0.4) + (stlh * 0.2);
}

export function armorConsistency(d, zone) {
  if (zone === "Overall") {
    const ttk0 = getZoneTTK(d, "Overall", "0");
    const ttkH = getZoneTTK(d, "Overall", "H");
    if (!ttk0 || !ttkH) return null;
    const cons = 1 - ((ttkH - ttk0) / ttk0);
    return clamp(cons, 0, 1);
  }

  const ttk0 = safeNum(d[`${zone} TTK 0`]);
  const ttkH = safeNum(d[`${zone} TTK H`]);
  if (!ttk0 || !ttkH) return null;
  const cons = 1 - ((ttkH - ttk0) / ttk0);
  return clamp(cons, 0, 1);
}

export function ttkVolatility(d, zone) {
  if (zone === "Overall") {
    const arr = [
      getZoneTTK(d, "Overall", "0"),
      getZoneTTK(d, "Overall", "L"),
      getZoneTTK(d, "Overall", "M"),
      getZoneTTK(d, "Overall", "H"),
    ];
    return stddev(arr);
  }

  const arr = [
    safeNum(d[`${zone} TTK 0`]),
    safeNum(d[`${zone} TTK L`]),
    safeNum(d[`${zone} TTK M`]),
    safeNum(d[`${zone} TTK H`]),
  ];
  return stddev(arr);
}

export function armorBreakpoint(d) {
  const ttk0 = safeNum(d["Body TTK 0"]);
  const ttkL = safeNum(d["Body TTK L"]);
  const ttkM = safeNum(d["Body TTK M"]);
  const ttkH = safeNum(d["Body TTK H"]);

  if (!ttk0 || !ttkL || !ttkM || !ttkH) {
    return { deltaL: null, deltaM: null, deltaH: null, avgDelta: null };
  }

  const ratio = (v) => (v && ttk0 > 0) ? (v / ttk0) : null;
  const deltaL = ratio(ttkL);
  const deltaM = ratio(ttkM);
  const deltaH = ratio(ttkH);

  const deltas = [deltaL, deltaM, deltaH].filter(v => typeof v === "number" && isFinite(v));
  const avgDelta = deltas.length ? (deltas.reduce((a,b)=>a+b,0) / deltas.length) : null;

  return { deltaL, deltaM, deltaH, avgDelta };
}

export function buildRanges(list) {
  const keys = ["TTK","Sustain","Handling","RangeScore","Reload","ArmorCons","ArmorBreakAvg"];
  const r = {};
  keys.forEach(k => {
    const vals = list.map(x => x[k]).filter(v => typeof v === "number" && isFinite(v));
    r[k] = vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min: 0, max: 1 };
  });
  return r;
}

export function normalizeMetrics(values, ranges) {
  return {
    nTTK: invert01(normalize(values.ttk, ranges.TTK.min, ranges.TTK.max)),
    nSustain: normalize(values.sustain, ranges.Sustain.min, ranges.Sustain.max),
    nHandling: normalize(values.handling, ranges.Handling.min, ranges.Handling.max),
    nRange: normalize(values.rangeScore, ranges.RangeScore.min, ranges.RangeScore.max),
    nReload: invert01(normalize(values.reload, ranges.Reload.min, ranges.Reload.max)),
    nArmor: normalize(values.armorCons, ranges.ArmorCons.min, ranges.ArmorCons.max),
    nArmorBreak: invert01(normalize(values.armorBreakAvg, ranges.ArmorBreakAvg.min, ranges.ArmorBreakAvg.max))
  };
}
