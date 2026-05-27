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
 * Two-tone ascending chime — push / bell notification.
 */
export function playNotificationChime(): void {
  void runningCtx().then((ctx) => {
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      const tones = [
        { freq: 880,  start: now,        end: now + 0.18 },
        { freq: 1320, start: now + 0.14, end: now + 0.36 },
      ];

      for (const { freq, start, end } of tones) {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, end);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(end);
      }
    } catch { /* ignore */ }
  });
}
