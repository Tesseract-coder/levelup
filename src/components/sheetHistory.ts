import { useEffect } from 'react';
import { useNavigate, type NavigateOptions } from 'react-router';
import { useUI } from '@/stores/ui';

/**
 * Keeps bottom sheets in sync with browser history so the system back button /
 * back gesture closes the top sheet instead of leaving the screen.
 * Each open sheet owns one history entry tagged `{ sheet: depth }`.
 */
let pushed = 0;
let pendingNav: { to: string; opts?: NavigateOptions } | null = null;
let navigateRef: ((to: string, opts?: NavigateOptions) => void) | null = null;

function depthFromState(): number {
  const s = window.history.state as { sheet?: number } | null;
  return s?.sheet ?? 0;
}

export function useSheetHistorySync() {
  const count = useUI((s) => s.sheets.length);
  const navigate = useNavigate();
  navigateRef = navigate;

  useEffect(() => {
    while (pushed < count) {
      pushed++;
      window.history.pushState({ ...(window.history.state ?? {}), sheet: pushed }, '');
    }
    if (pushed > count) {
      // Closed by app logic (e.g. "Save"), not by the back button: unwind our entries.
      const n = pushed - count;
      pushed = count;
      window.history.go(-n);
    }
  }, [count]);

  useEffect(() => {
    const onPop = () => {
      const depth = depthFromState();
      const { sheets } = useUI.getState();
      if (depth < sheets.length) {
        pushed = depth;
        useUI.setState({ sheets: sheets.slice(0, depth) });
      } else {
        pushed = Math.min(pushed, depth);
      }
      if (pendingNav && depth === 0) {
        const { to, opts } = pendingNav;
        pendingNav = null;
        navigateRef?.(to, opts);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}

/** Close the top sheet (via history so back/forward stay consistent). */
export function useCloseSheet() {
  return () => {
    if (pushed > 0 && depthFromState() === pushed) window.history.back();
    else useUI.getState().popSheet();
  };
}

/**
 * Close the top sheet, then run `fn` once history has settled — for actions that open
 * another sheet or navigate (doing that while `history.back()` is pending would be undone by it).
 */
export function useCloseSheetThen() {
  const close = useCloseSheet();
  return (fn: () => void | Promise<void>) =>
    new Promise<void>((resolve) => {
      const viaHistory = pushed > 0 && depthFromState() === pushed;
      let done = false;
      const run = () => {
        if (done) return;
        done = true;
        window.removeEventListener('popstate', run);
        // let the popstate handler above update the sheet stack first
        setTimeout(() => void Promise.resolve(fn()).then(resolve), 0);
      };
      if (viaHistory) {
        window.addEventListener('popstate', run);
        setTimeout(run, 500); // safety net if popstate never fires
      }
      close();
      if (!viaHistory) run();
    });
}

/** Close every sheet, then navigate — without leaving stale sheet entries in history. */
export function useNavigateFromSheets() {
  const navigate = useNavigate();
  return (to: string, opts?: NavigateOptions) => {
    if (pushed > 0) {
      pendingNav = { to, opts };
      const n = pushed;
      pushed = 0;
      useUI.setState({ sheets: [] });
      window.history.go(-n);
    } else {
      useUI.setState({ sheets: [] });
      navigate(to, opts);
    }
  };
}
