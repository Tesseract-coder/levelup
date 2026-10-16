import { Sparkles, Trash2, WifiOff } from 'lucide-react';
import { useState } from 'react';
import type { ParsedActivityEntry } from '@shared/sanitize';
import { Sheet } from '@/components/Sheet';
import { useCloseSheet } from '@/components/sheetHistory';
import { ActivityIcon } from '@/components/icons';
import { Button, IconButton, Notice, Skeleton } from '@/components/ui';
import { repo } from '@/db';
import { useActivities, useLatestWeight } from '@/hooks/data';
import { parseActivityAI } from '@/lib/ai';
import { newId } from '@/lib/id';
import { refresh } from '@/lib/queryClient';
import { useUI } from '@/stores/ui';
import { parseActivityLocally } from '@/domain/localActivityParser';
import { caloriesBurned } from '@/domain/presets';
import { minToHm, hmToMin } from '@/domain/dates';

/** "Today I cycled 40 min, learned React for 1 hour, slept 6.5 hrs" → structured entries, reviewed before saving. */
export default function ActivityTextSheet({ date }: { date: string }) {
  const close = useCloseSheet();
  const { data: acts = [] } = useActivities();
  const { data: latest } = useLatestWeight();
  const [text, setText] = useState('');
  const [entries, setEntries] = useState<(ParsedActivityEntry & { key: string })[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(false);

  async function parse() {
    setLoading(true);
    let res: ParsedActivityEntry[];
    try {
      res = await parseActivityAI(text, acts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, unit: a.unit })));
      setOffline(false);
    } catch {
      res = parseActivityLocally(text, acts);
      setOffline(true);
    }
    setEntries(res.map((e) => ({ ...e, key: newId() })));
    setLoading(false);
  }

  const savable = (entries ?? []).filter((e) => (e.activityId || e.kind === 'weight') && (e.durationMin || e.value));

  async function save() {
    const now = Date.now();
    for (const [i, e] of savable.entries()) {
      const def = acts.find((a) => a.id === e.activityId);
      if (e.kind === 'weight' && e.value) {
        await repo.saveBody({ id: newId(), date, weightKg: e.value, createdAt: now + i });
      } else if (def?.special === 'sleep' && e.value) {
        const wake = '07:00';
        await repo.saveSleep({ id: newId(), date, bedtime: minToHm(hmToMin(wake) - e.value * 60), wake, durationMin: Math.round(e.value * 60), createdAt: now + i });
      } else if (def?.kind === 'workout') {
        const mins = e.durationMin ?? def.target ?? 30;
        await repo.saveLog({ id: newId(), activityId: def.id, date, value: mins, durationMin: mins, distanceKm: e.distanceKm, intensity: e.intensity ?? 'moderate', caloriesBurnedEst: caloriesBurned(def.met, latest?.weightKg ?? 70, mins, e.intensity ?? 'moderate'), notes: e.phrase, createdAt: now + i });
      } else if (def) {
        const value = def.trackingType === 'check' || def.trackingType === 'avoid' ? 1 : def.trackingType === 'duration' ? e.durationMin ?? e.value ?? 0 : e.value ?? e.durationMin ?? 0;
        if (def.aggregate === 'last') for (const l of await repo.logsInRange(date, date, def.id)) await repo.remove('activityLogs', l.id);
        await repo.saveLog({ id: newId(), activityId: def.id, date, value, durationMin: def.trackingType === 'duration' ? value : undefined, createdAt: now + i });
      }
    }
    await refresh();
    useUI.getState().showSnack({ message: `${savable.length} entr${savable.length === 1 ? 'y' : 'ies'} logged` });
    close();
  }

  if (!entries) {
    return (
      <Sheet
        title="Describe your day"
        description="One line is enough. You'll review everything before it's saved."
        footer={
          <Button block onClick={parse} disabled={loading || text.trim().length < 3}>
            <Sparkles size={18} /> {loading ? 'Reading…' : 'Turn into entries'}
          </Button>
        }
      >
        <label htmlFor="activity-text" className="sr-only">
          Your day
        </label>
        <textarea
          id="activity-text"
          rows={4}
          maxLength={1500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Today I cycled 40 min, learned React for 1 hour, slept 6.5 hrs, drank 2 L water"
          className="w-full rounded-2xl border border-line bg-surface p-3 leading-relaxed"
        />
        {loading && <Skeleton className="mt-3 h-24" />}
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Review entries"
      size="tall"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEntries(null)}>
            Edit text
          </Button>
          <Button block className="flex-1" disabled={!savable.length} onClick={save}>
            Save {savable.length}
          </Button>
        </div>
      }
    >
      {offline && (
        <div className="mb-3">
          <Notice tone="caution" icon={<WifiOff size={18} />}>
            Parsed offline with simple rules — double-check the matches.
          </Notice>
        </div>
      )}
      {entries.length === 0 && <p className="text-muted">We couldn't find any activities in that note. Try mentioning durations, e.g. “ran 30 min”.</p>}
      <ul className="space-y-2">
        {entries.map((e) => {
          const def = acts.find((a) => a.id === e.activityId);
          return (
            <li key={e.key} className="rounded-2xl bg-surface-2 p-3">
              <div className="flex items-start gap-3">
                <span className="mt-1 text-accent-ink">
                  <ActivityIcon name={def?.icon ?? (e.kind === 'weight' ? 'target' : 'activity')} />
                </span>
                <div className="min-w-0 flex-1">
                  <label className="block">
                    <span className="sr-only">Activity for “{e.phrase}”</span>
                    <select
                      value={e.activityId ?? (e.kind === 'weight' ? '__weight' : '')}
                      onChange={(ev) => setEntries((cur) => cur!.map((x) => (x.key === e.key ? { ...x, activityId: ev.target.value === '__weight' ? null : ev.target.value || null, kind: ev.target.value === '__weight' ? 'weight' : acts.find((a) => a.id === ev.target.value)?.kind ?? x.kind } : x)))}
                      className="min-h-11 w-full rounded-xl border border-line bg-surface px-2 font-semibold"
                    >
                      <option value="">Not tracked — skip</option>
                      {acts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                      <option value="__weight">Weight</option>
                    </select>
                  </label>
                  <p className="mt-1 text-sm text-muted">“{e.phrase}”</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    {e.durationMin != null && <NumField label="min" value={e.durationMin} onChange={(v) => setEntries((cur) => cur!.map((x) => (x.key === e.key ? { ...x, durationMin: v } : x)))} />}
                    {e.value != null && e.durationMin == null && <NumField label={e.unit ?? def?.unit ?? ''} value={e.value} onChange={(v) => setEntries((cur) => cur!.map((x) => (x.key === e.key ? { ...x, value: v } : x)))} />}
                    {e.distanceKm != null && <span className="rounded-lg bg-surface px-2 py-1">{e.distanceKm} km</span>}
                  </div>
                </div>
                <IconButton label="Remove entry" onClick={() => setEntries((cur) => cur!.filter((x) => x.key !== e.key))}>
                  <Trash2 size={18} />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1">
      <input inputMode="decimal" aria-label={label} value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} className="tabular min-h-11 w-20 rounded-lg border border-line bg-surface px-2 text-center" />
      <span className="text-muted">{label}</span>
    </label>
  );
}
