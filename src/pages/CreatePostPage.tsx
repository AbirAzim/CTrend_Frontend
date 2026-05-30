import { useMutation, useQuery } from "@apollo/client";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CATEGORIES, CREATE_POST, FEED_POSTS } from "../graphql/feed";
import { CREATE_SYSTEM_POST } from "../graphql/admin";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { useImageUpload } from "../lib/useImageUpload";
import { useAuth } from "../context/AuthContext";

type DraftCompareItem = {
  id: string;
  imageUrl: string;
  title: string;
  localPreview?: string;
};

type CategoriesQueryData = {
  categories: Array<{ id: string; name?: string | null }>;
};

function DateTimePicker({
  value,
  onChange,
  minDate,
  label,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  minDate?: string;
  label?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [datePart, timePart] = value ? value.split("T") : ["", ""];

  const today = new Date();
  const minDateObj = minDate
    ? (() => { const d = new Date(minDate); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); })()
    : new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const [viewYear, setViewYear] = useState(
    datePart ? Number(datePart.split("-")[0]) : today.getFullYear()
  );
  const [viewMonth, setViewMonth] = useState(
    datePart ? Number(datePart.split("-")[1]) - 1 : today.getMonth()
  );

  // Parse time to 12-hour parts. If empty, default to current/min time.
  const fallbackTimeSource = minDate ? new Date(minDate) : today;
  const fallbackHour24 = Number.isNaN(fallbackTimeSource.getTime())
    ? today.getHours()
    : fallbackTimeSource.getHours();
  const fallbackMinute = Number.isNaN(fallbackTimeSource.getTime())
    ? today.getMinutes()
    : fallbackTimeSource.getMinutes();
  const fallbackTimeStr = `${String(fallbackHour24).padStart(2, "0")}:${String(fallbackMinute).padStart(2, "0")}`;

  let hour12 = 12, minute = 0, ampm: "AM" | "PM" = "AM";
  {
    const [h, m] = (timePart || fallbackTimeStr).split(":").map(Number);
    minute = m ?? 0;
    if (h === 0) { hour12 = 12; ampm = "AM"; }
    else if (h < 12) { hour12 = h; ampm = "AM"; }
    else if (h === 12) { hour12 = 12; ampm = "PM"; }
    else { hour12 = h - 12; ampm = "PM"; }
  }

  function toDateStr(y: number, mo: number, d: number) {
    return `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function toTimeStr(h12: number, min: number, ap: "AM" | "PM") {
    const h24 = ap === "AM" ? (h12 === 12 ? 0 : h12) : (h12 === 12 ? 12 : h12 + 12);
    return `${String(h24).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }

  function selectDay(y: number, mo: number, d: number) {
    onChange(`${toDateStr(y, mo, d)}T${timePart || fallbackTimeStr}`);
  }

  function updateTime(h12: number, min: number, ap: "AM" | "PM") {
    // If no date is picked yet, pre-fill with today so the time edit takes effect.
    const d = datePart || (() => {
      const t = today;
      return toDateStr(t.getFullYear(), t.getMonth(), t.getDate());
    })();
    onChange(`${d}T${toTimeStr(h12, min, ap)}`);
  }

  // Local string state for typeable inputs — committed on blur.
  // Keeps the field freely editable while the user types (no clamping
  // on every keystroke that would lock them out of multi-digit values).
  const [hourDraft, setHourDraft] = useState(String(hour12).padStart(2, "0"));
  const [minDraft, setMinDraft] = useState(String(minute).padStart(2, "0"));
  // Sync drafts back to props when the picker reopens or the prop changes.
  useEffect(() => { setHourDraft(String(hour12).padStart(2, "0")); }, [hour12]);
  useEffect(() => { setMinDraft(String(minute).padStart(2, "0")); }, [minute]);

  function commitHour(raw: string) {
    const cleaned = raw.replace(/[^0-9]/g, "").slice(0, 2);
    const n = cleaned ? Math.max(1, Math.min(12, Number(cleaned))) : hour12;
    updateTime(n, minute, ampm);
    setHourDraft(String(n).padStart(2, "0"));
  }

  function commitMinute(raw: string) {
    const cleaned = raw.replace(/[^0-9]/g, "").slice(0, 2);
    const n = cleaned ? Math.max(0, Math.min(59, Number(cleaned))) : minute;
    updateTime(hour12, n, ampm);
    setMinDraft(String(n).padStart(2, "0"));
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Build calendar cells
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();

  type Cell = { day: number; year: number; month: number; outside: boolean };
  const cells: Cell[] = [];
  for (let i = 0; i < firstWeekday; i++) {
    const mo = viewMonth === 0 ? 11 : viewMonth - 1;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    cells.push({ day: daysInPrev - firstWeekday + 1 + i, year: y, month: mo, outside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, year: viewYear, month: viewMonth, outside: false });
  }
  while (cells.length < 42) {
    const d = cells.length - firstWeekday - daysInMonth + 1;
    const mo = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    cells.push({ day: d, year: y, month: mo, outside: true });
  }

  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const displayDate = datePart
    ? new Date(datePart + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;
  const displayTime = `${hour12}:${String(minute).padStart(2, "0")} ${ampm}`;

  return (
    <div className="ig-dtp-wrap" ref={wrapRef} id={id} aria-label={label}>
      <button
        type="button"
        className={`ig-dtp-trigger${open ? " ig-dtp-trigger--open" : ""}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="ig-dtp-trigger-date">
          <span className="ig-dtp-icon">📅</span>
          {displayDate ?? <span className="ig-dtp-placeholder">Pick date</span>}
        </span>
        <span className="ig-dtp-sep" />
        <span className="ig-dtp-trigger-time">
          <span className="ig-dtp-icon">🕐</span>
          {displayTime}
        </span>
      </button>

      {open && (
        <div className="ig-dtp-popover">
          <div className="ig-dtp-cal-header">
            <button type="button" className="ig-dtp-cal-nav" onClick={prevMonth}>‹</button>
            <span className="ig-dtp-cal-month-label">{MONTHS[viewMonth]} {viewYear}</span>
            <button type="button" className="ig-dtp-cal-nav" onClick={nextMonth}>›</button>
          </div>

          <div className="ig-dtp-cal-grid">
            {DAYS.map(d => (
              <span key={d} className="ig-dtp-cal-dayname">{d}</span>
            ))}
            {cells.map((cell, i) => {
              const cellDate = new Date(cell.year, cell.month, cell.day);
              const isSelected = datePart === toDateStr(cell.year, cell.month, cell.day);
              const isToday = cell.day === today.getDate() && cell.month === today.getMonth() && cell.year === today.getFullYear();
              const isDisabled = cellDate < minDateObj;
              return (
                <button
                  key={i}
                  type="button"
                  className={[
                    "ig-dtp-cal-day",
                    isSelected && "ig-dtp-cal-day--selected",
                    isToday && !isSelected && "ig-dtp-cal-day--today",
                    cell.outside && "ig-dtp-cal-day--outside",
                    isDisabled && "ig-dtp-cal-day--disabled",
                  ].filter(Boolean).join(" ")}
                  onClick={() => { if (!isDisabled) selectDay(cell.year, cell.month, cell.day); }}
                  disabled={isDisabled}
                  tabIndex={cell.outside ? -1 : 0}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="ig-dtp-divider" />

          <div className="ig-dtp-time-row">
            <span className="ig-dtp-time-label">Time</span>
            <div className="ig-dtp-time-selects">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                className="ig-dtp-time-input"
                value={hourDraft}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setHourDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                onBlur={(e) => commitHour(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                aria-label="Hour"
              />
              <span className="ig-dtp-time-colon">:</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                className="ig-dtp-time-input"
                value={minDraft}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setMinDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                onBlur={(e) => commitMinute(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                aria-label="Minute"
              />
              <button
                type="button"
                className="ig-dtp-ampm-btn"
                onClick={() => updateTime(hour12, minute, ampm === "AM" ? "PM" : "AM")}
                aria-label={`Toggle AM/PM, currently ${ampm}`}
              >
                {ampm}
              </button>
            </div>
          </div>

          <div className="ig-dtp-footer">
            <button type="button" className="ig-dtp-btn-clear" onClick={() => { onChange(""); setOpen(false); }}>
              Clear
            </button>
            <button type="button" className="ig-dtp-btn-done" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === "admin";
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [caption, setCaption] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [votingEndsAt, setVotingEndsAt] = useState("");
  const [votingEndEnabled, setVotingEndEnabled] = useState(false);
  const [postType, setPostType] = useState<"regular" | "system">("regular");
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
    // Show local preview immediately so user sees feedback before upload finishes
    const localPreview = URL.createObjectURL(file);
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, localPreview } : it)),
    );
    setUploadingId(id);
    setError(null);
    try {
      const publicUrl = await uploadImage(file);
      // Replace local preview with the permanent R2 URL
      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, imageUrl: publicUrl, localPreview: undefined } : it,
        ),
      );
      URL.revokeObjectURL(localPreview);
    } catch (err: unknown) {
      // Clear local preview — image didn't actually land in R2
      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, localPreview: undefined } : it,
        ),
      );
      URL.revokeObjectURL(localPreview);
      setError(err instanceof Error ? err.message : "Upload failed — please try again.");
    } finally {
      setUploadingId(null);
    }
  }

  const [createPost, { loading: creatingPost }] = useMutation(CREATE_POST);
  const [createSystemPost, { loading: creatingSystemPost }] = useMutation(CREATE_SYSTEM_POST);
  const loading = creatingPost || creatingSystemPost;
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
    const votingEndsAtIso = votingEndEnabled ? localInputToUtcIso(votingEndsAt) : null;

    if (votingEndEnabled) {
      if (!hasVotingInput || !votingEndsAtIso) {
        setError("Please choose a voting deadline (date + time).");
        return;
      }
      if (new Date(votingEndsAtIso).getTime() <= now) {
        setError("Deadline must be in the future.");
        return;
      }
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
      const mutate = isAdmin && postType === "system" ? createSystemPost : createPost;
      await mutate({
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
          const mutate = isAdmin && postType === "system" ? createSystemPost : createPost;
          await mutate({
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

        {/* ── Admin post type toggle ── */}
        {isAdmin && (
          <div className="ig-create-settings-card ig-admin-post-type">
            <p className="ig-settings-label">
              <span className="ig-settings-icon">🛡</span> Post visibility
            </p>
            <div className="ig-admin-post-type-options">
              <label className={`ig-admin-post-type-option${postType === "regular" ? " ig-admin-post-type-option--active" : ""}`}>
                <input
                  type="radio"
                  name="postType"
                  value="regular"
                  checked={postType === "regular"}
                  onChange={() => setPostType("regular")}
                />
                <strong>Regular Post</strong>
                <span className="muted small">Visible to your followers only</span>
              </label>
              <label className={`ig-admin-post-type-option${postType === "system" ? " ig-admin-post-type-option--active" : ""}`}>
                <input
                  type="radio"
                  name="postType"
                  value="system"
                  checked={postType === "system"}
                  onChange={() => setPostType("system")}
                />
                <strong>Platform-wide Post</strong>
                <span className="muted small">Visible to ALL users · highest priority</span>
              </label>
            </div>
          </div>
        )}

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
                  className={`ig-compare-zone${item.imageUrl || item.localPreview ? " ig-compare-zone--filled" : ""}`}
                  style={item.imageUrl || item.localPreview
                    ? { backgroundImage: `url(${item.imageUrl || item.localPreview})` }
                    : undefined}
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
          <div className="ig-settings-row ig-settings-row--col">
            <label htmlFor="create-category-id" className="ig-settings-label">
              <span className="ig-settings-icon">◈</span> Category
              <span className="ig-settings-required">required</span>
            </label>
            <div className="ig-cat-select-wrap">
              <select
                id="create-category-id"
                name="categoryId"
                className="ig-cat-select"
                value={categoryId}
                onChange={(ev) => setCategoryId(ev.target.value)}
                disabled={categoriesLoading}
              >
                <option value="">
                  {categoriesLoading ? "Loading categories…" : "Pick a category"}
                </option>
                {(categoriesData?.categories ?? []).map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {(cat.name?.trim() || cat.id).toString()}
                  </option>
                ))}
              </select>
              <span className="ig-cat-select-chevron" aria-hidden>▾</span>
            </div>
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

          <div className="ig-settings-row ig-settings-row--col">
            <label className="ig-voting-toggle">
              <span className="ig-settings-label" style={{ minWidth: 0, flex: 1 }}>
                <span className="ig-settings-icon">⏱</span> Set voting deadline
                <span className="ig-settings-optional">optional</span>
              </span>
              <span className="ig-toggle-switch-wrap">
                <input
                  type="checkbox"
                  checked={votingEndEnabled}
                  onChange={(e) => {
                    setVotingEndEnabled(e.target.checked);
                    if (!e.target.checked) setVotingEndsAt("");
                  }}
                />
                <span className="ig-toggle-switch" aria-hidden />
              </span>
            </label>
            {votingEndEnabled && (
              <DateTimePicker
                value={votingEndsAt}
                onChange={setVotingEndsAt}
                minDate={new Date(Date.now() + 60_000).toISOString()}
              />
            )}
          </div>
        </div>

        {/* ── Schedule date picker (shown when schedule mode active) ── */}
        {scheduleEnabled && (
          <div className="ig-schedule-picker-wrap">
            <label className="ig-schedule-picker-label">
              ⏰ When should this go live?
            </label>
            <DateTimePicker
              value={scheduledAt}
              onChange={setScheduledAt}
              minDate={new Date(Date.now() + 60_000).toISOString()}
              label="Schedule date and time"
            />
            <button
              type="button"
              className="ig-schedule-cancel-link"
              onClick={() => { setScheduleEnabled(false); setScheduledAt(""); }}
            >
              Cancel scheduling
            </button>
          </div>
        )}

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

        {/* ── Action buttons ── */}
        {scheduleEnabled ? (
          <button
            type="submit"
            className="ig-create-submit"
            disabled={loading || !!uploadingId || !scheduledAt}
          >
            {loading ? "Scheduling…" : "Confirm schedule →"}
          </button>
        ) : (
          <div className="ig-create-actions">
            <button
              type="submit"
              className="ig-create-submit ig-create-submit--main"
              disabled={loading || !!uploadingId}
            >
              {loading ? "Posting…" : "Launch it →"}
            </button>
            <button
              type="button"
              className="ig-create-submit ig-create-submit--schedule"
              disabled={loading || !!uploadingId}
              onClick={() => setScheduleEnabled(true)}
            >
              ⏰ Schedule
            </button>
          </div>
        )}

        <p className="ig-create-cancel">
          <Link to="/">Cancel</Link>
        </p>
      </form>
    </div>
  );
}
