export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const safeNum = (x) => (x === null || x === undefined || Number.isNaN(x)) ? null : Number(x);

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

export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
