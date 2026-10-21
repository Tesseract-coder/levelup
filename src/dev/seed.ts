/**
 * Demo data: ~60 days of realistic, deterministic logs plus 12 weeks of strength sessions so Insights and summaries can be previewed.
 * Used by Settings → "Load demo data", the `?demo=1` URL flag and the e2e tests.
 */
import type { Repository } from '@/db/repository';
import type { ActivityLog, FoodEntry, Meal } from '@/db/types';
import { addDays, minToHm, todayKey } from '@/domain/dates';
import { FOODS, gramsFor, macrosFor } from '@/domain/foodDb';
import { HABIT_PRESETS, WORKOUT_PRESETS, caloriesBurned, presetToDef } from '@/domain/presets';
import { computeTargets } from '@/domain/targets';
import { newId } from '@/lib/id';
import { seedStrength } from './strengthSeed';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const MENUS: Record<Meal, [string, number, string?][][]> = {
  breakfast: [
    [['egg_boiled', 2], ['bread_brown', 2], ['peanut_butter', 1], ['black_coffee', 1]],
    [['poha', 1], ['chai', 1]],
    [['idli', 3], ['sambar', 1], ['coconut_chutney', 1]],
    [['oats_cooked', 1], ['banana', 1], ['milk', 1, 'cup']],
    [['besan_chilla', 2], ['curd', 1], ['chai', 1]],
    [['omelette', 1], ['bread_brown', 2], ['coffee_milk', 1]],
  ],
  lunch: [
    [['roti', 2], ['dal', 1], ['mixed_veg', 1], ['curd', 1]],
    [['rice', 1], ['rajma', 1], ['salad', 1]],
    [['roti', 3], ['chole', 1], ['raita', 1]],
    [['chicken_curry', 1], ['rice', 1], ['salad', 1]],
    [['paneer_butter_masala', 1], ['roti', 2], ['salad', 1]],
    [['veg_pulao', 1], ['raita', 1]],
  ],
  snack: [
    [['banana', 1], ['almonds', 1]],
    [['chai', 1], ['biscuit', 3]],
    [['greek_yogurt', 1], ['apple', 1]],
    [['roasted_chana', 1], ['buttermilk', 1]],
    [['whey', 1], ['milk', 1]],
    [['samosa', 1], ['chai', 1]],
  ],
  dinner: [
    [['paneer_bhurji', 1], ['roti', 2]],
    [['dal', 1], ['rice', 1], ['bhindi', 1]],
    [['chicken_breast', 150, 'g'], ['salad', 1], ['roti', 1]],
    [['khichdi', 1], ['curd', 1]],
    [['palak_paneer', 1], ['roti', 2]],
    [['egg_curry', 1], ['rice', 1]],
    [['chicken_biryani', 1], ['raita', 1]],
  ],
  other: [],
};

export async function seedDemoData(repo: Repository, days = 60) {
  const r = rng(42);
  const today = todayKey();
  const now = Date.now();
  await repo.deleteAll();

  const profile = { sex: 'male' as const, age: 31, heightCm: 175, weightKg: 84, targetWeightKg: 76, activityLevel: 'light' as const, goal: 'lose_fat' as const };
  const t = computeTargets(profile);
  await repo.saveProfile({ id: 'me', name: 'Alex', sex: profile.sex, birthYear: new Date().getFullYear() - profile.age, heightCm: profile.heightCm, units: 'metric', activityLevel: profile.activityLevel, dietPreference: 'non_vegetarian', avoidList: [], eatingPattern: '3 meals + snacks', createdAt: now - days * 86400_000, updatedAt: now });
  await repo.setActiveGoal({ type: 'lose_fat', startWeightKg: profile.weightKg, targetWeightKg: profile.targetWeightKg, targetDate: addDays(today, 120), calorieTarget: t.calories, proteinTarget: t.proteinG, carbsTarget: t.carbsG, fatTarget: t.fatG, waterTargetMl: t.waterMl, sleepTargetMin: 450, stepsTarget: t.steps, reason: 'Demo data' });

  const created = now - days * 86400_000;
  const pick = (keys: string[], all = [...WORKOUT_PRESETS, ...HABIT_PRESETS]) => keys.map((k) => all.find((p) => p.key === k)!);
  const defs = pick(['running', 'strength', 'incline_walk', 'yoga', 'sleep', 'water', 'learning', 'reading', 'no_sugar', 'journaling', 'steps']).map((p, i) =>
    presetToDef(p, i, { createdAt: created, target: p.special === 'water' ? t.waterMl : p.target, schedule: p.key === 'running' ? { type: 'weekly', times: 3 } : p.key === 'strength' ? { type: 'weekly', times: 3 } : p.key === 'yoga' ? { type: 'weekly', times: 2 } : p.key === 'incline_walk' ? { type: 'weekly', times: 2 } : p.schedule }),
  );
  for (const d of defs) await repo.saveActivity(d);
  const by = (k: string) => defs.find((d) => d.name === [...WORKOUT_PRESETS, ...HABIT_PRESETS].find((p) => p.key === k)!.name)!;

  let weight = profile.weightKg;
  const food: FoodEntry[] = [];
  const logs: ActivityLog[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const dow = new Date(date + 'T12:00').getDay();
    const isToday = i === 0;
    const progress = (days - i) / days; // habits improve over time
    const ts = now - i * 86400_000;

    // food: 85% of days logged; today only breakfast + lunch
    if (r() < 0.88) {
      const meals: Meal[] = isToday ? ['breakfast', 'lunch'] : ['breakfast', 'lunch', 'snack', 'dinner'];
      for (const meal of meals) {
        if (meal === 'snack' && r() < 0.3) continue;
        const menu = MENUS[meal][Math.floor(r() * MENUS[meal].length)];
        for (const [id, qty, unit] of menu) {
          const f = FOODS.find((x) => x.id === id)!;
          const u = unit ?? f.defaultUnit;
          const grams = Math.round(gramsFor(f, u, qty));
          const m = macrosFor(f, grams);
          food.push({ id: newId(), date, meal, name: f.name, quantity: qty, unit: u, gramsEst: grams, ...m, confidence: 0.75, assumptions: 'demo data', source: 'offline', createdAt: ts });
        }
      }
    }
    // workouts: runs Tue/Thu/Sat-ish (strength sessions are seeded separately, Mon/Wed/Fri)
    const w = (key: string, min: number, intensity: 'easy' | 'moderate' | 'hard', extra: Partial<ActivityLog> = {}) => {
      const d = by(key);
      logs.push({ id: newId(), activityId: d.id, date, value: min, durationMin: min, intensity, caloriesBurnedEst: caloriesBurned(d.met, weight, min, intensity), createdAt: ts, ...extra });
    };
    if (!isToday) {
      if ([2, 4, 6].includes(dow) && r() < 0.55 + 0.3 * progress) w('running', 25 + Math.round(r() * 15), r() < 0.3 ? 'hard' : 'moderate', { distanceKm: Math.round((3.5 + r() * 2.5) * 10) / 10 });
      if (dow === 0 && r() < 0.6) w('incline_walk', 30, 'easy');
      if (r() < 0.2) w('yoga', 20, 'easy');
    }
    // habits
    const habit = (key: string, value: number) => logs.push({ id: newId(), activityId: by(key).id, date, value, durationMin: by(key).trackingType === 'duration' ? value : undefined, createdAt: ts });
    if (!isToday || r() < 0.5) {
      if (r() < 0.55 + 0.35 * progress) habit('learning', [15, 30, 30, 45, 60][Math.floor(r() * 5)]);
      if (r() < 0.5) habit('reading', [10, 20, 30][Math.floor(r() * 3)]);
      if (r() < 0.6 + 0.2 * progress) habit('journaling', 1);
      habit('no_sugar', r() < 0.65 + 0.2 * progress ? 1 : 0);
      habit('steps', Math.round((5000 + r() * 6000) / 100) * 100);
    }
    const glasses = isToday ? 4 : 6 + Math.floor(r() * 7);
    for (let g = 0; g < glasses; g++) logs.push({ id: newId(), activityId: by('water').id, date, value: 250, createdAt: ts + g });
    // sleep
    if (r() < 0.9) {
      const bed = 22 * 60 + 30 + Math.round((r() - 0.3) * 120);
      const dur = Math.round(330 + r() * 150 + progress * 20);
      await repo.saveSleep({ id: newId(), date, bedtime: minToHm(bed), wake: minToHm(bed + dur), durationMin: dur, quality: 2 + Math.floor(r() * 4), createdAt: ts });
      if (r() < 0.6) await repo.saveMood({ id: newId(), date, mood: Math.min(5, 2 + Math.round(r() * 2) + (dur > 420 ? 1 : 0)), energy: Math.min(5, 1 + Math.round(r() * 2) + (dur > 420 ? 2 : 0)), createdAt: ts });
    }
    // weight: gentle downward trend with noise, logged ~4×/week
    weight = weight - 0.07 + (r() - 0.5) * 0.2;
    if (r() < 0.6 || i === 0) await repo.saveBody({ id: newId(), date, weightKg: Math.round((weight + (r() - 0.5) * 0.6) * 10) / 10, createdAt: ts });
  }
  await repo.saveFood(food);
  await repo.saveLogs(logs);
  await repo.saveSaved({ id: newId(), type: 'meal', name: 'Usual breakfast', items: MENUS.breakfast[0].map(([id, q]) => { const f = FOODS.find((x) => x.id === id)!; const g = Math.round(gramsFor(f, f.defaultUnit, q)); return { name: f.name, quantity: q, unit: f.defaultUnit, gramsEst: g, ...macrosFor(f, g) }; }), defaultMeal: 'breakfast', useCount: 12, lastUsedAt: now, createdAt: now });
  await seedStrength(repo, r, today, by('strength').id, profile.weightKg - 3);
  await repo.updateSettings({ onboarded: true, disclaimerAccepted: true, demoData: true });
}
