import { useCallback, useEffect, useRef, useState } from 'react';
import { repo } from '@/db';
import type { StrengthSession } from '@/db/types';
import { queryClient } from '@/lib/queryClient';

/**
 * Local editing state for one session.
 * In-progress sessions autosave to IndexedDB (debounced, flushed when the page hides),
 * so a reload or app kill never loses more than a fraction of a second.
 * Finished sessions are only written when the user taps Save.
 */
export function useSessionEditor(id: string) {
  const [session, setSession] = useState<StrengthSession | null | undefined>(undefined);
  const ref = useRef<StrengthSession | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void repo.getSession(id).then((s) => {
      if (!alive) return;
      ref.current = s ?? null;
      setSession(s ?? null);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const s = ref.current;
    if (!dirty.current || !s || s.status !== 'in_progress') return;
    dirty.current = false;
    await repo.saveSession(s);
    void queryClient.invalidateQueries({ queryKey: ['strengthInProgress'] });
  }, []);

  const update = useCallback(
    (fn: (s: StrengthSession) => StrengthSession) => {
      const cur = ref.current;
      if (!cur) return;
      const next = fn(cur);
      if (next === cur) return;
      ref.current = next;
      dirty.current = true;
      setSession(next);
      if (next.status === 'in_progress') {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), 250);
      }
    },
    [flush],
  );

  useEffect(() => {
    const onHide = () => void flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      void flush();
    };
  }, [flush]);

  /** Whether a finished session has unsaved edits. */
  const isDirty = () => dirty.current;
  const current = () => ref.current;
  return { session, update, flush, isDirty, current };
}
