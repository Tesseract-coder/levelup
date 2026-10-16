import { useEffect } from 'react';
import { useUI } from '@/stores/ui';

/** Single snackbar with optional action (used for undo after delete). */
export function Snackbar() {
  const snack = useUI((s) => s.snack);
  const hide = useUI((s) => s.hideSnack);
  useEffect(() => {
    if (!snack) return;
    const t = setTimeout(hide, snack.onAction ? 6000 : 3000);
    return () => clearTimeout(t);
  }, [snack, hide]);
  if (!snack) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] mx-auto flex max-w-[480px] justify-center px-4"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}
    >
      <div
        role="status"
        aria-live="polite"
        key={snack.id}
        className="animate-rise pointer-events-auto flex w-full items-center gap-3 rounded-2xl bg-ink py-2 pl-4 pr-2 text-canvas shadow-card"
      >
        <span className="flex-1 text-sm">{snack.message}</span>
        {snack.onAction && (
          <button
            type="button"
            className="min-h-11 rounded-xl px-3 text-sm font-bold text-accent-soft"
            onClick={() => {
              snack.onAction?.();
              hide();
            }}
          >
            {snack.actionLabel ?? 'Undo'}
          </button>
        )}
      </div>
    </div>
  );
}
