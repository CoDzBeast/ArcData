export const OVERALL_HIT_WEIGHTS = { Head: 0.20, Body: 0.70, Leg: 0.10 };
export const CSV_FILE = "arc_raiders_final.csv";

export const DISTANCE_BANDS = [
  { key: "CQC",   label: "CQC",   min: 0,  max: 10 },
  { key: "Close", label: "Close", min: 10, max: 25 },
  { key: "Mid",   label: "Mid",   min: 25, max: 40 },
  { key: "Long",  label: "Long",  min: 40, max: Infinity }
];

export const PRESET_WEIGHTS = {
  META: { ttk: 30, sustain: 20, handling: 15, range: 15, reload: 10, armor: 10 },
  CQC:  { ttk: 35, sustain: 10, handling: 25, range: 5,  reload: 20, armor: 5  },
  MID:  { ttk: 25, sustain: 20, handling: 15, range: 25, reload: 10, armor: 5  },
  LONG: { ttk: 15, sustain: 5,  handling: 15, range: 35, reload: 10, armor: 20 }
};
