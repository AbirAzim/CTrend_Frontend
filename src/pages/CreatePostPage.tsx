import { useMutation } from "@apollo/client";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CREATE_POST, FEED_POSTS } from "../graphql/feed";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";

export function CreatePostPage() {
  const navigate = useNavigate();
  const [caption, setCaption] = useState("");
  const [imageUrl1, setImageUrl1] = useState("");
  const [imageUrl2, setImageUrl2] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [createPost, { loading }] = useMutation(CREATE_POST, {
    refetchQueries: [{ query: FEED_POSTS }],
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const u1 = imageUrl1.trim();
    const u2 = imageUrl2.trim();
    if (!u1) {
      setError("At least one image URL is required.");
      return;
    }

    const imageUrls = u2 ? [u1, u2] : [u1];

    const input: { imageUrls: string[]; caption?: string } = { imageUrls };
    const cap = caption.trim();
    if (cap) {
      input.caption = cap;
    }

    try {
      await createPost({
        variables: { input },
      });
      navigate("/", { replace: true });
    } catch (err) {
      setError(getApolloErrorMessage(err));
    }
  }

  return (
    <div className="ig-create-page">
      <h1 className="ig-create-title">New post</h1>
      <p className="ig-create-lead">
        Paste public image URLs (e.g. Wikimedia, Unsplash). For an A/B compare
        post, add two URLs — the API receives{" "}
        <code className="ig-create-code">imageUrls: [url1, url2]</code>.
      </p>

      <form className="ig-create-form" onSubmit={(ev) => void onSubmit(ev)}>
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
          <label htmlFor="create-img1">Image URL 1</label>
          <input
            id="create-img1"
            name="imageUrl1"
            type="url"
            className="ig-input"
            value={imageUrl1}
            onChange={(ev) => setImageUrl1(ev.target.value)}
            placeholder="https://…"
            autoComplete="off"
          />
        </div>

        <div className="ig-field">
          <label htmlFor="create-img2">Image URL 2 (optional — compare)</label>
          <input
            id="create-img2"
            name="imageUrl2"
            type="url"
            className="ig-input"
            value={imageUrl2}
            onChange={(ev) => setImageUrl2(ev.target.value)}
            placeholder="Second image for side-by-side compare"
            autoComplete="off"
          />
        </div>

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
