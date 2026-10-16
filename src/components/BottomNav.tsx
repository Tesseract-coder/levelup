import clsx from 'clsx';
import { BarChart3, CalendarCheck, Home, Plus, UserRound } from 'lucide-react';
import { NavLink } from 'react-router';
import { useUI } from '@/stores/ui';

const tabs = [
  { to: '/', label: 'Today', icon: Home, end: true },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
  null, // centre "Log" button
  { to: '/habits', label: 'Habits', icon: CalendarCheck },
  { to: '/profile', label: 'Profile', icon: UserRound },
] as const;

export function BottomNav() {
  const openSheet = useUI((s) => s.openSheet);
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] border-t border-line bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-5 items-end">
        {tabs.map((t, i) =>
          t === null ? (
            <li key="log" className="flex justify-center">
              <button
                type="button"
                onClick={() => openSheet({ type: 'quickAdd' })}
                aria-label="Log (quick add)"
                className="-mt-6 mb-1 flex flex-col items-center gap-0.5"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-on-accent shadow-card ring-4 ring-canvas transition-transform active:scale-95">
                  <Plus size={28} strokeWidth={2.5} />
                </span>
                <span className="text-xs font-semibold text-muted">Log</span>
              </button>
            </li>
          ) : (
            <li key={i}>
              <NavLink
                to={t.to}
                end={'end' in t ? t.end : undefined}
                className={({ isActive }) =>
                  clsx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold', isActive ? 'text-accent-ink' : 'text-muted')
                }
              >
                {({ isActive }) => (
                  <>
                    <t.icon size={22} strokeWidth={isActive ? 2.4 : 2} aria-hidden />
                    {t.label}
                  </>
                )}
              </NavLink>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
