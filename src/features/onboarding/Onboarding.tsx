import clsx from 'clsx';
import { ArrowLeft, Check, Plus, ShieldCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { repo } from '@/db';
import type { ActivityLevel, DietPreference, GoalType, Schedule, Sex, UnitSystem } from '@/db/types';
import { Button, Chip, Input, Notice, Segmented, Stepper, Toggle } from '@/components/ui';
import { ActivityIcon } from '@/components/icons';
import {
  ACTIVITY_LABELS,
  GOAL_LABELS,
  computeTargets,
  ftInToCm,
  kgToLb,
  lbToKg,
  targetCautions,
} from '@/domain/targets';
import { HABIT_PRESETS, WORKOUT_PRESETS, customDef, presetToDef, type Preset } from '@/domain/presets';
import { todayKey, formatDuration } from '@/domain/dates';
import { refresh } from '@/lib/queryClient';
import { newId } from '@/lib/id';
import { requestNotificationPermission } from '@/features/reminders/useReminders';

interface Pick {
  target?: number;
  times?: number;
}
interface CustomItem {
  id: string;
  name: string;
  kind: 'workout' | 'habit';
}

const DIETS: { value: DietPreference; label: string }[] = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'eggetarian', label: 'Vegetarian + egg' },
  { value: 'non_vegetarian', label: 'Non-vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'other', label: 'Other' },
];
const AVOID_SUGGESTIONS = ['Peanuts', 'Gluten', 'Lactose', 'Shellfish', 'Soy', 'Onion & garlic', 'Mushrooms'];
const PATTERNS = ['3 meals', '3 meals + snacks', '2 meals', 'Intermittent fasting', 'Irregular'];

const STEPS = ['welcome', 'goal', 'body', 'activity', 'activities', 'targets', 'diet', 'nutrition', 'reminders', 'plan'] as const;
type StepName = (typeof STEPS)[number];
const SKIPPABLE: StepName[] = ['activities', 'targets', 'diet', 'reminders'];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const name = STEPS[step];

  const [disclaimer, setDisclaimer] = useState(false);
  const [goal, setGoal] = useState<GoalType | null>(null);
  const [customGoal, setCustomGoal] = useState('');
  const [units, setUnits] = useState<UnitSystem>('metric');
  const [sex, setSex] = useState<Sex>('female');
  const [age, setAge] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [ft, setFt] = useState('');
  const [inch, setInch] = useState('');
  const [weight, setWeight] = useState(''); // in display units
  const [targetWeight, setTargetWeight] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [activity, setActivity] = useState<ActivityLevel>('light');
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [customs, setCustoms] = useState<CustomItem[]>([]);
  const [customDraft, setCustomDraft] = useState<{ name: string; kind: 'workout' | 'habit' } | null>(null);
  const [diet, setDiet] = useState<DietPreference>('vegetarian');
  const [avoid, setAvoid] = useState<string[]>([]);
  const [avoidDraft, setAvoidDraft] = useState('');
  const [pattern, setPattern] = useState('3 meals + snacks');
  const [overrides, setOverrides] = useState<Partial<Record<'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'waterMl' | 'sleepMin' | 'steps', number>>>({});
  const [reminders, setReminders] = useState({ enabled: false, meals: '13:30', workout: '18:00', evening: '21:30' });
  const [saving, setSaving] = useState(false);

  const toKg = (v: string) => {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return undefined;
    return units === 'imperial' ? lbToKg(n) : n;
  };
  const height = units === 'imperial' ? ftInToCm(Number(ft) || 0, Number(inch) || 0) : Number(heightCm) || 0;
  const weightKg = toKg(weight);
  const targetWeightKg = toKg(targetWeight);
  const ageN = Number(age) || 0;
  const bodyValid = ageN >= 13 && ageN <= 100 && height >= 120 && height <= 230 && !!weightKg && weightKg >= 30 && weightKg <= 300;

  const computed = useMemo(
    () =>
      bodyValid && goal
        ? computeTargets({ sex, age: ageN, heightCm: height, weightKg: weightKg!, targetWeightKg, activityLevel: activity, goal })
        : null,
    [bodyValid, goal, sex, ageN, height, weightKg, targetWeightKg, activity],
  );
  const targets = computed && {
    calories: overrides.calories ?? computed.calories,
    proteinG: overrides.proteinG ?? computed.proteinG,
    carbsG: overrides.carbsG ?? computed.carbsG,
    fatG: overrides.fatG ?? computed.fatG,
    waterMl: overrides.waterMl ?? computed.waterMl,
    sleepMin: overrides.sleepMin ?? computed.sleepMin,
    steps: overrides.steps ?? computed.steps,
  };
  const cautions =
    targets && weightKg
      ? targetCautions({ sex, calories: targets.calories, weightKg, targetWeightKg, targetDate: targetDate || undefined, today: todayKey() })
      : [];

  const canNext: Record<StepName, boolean> = {
    welcome: disclaimer,
    goal: !!goal && (goal !== 'custom' || customGoal.trim().length > 1),
    body: bodyValid,
    activity: true,
    activities: true,
    targets: true,
    diet: true,
    nutrition: !!targets && targets.calories >= 800,
    reminders: true,
    plan: true,
  };

  const allPresets = [...WORKOUT_PRESETS, ...HABIT_PRESETS];
  const selected = allPresets.filter((p) => picks[p.key]);

  const togglePreset = (p: Preset) =>
    setPicks((cur) => {
      const n = { ...cur };
      if (n[p.key]) delete n[p.key];
      else n[p.key] = { target: p.target, times: p.schedule.type === 'weekly' ? p.schedule.times : undefined };
      return n;
    });

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  async function finish() {
    if (!targets || !goal || !weightKg) return;
    setSaving(true);
    const now = Date.now();
    await repo.saveProfile({
      id: 'me',
      sex,
      birthYear: new Date().getFullYear() - ageN,
      heightCm: Math.round(height),
      units,
      activityLevel: activity,
      dietPreference: diet,
      avoidList: avoid,
      eatingPattern: pattern,
      createdAt: now,
      updatedAt: now,
    });
    await repo.setActiveGoal({
      type: goal,
      customText: goal === 'custom' ? customGoal.trim() : undefined,
      startWeightKg: Math.round(weightKg * 10) / 10,
      targetWeightKg: targetWeightKg ? Math.round(targetWeightKg * 10) / 10 : undefined,
      targetDate: targetDate || undefined,
      calorieTarget: targets.calories,
      proteinTarget: targets.proteinG,
      carbsTarget: targets.carbsG,
      fatTarget: targets.fatG,
      waterTargetMl: targets.waterMl,
      sleepTargetMin: targets.sleepMin,
      stepsTarget: targets.steps,
      reason: 'Set during onboarding',
    });
    let order = 0;
    for (const p of selected) {
      const pick = picks[p.key];
      let target = pick.target;
      if (p.special === 'water') target = targets.waterMl;
      if (p.special === 'sleep') target = pick.target ?? targets.sleepMin / 60;
      if (p.special === 'steps') target = pick.target ?? targets.steps;
      const schedule: Schedule = p.schedule.type === 'weekly' ? { type: 'weekly', times: pick.times ?? p.schedule.times } : p.schedule;
      await repo.saveActivity(presetToDef(p, order++, { target, schedule }));
    }
    for (const c of customs) await repo.saveActivity(customDef(c.name, c.kind, order++));
    await repo.saveBody({ id: newId(), date: todayKey(), weightKg: Math.round(weightKg * 10) / 10, createdAt: now });
    await repo.updateSettings({
      onboarded: true,
      disclaimerAccepted: true,
      reminders: reminders.enabled ? reminders : { enabled: false },
    });
    await refresh();
    navigate('/', { replace: true });
  }

  const showProgress = step > 0;
  return (
    <div className="flex min-h-dvh flex-col">
      {showProgress && (
        <div className="flex items-center gap-2 px-2 pt-3">
          <button type="button" onClick={back} aria-label="Back" className="grid h-11 w-11 place-items-center rounded-full text-muted">
            <ArrowLeft size={22} />
          </button>
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-ring-track"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={1}
            aria-valuemax={STEPS.length - 1}
            aria-valuenow={step}
          >
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} />
          </div>
          {SKIPPABLE.includes(name) ? (
            <button type="button" onClick={next} className="min-h-11 px-3 text-sm font-semibold text-muted">
              Skip
            </button>
          ) : (
            <span className="w-14" />
          )}
        </div>
      )}

      <div key={name} className="animate-rise flex-1 overflow-y-auto px-5 pb-6 pt-4">
        {name === 'welcome' && (
          <div className="flex flex-col pt-10">
            <img src="/icons/icon-192.png" alt="" width={72} height={72} className="rounded-2xl" />
            <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Welcome to LevelUp</h1>
            <p className="mt-3 text-lg text-muted">
              Track workouts, habits, sleep and food in one place — and see honestly whether today moved you toward your goal.
            </p>
            <ul className="mt-6 space-y-3 text-base">
              {['About 2 minutes to set up', 'Your data stays on this device', 'No streak guilt — grace days built in'].map((t) => (
                <li key={t} className="flex items-center gap-3">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-good-soft text-good">
                    <Check size={16} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Notice icon={<ShieldCheck size={18} />}>
                <p className="font-semibold">General guidance, not medical advice</p>
                <p className="mt-1 text-muted">
                  LevelUp gives general fitness and nutrition guidance. Numbers are estimates. If you have a medical condition, are pregnant, or
                  have a history of disordered eating, please check with a health professional.
                </p>
              </Notice>
              <label className="mt-4 flex min-h-12 items-center gap-3">
                <input type="checkbox" checked={disclaimer} onChange={(e) => setDisclaimer(e.target.checked)} className="h-6 w-6 accent-[var(--accent)]" />
                <span>I understand</span>
              </label>
            </div>
          </div>
        )}

        {name === 'goal' && (
          <Step title="What's your main goal?" subtitle="This shapes your targets and every suggestion.">
            <div className="space-y-2" role="radiogroup" aria-label="Goal">
              {(Object.keys(GOAL_LABELS) as GoalType[]).map((g) => (
                <OptionCard key={g} selected={goal === g} onClick={() => setGoal(g)} title={GOAL_LABELS[g].label} hint={GOAL_LABELS[g].hint} emoji={GOAL_LABELS[g].emoji} />
              ))}
            </div>
            {goal === 'custom' && (
              <Input className="mt-4" label="Describe your goal" placeholder="e.g. Run a 10K by March" value={customGoal} onChange={(e) => setCustomGoal(e.target.value)} maxLength={80} autoFocus />
            )}
          </Step>
        )}

        {name === 'body' && (
          <Step title="A few body stats" subtitle="Used only to estimate your energy needs. Stored on this device.">
            <Segmented label="Units" value={units} onChange={setUnits} options={[{ value: 'metric', label: 'kg · cm' }, { value: 'imperial', label: 'lb · ft/in' }]} />
            <div className="mt-4">
              <p className="mb-1.5 text-sm font-semibold">Sex (for the calorie formula)</p>
              <Segmented label="Sex" value={sex} onChange={setSex} options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other', label: 'Other' }]} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Input label="Age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} suffix="yrs" />
              {units === 'metric' ? (
                <Input label="Height" inputMode="decimal" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} suffix="cm" />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Height" inputMode="numeric" value={ft} onChange={(e) => setFt(e.target.value)} suffix="ft" />
                  <Input label="&nbsp;" aria-label="inches" inputMode="numeric" value={inch} onChange={(e) => setInch(e.target.value)} suffix="in" />
                </div>
              )}
              <Input label="Current weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} suffix={units === 'imperial' ? 'lb' : 'kg'} />
              <Input label="Target weight" placeholder="Optional" inputMode="decimal" value={targetWeight} onChange={(e) => setTargetWeight(e.target.value)} suffix={units === 'imperial' ? 'lb' : 'kg'} />
            </div>
            <Input className="mt-3" label="Target date (optional)" type="date" min={todayKey()} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            {!bodyValid && (age || weight || heightCm || ft) && (
              <p className="mt-3 text-sm text-muted">Please enter an age of 13–100, a height and a weight.</p>
            )}
          </Step>
        )}

        {name === 'activity' && (
          <Step title="How active are you day to day?" subtitle="Not counting the workouts you'll log — those are added separately.">
            <div className="space-y-2" role="radiogroup" aria-label="Activity level">
              {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => (
                <OptionCard key={a} selected={activity === a} onClick={() => setActivity(a)} title={ACTIVITY_LABELS[a].label} hint={ACTIVITY_LABELS[a].hint} />
              ))}
            </div>
          </Step>
        )}

        {name === 'activities' && (
          <Step title="What do you usually do?" subtitle="Pick anything you'd like to track. You can change this any time.">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Workouts</h3>
            <div className="flex flex-wrap gap-2">
              {WORKOUT_PRESETS.map((p) => (
                <Chip key={p.key} selected={!!picks[p.key]} onClick={() => togglePreset(p)}>
                  <ActivityIcon name={p.icon} size={16} /> {p.name}
                </Chip>
              ))}
            </div>
            <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-muted">Habits</h3>
            <div className="flex flex-wrap gap-2">
              {HABIT_PRESETS.map((p) => (
                <Chip key={p.key} selected={!!picks[p.key]} onClick={() => togglePreset(p)}>
                  <ActivityIcon name={p.icon} size={16} /> {p.name}
                </Chip>
              ))}
              {customs.map((c) => (
                <Chip key={c.id} selected onClick={() => setCustoms((cs) => cs.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.name}`}>
                  {c.name} <X size={14} />
                </Chip>
              ))}
              <Chip onClick={() => setCustomDraft({ name: '', kind: 'habit' })}>
                <Plus size={16} /> Add your own
              </Chip>
            </div>
            {customDraft && (
              <div className="mt-4 space-y-3 rounded-2xl bg-surface p-4 shadow-card">
                <Input label="Name" autoFocus value={customDraft.name} maxLength={40} placeholder="e.g. Guitar practice" onChange={(e) => setCustomDraft({ ...customDraft, name: e.target.value })} />
                <Segmented label="Type" value={customDraft.kind} onChange={(kind) => setCustomDraft({ ...customDraft, kind })} options={[{ value: 'habit', label: 'Habit' }, { value: 'workout', label: 'Workout' }]} />
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setCustomDraft(null)}>
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={customDraft.name.trim().length < 2}
                    onClick={() => {
                      setCustoms((cs) => [...cs, { id: newId(), name: customDraft.name.trim(), kind: customDraft.kind }]);
                      setCustomDraft(null);
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            )}
          </Step>
        )}

        {name === 'targets' && (
          <Step title="Set your targets" subtitle="Start small — you can raise them later.">
            {selected.length === 0 && <p className="text-muted">You haven't picked any activities yet. You can add them later from Habits.</p>}
            <div className="space-y-3">
              {selected.map((p) => (
                <TargetEditor
                  key={p.key}
                  preset={p}
                  pick={picks[p.key]}
                  waterMl={targets?.waterMl}
                  onChange={(pick) => setPicks((cur) => ({ ...cur, [p.key]: pick }))}
                  onWater={(ml) => setOverrides((o) => ({ ...o, waterMl: ml }))}
                />
              ))}
            </div>
          </Step>
        )}

        {name === 'diet' && (
          <Step title="How do you eat?" subtitle="Used for meal ideas. Indian and international foods are both supported.">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Diet preference">
              {DIETS.map((d) => (
                <Chip key={d.value} role="radio" aria-checked={diet === d.value} selected={diet === d.value} onClick={() => setDiet(d.value)}>
                  {d.label}
                </Chip>
              ))}
            </div>
            <h3 className="mb-2 mt-5 text-sm font-bold">Allergies or foods to avoid</h3>
            <div className="flex flex-wrap gap-2">
              {[...new Set([...AVOID_SUGGESTIONS, ...avoid])].map((a) => (
                <Chip key={a} selected={avoid.includes(a)} onClick={() => setAvoid((l) => (l.includes(a) ? l.filter((x) => x !== a) : [...l, a]))}>
                  {a}
                </Chip>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = avoidDraft.trim();
                if (v && !avoid.includes(v)) setAvoid((l) => [...l, v]);
                setAvoidDraft('');
              }}
            >
              <Input className="flex-1" aria-label="Add a food to avoid" placeholder="Add another…" value={avoidDraft} onChange={(e) => setAvoidDraft(e.target.value)} maxLength={40} />
              <Button type="submit" variant="soft" aria-label="Add">
                <Plus size={20} />
              </Button>
            </form>
            <h3 className="mb-2 mt-5 text-sm font-bold">Usual eating pattern</h3>
            <div className="flex flex-wrap gap-2">
              {PATTERNS.map((p) => (
                <Chip key={p} selected={pattern === p} onClick={() => setPattern(p)}>
                  {p}
                </Chip>
              ))}
            </div>
          </Step>
        )}

        {name === 'nutrition' && computed && targets && (
          <Step title="Your daily targets" subtitle="Calculated for you. Tap any number to adjust.">
            <div className="rounded-[var(--radius-card)] bg-surface p-4 shadow-card">
              <NumberRow label="Calories" unit="kcal" value={targets.calories} step={50} onChange={(v) => setOverrides((o) => ({ ...o, calories: v }))} color="var(--calories)" />
              <NumberRow label="Protein" unit="g" value={targets.proteinG} step={5} onChange={(v) => setOverrides((o) => ({ ...o, proteinG: v }))} color="var(--protein)" />
              <NumberRow label="Carbs" unit="g" value={targets.carbsG} step={5} onChange={(v) => setOverrides((o) => ({ ...o, carbsG: v }))} color="var(--carbs)" />
              <NumberRow label="Fat" unit="g" value={targets.fatG} step={5} onChange={(v) => setOverrides((o) => ({ ...o, fatG: v }))} color="var(--fat)" />
              <NumberRow label="Water" unit="ml" value={targets.waterMl} step={250} onChange={(v) => setOverrides((o) => ({ ...o, waterMl: v }))} color="var(--water)" />
              <NumberRow label="Sleep" unit="min" value={targets.sleepMin} step={15} display={formatDuration(targets.sleepMin)} onChange={(v) => setOverrides((o) => ({ ...o, sleepMin: v }))} color="var(--sleep)" />
              <NumberRow label="Steps" unit="steps" value={targets.steps} step={500} onChange={(v) => setOverrides((o) => ({ ...o, steps: v }))} color="var(--activity)" last />
            </div>
            <details className="mt-3 rounded-2xl bg-surface-2 p-3 text-sm">
              <summary className="min-h-8 cursor-pointer font-semibold">How we calculated this</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                {computed.explanation.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </details>
            {cautions.map((c) => (
              <div key={c} className="mt-3">
                <Notice tone="caution">{c}</Notice>
              </div>
            ))}
            {Object.keys(overrides).length > 0 && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setOverrides({})}>
                Reset to recommended
              </Button>
            )}
          </Step>
        )}

        {name === 'reminders' && (
          <Step title="Gentle reminders?" subtitle="Optional. We'll only ask for notification permission if you turn this on.">
            <div className="rounded-[var(--radius-card)] bg-surface p-4 shadow-card">
              <Toggle
                checked={reminders.enabled}
                label="Send me reminders"
                onChange={async (on) => {
                  if (on) {
                    const ok = await requestNotificationPermission();
                    setReminders((r) => ({ ...r, enabled: ok }));
                  } else setReminders((r) => ({ ...r, enabled: false }));
                }}
              />
              {reminders.enabled && (
                <div className="mt-3 space-y-3 border-t border-line pt-3">
                  {(
                    [
                      ['meals', 'Log meals'],
                      ['workout', 'Workout'],
                      ['evening', '"Log your day" nudge'],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className="flex min-h-12 items-center justify-between gap-3">
                      <span>{label}</span>
                      <input
                        type="time"
                        value={reminders[k]}
                        onChange={(e) => setReminders((r) => ({ ...r, [k]: e.target.value }))}
                        className="min-h-11 rounded-xl border border-line bg-surface px-3"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-3 text-sm text-muted">Reminders are delivered by your browser. Some phones only show them while LevelUp is installed to the home screen.</p>
          </Step>
        )}

        {name === 'plan' && targets && goal && (
          <Step title="Your plan" subtitle="Here's what LevelUp will help you with.">
            <div className="rounded-[var(--radius-card)] bg-accent p-5 text-on-accent shadow-card">
              <p className="text-sm font-semibold opacity-90">Goal</p>
              <p className="text-2xl font-extrabold">
                {GOAL_LABELS[goal].emoji} {goal === 'custom' ? customGoal : GOAL_LABELS[goal].label}
              </p>
              {targetWeightKg && (
                <p className="mt-1 text-sm opacity-90">
                  {units === 'imperial' ? `${kgToLb(weightKg!).toFixed(0)} → ${kgToLb(targetWeightKg).toFixed(0)} lb` : `${weightKg!.toFixed(1)} → ${targetWeightKg.toFixed(1)} kg`}
                  {targetDate ? ` by ${new Date(targetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                </p>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <PlanStat label="Calories" value={`${targets.calories.toLocaleString()}`} unit="kcal / day" />
              <PlanStat label="Protein" value={`${targets.proteinG}`} unit="g / day" />
              <PlanStat label="Water" value={`${(targets.waterMl / 1000).toFixed(targets.waterMl % 1000 ? 1 : 0)}`} unit="L / day" />
              <PlanStat label="Sleep" value={formatDuration(targets.sleepMin)} unit="per night" />
            </div>
            {(selected.length > 0 || customs.length > 0) && (
              <div className="mt-3 rounded-[var(--radius-card)] bg-surface p-4 shadow-card">
                <p className="mb-2 font-bold">Tracking</p>
                <ul className="space-y-2">
                  {selected.map((p) => (
                    <li key={p.key} className="flex items-center gap-3">
                      <ActivityIcon name={p.icon} className="text-accent-ink" />
                      <span className="flex-1">{p.name}</span>
                      <span className="text-sm text-muted">{describePick(p, picks[p.key], targets.waterMl)}</span>
                    </li>
                  ))}
                  {customs.map((c) => (
                    <li key={c.id} className="flex items-center gap-3">
                      <ActivityIcon name={c.kind === 'workout' ? 'activity' : 'target'} className="text-accent-ink" />
                      <span className="flex-1">{c.name}</span>
                      <span className="text-sm text-muted">{c.kind === 'workout' ? '3× per week' : 'Daily'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-3 text-sm text-muted">All of this is editable later in Profile → Goals & plan.</p>
          </Step>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-line bg-canvas px-5 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        {name === 'plan' ? (
          <Button block size="lg" onClick={finish} disabled={saving}>
            {saving ? 'Saving…' : 'Looks good'}
          </Button>
        ) : (
          <Button block size="lg" onClick={next} disabled={!canNext[name]}>
            {name === 'welcome' ? "Let's start" : 'Continue'}
          </Button>
        )}
      </div>
    </div>
  );
}

function describePick(p: Preset, pick: Pick, waterMl: number) {
  if (p.special === 'water') return `${(waterMl / 1000).toFixed(1)} L / day`;
  if (p.special === 'sleep') return `${pick.target ?? p.target} h / night`;
  if (p.kind === 'workout') return `${pick.times ?? 3}× / week · ${pick.target ?? p.target} min`;
  if (p.trackingType === 'avoid') return 'Daily check-in';
  if (p.trackingType === 'check') return 'Daily';
  return `${(pick.target ?? p.target)?.toLocaleString()} ${p.unit} / day`;
}

function Step({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function OptionCard({ selected, onClick, title, hint, emoji }: { selected: boolean; onClick: () => void; title: string; hint: string; emoji?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={clsx(
        'flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 bg-surface px-4 py-3 text-left transition-colors duration-150',
        selected ? 'border-accent' : 'border-transparent shadow-card',
      )}
    >
      {emoji && (
        <span className="text-2xl" aria-hidden>
          {emoji}
        </span>
      )}
      <span className="flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
      <span className={clsx('grid h-6 w-6 place-items-center rounded-full border-2', selected ? 'border-accent bg-accent text-on-accent' : 'border-line')}>
        {selected && <Check size={14} strokeWidth={3} />}
      </span>
    </button>
  );
}

function TargetEditor({
  preset: p,
  pick,
  onChange,
  waterMl,
  onWater,
}: {
  preset: Preset;
  pick: Pick;
  onChange: (p: Pick) => void;
  waterMl?: number;
  onWater: (ml: number) => void;
}) {
  return (
    <div className="rounded-[var(--radius-card)] bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2 font-semibold">
        <ActivityIcon name={p.icon} className="text-accent-ink" /> {p.name}
      </div>
      {p.kind === 'workout' && (
        <div className="space-y-4">
          <Stepper label={`${p.name} sessions per week`} value={pick.times ?? 3} min={1} max={7} onChange={(times) => onChange({ ...pick, times })} unit="times per week" />
          <Stepper label={`${p.name} minutes per session`} value={pick.target ?? 30} step={5} min={5} max={300} onChange={(target) => onChange({ ...pick, target })} unit="minutes per session" />
        </div>
      )}
      {p.kind === 'habit' && p.special === 'water' && (
        <Stepper label="Water per day" value={waterMl ?? 2500} step={250} min={1000} max={6000} onChange={onWater} unit="ml per day" />
      )}
      {p.kind === 'habit' && p.special === 'sleep' && (
        <Stepper label="Sleep hours" value={pick.target ?? 7.5} step={0.5} min={4} max={11} decimals={1} onChange={(target) => onChange({ ...pick, target })} unit="hours per night" />
      )}
      {p.kind === 'habit' && !p.special && (p.trackingType === 'duration' || p.trackingType === 'numeric' || p.trackingType === 'count') && (
        <Stepper label={`${p.name} target`} value={pick.target ?? p.target ?? 10} step={5} min={5} max={600} onChange={(target) => onChange({ ...pick, target })} unit={`${p.unit} per day`} />
      )}
      {p.special === 'steps' && (
        <Stepper label="Steps per day" value={pick.target ?? 8000} step={500} min={1000} max={30000} onChange={(target) => onChange({ ...pick, target })} unit="steps per day" />
      )}
      {(p.trackingType === 'check' || p.trackingType === 'avoid') && <p className="text-sm text-muted">{p.trackingType === 'avoid' ? 'You’ll get a quick "did you avoid it?" check each day.' : 'One tap each day to check it off.'}</p>}
    </div>
  );
}

function NumberRow({
  label,
  unit,
  value,
  step,
  onChange,
  color,
  display,
  last,
}: {
  label: string;
  unit: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
  color: string;
  display?: string;
  last?: boolean;
}) {
  return (
    <div className={clsx('flex min-h-14 items-center gap-3', !last && 'border-b border-line')}>
      <span className="h-3 w-3 rounded-full" style={{ background: color }} aria-hidden />
      <span className="flex-1 font-medium">{label}</span>
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(0, value - step))} className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2">
        −
      </button>
      <label className="w-24 text-center">
        <span className="sr-only">
          {label} ({unit})
        </span>
        {display ? (
          <span className="tabular font-bold">{display}</span>
        ) : (
          <input
            inputMode="numeric"
            className="tabular w-full bg-transparent text-center font-bold outline-none"
            value={value}
            onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)}
          />
        )}
        {!display && <span className="block text-xs text-muted">{unit}</span>}
      </label>
      <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(value + step)} className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2">
        +
      </button>
    </div>
  );
}

function PlanStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-[var(--radius-card)] bg-surface p-4 shadow-card">
      <p className="text-sm text-muted">{label}</p>
      <p className="tabular text-2xl font-extrabold">{value}</p>
      <p className="text-xs text-muted">{unit}</p>
    </div>
  );
}

