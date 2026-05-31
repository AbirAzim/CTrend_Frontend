/**
 * Web Audio sound helpers + user-selectable presets (vote, bell, message).
 */

import {
  readCachedSoundPreferences,
  writeCachedSoundPreferences,
} from "./soundPreferencesStorage";

let _ctx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    if (!_ctx || _ctx.state === "closed") _ctx = new Ctor();
    return _ctx;
  } catch {
    return null;
  }
}

async function runningCtx(): Promise<AudioContext | null> {
  const ctx = getAudioCtx();
  if (!ctx) return null;
  if (ctx.state === "running") return ctx;
  try {
    await Promise.race([ctx.resume(), new Promise<void>((r) => setTimeout(r, 200))]);
  } catch {
    return null;
  }
  const current = getAudioCtx();
  return current?.state === "running" ? current : null;
}

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
  if (ctx.state === "suspended") void ctx.resume();
}

if (typeof document !== "undefined") {
  document.addEventListener("click", warmUp, { passive: true });
  document.addEventListener("touchstart", warmUp, { passive: true });
  document.addEventListener("keydown", warmUp, { passive: true });
  document.addEventListener("pointerdown", warmUp, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") warmUp();
  });
}

// ---------------------------------------------------------------------------

type SoundPlayer = (ctx: AudioContext, now: number) => void;

function withCtx(player: SoundPlayer): void {
  void runningCtx().then((ctx) => {
    if (!ctx) return;
    try {
      player(ctx, ctx.currentTime);
    } catch { /* ignore */ }
  });
}

function playTone(
  ctx: AudioContext,
  freq: number,
  start: number,
  end: number,
  peak: number,
  type: OscillatorType = "sine",
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.018);
  gain.gain.linearRampToValueAtTime(0, end);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(end + 0.02);
}

function playBuzzIn(ctx: AudioContext, now: number): void {
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(1400, now);
  const busGain = ctx.createGain();
  busGain.gain.setValueAtTime(0, now);
  busGain.gain.linearRampToValueAtTime(0.24, now + 0.003);
  busGain.gain.linearRampToValueAtTime(0.16, now + 0.045);
  busGain.gain.linearRampToValueAtTime(0, now + 0.13);
  lowpass.connect(busGain);
  busGain.connect(ctx.destination);
  for (const detune of [0, 7]) {
    const buzz = ctx.createOscillator();
    buzz.type = "square";
    buzz.frequency.setValueAtTime(212 + detune, now);
    buzz.frequency.linearRampToValueAtTime(188 + detune, now + 0.11);
    buzz.connect(lowpass);
    buzz.start(now);
    buzz.stop(now + 0.14);
  }
  playTone(ctx, 1200, now, now + 0.03, 0.1);
}

function playCrowdPop(ctx: AudioContext, now: number): void {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 0.26));
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = ctx.createBufferSource();
  const noiseGain = ctx.createGain();
  const bandpass = ctx.createBiquadFilter();
  noise.buffer = noiseBuffer;
  bandpass.type = "bandpass";
  bandpass.frequency.setValueAtTime(900, now);
  noiseGain.gain.setValueAtTime(0, now);
  noiseGain.gain.linearRampToValueAtTime(0.42, now + 0.012);
  noiseGain.gain.linearRampToValueAtTime(0, now + 0.14);
  noise.connect(bandpass);
  bandpass.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.15);
  playTone(ctx, 95, now, now + 0.2, 0.36);
}

function playSoftPop(ctx: AudioContext, now: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(620, now);
  osc.frequency.linearRampToValueAtTime(480, now + 0.06);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.3, now + 0.008);
  gain.gain.linearRampToValueAtTime(0, now + 0.08);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.09);
}

function playCoinPing(ctx: AudioContext, now: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.linearRampToValueAtTime(1100, now + 0.04);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.35, now + 0.006);
  gain.gain.linearRampToValueAtTime(0, now + 0.16);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.17);
}

function playSlotTick(ctx: AudioContext, now: number): void {
  const tick = ctx.createOscillator();
  const tickGain = ctx.createGain();
  tick.type = "triangle";
  tick.frequency.setValueAtTime(2400, now);
  tick.frequency.linearRampToValueAtTime(1600, now + 0.025);
  tickGain.gain.setValueAtTime(0, now);
  tickGain.gain.linearRampToValueAtTime(0.22, now + 0.002);
  tickGain.gain.linearRampToValueAtTime(0, now + 0.045);
  tick.connect(tickGain);
  tickGain.connect(ctx.destination);
  tick.start(now);
  tick.stop(now + 0.05);
}

function playThock(ctx: AudioContext, now: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.linearRampToValueAtTime(90, now + 0.07);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.32, now + 0.004);
  gain.gain.linearRampToValueAtTime(0, now + 0.1);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.11);
}

function playWhistleChirp(ctx: AudioContext, now: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1800, now);
  osc.frequency.linearRampToValueAtTime(2400, now + 0.05);
  osc.frequency.linearRampToValueAtTime(1600, now + 0.14);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.22, now + 0.01);
  gain.gain.linearRampToValueAtTime(0, now + 0.18);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.19);
}

function playSuccessDuo(ctx: AudioContext, now: number): void {
  playTone(ctx, 587.33, now, now + 0.1, 0.28);
  playTone(ctx, 880, now + 0.08, now + 0.22, 0.32);
}

function playAscendingChime(ctx: AudioContext, now: number): void {
  const tones = [
    { freq: 880, start: now, end: now + 0.18, peak: 0.38 },
    { freq: 1320, start: now + 0.12, end: now + 0.32, peak: 0.42 },
    { freq: 1760, start: now + 0.24, end: now + 0.5, peak: 0.36 },
  ];
  for (const { freq, start, end, peak } of tones) {
    playTone(ctx, freq, start, end, peak);
  }
}

function playSoftChime(ctx: AudioContext, now: number): void {
  playTone(ctx, 523.25, now, now + 0.16, 0.26);
  playTone(ctx, 659.25, now + 0.1, now + 0.28, 0.3);
}

function playGentleBell(ctx: AudioContext, now: number): void {
  playTone(ctx, 740, now, now + 0.35, 0.34);
}

function playGentlePing(ctx: AudioContext, now: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(700, now);
  osc.frequency.linearRampToValueAtTime(520, now + 0.22);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.28, now + 0.012);
  gain.gain.linearRampToValueAtTime(0, now + 0.38);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.4);
}

const SOUND_PLAYERS: Record<string, SoundPlayer> = {
  "buzz-in": playBuzzIn,
  "crowd-pop": playCrowdPop,
  "soft-pop": playSoftPop,
  "coin-ping": playCoinPing,
  "slot-tick": playSlotTick,
  thock: playThock,
  "whistle-chirp": playWhistleChirp,
  "success-duo": playSuccessDuo,
  "ascending-chime": playAscendingChime,
  "soft-chime": playSoftChime,
  "gentle-bell": playGentleBell,
  "gentle-ping": playGentlePing,
};

export type VoteSoundId =
  | "buzz-in"
  | "crowd-pop"
  | "soft-pop"
  | "coin-ping"
  | "slot-tick"
  | "thock"
  | "whistle-chirp"
  | "success-duo";

export type NotificationSoundId =
  | "ascending-chime"
  | "success-duo"
  | "coin-ping"
  | "soft-chime"
  | "gentle-bell"
  | "whistle-chirp"
  | "buzz-in";

export type MessageSoundId =
  | "gentle-ping"
  | "soft-pop"
  | "coin-ping"
  | "thock"
  | "slot-tick"
  | "buzz-in";

export type SoundCategory = "vote" | "notification" | "message";

export type SoundPresetMeta = {
  id: string;
  label: string;
  description: string;
  duration: string;
  emoji: string;
};

export type SoundPreferences = {
  voteSoundId: VoteSoundId;
  notificationSoundId: NotificationSoundId;
  messageSoundId: MessageSoundId;
};

export const DEFAULT_VOTE_SOUND_ID: VoteSoundId = "buzz-in";
export const DEFAULT_NOTIFICATION_SOUND_ID: NotificationSoundId = "ascending-chime";
export const DEFAULT_MESSAGE_SOUND_ID: MessageSoundId = "gentle-ping";

const VOTE_IDS: VoteSoundId[] = [
  "buzz-in", "crowd-pop", "soft-pop", "coin-ping", "slot-tick", "thock", "whistle-chirp", "success-duo",
];
const NOTIFICATION_IDS: NotificationSoundId[] = [
  "ascending-chime", "success-duo", "coin-ping", "soft-chime", "gentle-bell", "whistle-chirp", "buzz-in",
];
const MESSAGE_IDS: MessageSoundId[] = [
  "gentle-ping", "soft-pop", "coin-ping", "thock", "slot-tick", "buzz-in",
];

export function isVoteSoundId(value: string): value is VoteSoundId {
  return VOTE_IDS.includes(value as VoteSoundId);
}
export function isNotificationSoundId(value: string): value is NotificationSoundId {
  return NOTIFICATION_IDS.includes(value as NotificationSoundId);
}
export function isMessageSoundId(value: string): value is MessageSoundId {
  return MESSAGE_IDS.includes(value as MessageSoundId);
}

function meta(id: string, label: string, description: string, duration: string, emoji: string): SoundPresetMeta {
  return { id, label, description, duration, emoji };
}

export const VOTE_SOUND_PRESETS: SoundPresetMeta[] = [
  meta("buzz-in", "Buzz-in", "Quiz-show button buzz.", "~130ms", "🔔"),
  meta("crowd-pop", "Crowd pop", "Stadium clap + thump.", "~260ms", "📣"),
  meta("soft-pop", "Soft pop", "Minimal bubble tap.", "~80ms", "🫧"),
  meta("coin-ping", "Coin ping", "Bright reward ding.", "~160ms", "🪙"),
  meta("slot-tick", "Slot tick", "Crisp click.", "~60ms", "🎰"),
  meta("thock", "Thock", "Keyboard confirm.", "~100ms", "⌨️"),
  meta("whistle-chirp", "Whistle chirp", "Short ref whistle.", "~180ms", "⚽"),
  meta("success-duo", "Success duo", "Two-note rise.", "~220ms", "✅"),
];

export const NOTIFICATION_SOUND_PRESETS: SoundPresetMeta[] = [
  meta("ascending-chime", "Ascending chime", "Classic 3-note bell.", "~500ms", "🔔"),
  meta("success-duo", "Success duo", "Light two-note ping.", "~220ms", "✅"),
  meta("coin-ping", "Coin ping", "Bright single ding.", "~160ms", "🪙"),
  meta("soft-chime", "Soft chime", "Warm two-note chime.", "~280ms", "🎵"),
  meta("gentle-bell", "Gentle bell", "Single soft bell.", "~350ms", "🛎️"),
  meta("whistle-chirp", "Whistle chirp", "Sporty alert.", "~180ms", "⚽"),
  meta("buzz-in", "Buzz-in", "Sharp buzz alert.", "~130ms", "📳"),
];

export const MESSAGE_SOUND_PRESETS: SoundPresetMeta[] = [
  meta("gentle-ping", "Gentle ping", "Soft descending ping.", "~380ms", "💬"),
  meta("soft-pop", "Soft pop", "Tiny bubble.", "~80ms", "🫧"),
  meta("coin-ping", "Coin ping", "Bright ding.", "~160ms", "🪙"),
  meta("thock", "Thock", "Tactile tap.", "~100ms", "⌨️"),
  meta("slot-tick", "Slot tick", "Quick click.", "~60ms", "🎰"),
  meta("buzz-in", "Buzz-in", "Buzz on new message.", "~130ms", "🔔"),
];

export const SOUND_PRESETS_BY_CATEGORY: Record<SoundCategory, SoundPresetMeta[]> = {
  vote: VOTE_SOUND_PRESETS,
  notification: NOTIFICATION_SOUND_PRESETS,
  message: MESSAGE_SOUND_PRESETS,
};

export const SOUND_CATEGORY_LABELS: Record<SoundCategory, { title: string; emoji: string; hint: string }> = {
  vote: { title: "Vote", emoji: "🗳️", hint: "Plays when you cast a vote." },
  notification: { title: "Bell", emoji: "🔔", hint: "Plays for push / in-app notifications." },
  message: { title: "Messages", emoji: "💬", hint: "Plays on new chat messages." },
};

let activePrefs: SoundPreferences = {
  voteSoundId: DEFAULT_VOTE_SOUND_ID,
  notificationSoundId: DEFAULT_NOTIFICATION_SOUND_ID,
  messageSoundId: DEFAULT_MESSAGE_SOUND_ID,
};

export function getActiveSoundPreferences(): SoundPreferences {
  return activePrefs;
}

export function applySoundPreferences(prefs: Partial<SoundPreferences>): SoundPreferences {
  activePrefs = {
    voteSoundId: prefs.voteSoundId && isVoteSoundId(prefs.voteSoundId)
      ? prefs.voteSoundId
      : activePrefs.voteSoundId,
    notificationSoundId:
      prefs.notificationSoundId && isNotificationSoundId(prefs.notificationSoundId)
        ? prefs.notificationSoundId
        : activePrefs.notificationSoundId,
    messageSoundId:
      prefs.messageSoundId && isMessageSoundId(prefs.messageSoundId)
        ? prefs.messageSoundId
        : activePrefs.messageSoundId,
  };
  return activePrefs;
}

export function resolveSoundPreferences(input?: {
  voteSoundId?: string | null;
  notificationSoundId?: string | null;
  messageSoundId?: string | null;
} | null): SoundPreferences {
  const cached = readCachedSoundPreferences();
  return {
    voteSoundId:
      (input?.voteSoundId && isVoteSoundId(input.voteSoundId)
        ? input.voteSoundId
        : cached.voteSoundId && isVoteSoundId(cached.voteSoundId)
          ? cached.voteSoundId
          : DEFAULT_VOTE_SOUND_ID),
    notificationSoundId:
      (input?.notificationSoundId && isNotificationSoundId(input.notificationSoundId)
        ? input.notificationSoundId
        : cached.notificationSoundId && isNotificationSoundId(cached.notificationSoundId)
          ? cached.notificationSoundId
          : DEFAULT_NOTIFICATION_SOUND_ID),
    messageSoundId:
      (input?.messageSoundId && isMessageSoundId(input.messageSoundId)
        ? input.messageSoundId
        : cached.messageSoundId && isMessageSoundId(cached.messageSoundId)
          ? cached.messageSoundId
          : DEFAULT_MESSAGE_SOUND_ID),
  };
}

export function syncSoundPreferences(input?: {
  voteSoundId?: string | null;
  notificationSoundId?: string | null;
  messageSoundId?: string | null;
} | null): SoundPreferences {
  const prefs = resolveSoundPreferences(input);
  applySoundPreferences(prefs);
  writeCachedSoundPreferences(prefs);
  return prefs;
}

export function playSoundById(id: string): void {
  const player = SOUND_PLAYERS[id];
  if (!player) return;
  withCtx(player);
}

export function playVoteSoundPreview(id: VoteSoundId): void {
  playSoundById(id);
}

export function playNotificationSoundPreview(id: NotificationSoundId): void {
  playSoundById(id);
}

export function playMessageSoundPreview(id: MessageSoundId): void {
  playSoundById(id);
}

export function playVoteSound(): void {
  playSoundById(activePrefs.voteSoundId);
}

export function playNotificationChime(): void {
  playSoundById(activePrefs.notificationSoundId);
}

export function playMessageSound(): void {
  playSoundById(activePrefs.messageSoundId);
}

/** @deprecated use syncSoundPreferences */
export const VOTE_SOUND_STORAGE_KEY = "ctrend_vote_sound_id";
/** @deprecated use getActiveSoundPreferences */
export function getSelectedVoteSoundId(): VoteSoundId {
  return activePrefs.voteSoundId;
}
/** @deprecated use SoundPreferencesContext */
export function setSelectedVoteSoundId(id: VoteSoundId): void {
  applySoundPreferences({ voteSoundId: id });
  writeCachedSoundPreferences({ ...readCachedSoundPreferences(), voteSoundId: id });
}

// Bootstrap from cache on module load (ME query overrides when ready).
syncSoundPreferences(null);
