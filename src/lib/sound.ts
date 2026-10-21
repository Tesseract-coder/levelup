/** Tiny WebAudio beeps (no audio files). The context must be created during a user gesture first. */
let ctx: AudioContext | null = null;

export function primeAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* unsupported */
  }
}

export function beep(times = 2) {
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime;
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.3 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.3 + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + i * 0.3);
      osc.stop(t0 + i * 0.3 + 0.22);
    }
  } catch {
    /* ignore */
  }
}
