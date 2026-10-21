import type { MuscleGroup } from '@/domain/strength/library';
import { MUSCLE_GROUP_LABELS } from '@/domain/strength/library';

/** Simple front/back body diagram (own geometry) shaded by weekly sets per muscle group. */
const FRONT: { g: MuscleGroup; d: string }[] = [
  { g: 'shoulders', d: 'M30 46 q-12 2 -14 16 l10 4 q4 -12 12 -14z M90 46 q12 2 14 16 l-10 4 q-4 -12 -12 -14z' },
  { g: 'chest', d: 'M38 50 h21 v20 q-11 5 -21 -2z M61 50 h21 v18 q-10 7 -21 2z' },
  { g: 'biceps', d: 'M16 66 l10 4 l-3 22 l-9 -3z M104 66 l-10 4 l3 22 l9 -3z' },
  { g: 'forearms', d: 'M13 92 l9 3 l-4 26 l-8 -2z M107 92 l-9 3 l4 26 l8 -2z' },
  { g: 'core', d: 'M42 74 q18 6 36 0 l-2 36 q-16 6 -32 0z' },
  { g: 'quads', d: 'M42 116 q8 4 17 2 l-2 52 l-12 0z M78 116 q-8 4 -17 2 l2 52 l12 0z' },
  { g: 'calves', d: 'M45 176 h11 l-1 40 h-8z M75 176 h-11 l1 40 h8z' },
];
const BACK: { g: MuscleGroup; d: string }[] = [
  { g: 'shoulders', d: 'M30 46 q-12 2 -14 16 l10 4 q4 -12 12 -14z M90 46 q12 2 14 16 l-10 4 q-4 -12 -12 -14z' },
  { g: 'back', d: 'M40 44 h40 l2 26 q-4 22 -22 30 q-18 -8 -22 -30z' },
  { g: 'triceps', d: 'M16 66 l10 4 l-3 22 l-9 -3z M104 66 l-10 4 l3 22 l9 -3z' },
  { g: 'forearms', d: 'M13 92 l9 3 l-4 26 l-8 -2z M107 92 l-9 3 l4 26 l8 -2z' },
  { g: 'glutes', d: 'M42 104 q9 -4 17 2 v16 q-10 4 -18 -2z M78 104 q-9 -4 -17 2 v16 q10 4 18 -2z' },
  { g: 'hamstrings', d: 'M42 126 q8 3 16 0 l-1 44 h-12z M78 126 q-8 3 -16 0 l1 44 h12z' },
  { g: 'calves', d: 'M45 176 h11 l-1 40 h-8z M75 176 h-11 l1 40 h8z' },
];
const SILHOUETTE = 'M60 6 a11 11 0 1 1 -0.1 0z M38 34 h44 q14 2 22 14 l12 76 l-8 2 l-14 -54 l-4 40 l4 112 h-13 l-9 -100 l-4 0 l-9 100 h-13 l4 -112 l-4 -40 l-14 54 l-8 -2 l12 -76 q8 -12 22 -14z';

export function BodyMap({ sets, max = 12 }: { sets: Partial<Record<MuscleGroup, number>>; max?: number }) {
  const fill = (g: MuscleGroup) => {
    const v = sets[g] ?? 0;
    if (v <= 0) return 'var(--surface-3)';
    const pct = Math.round(25 + 75 * Math.min(1, v / max));
    return `color-mix(in oklab, var(--accent) ${pct}%, var(--surface))`;
  };
  const label = Object.entries(sets)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([g, v]) => `${MUSCLE_GROUP_LABELS[g as MuscleGroup]} ${Math.round(v!)} sets`)
    .join(', ');
  const figure = (parts: typeof FRONT, title: string) => (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 120 230" className="h-56 w-auto" aria-hidden>
        <path d={SILHOUETTE} fill="var(--surface-2)" />
        {parts.map((p) => (
          <path key={p.g + p.d.slice(0, 8)} d={p.d} fill={fill(p.g)} stroke="var(--surface)" strokeWidth={1} />
        ))}
      </svg>
      <figcaption className="text-xs text-muted">{title}</figcaption>
    </figure>
  );
  return (
    <div role="img" aria-label={label ? `Muscles trained this week: ${label}` : 'No muscles trained this week yet'}>
      <div className="flex justify-center gap-6">
        {figure(FRONT, 'Front')}
        {figure(BACK, 'Back')}
      </div>
      <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted" aria-hidden>
        <span>0</span>
        <span className="h-2 w-24 rounded-full" style={{ background: 'linear-gradient(90deg, var(--surface-3), color-mix(in oklab, var(--accent) 25%, var(--surface)), var(--accent))' }} />
        <span>{max}+ sets</span>
      </div>
    </div>
  );
}
