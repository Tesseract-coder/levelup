import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Info, RefreshCw, Sparkles, Target } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Ring } from '@/components/Ring';
import { Button, Card, IconButton, PageHeader, Segmented, Skeleton } from '@/components/ui';
import { repo } from '@/db';
import type { NextFocus, Summary } from '@/db/types';
import { useSettings, useToday } from '@/hooks/data';
import { addDays, formatDay, formatRange } from '@/domain/dates';
import { customDef } from '@/domain/presets';
import { refresh } from '@/lib/queryClient';
import { haptic } from '@/lib/haptics';
import { useUI } from '@/stores/ui';
import { generateSummary, summaryRange } from './generate';

const STALE_MS = 10 * 60_000;

export function useSummary(kind: 'day' | 'week', date: string) {
  const today = useToday();
  const settings = useSettings();
  const { start, end } = summaryRange(kind, date, settings.weekStartsOn);
  return useQuery({
    queryKey: ['summary', kind, start],
    queryFn: async () => {
      const stored = await repo.getSummary(`${kind}:${start}`);
      const live = end >= today; // period still in progress → regenerate when stale
      if (stored && (!live || Date.now() - stored.generatedAt < STALE_MS)) return stored;
      return generateSummary(kind, date, today);
    },
  });
}

export default function SummaryScreen() {
  const { kind: k = 'day', date: d } = useParams();
  const kind = k === 'week' ? 'week' : 'day';
  const navigate = useNavigate();
  const today = useToday();
  const settings = useSettings();
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today;
  const { data: summary, isLoading, isFetching } = useSummary(kind, date);
  const qc = useQueryClient();
  const [regen, setRegen] = useState(false);
  const { start, end } = summaryRange(kind, date, settings.weekStartsOn);
  const step = kind === 'day' ? 1 : 7;

  const regenerate = async () => {
    setRegen(true);
    const s = await generateSummary(kind, date, today);
    qc.setQueryData(['summary', kind, start], s);
    setRegen(false);
  };

  return (
    <div>
      <PageHeader
        title={kind === 'day' ? 'Daily summary' : 'Weekly summary'}
        subtitle={kind === 'day' ? formatDay(date, today) : formatRange(start, end)}
        left={<IconButton label="Back" onClick={() => navigate(-1)}><ArrowLeft size={22} /></IconButton>}
        right={
          <div className="flex">
            <IconButton label="Previous" onClick={() => navigate(`/summary/${kind}/${addDays(date, -step)}`, { replace: true })}>
              <ChevronLeft size={22} />
            </IconButton>
            <IconButton label="Next" disabled={end >= today} className="disabled:opacity-30" onClick={() => navigate(`/summary/${kind}/${addDays(date, step)}`, { replace: true })}>
              <ChevronRight size={22} />
            </IconButton>
          </div>
        }
      />
      <div className="space-y-4 px-4">
        <Segmented label="Summary period" value={kind} onChange={(v) => navigate(`/summary/${v}/${date}`, { replace: true })} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]} />
        {isLoading || !summary || regen ? (
          <div className="space-y-3" aria-busy="true" aria-label="Preparing your summary">
            <Skeleton className="h-40" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <SummaryBody summary={summary} onRegenerate={regenerate} busy={isFetching} />
        )}
        {kind === 'week' && (
          <Link to="/review" className="block">
            <Card className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent-ink"><Target size={20} aria-hidden /></span>
              <span className="flex-1">
                <span className="block font-semibold">Weekly review & reset</span>
                <span className="block text-sm text-muted">Look back, then pick one focus for next week</span>
              </span>
              <ChevronRight size={20} className="text-muted" aria-hidden />
            </Card>
          </Link>
        )}
      </div>
    </div>
  );
}

export function SummaryBody({ summary, onRegenerate, busy }: { summary: Summary; onRegenerate?: () => void; busy?: boolean }) {
  const [explain, setExplain] = useState(false);
  return (
    <>
      <Card>
        <button type="button" onClick={() => setExplain((e) => !e)} aria-expanded={explain} className="flex w-full items-center gap-4 text-left">
          <Ring value={summary.score / 100} size={96} stroke={10} color="var(--accent)" label={`Consistency score ${summary.score} out of 100`}>
            <span className="tabular text-3xl font-extrabold">{summary.score}</span>
          </Ring>
          <span className="flex-1">
            <span className="block text-sm font-semibold text-muted">Consistency score</span>
            <span className="block text-lg font-bold">{scoreWord(summary.score)}</span>
            <span className="mt-1 flex items-center gap-1 text-sm font-semibold text-accent-ink">
              <Info size={15} aria-hidden /> {explain ? 'Hide' : 'How it was calculated'}
            </span>
          </span>
        </button>
        {explain && (
          <ul className="mt-3 space-y-2 text-sm">
            {summary.breakdown.map((b) => (
              <li key={b.key} className="rounded-xl bg-surface-2 p-3">
                <div className="flex justify-between font-semibold">
                  <span>
                    {b.label} <span className="font-normal text-muted">· weight {b.weight}</span>
                  </span>
                  <span className="tabular">{b.score == null ? 'not included' : `${Math.round(b.score * 100)}%`}</span>
                </div>
                <p className="mt-0.5 text-muted">{b.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Section emoji="✅" title="What went great" items={summary.wins} tone="good" empty="Logging is a win in itself — keep going." />
      <Section emoji="⚠️" title="What was missed" items={summary.misses} tone="caution" empty="Nothing notable missed. Nice." />
      <Section emoji="🎯" title="What to improve" items={summary.improvements} tone="accent" numbered />
      <FocusCard summary={summary} />

      {summary.facts && summary.facts.length > 0 && (
        <details className="rounded-[var(--radius-card)] bg-surface p-4 shadow-card">
          <summary className="min-h-8 cursor-pointer font-semibold">The numbers behind this summary</summary>
          <ul className="mt-2 space-y-1.5 text-sm text-muted">
            {summary.facts.map((f) => (
              <li key={f.id} className="tabular">{f.text}</li>
            ))}
          </ul>
        </details>
      )}

      <p className="flex items-center justify-between gap-2 px-1 text-xs text-muted">
        <span className="flex items-center gap-1">
          <Sparkles size={12} aria-hidden />
          Computed on your device from your own logs.
        </span>
        {onRegenerate && (
          <button type="button" onClick={onRegenerate} disabled={busy} className="flex min-h-11 shrink-0 items-center gap-1 font-semibold text-accent-ink">
            <RefreshCw size={14} aria-hidden /> Refresh
          </button>
        )}
      </p>
    </>
  );
}

function scoreWord(s: number) {
  if (s >= 85) return 'Excellent consistency';
  if (s >= 70) return 'Strong and steady';
  if (s >= 50) return 'Solid progress';
  if (s >= 30) return 'Building momentum';
  return 'Every log counts — fresh start';
}

function Section({ emoji, title, items, tone, empty, numbered }: { emoji: string; title: string; items: { text: string }[]; tone: 'good' | 'caution' | 'accent'; empty?: string; numbered?: boolean }) {
  const dot = tone === 'good' ? 'bg-good' : tone === 'caution' ? 'bg-caution' : 'bg-accent';
  return (
    <Card>
      <h2 className="mb-2 flex items-center gap-2 font-bold">
        <span aria-hidden>{emoji}</span> {title}
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((it, i) => (
            <li key={i} className="flex gap-3">
              {numbered ? (
                <span className="tabular grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink">{i + 1}</span>
              ) : (
                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
              )}
              <span className="text-[15px] leading-snug">{it.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export async function acceptFocus(summary: Summary): Promise<void> {
  const f: NextFocus = summary.nextFocus;
  if (f.habit) {
    const acts = await repo.listActivities({ includeArchived: true });
    const def = customDef(f.habit.name, 'habit', acts.length, f.habit.trackingType);
    await repo.saveActivity({ ...def, unit: f.habit.unit ?? def.unit, target: f.habit.target ?? def.target, schedule: f.habit.schedule ?? def.schedule, icon: f.habit.icon ?? def.icon, kind: f.habit.schedule?.type === 'weekly' && f.habit.trackingType === 'duration' ? 'workout' : 'habit', met: f.habit.schedule?.type === 'weekly' ? 3.5 : undefined });
  }
  await repo.saveSummary({ ...summary, nextFocus: { ...f, accepted: true } });
  haptic([10, 40, 10]);
  await refresh();
}

function FocusCard({ summary }: { summary: Summary }) {
  const qc = useQueryClient();
  const accepted = summary.nextFocus.accepted;
  return (
    <Card className="bg-accent text-on-accent">
      <p className="text-sm font-semibold opacity-90">{summary.kind === 'week' ? 'Next week’s focus' : 'Tomorrow’s focus'}</p>
      <p className="mt-1 text-lg font-bold leading-snug">{summary.nextFocus.text}</p>
      {accepted ? (
        <p className="mt-3 flex items-center gap-2 font-semibold">
          <Check size={18} /> {summary.nextFocus.habit ? 'Added to your habits' : 'Focus set'}
        </p>
      ) : (
        <Button
          className="mt-3 bg-surface text-ink"
          variant="secondary"
          onClick={async () => {
            await acceptFocus(summary);
            qc.setQueryData(['summary', summary.kind, summary.rangeStart], { ...summary, nextFocus: { ...summary.nextFocus, accepted: true } });
            useUI.getState().showSnack({ message: summary.nextFocus.habit ? `“${summary.nextFocus.habit.name}” added to your habits` : 'Focus saved' });
          }}
        >
          {summary.nextFocus.habit ? `Make it a habit: ${summary.nextFocus.habit.name}` : 'Accept this focus'}
        </Button>
      )}
    </Card>
  );
}
