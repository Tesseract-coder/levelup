import clsx from 'clsx';
import { Check, Disc3, MoreHorizontal, Plus, Trash2, Trophy, TriangleAlert } from 'lucide-react';
import { memo, useRef, useState } from 'react';
import type { Exercise, ExercisePref, ExerciseSet, SessionExercise, StrengthSettings } from '@/db/types';
import { fmtSec, fromDisplay, toDisplay, type WeightUnit } from '@/domain/strength/units';
import { hasValues, newSet } from '@/domain/strength/session';
import { haptic } from '@/lib/haptics';
import { primeAudio } from '@/lib/sound';
import { useUI } from '@/stores/ui';
import { fmtSet, restFor, weightHint } from './format';

// ---------------------------------------------------------------- fields

type FieldKey = 'weight' | 'load' | 'reps' | 'sec' | 'dist';
interface Field {
  key: FieldKey;
  header: string;
  get: (s: Partial<ExerciseSet>) => number | undefined;
  set: (v: number | undefined) => Partial<ExerciseSet>;
  step: number;
  integer?: boolean;
  signed?: boolean;
  min: number;
  max: number;
}

export function fieldsFor(ex: Exercise, unit: WeightUnit, settings: StrengthSettings): Field[] {
  const wStep = unit === 'lb' ? settings.weightStepLb : settings.weightStepKg;
  const weight: Field = {
    key: 'weight',
    header: unit,
    get: (s) => (s.weightKg == null ? undefined : toDisplay(s.weightKg, unit)),
    set: (v) => ({ weightKg: v == null ? undefined : fromDisplay(Math.max(0, v), unit) }),
    step: wStep,
    min: 0,
    max: unit === 'lb' ? 1100 : 500,
  };
  const load: Field = {
    key: 'load',
    header: `±${unit}`,
    get: (s) => (s.addedWeightKg == null && s.assistanceKg == null ? undefined : toDisplay((s.addedWeightKg ?? 0) - (s.assistanceKg ?? 0), unit)),
    set: (v) => (v == null || v === 0 ? { addedWeightKg: undefined, assistanceKg: undefined } : v > 0 ? { addedWeightKg: fromDisplay(v, unit), assistanceKg: undefined } : { assistanceKg: fromDisplay(-v, unit), addedWeightKg: undefined }),
    step: wStep,
    signed: true,
    min: unit === 'lb' ? -300 : -150,
    max: unit === 'lb' ? 300 : 150,
  };
  const reps: Field = { key: 'reps', header: 'Reps', get: (s) => s.reps, set: (v) => ({ reps: v == null ? undefined : Math.round(v) }), step: 1, integer: true, min: 0, max: 999 };
  const sec: Field = { key: 'sec', header: 'Sec', get: (s) => s.durationSec, set: (v) => ({ durationSec: v == null ? undefined : Math.round(v) }), step: 5, integer: true, min: 0, max: 7200 };
  const dist: Field = { key: 'dist', header: 'm', get: (s) => s.distanceM, set: (v) => ({ distanceM: v == null ? undefined : Math.round(v) }), step: 5, integer: true, min: 0, max: 10000 };
  switch (ex.trackingType) {
    case 'bodyweight_reps':
      return [load, reps];
    case 'duration':
      return [sec];
    case 'weight_duration':
      return [weight, sec];
    case 'distance':
      return [weight, dist];
    default:
      return [weight, reps];
  }
}

const parseNum = (t: string, signed?: boolean): number | undefined => {
  const clean = t.replace(',', '.').replace(signed ? /[^0-9.-]/g : /[^0-9.]/g, '');
  if (clean === '' || clean === '-' || clean === '.') return undefined;
  const v = parseFloat(clean);
  return Number.isFinite(v) ? v : undefined;
};

/** Numeric input that keeps the raw text while focused, so values never jump while typing. */
function NumField({ value, placeholder, label, field, onCommit, onFocus, done }: { value: number | undefined; placeholder?: number; label: string; field: Field; onCommit: (v: number | undefined) => void; onFocus: () => void; done: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? '' : String(value));
  return (
    <input
      inputMode={field.signed ? 'text' : field.integer ? 'numeric' : 'decimal'}
      pattern={field.signed ? '[-+]?[0-9]*[.,]?[0-9]*' : undefined}
      enterKeyHint="next"
      aria-label={label}
      value={shown}
      placeholder={placeholder == null ? '–' : String(placeholder)}
      onFocus={(e) => {
        setDraft(shown);
        onFocus();
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = parseNum(e.target.value, field.signed);
        onCommit(v == null ? undefined : Math.min(field.max, Math.max(field.min, v)));
      }}
      onBlur={() => setDraft(null)}
      className={clsx(
        'tabular h-12 w-full min-w-0 rounded-xl text-center text-base font-semibold outline-none placeholder:font-normal placeholder:text-muted/70 focus:ring-2 focus:ring-accent',
        done ? 'bg-transparent' : 'bg-surface-2',
      )}
    />
  );
}

// ------------------------------------------------------------------ row

const TYPE_BADGE: Record<ExerciseSet['type'], string> = { warmup: 'W', working: '', drop: 'D', failure: 'F' };

interface RowProps {
  set: ExerciseSet;
  label: string;
  fields: Field[];
  ghost?: Partial<ExerciseSet>;
  prevLabel?: string;
  prevSet?: ExerciseSet;
  active: boolean;
  exName: string;
  onActivate: () => void;
  onPatch: (p: Partial<ExerciseSet>) => void;
  onToggle: () => void;
  onDelete: () => void;
  onDetails: () => void;
}

function SetRow({ set, label, fields, ghost, prevLabel, prevSet, active, exName, onActivate, onPatch, onToggle, onDelete, onDetails }: RowProps) {
  const [dx, setDx] = useState(0);
  const touch = useRef<{ x: number; y: number; locked?: 'x' | 'y' } | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const grid = fields.length === 2 ? 'grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_3.75rem_3rem]' : 'grid-cols-[2.5rem_minmax(0,1fr)_6rem_3rem]';
  const rowName = `${exName} set ${label}`;

  return (
    <li className="relative overflow-hidden rounded-xl">
      {/* swipe-to-delete backdrop */}
      <div className="absolute inset-0 flex items-center justify-end rounded-xl bg-danger px-4 text-white" aria-hidden>
        <Trash2 size={20} />
      </div>
      <div
        className={clsx('relative rounded-xl transition-[background-color] duration-200', set.completed ? 'bg-good-soft' : 'bg-surface')}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: touch.current ? 'none' : 'transform 0.2s' }}
        onTouchStart={(e) => {
          if ((e.target as HTMLElement).closest('input')) return;
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchMove={(e) => {
          const t = touch.current;
          if (!t) return;
          const mx = e.touches[0].clientX - t.x;
          const my = e.touches[0].clientY - t.y;
          if (!t.locked && (Math.abs(mx) > 8 || Math.abs(my) > 8)) t.locked = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
          if (t.locked === 'x') setDx(Math.min(0, mx));
        }}
        onTouchEnd={() => {
          const del = dx < -90;
          touch.current = null;
          setDx(0);
          if (del) onDelete();
        }}
      >
        <div className={clsx('grid items-center gap-1.5 px-1 py-1', grid)}>
          <button
            type="button"
            aria-label={`${rowName}: ${set.type === 'working' ? 'working set' : set.type}. Tap for set type, RPE and notes`}
            onClick={onDetails}
            onContextMenu={(e) => {
              e.preventDefault();
              onDetails();
            }}
            onPointerDown={() => {
              press.current = setTimeout(() => {
                haptic(15);
                onDetails();
              }, 450);
            }}
            onPointerUp={() => clearTimeout(press.current)}
            onPointerLeave={() => clearTimeout(press.current)}
            className={clsx(
              'tabular grid h-12 place-items-center rounded-xl text-sm font-bold',
              set.type === 'warmup' ? 'text-carbs' : set.type === 'drop' ? 'text-fat' : set.type === 'failure' ? 'text-protein' : 'text-muted',
            )}
          >
            <span className="relative">
              {TYPE_BADGE[set.type] || label}
              {set.isPR && <Trophy size={12} className="absolute -right-3 -top-1 text-good" aria-label="Personal record" />}
            </span>
          </button>
          <button
            type="button"
            disabled={!prevSet}
            onClick={() => prevSet && onPatch(fields.reduce((p, f) => ({ ...p, ...f.set(f.get(prevSet)) }), {} as Partial<ExerciseSet>))}
            aria-label={prevLabel ? `Copy previous: ${prevLabel}` : 'No previous set'}
            className="tabular h-12 min-w-0 truncate rounded-xl px-1 text-left text-sm text-muted"
          >
            {prevLabel ?? '–'}
          </button>
          {fields.map((f) => (
            <NumField key={f.key} label={`${rowName} ${f.header}`} field={f} value={f.get(set)} placeholder={ghost ? f.get(ghost) : undefined} done={set.completed} onFocus={onActivate} onCommit={(v) => onPatch(f.set(v))} />
          ))}
          <button
            type="button"
            aria-label={set.completed ? `${rowName} done — tap to undo` : `Mark ${rowName} done`}
            aria-pressed={set.completed}
            onClick={onToggle}
            className={clsx('grid h-12 w-12 place-items-center rounded-xl transition-transform active:scale-90', set.completed ? 'bg-good text-white' : 'bg-surface-2 text-muted')}
          >
            <Check size={22} strokeWidth={3} />
          </button>
        </div>
        {active && (
          <div className={clsx('grid gap-2 px-1 pb-2', fields.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
            {fields.map((f) => {
              const cur = f.get(set) ?? (ghost ? f.get(ghost) : undefined) ?? 0;
              const bump = (d: number) => {
                const v = Math.min(f.max, Math.max(f.min, Math.round((cur + d) * 100) / 100));
                onPatch(f.set(v));
                haptic(8);
              };
              const nice = f.key === 'sec' ? fmtSec(cur) : f.key === 'reps' ? `${cur} reps` : String(cur);
              return (
                <div key={f.key} className="flex items-center justify-between gap-1 rounded-xl bg-surface-2 p-1" role="group" aria-label={`Adjust ${f.header}`}>
                  <button type="button" aria-label={`Decrease ${f.header} by ${f.step}`} onClick={() => bump(-f.step)} className="grid h-12 w-12 place-items-center rounded-lg bg-surface text-xl font-bold active:scale-95">
                    −
                  </button>
                  <span className="tabular truncate text-sm font-semibold">{nice}</span>
                  <button type="button" aria-label={`Increase ${f.header} by ${f.step}`} onClick={() => bump(f.step)} className="grid h-12 w-12 place-items-center rounded-lg bg-accent-soft text-xl font-bold text-accent-ink active:scale-95">
                    +
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ card

interface CardProps {
  entry: SessionExercise;
  ex: Exercise;
  pref?: ExercisePref;
  prev: ExerciseSet[];
  unit: WeightUnit;
  settings: StrengthSettings;
  superset?: 'first' | 'middle' | 'last';
  hint?: React.ReactNode;
  onChange: (id: string, fn: (e: SessionExercise) => SessionExercise) => void;
  onSetDone: (entry: SessionExercise, set: ExerciseSet) => void;
  onMenu: (entry: SessionExercise) => void;
  onOpenDetail: (exerciseId: string) => void;
}

export const ExerciseCard = memo(function ExerciseCard({ entry, ex, pref, prev, unit, settings, superset, hint, onChange, onSetDone, onMenu, onOpenDetail }: CardProps) {
  const [active, setActive] = useState<string | null>(null);
  const openSheet = useUI((s) => s.openSheet);
  const showSnack = useUI((s) => s.showSnack);
  const fields = fieldsFor(ex, unit, settings);
  const change = (fn: (e: SessionExercise) => SessionExercise) => onChange(entry.id, fn);
  const patchSet = (id: string, p: Partial<ExerciseSet>) => change((e) => ({ ...e, sets: e.sets.map((s) => (s.id === id ? { ...s, ...p } : s)) }));
  const removeSet = (id: string) => {
    const idx = entry.sets.findIndex((s) => s.id === id);
    const removed = entry.sets[idx];
    change((e) => ({ ...e, sets: e.sets.filter((s) => s.id !== id) }));
    haptic(20);
    showSnack({ message: 'Set deleted', actionLabel: 'Undo', onAction: () => change((e) => ({ ...e, sets: [...e.sets.slice(0, idx), removed, ...e.sets.slice(idx)] })) });
  };

  let working = 0;
  const labels = entry.sets.map((s) => (s.type === 'warmup' ? 'W' : String(++working)));
  const rest = restFor(ex, entry.restSec, pref, settings);
  const isBar = ex.equipment === 'barbell' || ex.equipment === 'smith';

  return (
    <section
      aria-label={ex.name}
      className={clsx('rounded-[var(--radius-card)] bg-surface p-3 shadow-card', superset && 'border-l-4 border-accent', superset && superset !== 'first' && '-mt-2 rounded-t-none', superset && superset !== 'last' && 'rounded-b-none')}
    >
      <div className="flex items-start gap-1">
        <button type="button" onClick={() => onOpenDetail(ex.id)} className="min-h-11 min-w-0 flex-1 px-1 text-left">
          <h3 className="flex items-center gap-2 font-bold leading-tight">
            <span className="truncate">{ex.name}</span>
            {entry.pain && <TriangleAlert size={16} className="shrink-0 text-caution" aria-label="Pain flagged" />}
          </h3>
          <p className="truncate text-xs text-muted">
            {superset ? 'Superset · ' : ''}
            {weightHint(ex, pref, settings, unit)} · rest {fmtSec(rest)}
          </p>
        </button>
        <button type="button" aria-label={`Options for ${ex.name}`} onClick={() => onMenu(entry)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted">
          <MoreHorizontal size={22} />
        </button>
      </div>
      {entry.notes && <p className="mx-1 mb-1 rounded-lg bg-surface-2 px-2 py-1 text-sm">{entry.notes}</p>}
      {hint}

      <div className={clsx('grid gap-1.5 px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted', fields.length === 2 ? 'grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_3.75rem_3rem]' : 'grid-cols-[2.5rem_minmax(0,1fr)_6rem_3rem]')} aria-hidden>
        <span className="text-center">Set</span>
        <span>Previous</span>
        {fields.map((f) => (
          <span key={f.key} className="text-center normal-case">
            {f.header}
          </span>
        ))}
        <span className="text-center">✓</span>
      </div>
      <ul className="space-y-1">
        {entry.sets.map((s, i) => {
          const p = prev[i];
          const ghost = p ?? entry.sets[i - 1];
          return (
            <SetRow
              key={s.id}
              set={s}
              label={labels[i]}
              fields={fields}
              ghost={ghost}
              prevSet={p}
              prevLabel={p ? fmtSet(p, ex, unit) : undefined}
              active={active === s.id}
              exName={ex.name}
              onActivate={() => setActive(s.id)}
              onPatch={(patch) => {
                setActive(s.id);
                patchSet(s.id, patch);
              }}
              onDetails={() => openSheet({ type: 'setDetails', set: s, label: labels[i], onChange: (patch) => patchSet(s.id, patch), onDelete: () => removeSet(s.id) })}
              onDelete={() => removeSet(s.id)}
              onToggle={() => {
                primeAudio();
                if (s.completed) {
                  patchSet(s.id, { completed: false, completedAt: undefined, isPR: false, prTypes: undefined });
                  return;
                }
                // accept the ghost values for anything left blank
                const filled: ExerciseSet = { ...s };
                if (ghost) for (const f of fields) if (f.get(filled) == null && f.get(ghost) != null) Object.assign(filled, f.set(f.get(ghost)));
                if (!hasValues(filled)) {
                  haptic([30, 30, 30]);
                  setActive(s.id);
                  return;
                }
                const done = { ...filled, completed: true, completedAt: Date.now() };
                patchSet(s.id, done);
                haptic(15);
                setActive(entry.sets[i + 1]?.id ?? null);
                onSetDone(entry, done);
              }}
            />
          );
        })}
      </ul>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => {
            const last = entry.sets[entry.sets.length - 1];
            const s = newSet(last);
            change((e) => ({ ...e, sets: [...e.sets, s] }));
            setActive(s.id);
          }}
          className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-2 font-semibold"
        >
          <Plus size={18} aria-hidden /> Add set
        </button>
        {isBar && (
          <button
            type="button"
            aria-label="Plate calculator"
            onClick={() => {
              const w = [...entry.sets].reverse().find((s) => s.weightKg)?.weightKg;
              openSheet({ type: 'plateCalc', totalKg: w });
            }}
            className="grid h-12 w-12 place-items-center rounded-xl bg-surface-2 text-muted"
          >
            <Disc3 size={20} />
          </button>
        )}
      </div>
    </section>
  );
});
