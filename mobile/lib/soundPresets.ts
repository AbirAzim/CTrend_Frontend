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

export type SoundPreferences = {
  voteSoundId: VoteSoundId;
  notificationSoundId: NotificationSoundId;
  messageSoundId: MessageSoundId;
};

export type SoundPresetMeta = {
  id: string;
  label: string;
  description: string;
  duration: string;
  emoji: string;
};

export const DEFAULT_VOTE_SOUND_ID: VoteSoundId = "buzz-in";
export const DEFAULT_NOTIFICATION_SOUND_ID: NotificationSoundId = "ascending-chime";
export const DEFAULT_MESSAGE_SOUND_ID: MessageSoundId = "gentle-ping";

const VOTE_IDS: VoteSoundId[] = [
  "buzz-in", "crowd-pop", "soft-pop", "coin-ping",
  "slot-tick", "thock", "whistle-chirp", "success-duo",
];
const NOTIFICATION_IDS: NotificationSoundId[] = [
  "ascending-chime", "success-duo", "coin-ping",
  "soft-chime", "gentle-bell", "whistle-chirp", "buzz-in",
];
const MESSAGE_IDS: MessageSoundId[] = [
  "gentle-ping", "soft-pop", "coin-ping", "thock", "slot-tick", "buzz-in",
];

export function isVoteSoundId(v: string): v is VoteSoundId {
  return VOTE_IDS.includes(v as VoteSoundId);
}
export function isNotificationSoundId(v: string): v is NotificationSoundId {
  return NOTIFICATION_IDS.includes(v as NotificationSoundId);
}
export function isMessageSoundId(v: string): v is MessageSoundId {
  return MESSAGE_IDS.includes(v as MessageSoundId);
}

function meta(
  id: string, label: string, description: string, duration: string, emoji: string,
): SoundPresetMeta {
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

export const SOUND_CATEGORY_META: Record<SoundCategory, { title: string; emoji: string; hint: string }> = {
  vote: { title: "Vote", emoji: "🗳️", hint: "Plays when you cast a vote." },
  notification: { title: "Bell", emoji: "🔔", hint: "Plays for in-app notifications." },
  message: { title: "Messages", emoji: "💬", hint: "Plays on new chat messages." },
};

export const SOUND_CATEGORIES: SoundCategory[] = ["vote", "notification", "message"];
