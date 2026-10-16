import Dexie, { type EntityTable } from 'dexie';
import type {
  ActivityDef,
  ActivityLog,
  BodyLog,
  FoodEntry,
  Goal,
  MoodLog,
  SavedFood,
  Settings,
  SleepLog,
  Summary,
  UserProfile,
} from './types';

/** Bump when the stored shape changes; add a `.version(n).upgrade()` step below. */
export const SCHEMA_VERSION = 2;

export class LevelUpDB extends Dexie {
  profile!: EntityTable<UserProfile, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  goals!: EntityTable<Goal, 'id'>;
  activities!: EntityTable<ActivityDef, 'id'>;
  activityLogs!: EntityTable<ActivityLog, 'id'>;
  foodEntries!: EntityTable<FoodEntry, 'id'>;
  savedFoods!: EntityTable<SavedFood, 'id'>;
  bodyLogs!: EntityTable<BodyLog, 'id'>;
  sleepLogs!: EntityTable<SleepLog, 'id'>;
  moodLogs!: EntityTable<MoodLog, 'id'>;
  summaries!: EntityTable<Summary, 'id'>;

  constructor(name = 'levelup') {
    super(name);
    this.version(1).stores({
      profile: 'id',
      settings: 'id',
      goals: 'id, active, startedAt',
      activities: 'id, kind, archived, order',
      activityLogs: 'id, date, activityId, [activityId+date]',
      foodEntries: 'id, date, meal',
      savedFoods: 'id, type, name, useCount, lastUsedAt',
      bodyLogs: 'id, date',
      sleepLogs: 'id, &date',
      moodLogs: 'id, &date',
      summaries: 'id, kind, rangeStart',
      parseCache: 'key, createdAt',
    });
    // v2: AI parsing removed — drop the parse cache table.
    this.version(2).stores({ parseCache: null });
    // Future migrations: this.version(3).stores({ ... }).upgrade(tx => tx.table('…').toCollection().modify(…));
  }
}

export const TABLES = [
  'profile',
  'settings',
  'goals',
  'activities',
  'activityLogs',
  'foodEntries',
  'savedFoods',
  'bodyLogs',
  'sleepLogs',
  'moodLogs',
  'summaries',
] as const;
export type TableName = (typeof TABLES)[number];
