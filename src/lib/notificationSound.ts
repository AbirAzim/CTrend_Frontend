/**
 * Plays a soft single-tone ping for incoming chat messages.
 * Lower and shorter than the notification chime so the two events
 * are perceptually distinct.
 */
export function playMessageSound(): void {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.15);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);

    setTimeout(() => void ctx.close(), 600);
  } catch {
    // AudioContext blocked or unavailable — silently skip
  }
}

/**
 * Plays a short two-tone chime using the Web Audio API.
 * No audio file required — generated entirely in the browser.
 * Silently ignored if AudioContext is not available (e.g. SSR, blocked).
 */
export function playNotificationChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Two-tone ascending chime: 880 Hz → 1320 Hz
    const tones = [
      { freq: 880, start: now, end: now + 0.18 },
      { freq: 1320, start: now + 0.14, end: now + 0.36 },
    ];

    for (const { freq, start, end } of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, end);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(end);
    }

    // Auto-close the AudioContext after the chime finishes
    setTimeout(() => void ctx.close(), 600);
  } catch {
    // AudioContext blocked or unavailable — silently skip
  }
}
