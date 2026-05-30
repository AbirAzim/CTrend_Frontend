import { useRef, useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { CATEGORIES, UPDATE_POST } from "../graphql/feed";
import { useImageUpload } from "../lib/useImageUpload";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";

type CompareItem = { imageUrl: string; label: string };

type EditablePost = {
  id: string;
  caption?: string | null;
  imageUrls: string[];
  options?: Array<{ label?: string | null }> | null;
  category?: { id: string; name?: string | null } | null;
};

type Props = {
  post: EditablePost;
  onClose: () => void;
  onSaved: () => void;
};

export function EditPostModal({ post, onClose, onSaved }: Props) {
  const initialItems: CompareItem[] = post.imageUrls.map((url, i) => ({
    imageUrl: url,
    label: post.options?.[i]?.label ?? `Option ${i + 1}`,
  }));

  const [caption, setCaption] = useState(post.caption ?? "");
  const [items, setItems] = useState<CompareItem[]>(initialItems);
  const [categoryId, setCategoryId] = useState(post.category?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { uploadImage } = useImageUpload();

  const { data: catsData } = useQuery(CATEGORIES);
  const categories: Array<{ id: string; name: string }> = catsData?.categories ?? [];

  const [updatePostMut, { loading }] = useMutation(UPDATE_POST);

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
