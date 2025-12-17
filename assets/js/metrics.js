import { DISTANCE_BANDS, OVERALL_HIT_WEIGHTS } from './constants.js';
import { clamp, safeNum, stddev, normalize, invert01, weightedAverage, percentile } from './utils.js';

export function reloadTax(reload, ttk) {
  const r = safeNum(reload);
  const t = safeNum(ttk);

  if (!r || !t || r < 0 || t < 0) return null;

  const denom = r + t;
  if (!denom) return null;

  return r / denom;
}

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

// Sustained DPS using inferred fire rate from STK/TTK and magazine reload cycle
export function sustainedDpsApprox(d, ttkKey, stkKey, overrideTTK=null, overrideSTK=null) {
  const dmgPerShot = safeNum(d.DMG);
  const mag = safeNum(d.Mag);
  const reload = safeNum(d.Reload);
  const ttk = (overrideTTK !== null) ? overrideTTK : safeNum(d[ttkKey]);
  const stk = (overrideSTK !== null) ? overrideSTK : safeNum(d[stkKey]);

  if (!dmgPerShot || !mag || mag <= 0 || !reload || reload < 0) return null;
  if (!ttk || ttk <= 0 || !stk || stk <= 1) return null;

  const shotsPerSec = (stk - 1) / ttk;
  if (!isFinite(shotsPerSec) || shotsPerSec <= 0) return null;

  const timeFiring = (mag - 1) / shotsPerSec;
  if (!isFinite(timeFiring) || timeFiring < 0) return null;

  const dmgMag = mag * dmgPerShot;
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

export function armorPenEffectiveness(d, zone) {
  const ttkM = getZoneTTK(d, zone, "M");
  const ttkH = getZoneTTK(d, zone, "H");

  if (!ttkM || !ttkH) {
    return { deltaSeconds: null, deltaRatio: null };
  }

  const deltaSeconds = ttkH - ttkM;
  const deltaRatio = (ttkM > 0) ? (deltaSeconds / ttkM) : null;

  return { deltaSeconds, deltaRatio };
}

export function damagePerCycle(d) {
  const mag = safeNum(d.Mag);
  const dmg = safeNum(d.DMG);

  if (!mag || !dmg || mag <= 0 || dmg <= 0) return null;
  return mag * dmg;
}

export function counterScore({ headDepNorm, armorNorm, reloadNorm, killsPerMagNorm }) {
  const parts = [];

  if (typeof headDepNorm === "number" && isFinite(headDepNorm)) {
    parts.push(invert01(headDepNorm));
  }

  if (typeof armorNorm === "number" && isFinite(armorNorm)) {
    parts.push(armorNorm);
  }

  if (typeof reloadNorm === "number" && isFinite(reloadNorm)) {
    parts.push(reloadNorm);
  }

  if (typeof killsPerMagNorm === "number" && isFinite(killsPerMagNorm)) {
    parts.push(killsPerMagNorm);
  }

  if (!parts.length) return { counterScore01: null, counterScore: null };

  const counterScore01 = parts.reduce((a, b) => a + b, 0) / parts.length;
  return { counterScore01, counterScore: Math.round(counterScore01 * 1000) / 10 };
}

export function headshotDependency(d, armor) {
  const body = safeNum(d[`Body TTK ${armor}`]);
  const head = safeNum(d[`Head TTK ${armor}`]);

  if (!body || !head || head <= 0) return null;
  return body / head;
}

export function headshotDependencyStats(list, armor) {
  const values = list
    .map(d => headshotDependency(d, armor))
    .filter(v => typeof v === "number" && isFinite(v));

  if (!values.length) return { min: null, max: null, p75: null };

  return {
    min: Math.min(...values),
    max: Math.max(...values),
    p75: percentile(values, 75)
  };
}

export function critLeverage(d, armor) {
  const body = safeNum(d[`Body TTK ${armor}`]);
  const head = safeNum(d[`Head TTK ${armor}`]);
  const crit = safeNum(d[`Crit Multi`]);

  if (!body || !head || !crit) return null;

  return (body - head) * crit;
}

export function buildRanges(list) {
  const keys = [
    "TTK",
    "Sustain",
    "Handling",
    "RangeScore",
    "Reload",
    "ReloadTax",
    "ArmorCons",
    "ArmorBreakAvg",
    "Vol",
    "KillsPerMag",
    "ExposureTime",
    "MobilityCost"
  ];
  const r = {};
  keys.forEach(k => {
    const vals = list.map(x => x[k]).filter(v => typeof v === "number" && isFinite(v));
    r[k] = vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min: 0, max: 1 };
  });
  return r;
}

export function normalizeMetrics(values, ranges) {
  const nReloadPenalty = invert01(normalize(values.reloadTax, ranges.ReloadTax.min, ranges.ReloadTax.max));
  const nExposure = invert01(normalize(values.exposureTime, ranges.ExposureTime.min, ranges.ExposureTime.max));
  const nMobilityCost = invert01(normalize(values.mobilityCost, ranges.MobilityCost.min, ranges.MobilityCost.max));
  const nKillsPerMag = normalize(values.killsPerMag, ranges.KillsPerMag.min, ranges.KillsPerMag.max);

  return {
    nTTK: invert01(normalize(values.ttk, ranges.TTK.min, ranges.TTK.max)),
    nSustain: normalize(values.sustain, ranges.Sustain.min, ranges.Sustain.max),
    nHandling: normalize(values.handling, ranges.Handling.min, ranges.Handling.max),
    nRange: normalize(values.rangeScore, ranges.RangeScore.min, ranges.RangeScore.max),
    nReload: nReloadPenalty,
    nReloadPenalty,
    nArmor: normalize(values.armorCons, ranges.ArmorCons.min, ranges.ArmorCons.max),
    nArmorBreak: invert01(normalize(values.armorBreakAvg, ranges.ArmorBreakAvg.min, ranges.ArmorBreakAvg.max)),
    nConsistency: invert01(normalize(values.volatility, ranges.Vol.min, ranges.Vol.max)),
    nExposure,
    nMobilityCost,
    nKillsPerMag
  };
}

export function distanceBandScores(rangeMeters, rangeScore, metaScore01) {
  const result = { scores: {}, score01: {} };
  DISTANCE_BANDS.forEach(({ key }) => {
    result.scores[key] = null;
    result.score01[key] = null;
  });

  const hasMetaScore = typeof metaScore01 === "number" && isFinite(metaScore01);
  const hasRangeScore = typeof rangeScore === "number" && isFinite(rangeScore);
  const hasRange = typeof rangeMeters === "number" && isFinite(rangeMeters);

  if (!hasMetaScore || !hasRangeScore) return result;

  const clampedMeta = clamp(metaScore01, 0, 1);
  const clampedRangeScore = clamp(rangeScore, 0, 1);

  const coverageForBand = (band) => {
    if (!hasRange) return 1;

    if (rangeMeters < band.min) {
      return clamp(rangeMeters / Math.max(band.min, 0.0001), 0, 1);
    }

    if (isFinite(band.max) && rangeMeters > band.max) {
      const excess = rangeMeters - band.max;
      const span = Math.max(band.max - band.min, 1);
      return clamp(1 - (excess / span), 0, 1);
    }

    return 1;
  };

  DISTANCE_BANDS.forEach((band) => {
    const coverageWeight = coverageForBand(band);
    const weighted = clampedRangeScore * coverageWeight;
    const score01 = clamp(clampedMeta * weighted, 0, 1);
    result.score01[band.key] = score01;
    result.scores[band.key] = Math.round(score01 * 1000) / 10;
  });

  return result;
}
