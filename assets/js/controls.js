import { PRESET_WEIGHTS } from './constants.js';

export function setStatus(text) {
  const pill = document.getElementById("statusPill");
  pill.textContent = text;
}

export function initSelectors(rawData) {
  const cats = [...new Set(rawData.map(d => d.Category))].filter(Boolean);
  const sel = document.getElementById('category');
  cats.sort().forEach(c => {
    const o = document.createElement('option');
    o.text = o.value = c;
    sel.add(o);
  });
}

export function bindSortHeaders(onSortChange) {
  document.querySelectorAll("#weaponTable th.sortable").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.getAttribute("data-sort");
      if (!key) return;
      onSortChange(key);
    });
  });
}

export function bindAccordion() {
  const accordion = document.getElementById('weightsAccordion');
  const body = document.getElementById('weightsBody');
  const hint = document.getElementById('weightsHint');
  accordion.querySelector('.accHead').addEventListener('click', () => {
    body.classList.toggle('open');
    hint.textContent = body.classList.contains('open') ? 'click to collapse' : 'click to expand';
  });
}

export function syncWeightOutputs() {
  const map = [
    ["w_ttk","o_ttk"],
    ["w_sustain","o_sustain"],
    ["w_handling","o_handling"],
    ["w_range","o_range"],
    ["w_reload","o_reload"],
    ["w_armor","o_armor"]
  ];
  map.forEach(([w,o]) => document.getElementById(o).textContent = document.getElementById(w).value);
}

export function applyPresetWeights(force=false) {
  const mode = document.getElementById("scoreMode").value;
  if (!force && mode === "CUSTOM") return;

  const p = PRESET_WEIGHTS[mode] || PRESET_WEIGHTS.META;
  document.getElementById("w_ttk").value = p.ttk;
  document.getElementById("w_sustain").value = p.sustain;
  document.getElementById("w_handling").value = p.handling;
  document.getElementById("w_range").value = p.range;
  document.getElementById("w_reload").value = p.reload;
  document.getElementById("w_armor").value = p.armor;
  syncWeightOutputs();
}

export function getWeights01() {
  const w = {
    ttk: Number(document.getElementById("w_ttk").value),
    sustain: Number(document.getElementById("w_sustain").value),
    handling: Number(document.getElementById("w_handling").value),
    range: Number(document.getElementById("w_range").value),
    reload: Number(document.getElementById("w_reload").value),
    armor: Number(document.getElementById("w_armor").value),
  };
  const sum = Object.values(w).reduce((a,b)=>a+b,0) || 1;
  Object.keys(w).forEach(k => w[k] = w[k] / sum);
  return w;
}

export function getControlState() {
  return {
    armor: document.getElementById('armor').value,
    zone: document.getElementById('zone').value,
    cat: document.getElementById('category').value,
    search: document.getElementById('searchInput').value.toLowerCase(),
    chartMetric: document.getElementById("chartMetric").value,
    scoreMode: document.getElementById('scoreMode').value
  };
}

export function bindControls(onUpdate) {
  const controlSelectors = ['searchInput','armor','zone','category','chartMetric'];
  controlSelectors.forEach(id => {
    document.getElementById(id).addEventListener('input', onUpdate);
    document.getElementById(id).addEventListener('change', onUpdate);
  });

  document.getElementById('scoreMode').addEventListener('change', () => {
    applyPresetWeights(true);
    onUpdate();
  });

  ['w_ttk','w_sustain','w_handling','w_range','w_reload','w_armor'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      const mode = document.getElementById('scoreMode');
      if (mode.value !== 'CUSTOM') mode.value = 'CUSTOM';
      syncWeightOutputs();
      onUpdate();
    });
  });

  document.getElementById('resetPresetBtn').addEventListener('click', () => {
    applyPresetWeights(true);
    onUpdate();
  });

  document.getElementById('customWeightsBtn').addEventListener('click', () => {
    document.getElementById('scoreMode').value = 'CUSTOM';
    onUpdate();
  });
}
