import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { CATEGORIES, EXTEND_POST_VOTING, UPDATE_POST } from "../graphql/feed";
import { ACTIVE_CAMPAIGNS, CAMPAIGNS_ADMIN } from "../graphql/campaigns";
import { DateTimePicker } from "./DateTimePicker";
import { ImagePositionEditor } from "./ImagePositionEditor";
import { CompareImageCropper } from "./CompareImageCropper";
import { DEFAULT_IMAGE_FOCAL } from "../lib/imageFocal";
import { useImageUpload } from "../lib/useImageUpload";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { useAuth } from "../context/AuthContext";

type CompareItem = {
  imageUrl: string;
  label: string;
  imageFocalX: number;
  imageFocalY: number;
  /** True for options that existed before this edit (carry votes). */
  existing: boolean;
};

type PollOption = {
  label: string;
  imageUrl?: string | null;
  imageFocalX?: number | null;
  imageFocalY?: number | null;
};

type BodyImage = {
  id: string;
  url: string;
  /** True for photos already on the post (carry votes). */
  existing: boolean;
};

type EditablePost = {
  id: string;
  format?: string | null;
  caption?: string | null;
  imageUrls: string[];
  options?: Array<{
    label?: string | null;
    imageUrl?: string | null;
    imageFocalX?: number | null;
    imageFocalY?: number | null;
  }> | null;
  category?: { id: string; name?: string | null } | null;
  campaign?: { id: string; name?: string | null; slug?: string | null } | null;
  votingEndsAt?: string | null;
  isVotingOpen?: boolean | null;
  endingSoonLeadMinutes?: number | null;
  isUserGlobalBroadcast?: boolean | null;
  /** Vote tallies — used to decide whether swapping an image needs a warning. */
  upvoteCount?: number | null;
  downvoteCount?: number | null;
  optionStats?: Array<{ index: number; count?: number | null }> | null;
  /** "scheduled" while queued for a future go-live; "published" once live. */
  status?: string | null;
  /** ISO go-live time — only meaningful while status === "scheduled". */
  scheduledAt?: string | null;
};

type Props = {
  post: EditablePost;
  onClose: () => void;
  onSaved: () => void;
};

const EXTEND_PRESETS: { label: string; ms: number | null }[] = [
  { label: "+12h", ms: 12 * 3_600_000 },
  { label: "+1d", ms: 24 * 3_600_000 },
  { label: "+3d", ms: 3 * 24 * 3_600_000 },
  { label: "+1w", ms: 7 * 24 * 3_600_000 },
  { label: "Custom", ms: null },
];

function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDeadline(iso?: string | null): string {
  if (!iso) return "No deadline set";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No deadline set";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EditPostModal({ post, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === "admin";
  const isPoll = (post.format ?? "").toLowerCase() === "poll";
  // A post still queued for a future go-live: the schedule time can be changed.
  // Once published it can't, but the voting deadline (end time) still can.
  const isScheduled = (post.status ?? "").toLowerCase() === "scheduled";

  const initialItems: CompareItem[] = post.imageUrls.map((url, i) => ({
    imageUrl: url,
    label: post.options?.[i]?.label ?? `Option ${i + 1}`,
    imageFocalX: post.options?.[i]?.imageFocalX ?? DEFAULT_IMAGE_FOCAL,
    imageFocalY: post.options?.[i]?.imageFocalY ?? DEFAULT_IMAGE_FOCAL,
    existing: true,
  }));
  // Items already on the post carry existing votes (tracked per-item via
  // `existing`). Their label and position stay editable, but swapping the actual
  // image is what resets votes — so it's gated behind a warning when votes exist.

  // Whether any vote has been cast yet. Before the first vote, swapping an image
  // is harmless (nothing to lose), so we skip the warning.
  const hasVotes =
    (post.upvoteCount ?? 0) + (post.downvoteCount ?? 0) > 0 ||
    (post.optionStats ?? []).some((s) => (s.count ?? 0) > 0);

  // Poll options carry their own (optional) thumbnail. Labels stay editable;
  // images are locked because changing them would invalidate existing votes.
  const initialPollOptions: PollOption[] = (post.options ?? []).map((o, i) => ({
    label: o.label ?? `Option ${i + 1}`,
    imageUrl: o.imageUrl ?? null,
    imageFocalX: o.imageFocalX ?? null,
    imageFocalY: o.imageFocalY ?? null,
  }));
  const pollLockedCount = initialPollOptions.length;

  // Poll context/body photos. Existing ones carry votes — replacing/removing one
  // resets votes; adding new ones is safe.
  const initialBodyImages: BodyImage[] = (post.imageUrls ?? []).map((url, i) => ({
    id: `body-${i}`,
    url,
    existing: true,
  }));

  const [caption, setCaption] = useState(post.caption ?? "");
  const [items, setItems] = useState<CompareItem[]>(initialItems);
  const [pollOptions, setPollOptions] = useState<PollOption[]>(initialPollOptions);
  const [bodyImages, setBodyImages] = useState<BodyImage[]>(initialBodyImages);
  const [bodyUploadingId, setBodyUploadingId] = useState<string | null>(null);
  const bodyFileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [broadcastGlobally, setBroadcastGlobally] = useState(
    Boolean(post.isUserGlobalBroadcast),
  );
  const [categoryId, setCategoryId] = useState(post.category?.id ?? "");
  const [campaignId, setCampaignId] = useState(post.campaign?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [extendError, setExtendError] = useState<string | null>(null);
  const [extendPreset, setExtendPreset] = useState("");
  const [extendDraft, setExtendDraft] = useState("");
  const [votingEndsAt, setVotingEndsAt] = useState(post.votingEndsAt ?? null);
  const [scheduledAt, setScheduledAt] = useState(
    isScheduled && post.scheduledAt
      ? toLocalDateTimeInputValue(new Date(post.scheduledAt))
      : "",
  );
  const [endingSoonLeadMinutes, setEndingSoonLeadMinutes] = useState(
    post.endingSoonLeadMinutes ?? 5,
  );
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  // Open image-position (focal) editor for this compare item index.
  const [positionIdx, setPositionIdx] = useState<number | null>(null);
  // Same, for a poll option index.
  const [pollPositionIdx, setPollPositionIdx] = useState<number | null>(null);
  // Pending crop for a freshly chosen file before it's uploaded.
  const [cropper, setCropper] = useState<{ idx: number; url: string } | null>(null);
  const [pollUploadingIdx, setPollUploadingIdx] = useState<number | null>(null);
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);
  const pollFileRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { uploadImage } = useImageUpload();

  const votingOpen = post.isVotingOpen !== false && votingEndsAt
    ? new Date(votingEndsAt).getTime() > Date.now()
    : post.isVotingOpen !== false;

  const { data: catsData } = useQuery(CATEGORIES);
  const categories: Array<{ id: string; name: string }> = catsData?.categories ?? [];

  const { data: activeCampaignsData } = useQuery<{
    activeCampaigns: Array<{ id: string; name: string; slug: string }>;
  }>(ACTIVE_CAMPAIGNS, { fetchPolicy: "cache-first", errorPolicy: "all" });
  const { data: adminCampaignsData } = useQuery<{
    campaigns: Array<{ id: string; name: string; slug: string; isActive: boolean }>;
  }>(CAMPAIGNS_ADMIN, { skip: !isAdmin, fetchPolicy: "cache-first", errorPolicy: "all" });
  const campaignOptions = isAdmin
    ? (adminCampaignsData?.campaigns ?? [])
    : (activeCampaignsData?.activeCampaigns ?? []);
  const campaignOptionsMerged = useMemo(() => {
    const list = [...campaignOptions];
    const cur = post.campaign;
    if (cur?.id && !list.some((c) => c.id === cur.id)) {
      list.unshift({
        id: cur.id,
        name: cur.name ?? "Linked campaign",
        slug: cur.slug ?? "",
        ...(isAdmin ? { isActive: true } : {}),
      });
    }
    return list;
  }, [campaignOptions, isAdmin, post.campaign]);

  const [updatePostMut, { loading }] = useMutation(UPDATE_POST);
  const [extendVotingMut, { loading: extending }] = useMutation(EXTEND_POST_VOTING);

  function setItemLabel(idx: number, value: string) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, label: value } : item)));
  }

  function setItemFocal(idx: number, imageFocalX: number, imageFocalY: number) {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, imageFocalX, imageFocalY } : item)),
    );
  }

  function addItem() {
    if (items.length >= 10) return;
    setItems((prev) => [
      ...prev,
      {
        imageUrl: "",
        label: `Option ${prev.length + 1}`,
        imageFocalX: DEFAULT_IMAGE_FOCAL,
        imageFocalY: DEFAULT_IMAGE_FOCAL,
        existing: false,
      },
    ]);
  }

  function removeItem(idx: number) {
    // Existing options can't be removed (it would shift vote indices); only
    // newly added rows can. Keep at least 2 items.
    if (items[idx]?.existing || items.length <= 2) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  /**
   * Picking a new file for an item. For an existing option that already has
   * votes, swapping the image wipes those votes — so confirm first.
   */
  function requestReplace(idx: number) {
    if (items[idx]?.existing && hasVotes) {
      const ok = window.confirm(
        "Replacing this image will remove all current votes on this post. " +
          "Repositioning the existing image (Adjust position) keeps the votes. " +
          "Replace the image anyway?",
      );
      if (!ok) return;
    }
    fileRefs.current[idx]?.click();
  }

  function setPollLabel(idx: number, value: string) {
    setPollOptions((prev) =>
      prev.map((opt, i) => (i === idx ? { ...opt, label: value } : opt)),
    );
  }

  function setPollFocal(idx: number, imageFocalX: number, imageFocalY: number) {
    setPollOptions((prev) =>
      prev.map((opt, i) => (i === idx ? { ...opt, imageFocalX, imageFocalY } : opt)),
    );
  }

  // Poll thumbnails upload directly (no crop step — matches poll create); a new
  // image resets that option's focal point.
  async function handlePollFileUpload(idx: number, file: File) {
    setPollUploadingIdx(idx);
    try {
      const url = await uploadImage(file);
      setPollOptions((prev) =>
        prev.map((opt, i) =>
          i === idx
            ? {
                ...opt,
                imageUrl: url,
                imageFocalX: DEFAULT_IMAGE_FOCAL,
                imageFocalY: DEFAULT_IMAGE_FOCAL,
              }
            : opt,
        ),
      );
    } catch {
      setError("Image upload failed. Try again.");
    }
    setPollUploadingIdx(null);
  }

  // Swapping an existing option's photo resets votes — confirm when votes exist.
  function requestPollReplace(idx: number) {
    if (idx < pollLockedCount && pollOptions[idx]?.imageUrl && hasVotes) {
      const ok = window.confirm(
        "Replacing this option's photo will remove all current votes on this poll. " +
          "Repositioning the existing photo (Adjust position) keeps the votes. " +
          "Replace the photo anyway?",
      );
      if (!ok) return;
    }
    pollFileRefs.current[idx]?.click();
  }

  // ── Poll context/body photos ──────────────────────────────────────────────
  async function handleBodyFileUpload(id: string, file: File) {
    setBodyUploadingId(id);
    try {
      const url = await uploadImage(file);
      setBodyImages((prev) => prev.map((b) => (b.id === id ? { ...b, url } : b)));
    } catch {
      setError("Image upload failed. Try again.");
    }
    setBodyUploadingId(null);
  }

  function addBodyImage() {
    if (bodyImages.length >= 6) return;
    const id = `body-new-${Date.now()}`;
    setBodyImages((prev) => [...prev, { id, url: "", existing: false }]);
    // Open the file picker on the next tick once the input is mounted.
    setTimeout(() => bodyFileRefs.current[id]?.click(), 0);
  }

  function removeBodyImage(id: string) {
    const img = bodyImages.find((b) => b.id === id);
    if (img?.existing && img.url && hasVotes) {
      const ok = window.confirm(
        "Removing this photo will remove all current votes on this poll. Remove it anyway?",
      );
      if (!ok) return;
    }
    setBodyImages((prev) => prev.filter((b) => b.id !== id));
  }

  function requestBodyReplace(id: string) {
    const img = bodyImages.find((b) => b.id === id);
    if (img?.existing && img.url && hasVotes) {
      const ok = window.confirm(
        "Replacing this photo will remove all current votes on this poll. Replace it anyway?",
      );
      if (!ok) return;
    }
    bodyFileRefs.current[id]?.click();
  }

  function addPollOption() {
    if (pollOptions.length >= 10) return;
    setPollOptions((prev) => [...prev, { label: "" }]);
  }

  function removePollOption(idx: number) {
    // Existing options are locked (removing them would shift vote indices);
    // only newly added rows can be removed.
    if (idx < pollLockedCount || pollOptions.length <= 2) return;
    setPollOptions((prev) => prev.filter((_, i) => i !== idx));
  }

  // A freshly chosen file goes through the crop+zoom editor first (same as the
  // create flow) so every compare image gets a uniform shape.
  function handleFilePicked(idx: number, file: File) {
    setCropper({ idx, url: URL.createObjectURL(file) });
  }

  async function uploadCroppedFile(idx: number, file: File) {
    setUploadingIdx(idx);
    try {
      const url = await uploadImage(file);
      // A new image resets the focal point — the crop already framed it.
      setItems((prev) =>
        prev.map((item, i) =>
          i === idx
            ? {
                ...item,
                imageUrl: url,
                imageFocalX: DEFAULT_IMAGE_FOCAL,
                imageFocalY: DEFAULT_IMAGE_FOCAL,
              }
            : item,
        ),
      );
    } catch {
      setError("Image upload failed. Try again.");
    }
    setUploadingIdx(null);
  }

  async function handleExtendDeadline() {
    setExtendError(null);
    const raw = extendDraft.trim();
    if (!raw) {
      setExtendError("Pick a new date-time.");
      return;
    }
    const next = new Date(raw);
    if (Number.isNaN(next.getTime())) {
      setExtendError("Invalid datetime.");
      return;
    }
    if (next.getTime() <= Date.now()) {
      setExtendError("New deadline must be in the future.");
      return;
    }
    if (votingEndsAt) {
      const cur = new Date(votingEndsAt).getTime();
      if (!Number.isNaN(cur) && next.getTime() <= cur) {
        setExtendError("New deadline should be after the current end time.");
        return;
      }
    }
    try {
      const { data } = await extendVotingMut({
        variables: {
          postId: post.id,
          newVotingEndsAt: next.toISOString(),
        },
      });
      const updated = data?.extendPostVoting?.votingEndsAt ?? next.toISOString();
      setVotingEndsAt(updated);
      setExtendDraft("");
      setExtendPreset("");
      onSaved();
    } catch (err: unknown) {
      setExtendError(getApolloErrorMessage(err));
    }
  }

  async function handleSave() {
    setError(null);

    // Reschedule (only for not-yet-published posts). Published posts never
    // send scheduledAt, so their go-live time is immutable.
    let scheduledAtInput: string | undefined;
    if (isScheduled) {
      const trimmed = scheduledAt.trim();
      if (!trimmed) {
        setError("Pick a date and time for this post to go live.");
        return;
      }
      const when = new Date(trimmed);
      if (Number.isNaN(when.getTime())) {
        setError("Invalid schedule time.");
        return;
      }
      if (when.getTime() <= Date.now()) {
        setError("Schedule time must be in the future.");
        return;
      }
      scheduledAtInput = when.toISOString();
    }

    const sharedInput = {
      caption: caption.trim() || undefined,
      categoryId: categoryId || undefined,
      campaignId: campaignId.trim(),
      ...(scheduledAtInput ? { scheduledAt: scheduledAtInput } : {}),
      endingSoonLeadMinutes: isAdmin
        ? Math.max(1, Math.min(1440, Math.round(endingSoonLeadMinutes || 5)))
        : undefined,
      broadcastGlobally: isAdmin
        ? undefined
        : broadcastGlobally !== Boolean(post.isUserGlobalBroadcast)
          ? broadcastGlobally
          : undefined,
    };

    if (isPoll) {
      const labeled = pollOptions.filter((o) => o.label.trim().length > 0);
      if (labeled.length < 2) {
        setError("A poll needs at least 2 options with labels.");
        return;
      }
      try {
        await updatePostMut({
          variables: {
            postId: post.id,
            input: {
              ...sharedInput,
              // Context/body photos. The backend resets votes if an existing one
              // changed/was removed (existingImageUrlsChanged); adding is safe.
              imageUrls: bodyImages
                .map((b) => b.url.trim())
                .filter((u) => u.length > 0),
              options: labeled.map((o) => ({
                label: o.label.trim() || "Option",
                ...(o.imageUrl
                  ? {
                      imageUrl: o.imageUrl,
                      imageFocalX: o.imageFocalX ?? undefined,
                      imageFocalY: o.imageFocalY ?? undefined,
                    }
                  : {}),
              })),
            },
          },
        });
        onSaved();
        onClose();
      } catch (err: unknown) {
        setError(getApolloErrorMessage(err));
      }
      return;
    }

    if (items.length < 2) { setError("At least 2 compare items are required."); return; }
    if (items.some((it) => !it.imageUrl.trim())) { setError("Every compare item needs an image."); return; }
    try {
      await updatePostMut({
        variables: {
          postId: post.id,
          input: {
            ...sharedInput,
            // imageUrls drive the backend's vote-reset check: an unchanged URL
            // (label/position edit) keeps votes; a swapped URL resets them.
            imageUrls: items.map((it) => it.imageUrl.trim()),
            options: items.map((it) => ({
              label: it.label.trim() || "Option",
              imageUrl: it.imageUrl.trim(),
              imageFocalX: it.imageFocalX,
              imageFocalY: it.imageFocalY,
            })),
          },
        },
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(getApolloErrorMessage(err));
    }
  }

  return (
    <div
      className="cx-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={isPoll ? "Edit poll post" : "Edit compare post"}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="cx-modal-card cx-edit-post-modal">
        <div className="cx-modal-head">
          <h2 className="cx-modal-title">
            {isScheduled ? "Edit Scheduled " : "Edit "}
            {isPoll ? "Poll" : "Compare"}
          </h2>
          <button type="button" className="cx-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="cx-modal-body">
          <label className="cx-edit-label">
            Caption
            <textarea
              className="cx-edit-textarea"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={isPoll ? "What's this poll about?" : "What's this compare about?"}
              rows={2}
              maxLength={1000}
            />
          </label>

          {categories.length > 0 && (
            <label className="cx-edit-label">
              Category
              <select
                className="cx-edit-select"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Pick a category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}

          {(campaignOptionsMerged.length > 0 || post.campaign) && (
            <label className="cx-edit-label">
              Campaign
              <select
                className="cx-edit-select"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
              >
                <option value="">No campaign</option>
                {campaignOptionsMerged.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {isAdmin && "isActive" in c && !c.isActive ? " (inactive)" : ""}
                  </option>
                ))}
              </select>
              {post.campaign?.name && campaignId === post.campaign.id ? (
                <span className="muted small">Currently linked to {post.campaign.name}</span>
              ) : null}
            </label>
          )}

          {!isAdmin && (
            <label className="cx-edit-label cx-edit-toggle-row">
              <span>
                <strong>Post platform-wide (global)</strong>
                <span className="muted small">
                  {broadcastGlobally
                    ? "Everyone can see and vote — not just your friends."
                    : "Only your friends can see and vote on this post."}
                </span>
              </span>
              <input
                type="checkbox"
                checked={broadcastGlobally}
                onChange={(e) => setBroadcastGlobally(e.target.checked)}
              />
            </label>
          )}

          {isScheduled && (
            <div className="cx-extend-section cx-edit-extend-section">
              <p className="cx-extend-label">
                Go-live time
                <span className="cx-edit-deadline-current muted small">
                  Not published yet — change when this post goes live.
                </span>
              </p>
              <DateTimePicker
                id="edit-scheduled-at"
                label="Publish at"
                value={scheduledAt}
                minDate={toLocalDateTimeInputValue(new Date(Date.now() + 60_000))}
                onChange={(v) => {
                  setScheduledAt(v);
                  setError(null);
                }}
              />
            </div>
          )}

          {!isScheduled && post.isVotingOpen !== false && (
            <div className="cx-extend-section cx-edit-extend-section">
              <p className="cx-extend-label">
                Voting deadline
                <span className="cx-edit-deadline-current muted small">
                  Current: {formatDeadline(votingEndsAt)}
                  {!votingOpen ? " · Closed" : ""}
                </span>
              </p>
              <div className="cx-extend-presets">
                {EXTEND_PRESETS.map(({ label, ms }) => (
                  <button
                    key={label}
                    type="button"
                    className={`cx-extend-chip${extendPreset === label ? " cx-extend-chip--active" : ""}`}
                    onClick={() => {
                      setExtendPreset(label);
                      setExtendError(null);
                      if (ms !== null) {
                        const base = votingEndsAt && new Date(votingEndsAt).getTime() > Date.now()
                          ? new Date(votingEndsAt)
                          : new Date();
                        setExtendDraft(toLocalDateTimeInputValue(new Date(base.getTime() + ms)));
                      } else {
                        setExtendDraft("");
                      }
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {(extendPreset === "Custom" || extendDraft) && (
                <DateTimePicker
                  id="edit-extend-deadline"
                  label="New voting deadline"
                  value={extendDraft}
                  minDate={toLocalDateTimeInputValue(new Date(Date.now() + 60_000))}
                  onChange={(v) => {
                    setExtendDraft(v);
                    setExtendError(null);
                    if (v) setExtendPreset("Custom");
                  }}
                />
              )}
              <div className="cx-extend-footer">
                <button
                  type="button"
                  className="cx-extend-submit"
                  disabled={extending || !extendDraft.trim()}
                  onClick={() => void handleExtendDeadline()}
                >
                  {extending ? "Updating…" : "Apply new deadline"}
                </button>
                {extendError ? (
                  <small className="cx-extend-error" role="alert">{extendError}</small>
                ) : null}
              </div>
            </div>
          )}

          {isAdmin ? (
            <label className="cx-edit-label">
              Ending-soon alert lead time (minutes)
              <input
                type="number"
                className="cx-edit-input"
                min={1}
                max={1440}
                value={endingSoonLeadMinutes}
                onChange={(e) =>
                  setEndingSoonLeadMinutes(
                    Math.max(1, Math.min(1440, Number(e.target.value) || 5)),
                  )
                }
              />
              <span className="muted small">
                Show "Poll ending soon, vote now" within this many minutes before deadline.
              </span>
            </label>
          ) : null}

          {isPoll ? (
            <>
              <p className="cx-edit-section-label">
                Poll photos
                <span className="cx-edit-item-count">{bodyImages.length} / 6</span>
              </p>
              <p className="muted small cx-edit-locked-note">
                Context photos shown above the options.
                {hasVotes
                  ? " Replacing or removing an existing photo resets all votes (you'll be asked to confirm); adding new ones is safe."
                  : " Add, replace or remove freely until the first vote is cast."}
              </p>
              <div className="cx-edit-poll-photos">
                {bodyImages.map((b) => (
                  <div className="cx-edit-poll-photo" key={b.id}>
                    {b.url ? (
                      <img src={b.url} alt="" />
                    ) : (
                      <span className="cx-edit-item-placeholder">🖼</span>
                    )}
                    {bodyUploadingId === b.id && (
                      <span className="cx-edit-poll-photo-uploading">…</span>
                    )}
                    <div className="cx-edit-poll-photo-actions">
                      <button
                        type="button"
                        className="cx-edit-poll-photo-btn"
                        title={b.url ? "Replace photo" : "Upload photo"}
                        disabled={bodyUploadingId !== null}
                        onClick={() => requestBodyReplace(b.id)}
                      >
                        {b.url ? "🔁" : "📁"}
                      </button>
                      <button
                        type="button"
                        className="cx-edit-poll-photo-btn cx-edit-poll-photo-btn--remove"
                        title="Remove photo"
                        onClick={() => removeBodyImage(b.id)}
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      ref={(el) => { bodyFileRefs.current[b.id] = el; }}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleBodyFileUpload(b.id, f);
                        e.target.value = "";
                      }}
                    />
                  </div>
                ))}
                {bodyImages.length < 6 && (
                  <button
                    type="button"
                    className="cx-edit-poll-photo cx-edit-poll-photo--add"
                    onClick={addBodyImage}
                    disabled={bodyUploadingId !== null}
                  >
                    +
                  </button>
                )}
              </div>

              <p className="cx-edit-section-label">
                Poll Options
                <span className="cx-edit-item-count">{pollOptions.length} / 10</span>
              </p>
              <p className="muted small cx-edit-locked-note">
                Edit labels and reposition photos anytime — votes stay intact.
                {hasVotes
                  ? " Replacing an option's photo resets all votes (you'll be asked to confirm)."
                  : " You can also swap photos freely until the first vote is cast."}
              </p>

              <div className="cx-edit-items">
                {pollOptions.map((opt, idx) => {
                  const locked = idx < pollLockedCount;
                  const hasImage = Boolean(opt.imageUrl);
                  return (
                    <div key={idx} className="cx-edit-item cx-edit-item--poll">
                      <div className="cx-edit-item-thumb">
                        {opt.imageUrl ? (
                          <img
                            src={opt.imageUrl}
                            alt=""
                            style={{
                              objectPosition: `${opt.imageFocalX ?? DEFAULT_IMAGE_FOCAL}% ${opt.imageFocalY ?? DEFAULT_IMAGE_FOCAL}%`,
                            }}
                          />
                        ) : (
                          <span className="cx-edit-item-placeholder">📊</span>
                        )}
                      </div>
                      <div className="cx-edit-item-fields">
                        <input
                          type="text"
                          className="cx-edit-input"
                          value={opt.label}
                          onChange={(e) => setPollLabel(idx, e.target.value)}
                          placeholder={`Option ${idx + 1} label`}
                          maxLength={200}
                        />
                        <div className="cx-edit-item-actions">
                          {hasImage && (
                            <button
                              type="button"
                              className="cx-edit-item-action"
                              onClick={() => setPollPositionIdx(idx)}
                            >
                              ↔ Adjust position
                            </button>
                          )}
                          <button
                            type="button"
                            className="cx-edit-item-action"
                            disabled={pollUploadingIdx !== null}
                            onClick={() => requestPollReplace(idx)}
                          >
                            {pollUploadingIdx === idx
                              ? "Uploading…"
                              : hasImage
                                ? "🔁 Replace photo"
                                : "📁 Add photo"}
                          </button>
                          <input
                            ref={(el) => { pollFileRefs.current[idx] = el; }}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handlePollFileUpload(idx, f);
                              e.target.value = "";
                            }}
                          />
                        </div>
                      </div>
                      {!locked && (
                        <button
                          type="button"
                          className="cx-edit-remove-btn"
                          onClick={() => removePollOption(idx)}
                          aria-label={`Remove option ${idx + 1}`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {pollOptions.length < 10 && (
                <button type="button" className="cx-edit-add-btn" onClick={addPollOption}>
                  + Add poll option
                </button>
              )}
            </>
          ) : (
            <>
          <p className="cx-edit-section-label">
            Compare Items
            <span className="cx-edit-item-count">{items.length} / 10</span>
          </p>
          <p className="muted small cx-edit-locked-note">
            Edit labels and reposition images anytime — votes stay intact.
            {hasVotes
              ? " Replacing an image resets all votes (you'll be asked to confirm)."
              : " You can also swap images freely until the first vote is cast."}
          </p>

          <div className="cx-edit-items">
            {items.map((item, idx) => {
              const hasImage = Boolean(item.imageUrl);
              return (
                <div key={idx} className="cx-edit-item">
                  <div className="cx-edit-item-thumb">
                    {hasImage ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        style={{
                          objectPosition: `${item.imageFocalX}% ${item.imageFocalY}%`,
                        }}
                      />
                    ) : (
                      <span className="cx-edit-item-placeholder">📷</span>
                    )}
                  </div>
                  <div className="cx-edit-item-fields">
                    <input
                      type="text"
                      className="cx-edit-input"
                      value={item.label}
                      onChange={(e) => setItemLabel(idx, e.target.value)}
                      placeholder={`Label for option ${idx + 1}`}
                      maxLength={200}
                    />
                    <div className="cx-edit-item-actions">
                      {hasImage && (
                        <button
                          type="button"
                          className="cx-edit-item-action"
                          onClick={() => setPositionIdx(idx)}
                        >
                          ↔ Adjust position
                        </button>
                      )}
                      <button
                        type="button"
                        className="cx-edit-item-action"
                        disabled={uploadingIdx !== null}
                        onClick={() => requestReplace(idx)}
                      >
                        {uploadingIdx === idx
                          ? "Uploading…"
                          : hasImage
                            ? "🔁 Replace image"
                            : "📁 Upload image"}
                      </button>
                      <input
                        ref={(el) => { fileRefs.current[idx] = el; }}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFilePicked(idx, f);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  </div>
                  {!item.existing && (
                    <button
                      type="button"
                      className="cx-edit-remove-btn"
                      onClick={() => removeItem(idx)}
                      aria-label={`Remove option ${idx + 1}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {items.length < 10 && (
            <button type="button" className="cx-edit-add-btn" onClick={addItem}>
              + Add compare item
            </button>
          )}
            </>
          )}

          {error && (
            <p className="cx-edit-error" role="alert">{error}</p>
          )}
        </div>

        <div className="cx-modal-footer">
          <button type="button" className="cx-conn-btn cx-conn-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="cx-conn-btn cx-conn-btn--add"
            disabled={loading || uploadingIdx !== null || pollUploadingIdx !== null}
            onClick={() => void handleSave()}
          >
            {loading ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {positionIdx !== null && items[positionIdx]?.imageUrl ? (
        <ImagePositionEditor
          src={items[positionIdx].imageUrl}
          label={items[positionIdx].label || `Option ${positionIdx + 1}`}
          focalX={items[positionIdx].imageFocalX}
          focalY={items[positionIdx].imageFocalY}
          onChange={(fx, fy) => setItemFocal(positionIdx, fx, fy)}
          onClose={() => setPositionIdx(null)}
        />
      ) : null}

      {pollPositionIdx !== null && pollOptions[pollPositionIdx]?.imageUrl ? (
        <ImagePositionEditor
          src={pollOptions[pollPositionIdx].imageUrl as string}
          label={pollOptions[pollPositionIdx].label || `Option ${pollPositionIdx + 1}`}
          focalX={pollOptions[pollPositionIdx].imageFocalX ?? DEFAULT_IMAGE_FOCAL}
          focalY={pollOptions[pollPositionIdx].imageFocalY ?? DEFAULT_IMAGE_FOCAL}
          onChange={(fx, fy) => setPollFocal(pollPositionIdx, fx, fy)}
          onClose={() => setPollPositionIdx(null)}
        />
      ) : null}

      {cropper ? (
        <CompareImageCropper
          src={cropper.url}
          aspect={1}
          onCancel={() => {
            URL.revokeObjectURL(cropper.url);
            setCropper(null);
          }}
          onDone={(file) => {
            const idx = cropper.idx;
            URL.revokeObjectURL(cropper.url);
            setCropper(null);
            void uploadCroppedFile(idx, file);
          }}
        />
      ) : null}
    </div>
  );
}
