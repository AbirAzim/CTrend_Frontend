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
  if (ctx.state === "running") return ctx;
  // Safari: outside a user gesture, ctx.resume() may hang or reject.
  // Race it against a short timeout so we never block forever.
  try {
    const resumed = ctx.resume();
    const timed = new Promise<void>((resolve) => setTimeout(resolve, 200));
    await Promise.race([resumed, timed]);
  } catch {
    return null;
  }
  return ctx.state === "running" ? ctx : null;
}

// Warm-up: create AND resume the shared context on every user gesture.
// Safari is strict — the context MUST be created inside a user gesture for
// later resume() calls to succeed reliably. We touch a tiny silent oscillator
// the first time so Safari fully "unlocks" the audio output.
let _unlocked = false;
function warmUp() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (!_unlocked) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.01);
      _unlocked = true;
    } catch { /* ignore */ }
  }
  if (ctx.state === "suspended") {
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
      // Safari has known issues with exponentialRampToValueAtTime; use linear ramps
      osc.frequency.linearRampToValueAtTime(520, now + 0.22);

      gain.gain.setValueAtTime(0,    now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.012);
      gain.gain.linearRampToValueAtTime(0,    now + 0.38);

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
        // Safari-safer: linear ramp to 0 instead of exponential to 0.001
        gain.gain.linearRampToValueAtTime(0, end);

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
/**
 * Crisp tactile "tick + pop" — modeled after a UI confirmation click.
 *
 * Stage 1 (0–35 ms): high-frequency tick (sine 1800→1400 Hz, very short attack)
 *   reads as a finger tap — physical, immediate confirmation.
 *
 * Stage 2 (20–180 ms): warm body pop (sine 520→380 Hz with light triangle
 *   overlay). The descending sweep + brief sustain gives weight to the click
 *   so it feels deliberate, not just a beep.
 *
 * Stage 3 (40–160 ms): subtle low-end thump (sine 110 Hz) adds physical weight.
 *
 * Total duration ≈ 200 ms — short, satisfying, clearly a "thing just happened".
 */
export function playVoteSound(): void {
  void runningCtx().then((ctx) => {
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      // Stage 1 — sharp tick
      const tick     = ctx.createOscillator();
      const tickGain = ctx.createGain();
      tick.type = "sine";
      tick.frequency.setValueAtTime(1800, now);
      tick.frequency.linearRampToValueAtTime(1400, now + 0.035);
      tickGain.gain.setValueAtTime(0,     now);
      tickGain.gain.linearRampToValueAtTime(0.22, now + 0.003);
      tickGain.gain.linearRampToValueAtTime(0,    now + 0.04);
      tick.connect(tickGain);
      tickGain.connect(ctx.destination);
      tick.start(now);
      tick.stop(now + 0.05);

      // Stage 2 — warm body pop
      const pop      = ctx.createOscillator();
      const popGain  = ctx.createGain();
      pop.type = "sine";
      pop.frequency.setValueAtTime(520, now + 0.02);
      pop.frequency.linearRampToValueAtTime(380, now + 0.18);
      popGain.gain.setValueAtTime(0,    now + 0.02);
      popGain.gain.linearRampToValueAtTime(0.28, now + 0.04);
      popGain.gain.linearRampToValueAtTime(0,    now + 0.20);
      pop.connect(popGain);
      popGain.connect(ctx.destination);
      pop.start(now + 0.02);
      pop.stop(now + 0.21);

      // Stage 3 — sub-bass thump
      const thump     = ctx.createOscillator();
      const thumpGain = ctx.createGain();
      thump.type = "sine";
      thump.frequency.setValueAtTime(110, now + 0.04);
      thumpGain.gain.setValueAtTime(0,     now + 0.04);
      thumpGain.gain.linearRampToValueAtTime(0.18, now + 0.07);
      thumpGain.gain.linearRampToValueAtTime(0,    now + 0.16);
      thump.connect(thumpGain);
      thumpGain.connect(ctx.destination);
      thump.start(now + 0.04);
      thump.stop(now + 0.17);
    } catch { /* ignore */ }
  });
}
