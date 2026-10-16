let enabled = true;
export function setHaptics(on: boolean) {
  enabled = on;
}
/** Short vibration where supported (Android Chrome). Silently no-ops elsewhere. */
export function haptic(pattern: number | number[] = 12) {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
