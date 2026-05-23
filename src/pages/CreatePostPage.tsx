import { useMutation, useQuery } from "@apollo/client";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CATEGORIES, CREATE_POST, FEED_POSTS } from "../graphql/feed";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { useImageUpload } from "../lib/useImageUpload";

type DraftCompareItem = {
  id: string;
  imageUrl: string;
  title: string;
};

type CategoriesQueryData = {
  categories: Array<{ id: string; name?: string | null }>;
};

function localInputToUtcIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  // Parse datetime-local deterministically (avoid browser-dependent parsing).
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!m) {
    return null;
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] ?? "0");
  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  // RFC3339 (UTC offset form), e.g. `2026-04-15T12:30:00+00:00`
  // This format is accepted by stricter ISO validators as well.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}+00:00`;
}

export function CreatePostPage() {
  const navigate = useNavigate();
  const { uploadImage } = useImageUpload();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [caption, setCaption] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [votingEndsAt, setVotingEndsAt] = useState("");
  const [items, setItems] = useState<DraftCompareItem[]>([
    { id: "1", imageUrl: "", title: "" },
    { id: "2", imageUrl: "", title: "" },
  ]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [successToast, setSuccessToast] = useState<string | null>(null);

  async function handleFileChange(id: string, file: File | undefined) {
    if (!file) return;
    setUploadingId(id);
    setError(null);
    try {
      const publicUrl = await uploadImage(file);
      updateItem(id, "imageUrl", publicUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingId(null);
    }
  }

  const [createPost, { loading }] = useMutation(CREATE_POST);
  const {
    data: categoriesData,
    loading: categoriesLoading,
    error: categoriesError,
  } =
    useQuery<CategoriesQueryData>(CATEGORIES, {
      fetchPolicy: "cache-first",
      errorPolicy: "all",
    });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const category = categoryId.trim();
    if (!category) {
      setError("Category ID is required.");
      return;
    }

    const now = Date.now();
    const hasVotingInput = votingEndsAt.trim().length > 0;
    const votingEndsAtIso = localInputToUtcIso(votingEndsAt);
    if (hasVotingInput && !votingEndsAtIso) {
      setError("Please choose a valid deadline.");
      return;
    }
    if (votingEndsAtIso && new Date(votingEndsAtIso).getTime() <= now) {
      setError("Deadline must be in the future.");
      return;
    }

    const normalized = items
      .map((it) => ({
        imageUrl: it.imageUrl.trim(),
        title: it.title.trim(),
      }))
      .filter((it) => it.imageUrl.length > 0);

    if (normalized.length < 2) {
      setError("Please upload images for at least two options.");
      return;
    }

    const imageUrls = normalized.map((it) => it.imageUrl);
    const options = normalized.map((it, idx) => ({
      label: it.title || `Option ${idx + 1}`,
      imageUrl: it.imageUrl,
    }));

    // Validate schedule time if enabled
    const scheduledAtIso = scheduleEnabled ? localInputToUtcIso(scheduledAt) : null;
    if (scheduleEnabled) {
      if (!scheduledAtIso) {
        setError("Please choose a valid schedule time.");
        return;
      }
      if (new Date(scheduledAtIso).getTime() <= Date.now()) {
        setError("Scheduled time must be in the future.");
        return;
      }
    }

    const input: {
      categoryId: string;
      imageUrls: string[];
      options: Array<{ label: string; imageUrl: string }>;
      votingEndsAt?: string;
      scheduledAt?: string;
      contentText?: string;
      caption?: string;
    } = {
      categoryId: category,
      imageUrls,
      options,
    };
    const cap = caption.trim();
    if (cap) {
      input.contentText = cap;
      input.caption = cap;
    }
    if (votingEndsAtIso) {
      input.votingEndsAt = votingEndsAtIso;
    }
    if (scheduledAtIso) {
      input.scheduledAt = scheduledAtIso;
    }

    try {
      await createPost({
        variables: { input },
        // Don't refetch feed for scheduled posts — they won't appear there yet
        refetchQueries: scheduledAtIso ? [] : [{ query: FEED_POSTS }],
      });
      if (scheduledAtIso) {
        const formatted = new Date(scheduledAtIso).toLocaleString(undefined, {
          month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        });
        setSuccessToast(`Your post is scheduled for ${formatted}.`);
        // Reset form
        setCaption("");
        setCategoryId("");
        setVotingEndsAt("");
        setScheduledAt("");
        setScheduleEnabled(false);
        setItems([
          { id: "1", imageUrl: "", title: "" },
          { id: "2", imageUrl: "", title: "" },
        ]);
        setTimeout(() => setSuccessToast(null), 5000);
        return;
      }
      navigate("/", { replace: true });
    } catch (err: unknown) {
      // Backend may reject `votingEndsAt` by strict DTO validation; retry once without it.
      if (input.votingEndsAt) {
        const retryInput = { ...input };
        delete retryInput.votingEndsAt;
        try {
          await createPost({
            variables: { input: retryInput },
          });
          navigate("/", { replace: true });
          return;
        } catch (retryErr: unknown) {
          setError(getApolloErrorMessage(retryErr));
          return;
        }
      }
      setError(getApolloErrorMessage(err));
    }
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { id: String(Date.now()), imageUrl: "", title: "" },
    ]);
  }

  function removeItem(id: string) {
    setItems((prev) => {
      if (prev.length <= 2) {
        return prev;
      }
      return prev.filter((it) => it.id !== id);
    });
  }

  function updateItem(id: string, key: "imageUrl" | "title", value: string) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [key]: value } : it)),
    );
  }

  const LABELS = ["A", "B", "C", "D"];

  return (
    <div className="ig-create-page">
      <div className="ig-create-hero">
        <span className="ig-create-hero-chip">New Compare</span>
        <h1 className="ig-create-title">What's your take?</h1>
        <p className="ig-create-lead">Drop your picks. Let the crowd decide.</p>
      </div>

      <form className="ig-create-form" onSubmit={(ev) => void onSubmit(ev)}>

        {/* ── Compare slots ── */}
        <div className="ig-create-vs-wrap">
          <div className="ig-compare-grid">
            {items.map((item, idx) => (
              <div className="ig-compare-slot" key={item.id}>
                <input
                  ref={(el) => { fileInputRefs.current[item.id] = el; }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  style={{ display: "none" }}
                  onChange={(ev) =>
                    void handleFileChange(item.id, ev.target.files?.[0])
                  }
                />
                <button
                  type="button"
                  className={`ig-compare-zone${item.imageUrl ? " ig-compare-zone--filled" : ""}`}
                  style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})` } : undefined}
                  onClick={() => fileInputRefs.current[item.id]?.click()}
                  disabled={uploadingId === item.id}
                  aria-label={`Upload image for option ${LABELS[idx] ?? idx + 1}`}
                >
                  {uploadingId === item.id ? (
                    <span className="ig-compare-zone-uploading">
                      <span className="ig-compare-spinner" />
                      Uploading…
                    </span>
                  ) : item.imageUrl ? (
                    <span className="ig-compare-zone-change">Change</span>
                  ) : (
                    <span className="ig-compare-zone-empty">
                      <span className="ig-compare-zone-icon">↑</span>
                      <span className="ig-compare-zone-label">Option {LABELS[idx] ?? idx + 1}</span>
                      <span className="ig-compare-zone-hint">Tap to add</span>
                    </span>
                  )}
                </button>

                <input
                  type="url"
                  className="ig-compare-url-input"
                  value={item.imageUrl}
                  onChange={(ev) => updateItem(item.id, "imageUrl", ev.target.value)}
                  placeholder="or paste URL"
                  autoComplete="off"
                  disabled={uploadingId === item.id}
                />

                <input
                  id={`create-item-title-${item.id}`}
                  name={`itemTitle-${idx}`}
                  type="text"
                  className="ig-compare-title-input"
                  value={item.title}
                  onChange={(ev) => updateItem(item.id, "title", ev.target.value)}
                  placeholder={`Label…`}
                  autoComplete="off"
                />

                {items.length > 2 && (
                  <button
                    type="button"
                    className="ig-compare-remove"
                    onClick={() => removeItem(item.id)}
                    aria-label="Remove option"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {items.length === 2 && (
            <div className="ig-compare-vs-badge">VS</div>
          )}
        </div>

        <button type="button" className="ig-create-add-btn" onClick={addItem}>
          + Add option
        </button>

        {/* ── Settings card ── */}
        <div className="ig-create-settings-card">
          <div className="ig-settings-row">
            <label htmlFor="create-category-id" className="ig-settings-label">
              <span className="ig-settings-icon">◈</span> Category
            </label>
            <select
              id="create-category-id"
              name="categoryId"
              className="ig-settings-select"
              value={categoryId}
              onChange={(ev) => setCategoryId(ev.target.value)}
              disabled={categoriesLoading}
            >
              <option value="">
                {categoriesLoading ? "Loading…" : "Pick one"}
              </option>
              {(categoriesData?.categories ?? []).map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {(cat.name?.trim() || cat.id).toString()}
                </option>
              ))}
            </select>
            {categoriesError && (
              <small className="ig-settings-error">Could not load categories.</small>
            )}
          </div>

          <div className="ig-settings-divider" />

          <div className="ig-settings-row ig-settings-row--col">
            <label htmlFor="create-caption" className="ig-settings-label">
              <span className="ig-settings-icon">✎</span> Caption
              <span className="ig-settings-optional">optional</span>
            </label>
            <textarea
              id="create-caption"
              name="caption"
              rows={2}
              className="ig-settings-textarea"
              value={caption}
              onChange={(ev) => setCaption(ev.target.value)}
              placeholder="What are you comparing?"
              autoComplete="off"
            />
          </div>

          <div className="ig-settings-divider" />

          <div className="ig-settings-row">
            <label htmlFor="create-deadline" className="ig-settings-label">
              <span className="ig-settings-icon">⏱</span> Ends
              <span className="ig-settings-optional">optional</span>
            </label>
            <input
              id="create-deadline"
              name="votingEndsAt"
              type="datetime-local"
              className="ig-settings-select"
              value={votingEndsAt}
              onChange={(ev) => setVotingEndsAt(ev.target.value)}
              min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
            />
          </div>
        </div>

        {/* ── Schedule toggle ── */}
        <div className="ig-schedule-wrap">
          <button
            type="button"
            className={`ig-schedule-toggle${scheduleEnabled ? " ig-schedule-toggle--on" : ""}`}
            onClick={() => { setScheduleEnabled((v) => !v); setScheduledAt(""); }}
          >
            <span className="ig-schedule-toggle-knob" />
          </button>
          <span className="ig-schedule-toggle-label">
            {scheduleEnabled ? "Schedule for later" : "Post now"}
          </span>
          {scheduleEnabled && (
            <input
              type="datetime-local"
              className="ig-schedule-picker"
              value={scheduledAt}
              onChange={(ev) => setScheduledAt(ev.target.value)}
              min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
              required
            />
          )}
        </div>

        {error ? (
          <div className="ig-feed-banner ig-feed-banner--error" role="alert">
            {error}
          </div>
        ) : null}

        {successToast ? (
          <div className="ig-schedule-toast" role="status">
            ✓ {successToast}
          </div>
        ) : null}

        <button
          type="submit"
          className="ig-create-submit"
          disabled={loading || !!uploadingId}
        >
          {loading
            ? scheduleEnabled ? "Scheduling…" : "Posting…"
            : scheduleEnabled ? "Schedule →" : "Launch it →"}
        </button>

        <p className="ig-create-cancel">
          <Link to="/">Cancel</Link>
        </p>
      </form>
    </div>
  );
}
