import type { DayType, Exercise } from '@/db/types';
import { groupsOf, type MuscleGroup } from './library';

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  legs: 'Legs',
  arms: 'Arms',
  core: 'Core / Abs',
  glutes: 'Glutes',
  push: 'Push',
  pull: 'Pull',
  upper: 'Upper body',
  lower: 'Lower body',
  full: 'Full body',
  custom: 'Custom',
};

/** Chip rows on the day picker. */
export const DAY_TYPE_ROWS: DayType[][] = [
  ['chest', 'back', 'shoulders', 'legs', 'arms', 'core', 'glutes'],
  ['push', 'pull', 'legs'],
  ['upper', 'lower', 'full'],
];

const GROUPS: Partial<Record<DayType, MuscleGroup[]>> = {
  chest: ['chest'],
  back: ['back'],
  shoulders: ['shoulders'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves'],
  arms: ['biceps', 'triceps', 'forearms'],
  core: ['core'],
  glutes: ['glutes', 'hamstrings'],
  upper: ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms'],
  lower: ['quads', 'hamstrings', 'glutes', 'calves'],
};

/** Does this exercise belong on a day of these types? Push/pull use the force type, others the primary muscles. */
export function fitsDay(e: Exercise, dayTypes: DayType[]): boolean {
  if (!dayTypes.length || dayTypes.includes('full') || dayTypes.includes('custom')) return true;
  const groups = groupsOf(e);
  return dayTypes.some((d) => {
    if (d === 'push') return e.forceType === 'push' && !groups.includes('core');
    if (d === 'pull') return e.forceType === 'pull';
    return (GROUPS[d] ?? []).some((g) => groups.includes(g));
  });
}

export function dayTitle(dayTypes: DayType[], customName?: string): string {
  if (customName?.trim()) return customName.trim();
  const real = dayTypes.filter((d) => d !== 'custom');
  if (!real.length) return 'Strength workout';
  const names = real.map((d) => DAY_TYPE_LABELS[d]);
  return `${names.join(' + ')}${real.length === 1 && !['upper', 'lower', 'full'].includes(real[0]) ? ' day' : ''}`;
}

/** Same-day comparison key: sessions with the same set of day types (or custom name) are "the same day". */
export function dayKeyOf(dayTypes: DayType[], customName?: string): string {
  if (customName?.trim()) return `custom:${customName.trim().toLowerCase()}`;
  return [...dayTypes].sort().join('+') || 'none';
}
