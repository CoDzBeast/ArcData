import { loadWeaponData } from './dataLoader.js';
import { setStatus, initSelectors, bindSortHeaders, bindAccordion, bindControls, applyPresetWeights, syncWeightOutputs, getControlState } from './controls.js';
import { renderChart, renderTable, renderDetailPanel } from './rendering.js';
import { compareRows, updateSortState, computeScore } from './sorting.js';
import { getZoneTTK, getZoneSTK, sustainedDpsApprox, handlingIndex, armorConsistency, ttkVolatility, buildRanges, normalizeMetrics } from './metrics.js';
import { safeNum, escapeHtml } from './utils.js';

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

  const filtered = rawData.filter(d => {
    const matchCat = (cat === 'All' || d.Category === cat);
    const matchSearch = (d.Name || "").toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  const maxRangeByCat = {};
  rawData.forEach(d => {
    const c = d.Category || "Unknown";
    const r = safeNum(d.Range);
    if (!r) return;
    maxRangeByCat[c] = Math.max(maxRangeByCat[c] || 0, r);
  });

  const computed = filtered.map(d => {
    const category = d.Category || "Unknown";
    const range = safeNum(d.Range);
    const rangeScore = (range && maxRangeByCat[category]) ? (range / maxRangeByCat[category]) : null;

    const ttk = getZoneTTK(d, zone, armor);
    const stk = getZoneSTK(d, zone, armor);
    const reload = safeNum(d.Reload);

    const sustain = (zone === "Overall")
      ? sustainedDpsApprox(d, null, null, ttk, stk)
      : sustainedDpsApprox(d, ttkKey, stkKey);

    const handling = handlingIndex(d);
    const armorCons = armorConsistency(d, zone);
    const vol = ttkVolatility(d, zone);

    return {
      ...d,
      Category: category,
      RangeScore: rangeScore,
      TTK: ttk,
      STK: stk,
      Reload: reload,
      Sustain: sustain,
      Handling: handling,
      ArmorCons: armorCons,
      Vol: vol
    };
  });

  const ranges = buildRanges(computed);

  const scored = computed.map(d => {
    const normalized = normalizeMetrics({
      ttk: d.TTK,
      sustain: d.Sustain,
      handling: d.Handling,
      rangeScore: d.RangeScore,
      reload: d.Reload,
      armorCons: d.ArmorCons
    }, ranges);

    const { score, score01 } = computeScore(normalized);

    return { ...d, ...normalized, Score: score, Score01: score01 };
  });

  scored.sort((a, b) => compareRows(a, b, lastSort));

  setStatus(`Showing ${scored.length} of ${rawData.length}`);
  updateChartTitle(zone, armor, chartMetric);

  chart = renderChart(scored, chartMetric, chart);
  renderTable(scored, (name) => showDetails(name));
}

function showDetails(name) {
  const { armor, zone } = getControlState();

  const d = rawData.find(w => w.Name === name);
  if (!d) return;

  const category = d.Category || "Unknown";

  const ttk = getZoneTTK(d, zone, armor);
  const stk = getZoneSTK(d, zone, armor);
  const reload = safeNum(d.Reload);
  const range = safeNum(d.Range);
  const DPS = safeNum(d.DPS);

  const handling = handlingIndex(d);
  const armorCons = armorConsistency(d, zone);
  const vol = ttkVolatility(d, zone);

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

  const whole = rawData.map(w => {
    const c = w.Category || "Unknown";
    const maxR = Math.max(...rawData.filter(x => (x.Category||"Unknown")===c).map(x => safeNum(x.Range) || 0));

    const wTTK = (zone === "Overall") ? getZoneTTK(w, "Overall", armor) : safeNum(w[ttkKey]);
    const wSTK = (zone === "Overall") ? getZoneSTK(w, "Overall", armor) : safeNum(w[stkKey]);

    const wSustain = (zone === "Overall")
      ? sustainedDpsApprox(w, null, null, wTTK, wSTK)
      : sustainedDpsApprox(w, ttkKey, stkKey);

    return {
      TTK: wTTK,
      Reload: safeNum(w.Reload),
      Sustain: wSustain,
      Handling: handlingIndex(w),
      ArmorCons: armorConsistency(w, zone),
      RangeScore: (safeNum(w.Range) && maxR) ? (safeNum(w.Range)/maxR) : null
    };
  });

  const ranges = buildRanges(whole.map(x => ({
    TTK: x.TTK, Sustain: x.Sustain, Handling: x.Handling, RangeScore: x.RangeScore, Reload: x.Reload, ArmorCons: x.ArmorCons
  })));

  const normalized = normalizeMetrics({
    ttk,
    sustain,
    handling,
    rangeScore,
    reload,
    armorCons
  }, ranges);

  const { score } = computeScore(normalized);

  const firingMode = d['Firing Mode'] || 'N/A';
  const armorPen = d['Armor Pen'] || 'N/A';
  const crit = d['Crit Multi'] || '1.0';
  const sell = d.Sell ? `$${Number(d.Sell).toLocaleString()}` : '$0';

  const bars = [
    ["TTK", normalized.nTTK],
    ["Sustain", normalized.nSustain],
    ["Handling", normalized.nHandling],
    ["Range", normalized.nRange],
    ["Reload", normalized.nReload],
    ["Armor", normalized.nArmor],
  ];

  const statsHtml = `
    <div style="margin-top:14px;">
      <div class="grid2">
        <div class="kv"><b>Score</b><span class="highlight">${isFinite(score) ? score.toFixed(1) : "-"}</span></div>
        <div class="kv"><b>${zone} TTK vs ${armor}</b><span>${ttk ? ttk.toFixed(2)+"s" : "-"}</span></div>
        <div class="kv"><b>DPS</b><span>${DPS ?? "-"}</span></div>
        <div class="kv"><b>Sustained DPS</b><span>${typeof sustain==="number" ? sustain.toFixed(1) : "-"}</span></div>
        <div class="kv"><b>Reload</b><span>${reload ? reload.toFixed(2)+"s" : "-"}</span></div>
        <div class="kv"><b>Range</b><span>${range ? range+"m" : "-"}</span></div>
        <div class="kv"><b>Armor Consistency</b><span>${typeof armorCons==="number" ? Math.round(armorCons*100)+"%" : "-"}</span></div>
        <div class="kv"><b>TTK Volatility</b><span>${typeof vol==="number" ? vol.toFixed(2) : "-"}</span></div>
      </div>

      <hr>

      <div class="grid2">
        <div class="kv"><b>Firing Mode</b><span>${firingMode}</span></div>
        <div class="kv"><b>Armor Pen</b><span>${armorPen}</span></div>
        <div class="kv"><b>Crit Multi</b><span>${crit}x</span></div>
        <div class="kv"><b>Handling Index</b><span>${handling ? handling.toFixed(1) : "-"}</span></div>
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
