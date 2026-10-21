import clsx from 'clsx';
import { ArrowDown, ArrowUp, Link2, Repeat, Trash2, Unlink } from 'lucide-react';
import { useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { useCloseSheet, useCloseSheetThen } from '@/components/sheetHistory';
import { Button, Input, Segmented, Stepper, Toggle } from '@/components/ui';
import type { ExerciseSet, SetType } from '@/db/types';
import { useExercisePrefs, useExercises, useStrengthSettings, useWeightUnit } from '@/hooks/strength';
import { PLATES_KG, PLATES_LB, platesPerSide } from '@/domain/strength/plates';
import { fmtSec, toDisplay } from '@/domain/strength/units';
import type { SheetSpec } from '@/stores/ui';
import { setSessionIntensity, updatePref } from './actions';
import { useQuery } from '@tanstack/react-query';
import { repo } from '@/db';
import type { StrengthIntensity } from '@/db/types';
import { STRENGTH_MET, MET_RANGE } from '@/config/strength';
import { estimateSession } from '@/domain/strength/calories';
import { restFor } from './format';

export const SET_TYPE_LABELS: Record<SetType, string> = { warmup: 'Warm-up', working: 'Working', drop: 'Drop set', failure: 'To failure' };

// ------------------------------------------------------------- set details

export function SetDetailsSheet({ spec }: { spec: Extract<SheetSpec, { type: 'setDetails' }> }) {
  const close = useCloseSheet();
  const [set, setSet] = useState<ExerciseSet>(spec.set);
  const [effort, setEffort] = useState<'rpe' | 'rir'>(spec.set.rir != null ? 'rir' : 'rpe');
  const patch = (p: Partial<ExerciseSet>) => {
    setSet((s) => ({ ...s, ...p }));
    spec.onChange(p);
  };
  return (
    <Sheet
      title={`Set ${spec.label}`}
      footer={
        <div className="flex gap-2">
          <Button variant="danger" onClick={() => { spec.onDelete(); close(); }}>
            <Trash2 size={18} /> Delete set
          </Button>
          <Button block className="flex-1" onClick={close}>Done</Button>
        </div>
      }
    >
      <p className="mb-2 text-sm font-semibold">Set type</p>
      <div role="radiogroup" aria-label="Set type" className="grid grid-cols-2 gap-2">
        {(Object.keys(SET_TYPE_LABELS) as SetType[]).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={set.type === t}
            onClick={() => patch({ type: t, isPR: t === 'warmup' ? false : set.isPR })}
            className={clsx('min-h-12 rounded-xl px-3 text-sm font-semibold', set.type === t ? 'bg-accent text-on-accent' : 'bg-surface-2')}
          >
            {SET_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">Warm-up sets don't count towards volume or personal records.</p>

      <div className="mb-2 mt-5 flex items-center justify-between">
        <p className="text-sm font-semibold">Effort (optional)</p>
        <div className="w-40">
          <Segmented label="Effort scale" value={effort} onChange={(v) => { setEffort(v); patch(v === 'rpe' ? { rir: undefined } : { rpe: undefined }); }} options={[{ value: 'rpe', label: 'RPE' }, { value: 'rir', label: 'RIR' }]} />
        </div>
      </div>
      {effort === 'rpe' ? (
        <div role="radiogroup" aria-label="RPE" className="grid grid-cols-5 gap-1.5">
          {[6, 7, 8, 9, 10].map((v) => (
            <button key={v} type="button" role="radio" aria-checked={set.rpe === v} onClick={() => patch({ rpe: set.rpe === v ? undefined : v })} className={clsx('min-h-12 rounded-xl font-bold', set.rpe === v ? 'bg-accent text-on-accent' : 'bg-surface-2')}>
              {v}
            </button>
          ))}
        </div>
      ) : (
        <div role="radiogroup" aria-label="Reps in reserve" className="grid grid-cols-5 gap-1.5">
          {[0, 1, 2, 3, 4].map((v) => (
            <button key={v} type="button" role="radio" aria-checked={set.rir === v} onClick={() => patch({ rir: set.rir === v ? undefined : v })} className={clsx('min-h-12 rounded-xl font-bold', set.rir === v ? 'bg-accent text-on-accent' : 'bg-surface-2')}>
              {v}
              {v === 4 ? '+' : ''}
            </button>
          ))}
        </div>
      )}
      <p className="mt-1 text-xs text-muted">{effort === 'rpe' ? 'RPE 10 = nothing left, 8 = about 2 reps left.' : 'Reps you could still have done.'}</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Input label="Tempo" placeholder="e.g. 3-1-1" value={set.tempo ?? ''} maxLength={12} onChange={(e) => patch({ tempo: e.target.value || undefined })} />
        <Input label="Note" placeholder="optional" value={set.notes ?? ''} maxLength={80} onChange={(e) => patch({ notes: e.target.value || undefined })} />
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------ exercise menu

export function ExerciseMenuSheet({ spec }: { spec: Extract<SheetSpec, { type: 'exerciseMenu' }> }) {
  const closeThen = useCloseSheetThen();
  const { get } = useExercises();
  const prefs = useExercisePrefs();
  const settings = useStrengthSettings();
  const ex = get(spec.entry.exerciseId);
  const pref = prefs.get(ex.id);
  const [notes, setNotes] = useState(spec.entry.notes ?? '');
  const [pain, setPain] = useState(!!spec.entry.pain);
  const defaultRest = pref?.restSec ?? (settings.defaultRestSec || ex.defaultRestSec);
  const [rest, setRest] = useState(spec.entry.restSec ?? defaultRest);
  const [gymNote, setGymNote] = useState(pref?.gymNote ?? '');
  const act = (fn: () => void) => () => void closeThen(fn);

  return (
    <Sheet title={ex.name} description="Exercise options">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" disabled={!spec.canMoveUp} onClick={act(() => spec.onMove(-1))}>
          <ArrowUp size={18} /> Move up
        </Button>
        <Button variant="secondary" size="sm" disabled={!spec.canMoveDown} onClick={act(() => spec.onMove(1))}>
          <ArrowDown size={18} /> Move down
        </Button>
        <Button variant="secondary" size="sm" onClick={act(spec.onSwap)}>
          <Repeat size={18} /> Swap exercise
        </Button>
        <Button variant="secondary" size="sm" disabled={spec.superset === 'none'} onClick={act(spec.onSuperset)}>
          {spec.superset === 'linked' ? <Unlink size={18} /> : <Link2 size={18} />} {spec.superset === 'linked' ? 'Unlink superset' : 'Superset w/ next'}
        </Button>
      </div>

      <div className="mt-5">
        <Stepper
          label="Rest between sets"
          value={rest}
          step={15}
          min={0}
          max={600}
          unit={`seconds rest (${fmtSec(rest)})`}
          onChange={(v) => {
            setRest(v);
            spec.onChange({ restSec: v });
          }}
        />
        <button type="button" className="mt-1 min-h-11 text-sm font-semibold text-accent-ink" onClick={() => void updatePref(ex.id, { restSec: rest })}>
          Use {fmtSec(rest)} for {ex.name} from now on
        </button>
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-semibold">Notes</span>
        <textarea
          value={notes}
          rows={2}
          maxLength={300}
          onChange={(e) => {
            setNotes(e.target.value);
            spec.onChange({ notes: e.target.value || undefined });
          }}
          className="w-full rounded-2xl border border-line bg-surface p-3"
        />
      </label>
      <div className="mt-2">
        <Toggle
          checked={pain}
          onChange={(v) => {
            setPain(v);
            spec.onChange({ pain: v || undefined });
          }}
          label="Felt pain or discomfort"
          description="Flagged in history. Sharp or lasting pain is worth getting checked."
        />
      </div>
      {(ex.equipment === 'machine' || ex.equipment === 'cable') && (
        <Input
          className="mt-3"
          label="Machine / gym note"
          hint="Stack numbers differ between machines, so note which one this is."
          placeholder="e.g. Gym A, plate-loaded"
          value={gymNote}
          maxLength={60}
          onChange={(e) => setGymNote(e.target.value)}
          onBlur={() => void updatePref(ex.id, { gymNote: gymNote.trim() || undefined })}
        />
      )}
      {ex.equipment === 'dumbbell' && (
        <div className="mt-2">
          <Toggle
            checked={pref?.countBothHands ?? ex.bilateralDumbbell}
            onChange={(v) => void updatePref(ex.id, { countBothHands: v })}
            label="Count both hands in volume"
            description="Weight is entered per dumbbell; volume doubles it when you use two."
          />
        </div>
      )}
      <Button block variant="danger" className="mt-5" onClick={act(spec.onRemove)}>
        <Trash2 size={18} /> Remove exercise
      </Button>
    </Sheet>
  );
}

// --------------------------------------------------------- plate calculator

export function PlateCalcSheet({ totalKg }: { totalKg?: number }) {
  const unit = useWeightUnit();
  const settings = useStrengthSettings();
  const barDefault = toDisplay(settings.barWeightKg, unit);
  const [total, setTotal] = useState(totalKg ? toDisplay(totalKg, unit) : unit === 'lb' ? 135 : 60);
  const [bar, setBar] = useState(barDefault);
  const r = platesPerSide(total, bar, unit === 'lb' ? PLATES_LB : PLATES_KG);
  return (
    <Sheet title="Plate calculator" description={`Plates per side on a ${bar} ${unit} bar`}>
      <Stepper label="Total weight" value={total} step={unit === 'lb' ? 5 : 2.5} decimals={2} min={0} max={unit === 'lb' ? 1100 : 500} unit={`${unit} total`} onChange={setTotal} />
      <div className="mt-4 rounded-2xl bg-surface-2 p-4">
        {total <= bar ? (
          <p className="text-center text-sm text-muted">Just the bar.</p>
        ) : (
          <>
            <ul className="flex flex-wrap justify-center gap-2" aria-label="Plates per side">
              {r.perSide.map((p) => (
                <li key={p.plate} className="tabular rounded-xl bg-surface px-3 py-2 text-center">
                  <span className="block text-xl font-extrabold">{p.plate}</span>
                  <span className="text-xs text-muted">× {p.count}</span>
                </li>
              ))}
            </ul>
            {r.remainder > 0 && <p className="mt-3 text-center text-sm text-muted">Closest with standard plates: {r.achieved} {unit}</p>}
          </>
        )}
      </div>
      <p className="mb-2 mt-5 text-sm font-semibold">Bar weight</p>
      <div className="flex flex-wrap gap-2">
        {(unit === 'lb' ? [45, 35, 25, 15] : [20, 15, 10, 7]).map((b) => (
          <button key={b} type="button" aria-pressed={bar === b} onClick={() => setBar(b)} className={clsx('min-h-11 rounded-full border px-4 text-sm font-medium', bar === b ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line')}>
            {b} {unit}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Set your usual bar weight in Profile → Strength.</p>
    </Sheet>
  );
}

// ----------------------------------------------------------------- confirm

export function ConfirmSheet({ spec }: { spec: Extract<SheetSpec, { type: 'confirm' }> }) {
  const close = useCloseSheet();
  const closeThen = useCloseSheetThen();
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={spec.title} description={spec.body}>
      <div className="space-y-2 pb-2">
        {spec.actions.map((a) => (
          <Button
            key={a.label}
            block
            disabled={busy}
            variant={a.variant ?? 'secondary'}
            onClick={async () => {
              setBusy(true);
              await closeThen(a.onClick);
            }}
          >
            {a.label}
          </Button>
        ))}
        <Button block variant="ghost" onClick={close}>
          Cancel
        </Button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------- calorie explanation

const INTENSITY_LABEL: Record<StrengthIntensity, string> = { light: 'Light', moderate: 'Moderate', vigorous: 'Vigorous' };

export function KcalInfoSheet({ sessionId }: { sessionId: string }) {
  const { data: s } = useQuery({ queryKey: ['session', sessionId], queryFn: async () => (await repo.getSession(sessionId)) ?? null });
  const { get } = useExercises();
  const prefs = useExercisePrefs();
  const settings = useStrengthSettings();
  if (!s) return null;
  const est = estimateSession(s, { lookup: get, restOf: (e) => restFor(get(e.exerciseId), e.restSec, prefs.get(e.exerciseId), settings), bodyWeightKg: s.bodyWeightKg, minutes: s.durationMin });
  const auto = estimateSession({ ...s, intensityOverridden: false }, { lookup: get, restOf: (e) => restFor(get(e.exerciseId), e.restSec, prefs.get(e.exerciseId), settings), bodyWeightKg: s.bodyWeightKg, minutes: s.durationMin });
  return (
    <Sheet title="How is this calculated?" size="tall">
      <div className="space-y-4 text-[15px] leading-relaxed">
        <div className="rounded-2xl bg-surface-2 p-4 text-center">
          <p className="tabular text-2xl font-extrabold">
            ≈ {s.kcalLow}–{s.kcalHigh} kcal
          </p>
          <p className="tabular mt-1 text-sm text-muted">
            MET {est.met} × {Math.round(est.weightKg)} kg × {(est.minutes / 60).toFixed(2)} h, shown at MET {est.met - MET_RANGE}–{est.met + MET_RANGE}
          </p>
        </div>
        <div>
          <p className="mb-2 font-semibold">Intensity</p>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Intensity">
            {([null, 'light', 'moderate', 'vigorous'] as (StrengthIntensity | null)[]).map((v) => {
              const on = v == null ? !s.intensityOverridden : s.intensityOverridden && s.intensity === v;
              return (
                <button key={v ?? 'auto'} type="button" role="radio" aria-checked={on} onClick={() => void setSessionIntensity(s, v)} className={clsx('min-h-12 rounded-xl text-sm font-semibold', on ? 'bg-accent text-on-accent' : 'bg-surface-2')}>
                  {v ? INTENSITY_LABEL[v] : 'Auto'}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-muted">
            Auto picked <b>{INTENSITY_LABEL[auto.intensity]}</b> (MET {STRENGTH_MET[auto.intensity]}): {auto.reasons.join(' · ')}.
          </p>
        </div>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>
            <b>MET</b> values come from the Compendium of Physical Activities: light {STRENGTH_MET.light}, moderate {STRENGTH_MET.moderate}, vigorous {STRENGTH_MET.vigorous}.
          </li>
          <li>
            <b>Body weight</b>: {est.weightAssumed ? 'no weight logged yet, so 70 kg is assumed — log your weight for a better estimate.' : `your latest logged weight (${Math.round(est.weightKg)} kg).`}
          </li>
          <li>
            <b>Time</b>: {s.mode === 'live' ? 'the workout timer, minus pauses longer than 10 minutes.' : est.minutesEstimated ? 'estimated from your sets (about 3 s per rep plus rest between sets).' : 'the duration you entered.'}
          </li>
          <li>
            <b>Per exercise</b>: the session total is split by each exercise's working and rest time, weighted for load (big lower-body lifts &gt; upper-body compounds &gt; isolation). The parts always add up to the total.
          </li>
          <li>The “afterburn” (EPOC) after lifting is small and isn't included.</li>
          <li>Real burn varies a lot between people. For weight goals, logging food accurately matters far more than this number.</li>
        </ul>
      </div>
    </Sheet>
  );
}
