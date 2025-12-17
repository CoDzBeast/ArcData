import { loadWeaponData } from './dataLoader.js';
import { setStatus, initSelectors, bindSortHeaders, bindAccordion, bindControls, applyPresetWeights, syncWeightOutputs, getControlState } from './controls.js';
import { renderChart, renderTable, renderDetailPanel } from './rendering.js';
import { compareRows, updateSortState, computeScore } from './sorting.js';
import { getZoneTTK, getZoneSTK, sustainedDpsApprox, handlingIndex, armorConsistency, ttkVolatility, armorBreakpoint, buildRanges, normalizeMetrics, headshotDependency, headshotDependencyStats, reloadTax, damagePerCycle } from './metrics.js';
import { safeNum, escapeHtml, normalize } from './utils.js';

let rawData = [], chart;
let lastSort = { key: "Score", dir: "desc" };

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
  const handlingValues = rawData
    .map(handlingIndex)
    .filter(v => typeof v === "number" && isFinite(v));
  const handlingRange = handlingValues.length
    ? { min: Math.min(...handlingValues), max: Math.max(...handlingValues) }
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
    const weightFactor = (typeof weight === "number")
      ? normalize(weight, weightRange.min, weightRange.max)
      : null;
    const exposureTime = (typeof overallTTK === "number" && typeof weightFactor === "number")
      ? overallTTK * (1 + weightFactor)
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
      DamagePerCycle: dmgPerCycle,
      DamagePerCycleNorm: dmgPerCycleNorm,
      HeadDep: headDep,
      HeadDepNorm: headDepNorm,
      HeadDepHigh: headDepHigh,
      ArmorBreakAvg: armorBreak.avgDelta,
      ArmorBreakDeltas: armorBreak
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
      exposureTime: d.ExposureTime
    }, ranges);

    const { score, score01 } = computeScore(normalized);

    return {
      ...d,
      ...normalized,
      ConsistencyScore: normalized.nConsistency,
      ArmorBreakpointScore: normalized.nArmorBreak,
      ExposureTimeNorm: normalized.nExposure,
      Score: score,
      Score01: score01
    };
  });

  scored.sort((a, b) => compareRows(a, b, lastSort));

  setStatus(`Showing ${scored.length} of ${rawData.length}`);
  updateChartTitle(zone, armor, chartMetric);

  chart = renderChart(scored, chartMetric, chart);
  renderTable(scored, (name) => showDetails(name));
}

function showDetails(name) {
  const { armor, zone } = getControlState();

  const headshotStats = headshotDependencyStats(rawData, armor);
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
  const reloadTaxVal = reloadTax(reload, ttk);
  const weight = safeNum(d.Weight);
  const weightFactor = (typeof weight === "number")
    ? normalize(weight, weightRange.min, weightRange.max)
    : null;
  const exposureTime = (typeof overallTTK === "number" && typeof weightFactor === "number")
    ? overallTTK * (1 + weightFactor)
    : null;

  const engagementsPerMag = (typeof mag === "number" && mag > 0 && typeof stk === "number" && stk > 0)
    ? Math.floor(mag / stk)
    : null;
  const reloadEveryKill = (typeof engagementsPerMag === "number") ? engagementsPerMag <= 1 : null;

  const handling = handlingIndex(d);
  const handlingNorm = (typeof handling === "number")
    ? normalize(handling, handlingRange.min, handlingRange.max)
    : null;
  const armorCons = armorConsistency(d, zone);
  const armorBreak = armorBreakpoint(d);
  const vol = ttkVolatility(d, zone);
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

  const whole = rawData.map(w => {
    const c = w.Category || "Unknown";
    const maxR = Math.max(...rawData.filter(x => (x.Category||"Unknown")===c).map(x => safeNum(x.Range) || 0));

    const wTTK = (zone === "Overall") ? getZoneTTK(w, "Overall", armor) : safeNum(w[ttkKey]);
    const wSTK = (zone === "Overall") ? getZoneSTK(w, "Overall", armor) : safeNum(w[stkKey]);
    const wReload = safeNum(w.Reload);
    const wReloadTax = reloadTax(wReload, wTTK);
    const wWeight = safeNum(w.Weight);
    const wWeightFactor = (typeof wWeight === "number")
      ? normalize(wWeight, weightRange.min, weightRange.max)
      : null;
    const wOverallTTK = getZoneTTK(w, "Overall", armor);
    const wExposureTime = (typeof wOverallTTK === "number" && typeof wWeightFactor === "number")
      ? wOverallTTK * (1 + wWeightFactor)
      : null;

    const wSustain = (zone === "Overall")
      ? sustainedDpsApprox(w, null, null, wTTK, wSTK)
      : sustainedDpsApprox(w, ttkKey, stkKey);

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
      ExposureTime: wExposureTime
    };
  });

  const ranges = buildRanges(whole.map(x => ({
    TTK: x.TTK, Sustain: x.Sustain, Handling: x.Handling, RangeScore: x.RangeScore, Reload: x.Reload, ReloadTax: x.ReloadTax, ArmorCons: x.ArmorCons, ArmorBreakAvg: x.ArmorBreakAvg, Vol: x.Vol, ExposureTime: x.ExposureTime
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
    exposureTime
  }, ranges);

  const { score } = computeScore(normalized);

  const firingMode = d['Firing Mode'] || 'N/A';
  const armorPen = d['Armor Pen'] || 'N/A';
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
  const weightFactorTxt = (typeof weightFactor === "number") ? Math.round(weightFactor * 100) / 100 : "-";

  const bars = [
    ["TTK", normalized.nTTK],
    ["Sustain", normalized.nSustain],
    ["Handling", normalized.nHandling],
    ["Range", normalized.nRange],
    ["Damage/Cycle (Cat)", dmgPerCycleNorm],
    ["Reload Penalty", normalized.nReloadPenalty],
    ["Armor", normalized.nArmor],
    ["Armor BP", normalized.nArmorBreak],
    ["Exposure (Inv)", normalized.nExposure],
  ];

  const statsHtml = `
    <div style="margin-top:14px;">
      <div class="grid2">
        <div class="kv"><b>Score</b><span class="highlight">${isFinite(score) ? score.toFixed(1) : "-"}</span></div>
        <div class="kv"><b>${zone} TTK vs ${armor}</b><span>${ttk ? ttk.toFixed(2)+"s" : "-"}</span></div>
        <div class="kv"><b>Exposure Time</b><span>${exposureTxt}</span></div>
        <div class="kv"><b>Exposure (Norm)</b><span>${exposureNormTxt}</span></div>
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
        <div class="kv"><b>Armor BP Score</b><span>${typeof normalized.nArmorBreak==="number" ? Math.round(normalized.nArmorBreak*100)/100 : "-"}</span></div>
        <div class="kv"><b>Consistency Score</b><span>${typeof normalized.nConsistency==="number" ? Math.round(normalized.nConsistency*100)/100 : "-"}</span></div>
        <div class="kv"><b>TTK Volatility</b><span>${typeof vol==="number" ? vol.toFixed(2) : "-"}</span></div>
        <div class="kv"><b>Headshot Dependency</b><span>${typeof headDep==="number" ? headDep.toFixed(2) : "-"}${headDepHigh ? " 🔺" : ""}</span></div>
        <div class="kv"><b>Normalized Dependency</b><span>${typeof headDepNorm==="number" ? Math.round(headDepNorm*100)/100 : "-"}</span></div>
      </div>

      <div class="grid2" style="margin-top:10px;">
        ${armorBreakRows}
      </div>

      <hr>

      <div class="grid2">
        <div class="kv"><b>Firing Mode</b><span>${firingMode}</span></div>
        <div class="kv"><b>Armor Pen</b><span>${armorPen}</span></div>
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

function updateChartTitle(zone, armor, metric) {
  const title = (metric === "SCORE")
    ? `Performance Landscape (Score 0–100)`
    : `Performance Landscape (${zone} TTK vs Armor ${armor} — seconds)`;
  document.getElementById("chartTitle").textContent = title;
}
