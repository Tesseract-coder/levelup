import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { LevelUpDB } from '@/db/dexie';

describe('schema migration', () => {
  it('upgrades a v1 database to v2: drops the parse cache, keeps user data', async () => {
    const name = 'migrate-test';
    const v1 = new Dexie(name);
    v1.version(1).stores({ foodEntries: 'id, date, meal', parseCache: 'key, createdAt', settings: 'id' });
    await v1.open();
    await v1.table('foodEntries').put({ id: 'f1', date: '2026-01-01', meal: 'lunch', name: 'Dal', calories: 165 });
    await v1.table('parseCache').put({ key: 'k', createdAt: 1 });
    v1.close();

    const db = new LevelUpDB(name);
    await db.open();
    expect(db.verno).toBe(2);
    expect(db.tables.map((t) => t.name)).not.toContain('parseCache');
    expect(await db.foodEntries.get('f1')).toMatchObject({ name: 'Dal', calories: 165 });
    db.close();
  });
});
