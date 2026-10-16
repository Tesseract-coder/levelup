import { useUI } from '@/stores/ui';

/** Registers the service worker (production only) and offers a reload when an update is ready. */
export async function registerPWA() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const { registerSW } = await import('virtual:pwa-register');
  // immediate: the module loads after window 'load', so don't wait for that event
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      useUI.getState().showSnack({ message: 'A new version of LevelUp is ready.', actionLabel: 'Reload', onAction: () => update(true) });
    },
    onOfflineReady() {
      useUI.getState().showSnack({ message: 'LevelUp now works offline.' });
    },
  });
}
