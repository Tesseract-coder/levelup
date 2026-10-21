import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { LevelUpDB, SCHEMA_VERSION } from '@/db/dexie';
import { DexieRepository } from '@/db/dexieRepository';

describe('schema migration', () => {
  it('upgrades a v1 database: drops the parse cache, keeps user data', async () => {
    const name = 'migrate-test';
    const v1 = new Dexie(name);
    v1.version(1).stores({ foodEntries: 'id, date, meal', parseCache: 'key, createdAt', settings: 'id' });
    await v1.open();
    await v1.table('foodEntries').put({ id: 'f1', date: '2026-01-01', meal: 'lunch', name: 'Dal', calories: 165 });
    await v1.table('parseCache').put({ key: 'k', createdAt: 1 });
    v1.close();

    const db = new LevelUpDB(name);
    await db.open();
    expect(db.verno).toBe(SCHEMA_VERSION);
    expect(db.tables.map((t) => t.name)).not.toContain('parseCache');
    expect(await db.foodEntries.get('f1')).toMatchObject({ name: 'Dal', calories: 165 });
    db.close();
  });

  it('v2 → v3 turns legacy strength logs into sessions linked to their log', async () => {
    const name = 'migrate-strength';
    const v2 = new Dexie(name);
    v2.version(1).stores({ activities: 'id, kind, archived, order', activityLogs: 'id, date, activityId, [activityId+date]', parseCache: 'key' });
    v2.version(2).stores({ parseCache: null });
    await v2.open();
    await v2.table('activities').bulkPut([
      { id: 'str', name: 'Strength training', kind: 'workout', isStrength: true, order: 0, archived: false },
      { id: 'run', name: 'Running', kind: 'workout', order: 1, archived: false },
    ]);
    await v2.table('activityLogs').bulkPut([
      {
        id: 'l1', activityId: 'str', date: '2026-09-01', value: 45, durationMin: 45, intensity: 'hard', caloriesBurnedEst: 280, createdAt: 1_000_000,
        exercises: [
          { name: 'Bench press', sets: [{ reps: 8, weightKg: 60 }, { reps: 8, weightKg: 60 }] },
          { name: 'DB curls', sets: [{ reps: 12, weightKg: 10 }] },
          { name: 'Zottman curl', sets: [{ reps: 10, weightKg: 8 }] },
        ],
      },
      { id: 'l2', activityId: 'str', date: '2026-09-03', value: 30, durationMin: 30, createdAt: 2_000_000 },
      { id: 'l3', activityId: 'run', date: '2026-09-03', value: 30, durationMin: 30, createdAt: 2_000_000 },
    ]);
    v2.close();

    const db = new LevelUpDB(name);
    await db.open();
    const sessions = await db.strengthSessions.orderBy('date').toArray();
    expect(sessions).toHaveLength(2);
    const [s1, s2] = sessions;
    expect(s1).toMatchObject({ date: '2026-09-01', status: 'done', durationMin: 45, intensity: 'vigorous', kcalEstimate: 280, source: 'migrated', activityLogId: 'l1' });
    expect(s1.exercises.map((e) => e.exerciseId).slice(0, 2)).toEqual(['barbell_bench_press', 'dumbbell_curl']);
    // bench 2×8×60 = 960, curls bilateral 12×10×2 = 240, custom 10×8 = 80
    expect(s1.totalVolumeKg).toBe(1280);
    expect(s1.exercises[0].sets.every((s) => s.type === 'working' && s.completed)).toBe(true);
    expect(s2.exercises).toEqual([]);
    const custom = await db.customExercises.toArray();
    expect(custom.map((c) => c.name)).toEqual(['Zottman curl']);
    expect(s1.exerciseIds).toContain(custom[0].id);
    expect((await db.activityLogs.get('l1'))?.sessionId).toBe(s1.id);
    expect((await db.activityLogs.get('l3'))?.sessionId).toBeUndefined();
    // per-exercise index works
    expect(await db.strengthSessions.where('exerciseIds').equals('barbell_bench_press').count()).toBe(1);
    db.close();
  });

  it('importing a pre-v3 export migrates its strength logs; re-running is a no-op', async () => {
    const db = new LevelUpDB('import-strength');
    const repo = new DexieRepository(db);
    await repo.importAll(
      {
        format: 'levelup-export',
        version: 1,
        schemaVersion: 2,
        exportedAt: '',
        data: {
          activities: [{ id: 'str', name: 'Strength training', kind: 'workout', isStrength: true, order: 0, archived: false } as never],
          activityLogs: [{ id: 'l1', activityId: 'str', date: '2026-09-01', value: 40, createdAt: 1, exercises: [{ name: 'Squat', sets: [{ reps: 5, weightKg: 100 }] }] } as never],
        },
      },
      'replace',
    );
    const all = await repo.allSessions();
    expect(all).toHaveLength(1);
    expect(all[0].exercises[0].exerciseId).toBe('back_squat');
    expect(await repo.migrateLegacyStrength()).toBe(0);
    const bundle = await repo.exportAll();
    expect(bundle.schemaVersion).toBe(3);
    expect(bundle.data.strengthSessions).toHaveLength(1);
    await repo.deleteAll();
    expect(await repo.allSessions()).toHaveLength(0);
    db.close();
  });
});
