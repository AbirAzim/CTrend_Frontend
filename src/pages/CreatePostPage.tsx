import { useMutation, useQuery } from "@apollo/client";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CATEGORIES, CREATE_POST, FEED_POSTS } from "../graphql/feed";
import { CREATE_SYSTEM_POST } from "../graphql/admin";
import { ACTIVE_CAMPAIGNS, CAMPAIGNS_ADMIN } from "../graphql/campaigns";
import { DateTimePicker } from "../components/DateTimePicker";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { useImageUpload } from "../lib/useImageUpload";
import { useAuth } from "../context/AuthContext";
import { ImagePositionEditor } from "../components/ImagePositionEditor";
import { DEFAULT_IMAGE_FOCAL, hasCustomFocal, imageObjectPosition } from "../lib/imageFocal";

type DraftCompareItem = {
  id: string;
  imageUrl: string;
  title: string;
  imageFocalX: number;
  imageFocalY: number;
  localPreview?: string;
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
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === "admin";
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [caption, setCaption] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [votingEndsAt, setVotingEndsAt] = useState("");
  const [votingEndEnabled, setVotingEndEnabled] = useState(false);
  const [postType, setPostType] = useState<"regular" | "system">("regular");
  const [items, setItems] = useState<DraftCompareItem[]>([
    { id: "1", imageUrl: "", title: "", imageFocalX: DEFAULT_IMAGE_FOCAL, imageFocalY: DEFAULT_IMAGE_FOCAL },
    { id: "2", imageUrl: "", title: "", imageFocalX: DEFAULT_IMAGE_FOCAL, imageFocalY: DEFAULT_IMAGE_FOCAL },
  ]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [positionEditId, setPositionEditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState("");

  async function handleFileChange(id: string, file: File | undefined) {
    if (!file) return;
    // Show local preview immediately so user sees feedback before upload finishes
    const localPreview = URL.createObjectURL(file);
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, localPreview, imageFocalX: DEFAULT_IMAGE_FOCAL, imageFocalY: DEFAULT_IMAGE_FOCAL }
          : it,
      ),
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

  const { data: activeCampaignsData } = useQuery<{ activeCampaigns: Array<{ id: string; name: string; slug: string; isActive?: boolean; isDefault?: boolean | null }> }>(
    ACTIVE_CAMPAIGNS,
    { fetchPolicy: "cache-first", errorPolicy: "all" },
  );
  const { data: adminCampaignsData } = useQuery<{ campaigns: Array<{ id: string; name: string; slug: string; isActive: boolean; isDefault?: boolean | null }> }>(
    CAMPAIGNS_ADMIN,
    { skip: !isAdmin, fetchPolicy: "cache-first", errorPolicy: "all" },
  );

  const campaignOptions = useMemo(() => {
    const raw = isAdmin
      ? (adminCampaignsData?.campaigns ?? [])
      : (activeCampaignsData?.activeCampaigns ?? []);
    return [...raw].sort((a, b) => {
      if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
      if (isAdmin && !!a.isActive !== !!b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [isAdmin, adminCampaignsData?.campaigns, activeCampaignsData?.activeCampaigns]);

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
    const options = items
      .filter((it) => it.imageUrl.trim().length > 0)
      .map((it, idx) => ({
        label: it.title.trim() || `Option ${idx + 1}`,
        imageUrl: it.imageUrl.trim(),
        imageFocalX: it.imageFocalX,
        imageFocalY: it.imageFocalY,
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
      options: Array<{ label: string; imageUrl: string; imageFocalX: number; imageFocalY: number }>;
      votingEndsAt?: string;
      scheduledAt?: string;
      contentText?: string;
      caption?: string;
      campaignId?: string;
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
    const pickedCampaign = campaignId.trim();
    if (pickedCampaign) {
      input.campaignId = pickedCampaign;
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
        setCampaignId("");
        setScheduledAt("");
        setScheduleEnabled(false);
        setItems([
          { id: "1", imageUrl: "", title: "", imageFocalX: DEFAULT_IMAGE_FOCAL, imageFocalY: DEFAULT_IMAGE_FOCAL },
          { id: "2", imageUrl: "", title: "", imageFocalX: DEFAULT_IMAGE_FOCAL, imageFocalY: DEFAULT_IMAGE_FOCAL },
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
      {
        id: String(Date.now()),
        imageUrl: "",
        title: "",
        imageFocalX: DEFAULT_IMAGE_FOCAL,
        imageFocalY: DEFAULT_IMAGE_FOCAL,
      },
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
      prev.map((it) => {
        if (it.id !== id) return it;
        if (key === "imageUrl" && value.trim() !== it.imageUrl.trim()) {
          return {
            ...it,
            imageUrl: value,
            imageFocalX: DEFAULT_IMAGE_FOCAL,
            imageFocalY: DEFAULT_IMAGE_FOCAL,
          };
        }
        return { ...it, [key]: value };
      }),
    );
  }

  const positionEditItem = positionEditId
    ? items.find((it) => it.id === positionEditId)
    : null;

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
                <div
                  className={`ig-compare-zone-wrap${item.imageUrl || item.localPreview ? " ig-compare-zone-wrap--filled" : ""}`}
                >
                  <button
                    type="button"
                    className={`ig-compare-zone${item.imageUrl || item.localPreview ? " ig-compare-zone--filled" : ""}`}
                    style={
                      item.imageUrl || item.localPreview
                        ? {
                            backgroundImage: `url(${item.imageUrl || item.localPreview})`,
                            backgroundPosition: imageObjectPosition(
                              item.imageFocalX,
                              item.imageFocalY,
                            ),
                          }
                        : undefined
                    }
                    onClick={() => fileInputRefs.current[item.id]?.click()}
                    disabled={uploadingId === item.id}
                    aria-label={`Upload image for option ${LABELS[idx] ?? idx + 1}`}
                  >
                    {uploadingId === item.id ? (
                      <span className="ig-compare-zone-uploading">
                        <span className="ig-compare-spinner" />
                        Uploading…
                      </span>
                    ) : item.imageUrl || item.localPreview ? null : (
                      <span className="ig-compare-zone-empty">
                        <span className="ig-compare-zone-icon">↑</span>
                        <span className="ig-compare-zone-label">Option {LABELS[idx] ?? idx + 1}</span>
                        <span className="ig-compare-zone-hint">Tap to add</span>
                      </span>
                    )}
                  </button>
                  {(item.imageUrl || item.localPreview) && uploadingId !== item.id ? (
                    <div className="ig-compare-zone-actions">
                      <button
                        type="button"
                        className="ig-compare-zone-action"
                        onClick={() => setPositionEditId(item.id)}
                      >
                        Position
                        {hasCustomFocal(item.imageFocalX, item.imageFocalY) ? " ·" : ""}
                      </button>
                      <button
                        type="button"
                        className="ig-compare-zone-action"
                        onClick={() => fileInputRefs.current[item.id]?.click()}
                      >
                        Change
                      </button>
                    </div>
                  ) : null}
                </div>

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

          {campaignOptions.length > 0 ? (
            <div className="ig-settings-row ig-settings-row--col">
              <label htmlFor="create-campaign-id" className="ig-settings-label">
                <span className="ig-settings-icon">🎯</span> Campaign
                <span className="ig-settings-optional">optional</span>
              </label>
              <div className="ig-cat-select-wrap">
                <select
                  id="create-campaign-id"
                  name="campaignId"
                  className="ig-cat-select"
                  value={campaignId}
                  onChange={(ev) => setCampaignId(ev.target.value)}
                >
                  <option value="">No campaign</option>
                  {campaignOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.isDefault ? " (default)" : ""}
                      {isAdmin && "isActive" in c && !c.isActive ? " (inactive)" : ""}
                    </option>
                  ))}
                </select>
                <span className="ig-cat-select-chevron" aria-hidden>▾</span>
              </div>
              <p className="muted small ig-create-campaign-hint">
                Link this compare to a promo — it will show a campaign badge on the feed.
              </p>
            </div>
          ) : null}

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

      {positionEditItem && (positionEditItem.imageUrl || positionEditItem.localPreview) ? (
        <ImagePositionEditor
          src={positionEditItem.imageUrl || positionEditItem.localPreview!}
          label={`Option ${LABELS[items.findIndex((it) => it.id === positionEditItem.id)] ?? ""}`}
          focalX={positionEditItem.imageFocalX}
          focalY={positionEditItem.imageFocalY}
          onChange={(imageFocalX, imageFocalY) => {
            setItems((prev) =>
              prev.map((it) =>
                it.id === positionEditItem.id ? { ...it, imageFocalX, imageFocalY } : it,
              ),
            );
          }}
          onClose={() => setPositionEditId(null)}
        />
      ) : null}
    </div>
  );
}
