import type { UnitSystem } from '@/db/types';
import { KG_PER_LB } from '@/domain/targets';

/** Everything is stored in kg; these convert for display and input only. */
export type WeightUnit = 'kg' | 'lb';

export const weightUnit = (units: UnitSystem | undefined): WeightUnit => (units === 'imperial' ? 'lb' : 'kg');

const trim = (v: number, dp: number) => Number(v.toFixed(dp));

/** kg → display number (kg keeps 2 dp for 1.25 plates; lb shows 1 dp). */
export function toDisplay(kg: number, unit: WeightUnit): number {
  return unit === 'lb' ? trim(kg / KG_PER_LB, 1) : trim(kg, 2);
}

/** Display number → kg (3 dp so lb values round-trip exactly). */
export function fromDisplay(v: number, unit: WeightUnit): number {
  return unit === 'lb' ? trim(v * KG_PER_LB, 3) : trim(v, 3);
}

export function fmtWeight(kg: number | undefined, unit: WeightUnit, withUnit = true): string {
  if (kg == null) return '–';
  const v = toDisplay(kg, unit);
  return withUnit ? `${v.toLocaleString()} ${unit}` : v.toLocaleString();
}

/** 45 → "45 s", 90 → "1:30". */
export function fmtSec(sec: number | undefined): string {
  if (sec == null) return '–';
  if (sec < 60) return `${Math.round(sec)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Big volumes read better rounded: 12,345 kg / 27,216 lb. */
export function fmtVolume(kg: number, unit: WeightUnit, compact = false): string {
  const v = Math.round(unit === 'lb' ? kg / KG_PER_LB : kg);
  if (compact && v >= 10_000) return `${Math.round(v / 1000).toLocaleString()}k ${unit}`;
  return `${v.toLocaleString()} ${unit}`;
}
