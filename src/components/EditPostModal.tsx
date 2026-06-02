import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { CATEGORIES, EXTEND_POST_VOTING, UPDATE_POST } from "../graphql/feed";
import { ACTIVE_CAMPAIGNS, CAMPAIGNS_ADMIN } from "../graphql/campaigns";
import { DateTimePicker } from "./DateTimePicker";
import { useImageUpload } from "../lib/useImageUpload";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { useAuth } from "../context/AuthContext";

type CompareItem = { imageUrl: string; label: string };

type EditablePost = {
  id: string;
  caption?: string | null;
  imageUrls: string[];
  options?: Array<{ label?: string | null }> | null;
  category?: { id: string; name?: string | null } | null;
  campaign?: { id: string; name?: string | null; slug?: string | null } | null;
  votingEndsAt?: string | null;
  isVotingOpen?: boolean | null;
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

  const initialItems: CompareItem[] = post.imageUrls.map((url, i) => ({
    imageUrl: url,
    label: post.options?.[i]?.label ?? `Option ${i + 1}`,
  }));

  const [caption, setCaption] = useState(post.caption ?? "");
  const [items, setItems] = useState<CompareItem[]>(initialItems);
  const [categoryId, setCategoryId] = useState(post.category?.id ?? "");
  const [campaignId, setCampaignId] = useState(post.campaign?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [extendError, setExtendError] = useState<string | null>(null);
  const [extendPreset, setExtendPreset] = useState("");
  const [extendDraft, setExtendDraft] = useState("");
  const [votingEndsAt, setVotingEndsAt] = useState(post.votingEndsAt ?? null);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);
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

  function setItemField(idx: number, field: keyof CompareItem, value: string) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  function addItem() {
    if (items.length >= 10) return;
    setItems((prev) => [...prev, { imageUrl: "", label: `Option ${prev.length + 1}` }]);
  }

  function removeItem(idx: number) {
    if (items.length <= 2) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleFileUpload(idx: number, file: File) {
    setUploadingIdx(idx);
    try {
      const url = await uploadImage(file);
      setItemField(idx, "imageUrl", url);
    } catch {
      setError("Image upload failed. Try pasting a URL instead.");
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
    if (items.length < 2) { setError("At least 2 compare items are required."); return; }
    if (items.some((it) => !it.imageUrl.trim())) { setError("Every compare item needs an image."); return; }
    try {
      await updatePostMut({
        variables: {
          postId: post.id,
          input: {
            caption: caption.trim() || undefined,
            imageUrls: items.map((it) => it.imageUrl.trim()),
            options: items.map((it) => ({ label: it.label.trim() || "Option" })),
            categoryId: categoryId || undefined,
            campaignId: campaignId.trim(),
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
      aria-label="Edit compare post"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="cx-modal-card cx-edit-post-modal">
        <div className="cx-modal-head">
          <h2 className="cx-modal-title">Edit Compare</h2>
          <button type="button" className="cx-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="cx-modal-body">
          <label className="cx-edit-label">
            Caption
            <textarea
              className="cx-edit-textarea"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="What's this compare about?"
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

          {post.isVotingOpen !== false && (
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

          <p className="cx-edit-section-label">
            Compare Items
            <span className="cx-edit-item-count">{items.length} / 10</span>
          </p>

          <div className="cx-edit-items">
            {items.map((item, idx) => (
              <div key={idx} className="cx-edit-item">
                <div className="cx-edit-item-thumb">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" />
                  ) : (
                    <span className="cx-edit-item-placeholder">📷</span>
                  )}
                </div>
                <div className="cx-edit-item-fields">
                  <div className="cx-edit-item-url-row">
                    <input
                      type="url"
                      className="cx-edit-input"
                      value={item.imageUrl}
                      onChange={(e) => setItemField(idx, "imageUrl", e.target.value)}
                      placeholder="Image URL"
                    />
                    <button
                      type="button"
                      className="cx-edit-upload-btn"
                      title="Upload image"
                      disabled={uploadingIdx !== null}
                      onClick={() => fileRefs.current[idx]?.click()}
                    >
                      {uploadingIdx === idx ? "…" : "📁"}
                    </button>
                    <input
                      ref={(el) => { fileRefs.current[idx] = el; }}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleFileUpload(idx, f);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  <input
                    type="text"
                    className="cx-edit-input"
                    value={item.label}
                    onChange={(e) => setItemField(idx, "label", e.target.value)}
                    placeholder={`Label for option ${idx + 1}`}
                    maxLength={200}
                  />
                </div>
                {items.length > 2 && (
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
            ))}
          </div>

          {items.length < 10 && (
            <button type="button" className="cx-edit-add-btn" onClick={addItem}>
              + Add compare item
            </button>
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
            disabled={loading || uploadingIdx !== null}
            onClick={() => void handleSave()}
          >
            {loading ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
