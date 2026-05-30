/**
 * Audio notification helpers — Web Audio API, no external files needed.
 *
 * Browser autoplay policy: AudioContext starts "suspended" until the page
 * receives a user gesture.  We keep ONE shared context and warm it up on
 * every click / tap / key-press so that subscription-triggered sounds
 * (e.g. an incoming message while the user is reading) play reliably.
 *
 * Critical detail: ctx.resume() is ASYNC.  We never check ctx.state and
 * bail out immediately — instead we always call resume() and schedule the
 * actual oscillator nodes inside the resolved promise.  This way the sound
 * plays even if the context was momentarily suspended (tab switch, etc.).
 */

let _ctx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;

    if (!_ctx || _ctx.state === "closed") {
      _ctx = new Ctor();
    }
    return _ctx;
  } catch {
    return null;
  }
}

/** Always returns a promise that resolves to a *running* AudioContext or null. */
async function runningCtx(): Promise<AudioContext | null> {
  const ctx = getAudioCtx();
  if (!ctx) return null;
  if (ctx.state !== "running") {
    try {
      await ctx.resume();
    } catch {
      return null;
    }
  }
  return ctx;
}

// Warm-up: resume the shared context on every user gesture so it is
// already "running" before the next incoming-message event fires.
function warmUp() {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume();
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("click",            warmUp, { passive: true });
  document.addEventListener("touchstart",       warmUp, { passive: true });
  document.addEventListener("keydown",          warmUp, { passive: true });
  document.addEventListener("pointerdown",      warmUp, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") warmUp();
  });
}

// ---------------------------------------------------------------------------

/**
 * Soft descending ping — incoming chat message.
 * Distinct from the notification chime so users can tell them apart.
 */
export function playMessageSound(): void {
  void runningCtx().then((ctx) => {
    if (!ctx) return;
    try {
      const now  = ctx.currentTime;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(700, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.22);

      gain.gain.setValueAtTime(0,    now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } catch { /* ignore */ }
  });
}

/**
 * Three-tone ascending chime — push / bell notification.
 * Boosted from a quiet 0.2 peak gain to a more audible 0.4 with a third
 * tone for a clearer "ping" recognizable above ambient noise.
 */
export function playNotificationChime(): void {
  void runningCtx().then((ctx) => {
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      // Three-note ascending arpeggio: A5 → E6 → A6 (880 → 1320 → 1760 Hz)
      const tones = [
        { freq: 880,  start: now,        end: now + 0.18, peak: 0.38 },
        { freq: 1320, start: now + 0.12, end: now + 0.32, peak: 0.42 },
        { freq: 1760, start: now + 0.24, end: now + 0.50, peak: 0.36 },
      ];

      for (const { freq, start, end, peak } of tones) {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(peak, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, end);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(end);
      }
    } catch { /* ignore */ }
  });
}

/**
 * Rising "bwoop" confirmation — two-stage pop + shimmer.
 *
 * Stage 1 (0 – 220 ms): triangle-wave pluck that sweeps C4→G5 (262→784 Hz).
 *   Triangle has richer harmonics than pure sine, giving a warm "thwop" feel
 *   without harshness.  Quick attack (5 ms) + smooth exponential decay.
 *
 * Stage 2 (80 – 350 ms): a quiet high-frequency sparkle (sine, ~2 600 Hz)
 *   that fades in as the pluck fades out.  This "shimmer" layer reads as
 *   the vote "landing" with a satisfying glint.
 *
 * Total duration ≈ 360 ms — short enough to never feel intrusive.
 */
export function playVoteSound(): void {
  void runningCtx().then((ctx) => {
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      // — Stage 1: rising pluck (triangle, C4 → G5) —
      const pluck     = ctx.createOscillator();
      const pluckGain = ctx.createGain();
      pluck.type = "triangle";
      pluck.frequency.setValueAtTime(262, now);
      pluck.frequency.exponentialRampToValueAtTime(784, now + 0.18);
      pluckGain.gain.setValueAtTime(0,    now);
      pluckGain.gain.linearRampToValueAtTime(0.18, now + 0.005);
      pluckGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      pluck.connect(pluckGain);
      pluckGain.connect(ctx.destination);
      pluck.start(now);
      pluck.stop(now + 0.24);

      // — Stage 2: shimmer sparkle (sine, ~2 600 Hz) —
      const spark     = ctx.createOscillator();
      const sparkGain = ctx.createGain();
      spark.type = "sine";
      spark.frequency.setValueAtTime(2600, now + 0.08);
      spark.frequency.exponentialRampToValueAtTime(2200, now + 0.32);
      sparkGain.gain.setValueAtTime(0,     now + 0.08);
      sparkGain.gain.linearRampToValueAtTime(0.055, now + 0.12);
      sparkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      spark.connect(sparkGain);
      sparkGain.connect(ctx.destination);
      spark.start(now + 0.08);
      spark.stop(now + 0.38);
    } catch { /* ignore */ }
  });
}
