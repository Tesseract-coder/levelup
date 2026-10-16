import { repo } from '@/db';
import type { ExportBundle } from '@/db/repository';
import { todayKey } from '@/domain/dates';

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportJSON() {
  const bundle = await repo.exportAll();
  download(`levelup-export-${todayKey()}.json`, JSON.stringify(bundle, null, 2), 'application/json');
}

const csvCell = (v: unknown) => {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
}

/** CSV export of the tables people actually analyse in a spreadsheet. */
export async function exportCSV(table: 'foodEntries' | 'activityLogs' | 'bodyLogs' | 'sleepLogs') {
  const b = await repo.exportAll();
  let rows = (b.data[table] ?? []) as Record<string, unknown>[];
  if (table === 'activityLogs') {
    const names = new Map(((b.data.activities ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]));
    rows = rows.map((r) => ({ date: r.date, activity: names.get(r.activityId as string) ?? r.activityId, ...r }));
  }
  rows.sort((x, y) => String(x.date).localeCompare(String(y.date)));
  download(`levelup-${table}-${todayKey()}.csv`, toCSV(rows), 'text/csv');
}

export async function importJSON(file: File, mode: 'replace' | 'merge') {
  if (file.size > 25 * 1024 * 1024) throw new Error('That file is too large to be a LevelUp export.');
  let bundle: ExportBundle;
  try {
    bundle = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  await repo.importAll(bundle, mode);
}
