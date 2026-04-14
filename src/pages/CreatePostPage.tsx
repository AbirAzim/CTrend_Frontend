import { useMutation, useQuery } from "@apollo/client";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CATEGORIES, CREATE_POST, FEED_POSTS } from "../graphql/feed";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";

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
  const [caption, setCaption] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [votingEndsAt, setVotingEndsAt] = useState("");
  const [items, setItems] = useState<DraftCompareItem[]>([
    { id: "1", imageUrl: "", title: "" },
    { id: "2", imageUrl: "", title: "" },
  ]);
  const [error, setError] = useState<string | null>(null);

  const [createPost, { loading }] = useMutation(CREATE_POST, {
    refetchQueries: [{ query: FEED_POSTS }],
  });
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
      setError("Please add at least two image URLs for compare.");
      return;
    }

    const imageUrls = normalized.map((it) => it.imageUrl);
    const options = normalized.map((it, idx) => ({
      label: it.title || `Option ${idx + 1}`,
      imageUrl: it.imageUrl,
    }));

    const input: {
      categoryId: string;
      imageUrls: string[];
      options: Array<{ label: string; imageUrl: string }>;
      votingEndsAt?: string;
      caption?: string;
    } = {
      categoryId: category,
      imageUrls,
      options,
    };
    const cap = caption.trim();
    if (cap) {
      input.caption = cap;
    }
    if (votingEndsAtIso) {
      input.votingEndsAt = votingEndsAtIso;
    }

    try {
      await createPost({
        variables: { input },
      });
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

  return (
    <div className="ig-create-page">
      <h1 className="ig-create-title">New post</h1>
      <p className="ig-create-lead">
        Create a compare post with category, multiple options, image URLs, and
        per-option titles. You can add as many compare items as needed.
      </p>

      <form className="ig-create-form" onSubmit={(ev) => void onSubmit(ev)}>
        <div className="ig-field">
          <label htmlFor="create-category-id">Category</label>
          <select
            id="create-category-id"
            name="categoryId"
            className="ig-input"
            value={categoryId}
            onChange={(ev) => setCategoryId(ev.target.value)}
            disabled={categoriesLoading}
          >
            <option value="">
              {categoriesLoading ? "Loading categories..." : "Select a category"}
            </option>
            {(categoriesData?.categories ?? []).map((cat) => (
              <option key={cat.id} value={cat.id}>
                {(cat.name?.trim() || cat.id).toString()}
              </option>
            ))}
          </select>
          {categoriesError ? (
            <small className="error">Could not load categories from API.</small>
          ) : null}
        </div>

        <div className="ig-field">
          <label htmlFor="create-caption">Caption (optional)</label>
          <textarea
            id="create-caption"
            name="caption"
            rows={3}
            className="ig-input ig-input-textarea"
            value={caption}
            onChange={(ev) => setCaption(ev.target.value)}
            placeholder="What are you comparing?"
            autoComplete="off"
          />
        </div>

        <div className="ig-field">
          <label htmlFor="create-deadline">Voting deadline (optional)</label>
          <input
            id="create-deadline"
            name="votingEndsAt"
            type="datetime-local"
            className="ig-input"
            value={votingEndsAt}
            onChange={(ev) => setVotingEndsAt(ev.target.value)}
            min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
          />
          <small className="muted">
            Will be sent as UTC ISO datetime to backend.
          </small>
        </div>

        {items.map((item, idx) => (
          <div className="ig-field" key={item.id}>
            <label htmlFor={`create-item-title-${item.id}`}>
              Compare title {idx + 1}
            </label>
            <input
              id={`create-item-title-${item.id}`}
              name={`itemTitle-${idx}`}
              type="text"
              className="ig-input"
              value={item.title}
              onChange={(ev) => updateItem(item.id, "title", ev.target.value)}
              placeholder={`Option ${idx + 1} title`}
              autoComplete="off"
            />
            <label htmlFor={`create-item-image-${item.id}`}>Image URL {idx + 1}</label>
            <input
              id={`create-item-image-${item.id}`}
              name={`itemImage-${idx}`}
              type="url"
              className="ig-input"
              value={item.imageUrl}
              onChange={(ev) => updateItem(item.id, "imageUrl", ev.target.value)}
              placeholder="https://…"
              autoComplete="off"
            />
            <div className="ig-create-item-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => removeItem(item.id)}
                disabled={items.length <= 2}
              >
                Remove option
              </button>
            </div>
          </div>
        ))}

        <button type="button" className="btn-ghost" onClick={addItem}>
          + Add another compare option
        </button>

        {error ? (
          <div className="ig-feed-banner ig-feed-banner--error" role="alert">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          className="ig-create-submit"
          disabled={loading}
        >
          {loading ? "Posting…" : "Post"}
        </button>

        <p className="ig-create-cancel">
          <Link to="/">Cancel</Link>
        </p>
      </form>
    </div>
  );
}
