import { loadWeaponData } from './dataLoader.js';
import { setStatus, initSelectors, bindSortHeaders, bindAccordion, bindControls, applyPresetWeights, syncWeightOutputs, getControlState, getWeights01 } from './controls.js';
import { renderChart, renderTable, renderDetailPanel } from './rendering.js';
import { compareRows, updateSortState } from './sorting.js';
import {
  METRICS,
  computeContext,
  computeRawMetrics,
  computeStats,
  computeNormalized,
  computeScore,
  validateMetrics,
  distanceBandScores,
  counterScore,
  armorBreakpoint,
  armorPenEffectiveness,
  getZoneTTK,
  getZoneSTK,
  detectWeightColumn,
  analyzeMissingMetrics,
} from './metrics.js';
import { safeNum, stddev } from './utils.js';

let rawData = [];
let computedRows = [];
let chart;
let lastSort = { key: 'Score', dir: 'desc' };
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
      console.log('CSV schema keys:', Object.keys(rawData[0] || {}));
      detectWeightColumn(rawData);
      initSelectors(rawData);
      updateUI();
    })
    .catch((err) => {
      console.error('Error loading CSV:', err);
      document.querySelector('.main').innerHTML =
        `<div class="card"><h3 style="color:red">Error: Could not load data</h3>
          <p>Make sure the file is in your GitHub repo and named exactly <b>\"arc_raiders_final.csv\"</b>.</p></div>`;
      setStatus('Error');
    });
}

function updateUI() {
  if (!rawData.length) { setStatus('No data'); return; }

  const controls = getControlState();
  const { armor, zone, cat, search, chartMetric } = controls;

  const filtered = rawData.filter((d) => {
    const matchCat = cat === 'All' || d.Category === cat;
    const matchSearch = (d.Name || '').toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  const ctx = computeContext(filtered, controls);
  const rawList = filtered.map((row) => ({ source: row, raw: computeRawMetrics(row, ctx) }));
  const stats = computeStats(rawList.map((r) => r.raw));

  computedRows = rawList.map(({ source, raw }) => buildComputedRow(source, raw, stats, ctx));
  const missingAnalysis = analyzeMissingMetrics(computedRows.map((r) => ({ normalized: r.normalized })));
  if (missingAnalysis.suppressed.size) {
    computedRows = rawList.map(({ source, raw }) => buildComputedRow(source, raw, stats, ctx, missingAnalysis.suppressed));
  }

  applyRoleDominance(computedRows);
  applyCounterRank(computedRows);
  const scoredWithOutliers = applyOutlierIndex(computedRows);

  outlierByName = scoredWithOutliers.reduce((acc, weapon) => {
    acc[weapon.Name] = {
      index: weapon.OutlierIndex,
      warning: weapon.OutlierWarning,
      categoryAverage: weapon.CategoryAverageScore,
    };
    return acc;
  }, {});
  counterByName = scoredWithOutliers.reduce((acc, weapon) => {
    acc[weapon.Name] = {
      score: weapon.CounterScore,
      rank: weapon.CounterRank,
      top: weapon.CounterTop10,
    };
    return acc;
  }, {});
  roleDominanceByName = scoredWithOutliers.reduce((acc, weapon) => {
    acc[weapon.Name] = {
      index: weapon.RoleDominanceIndex,
      top: weapon.RoleDominanceTop10,
    };
    return acc;
  }, {});

  scoredWithOutliers.sort((a, b) => compareRows(a, b, lastSort));

  const validation = validateMetrics(
    scoredWithOutliers.map((r) => ({ normalized: r.normalized })),
    stats,
    getWeights01(),
    missingAnalysis,
  );
  setStatus(`${validation.okText} | ${validation.missingText}`);
  updateChartTitle(zone, armor, chartMetric);

  chart = renderChart(scoredWithOutliers, chartMetric, chart);
  renderTable(scoredWithOutliers, (name) => showDetails(name));
}

function buildComputedRow(source, raw, stats, ctx, suppressedMetrics = new Set()) {
  const normalized = computeNormalized(raw, stats, ctx);
  const weights = getWeights01();
  const { score01, score100 } = computeScore(normalized, weights, METRICS, suppressedMetrics);
  const bandScores = distanceBandScores(safeNum(source.Range), raw.RangeScore, score01);
  const counter = counterScore({
    headDepNorm: normalized.HeadDep,
    armorNorm: normalized.ArmorCons,
    reloadNorm: normalized.ReloadPenalty,
    killsPerMagNorm: normalized.KillsPerMag,
  });

  const skillFloorParts = [normalized.HeadDep, normalized.Consistency, normalized.KillsPerMag]
    .filter((v) => typeof v === 'number' && isFinite(v));
  const skillFloor01 = skillFloorParts.length
    ? skillFloorParts.reduce((a, b) => a + b, 0) / skillFloorParts.length
    : null;
  const skillCeilingParts = [normalized.CritLeverage, normalized.Handling, normalized.HeadDep]
    .filter((v) => typeof v === 'number' && isFinite(v));
  const skillCeiling01 = skillCeilingParts.length
    ? skillCeilingParts.reduce((a, b) => a + b, 0) / skillCeilingParts.length
    : null;

  const normalizedPrefixed = Object.fromEntries(
    Object.entries(normalized).map(([k, v]) => [`n${k}`, v]),
  );

  const reloadEveryKill = typeof raw.KillsPerMag === 'number' ? raw.KillsPerMag <= 1 : null;
  const armorPen = armorPenEffectiveness(source, ctx.zone, ctx.hitWeights);

  return {
    ...source,
    ...raw,
    ...normalizedPrefixed,
    normalized,
    Score: score100,
    Score01: score01,
    DistanceBandScores: bandScores.scores,
    DistanceBandScore01: bandScores.score01,
    CounterScore: counter.counterScore,
    CounterScore01: counter.counterScore01,
    SkillFloorScore01: skillFloor01,
    SkillFloorScore: typeof skillFloor01 === 'number' ? Math.round(skillFloor01 * 1000) / 10 : null,
    SkillCeilingScore01: skillCeiling01,
    SkillCeilingScore: typeof skillCeiling01 === 'number' ? Math.round(skillCeiling01 * 1000) / 10 : null,
    EngagementCapacity: raw.KillsPerMag,
    ReloadEveryKill: reloadEveryKill,
    ArmorBreak: raw.ArmorBreak,
    ArmorPenDelta: armorPen.deltaRatio,
    ArmorPenDeltaSeconds: armorPen.deltaSeconds,
    ArmorPenScore: normalized.ArmorPen,
    ConsistencyScore: normalized.Consistency,
    ArmorBreakpointScore: normalized.ArmorBreak,
    ExposureTimeNorm: normalized.ExposureTime,
    MobilityCostNorm: normalized.MobilityCost,
    HandlingIndex: raw.Handling,
    HandlingIndexNorm: normalized.Handling,
    DamagePerCycleNorm: raw.DamagePerCycleNormBase ?? normalized.DamagePerCycle,
    Vol: raw.Volatility,
  };
}

function showDetails(name) {
  const d = computedRows.find((w) => w.Name === name);
  if (!d) return;

  const category = d.Category || 'Unknown';
  const armorBreak = armorBreakpoint(d);

  const dominance = roleDominanceByName[d.Name] || {};
  const dominanceVal = safeNum(dominance.index);
  const dominanceTxt = dominanceVal !== null ? `${dominanceVal.toFixed(1)}%` : '-';
  const dominanceBadge = dominance.top ? '🏆 Top 10%' : '';
  const outlierInfo = outlierByName[d.Name] || {};
  const outlierIdx = safeNum(outlierInfo.index);
  const outlierTxt = outlierIdx !== null ? `${outlierIdx.toFixed(2)}σ` : '-';
  const outlierBadge = outlierInfo.warning ? '⚠️ Above Cat Avg' : '';
  const outlierAvg = safeNum(outlierInfo.categoryAverage);
  const outlierAvgTxt = outlierAvg !== null ? outlierAvg.toFixed(1) : '-';
  const counterInfo = counterByName[d.Name] || {};
  const counterScore = safeNum(counterInfo.score);
  const counterRank = safeNum(counterInfo.rank);
  const counterScoreTxt = counterScore !== null ? counterScore.toFixed(1) : '-';
  const counterRankTxt = counterRank !== null ? `${counterRank.toFixed(1)}%` : '-';
  const counterBadge = counterInfo.top ? '🛡️ Meta Counter' : '';

  const armorPen = armorPenEffectiveness(d, getControlState().zone, computeContext([d], getControlState()).hitWeights);

  const armorBreakRows = [
    ['ΔL', armorBreak.deltaL],
    ['ΔM', armorBreak.deltaM],
    ['ΔH', armorBreak.deltaH],
    ['Avg', armorBreak.avgDelta],
  ].map(([label, val]) => {
    const v = safeNum(val);
    return `<div class="kv"><b>${label}</b><span>${v !== null ? v.toFixed(2) : '-'}</span></div>`;
  }).join('');

  const statsHtml = `
    <div class="grid2">
      <div class="kv"><b>Score</b><span>${safeNum(d.Score) !== null ? safeNum(d.Score).toFixed(1) : '-'}</span></div>
      <div class="kv"><b>Range</b><span>${safeNum(d.Range) !== null ? `${safeNum(d.Range)}m` : '-'}</span></div>
      <div class="kv"><b>TTK (${getControlState().zone}/${getControlState().armor})</b><span>${safeNum(d.TTK) !== null ? `${safeNum(d.TTK).toFixed(2)}s` : '-'}</span></div>
      <div class="kv"><b>Sustain</b><span>${safeNum(d.Sustain) !== null ? `${safeNum(d.Sustain).toFixed(1)} DPS` : '-'}</span></div>
      <div class="kv"><b>Reload</b><span>${safeNum(d.Reload) !== null ? `${safeNum(d.Reload).toFixed(2)}s` : '-'}</span></div>
      <div class="kv"><b>Kills/Mag</b><span>${d.EngagementCapacity ?? '-'}</span></div>
      <div class="kv"><b>Exposure</b><span>${safeNum(d.ExposureTime) !== null ? `${safeNum(d.ExposureTime).toFixed(2)}s` : '-'}</span></div>
      <div class="kv"><b>Mobility</b><span>${safeNum(d.MobilityCost) !== null ? `${safeNum(d.MobilityCost).toFixed(2)}s` : '-'}</span></div>
      <div class="kv"><b>Handling</b><span>${safeNum(d.Handling) !== null ? safeNum(d.Handling).toFixed(1) : '-'}</span></div>
      <div class="kv"><b>Crit Leverage</b><span>${safeNum(d.CritLeverage) !== null ? `${safeNum(d.CritLeverage).toFixed(2)}s` : '-'}</span></div>
      <div class="kv"><b>Head Dep</b><span>${safeNum(d.HeadDep) !== null ? safeNum(d.HeadDep).toFixed(2) : '-'}</span></div>
      <div class="kv"><b>Armor Cons</b><span>${safeNum(d.ArmorCons) !== null ? `${Math.round(safeNum(d.ArmorCons) * 100)}%` : '-'}</span></div>
      <div class="kv"><b>Armor Pen</b><span>${safeNum(armorPen.deltaRatio) !== null ? `${(safeNum(armorPen.deltaRatio) * 100).toFixed(1)}%` : '-'}</span></div>
    </div>
    <hr />
    <div class="grid2">
      ${armorBreakRows}
    </div>
    <hr />
    <div class="grid2">
      <div class="kv"><b>Role Dominance</b><span>${dominanceTxt} ${dominanceBadge}</span></div>
      <div class="kv"><b>Outlier</b><span>${outlierTxt} ${outlierBadge}</span></div>
      <div class="kv"><b>Cat Avg</b><span>${outlierAvgTxt}</span></div>
      <div class="kv"><b>Counter</b><span>${counterScoreTxt} ${counterRankTxt} ${counterBadge}</span></div>
    </div>
  `;

  renderDetailPanel({
    name: d.Name,
    categoryText: `${category} | ${d.Rarity || '—'} | ${d.Sell ? `$${Number(d.Sell).toLocaleString()}` : '$0'}`,
    statsHtml,
  });
}

function updateChartTitle(zone, armor, metric) {
  const title = metric === 'SCORE'
    ? 'Performance Landscape (Score 0–100)'
    : `Performance Landscape (${zone} TTK vs Armor ${armor} — seconds)`;
  document.getElementById('chartTitle').textContent = title;
}

function applyRoleDominance(list) {
  const byCategory = {};
  list.forEach((item) => {
    const cat = item.Category || 'Unknown';
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
  const ranked = list.filter((item) => typeof item.CounterScore01 === 'number' && isFinite(item.CounterScore01));
  ranked.sort((a, b) => (b.CounterScore01 ?? -Infinity) - (a.CounterScore01 ?? -Infinity));
  const len = ranked.length;
  ranked.forEach((item, idx) => {
    const pct = len <= 1 ? 100 : (1 - (idx / Math.max(len - 1, 1))) * 100;
    item.CounterRank = Math.round(pct * 10) / 10;
    item.CounterTop10 = idx < Math.max(1, Math.ceil(len * 0.1));
  });
  return list;
}

function applyOutlierIndex(list) {
  const scoresByCat = {};
  list.forEach((item) => {
    const cat = item.Category || 'Unknown';
    const score = item.Score;
    if (typeof score === 'number' && isFinite(score)) {
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
    const stats = statsByCat[item.Category || 'Unknown'];
    const score = item.Score;
    let index = null;
    let warning = false;

    if (stats && typeof stats.sigma === 'number' && stats.sigma > 0 && typeof score === 'number' && isFinite(score)) {
      index = (score - stats.mean) / stats.sigma;
      warning = index > 1.5;
    }

    return {
      ...item,
      OutlierIndex: index,
      OutlierWarning: warning,
      CategoryAverageScore: stats ? stats.mean : null,
    };
  });
}
