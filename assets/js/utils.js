export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Canonical numeric sanitizer to keep downstream formatting safe
export function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export function stddev(nums) {
  const arr = nums.filter(n => typeof n === "number" && isFinite(n));
  if (arr.length < 2) return null;
  const mean = arr.reduce((a,b)=>a+b,0) / arr.length;
  const v = arr.reduce((a,b)=>a + (b-mean)*(b-mean), 0) / (arr.length - 1);
  return Math.sqrt(v);
}

export function normalize(val, min, max) {
  if (val === null || val === undefined) return null;
  if (max === min) return 0.5;
  return clamp((val - min) / (max - min), 0, 1);
}

export function invert01(x) {
  if (x === null || x === undefined) return null;
  return 1 - x;
}

export function weightedAverage(parts) {
  let wSum = 0, vSum = 0;
  for (const [w, v] of parts) {
    if (typeof v !== "number" || !isFinite(v)) continue;
    wSum += w;
    vSum += w * v;
  }
  return wSum > 0 ? (vSum / wSum) : null;
}

export function percentile(nums, pct) {
  const arr = nums
    .filter(n => typeof n === "number" && isFinite(n))
    .sort((a, b) => a - b);

  if (!arr.length || pct === null || pct === undefined) return null;

  const rank = (pct / 100) * (arr.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);

  if (lower === upper) return arr[lower];

  const weight = rank - lower;
  return arr[lower] + (arr[upper] - arr[lower]) * weight;
}

export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
