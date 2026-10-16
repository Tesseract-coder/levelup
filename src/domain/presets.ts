import type { ActivityDef, Intensity, Schedule, Special, TrackingType } from '@/db/types';
import { newId } from '@/lib/id';

export interface Preset {
  key: string;
  name: string;
  kind: 'workout' | 'habit';
  trackingType: TrackingType;
  icon: string;
  unit?: string;
  target?: number;
  schedule: Schedule;
  met?: number;
  hasDistance?: boolean;
  isStrength?: boolean;
  special?: Special;
  aggregate?: 'sum' | 'last';
  presets?: number[];
  /** Words used to match free-text activity notes ("cycled 40 min"). */
  keywords: string[];
  /** Short label for the target question in onboarding. */
  targetLabel?: string;
}

const weekly = (times: number): Schedule => ({ type: 'weekly', times });
const daily: Schedule = { type: 'daily' };

/** MET values from the Compendium of Physical Activities (moderate effort). */
export const WORKOUT_PRESETS: Preset[] = [
  { key: 'cycling', name: 'Cycling', kind: 'workout', trackingType: 'duration', icon: 'bike', unit: 'min', target: 40, schedule: weekly(3), met: 7.5, hasDistance: true, keywords: ['cycl', 'bike', 'biking', 'cycle', 'spin'] },
  { key: 'running', name: 'Running', kind: 'workout', trackingType: 'duration', icon: 'footprints', unit: 'min', target: 30, schedule: weekly(3), met: 9.8, hasDistance: true, keywords: ['run', 'ran', 'jog'] },
  { key: 'walking', name: 'Walking', kind: 'workout', trackingType: 'duration', icon: 'walk', unit: 'min', target: 30, schedule: weekly(5), met: 3.5, hasDistance: true, keywords: ['walk'] },
  { key: 'incline_walk', name: 'Inclined walk / treadmill', kind: 'workout', trackingType: 'duration', icon: 'mountain', unit: 'min', target: 30, schedule: weekly(3), met: 6.0, hasDistance: true, keywords: ['incline', 'treadmill', 'hike', 'hiking'] },
  { key: 'cardio', name: 'Cardio', kind: 'workout', trackingType: 'duration', icon: 'heart', unit: 'min', target: 30, schedule: weekly(3), met: 7.0, keywords: ['cardio', 'elliptical', 'rowing', 'zumba', 'dance', 'skipping', 'jump rope'] },
  { key: 'strength', name: 'Strength training', kind: 'workout', trackingType: 'duration', icon: 'dumbbell', unit: 'min', target: 45, schedule: weekly(3), met: 5.0, isStrength: true, keywords: ['strength', 'gym', 'weights', 'lift', 'push day', 'pull day', 'leg day', 'workout'] },
  { key: 'yoga', name: 'Yoga', kind: 'workout', trackingType: 'duration', icon: 'leaf', unit: 'min', target: 30, schedule: weekly(3), met: 2.5, keywords: ['yoga', 'surya'] },
  { key: 'stretching', name: 'Stretching', kind: 'workout', trackingType: 'duration', icon: 'stretch', unit: 'min', target: 10, schedule: weekly(5), met: 2.3, keywords: ['stretch', 'mobility'] },
  { key: 'swimming', name: 'Swimming', kind: 'workout', trackingType: 'duration', icon: 'waves', unit: 'min', target: 30, schedule: weekly(2), met: 7.0, hasDistance: true, keywords: ['swim'] },
  { key: 'hiit', name: 'HIIT', kind: 'workout', trackingType: 'duration', icon: 'zap', unit: 'min', target: 20, schedule: weekly(2), met: 8.0, keywords: ['hiit', 'interval', 'tabata', 'circuit', 'crossfit'] },
  { key: 'sports', name: 'Sports', kind: 'workout', trackingType: 'duration', icon: 'trophy', unit: 'min', target: 60, schedule: weekly(2), met: 7.0, keywords: ['football', 'cricket', 'badminton', 'tennis', 'basketball', 'soccer', 'sport', 'squash', 'volleyball'] },
];

export const HABIT_PRESETS: Preset[] = [
  { key: 'sleep', name: 'Sleep', kind: 'habit', trackingType: 'numeric', icon: 'moon', unit: 'h', target: 7.5, schedule: daily, special: 'sleep', aggregate: 'last', keywords: ['slept', 'sleep'], targetLabel: 'Hours per night' },
  { key: 'water', name: 'Water', kind: 'habit', trackingType: 'numeric', icon: 'water', unit: 'ml', target: 3000, schedule: daily, special: 'water', aggregate: 'sum', presets: [250, 500, 750], keywords: ['water', 'drank'], targetLabel: 'ml per day' },
  { key: 'learning', name: 'Learning something new', kind: 'habit', trackingType: 'duration', icon: 'learn', unit: 'min', target: 30, schedule: daily, aggregate: 'sum', presets: [15, 30, 60], keywords: ['learn', 'studied', 'study', 'course', 'practis', 'practic'], targetLabel: 'Minutes per day' },
  { key: 'reading', name: 'Reading', kind: 'habit', trackingType: 'duration', icon: 'book', unit: 'min', target: 20, schedule: daily, aggregate: 'sum', presets: [10, 20, 30], keywords: ['read'], targetLabel: 'Minutes per day' },
  { key: 'meditation', name: 'Meditation', kind: 'habit', trackingType: 'duration', icon: 'brain', unit: 'min', target: 10, schedule: daily, aggregate: 'sum', presets: [5, 10, 20], keywords: ['meditat', 'breathwork', 'pranayam'], targetLabel: 'Minutes per day' },
  { key: 'journaling', name: 'Journaling', kind: 'habit', trackingType: 'check', icon: 'journal', schedule: daily, keywords: ['journal', 'diary'] },
  { key: 'no_sugar', name: 'No sugar', kind: 'habit', trackingType: 'avoid', icon: 'candy', schedule: daily, keywords: ['sugar', 'sweets', 'dessert'] },
  { key: 'no_junk', name: 'No junk food', kind: 'habit', trackingType: 'avoid', icon: 'pizza', schedule: daily, keywords: ['junk', 'fast food'] },
  { key: 'steps', name: 'Steps', kind: 'habit', trackingType: 'numeric', icon: 'footprints', unit: 'steps', target: 8000, schedule: daily, special: 'steps', aggregate: 'last', presets: [5000, 8000, 10000], keywords: ['steps'], targetLabel: 'Steps per day' },
  { key: 'skincare', name: 'Skincare', kind: 'habit', trackingType: 'check', icon: 'sparkles', schedule: daily, keywords: ['skincare', 'skin care'] },
];

export const ALL_PRESETS = [...WORKOUT_PRESETS, ...HABIT_PRESETS];

export const ACTIVITY_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

export function presetToDef(p: Preset, order: number, overrides: Partial<ActivityDef> = {}): ActivityDef {
  return {
    id: newId(),
    name: p.name,
    kind: p.kind,
    trackingType: p.trackingType,
    unit: p.unit,
    target: p.target,
    schedule: p.schedule,
    color: ACTIVITY_COLORS[order % ACTIVITY_COLORS.length],
    icon: p.icon,
    archived: false,
    order,
    special: p.special,
    met: p.met,
    hasDistance: p.hasDistance,
    isStrength: p.isStrength,
    aggregate: p.aggregate ?? 'sum',
    presets: p.presets,
    createdAt: Date.now(),
    ...overrides,
  };
}

export function customDef(name: string, kind: 'workout' | 'habit', order: number, trackingType: TrackingType = kind === 'workout' ? 'duration' : 'check'): ActivityDef {
  return presetToDef(
    {
      key: 'custom',
      name,
      kind,
      trackingType,
      icon: kind === 'workout' ? 'activity' : 'target',
      unit: trackingType === 'duration' ? 'min' : undefined,
      target: kind === 'workout' ? 30 : undefined,
      schedule: kind === 'workout' ? weekly(3) : daily,
      met: kind === 'workout' ? 5 : undefined,
      keywords: [],
    },
    order,
  );
}

/** Find the preset that best matches a definition (by name), for keyword matching of free text. */
export function keywordsFor(def: Pick<ActivityDef, 'name' | 'special'>): string[] {
  const p = ALL_PRESETS.find((x) => x.name === def.name || (def.special && x.special === def.special));
  const base = def.name.toLowerCase().split(/[\s/]+/).filter((w) => w.length > 2);
  return [...new Set([...(p?.keywords ?? []), ...base])];
}

const INTENSITY_FACTOR: Record<Intensity, number> = { easy: 0.75, moderate: 1, hard: 1.25 };

/** kcal ≈ MET × kg × hours, adjusted for intensity. Rounded to 5 kcal — it's an estimate. */
export function caloriesBurned(met: number | undefined, weightKg: number, minutes: number, intensity: Intensity = 'moderate'): number {
  if (!met || !weightKg || !minutes) return 0;
  return Math.round((met * INTENSITY_FACTOR[intensity] * weightKg * (minutes / 60)) / 5) * 5;
}
