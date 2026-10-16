import { describe, expect, it } from 'vitest';
import { bmr, calorieFloor, computeTargets, targetCautions, cmToFtIn, ftInToCm, kgToLb, lbToKg } from '@/domain/targets';

describe('Mifflin-St Jeor', () => {
  it('matches the published formula', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(bmr({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 })).toBe(1780);
    // 10*60 + 6.25*165 - 5*28 - 161 = 1330.25
    expect(bmr({ sex: 'female', weightKg: 60, heightCm: 165, age: 28 })).toBeCloseTo(1330.25);
  });
});

describe('computeTargets', () => {
  const base = { sex: 'male' as const, age: 30, heightCm: 180, weightKg: 80, activityLevel: 'moderate' as const };

  it('applies a moderate deficit for fat loss', () => {
    const t = computeTargets({ ...base, goal: 'lose_fat' });
    expect(t.tdee).toBe(2759);
    expect(t.calories).toBeLessThan(t.tdee);
    expect(t.tdee - t.calories).toBeLessThanOrEqual(500);
    expect(t.proteinG).toBe(145); // 1.8 g/kg × 80, rounded to 5
  });

  it('applies a small surplus for muscle gain, capped at +300', () => {
    const t = computeTargets({ ...base, goal: 'build_muscle' });
    expect(t.calories).toBeGreaterThan(t.tdee);
    expect(t.calories - t.tdee).toBeLessThanOrEqual(300);
    expect(t.proteinG).toBe(160);
  });

  it('macros add up to roughly the calorie target', () => {
    for (const goal of ['lose_fat', 'build_muscle', 'maintain', 'endurance'] as const) {
      const t = computeTargets({ ...base, goal });
      const kcal = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;
      expect(Math.abs(kcal - t.calories)).toBeLessThan(40);
    }
  });

  it('never goes below the safe floor', () => {
    const t = computeTargets({ sex: 'female', age: 60, heightCm: 150, weightKg: 45, activityLevel: 'sedentary', goal: 'lose_fat' });
    expect(t.calories).toBe(calorieFloor('female'));
    expect(t.flooredToSafeMinimum).toBe(true);
  });

  it('cautions on targets below the floor and aggressive pace', () => {
    expect(targetCautions({ sex: 'male', calories: 1300, weightKg: 80, today: '2026-01-01' })).toHaveLength(1);
    const c = targetCautions({ sex: 'female', calories: 1500, weightKg: 80, targetWeightKg: 60, targetDate: '2026-03-01', today: '2026-01-01' });
    expect(c.some((x) => x.includes('per week'))).toBe(true);
    expect(targetCautions({ sex: 'female', calories: 1500, weightKg: 80, targetWeightKg: 75, targetDate: '2026-06-01', today: '2026-01-01' })).toHaveLength(0);
  });
});

describe('units', () => {
  it('round-trips', () => {
    expect(lbToKg(kgToLb(72))).toBeCloseTo(72);
    expect(cmToFtIn(180)).toEqual({ ft: 5, in: 11 });
    expect(ftInToCm(5, 11)).toBeCloseTo(180.34);
  });
});
