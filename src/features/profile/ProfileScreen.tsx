import clsx from 'clsx';
import { Award, ChevronRight, Database, Download, FileUp, Info, Moon, ShieldCheck, Target, Timer, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Card, Chip, Input, Notice, PageHeader, Segmented, SectionHeader, Toggle } from '@/components/ui';
import { repo } from '@/db';
import type { ActivityLevel, DietPreference, Settings, StrengthSettings } from '@/db/types';
import { useStrengthSettings, useWeightUnit } from '@/hooks/strength';
import { WEIGHT_STEPS_KG, WEIGHT_STEPS_LB } from '@/config/strength';
import { fmtSec } from '@/domain/strength/units';
import { useProfile, useRangeData, useSettings, useToday } from '@/hooks/data';
import { ACTIVITY_LABELS, cmToFtIn, ftInToCm } from '@/domain/targets';
import { addDays, WEEKDAY_NAMES } from '@/domain/dates';
import { computeBadges } from '@/domain/badges';
import { exportCSV, exportJSON, importJSON } from '@/lib/exportData';
import { refresh } from '@/lib/queryClient';
import { useUI } from '@/stores/ui';
import { requestNotificationPermission } from '@/features/reminders/useReminders';
import { startFast } from '@/features/today/FastingCard';

async function update(patch: Partial<Omit<Settings, 'id'>>) {
  await repo.updateSettings(patch);
  await refresh();
}

export default function ProfileScreen() {
  const s = useSettings();
  const { data: profile } = useProfile();
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader title="Profile" subtitle={profile?.name ? `Hi, ${profile.name}` : 'Settings & your data'} />
      <div className="space-y-2 px-4">
        <Link to="/goals" className="block">
          <Card className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent-ink"><Target size={20} aria-hidden /></span>
            <span className="flex-1"><span className="block font-semibold">Goals & plan</span><span className="block text-sm text-muted">Targets, progress, suggestions, history</span></span>
            <ChevronRight className="text-muted" aria-hidden />
          </Card>
        </Link>

        <ProfileEditor />

        <SectionHeader title="Appearance" />
        <Card className="space-y-3">
          <Segmented label="Theme" value={s.theme} onChange={(theme) => update({ theme })} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          <Toggle checked={s.haptics} onChange={(haptics) => update({ haptics })} label="Haptic feedback" description="A tiny vibration when you check things off (where supported)" />
        </Card>

        <SectionHeader title="Days, weeks & streaks" />
        <Card className="space-y-4">
          <Row label="Day starts at" hint="Logs before this time count for the previous day — handy for night owls.">
            <select aria-label="Day starts at" value={s.dayBoundaryHour} onChange={(e) => update({ dayBoundaryHour: Number(e.target.value) })} className="min-h-11 rounded-xl border border-line bg-surface px-2">
              {[0, 1, 2, 3, 4, 5, 6].map((h) => <option key={h} value={h}>{h === 0 ? 'Midnight' : `${h}:00 am`}</option>)}
            </select>
          </Row>
          <Row label="Week starts on">
            <Segmented label="Week starts on" value={String(s.weekStartsOn) as '0' | '1'} onChange={(v) => update({ weekStartsOn: Number(v) as 0 | 1 })} options={[{ value: '1', label: 'Mon' }, { value: '0', label: 'Sun' }]} />
          </Row>
          <Row label="Weekly summary day">
            <select aria-label="Weekly summary day" value={s.weeklySummaryDay} onChange={(e) => update({ weeklySummaryDay: Number(e.target.value) })} className="min-h-11 rounded-xl border border-line bg-surface px-2">
              {WEEKDAY_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
            </select>
          </Row>
          <Row label="Grace days per week" hint="Missed days that don't break a streak. 1 is a good default.">
            <Segmented label="Grace days per week" value={String(s.graceDaysPerWeek) as '0' | '1' | '2'} onChange={(v) => update({ graceDaysPerWeek: Number(v) })} options={[{ value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }]} />
          </Row>
        </Card>

        <SectionHeader title="Strength training" />
        <StrengthSettingsCard />

        <SectionHeader title="Reminders" />
        <RemindersCard s={s} />

        <SectionHeader title="Tools" />
        <Card className="space-y-3">
          <p className="flex items-center gap-2 font-semibold"><Timer size={18} className="text-accent-ink" aria-hidden /> Intermittent fasting timer</p>
          {s.fasting ? (
            <p className="text-sm text-muted">A fast is running — see it on Today.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {[12, 14, 16].map((h) => (
                <Chip key={h} onClick={async () => { await startFast(h); useUI.getState().showSnack({ message: `${h}:${24 - h} fast started` }); navigate('/'); }}>
                  Start {h}:{24 - h}
                </Chip>
              ))}
            </div>
          )}
          <Link to="/review" className="flex min-h-11 items-center justify-between font-semibold">
            Weekly review & reset <ChevronRight size={18} className="text-muted" aria-hidden />
          </Link>
          <Link to="/workouts" className="flex min-h-11 items-center justify-between font-semibold">
            Workout history <ChevronRight size={18} className="text-muted" aria-hidden />
          </Link>
        </Card>

        <Milestones />

        <SectionHeader title="Privacy" />
        <PrivacyCard />

        <SectionHeader title="Your data" />
        <DataCard />

        <SectionHeader title="About" />
        <Card className="space-y-3 text-sm">
          <Notice icon={<ShieldCheck size={18} />}>
            <p className="font-semibold">General guidance, not medical advice</p>
            <p className="mt-1 text-muted">LevelUp provides general fitness and nutrition guidance. Calorie and macro numbers are estimates. If you have a medical condition, are pregnant, or have a history of disordered eating, please talk to a qualified professional before changing your diet or training.</p>
          </Notice>
          <p className="text-muted">
            Health Connect / Apple Health import is planned as a future integration; for now steps are entered manually. No ads, no trackers, no paywalls — all estimates are calculated on your device.
          </p>
          <p className="text-muted">LevelUp v{import.meta.env.VITE_APP_VERSION ?? '0.1.0'}</p>
        </Card>
      </div>
    </div>
  );
}

function StrengthSettingsCard() {
  const st = useStrengthSettings();
  const s = useSettings();
  const unit = useWeightUnit();
  const set = (patch: Partial<StrengthSettings>) => update({ strength: { ...s.strength, ...patch } });
  const steps = unit === 'lb' ? WEIGHT_STEPS_LB : WEIGHT_STEPS_KG;
  const step = unit === 'lb' ? st.weightStepLb : st.weightStepKg;
  const bars = unit === 'lb' ? [{ v: 20.412, l: '45' }, { v: 15.876, l: '35' }, { v: 11.34, l: '25' }] : [{ v: 20, l: '20' }, { v: 15, l: '15' }, { v: 10, l: '10' }];
  return (
    <Card className="space-y-4">
      <div>
        <p className="mb-2 font-medium">Weight +/− step</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Weight step">
          {steps.map((v) => (
            <Chip key={v} selected={step === v} onClick={() => set(unit === 'lb' ? { weightStepLb: v } : { weightStepKg: v })}>
              {v} {unit}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 font-medium">Barbell weight</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Barbell weight">
          {bars.map((b) => (
            <Chip key={b.l} selected={Math.abs(st.barWeightKg - b.v) < 0.1} onClick={() => set({ barWeightKg: b.v })}>
              {b.l} {unit}
            </Chip>
          ))}
        </div>
      </div>
      <Row label="Default rest" hint="Used when an exercise has no rest time of its own.">
        <select aria-label="Default rest" value={st.defaultRestSec} onChange={(e) => set({ defaultRestSec: Number(e.target.value) })} className="min-h-11 rounded-xl border border-line bg-surface px-2">
          <option value={0}>Per exercise</option>
          {[45, 60, 90, 120, 150, 180, 240].map((v) => <option key={v} value={v}>{fmtSec(v)}</option>)}
        </select>
      </Row>
      <Toggle checked={st.includeWarmupsInVolume} onChange={(v) => set({ includeWarmupsInVolume: v })} label="Count warm-ups in volume" description="Off by default — warm-ups never count as personal records." />
      <Toggle checked={st.restSound} onChange={(v) => set({ restSound: v })} label="Rest timer sound" />
      <Toggle checked={st.restVibrate} onChange={(v) => set({ restVibrate: v })} label="Rest timer vibration" />
      <Toggle
        checked={st.restNotify}
        onChange={async (v) => {
          if (v && !(await requestNotificationPermission())) return;
          set({ restNotify: v });
        }}
        label="Rest timer notification"
        description="Alerts you when rest is over while the app is in the background."
      />
    </Card>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  );
}

function ProfileEditor() {
  const { data: p } = useProfile();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(p ?? null);
  useEffect(() => setDraft(p ?? null), [p]);
  if (!p || !draft) return null;
  const imperial = draft.units === 'imperial';
  const fi = cmToFtIn(draft.heightCm);
  return (
    <Card>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between font-semibold">
        Body & preferences <ChevronRight className={clsx('text-muted transition-transform', open && 'rotate-90')} aria-hidden />
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <Input label="Name (optional, stays on device)" value={draft.name ?? ''} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value || undefined })} />
          <Segmented label="Units" value={draft.units} onChange={(units) => setDraft({ ...draft, units })} options={[{ value: 'metric', label: 'kg · cm' }, { value: 'imperial', label: 'lb · ft/in' }]} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Birth year" inputMode="numeric" value={String(draft.birthYear)} onChange={(e) => setDraft({ ...draft, birthYear: Number(e.target.value) || draft.birthYear })} />
            {imperial ? (
              <div className="grid grid-cols-2 gap-1">
                <Input label="Height" inputMode="numeric" suffix="ft" value={String(fi.ft)} onChange={(e) => setDraft({ ...draft, heightCm: Math.round(ftInToCm(Number(e.target.value) || 0, fi.in)) })} />
                <Input label="&nbsp;" aria-label="inches" inputMode="numeric" suffix="in" value={String(fi.in)} onChange={(e) => setDraft({ ...draft, heightCm: Math.round(ftInToCm(fi.ft, Number(e.target.value) || 0)) })} />
              </div>
            ) : (
              <Input label="Height" inputMode="numeric" suffix="cm" value={String(draft.heightCm)} onChange={(e) => setDraft({ ...draft, heightCm: Number(e.target.value) || 0 })} />
            )}
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Activity level</span>
            <select value={draft.activityLevel} onChange={(e) => setDraft({ ...draft, activityLevel: e.target.value as ActivityLevel })} className="min-h-12 w-full rounded-2xl border border-line bg-surface px-3">
              {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => <option key={a} value={a}>{ACTIVITY_LABELS[a].label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Diet preference</span>
            <select value={draft.dietPreference} onChange={(e) => setDraft({ ...draft, dietPreference: e.target.value as DietPreference })} className="min-h-12 w-full rounded-2xl border border-line bg-surface px-3">
              <option value="vegetarian">Vegetarian</option>
              <option value="eggetarian">Vegetarian + egg</option>
              <option value="non_vegetarian">Non-vegetarian</option>
              <option value="vegan">Vegan</option>
              <option value="other">Other</option>
            </select>
          </label>
          <Input label="Foods to avoid (comma separated)" value={draft.avoidList.join(', ')} onChange={(e) => setDraft({ ...draft, avoidList: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
          <Button
            block
            onClick={async () => {
              await repo.saveProfile(draft);
              await refresh();
              useUI.getState().showSnack({ message: 'Profile saved. Recalculate targets in Goals & plan if needed.' });
              setOpen(false);
            }}
          >
            Save profile
          </Button>
        </div>
      )}
    </Card>
  );
}

function RemindersCard({ s }: { s: Settings }) {
  const r = s.reminders;
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  return (
    <Card className="space-y-3">
      <Toggle
        checked={r.enabled}
        label="Reminders"
        description="Meal logging, workout and an evening “log your day” nudge"
        onChange={async (on) => {
          if (on && !(await requestNotificationPermission())) {
            useUI.getState().showSnack({ message: 'Notifications are blocked for this site. You can allow them in browser settings.' });
            return;
          }
          await update({ reminders: { meals: '13:30', workout: '18:00', evening: '21:30', ...r, enabled: on } });
        }}
      />
      {r.enabled &&
        (
          [
            ['meals', 'Log meals'],
            ['workout', 'Workout'],
            ['evening', 'Log your day'],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex min-h-11 items-center justify-between">
            <span>{label}</span>
            <span className="flex items-center gap-2">
              <input type="time" value={r[k] ?? ''} onChange={(e) => update({ reminders: { ...r, [k]: e.target.value || undefined } })} className="min-h-11 rounded-xl border border-line bg-surface px-2" />
            </span>
          </label>
        ))}
      {perm === 'denied' && <p className="text-sm text-caution">Notifications are blocked in your browser settings.</p>}
      <p className="text-xs text-muted">Delivered by your browser while LevelUp is open or installed. Some phones limit background reminders for web apps.</p>
    </Card>
  );
}

function Milestones() {
  const today = useToday();
  const s = useSettings();
  const { data } = useRangeData(addDays(today, -400), today);
  if (!data) return null;
  const badges = computeBadges(data, today, s.graceDaysPerWeek);
  return (
    <>
      <SectionHeader title="Milestones" />
      <Card>
        <ul className="grid grid-cols-2 gap-2">
          {badges.map((b) => (
            <li key={b.id} className={clsx('flex items-center gap-2 rounded-xl p-2', b.earned ? 'bg-good-soft' : 'bg-surface-2')}>
              <Award size={20} className={b.earned ? 'text-good' : 'text-muted'} aria-hidden />
              <span className="min-w-0">
                <span className={clsx('block text-sm font-semibold', !b.earned && 'text-muted')}>{b.title}</span>
                <span className="block truncate text-xs text-muted">{b.earned ? 'Earned' : b.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function PrivacyCard() {
  return (
    <Card>
      <div className="flex gap-3 text-sm">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-good" aria-hidden />
        <div className="space-y-1 text-muted">
          <p><span className="font-semibold text-ink">Everything stays on this device.</span> Your logs, weight, goals and notes are stored in this browser and never sent anywhere.</p>
          <p>No accounts, no servers, no trackers or analytics. Use Export below to keep your own backup.</p>
        </div>
      </div>
    </Card>
  );
}

function DataCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [confirmDelete, setConfirmDelete] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const snack = (message: string) => useUI.getState().showSnack({ message });
  return (
    <Card className="space-y-4">
      <div>
        <p className="mb-2 font-semibold">Export</p>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={() => exportJSON()}><Download size={16} /> Everything (JSON)</Button>
          <Button size="sm" variant="secondary" onClick={() => exportCSV('foodEntries')}><Download size={16} /> Food (CSV)</Button>
          <Button size="sm" variant="secondary" onClick={() => exportCSV('activityLogs')}><Download size={16} /> Activities (CSV)</Button>
          <Button size="sm" variant="secondary" onClick={() => exportCSV('bodyLogs')}><Download size={16} /> Weight (CSV)</Button>
          <Button size="sm" variant="secondary" onClick={() => exportCSV('sleepLogs')}><Download size={16} /> Sleep (CSV)</Button>
        </div>
      </div>
      <div>
        <p className="mb-2 font-semibold">Import a LevelUp JSON export</p>
        <Segmented label="Import mode" value={mode} onChange={setMode} options={[{ value: 'merge', label: 'Merge' }, { value: 'replace', label: 'Replace all' }]} />
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Choose export file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setBusy(true);
            try {
              await importJSON(f, mode);
              await refresh();
              snack('Import complete');
            } catch (err) {
              snack((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button size="sm" variant="secondary" className="mt-2" disabled={busy} onClick={() => fileRef.current?.click()}>
          {mode === 'merge' ? <Upload size={16} /> : <FileUp size={16} />} Choose file…
        </Button>
      </div>
      <div>
        <p className="mb-1 flex items-center gap-2 font-semibold"><Database size={16} aria-hidden /> Demo data</p>
        <p className="mb-2 text-sm text-muted">Replace everything with ~60 days of sample data to explore charts and summaries.</p>
        <Button size="sm" variant="secondary" disabled={busy} onClick={async () => {
          if (!confirm('Replace all your data with demo data?')) return;
          setBusy(true);
          const { seedDemoData } = await import('@/dev/seed');
          await seedDemoData(repo);
          await refresh();
          setBusy(false);
          navigate('/');
        }}>
          <Moon size={16} /> Load demo data
        </Button>
      </div>
      <div className="rounded-xl border border-line p-3">
        <p className="flex items-center gap-2 font-semibold text-danger"><Trash2 size={16} aria-hidden /> Delete all data</p>
        <p className="mb-2 text-sm text-muted">Permanently removes everything on this device. Export first if you want a copy. Type DELETE to confirm.</p>
        <div className="flex gap-2">
          <Input aria-label="Type DELETE to confirm" className="flex-1" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} placeholder="DELETE" />
          <Button variant="danger" disabled={confirmDelete !== 'DELETE' || busy} onClick={async () => {
            await repo.deleteAll();
            try { localStorage.clear(); } catch { /* ignore */ }
            await refresh();
            navigate('/onboarding', { replace: true });
          }}>
            Delete
          </Button>
        </div>
      </div>
      <p className="flex gap-2 text-xs text-muted"><Info size={14} className="shrink-0" aria-hidden /> Data lives in this browser's storage. Clearing site data or uninstalling the app removes it.</p>
    </Card>
  );
}
