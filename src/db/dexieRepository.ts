import { LevelUpDB, SCHEMA_VERSION, TABLES, type TableName } from './dexie';
import { EXPORT_FORMAT, EXPORT_VERSION, type ExportBundle, type RecordOf, type Repository } from './repository';
import type { ActivityLog, Goal, Settings, SplitPlan, StrengthSession } from './types';
import { newId } from '@/lib/id';
import { migrateLegacyStrength } from '@/domain/strength/migrate';

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  theme: 'system',
  dayBoundaryHour: 0,
  weekStartsOn: 1,
  weeklySummaryDay: 0,
  graceDaysPerWeek: 1,
  reminders: { enabled: false },
  onboarded: false,
  disclaimerAccepted: false,
  haptics: true,
  fasting: null,
};

const bySessionTime = (a: StrengthSession, b: StrengthSession) => (a.date === b.date ? a.startedAt - b.startedAt : a.date < b.date ? -1 : 1);

export class DexieRepository implements Repository {
  constructor(readonly db: LevelUpDB) {}

  async getProfile() {
    return this.db.profile.get('me');
  }
  async saveProfile(profile: RecordOf<'profile'>) {
    await this.db.profile.put({ ...profile, updatedAt: Date.now() });
  }

  async getSettings(): Promise<Settings> {
    const s = await this.db.settings.get('app');
    return { ...DEFAULT_SETTINGS, ...s, reminders: { ...DEFAULT_SETTINGS.reminders, ...s?.reminders } };
  }
  async updateSettings(patch: Partial<Omit<Settings, 'id'>>) {
    const next = { ...(await this.getSettings()), ...patch, id: 'app' as const };
    await this.db.settings.put(next);
    return next;
  }

  async getActiveGoal() {
    const goals = await this.db.goals.toArray();
    return goals.filter((g) => g.active).sort((a, b) => b.startedAt - a.startedAt)[0];
  }
  async listGoals() {
    return (await this.db.goals.toArray()).sort((a, b) => b.startedAt - a.startedAt);
  }
  async setActiveGoal(goal: Omit<Goal, 'id' | 'active' | 'startedAt'>) {
    const now = Date.now();
    const next: Goal = { ...goal, id: newId(), active: true, startedAt: now };
    await this.db.transaction('rw', this.db.goals, async () => {
      const current = await this.db.goals.filter((g) => g.active).toArray();
      for (const g of current) await this.db.goals.put({ ...g, active: false, endedAt: now });
      await this.db.goals.add(next);
    });
    return next;
  }

  async listActivities(opts?: { includeArchived?: boolean }) {
    const all = await this.db.activities.orderBy('order').toArray();
    return opts?.includeArchived ? all : all.filter((a) => !a.archived);
  }
  async getActivity(id: string) {
    return this.db.activities.get(id);
  }
  async saveActivity(def: RecordOf<'activities'>) {
    await this.db.activities.put(def);
  }

  async logsInRange(start: string, end: string, activityId?: string) {
    if (activityId) {
      return this.db.activityLogs
        .where('[activityId+date]')
        .between([activityId, start], [activityId, end], true, true)
        .toArray();
    }
    return this.db.activityLogs.where('date').between(start, end, true, true).toArray();
  }
  async getLog(id: string) {
    return this.db.activityLogs.get(id);
  }
  async saveLog(log: RecordOf<'activityLogs'>) {
    await this.db.activityLogs.put(log);
  }
  async saveLogs(logs: RecordOf<'activityLogs'>[]) {
    await this.db.activityLogs.bulkPut(logs);
  }
  async lastLogFor(activityId: string, before?: string) {
    const logs = await this.db.activityLogs
      .where('[activityId+date]')
      .between([activityId, ''], [activityId, before ?? '￿'], true, false)
      .toArray();
    return logs.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))[0];
  }

  async foodInRange(start: string, end: string) {
    return this.db.foodEntries.where('date').between(start, end, true, true).sortBy('createdAt');
  }
  async saveFood(entries: RecordOf<'foodEntries'>[]) {
    await this.db.foodEntries.bulkPut(entries);
  }
  async listSaved() {
    return (await this.db.savedFoods.toArray()).sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }
  async saveSaved(item: RecordOf<'savedFoods'>) {
    await this.db.savedFoods.put(item);
  }

  async bodyInRange(start: string, end: string) {
    return this.db.bodyLogs.where('date').between(start, end, true, true).sortBy('date');
  }
  async latestBody() {
    const all = await this.db.bodyLogs.orderBy('date').reverse().toArray();
    return all.find((b) => b.weightKg != null);
  }
  async saveBody(log: RecordOf<'bodyLogs'>) {
    await this.db.bodyLogs.put(log);
  }
  async sleepInRange(start: string, end: string) {
    return this.db.sleepLogs.where('date').between(start, end, true, true).sortBy('date');
  }
  async saveSleep(log: RecordOf<'sleepLogs'>) {
    // one sleep log per morning
    await this.db.transaction('rw', this.db.sleepLogs, async () => {
      const existing = await this.db.sleepLogs.where('date').equals(log.date).first();
      if (existing && existing.id !== log.id) await this.db.sleepLogs.delete(existing.id);
      await this.db.sleepLogs.put(log);
    });
  }
  async moodInRange(start: string, end: string) {
    return this.db.moodLogs.where('date').between(start, end, true, true).sortBy('date');
  }
  async saveMood(log: RecordOf<'moodLogs'>) {
    await this.db.transaction('rw', this.db.moodLogs, async () => {
      const existing = await this.db.moodLogs.where('date').equals(log.date).first();
      if (existing && existing.id !== log.id) await this.db.moodLogs.delete(existing.id);
      await this.db.moodLogs.put(log);
    });
  }

  async getSummary(id: string) {
    return this.db.summaries.get(id);
  }
  async saveSummary(summary: RecordOf<'summaries'>) {
    await this.db.summaries.put(summary);
  }
  async listSummaries(kind: 'day' | 'week', limit = 20) {
    const all = await this.db.summaries.where('kind').equals(kind).toArray();
    return all.sort((a, b) => (a.rangeStart < b.rangeStart ? 1 : -1)).slice(0, limit);
  }

  async remove<T extends TableName>(table: T, id: string) {
    const t = this.db.table(table);
    const rec = (await t.get(id)) as RecordOf<T> | undefined;
    if (rec) await t.delete(id);
    return rec;
  }
  async restore<T extends TableName>(table: T, record: RecordOf<T>) {
    await this.db.table(table).put(record);
  }

  async rangeData(start: string, end: string) {
    const [activities, logs, food, sleep, body, mood, sessions, customExercises, splitPlans] = await Promise.all([
      this.listActivities({ includeArchived: true }),
      this.logsInRange(start, end),
      this.foodInRange(start, end),
      this.sleepInRange(start, end),
      this.bodyInRange(start, end),
      this.moodInRange(start, end),
      this.sessionsInRange(start, end),
      this.listCustomExercises(),
      this.listSplitPlans(),
    ]);
    return { activities, logs, food, sleep, body, mood, sessions, customExercises, splitPlans };
  }

  // ---------------------------------------------------------------- strength

  async listCustomExercises() {
    return this.db.customExercises.toArray();
  }
  async saveCustomExercise(ex: RecordOf<'customExercises'>) {
    await this.db.customExercises.put(ex);
  }
  async listExercisePrefs() {
    return this.db.exercisePrefs.toArray();
  }
  async saveExercisePref(pref: RecordOf<'exercisePrefs'>) {
    await this.db.exercisePrefs.put(pref);
  }
  async getSession(id: string) {
    return this.db.strengthSessions.get(id);
  }
  async saveSession(session: StrengthSession, log?: ActivityLog) {
    const s = { ...session, exerciseIds: [...new Set(session.exercises.map((e) => e.exerciseId))], updatedAt: Date.now() };
    await this.db.transaction('rw', this.db.strengthSessions, this.db.activityLogs, async () => {
      await this.db.strengthSessions.put(s);
      if (log) await this.db.activityLogs.put(log);
    });
  }
  async saveSessions(sessions: StrengthSession[]) {
    await this.db.strengthSessions.bulkPut(sessions);
  }
  async removeSession(id: string) {
    return this.db.transaction('rw', this.db.strengthSessions, this.db.activityLogs, async () => {
      const session = await this.db.strengthSessions.get(id);
      if (!session) return undefined;
      const log = session.activityLogId ? await this.db.activityLogs.get(session.activityLogId) : undefined;
      await this.db.strengthSessions.delete(id);
      if (log) await this.db.activityLogs.delete(log.id);
      return { session, log };
    });
  }
  async restoreSession(rec: { session: StrengthSession; log?: ActivityLog }) {
    await this.saveSession(rec.session, rec.log);
  }
  async sessionsInRange(start: string, end: string) {
    const all = await this.db.strengthSessions.where('date').between(start, end, true, true).toArray();
    return all.filter((s) => s.status === 'done').sort(bySessionTime);
  }
  async sessionsWithExercise(exerciseId: string) {
    const all = await this.db.strengthSessions.where('exerciseIds').equals(exerciseId).toArray();
    return all.filter((s) => s.status === 'done').sort(bySessionTime);
  }
  async allSessions() {
    return (await this.db.strengthSessions.where('status').equals('done').toArray()).sort(bySessionTime);
  }
  async inProgressSession() {
    const all = await this.db.strengthSessions.where('status').equals('in_progress').toArray();
    return all.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }
  async listRoutines(opts?: { includeArchived?: boolean }) {
    const all = await this.db.routines.orderBy('order').toArray();
    return opts?.includeArchived ? all : all.filter((r) => !r.archived);
  }
  async saveRoutine(routine: RecordOf<'routines'>) {
    await this.db.routines.put({ ...routine, updatedAt: Date.now() });
  }
  async listSplitPlans() {
    return (await this.db.splitPlans.toArray()).sort((a, b) => b.createdAt - a.createdAt);
  }
  async saveSplitPlan(plan: SplitPlan) {
    await this.db.transaction('rw', this.db.splitPlans, async () => {
      if (plan.active) {
        const others = await this.db.splitPlans.filter((p) => p.active && p.id !== plan.id).toArray();
        for (const o of others) await this.db.splitPlans.put({ ...o, active: false });
      }
      await this.db.splitPlans.put(plan);
    });
  }
  async migrateLegacyStrength() {
    return this.db.transaction('rw', this.db.activities, this.db.activityLogs, this.db.strengthSessions, this.db.customExercises, async () => {
      const ids = new Set((await this.db.activities.toArray()).filter((d) => d.isStrength).map((d) => d.id));
      if (!ids.size) return 0;
      const logs = await this.db.activityLogs.filter((l) => ids.has(l.activityId) && !l.sessionId).toArray();
      if (!logs.length) return 0;
      const { sessions, newCustom, patches } = migrateLegacyStrength(logs, ids, await this.db.customExercises.toArray());
      await this.db.customExercises.bulkPut(newCustom);
      await this.db.strengthSessions.bulkPut(sessions);
      for (const p of patches) await this.db.activityLogs.update(p.id, { sessionId: p.sessionId });
      return sessions.length;
    });
  }

  async exportAll(): Promise<ExportBundle> {
    const data: ExportBundle['data'] = {};
    for (const t of TABLES) data[t] = await this.db.table(t).toArray();
    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data,
    };
  }

  async importAll(bundle: ExportBundle, mode: 'replace' | 'merge') {
    if (bundle?.format !== EXPORT_FORMAT) throw new Error('This file is not a LevelUp export.');
    if (bundle.version > EXPORT_VERSION) throw new Error('This export was made by a newer version of LevelUp.');
    const tables = TABLES.map((t) => this.db.table(t));
    await this.db.transaction('rw', tables, async () => {
      for (const t of TABLES) {
        const rows = bundle.data[t];
        if (mode === 'replace') await this.db.table(t).clear();
        if (Array.isArray(rows) && rows.length) await this.db.table(t).bulkPut(rows);
      }
    });
    // exports from before v3 carry free-text strength logs only
    await this.migrateLegacyStrength();
  }

  async deleteAll() {
    await this.db.transaction('rw', TABLES.map((t) => this.db.table(t)), async () => {
      for (const t of TABLES) await this.db.table(t).clear();
    });
  }
}
