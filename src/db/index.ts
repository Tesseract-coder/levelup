import { LevelUpDB } from './dexie';
import { DexieRepository } from './dexieRepository';
import type { Repository } from './repository';

export const db = new LevelUpDB();
/** The single storage entry point for the app. Swap for a synced implementation later. */
export const repo: Repository = new DexieRepository(db);

export type { Repository } from './repository';
export * from './types';
