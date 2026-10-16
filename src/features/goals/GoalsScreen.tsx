import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Dumbbell, Lightbulb, ListChecks, Pencil, Scale, Sparkles, Utensils } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, Chip, IconButton, Input, Notice, PageHeader, SectionHeader, Skeleton } from '@/components/ui';
import { repo } from '@/db';
import type { Goal, GoalType } from '@/db/types';
import { useFood, useGoal, useGoalHistory, useLatestWeight, useProfile, useRangeData, useToday } from '@/hooks/data';
import { addDays, formatShort, toKey } from '@/domain/dates';
import { ageFromBirthYear, calorieFloor, computeTargets, formatWeight, GOAL_LABELS, targetCautions } from '@/domain/targets';
import { sumMacros } from '@/domain/nutrition';
import { calorieSuggestion, habitSuggestions, localMealIdeas, workoutSuggestions, type Suggestion } from '@/domain/suggestions';
import { ALL_PRESETS, customDef, presetToDef } from '@/domain/presets';
import { suggestMeals } from '@/lib/ai';
import { refresh } from '@/lib/queryClient';
import { useUI } from '@/stores/ui';

export default function GoalsScreen() {
  const navigate = useNavigate();
  const today = useToday();
  const { data: goal } = useGoal();
  const { data: history = [] } = useGoalHistory();
  const { data: profile } = useProfile();
  const { data: latest } = useLatestWeight();
  const { data } = useRangeData(addDays(today, -30), today);
  const [editing, setEditing] = useState(false);

  const suggestions = useMemo(() => {
    if (!goal || !data || !profile) return [];
    return [calorieSuggestion(goal, profile.sex, data, today), ...workoutSuggestions(goal, data.activities), ...habitSuggestions(data, today, goal)].filter((x): x is Suggestion => !!x);
  }, [goal, data, profile, today]);

  if (!goal || !profile) return <div className="p-4"><Skeleton className="h-64" /></div>;
  const units = profile.units;
  const current = latest?.weightKg ?? goal.startWeightKg;
  const target = goal.targetWeightKg;
  const progress = target != null && target !== goal.startWeightKg ? (goal.startWeightKg - current) / (goal.startWeightKg - target) : null;

  return (
    <div>
      <PageHeader title="Goals & plan" left={<IconButton label="Back" onClick={() => navigate(-1)}><ArrowLeft size={22} /></IconButton>} right={<IconButton label="Edit goal and targets" onClick={() => setEditing(true)}><Pencil size={20} /></IconButton>} />
      <div className="space-y-4 px-4">
        <Card className="bg-accent text-on-accent">
          <p className="text-sm font-semibold opacity-90">Current goal · since {formatShort(toKey(new Date(goal.startedAt)))}</p>
          <p className="text-2xl font-extrabold">
            {GOAL_LABELS[goal.type].emoji} {goal.type === 'custom' ? goal.customText : GOAL_LABELS[goal.type].label}
          </p>
          {target != null && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-sm opacity-95">
                <span>Start {formatWeight(goal.startWeightKg, units)}</span>
                <span>Now {formatWeight(current, units)}</span>
                <span>Goal {formatWeight(target, units)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/25" role="progressbar" aria-label="Progress to goal weight" aria-valuenow={Math.round(Math.max(0, Math.min(1, progress ?? 0)) * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-white" style={{ width: `${Math.max(0, Math.min(1, progress ?? 0)) * 100}%` }} />
              </div>
              {goal.targetDate && <p className="mt-1 text-sm opacity-90">Target date {formatShort(goal.targetDate)}</p>}
            </div>
          )}
        </Card>

        {editing ? (
          <GoalEditor goal={goal} onDone={() => setEditing(false)} />
        ) : (
          <Card>
            <h2 className="mb-2 font-bold">Daily targets</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                ['Calories', `${goal.calorieTarget.toLocaleString()} kcal`],
                ['Protein', `${goal.proteinTarget} g`],
                ['Carbs', `${goal.carbsTarget} g`],
                ['Fat', `${goal.fatTarget} g`],
                ['Water', `${(goal.waterTargetMl / 1000).toFixed(1)} L`],
                ['Sleep', `${(goal.sleepTargetMin / 60).toFixed(1)} h`],
                ['Steps', goal.stepsTarget.toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-line py-1.5">
                  <dt className="text-muted">{k}</dt>
                  <dd className="tabular font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <Button variant="soft" size="sm" className="mt-3" onClick={() => setEditing(true)}>
              <Pencil size={16} /> Edit goal or targets
            </Button>
          </Card>
        )}

        <SectionHeader title="Suggestions for you" />
        {suggestions.length === 0 && <p className="px-1 text-sm text-muted">No changes suggested right now — keep logging and we'll adapt as data comes in.</p>}
        <ul className="space-y-2">
          {suggestions.map((s) => (
            <SuggestionCard key={s.id} s={s} goal={goal} />
          ))}
        </ul>

        <MealIdeas goal={goal} diet={profile.dietPreference} avoid={profile.avoidList} />

        {history.length > 1 && (
          <>
            <SectionHeader title="Goal history" />
            <Card className="p-2">
              <ul>
                {history.map((g) => (
                  <li key={g.id} className="flex min-h-14 items-center gap-3 border-b border-line px-2 py-2 last:border-0">
                    <span className="text-xl" aria-hidden>{GOAL_LABELS[g.type].emoji}</span>
                    <span className="flex-1">
                      <span className="block font-semibold">
                        {g.type === 'custom' ? g.customText : GOAL_LABELS[g.type].label} {g.active && <span className="ml-1 rounded-full bg-good-soft px-2 text-xs text-good">active</span>}
                      </span>
                      <span className="tabular block text-sm text-muted">
                        {formatShort(toKey(new Date(g.startedAt)))}
                        {g.endedAt ? ` – ${formatShort(toKey(new Date(g.endedAt)))}` : ' – now'} · {g.calorieTarget.toLocaleString()} kcal · {g.proteinTarget} g protein
                        {g.reason ? ` · ${g.reason}` : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
        <p className="px-1 pb-2 text-xs text-muted">LevelUp provides general guidance, not medical advice.</p>
      </div>
    </div>
  );
}

function SuggestionCard({ s, goal }: { s: Suggestion; goal: Goal }) {
  const [done, setDone] = useState(false);
  const icon = s.kind === 'calories' || s.kind === 'caution' ? <Scale size={18} /> : s.kind === 'workout' ? <Dumbbell size={18} /> : s.kind === 'habit' ? <ListChecks size={18} /> : <Lightbulb size={18} />;
  return (
    <li>
      <Card className="flex gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink">{icon}</span>
        <div className="flex-1">
          <p className="font-semibold">{s.title}</p>
          <p className="text-sm text-muted">{s.body}</p>
          {s.action && !done && (
            <Button
              size="sm"
              variant="soft"
              className="mt-2"
              onClick={async () => {
                if (s.action!.type === 'adjustCalories') {
                  const { id: _id, active: _a, startedAt: _s, endedAt: _e, ...rest } = goal;
                  await repo.setActiveGoal({ ...rest, calorieTarget: goal.calorieTarget + s.action!.delta, carbsTarget: Math.max(50, goal.carbsTarget + Math.round(s.action!.delta / 4)), reason: `Accepted suggestion: ${s.action!.delta > 0 ? '+' : ''}${s.action!.delta} kcal` });
                } else {
                  const h = s.action!.habit;
                  const acts = await repo.listActivities({ includeArchived: true });
                  const preset = ALL_PRESETS.find((p) => p.name === h.name || (h.special && p.special === h.special));
                  await repo.saveActivity(preset ? presetToDef(preset, acts.length) : { ...customDef(h.name, h.kind ?? 'habit', acts.length, h.trackingType), icon: h.icon ?? 'target' });
                }
                await refresh();
                setDone(true);
                useUI.getState().showSnack({ message: 'Done — you can change it any time' });
              }}
            >
              {s.action.label}
            </Button>
          )}
          {done && <p className="mt-2 text-sm font-semibold text-good">Applied ✓</p>}
        </div>
      </Card>
    </li>
  );
}

function MealIdeas({ goal, diet, avoid }: { goal: Goal; diet: Parameters<typeof localMealIdeas>[0]; avoid: string[] }) {
  const today = useToday();
  const { data: food = [] } = useFood(today);
  const t = sumMacros(food);
  const gap = Math.max(0, goal.proteinTarget - t.proteinG);
  const kcalLeft = goal.calorieTarget - t.calories;
  const local = localMealIdeas(diet, avoid, gap, kcalLeft);
  const ai = useQuery({
    queryKey: ['mealIdeas', gap, Math.round(kcalLeft / 50), diet, avoid.join(',')],
    enabled: gap >= 15,
    retry: false,
    queryFn: () => suggestMeals({ goal: GOAL_LABELS[goal.type].label, diet, avoid, proteinGapG: gap, caloriesLeft: kcalLeft }),
  });
  if (gap < 15) return null;
  const ideas = ai.data?.length ? ai.data.map((i) => ({ name: i.name, serving: i.description, proteinG: i.proteinG, calories: i.calories })) : local;
  return (
    <Card>
      <h2 className="flex items-center gap-2 font-bold">
        <Utensils size={18} className="text-protein" aria-hidden /> You need {gap} g more protein today
      </h2>
      <p className="mb-3 text-sm text-muted">{kcalLeft > 0 ? `${kcalLeft.toLocaleString()} kcal left. ` : ''}Options that match your diet preference:</p>
      {ai.isLoading ? (
        <Skeleton className="h-24" />
      ) : (
        <ul className="space-y-2">
          {ideas.map((i) => (
            <li key={i.name} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
              <span className="flex-1">
                <span className="block font-semibold">{i.name}</span>
                <span className="block text-sm text-muted">{i.serving}</span>
              </span>
              <span className="tabular text-right text-sm">
                <span className="block font-bold text-ink">≈{i.proteinG} g</span>
                <span className="block text-muted">{i.calories} kcal</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 flex items-center gap-1 text-xs text-muted">
        {ai.data?.length ? <><Sparkles size={12} /> AI ideas · estimates</> : 'From the built-in food list · estimates'}
      </p>
    </Card>
  );
}

const GOALS = Object.keys(GOAL_LABELS) as GoalType[];

function GoalEditor({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const { data: profile } = useProfile();
  const { data: latest } = useLatestWeight();
  const today = useToday();
  const [type, setType] = useState<GoalType>(goal.type);
  const [customText, setCustomText] = useState(goal.customText ?? '');
  const [f, setF] = useState({
    calorieTarget: String(goal.calorieTarget),
    proteinTarget: String(goal.proteinTarget),
    carbsTarget: String(goal.carbsTarget),
    fatTarget: String(goal.fatTarget),
    waterTargetMl: String(goal.waterTargetMl),
    sleepTargetMin: String(goal.sleepTargetMin),
    stepsTarget: String(goal.stepsTarget),
    targetWeightKg: goal.targetWeightKg != null ? String(goal.targetWeightKg) : '',
    targetDate: goal.targetDate ?? '',
  });
  if (!profile) return null;
  const weightKg = latest?.weightKg ?? goal.startWeightKg;
  const recompute = (t: GoalType) => {
    const c = computeTargets({ sex: profile.sex, age: ageFromBirthYear(profile.birthYear), heightCm: profile.heightCm, weightKg, targetWeightKg: parseFloat(f.targetWeightKg) || undefined, activityLevel: profile.activityLevel, goal: t });
    setF((x) => ({ ...x, calorieTarget: String(c.calories), proteinTarget: String(c.proteinG), carbsTarget: String(c.carbsG), fatTarget: String(c.fatG), waterTargetMl: String(c.waterMl), stepsTarget: String(c.steps) }));
  };
  const cautions = targetCautions({ sex: profile.sex, calories: Number(f.calorieTarget) || 0, weightKg, targetWeightKg: parseFloat(f.targetWeightKg) || undefined, targetDate: f.targetDate || undefined, today });
  const field = (k: keyof typeof f, label: string, suffix?: string) => <Input label={label} inputMode="numeric" suffix={suffix} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />;
  return (
    <Card className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold">Goal</p>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <Chip key={g} selected={type === g} onClick={() => { setType(g); recompute(g); }}>
              {GOAL_LABELS[g].emoji} {GOAL_LABELS[g].label}
            </Chip>
          ))}
        </div>
        {type === 'custom' && <Input className="mt-2" label="Describe your goal" value={customText} maxLength={80} onChange={(e) => setCustomText(e.target.value)} />}
        {type !== goal.type && <p className="mt-2 text-sm text-muted">Targets were recalculated for the new goal — adjust if you like.</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('calorieTarget', 'Calories', 'kcal')}
        {field('proteinTarget', 'Protein', 'g')}
        {field('carbsTarget', 'Carbs', 'g')}
        {field('fatTarget', 'Fat', 'g')}
        {field('waterTargetMl', 'Water', 'ml')}
        {field('sleepTargetMin', 'Sleep', 'min')}
        {field('stepsTarget', 'Steps')}
        {field('targetWeightKg', 'Target weight', 'kg')}
      </div>
      <Input label="Target date (optional)" type="date" min={today} value={f.targetDate} onChange={(e) => setF({ ...f, targetDate: e.target.value })} />
      {cautions.map((c) => <Notice key={c} tone="caution">{c}</Notice>)}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onDone}>Cancel</Button>
        <Button
          className="flex-1"
          disabled={!(Number(f.calorieTarget) > 0) || (type === 'custom' && !customText.trim())}
          onClick={async () => {
            const n = (k: keyof typeof f) => Math.round(Number(f[k]) || 0);
            await repo.setActiveGoal({
              type,
              customText: type === 'custom' ? customText.trim() : undefined,
              startWeightKg: type === goal.type ? goal.startWeightKg : weightKg,
              targetWeightKg: parseFloat(f.targetWeightKg) || undefined,
              targetDate: f.targetDate || undefined,
              calorieTarget: n('calorieTarget'),
              proteinTarget: n('proteinTarget'),
              carbsTarget: n('carbsTarget'),
              fatTarget: n('fatTarget'),
              waterTargetMl: n('waterTargetMl'),
              sleepTargetMin: n('sleepTargetMin'),
              stepsTarget: n('stepsTarget'),
              reason: type !== goal.type ? 'Changed goal' : 'Edited targets',
            });
            // keep the water habit target in sync
            const water = (await repo.listActivities()).find((a) => a.special === 'water');
            if (water) await repo.saveActivity({ ...water, target: n('waterTargetMl') });
            await refresh();
            useUI.getState().showSnack({ message: Number(f.calorieTarget) < calorieFloor(profile.sex) ? 'Saved. Please take care with very low targets.' : 'Goal updated — history kept' });
            onDone();
          }}
        >
          Save
        </Button>
      </div>
    </Card>
  );
}
