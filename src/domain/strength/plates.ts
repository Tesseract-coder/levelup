/** Plate calculator: plates per side for a barbell total. Greedy works for standard plate sets. */

export const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
export const PLATES_LB = [45, 35, 25, 10, 5, 2.5];

export interface PlateResult {
  perSide: { plate: number; count: number }[];
  /** What the listed plates actually add up to (incl. bar). */
  achieved: number;
  /** Left over because no plate combination matches exactly. */
  remainder: number;
}

/** All values in the same unit (kg or lb). */
export function platesPerSide(total: number, bar: number, plates: number[] = PLATES_KG): PlateResult {
  let side = Math.max(0, (total - bar) / 2);
  const perSide: PlateResult['perSide'] = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    const n = Math.floor((side + 1e-9) / p);
    if (n > 0) {
      perSide.push({ plate: p, count: n });
      side -= n * p;
    }
  }
  const loaded = perSide.reduce((t, x) => t + x.plate * x.count, 0) * 2;
  const achieved = Math.round((Math.min(total, bar) + (total > bar ? loaded : 0)) * 100) / 100;
  return { perSide, achieved, remainder: Math.round((total - achieved) * 100) / 100 };
}
