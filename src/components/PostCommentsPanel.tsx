import { useLazyQuery, useMutation } from "@apollo/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  COMMENT_POST,
  COMMENTS_BY_POST,
  COMMENT_REACTION_EMOJIS,
  SET_COMMENT_REACTION,
} from "../graphql/comments";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { normalizeProfileImageUrl } from "../lib/profileImageUrl";

type CommentAuthor = {
  id: string;
  username: string;
  displayName?: string | null;
  profileImageUrl?: string | null;
  email?: string | null;
};

export type CommentRow = {
  id: string;
  content: string;
  createdAt: string;
  postId: string;
  parentId?: string | null;
  reactions: Array<{ emoji: string; count: number }>;
  viewerReaction?: string | null;
  author: CommentAuthor;
};

type LocalCommentRow = {
  id: string;
  content: string;
  authorLabel: string;
  createdAt: string;
};

type CommentsByPostQueryData = {
  commentsByPost: CommentRow[];
};

/** Top-level comment threads shown before "Show more". */
const PREVIEW_THREAD_COUNT = 5;

type Props = {
  postId: string;
  voteMode: "api" | "local";
  isAuthenticated: boolean;
  meLabel: string;
  /** Scroll to and briefly highlight this comment (from notification deep link). */
  highlightCommentId?: string | null;
  /** Collapse panel (Discuss chip / header close). */
  onClose?: () => void;
};

function commentDisplayName(author: CommentAuthor): string {
  return author.displayName?.trim() || author.username?.trim() || "user";
}

function commentInitial(author: CommentAuthor): string {
  return commentDisplayName(author).replace(/^@/, "").slice(0, 1).toUpperCase();
}

function commentAvatarSrc(author: CommentAuthor): string | null {
  const normalized = normalizeProfileImageUrl(author.profileImageUrl);
  if (normalized) return normalized;
  const name = commentDisplayName(author);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=312e81&color=ffffff&size=96&format=png`;
}

function buildThreads(comments: CommentRow[]) {
  const topLevel = comments.filter((c) => !c.parentId);
  const repliesByParent = new Map<string, CommentRow[]>();
  for (const c of comments) {
    if (!c.parentId) continue;
    const list = repliesByParent.get(c.parentId) ?? [];
    list.push(c);
    repliesByParent.set(c.parentId, list);
  }
  // Newest top-level comments first; replies stay oldest-first (chronological).
  const createdAsc = (a: CommentRow, b: CommentRow) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  topLevel.sort((a, b) => -createdAsc(a, b));
  for (const list of repliesByParent.values()) list.sort(createdAsc);
  return topLevel.map((comment) => ({
    comment,
    replies: repliesByParent.get(comment.id) ?? [],
  }));
}

function applyOptimisticReaction(row: CommentRow, nextEmoji: string | null): CommentRow {
  const prevEmoji = row.viewerReaction ?? null;
  if (prevEmoji === nextEmoji) return row;

  const reactionMap = new Map(row.reactions.map((r) => [r.emoji, r.count]));

  if (prevEmoji) {
    const prevCount = reactionMap.get(prevEmoji) ?? 0;
    if (prevCount <= 1) reactionMap.delete(prevEmoji);
    else reactionMap.set(prevEmoji, prevCount - 1);
  }

  if (nextEmoji) {
    reactionMap.set(nextEmoji, (reactionMap.get(nextEmoji) ?? 0) + 1);
  }

  const order = new Map(COMMENT_REACTION_EMOJIS.map((emoji, index) => [emoji, index]));
  const reactions = [...reactionMap.entries()]
    .map(([emoji, count]) => ({ emoji, count }))
    .sort(
      (a, b) =>
        (order.get(a.emoji as (typeof COMMENT_REACTION_EMOJIS)[number]) ?? 99) -
        (order.get(b.emoji as (typeof COMMENT_REACTION_EMOJIS)[number]) ?? 99),
    );

  return {
    ...row,
    viewerReaction: nextEmoji,
    reactions,
  };
}

function CommentAvatar({ author }: { author: CommentAuthor }) {
  const src = commentAvatarSrc(author);
  return (
    <Link
      to={`/profile/${author.id}`}
      className="cx-comment-avatar"
      aria-label={`View ${commentDisplayName(author)} profile`}
    >
      {src ? (
        <img src={src} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="cx-comment-avatar-initial">{commentInitial(author)}</span>
      )}
    </Link>
  );
}

type CommentItemProps = {
  row: CommentRow;
  isReply?: boolean;
  isAuthenticated: boolean;
  reactionOpenId: string | null;
  setReactionOpenId: (id: string | null) => void;
  replyTargetId: string | null;
  setReplyTargetId: (id: string | null) => void;
  replyDraft: string;
  setReplyDraft: (value: string) => void;
  onSubmitReply: (parentId: string) => void;
  onPickReaction: (commentId: string, emoji: string | null) => void;
};

function DiscussHideButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="cx-discuss-hide-btn" onClick={onClose}>
      <span className="cx-discuss-hide-chevron" aria-hidden />
      Hide discussion
    </button>
  );
}

function DiscussMoreButton({
  expanded,
  hiddenCount,
  onToggle,
}: {
  expanded: boolean;
  hiddenCount: number;
  onToggle: () => void;
}) {
  if (hiddenCount <= 0) return null;
  return (
    <div className="cx-discuss-more-wrap">
      <button
        type="button"
        className="cx-discuss-more-btn"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span
          className={`cx-discuss-more-chevron${expanded ? " cx-discuss-more-chevron--up" : ""}`}
          aria-hidden
        />
        <span className="cx-discuss-more-label">
          {expanded
            ? "Show less"
            : `Show ${hiddenCount} more ${hiddenCount === 1 ? "comment" : "comments"}`}
        </span>
      </button>
    </div>
  );
}

function CommentItem({
  row,
  isReply = false,
  isAuthenticated,
  reactionOpenId,
  setReactionOpenId,
  replyTargetId,
  setReplyTargetId,
  replyDraft,
  setReplyDraft,
  onSubmitReply,
  onPickReaction,
}: CommentItemProps) {
  const name = commentDisplayName(row.author);
  const pickerOpen = reactionOpenId === row.id;
  const replyOpen = replyTargetId === row.id;

  return (
    <article
      id={`comment-${row.id}`}
      className={`cx-comment-row cx-discuss-comment${isReply ? " cx-comment-row--reply" : ""}${row.viewerReaction ? " cx-discuss-comment--reacted" : ""}`}
    >
      <CommentAvatar author={row.author} />
      <div className="cx-comment-main cx-discuss-comment-body">
        <header className="cx-discuss-comment-head">
          <Link to={`/profile/${row.author.id}`} className="cx-comment-author">
            {name}
          </Link>
          <time className="cx-discuss-comment-time" dateTime={row.createdAt}>
            {formatRelativeTime(row.createdAt) || "just now"}
          </time>
        </header>
        <p className="cx-comment-body">{row.content}</p>

        {row.reactions.length > 0 ? (
          <div className="cx-discuss-reaction-strip" aria-label="Reactions">
            {row.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                className={`cx-discuss-reaction-chip${row.viewerReaction === r.emoji ? " cx-discuss-reaction-chip--mine" : ""}`}
                disabled={!isAuthenticated}
                onClick={() =>
                  onPickReaction(row.id, row.viewerReaction === r.emoji ? null : r.emoji)
                }
              >
                <span aria-hidden>{r.emoji}</span>
                <span>{r.count}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="cx-discuss-comment-actions">
          {isAuthenticated ? (
            <>
              <button
                type="button"
                className={`cx-discuss-action-link${pickerOpen ? " cx-discuss-action-link--active" : ""}${row.viewerReaction ? " cx-discuss-action-link--reacted" : ""}`}
                aria-expanded={pickerOpen}
                onClick={() => setReactionOpenId(pickerOpen ? null : row.id)}
              >
                {row.viewerReaction ? `${row.viewerReaction} Reacted` : "React"}
              </button>
              {!isReply ? (
                <button
                  type="button"
                  className={`cx-discuss-action-link${replyOpen ? " cx-discuss-action-link--active" : ""}`}
                  aria-expanded={replyOpen}
                  onClick={() => {
                    setReplyTargetId(replyOpen ? null : row.id);
                    setReplyDraft("");
                  }}
                >
                  Reply
                </button>
              ) : null}
            </>
          ) : (
            <span className="cx-discuss-signin-hint muted small">Sign in to react or reply</span>
          )}
        </div>

        {pickerOpen && isAuthenticated ? (
          <div className="cx-comment-reaction-picker cx-discuss-reaction-picker" role="listbox" aria-label="Pick a reaction">
            {COMMENT_REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`cx-comment-reaction-choice${row.viewerReaction === emoji ? " cx-comment-reaction-choice--active" : ""}`}
                aria-label={`React ${emoji}`}
                onClick={() => {
                  onPickReaction(row.id, row.viewerReaction === emoji ? null : emoji);
                  setReactionOpenId(null);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}

        {replyOpen && isAuthenticated ? (
          <form
            className="cx-comment-reply-form"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmitReply(row.id);
            }}
          >
            <textarea
              className="ig-post-comments-input cx-comment-reply-input"
              rows={2}
              maxLength={5000}
              placeholder={`Reply to ${name}… (Enter to post)`}
              value={replyDraft}
              onChange={(ev) => setReplyDraft(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && !ev.shiftKey) {
                  ev.preventDefault();
                  onSubmitReply(row.id);
                }
              }}
              autoFocus
            />
            <div className="cx-comment-reply-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setReplyTargetId(null);
                  setReplyDraft("");
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="ig-post-comments-submit"
                disabled={replyDraft.trim().length === 0}
              >
                Reply
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </article>
  );
}

export function PostCommentsPanel({
  postId,
  voteMode,
  isAuthenticated,
  meLabel,
  highlightCommentId = null,
  onClose,
}: Props) {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [showAllComments, setShowAllComments] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [localComments, setLocalComments] = useState<LocalCommentRow[]>([]);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [reactionOpenId, setReactionOpenId] = useState<string | null>(null);
  const [commentsLive, setCommentsLive] = useState<CommentRow[]>([]);
  const commentsLiveRef = useRef(commentsLive);
  commentsLiveRef.current = commentsLive;
  const discussListRef = useRef<HTMLUListElement>(null);
  const discussFeedEndRef = useRef<HTMLDivElement>(null);
  const pendingScrollAfterExpandRef = useRef(false);

  const [fetchComments, { data: commentsData, loading: commentsLoading, error: commentsQueryError }] =
    useLazyQuery<CommentsByPostQueryData>(COMMENTS_BY_POST, {
      fetchPolicy: "cache-and-network",
      nextFetchPolicy: "cache-first",
    });

  const [commentMut] = useMutation(COMMENT_POST);
  const [replyMut] = useMutation(COMMENT_POST);
  const [reactionMut] = useMutation(SET_COMMENT_REACTION);

  useEffect(() => {
    if (voteMode === "api") {
      void fetchComments({ variables: { postId } });
    }
  }, [voteMode, postId, fetchComments]);

  useEffect(() => {
    const serverRows = commentsData?.commentsByPost;
    if (!serverRows) return;
    setCommentsLive((prev) => {
      const pending = prev.filter((row) => row.id.startsWith("optimistic-"));
      if (pending.length === 0) return serverRows;
      const serverIds = new Set(serverRows.map((row) => row.id));
      const stillPending = pending.filter((row) => !serverIds.has(row.id));
      return [...stillPending, ...serverRows];
    });
  }, [commentsData?.commentsByPost]);

  const threads = useMemo(() => buildThreads(commentsLive), [commentsLive]);
  const displayedThreads = showAllComments
    ? threads
    : threads.slice(0, PREVIEW_THREAD_COUNT);

  useEffect(() => {
    if (!highlightCommentId || voteMode !== "api" || commentsLoading) return;
    const idx = threads.findIndex(
      (t) =>
        t.comment.id === highlightCommentId ||
        t.replies.some((r) => r.id === highlightCommentId),
    );
    if (idx >= PREVIEW_THREAD_COUNT && !showAllComments) setShowAllComments(true);
  }, [highlightCommentId, voteMode, commentsLoading, threads, showAllComments]);

  useEffect(() => {
    if (!highlightCommentId || commentsLoading) return;
    const el = document.getElementById(`comment-${highlightCommentId}`);
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("cx-comment-row--highlight");
    });
    const timer = window.setTimeout(() => {
      el.classList.remove("cx-comment-row--highlight");
    }, 3200);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [highlightCommentId, commentsLoading, displayedThreads, showAllComments]);

  const displayedLocalComments = showAllComments
    ? localComments
    : localComments.slice(0, PREVIEW_THREAD_COUNT);

  const buildAuthor = useCallback((): CommentAuthor | null => {
    if (!authUser) return null;
    return {
      id: authUser.id,
      username: authUser.username?.trim() || authUser.email.split("@")[0] || "user",
      displayName: authUser.displayName,
      profileImageUrl: authUser.profileImageUrl,
      email: authUser.email,
    };
  }, [authUser]);

  const hiddenThreadCount = showAllComments
    ? 0
    : Math.max(0, threads.length - displayedThreads.length);
  const hiddenLocalCount = showAllComments
    ? 0
    : Math.max(0, localComments.length - displayedLocalComments.length);
  const totalCommentCount =
    voteMode === "api" ? threads.length : localComments.length;
  const composerAuthor = buildAuthor();

  const handleToggleShowMore = useCallback(() => {
    setShowAllComments((expanded) => {
      if (!expanded) pendingScrollAfterExpandRef.current = true;
      return !expanded;
    });
  }, []);

  useEffect(() => {
    if (!showAllComments || !pendingScrollAfterExpandRef.current) return;
    pendingScrollAfterExpandRef.current = false;
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        const list = discussListRef.current;
        if (list) {
          list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
        }
        discussFeedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    });
    return () => {
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    };
  }, [showAllComments, displayedThreads.length, displayedLocalComments.length]);

  const buildOptimisticComment = useCallback(
    (content: string, parentId?: string): CommentRow | null => {
      const author = buildAuthor();
      if (!author) return null;
      return {
        id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        content,
        createdAt: new Date().toISOString(),
        postId,
        parentId: parentId ?? null,
        reactions: [],
        viewerReaction: null,
        author,
      };
    },
    [buildAuthor, postId],
  );

  const mergeServerComment = useCallback(
    (optimistic: CommentRow, server: Partial<CommentRow> & { id: string }): CommentRow => ({
      ...optimistic,
      ...server,
      author: server.author ?? optimistic.author,
      reactions: server.reactions ?? optimistic.reactions,
      viewerReaction: server.viewerReaction ?? optimistic.viewerReaction,
    }),
    [],
  );

  function onSubmitTopComment(e: React.FormEvent) {
    e.preventDefault();
    submitTopComment();
  }

  function submitTopComment() {
    setCommentError(null);
    const text = commentDraft.trim();
    if (!text) return;

    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    if (voteMode === "local") {
      setLocalComments((prev) => [
        {
          id: `local-${Date.now()}`,
          content: text,
          authorLabel: meLabel,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setCommentDraft("");
      return;
    }

    const optimistic = buildOptimisticComment(text);
    if (!optimistic) return;

    const snapshot = commentsLiveRef.current;
    setCommentsLive((prev) => [optimistic, ...prev]);
    setCommentDraft("");

    void commentMut({
      variables: {
        postId,
        input: { content: text },
      },
    })
      .then(({ data }) => {
        const created = data?.commentPost;
        if (!created?.id) return;
        setCommentsLive((prev) =>
          prev.map((row) =>
            row.id === optimistic.id ? mergeServerComment(optimistic, created) : row,
          ),
        );
      })
      .catch((err: unknown) => {
        setCommentsLive(snapshot);
        setCommentDraft(text);
        setCommentError(getApolloErrorMessage(err));
      });
  }

  function onSubmitReply(parentId: string) {
    setCommentError(null);
    const text = replyDraft.trim();
    if (!text) return;

    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    const optimistic = buildOptimisticComment(text, parentId);
    if (!optimistic) return;

    const snapshot = commentsLiveRef.current;
    setCommentsLive((prev) => [optimistic, ...prev]);
    setReplyDraft("");
    setReplyTargetId(null);
    setShowAllComments(true);

    void replyMut({
      variables: {
        postId,
        input: { content: text, parentId },
      },
    })
      .then(({ data }) => {
        const created = data?.commentPost;
        if (!created?.id) return;
        setCommentsLive((prev) =>
          prev.map((row) =>
            row.id === optimistic.id ? mergeServerComment(optimistic, created) : row,
          ),
        );
      })
      .catch((err: unknown) => {
        setCommentsLive(snapshot);
        setReplyDraft(text);
        setReplyTargetId(parentId);
        setCommentError(getApolloErrorMessage(err));
      });
  }

  function onPickReaction(commentId: string, emoji: string | null) {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    setCommentError(null);

    const snapshot = commentsLiveRef.current;
    setCommentsLive((prev) =>
      prev.map((row) => (row.id === commentId ? applyOptimisticReaction(row, emoji) : row)),
    );

    void reactionMut({
      variables: { commentId, emoji },
    })
      .then(({ data }) => {
        const updated = data?.setCommentReaction;
        if (!updated?.id) return;
        setCommentsLive((prev) =>
          prev.map((row) =>
            row.id === commentId
              ? {
                  ...row,
                  reactions: updated.reactions ?? row.reactions,
                  viewerReaction: updated.viewerReaction ?? null,
                }
              : row,
          ),
        );
      })
      .catch((err: unknown) => {
        setCommentsLive(snapshot);
        setCommentError(getApolloErrorMessage(err));
      });
  }

  return (
    <section className="ig-post-comments cx-discuss" aria-label="Discussion">
      <header className="cx-discuss-head ig-post-comments-head">
        <div className="cx-discuss-head-main">
          <h3 className="ig-post-comments-title">Discussion</h3>
          {totalCommentCount > 0 ? (
            <span className="cx-discuss-count-badge">{totalCommentCount}</span>
          ) : null}
        </div>
        <div className="cx-discuss-head-actions">
          {voteMode === "api" && commentsLoading ? (
            <span className="ig-post-comments-status">Loading…</span>
          ) : (
            <span className="cx-discuss-head-hint">Newest first</span>
          )}
          {onClose ? <DiscussHideButton onClose={onClose} /> : null}
        </div>
      </header>

      {voteMode === "api" && commentsQueryError ? (
        <p className="ig-post-comments-error" role="alert">
          {commentsQueryError.message}
        </p>
      ) : null}
      {commentError ? (
        <p className="ig-post-comments-error" role="alert">
          {commentError}
        </p>
      ) : null}

      {voteMode === "api" && commentsLoading && threads.length === 0 ? (
        <div className="cx-discuss-loading" aria-busy="true">
          <span className="cx-discuss-loading-bar" />
          <span className="cx-discuss-loading-bar cx-discuss-loading-bar--short" />
          <span className="cx-discuss-loading-bar" />
        </div>
      ) : null}

      {(voteMode === "api"
        ? threads.length === 0 && !commentsLoading
        : localComments.length === 0) ? (
        <div className="cx-discuss-empty ig-post-comments-empty">
          <span className="cx-discuss-empty-icon" aria-hidden>
            💬
          </span>
          <p>No comments yet</p>
          <span className="muted small">Start the conversation below your post.</span>
        </div>
      ) : null}

      {totalCommentCount > 0 ? (
        <div className="cx-discuss-feed">
          {voteMode === "api" ? (
            <ul
              ref={discussListRef}
              className="ig-post-comments-list cx-comment-thread-list cx-discuss-thread-list"
            >
              {displayedThreads.map(({ comment, replies }) => (
                <li key={comment.id} className="cx-comment-thread cx-discuss-thread">
                  <CommentItem
                    row={comment}
                    isAuthenticated={isAuthenticated}
                    reactionOpenId={reactionOpenId}
                    setReactionOpenId={setReactionOpenId}
                    replyTargetId={replyTargetId}
                    setReplyTargetId={setReplyTargetId}
                    replyDraft={replyDraft}
                    setReplyDraft={setReplyDraft}
                    onSubmitReply={onSubmitReply}
                    onPickReaction={onPickReaction}
                  />
                  {replies.length > 0 ? (
                    <div className="cx-comment-replies">
                      {replies.map((reply) => (
                        <CommentItem
                          key={reply.id}
                          row={reply}
                          isReply
                          isAuthenticated={isAuthenticated}
                          reactionOpenId={reactionOpenId}
                          setReactionOpenId={setReactionOpenId}
                          replyTargetId={replyTargetId}
                          setReplyTargetId={setReplyTargetId}
                          replyDraft={replyDraft}
                          setReplyDraft={setReplyDraft}
                          onSubmitReply={onSubmitReply}
                          onPickReaction={onPickReaction}
                        />
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <ul ref={discussListRef} className="ig-post-comments-list cx-discuss-thread-list">
              {displayedLocalComments.map((c) => (
                <li key={c.id} className="cx-discuss-thread cx-discuss-local-item">
                  <div className="cx-discuss-comment-head">
                    <span className="cx-comment-author">{c.authorLabel}</span>
                    <time className="cx-discuss-comment-time" dateTime={c.createdAt}>
                      {formatRelativeTime(c.createdAt) || "just now"}
                    </time>
                  </div>
                  <p className="cx-comment-body">{c.content}</p>
                </li>
              ))}
            </ul>
          )}

          <DiscussMoreButton
            expanded={showAllComments}
            hiddenCount={voteMode === "api" ? hiddenThreadCount : hiddenLocalCount}
            onToggle={handleToggleShowMore}
          />
          <div ref={discussFeedEndRef} className="cx-discuss-feed-anchor" aria-hidden />
        </div>
      ) : null}

      <footer className="cx-discuss-composer-wrap">
        <form className="cx-discuss-composer ig-post-comments-form" onSubmit={onSubmitTopComment}>
          <label className="ig-post-comments-label" htmlFor={`comment-${postId}`}>
            Add a comment
          </label>
          <div className="cx-discuss-composer-row">
            {composerAuthor ? (
              <CommentAvatar author={composerAuthor} />
            ) : (
              <span className="cx-discuss-composer-avatar-fallback" aria-hidden>
                ?
              </span>
            )}
            <textarea
              id={`comment-${postId}`}
              className="ig-post-comments-input cx-discuss-composer-input"
              rows={1}
              maxLength={5000}
              placeholder={
                isAuthenticated ? "Add a comment…" : "Sign in to comment…"
              }
              value={commentDraft}
              onChange={(ev) => setCommentDraft(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && !ev.shiftKey) {
                  ev.preventDefault();
                  submitTopComment();
                }
              }}
            />
            <button
              type="submit"
              className="ig-post-comments-submit cx-discuss-post-btn"
              disabled={commentDraft.trim().length === 0}
              aria-label="Post comment"
            >
              Post
            </button>
          </div>
        </form>
      </footer>
    </section>
  );
}
