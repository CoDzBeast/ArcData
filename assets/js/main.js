import { loadWeaponData } from './dataLoader.js';
import { setStatus, initSelectors, bindSortHeaders, bindAccordion, bindControls, applyPresetWeights, syncWeightOutputs, getControlState, getWeights01 } from './controls.js';
import { renderChart, renderTable, renderDetailPanel } from './rendering.js';
import { compareRows, updateSortState, computeScore } from './sorting.js';
import { getZoneTTK, getZoneSTK, sustainedDpsApprox, handlingIndex, armorConsistency, ttkVolatility, armorBreakpoint, buildRanges, normalizeMetrics, headshotDependency, headshotDependencyStats, reloadTax, damagePerCycle, armorPenEffectiveness, critLeverage, distanceBandScores, counterScore } from './metrics.js';
import { safeNum, escapeHtml, normalize, invert01, stddev } from './utils.js';

let rawData = [], chart;
let lastSort = { key: "Score", dir: "desc" };
let roleDominanceByName = {};
let outlierByName = {};
let counterByName = {};

init();

function init() {
  bindAccordion();
  bindControls(updateUI);
  bindSortHeaders((key) => { lastSort = updateSortState(lastSort, key); updateUI(); });

  applyPresetWeights(true);
  syncWeightOutputs();

  loadWeaponData()
    .then((data) => {
      rawData = data;
      initSelectors(rawData);
      updateUI();
    })
    .catch((err) => {
      console.error("Error loading CSV:", err);
      document.querySelector('.main').innerHTML =
        `<div class="card"><h3 style="color:red">Error: Could not load data</h3>
          <p>Make sure the file is in your GitHub repo and named exactly <b>\"arc_raiders_final.csv\"</b>.</p></div>`;
      setStatus('Error');
    });
}

function updateUI() {
  if (!rawData.length) { setStatus("No data"); return; }

  const { armor, zone, cat, search, chartMetric } = getControlState();

  const ttkKey = `${zone} TTK ${armor}`;
  const stkKey = `${zone} STK ${armor}`;

  const headshotStats = headshotDependencyStats(rawData, armor);

  const filtered = rawData.filter(d => {
    const matchCat = (cat === 'All' || d.Category === cat);
    const matchSearch = (d.Name || "").toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  const maxRangeByCat = {};
  const maxDmgCycleByCat = {};
  const armorPenStatsByCat = {};
  const handlingValues = rawData
    .map(handlingIndex)
    .filter(v => typeof v === "number" && isFinite(v));
  const handlingRange = handlingValues.length
    ? { min: Math.min(...handlingValues), max: Math.max(...handlingValues) }
    : { min: 0, max: 1 };
  const critLeverageValues = rawData
    .map(d => critLeverage(d, armor))
    .filter(v => typeof v === "number" && isFinite(v));
  const critLeverageRange = critLeverageValues.length
    ? { min: Math.min(...critLeverageValues), max: Math.max(...critLeverageValues) }
    : { min: 0, max: 1 };
  const weightValues = rawData
    .map(d => safeNum(d.Weight))
    .filter(v => typeof v === "number" && isFinite(v));
  const weightRange = weightValues.length
    ? { min: Math.min(...weightValues), max: Math.max(...weightValues) }
    : { min: 0, max: 1 };
  rawData.forEach(d => {
    const c = d.Category || "Unknown";

    const r = safeNum(d.Range);
    if (r) {
      maxRangeByCat[c] = Math.max(maxRangeByCat[c] || 0, r);
    }

    const dpc = damagePerCycle(d);
    if (typeof dpc === "number" && isFinite(dpc)) {
      maxDmgCycleByCat[c] = Math.max(maxDmgCycleByCat[c] || 0, dpc);
    }

    const ap = armorPenEffectiveness(d, zone);
    if (typeof ap.deltaRatio === "number" && isFinite(ap.deltaRatio)) {
      const current = armorPenStatsByCat[c] || { min: ap.deltaRatio, max: ap.deltaRatio };
      current.min = Math.min(current.min, ap.deltaRatio);
      current.max = Math.max(current.max, ap.deltaRatio);
      armorPenStatsByCat[c] = current;
    }
  });

  const computed = filtered.map(d => {
    const category = d.Category || "Unknown";
    const range = safeNum(d.Range);
    const rangeScore = (range && maxRangeByCat[category]) ? (range / maxRangeByCat[category]) : null;
    const dmgPerCycle = damagePerCycle(d);
    const dmgPerCycleNorm = (typeof dmgPerCycle === "number" && maxDmgCycleByCat[category])
      ? dmgPerCycle / maxDmgCycleByCat[category]
      : null;

    const ttk = getZoneTTK(d, zone, armor);
    const stk = getZoneSTK(d, zone, armor);
    const overallTTK = getZoneTTK(d, "Overall", armor);
    const reload = safeNum(d.Reload);
    const mag = safeNum(d.Mag);
    const reloadTaxVal = reloadTax(reload, ttk);
    const weight = safeNum(d.Weight);
    const agility = safeNum(d.Agility);
    const weightFactor = (typeof weight === "number")
      ? normalize(weight, weightRange.min, weightRange.max)
      : null;
    const exposureTime = (typeof overallTTK === "number" && typeof weightFactor === "number")
      ? overallTTK * (1 + weightFactor)
      : null;
    const mobilityCost = (typeof weight === "number" && typeof agility === "number" && agility > 0 && typeof overallTTK === "number")
      ? (weight / agility) * overallTTK
      : null;

    const engagementsPerMag = (typeof mag === "number" && mag > 0 && typeof stk === "number" && stk > 0)
      ? Math.floor(mag / stk)
      : null;
    const reloadEveryKill = (typeof engagementsPerMag === "number") ? engagementsPerMag <= 1 : null;

    const sustain = (zone === "Overall")
      ? sustainedDpsApprox(d, null, null, ttk, stk)
      : sustainedDpsApprox(d, ttkKey, stkKey);

    const handling = handlingIndex(d);
    const handlingNorm = (typeof handling === "number")
      ? normalize(handling, handlingRange.min, handlingRange.max)
      : null;
    const armorCons = armorConsistency(d, zone);
    const vol = ttkVolatility(d, zone);
    const armorBreak = armorBreakpoint(d);
    const armorPen = armorPenEffectiveness(d, zone);
    const armorPenNorm = (typeof armorPen.deltaRatio === "number" && armorPenStatsByCat[category])
      ? invert01(normalize(armorPen.deltaRatio, armorPenStatsByCat[category].min, armorPenStatsByCat[category].max))
      : null;
    const critLev = critLeverage(d, armor);
    const critLevNorm = (typeof critLev === "number")
      ? normalize(critLev, critLeverageRange.min, critLeverageRange.max)
      : null;
    const headDep = headshotDependency(d, armor);
    const headDepNorm = (typeof headshotStats.min === "number" && typeof headshotStats.max === "number")
      ? normalize(headDep, headshotStats.min, headshotStats.max)
      : null;
    const headDepHigh = (typeof headDep === "number" && typeof headshotStats.p75 === "number") ? headDep > headshotStats.p75 : false;

    return {
      ...d,
      Category: category,
      RangeScore: rangeScore,
      TTK: ttk,
      STK: stk,
      Reload: reload,
      ReloadTax: reloadTaxVal,
      KillsPerMag: engagementsPerMag,
      EngagementCapacity: engagementsPerMag,
      ReloadEveryKill: reloadEveryKill,
      Sustain: sustain,
      Handling: handling,
      HandlingIndex: handling,
      HandlingIndexNorm: handlingNorm,
      ArmorCons: armorCons,
      Vol: vol,
      WeightFactor: weightFactor,
      ExposureTime: exposureTime,
      MobilityCost: mobilityCost,
      DamagePerCycle: dmgPerCycle,
      DamagePerCycleNorm: dmgPerCycleNorm,
      CritLeverage: critLev,
      CritLeverageNorm: critLevNorm,
      HeadDep: headDep,
      HeadDepNorm: headDepNorm,
      HeadDepHigh: headDepHigh,
      ArmorBreakAvg: armorBreak.avgDelta,
      ArmorBreakDeltas: armorBreak,
      ArmorPenDelta: armorPen.deltaRatio,
      ArmorPenDeltaSeconds: armorPen.deltaSeconds,
      ArmorPenScore: armorPenNorm
    };
  });

  const ranges = buildRanges(computed);
  ranges.Handling = handlingRange;

  const scored = computed.map(d => {
    const normalized = normalizeMetrics({
      ttk: d.TTK,
      sustain: d.Sustain,
      handling: d.Handling,
      rangeScore: d.RangeScore,
      reload: d.Reload,
      reloadTax: d.ReloadTax,
      armorCons: d.ArmorCons,
      armorBreakAvg: d.ArmorBreakAvg,
      volatility: d.Vol,
      killsPerMag: d.KillsPerMag,
      exposureTime: d.ExposureTime,
      mobilityCost: d.MobilityCost
    }, ranges);

    const { score, score01 } = computeScore(normalized);
    const bandScores = distanceBandScores(d.Range, d.RangeScore, score01);

    const headshotFloor = invert01(d.HeadDepNorm);
    const killsPerMagNorm = normalize(d.KillsPerMag, ranges.KillsPerMag.min, ranges.KillsPerMag.max);
    const skillFloorParts = [headshotFloor, normalized.nConsistency, killsPerMagNorm]
      .filter(v => typeof v === "number" && isFinite(v));
    const skillFloor01 = skillFloorParts.length
      ? (skillFloorParts.reduce((a, b) => a + b, 0) / skillFloorParts.length)
      : null;
    const skillCeilParts = [d.CritLeverageNorm, d.HandlingIndexNorm, d.HeadDepNorm]
      .filter(v => typeof v === "number" && isFinite(v));
    const skillCeiling01 = skillCeilParts.length
      ? (skillCeilParts.reduce((a, b) => a + b, 0) / skillCeilParts.length)
      : null;
    const counter = counterScore({
      headDepNorm: d.HeadDepNorm,
      armorNorm: normalized.nArmor,
      reloadNorm: normalized.nReloadPenalty,
      killsPerMagNorm: normalized.nKillsPerMag
    });

    return {
      ...d,
      ...normalized,
      ConsistencyScore: normalized.nConsistency,
      ArmorBreakpointScore: normalized.nArmorBreak,
      ExposureTimeNorm: normalized.nExposure,
      MobilityCostNorm: normalized.nMobilityCost,
      KillsPerMagNorm: normalized.nKillsPerMag,
      SkillFloorScore01: skillFloor01,
      SkillFloorScore: typeof skillFloor01 === "number" ? Math.round(skillFloor01 * 1000) / 10 : null,
      SkillCeilingScore01: skillCeiling01,
      SkillCeilingScore: typeof skillCeiling01 === "number" ? Math.round(skillCeiling01 * 1000) / 10 : null,
      CounterScore01: counter.counterScore01,
      CounterScore: counter.counterScore,
      Score: score,
      Score01: score01,
      DistanceBandScores: bandScores.scores,
      DistanceBandScore01: bandScores.score01
    };
  });

  applyRoleDominance(scored);
  applyCounterRank(scored);
  const scoredWithOutliers = applyOutlierIndex(scored);

  outlierByName = scoredWithOutliers.reduce((acc, weapon) => {
    acc[weapon.Name] = {
      index: weapon.OutlierIndex,
      warning: weapon.OutlierWarning,
      categoryAverage: weapon.CategoryAverageScore
    };
    return acc;
  }, {});
  counterByName = scoredWithOutliers.reduce((acc, weapon) => {
    acc[weapon.Name] = {
      score: weapon.CounterScore,
      rank: weapon.CounterRank,
      top: weapon.CounterTop10
    };
    return acc;
  }, {});
  roleDominanceByName = scoredWithOutliers.reduce((acc, weapon) => {
    acc[weapon.Name] = {
      index: weapon.RoleDominanceIndex,
      top: weapon.RoleDominanceTop10
    };
    return acc;
  }, {});

  scoredWithOutliers.sort((a, b) => compareRows(a, b, lastSort));

  setStatus(`Showing ${scoredWithOutliers.length} of ${rawData.length}`);
  updateChartTitle(zone, armor, chartMetric);

  chart = renderChart(scoredWithOutliers, chartMetric, chart);
  renderTable(scoredWithOutliers, (name) => showDetails(name));
}

function showDetails(name) {
  const { armor, zone } = getControlState();

  const headshotStats = headshotDependencyStats(rawData, armor);
  const critLeverageValues = rawData
    .map(d => critLeverage(d, armor))
    .filter(v => typeof v === "number" && isFinite(v));
  const critLeverageRange = critLeverageValues.length
    ? { min: Math.min(...critLeverageValues), max: Math.max(...critLeverageValues) }
    : { min: 0, max: 1 };
  const handlingValues = rawData
    .map(handlingIndex)
    .filter(v => typeof v === "number" && isFinite(v));
  const handlingRange = handlingValues.length
    ? { min: Math.min(...handlingValues), max: Math.max(...handlingValues) }
    : { min: 0, max: 1 };

  const d = rawData.find(w => w.Name === name);
  if (!d) return;

  const category = d.Category || "Unknown";

  const ttk = getZoneTTK(d, zone, armor);
  const stk = getZoneSTK(d, zone, armor);
  const overallTTK = getZoneTTK(d, "Overall", armor);
  const reload = safeNum(d.Reload);
  const mag = safeNum(d.Mag);
  const range = safeNum(d.Range);
  const DPS = safeNum(d.DPS);
  const dmgPerCycle = damagePerCycle(d);
  const armorPen = armorPenEffectiveness(d, zone);
  const reloadTaxVal = reloadTax(reload, ttk);
  const weight = safeNum(d.Weight);
  const agility = safeNum(d.Agility);
  const weightFactor = (typeof weight === "number")
    ? normalize(weight, weightRange.min, weightRange.max)
    : null;
  const exposureTime = (typeof overallTTK === "number" && typeof weightFactor === "number")
    ? overallTTK * (1 + weightFactor)
    : null;
  const mobilityCost = (typeof weight === "number" && typeof agility === "number" && agility > 0 && typeof overallTTK === "number")
    ? (weight / agility) * overallTTK
    : null;

  const engagementsPerMag = (typeof mag === "number" && mag > 0 && typeof stk === "number" && stk > 0)
    ? Math.floor(mag / stk)
    : null;
  const reloadEveryKill = (typeof engagementsPerMag === "number") ? engagementsPerMag <= 1 : null;
  const killsPerMag = engagementsPerMag;

  const handling = handlingIndex(d);
  const handlingNorm = (typeof handling === "number")
    ? normalize(handling, handlingRange.min, handlingRange.max)
    : null;
  const armorCons = armorConsistency(d, zone);
  const armorBreak = armorBreakpoint(d);
  const vol = ttkVolatility(d, zone);
  const critLev = critLeverage(d, armor);
  const critLevNorm = (typeof critLev === "number")
    ? normalize(critLev, critLeverageRange.min, critLeverageRange.max)
    : null;
  const headDep = headshotDependency(d, armor);
  const headDepNorm = (typeof headshotStats.min === "number" && typeof headshotStats.max === "number")
    ? normalize(headDep, headshotStats.min, headshotStats.max)
    : null;
  const headDepHigh = (typeof headDep === "number" && typeof headshotStats.p75 === "number") ? headDep > headshotStats.p75 : false;

  const ttkKey = `${zone} TTK ${armor}`;
  const stkKey = `${zone} STK ${armor}`;
  const sustain = (zone === "Overall")
    ? sustainedDpsApprox(d, null, null, ttk, stk)
    : sustainedDpsApprox(d, ttkKey, stkKey);

  const maxRange = Math.max(...rawData
    .filter(x => (x.Category||"Unknown")===category)
    .map(x => safeNum(x.Range) || 0)
  );
  const rangeScore = (range && maxRange) ? (range / maxRange) : null;
  const dmgCycleValues = rawData
    .filter(x => (x.Category || "Unknown") === category)
    .map(x => damagePerCycle(x))
    .filter(v => typeof v === "number" && isFinite(v));
  const maxDmgCycle = dmgCycleValues.length ? Math.max(...dmgCycleValues) : null;
  const dmgPerCycleNorm = (typeof dmgPerCycle === "number" && typeof maxDmgCycle === "number" && maxDmgCycle > 0)
    ? dmgPerCycle / maxDmgCycle
    : null;
  const armorPenValues = rawData
    .filter(x => (x.Category || "Unknown") === category)
    .map(x => armorPenEffectiveness(x, zone).deltaRatio)
    .filter(v => typeof v === "number" && isFinite(v));
  const armorPenRange = armorPenValues.length
    ? { min: Math.min(...armorPenValues), max: Math.max(...armorPenValues) }
    : null;
  const armorPenNorm = (typeof armorPen.deltaRatio === "number" && armorPenRange)
    ? invert01(normalize(armorPen.deltaRatio, armorPenRange.min, armorPenRange.max))
    : null;

  const dominance = roleDominanceByName[d.Name] || {};
  const dominanceTxt = (typeof dominance.index === "number") ? `${dominance.index.toFixed(1)}%` : "-";
  const dominanceBadge = dominance.top ? "🏆 Top 10%" : "";
  const outlierInfo = outlierByName[d.Name] || {};
  const outlierTxt = (typeof outlierInfo.index === "number") ? `${outlierInfo.index.toFixed(2)}σ` : "-";
  const outlierBadge = outlierInfo.warning ? "⚠️ Above Cat Avg" : "";
  const outlierAvgTxt = (typeof outlierInfo.categoryAverage === "number") ? outlierInfo.categoryAverage.toFixed(1) : "-";
  const counterInfo = counterByName[d.Name] || {};
  const counterScoreTxt = (typeof counter.counterScore === "number")
    ? counter.counterScore.toFixed(1)
    : (typeof counterInfo.score === "number" ? counterInfo.score.toFixed(1) : "-");
  const counterRankTxt = (typeof counterInfo.rank === "number") ? `${counterInfo.rank.toFixed(1)}%` : "-";
  const counterBadge = counterInfo.top ? "🛡️ Meta Counter" : "";

  const whole = rawData.map(w => {
    const c = w.Category || "Unknown";
    const maxR = Math.max(...rawData.filter(x => (x.Category||"Unknown")===c).map(x => safeNum(x.Range) || 0));

    const wTTK = (zone === "Overall") ? getZoneTTK(w, "Overall", armor) : safeNum(w[ttkKey]);
    const wSTK = (zone === "Overall") ? getZoneSTK(w, "Overall", armor) : safeNum(w[stkKey]);
    const wReload = safeNum(w.Reload);
    const wReloadTax = reloadTax(wReload, wTTK);
    const wWeight = safeNum(w.Weight);
    const wAgility = safeNum(w.Agility);
    const wWeightFactor = (typeof wWeight === "number")
      ? normalize(wWeight, weightRange.min, weightRange.max)
      : null;
    const wOverallTTK = getZoneTTK(w, "Overall", armor);
    const wExposureTime = (typeof wOverallTTK === "number" && typeof wWeightFactor === "number")
      ? wOverallTTK * (1 + wWeightFactor)
      : null;
    const wMobilityCost = (typeof wWeight === "number" && typeof wAgility === "number" && wAgility > 0 && typeof wOverallTTK === "number")
      ? (wWeight / wAgility) * wOverallTTK
      : null;

    const wSustain = (zone === "Overall")
      ? sustainedDpsApprox(w, null, null, wTTK, wSTK)
      : sustainedDpsApprox(w, ttkKey, stkKey);

    const wKillsPerMag = (typeof wMag === "number" && wMag > 0 && typeof wSTK === "number" && wSTK > 0)
      ? Math.floor(wMag / wSTK)
      : null;

    return {
      TTK: wTTK,
      Reload: wReload,
      ReloadTax: wReloadTax,
      Sustain: wSustain,
      Handling: handlingIndex(w),
      ArmorCons: armorConsistency(w, zone),
      ArmorBreakAvg: armorBreakpoint(w).avgDelta,
      RangeScore: (safeNum(w.Range) && maxR) ? (safeNum(w.Range)/maxR) : null,
      Vol: ttkVolatility(w, zone),
      ExposureTime: wExposureTime,
      MobilityCost: wMobilityCost,
      KillsPerMag: wKillsPerMag
    };
  });

  const ranges = buildRanges(whole.map(x => ({
    TTK: x.TTK,
    Sustain: x.Sustain,
    Handling: x.Handling,
    RangeScore: x.RangeScore,
    Reload: x.Reload,
    ReloadTax: x.ReloadTax,
    ArmorCons: x.ArmorCons,
    ArmorBreakAvg: x.ArmorBreakAvg,
    Vol: x.Vol,
    ExposureTime: x.ExposureTime,
    MobilityCost: x.MobilityCost,
    KillsPerMag: x.KillsPerMag
  })));

  const normalized = normalizeMetrics({
    ttk,
    sustain,
    handling,
    rangeScore,
    reload,
    reloadTax: reloadTaxVal,
    armorCons,
    armorBreakAvg: armorBreak.avgDelta,
    volatility: vol,
    killsPerMag,
    exposureTime,
    mobilityCost
  }, ranges);

  const { score, score01 } = computeScore(normalized);
  const bandScores = distanceBandScores(range, rangeScore, score01);

  const counter = counterScore({
    headDepNorm,
    armorNorm: normalized.nArmor,
    reloadNorm: normalized.nReloadPenalty,
    killsPerMagNorm: normalized.nKillsPerMag
  });

  const headshotFloor = invert01(headDepNorm);
  const killsPerMagNorm = normalize(killsPerMag, ranges.KillsPerMag.min, ranges.KillsPerMag.max);
  const skillFloorParts = [headshotFloor, normalized.nConsistency, killsPerMagNorm]
    .filter(v => typeof v === "number" && isFinite(v));
  const skillFloor01 = skillFloorParts.length
    ? (skillFloorParts.reduce((a, b) => a + b, 0) / skillFloorParts.length)
    : null;
  const skillCeilingParts = [critLevNorm, handlingNorm, headDepNorm]
    .filter(v => typeof v === "number" && isFinite(v));
  const skillCeiling01 = skillCeilingParts.length
    ? (skillCeilingParts.reduce((a, b) => a + b, 0) / skillCeilingParts.length)
    : null;

  const firingMode = d['Firing Mode'] || 'N/A';
  const armorPenAttr = d['Armor Pen'] || 'N/A';
  const crit = d['Crit Multi'] || '1.0';
  const sell = d.Sell ? `$${Number(d.Sell).toLocaleString()}` : '$0';

  const armorBreakRows = [
    ["ΔL", armorBreak.deltaL],
    ["ΔM", armorBreak.deltaM],
    ["ΔH", armorBreak.deltaH],
    ["Avg", armorBreak.avgDelta]
  ].map(([label,val]) => `<div class="kv"><b>${label}</b><span>${typeof val === "number" ? val.toFixed(2) : '-'}</span></div>`).join("");
  const exposureTxt = exposureTime ? exposureTime.toFixed(2) + "s" : "-";
  const exposureNormTxt = (typeof normalized.nExposure === "number") ? Math.round(normalized.nExposure * 100) / 100 : "-";
  const mobilityCostTxt = (typeof mobilityCost === "number") ? mobilityCost.toFixed(2) + "s" : "-";
  const mobilityCostNormTxt = (typeof normalized.nMobilityCost === "number") ? Math.round(normalized.nMobilityCost * 100) / 100 : "-";
  const weightFactorTxt = (typeof weightFactor === "number") ? Math.round(weightFactor * 100) / 100 : "-";
  const armorPenDeltaTxt = (typeof armorPen.deltaRatio === "number") ? `${(armorPen.deltaRatio * 100).toFixed(1)}%` : "-";
  const armorPenSecondsTxt = (typeof armorPen.deltaSeconds === "number") ? `${armorPen.deltaSeconds.toFixed(2)}s` : "-";
  const armorPenNormTxt = (typeof armorPenNorm === "number") ? Math.round(armorPenNorm * 100) / 100 : "-";
  const critLevTxt = (typeof critLev === "number") ? `${critLev.toFixed(2)}s` : "-";
  const critLevNormTxt = (typeof critLevNorm === "number") ? Math.round(critLevNorm * 100) / 100 : "-";

  const bars = [
    ["CounterScore", counter.counterScore01],
    ["TTK", normalized.nTTK],
    ["Sustain", normalized.nSustain],
    ["Handling", normalized.nHandling],
    ["Range", normalized.nRange],
    ["Damage/Cycle (Cat)", dmgPerCycleNorm],
    ["Reload Penalty", normalized.nReloadPenalty],
    ["Armor", normalized.nArmor],
    ["Armor Pen (Cat)", armorPenNorm],
    ["Armor BP", normalized.nArmorBreak],
    ["Exposure (Inv)", normalized.nExposure],
    ["Mobility Cost (Inv)", normalized.nMobilityCost],
    ["Skill Floor", skillFloor01],
    ["Skill Ceiling", skillCeiling01],
  ];

  const bandScoreRows = Object.entries(bandScores.scores)
    .map(([label, val]) => `<div class="kv"><b>${label} Band</b><span>${typeof val === "number" ? val.toFixed(1) : '-'}</span></div>`)
    .join("");

  const explanation = buildMetricContributionSummary(normalized, {
    zone,
    armor,
    ttk,
    sustain,
    handling,
    range,
    reloadTaxVal,
    armorCons
  });
  const summaryHtml = explanation ? `<div class="explanation">${escapeHtml(explanation)}</div>` : '';

  const statsHtml = `
    <div style="margin-top:14px;">
      ${summaryHtml}
      <div class="grid2">
        <div class="kv"><b>Score</b><span class="highlight">${isFinite(score) ? score.toFixed(1) : "-"}</span></div>
        <div class="kv"><b>CounterScore</b><span class="highlight">${counterScoreTxt}${counterBadge ? ` <span class="subtle">(${counterBadge})</span>` : ""}</span></div>
        <div class="kv"><b>Counter Rank</b><span>${counterRankTxt}</span></div>
        <div class="kv"><b>Outlier Index</b><span>${outlierTxt}${outlierBadge ? ` <span class="warn-pill sm">${outlierBadge}</span>` : ""}</span></div>
        <div class="kv"><b>Category Avg (Score)</b><span>${outlierAvgTxt}</span></div>
        <div class="kv"><b>Skill Floor</b><span>${skillFloor01 !== null ? (skillFloor01 * 100).toFixed(1) : "-"}</span></div>
        <div class="kv"><b>Skill Ceiling</b><span>${skillCeiling01 !== null ? (skillCeiling01 * 100).toFixed(1) : "-"}</span></div>
        <div class="kv"><b>Role Dominance</b><span>${dominanceTxt}${dominanceBadge ? ` <span class="subtle">(${dominanceBadge})</span>` : ""}</span></div>
        <div class="kv"><b>${zone} TTK vs ${armor}</b><span>${ttk ? ttk.toFixed(2)+"s" : "-"}</span></div>
        <div class="kv"><b>Exposure Time</b><span>${exposureTxt}</span></div>
        <div class="kv"><b>Exposure (Norm)</b><span>${exposureNormTxt}</span></div>
        <div class="kv"><b>Mobility Cost/Kill</b><span>${mobilityCostTxt}</span></div>
        <div class="kv"><b>Mobility Cost (Norm)</b><span>${mobilityCostNormTxt}</span></div>
        <div class="kv"><b>DPS</b><span>${DPS ?? "-"}</span></div>
        <div class="kv"><b>Sustained DPS</b><span>${typeof sustain==="number" ? sustain.toFixed(1) : "-"}</span></div>
        <div class="kv"><b>Damage / Cycle</b><span>${typeof dmgPerCycle==="number" ? Math.round(dmgPerCycle) : "-"}</span></div>
        <div class="kv"><b>Norm D/C (Cat)</b><span>${typeof dmgPerCycleNorm==="number" ? Math.round(dmgPerCycleNorm*100)/100 : "-"}</span></div>
        <div class="kv"><b>Reload</b><span>${reload ? reload.toFixed(2)+"s" : "-"}</span></div>
        <div class="kv"><b>Engagements/Mag</b><span>${typeof engagementsPerMag==="number" ? engagementsPerMag : "-"}</span></div>
        <div class="kv"><b>Reload Each Kill?</b><span>${reloadEveryKill === null ? "-" : (reloadEveryKill ? "Yes" : "No")}</span></div>
        <div class="kv"><b>Reload Tax</b><span>${typeof reloadTaxVal==="number" ? (reloadTaxVal*100).toFixed(1)+"%" : "-"}</span></div>
        <div class="kv"><b>Reload Penalty (Norm)</b><span>${typeof normalized.nReloadPenalty==="number" ? Math.round(normalized.nReloadPenalty*100)/100 : "-"}</span></div>
        <div class="kv"><b>Weight Factor</b><span>${weightFactorTxt}</span></div>
        <div class="kv"><b>Range</b><span>${range ? range+"m" : "-"}</span></div>
        <div class="kv"><b>Armor Consistency</b><span>${typeof armorCons==="number" ? Math.round(armorCons*100)+"%" : "-"}</span></div>
        <div class="kv"><b>Armor Pen ΔH vs M</b><span>${armorPenSecondsTxt} (${armorPenDeltaTxt})</span></div>
          <div class="kv"><b>Armor Pen (Norm)</b><span>${armorPenNormTxt}</span></div>
          <div class="kv"><b>Armor BP Score</b><span>${typeof normalized.nArmorBreak==="number" ? Math.round(normalized.nArmorBreak*100)/100 : "-"}</span></div>
          <div class="kv"><b>Consistency Score</b><span>${typeof normalized.nConsistency==="number" ? Math.round(normalized.nConsistency*100)/100 : "-"}</span></div>
          <div class="kv"><b>TTK Volatility</b><span>${typeof vol==="number" ? vol.toFixed(2) : "-"}</span></div>
          <div class="kv"><b>Crit Leverage</b><span>${critLevTxt}</span></div>
          <div class="kv"><b>Crit Leverage (Norm)</b><span>${critLevNormTxt}</span></div>
          <div class="kv"><b>Headshot Dependency</b><span>${typeof headDep==="number" ? headDep.toFixed(2) : "-"}${headDepHigh ? " 🔺" : ""}</span></div>
          <div class="kv"><b>Normalized Dependency</b><span>${typeof headDepNorm==="number" ? Math.round(headDepNorm*100)/100 : "-"}</span></div>
        </div>

      <h4 style="margin:10px 0 6px;">Distance Band Scores</h4>
      <div class="grid2">
        ${bandScoreRows}
      </div>

      <div class="grid2" style="margin-top:10px;">
        ${armorBreakRows}
      </div>

      <hr>

      <div class="grid2">
        <div class="kv"><b>Firing Mode</b><span>${firingMode}</span></div>
        <div class="kv"><b>Armor Pen</b><span>${armorPenAttr}</span></div>
        <div class="kv"><b>Crit Multi</b><span>${crit}x</span></div>
        <div class="kv"><b>Handling Index</b><span>${handling ? handling.toFixed(1) : "-"}</span></div>
        <div class="kv"><b>Handling (Norm)</b><span>${typeof handlingNorm === "number" ? Math.round(handlingNorm * 100) / 100 : "-"}</span></div>
      </div>

      <div class="bars">
        ${bars.map(([label, n]) => {
          const pct = (typeof n === "number") ? Math.round(n*100) : 0;
          return `
            <div class="barRow">
              <div class="lbl">${label}</div>
              <div class="barTrack"><div class="barFill" style="width:${pct}%"></div></div>
              <div class="val">${typeof n==="number" ? pct+"%" : "-"}</div>
            </div>
          `;
        }).join("")}
      </div>

      <hr>

      <h3 style="color:var(--neon-red); margin-bottom:6px;">Sell Value: ${sell}</h3>
      ${d.Notes ? `<p class="subtle" style="font-style: italic;">Note: ${escapeHtml(String(d.Notes))}</p>` : ''}

      <div class="note">
        Breakdown normalizes against the full dataset for stability. Table ranking normalizes against the current filtered set.
      </div>
    </div>
  `;

  renderDetailPanel({
    name: d.Name,
    categoryText: `${category} | Rarity: ${d.R || 'Common'}`,
    statsHtml
  });
}

function buildMetricContributionSummary(normalized, context) {
  const weights = getWeights01();
  const contributions = [
    { key: 'nTTK', value: normalized.nTTK, weight: weights.ttk },
    { key: 'nSustain', value: normalized.nSustain, weight: weights.sustain },
    { key: 'nHandling', value: normalized.nHandling, weight: weights.handling },
    { key: 'nRange', value: normalized.nRange, weight: weights.range },
    { key: 'nReloadPenalty', value: normalized.nReloadPenalty, weight: weights.reload },
    { key: 'nArmor', value: normalized.nArmor, weight: weights.armor }
  ];

  const ranked = contributions
    .filter(c => typeof c.value === 'number' && isFinite(c.value) && typeof c.weight === 'number' && c.weight > 0)
    .map(c => ({ ...c, contribution: c.value * c.weight }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);

  const phrases = ranked
    .map(c => describeContribution(c.key, normalized, context))
    .filter(Boolean);

  return phrases.length ? `${phrases.join(', ')}.` : '';
}

function describeContribution(key, normalized, context) {
  const { zone, armor, ttk, sustain, handling, range, reloadTaxVal, armorCons } = context;

  if (key === 'nTTK') {
    const tone = pickTone(normalized.nTTK, ['blistering', 'fast', 'steady']);
    const timeTxt = (typeof ttk === 'number') ? ` (${ttk.toFixed(2)}s)` : '';
    return `${tone} ${zoneLabel(zone)} TTK vs ${armorLabel(armor)}${timeTxt}`;
  }

  if (key === 'nSustain') {
    const tone = pickTone(normalized.nSustain, ['high', 'strong', 'solid']);
    const sustainTxt = (typeof sustain === 'number') ? ` (${sustain.toFixed(1)} DPS)` : '';
    return `${tone} sustained DPS${sustainTxt}`;
  }

  if (key === 'nHandling') {
    const tone = pickTone(normalized.nHandling, ['snappy', 'clean', 'steady']);
    const handlingTxt = (typeof handling === 'number') ? ` (${handling.toFixed(1)} handling)` : '';
    return `${tone} handling${handlingTxt}`;
  }

  if (key === 'nRange') {
    const band = (!range || range < 35) ? 'close-range' : (range < 60 ? 'mid-range' : 'long-range');
    const rangeTxt = (typeof range === 'number') ? ` (${Math.round(range)}m)` : '';
    return `${band} coverage${rangeTxt}`;
  }

  if (key === 'nReloadPenalty' || key === 'nReload') {
    const tone = pickTone(normalized.nReloadPenalty, ['minimal', 'low', 'manageable']);
    const downtime = (typeof reloadTaxVal === 'number') ? ` (${Math.round(reloadTaxVal * 100)}% downtime)` : '';
    return `${tone} reload risk${downtime}`;
  }

  if (key === 'nArmor') {
    const tone = pickTone(normalized.nArmor, ['strong', 'steady', 'stable']);
    const armorTxt = (typeof armorCons === 'number') ? ` (${Math.round(armorCons * 100)}% consistency)` : '';
    return `${tone} vs heavy armor${armorTxt}`;
  }

  return null;
}

function pickTone(score, [high, mid, base]) {
  if (typeof score !== 'number') return base;
  if (score >= 0.82) return high;
  if (score >= 0.64) return mid;
  return base;
}

function armorLabel(code) {
  switch(code) {
    case '0': return 'unarmored';
    case 'L': return 'light';
    case 'M': return 'medium';
    case 'H': return 'heavy armor';
    default: return 'armor';
  }
}

function zoneLabel(zone) {
  switch(zone) {
    case 'Head': return 'headshot';
    case 'Leg': return 'leg-shot';
    case 'Body': return 'body-shot';
    default: return 'overall weighted';
  }
}

function updateChartTitle(zone, armor, metric) {
  const title = (metric === "SCORE")
    ? `Performance Landscape (Score 0–100)`
    : `Performance Landscape (${zone} TTK vs Armor ${armor} — seconds)`;
  document.getElementById("chartTitle").textContent = title;
}

function applyRoleDominance(list) {
  const byCategory = {};
  list.forEach((item) => {
    const cat = item.Category || "Unknown";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  });

  Object.values(byCategory).forEach((arr) => {
    arr.sort((a, b) => (b.Score01 ?? -Infinity) - (a.Score01 ?? -Infinity));
    const len = arr.length;

    arr.forEach((item, idx) => {
      if (len === 1) {
        item.RoleDominanceIndex = 100;
        item.RoleDominanceTop10 = true;
        return;
      }

      const pct = (1 - (idx / Math.max(len - 1, 1))) * 100;
      item.RoleDominanceIndex = Math.round(pct * 10) / 10;
      item.RoleDominanceTop10 = idx < Math.max(1, Math.ceil(len * 0.1));
    });
  });

  return list;
}

function applyCounterRank(list) {
  const ranked = list.filter((item) => typeof item.CounterScore01 === "number" && isFinite(item.CounterScore01));
  ranked.sort((a, b) => (b.CounterScore01 ?? -Infinity) - (a.CounterScore01 ?? -Infinity));

  const len = ranked.length;
  ranked.forEach((item, idx) => {
    const pct = (len <= 1) ? 100 : (1 - (idx / Math.max(len - 1, 1))) * 100;
    item.CounterRank = Math.round(pct * 10) / 10;
    item.CounterTop10 = idx < Math.max(1, Math.ceil(len * 0.1));
  });

  return list;
}

function applyOutlierIndex(list) {
  const scoresByCat = {};

  list.forEach((item) => {
    const cat = item.Category || "Unknown";
    const score = item.Score;
    if (typeof score === "number" && isFinite(score)) {
      if (!scoresByCat[cat]) scoresByCat[cat] = [];
      scoresByCat[cat].push(score);
    }
  });

  const statsByCat = {};
  Object.entries(scoresByCat).forEach(([cat, values]) => {
    if (!values.length) return;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sigma = stddev(values);
    statsByCat[cat] = { mean, sigma };
  });

  return list.map((item) => {
    const stats = statsByCat[item.Category || "Unknown"];
    const score = item.Score;
    let index = null;
    let warning = false;

    if (stats && typeof stats.sigma === "number" && stats.sigma > 0 && typeof score === "number" && isFinite(score)) {
      index = (score - stats.mean) / stats.sigma;
      warning = index > 1.5;
    }

    return {
      ...item,
      OutlierIndex: index,
      OutlierWarning: warning,
      CategoryAverageScore: stats ? stats.mean : null
    };
  });
}
