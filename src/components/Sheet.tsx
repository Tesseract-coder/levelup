import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { useCloseSheet } from './sheetHistory';

interface SheetProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Taller sheets for editors (review screens use full pages instead). */
  size?: 'auto' | 'tall';
}

/** Bottom sheet. Only the top sheet of the stack is mounted, so focus trapping never conflicts. */
export function Sheet({ title, description, children, footer, size = 'auto' }: SheetProps) {
  const close = useCloseSheet();
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, dy: 0 };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !panel.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    drag.current.dy = dy;
    panel.current.style.transform = `translateY(${dy}px)`;
  };
  const onPointerUp = () => {
    if (!drag.current || !panel.current) return;
    const { dy } = drag.current;
    drag.current = null;
    if (dy > 90) close();
    else panel.current.style.transform = '';
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          ref={panel}
          className={`sheet-content fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[480px] flex-col rounded-t-[var(--radius-sheet)] bg-surface shadow-sheet outline-none ${
            size === 'tall' ? 'h-[88dvh]' : 'max-h-[88dvh]'
          }`}
          aria-describedby={description ? undefined : undefined}
          onOpenAutoFocus={(e) => {
            // Don't pop the keyboard open on mobile; focus the panel instead.
            e.preventDefault();
            panel.current?.focus();
          }}
        >
          <div
            className="flex touch-none cursor-grab justify-center pt-2.5 pb-1"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-hidden
          >
            <div className="h-1.5 w-10 rounded-full bg-surface-3" />
          </div>
          <div className="flex items-start gap-3 px-5 pb-2">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-bold leading-tight">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-muted">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2"
              aria-label="Close"
            >
              <X size={22} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
          {footer ? (
            <div className="border-t border-line px-5 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
              {footer}
            </div>
          ) : (
            <div style={{ height: 'env(safe-area-inset-bottom)' }} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
