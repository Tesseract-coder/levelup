import clsx from 'clsx';
import { Info, Minus, Plus, Sparkles } from 'lucide-react';
import { forwardRef, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger';

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'md' | 'lg' | 'sm'; block?: boolean }
>(function Button({ variant = 'primary', size = 'md', block, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-[transform,background-color] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100',
        size === 'lg' && 'min-h-14 px-6 text-base',
        size === 'md' && 'min-h-12 px-5 text-base',
        size === 'sm' && 'min-h-11 px-4 text-sm',
        block && 'w-full',
        variant === 'primary' && 'bg-accent text-on-accent shadow-card',
        variant === 'secondary' && 'border border-line bg-surface text-ink',
        variant === 'ghost' && 'text-accent-ink hover:bg-accent-soft',
        variant === 'soft' && 'bg-accent-soft text-accent-ink',
        variant === 'danger' && 'border border-line bg-surface text-danger',
        className,
      )}
      {...props}
    />
  );
});

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2', className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'rounded-[var(--radius-card)]',
        // defaults yield to overrides (Tailwind can't resolve two bg-*/shadow-*/p-* classes by order)
        !/(^|\s)bg-/.test(className ?? '') && 'bg-surface',
        !/(^|\s)p-\d/.test(className ?? '') && 'p-4',
        !/(^|\s)shadow-/.test(className ?? '') && 'shadow-card',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex min-h-11 items-center justify-between px-1">
      <h2 className="text-base font-bold">{title}</h2>
      {action}
    </div>
  );
}

export function Chip({
  selected,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={clsx(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors duration-150',
        selected ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-2xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'min-h-11 flex-1 rounded-xl px-2 text-sm font-semibold transition-colors duration-150',
            value === o.value ? 'bg-surface text-ink shadow-card' : 'text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; suffix?: string }>(
  function Input({ label, hint, suffix, className, id, ...props }, ref) {
    const auto = useId();
    const inputId = id ?? auto;
    return (
      <div className={className}>
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold">
            {label}
          </label>
        )}
        <div className="flex items-center rounded-2xl border border-line bg-surface focus-within:border-accent">
          <input
            ref={ref}
            id={inputId}
            className="min-h-12 w-full min-w-0 flex-1 rounded-2xl bg-transparent px-4 outline-none placeholder:text-muted/70"
            {...props}
          />
          {suffix && <span className="pr-4 text-sm text-muted">{suffix}</span>}
        </div>
        {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      </div>
    );
  },
);

/** Big +/- stepper used for numeric habits, water, quantities. */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 100000,
  unit,
  label,
  decimals = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  label: string;
  decimals?: number;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Number(v.toFixed(decimals))));
  return (
    <div className="flex items-center justify-between gap-3" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={() => onChange(clamp(value - step))}
        className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-ink active:scale-95"
      >
        <Minus size={24} />
      </button>
      <label className="flex flex-1 flex-col items-center">
        <span className="sr-only">{label}</span>
        <input
          inputMode="decimal"
          value={Number.isFinite(value) ? String(value) : ''}
          onChange={(e) => {
            const v = parseFloat(e.target.value.replace(',', '.'));
            onChange(Number.isFinite(v) ? clamp(v) : 0);
          }}
          className="tabular w-full bg-transparent text-center text-4xl font-bold outline-none"
        />
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </label>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => onChange(clamp(value + step))}
        className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-ink active:scale-95"
      >
        <Plus size={24} />
      </button>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between gap-4 text-left"
    >
      <span>
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
      <span className={clsx('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-3')}>
        <span
          className={clsx(
            'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </span>
    </button>
  );
}

export function ProgressBar({ value, color = 'var(--accent)', label }: { value: number; color?: string; label: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-ring-track"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
    >
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct * 100}%`, background: color }} />
    </div>
  );
}

/** Subtle marker that a number is an estimate (AI or formula). Tap to see why. */
export function EstimateBadge({ note }: { note?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-label={note ? `Estimate: ${note}` : 'This value is an estimate'}
        className="inline-flex min-h-6 items-center gap-0.5 rounded-full bg-surface-2 px-2 text-xs font-medium text-muted"
      >
        ≈ est.
      </button>
      {open && note && (
        <span role="note" className="absolute left-0 top-7 z-20 w-60 rounded-xl bg-ink p-3 text-xs font-normal text-canvas shadow-card">
          {note}
        </span>
      )}
    </span>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-8 text-center">
      {icon && <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-ink">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} aria-hidden />;
}

export function Notice({ tone = 'info', children, icon }: { tone?: 'info' | 'caution' | 'good' | 'ai'; children: ReactNode; icon?: ReactNode }) {
  return (
    <div
      className={clsx(
        'flex gap-3 rounded-2xl p-3 text-sm',
        tone === 'info' && 'bg-surface-2 text-ink',
        tone === 'caution' && 'bg-caution-soft text-ink',
        tone === 'good' && 'bg-good-soft text-ink',
        tone === 'ai' && 'bg-accent-soft text-ink',
      )}
    >
      <span
        className={clsx(
          'mt-0.5 shrink-0',
          tone === 'caution' ? 'text-caution' : tone === 'good' ? 'text-good' : tone === 'ai' ? 'text-accent-ink' : 'text-muted',
        )}
      >
        {icon ?? (tone === 'ai' ? <Sparkles size={18} /> : <Info size={18} />)}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, left, right }: { title: string; subtitle?: string; left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex items-center gap-2 px-4 pb-2 pt-4">
      {left}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}
