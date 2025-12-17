import { CSV_FILE } from './constants.js';

export function loadWeaponData(csvFile = CSV_FILE) {
  return new Promise((resolve, reject) => {
    Papa.parse(csvFile, {
      download: true,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = (results.data || []).filter(d => d.Name && d.Name !== "Name");
        resolve(rows);
      },
      error: (err) => reject(err)
    });
  });
}
