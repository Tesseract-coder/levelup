import Dexie, { type EntityTable } from 'dexie';
import type {
  ActivityDef,
  ActivityLog,
  BodyLog,
  Exercise,
  ExercisePref,
  FoodEntry,
  Goal,
  MoodLog,
  Routine,
  SavedFood,
  Settings,
  SleepLog,
  SplitPlan,
  StrengthSession,
  Summary,
  UserProfile,
} from './types';
import { migrateLegacyStrength } from '@/domain/strength/migrate';

/** Bump when the stored shape changes; add a `.version(n).upgrade()` step below. */
export const SCHEMA_VERSION = 3;

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
  strengthSessions!: EntityTable<StrengthSession, 'id'>;
  customExercises!: EntityTable<Exercise, 'id'>;
  exercisePrefs!: EntityTable<ExercisePref, 'exerciseId'>;
  routines!: EntityTable<Routine, 'id'>;
  splitPlans!: EntityTable<SplitPlan, 'id'>;

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
    // v3: strength training — sessions with embedded exercises/sets, custom exercises, routines, split plans.
    // Legacy strength logs (free-text exercises) become sessions linked back to their ActivityLog.
    this.version(3)
      .stores({
        strengthSessions: 'id, date, status, *exerciseIds, activityLogId',
        customExercises: 'id, name',
        exercisePrefs: 'exerciseId',
        routines: 'id, order',
        splitPlans: 'id',
      })
      .upgrade(async (tx) => {
        const defs: ActivityDef[] = await tx.table('activities').toArray();
        const ids = new Set(defs.filter((d) => d.isStrength).map((d) => d.id));
        if (!ids.size) return;
        const logs: ActivityLog[] = await tx.table('activityLogs').filter((l: ActivityLog) => ids.has(l.activityId)).toArray();
        const { sessions, newCustom, patches } = migrateLegacyStrength(logs, ids);
        await tx.table('customExercises').bulkPut(newCustom);
        await tx.table('strengthSessions').bulkPut(sessions);
        for (const p of patches) await tx.table('activityLogs').update(p.id, { sessionId: p.sessionId });
      });
    // Future migrations: this.version(4).stores({ ... }).upgrade(tx => tx.table('…').toCollection().modify(…));
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
  'strengthSessions',
  'customExercises',
  'exercisePrefs',
  'routines',
  'splitPlans',
] as const;
export type TableName = (typeof TABLES)[number];
