import clsx from 'clsx';
import { Table2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { TooltipContentProps } from 'recharts';
import { Card, EmptyState } from '@/components/ui';
import { fromKey } from '@/domain/dates';

export const AXIS = { fontSize: 11, fill: 'var(--muted)' } as const;
export const GRID = 'var(--line)';

// -------------------------------------------------------------- building blocks

export function ChartCard({ title, subtitle, children, table, empty, legend }: { title: string; subtitle?: ReactNode; children: ReactNode; table?: ReactNode; empty?: string | false; legend?: { label: string; color: string; kind?: 'bar' | 'line' | 'dash' | 'dot' }[] }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card>
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">{title}</h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {table && !empty && (
          <button type="button" onClick={() => setShowTable((s) => !s)} aria-pressed={showTable} aria-label={`Show ${title} as table`} className="grid h-11 w-11 place-items-center rounded-full text-muted">
            <Table2 size={18} />
          </button>
        )}
      </div>
      {empty ? (
        <EmptyState title="Not enough data yet" body={empty} />
      ) : showTable ? (
        <div className="max-h-72 overflow-auto text-sm">{table}</div>
      ) : (
        <>
          {legend && legend.length > 1 && (
            <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
              {legend.map((l) => (
                <li key={l.label} className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={clsx(l.kind === 'line' ? 'h-0.5 w-4' : l.kind === 'dash' ? 'h-0 w-4 border-t-2 border-dashed' : l.kind === 'dot' ? 'h-2 w-2 rounded-full' : 'h-2.5 w-2.5 rounded-[3px]')}
                    style={l.kind === 'dash' ? { borderColor: l.color } : { background: l.color }}
                  />
                  {l.label}
                </li>
              ))}
            </ul>
          )}
          <div className="-mx-2 h-52" role="group" aria-label={`${title} chart. Use arrow keys to inspect points, or the table button for exact values.`}>
            {children}
          </div>
        </>
      )}
    </Card>
  );
}

export function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="tabular w-full text-left">
      <thead className="sticky top-0 bg-surface text-xs text-muted">
        <tr>{head.map((h) => <th key={h} className="py-1 pr-2 font-semibold">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-line">
            {r.map((c, j) => <td key={j} className="py-1.5 pr-2">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Tip({ active, payload, label, format }: Partial<TooltipContentProps<number, string>> & { format?: (name: string, v: number) => string }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value != null && p.name !== 'hidden');
  if (!rows.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-card">
      <p className="mb-1 font-semibold text-ink">{typeof label === 'string' && /^\d{4}-/.test(label) ? fromKey(label).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : label}</p>
      {rows.map((p) => (
        <p key={String(p.name)} className="flex items-center gap-2 text-ink">
          <span className="h-2 w-2 rounded-full" style={{ background: (p.color as string) ?? (p.payload as { fill?: string })?.fill }} aria-hidden />
          <span className="text-muted">{p.name}</span>
          <span className="ml-auto font-semibold">{format ? format(String(p.name), Number(p.value)) : Math.round(Number(p.value)).toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

