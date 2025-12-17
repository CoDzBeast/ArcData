import { DISTANCE_BANDS, OVERALL_HIT_WEIGHTS } from './constants.js';
import { clamp, invert01, normalize, safeNum, stddev, weightedAverage } from './utils.js';

export const METRICS = {
  TTK: {
    key: 'TTK',
    label: 'Time to Kill',
    direction: 'lowerBetter',
    getRaw: (row, ctx) => getZoneTTK(row, ctx.zone, ctx.armor, ctx.hitWeights),
    format: (v) => formatSeconds(v),
    normalize: defaultNormalize,
  },
  STK: {
    key: 'STK',
    label: 'Shots to Kill',
    direction: 'lowerBetter',
    getRaw: (row, ctx) => getZoneSTK(row, ctx.zone, ctx.armor, ctx.hitWeights),
    format: (v) => v ?? '-',
    normalize: defaultNormalize,
  },
  Sustain: {
    key: 'Sustain',
    label: 'Sustained DPS',
    direction: 'higherBetter',
    getRaw: (row, ctx) => sustainedDpsApprox(row, ctx),
    format: (v) => (typeof v === 'number' ? v.toFixed(1) : '-'),
    normalize: defaultNormalize,
  },
  Handling: {
    key: 'Handling',
    label: 'Handling',
    direction: 'higherBetter',
    getRaw: handlingIndex,
    format: (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : '-'),
    normalize: defaultNormalize,
  },
  RangeScore: {
    key: 'RangeScore',
    label: 'Range Score',
    direction: 'higherBetter',
    getRaw: (row, ctx) => {
      const range = safeNum(row.Range);
      const max = ctx.categoryMaxRangeMap[row.Category || 'Unknown'] ?? null;
      if (!range || !max) return null;
      return clamp(range / Math.max(max, 1), 0, 1);
    },
    format: (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : '-'),
    normalize: defaultNormalize,
  },
  ReloadPenalty: {
    key: 'ReloadPenalty',
    label: 'Reload Penalty',
    direction: 'lowerBetter',
    getRaw: (row, ctx) => reloadTax(safeNum(row.Reload), getZoneTTK(row, ctx.zone, ctx.armor, ctx.hitWeights)),
    format: (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '-'),
    normalize: defaultNormalize,
  },
  ArmorCons: {
    key: 'ArmorCons',
    label: 'Armor Consistency',
    direction: 'higherBetter',
    getRaw: (row, ctx) => armorConsistency(row, ctx.zone, ctx.hitWeights),
    format: (v) => (typeof v === 'number' ? `${Math.round(v * 100)}%` : '-'),
    normalize: defaultNormalize,
  },
  ArmorBreak: {
    key: 'ArmorBreak',
    label: 'Armor Breakpoint',
    direction: 'lowerBetter',
    getRaw: (row) => armorBreakpoint(row).avgDelta,
    format: (v) => (typeof v === 'number' ? v.toFixed(2) : '-'),
    normalize: defaultNormalize,
  },
  Volatility: {
    key: 'Volatility',
    label: 'TTK Volatility',
    direction: 'lowerBetter',
    getRaw: (row, ctx) => ttkVolatility(row, ctx.zone, ctx.hitWeights),
    format: (v) => (typeof v === 'number' ? v.toFixed(2) : '-'),
    normalize: defaultNormalize,
  },
  ExposureTime: {
    key: 'ExposureTime',
    label: 'Exposure Time',
    direction: 'lowerBetter',
    getRaw: (row, ctx) => {
      const weight = safeNum(row.Weight);
      const agility = safeNum(row.Agility);
      const overallTTK = getZoneTTK(row, 'Overall', ctx.armor, ctx.hitWeights);
      const weightFactor = ctx.weightRange ? normalize(weight, ctx.weightRange.min, ctx.weightRange.max) : null;
      const mobilityCost = (typeof weight === 'number' && typeof agility === 'number' && agility > 0 && typeof overallTTK === 'number')
        ? (weight / agility) * overallTTK
        : null;
      const exposure = (typeof overallTTK === 'number' && typeof weightFactor === 'number')
        ? overallTTK * (1 + weightFactor)
        : null;
      return { exposure, mobilityCost, weightFactor };
    },
    format: (v) => (v && typeof v.exposure === 'number' ? formatSeconds(v.exposure) : '-'),
    normalize: (raw, stats) => {
      if (!raw) return { ExposureTime: null, MobilityCost: null, WeightFactor: null };
      const nExposure = defaultNormalize(raw.exposure, stats.ExposureTime);
      const nMobilityCost = defaultNormalize(raw.mobilityCost, stats.MobilityCost);
      return {
        ExposureTime: nExposure,
        MobilityCost: nMobilityCost,
        WeightFactor: typeof raw.weightFactor === 'number' ? clamp(raw.weightFactor, 0, 1) : null,
      };
    },
  },
  MobilityCost: {
    key: 'MobilityCost',
    label: 'Mobility Cost',
    direction: 'lowerBetter',
    getRaw: (row, ctx) => {
      const exp = METRICS.ExposureTime.getRaw(row, ctx);
      return exp && typeof exp.mobilityCost === 'number' ? exp.mobilityCost : null;
    },
    format: (v) => formatSeconds(v),
    normalize: defaultNormalize,
  },
  KillsPerMag: {
    key: 'KillsPerMag',
    label: 'Kills per Mag',
    direction: 'higherBetter',
    getRaw: (row, ctx) => {
      const mag = safeNum(row.Mag);
      const stk = getZoneSTK(row, ctx.zone, ctx.armor, ctx.hitWeights);
      if (typeof mag !== 'number' || mag <= 0 || typeof stk !== 'number' || stk <= 0) return null;
      return Math.floor(mag / stk);
    },
    format: (v) => (v ?? '-'),
    normalize: defaultNormalize,
  },
  DamagePerCycle: {
    key: 'DamagePerCycle',
    label: 'Damage per Cycle',
    direction: 'higherBetter',
    getRaw: (row, ctx) => {
      const mag = safeNum(row.Mag);
      const dmg = safeNum(row.DMG);
      if (!mag || !dmg || mag <= 0 || dmg <= 0) return null;
      const base = mag * dmg;
      const max = ctx.categoryMaxDpcMap[row.Category || 'Unknown'] ?? null;
      return { raw: base, normBase: max ? clamp(base / Math.max(max, 1), 0, 1) : null };
    },
    format: (v) => {
      if (!v) return '-';
      return `${Math.round(v.raw)}${typeof v.normBase === 'number' ? '' : ''}`;
    },
    normalize: (raw, stats) => {
      if (!raw) return null;
      if (typeof raw.normBase === 'number') return clamp(raw.normBase, 0, 1);
      return defaultNormalize(raw.raw, stats.DamagePerCycle);
    },
  },
  CritLeverage: {
    key: 'CritLeverage',
    label: 'Crit Leverage',
    direction: 'higherBetter',
    getRaw: (row, ctx) => critLeverage(row, ctx.armor),
    format: (v) => (typeof v === 'number' ? `${v.toFixed(2)}s` : '-'),
    normalize: defaultNormalize,
  },
  HeadDep: {
    key: 'HeadDep',
    label: 'Headshot Dependency',
    direction: 'lowerBetter',
    getRaw: (row, ctx) => headshotDependency(row, ctx.armor),
    format: (v) => (typeof v === 'number' ? v.toFixed(2) : '-'),
    normalize: defaultNormalize,
  },
  ArmorPen: {
    key: 'ArmorPen',
    label: 'Armor Pen Delta',
    direction: 'lowerBetter',
    getRaw: (row, ctx) => armorPenEffectiveness(row, ctx.zone, ctx.hitWeights).deltaRatio,
    format: (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '-'),
    normalize: defaultNormalize,
  },
  ArmorPenSeconds: {
    key: 'ArmorPenSeconds',
    label: 'Armor Pen Δs',
    direction: 'lowerBetter',
    getRaw: (row, ctx) => armorPenEffectiveness(row, ctx.zone, ctx.hitWeights).deltaSeconds,
    format: formatSeconds,
    normalize: defaultNormalize,
  },
};

export function computeContext(rows, controls) {
  const { armor, zone } = controls;
  const hitWeights = OVERALL_HIT_WEIGHTS;
  const categoryMaxRangeMap = {};
  const categoryMaxDpcMap = {};
  const weightValues = [];

  rows.forEach((row) => {
    const category = row.Category || 'Unknown';
    const range = safeNum(row.Range);
    if (range) {
      categoryMaxRangeMap[category] = Math.max(categoryMaxRangeMap[category] || 0, range);
    }

    const mag = safeNum(row.Mag);
    const dmg = safeNum(row.DMG);
    if (mag && dmg) {
      const dpc = mag * dmg;
      categoryMaxDpcMap[category] = Math.max(categoryMaxDpcMap[category] || 0, dpc);
    }

    const weight = safeNum(row.Weight);
    if (typeof weight === 'number') weightValues.push(weight);
  });

  const weightRange = weightValues.length
    ? { min: Math.min(...weightValues), max: Math.max(...weightValues) }
    : null;

  return { armor, zone, hitWeights, categoryMaxRangeMap, categoryMaxDpcMap, weightRange };
}

export function computeRawMetrics(row, ctx) {
  const raw = {};
  Object.values(METRICS).forEach((metric) => {
    const val = metric.getRaw(row, ctx);
    if (metric.key === 'ExposureTime' && val && typeof val === 'object') {
      raw.ExposureTime = val.exposure ?? null;
      raw.MobilityCost = val.mobilityCost ?? null;
      raw.WeightFactor = val.weightFactor ?? null;
    } else if (metric.key === 'DamagePerCycle' && val && typeof val === 'object') {
      raw.DamagePerCycle = val.raw;
      raw.DamagePerCycleNormBase = val.normBase;
    } else {
      raw[metric.key] = val ?? null;
    }
  });
  return raw;
}

export function computeStats(rawList) {
  const stats = {};
  Object.values(METRICS).forEach((metric) => {
    if (metric.key === 'ExposureTime' || metric.key === 'MobilityCost') return;
    if (metric.key === 'DamagePerCycle') {
      const vals = rawList.map((r) => r.DamagePerCycle).filter(isFiniteNumber);
      stats.DamagePerCycle = summarize(vals);
      return;
    }
    const vals = rawList.map((r) => r[metric.key]).filter(isFiniteNumber);
    stats[metric.key] = summarize(vals);
  });
  if (!stats.ExposureTime) {
    const exposureVals = rawList.map((r) => r.ExposureTime).filter(isFiniteNumber);
    const mobilityVals = rawList.map((r) => r.MobilityCost).filter(isFiniteNumber);
    stats.ExposureTime = summarize(exposureVals);
    stats.MobilityCost = summarize(mobilityVals);
  }
  return stats;
}

export function computeNormalized(raw, stats) {
  const normalized = {};
  Object.values(METRICS).forEach((metric) => {
    if (metric.key === 'ExposureTime') {
      const result = metric.normalize(raw, stats);
      normalized.ExposureTime = result?.ExposureTime ?? null;
      normalized.MobilityCost = result?.MobilityCost ?? null;
      normalized.WeightFactor = result?.WeightFactor ?? null;
      return;
    }
    if (metric.key === 'MobilityCost' || metric.key === 'DamagePerCycle') {
      // handled via ExposureTime or dedicated branch
      return;
    }
    const stat = stats[metric.key];
    const value = raw[metric.key];
    normalized[metric.key] = metric.normalize(value, stat, { direction: metric.direction });
  });

  // ensure inverted metrics obey direction
  Object.values(METRICS).forEach((metric) => {
    if (metric.key in normalized && metric.direction === 'lowerBetter') {
      const val = normalized[metric.key];
      normalized[metric.key] = typeof val === 'number' ? invert01(val) : val;
    }
  });

  // Clamp
  Object.keys(normalized).forEach((k) => {
    const v = normalized[k];
    normalized[k] = typeof v === 'number' ? clamp(v, 0, 1) : v;
  });

  // Consistency uses inverted Volatility
  if (typeof normalized.Volatility === 'number') {
    normalized.Consistency = normalized.Volatility;
  }

  return normalized;
}

export function computeScore(normalized, weights, registry = METRICS) {
  const weightMap = {
    ttk: 'TTK',
    sustain: 'Sustain',
    handling: 'Handling',
    range: 'RangeScore',
    reload: 'ReloadPenalty',
    armor: 'ArmorCons',
  };

  let weightSum = 0;
  let accum = 0;
  Object.entries(weightMap).forEach(([wKey, mKey]) => {
    const weight = weights[wKey] ?? 0;
    const val = normalized[mKey];
    if (typeof val === 'number' && isFinite(val) && weight > 0) {
      weightSum += weight;
      accum += val * weight;
    }
  });

  if (!weightSum) return { score01: null, score100: null };

  const score01 = clamp(accum / weightSum, 0, 1);
  return { score01, score100: Math.round(score01 * 1000) / 10 };
}

export function validateMetrics(rows, stats, weights) {
  const warnings = [];
  let totalMetrics = 0;
  let okMetrics = 0;
  const missingCounts = {};

  rows.forEach((row) => {
    Object.entries(row.normalized).forEach(([k, v]) => {
      if (v === null || typeof v === 'undefined') {
        missingCounts[k] = (missingCounts[k] || 0) + 1;
        return;
      }
      totalMetrics += 1;
      if (v >= 0 && v <= 1) okMetrics += 1;
    });
  });

  Object.entries(missingCounts).forEach(([key, count]) => {
    if (rows.length && count / rows.length > 0.3) {
      warnings.push(`Metric ${key} missing ${(count / rows.length * 100).toFixed(1)}%`);
    }
  });

  Object.entries(stats).forEach(([key, stat]) => {
    if (!stat) return;
    if (typeof stat.min === 'number' && typeof stat.max === 'number' && stat.max < stat.min) {
      warnings.push(`Stat range invalid for ${key}`);
    }
  });

  const weightSum = Object.values(weights || {}).reduce((a, b) => a + (b || 0), 0);
  if (!weightSum) warnings.push('Weights sum to 0');

  return {
    okText: `Metrics OK: ${okMetrics}/${Math.max(totalMetrics, 1)}`,
    missingText: warnings.join(' | ') || 'All metrics nominal',
  };
}

export function distanceBandScores(rangeMeters, rangeScore, metaScore01) {
  const result = { scores: {}, score01: {} };
  DISTANCE_BANDS.forEach(({ key }) => {
    result.scores[key] = null;
    result.score01[key] = null;
  });

  const hasMetaScore = typeof metaScore01 === 'number' && isFinite(metaScore01);
  const hasRangeScore = typeof rangeScore === 'number' && isFinite(rangeScore);
  const hasRange = typeof rangeMeters === 'number' && isFinite(rangeMeters);

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

export function counterScore({ headDepNorm, armorNorm, reloadNorm, killsPerMagNorm }) {
  const parts = [];
  if (typeof headDepNorm === 'number') parts.push(headDepNorm);
  if (typeof armorNorm === 'number') parts.push(armorNorm);
  if (typeof reloadNorm === 'number') parts.push(reloadNorm);
  if (typeof killsPerMagNorm === 'number') parts.push(killsPerMagNorm);
  if (!parts.length) return { counterScore01: null, counterScore: null };
  const counterScore01 = parts.reduce((a, b) => a + b, 0) / parts.length;
  return { counterScore01, counterScore: Math.round(counterScore01 * 1000) / 10 };
}

export function reloadTax(reload, ttk) {
  const r = safeNum(reload);
  const t = safeNum(ttk);
  if (!r || !t || r < 0 || t < 0) return null;
  const denom = r + t;
  if (!denom) return null;
  return r / denom;
}

export function getZoneTTK(row, zone, armor, hitWeights = OVERALL_HIT_WEIGHTS) {
  if (zone !== 'Overall') return safeNum(row[`${zone} TTK ${armor}`]);
  const h = safeNum(row[`Head TTK ${armor}`]);
  const b = safeNum(row[`Body TTK ${armor}`]);
  const l = safeNum(row[`Leg TTK ${armor}`]);
  return weightedAverage([
    [hitWeights.Head, h],
    [hitWeights.Body, b],
    [hitWeights.Leg, l],
  ]);
}

export function getZoneSTK(row, zone, armor, hitWeights = OVERALL_HIT_WEIGHTS) {
  if (zone !== 'Overall') return safeNum(row[`${zone} STK ${armor}`]);
  const h = safeNum(row[`Head STK ${armor}`]);
  const b = safeNum(row[`Body STK ${armor}`]);
  const l = safeNum(row[`Leg STK ${armor}`]);
  return weightedAverage([
    [hitWeights.Head, h],
    [hitWeights.Body, b],
    [hitWeights.Leg, l],
  ]);
}

export function sustainedDpsApprox(row, ctx) {
  const dmgPerShot = safeNum(row.DMG);
  const mag = safeNum(row.Mag);
  const reload = safeNum(row.Reload);
  const ttk = getZoneTTK(row, ctx.zone, ctx.armor, ctx.hitWeights);
  const stk = getZoneSTK(row, ctx.zone, ctx.armor, ctx.hitWeights);
  if (!dmgPerShot || !mag || mag <= 0 || !reload || reload < 0) return null;
  if (!ttk || ttk <= 0 || !stk || stk <= 1) return null;
  const shotsPerSec = (stk - 1) / ttk;
  if (!isFinite(shotsPerSec) || shotsPerSec <= 0) return null;
  const timeFiring = (mag - 1) / shotsPerSec;
  if (!isFinite(timeFiring) || timeFiring < 0) return null;
  const dmgMag = mag * dmgPerShot;
  return dmgMag / (timeFiring + reload);
}

export function handlingIndex(row) {
  const stab = safeNum(row.Stability) ?? 0;
  const agil = safeNum(row.Agility) ?? 0;
  const stlh = safeNum(row.Stealth) ?? 0;
  return (stab * 0.4) + (agil * 0.4) + (stlh * 0.2);
}

export function armorConsistency(row, zone, hitWeights = OVERALL_HIT_WEIGHTS) {
  if (zone === 'Overall') {
    const ttk0 = getZoneTTK(row, 'Overall', '0', hitWeights);
    const ttkH = getZoneTTK(row, 'Overall', 'H', hitWeights);
    if (!ttk0 || !ttkH) return null;
    const cons = 1 - ((ttkH - ttk0) / ttk0);
    return clamp(cons, 0, 1);
  }
  const ttk0 = safeNum(row[`${zone} TTK 0`]);
  const ttkH = safeNum(row[`${zone} TTK H`]);
  if (!ttk0 || !ttkH) return null;
  const cons = 1 - ((ttkH - ttk0) / ttk0);
  return clamp(cons, 0, 1);
}

export function ttkVolatility(row, zone, hitWeights = OVERALL_HIT_WEIGHTS) {
  if (zone === 'Overall') {
    const arr = [
      getZoneTTK(row, 'Overall', '0', hitWeights),
      getZoneTTK(row, 'Overall', 'L', hitWeights),
      getZoneTTK(row, 'Overall', 'M', hitWeights),
      getZoneTTK(row, 'Overall', 'H', hitWeights),
    ];
    return stddev(arr);
  }
  const arr = [
    safeNum(row[`${zone} TTK 0`]),
    safeNum(row[`${zone} TTK L`]),
    safeNum(row[`${zone} TTK M`]),
    safeNum(row[`${zone} TTK H`]),
  ];
  return stddev(arr);
}

export function armorBreakpoint(row) {
  const ttk0 = safeNum(row['Body TTK 0']);
  const ttkL = safeNum(row['Body TTK L']);
  const ttkM = safeNum(row['Body TTK M']);
  const ttkH = safeNum(row['Body TTK H']);
  if (!ttk0 || !ttkL || !ttkM || !ttkH) {
    return { deltaL: null, deltaM: null, deltaH: null, avgDelta: null };
  }
  const ratio = (v) => (v && ttk0 > 0 ? v / ttk0 : null);
  const deltaL = ratio(ttkL);
  const deltaM = ratio(ttkM);
  const deltaH = ratio(ttkH);
  const deltas = [deltaL, deltaM, deltaH].filter(isFiniteNumber);
  const avgDelta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;
  return { deltaL, deltaM, deltaH, avgDelta };
}

export function armorPenEffectiveness(row, zone, hitWeights = OVERALL_HIT_WEIGHTS) {
  const ttkM = getZoneTTK(row, zone, 'M', hitWeights);
  const ttkH = getZoneTTK(row, zone, 'H', hitWeights);
  if (!ttkM || !ttkH) {
    return { deltaSeconds: null, deltaRatio: null };
  }
  const deltaSeconds = ttkH - ttkM;
  const deltaRatio = ttkM > 0 ? deltaSeconds / ttkM : null;
  return { deltaSeconds, deltaRatio };
}

export function headshotDependency(row, armor) {
  const body = safeNum(row[`Body TTK ${armor}`]);
  const head = safeNum(row[`Head TTK ${armor}`]);
  if (!body || !head || head <= 0) return null;
  return body / head;
}

export function critLeverage(row, armor) {
  const body = safeNum(row[`Body TTK ${armor}`]);
  const head = safeNum(row[`Head TTK ${armor}`]);
  const crit = safeNum(row['Crit Multi']);
  if (!body || !head || !crit) return null;
  return (body - head) * crit;
}

function summarize(values) {
  if (!values.length) return { min: null, max: null };
  return { min: Math.min(...values), max: Math.max(...values) };
}

function isFiniteNumber(v) {
  return typeof v === 'number' && isFinite(v);
}

function defaultNormalize(value, stat) {
  if (!stat || typeof stat.min !== 'number' || typeof stat.max !== 'number') return null;
  if (value === null || typeof value === 'undefined' || !isFiniteNumber(value)) return null;
  const min = stat.min;
  const max = stat.max;
  if (max === min) return 0.5;
  return clamp((value - min) / (max - min), 0, 1);
}

function formatSeconds(v) {
  return typeof v === 'number' ? `${v.toFixed(2)}s` : '-';
}
