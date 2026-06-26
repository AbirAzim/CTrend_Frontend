import { useState } from "react";
import { Link } from "react-router-dom";
import { useSoundPreferences, isSoundIdForCategory } from "../context/SoundPreferencesContext";
import {
  playMessageSoundPreview,
  playNotificationSoundPreview,
  playVoteSoundPreview,
  SOUND_CATEGORY_LABELS,
  SOUND_PRESETS_BY_CATEGORY,
  type MessageSoundId,
  type NotificationSoundId,
  type SoundCategory,
  type VoteSoundId,
} from "../lib/notificationSound";

const CATEGORIES: SoundCategory[] = ["vote", "notification", "message"];

function selectedIdForCategory(
  category: SoundCategory,
  preferences: ReturnType<typeof useSoundPreferences>["preferences"],
): string {
  if (category === "vote") return preferences.voteSoundId;
  if (category === "notification") return preferences.notificationSoundId;
  return preferences.messageSoundId;
}

function previewCategorySound(category: SoundCategory, id: string): void {
  if (category === "vote" && isSoundIdForCategory("vote", id)) {
    playVoteSoundPreview(id as VoteSoundId);
    return;
  }
  if (category === "notification" && isSoundIdForCategory("notification", id)) {
    playNotificationSoundPreview(id as NotificationSoundId);
    return;
  }
  if (category === "message" && isSoundIdForCategory("message", id)) {
    playMessageSoundPreview(id as MessageSoundId);
  }
}

export function SoundPreferencesPage() {
  const { preferences, saving, error, setSoundPreference } = useSoundPreferences();
  const [activeCategory, setActiveCategory] = useState<SoundCategory>("vote");
  const [savedHint, setSavedHint] = useState<string | null>(null);

  const presets = SOUND_PRESETS_BY_CATEGORY[activeCategory];
  const selectedId = selectedIdForCategory(activeCategory, preferences);
  const categoryMeta = SOUND_CATEGORY_LABELS[activeCategory];

  async function handleSelect(id: string) {
    if (!isSoundIdForCategory(activeCategory, id)) return;
    previewCategorySound(activeCategory, id);
    await setSoundPreference(activeCategory, id);
    const label = presets.find((p) => p.id === id)?.label ?? id;
    setSavedHint(`${categoryMeta.title} sound set to “${label}”.`);
    window.setTimeout(() => setSavedHint(null), 2600);
  }

  return (
    <div className="cx-profile cx-sounds-page">
      <header className="cx-sounds-hero">
        <Link to="/profile" className="cx-sounds-back">← Profile</Link>
        <h1 className="cx-profile-section-title">
          <span className="cx-profile-section-emoji" aria-hidden>🔊</span>
          App sounds
        </h1>
        <p className="cx-sounds-lead">
          Choose sounds for votes, notifications, and messages. Saved to your account on every device.
        </p>
      </header>

      <div className="cx-profile-content-card">
        <div className="cx-conn-tabs" role="tablist" aria-label="Sound categories">
          {CATEGORIES.map((cat) => {
            const meta = SOUND_CATEGORY_LABELS[cat];
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={active}
                className={`cx-conn-tab${active ? " cx-conn-tab--active" : ""}`}
                onClick={() => setActiveCategory(cat)}
              >
                <span aria-hidden>{meta.emoji}</span> {meta.title}
              </button>
            );
          })}
        </div>

        <div className="cx-sounds-panel" role="tabpanel">
          <p className="cx-sounds-tab-hint">{categoryMeta.hint}</p>

          {savedHint ? (
            <div className="ig-schedule-toast" role="status">✓ {savedHint}</div>
          ) : null}
          {error ? (
            <div className="ig-feed-banner ig-feed-banner--error" role="alert">{error}</div>
          ) : null}
          {saving ? (
            <p className="cx-sounds-saving muted small">Saving…</p>
          ) : null}

          <ul className="cx-sounds-grid">
            {presets.map((preset) => {
              const isActive = selectedId === preset.id;
              return (
                <li key={preset.id}>
                  <article
                    className={`cx-sounds-card${isActive ? " cx-sounds-card--active" : ""}`}
                  >
                    <button
                      type="button"
                      className="cx-sounds-card-select"
                      onClick={() => void handleSelect(preset.id)}
                      aria-pressed={isActive}
                    >
                      <span className="cx-sounds-emoji" aria-hidden>{preset.emoji}</span>
                      <span className="cx-sounds-copy">
                        <span className="cx-sounds-card-head">
                          <span className="cx-sounds-name">{preset.label}</span>
                          {isActive ? <span className="cx-sounds-badge">Active</span> : null}
                        </span>
                        <span className="cx-sounds-desc">{preset.description}</span>
                        <span className="cx-sounds-meta muted small">{preset.duration}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="cx-sounds-preview-btn"
                      onClick={() => previewCategorySound(activeCategory, preset.id)}
                      aria-label={`Preview ${preset.label}`}
                      disabled={preset.id === "silent"}
                      style={preset.id === "silent" ? { visibility: "hidden" } : undefined}
                    >
                      ▶ Preview
                    </button>
                  </article>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
