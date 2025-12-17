import { CSV_FILE } from './constants.js';
import { safeNum } from './utils.js';

export function loadWeaponData(csvFile = CSV_FILE) {
  return new Promise((resolve, reject) => {
    Papa.parse(csvFile, {
      download: true,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = (results.data || []).filter(d => d.Name && d.Name !== "Name");
        const sanitized = rows.map(sanitizeNumericFields);
        warnNonNumeric(sanitized);
        resolve(sanitized);
      },
      error: (err) => reject(err)
    });
  });
}

// Sanitize numeric columns immediately after CSV load so downstream code always
// receives numbers or nulls (never strings/undefined).
function sanitizeNumericFields(row) {
  const numericFields = [
    'Reload',
    'DPS',
    'Range',
    'Mag',
    'Stability',
    'Agility',
    'Stealth',
    'Weight',
    'Sell',
    'DMG',
    'Crit Multi',
  ];

  const sanitized = { ...row };

  numericFields.forEach((field) => {
    if (field in sanitized) sanitized[field] = safeNum(sanitized[field]);
  });

  Object.keys(sanitized).forEach((key) => {
    if (/TTK|STK/.test(key)) {
      sanitized[key] = safeNum(sanitized[key]);
    }
  });

  return sanitized;
}

// Dev-only invariant check to surface unexpected values early.
function warnNonNumeric(rows) {
  const fieldsToCheck = new Set([
    'Reload',
    'DPS',
    'Range',
    'Mag',
    'Stability',
    'Agility',
    'Stealth',
    'Weight',
    'Sell',
    'DMG',
    'Crit Multi',
  ]);

  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (/TTK|STK/.test(key)) fieldsToCheck.add(key);
    });
  });

  fieldsToCheck.forEach((field) => {
    const invalid = rows.filter((d) => d[field] !== null && typeof d[field] !== 'number');
    if (invalid.length) {
      console.warn(`Non-numeric ${field} values:`, invalid);
    }
  });
}
