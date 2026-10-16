import { LevelUpDB, SCHEMA_VERSION, TABLES, type TableName } from './dexie';
import { EXPORT_FORMAT, EXPORT_VERSION, type ExportBundle, type RecordOf, type Repository } from './repository';
import type { Goal, Settings } from './types';
import { newId } from '@/lib/id';

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
    const [activities, logs, food, sleep, body, mood] = await Promise.all([
      this.listActivities({ includeArchived: true }),
      this.logsInRange(start, end),
      this.foodInRange(start, end),
      this.sleepInRange(start, end),
      this.bodyInRange(start, end),
      this.moodInRange(start, end),
    ]);
    return { activities, logs, food, sleep, body, mood };
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
  }

  async deleteAll() {
    await this.db.transaction('rw', TABLES.map((t) => this.db.table(t)), async () => {
      for (const t of TABLES) await this.db.table(t).clear();
    });
  }
}
