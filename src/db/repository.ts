import type {
  ActivityDef,
  ActivityLog,
  BodyLog,
  DateKey,
  Exercise,
  ExercisePref,
  FoodEntry,
  Goal,
  ID,
  MoodLog,
  SavedFood,
  Routine,
  Settings,
  SleepLog,
  SplitPlan,
  StrengthSession,
  Summary,
  UserProfile,
} from './types';
import type { TableName } from './dexie';

export const EXPORT_FORMAT = 'levelup-export';
export const EXPORT_VERSION = 1;

export interface ExportBundle {
  format: typeof EXPORT_FORMAT;
  version: number;
  schemaVersion: number;
  exportedAt: string;
  data: Partial<Record<TableName, unknown[]>>;
}

/** Everything the stats engine needs for a date range. */
export interface RangeData {
  activities: ActivityDef[];
  logs: ActivityLog[];
  food: FoodEntry[];
  sleep: SleepLog[];
  body: BodyLog[];
  mood: MoodLog[];
}

export type RecordOf<T extends TableName> = {
  profile: UserProfile;
  settings: Settings;
  goals: Goal;
  activities: ActivityDef;
  activityLogs: ActivityLog;
  foodEntries: FoodEntry;
  savedFoods: SavedFood;
  bodyLogs: BodyLog;
  sleepLogs: SleepLog;
  moodLogs: MoodLog;
  summaries: Summary;
  strengthSessions: StrengthSession;
  customExercises: Exercise;
  exercisePrefs: ExercisePref;
  routines: Routine;
  splitPlans: SplitPlan;
}[T];

/**
 * Storage boundary. Screens talk only to this interface, so a cloud-synced
 * implementation can replace the local Dexie one without touching UI code.
 */
export interface Repository {
  // profile & settings
  getProfile(): Promise<UserProfile | undefined>;
  saveProfile(profile: UserProfile): Promise<void>;
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<Settings>;

  // goals (history is kept; exactly one is active)
  getActiveGoal(): Promise<Goal | undefined>;
  listGoals(): Promise<Goal[]>;
  setActiveGoal(goal: Omit<Goal, 'id' | 'active' | 'startedAt'>): Promise<Goal>;

  // activity definitions
  listActivities(opts?: { includeArchived?: boolean }): Promise<ActivityDef[]>;
  getActivity(id: ID): Promise<ActivityDef | undefined>;
  saveActivity(def: ActivityDef): Promise<void>;

  // activity logs
  logsInRange(start: DateKey, end: DateKey, activityId?: ID): Promise<ActivityLog[]>;
  getLog(id: ID): Promise<ActivityLog | undefined>;
  saveLog(log: ActivityLog): Promise<void>;
  saveLogs(logs: ActivityLog[]): Promise<void>;
  lastLogFor(activityId: ID, before?: DateKey): Promise<ActivityLog | undefined>;

  // food
  foodInRange(start: DateKey, end: DateKey): Promise<FoodEntry[]>;
  saveFood(entries: FoodEntry[]): Promise<void>;
  listSaved(): Promise<SavedFood[]>;
  saveSaved(item: SavedFood): Promise<void>;

  // body, sleep, mood
  bodyInRange(start: DateKey, end: DateKey): Promise<BodyLog[]>;
  latestBody(): Promise<BodyLog | undefined>;
  saveBody(log: BodyLog): Promise<void>;
  sleepInRange(start: DateKey, end: DateKey): Promise<SleepLog[]>;
  saveSleep(log: SleepLog): Promise<void>;
  moodInRange(start: DateKey, end: DateKey): Promise<MoodLog[]>;
  saveMood(log: MoodLog): Promise<void>;

  // summaries
  getSummary(id: string): Promise<Summary | undefined>;
  saveSummary(summary: Summary): Promise<void>;
  listSummaries(kind: Summary['kind'], limit?: number): Promise<Summary[]>;

  // generic delete/restore (powers the undo snackbar)
  remove<T extends TableName>(table: T, id: string): Promise<RecordOf<T> | undefined>;
  restore<T extends TableName>(table: T, record: RecordOf<T>): Promise<void>;

  rangeData(start: DateKey, end: DateKey): Promise<RangeData>;

  // strength
  listCustomExercises(): Promise<Exercise[]>;
  saveCustomExercise(ex: Exercise): Promise<void>;
  listExercisePrefs(): Promise<ExercisePref[]>;
  saveExercisePref(pref: ExercisePref): Promise<void>;
  getSession(id: ID): Promise<StrengthSession | undefined>;
  /** Saves the session; for finished sessions also writes the linked ActivityLog in the same transaction. */
  saveSession(session: StrengthSession, log?: ActivityLog): Promise<void>;
  /** Deletes a session and its ActivityLog together; returns both for undo. */
  removeSession(id: ID): Promise<{ session: StrengthSession; log?: ActivityLog } | undefined>;
  restoreSession(rec: { session: StrengthSession; log?: ActivityLog }): Promise<void>;
  sessionsInRange(start: DateKey, end: DateKey): Promise<StrengthSession[]>;
  /** Finished sessions containing an exercise, oldest first. */
  sessionsWithExercise(exerciseId: ID): Promise<StrengthSession[]>;
  /** All finished sessions, oldest first. */
  allSessions(): Promise<StrengthSession[]>;
  inProgressSession(): Promise<StrengthSession | undefined>;
  listRoutines(opts?: { includeArchived?: boolean }): Promise<Routine[]>;
  saveRoutine(routine: Routine): Promise<void>;
  listSplitPlans(): Promise<SplitPlan[]>;
  /** Saves a plan; when it's active, deactivates the others. */
  saveSplitPlan(plan: SplitPlan): Promise<void>;
  /** Converts legacy strength logs (free-text exercises, no session) into sessions. Idempotent. */
  migrateLegacyStrength(): Promise<number>;

  // data portability
  exportAll(): Promise<ExportBundle>;
  importAll(bundle: ExportBundle, mode: 'replace' | 'merge'): Promise<void>;
  deleteAll(): Promise<void>;
}
