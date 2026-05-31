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

type Props = {
  postId: string;
  voteMode: "api" | "local";
  isAuthenticated: boolean;
  meLabel: string;
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
    <article className={`cx-comment-row${isReply ? " cx-comment-row--reply" : ""}`}>
      <CommentAvatar author={row.author} />
      <div className="cx-comment-main">
        <div className="cx-comment-bubble">
          <Link to={`/profile/${row.author.id}`} className="cx-comment-author">
            {name}
          </Link>
          <p className="cx-comment-body">{row.content}</p>
        </div>
        <div className="cx-comment-meta">
          <time dateTime={row.createdAt}>{formatRelativeTime(row.createdAt) || "just now"}</time>
          {isAuthenticated ? (
            <>
              <button
                type="button"
                className="cx-comment-action-btn"
                aria-expanded={pickerOpen}
                onClick={() => setReactionOpenId(pickerOpen ? null : row.id)}
              >
                {row.viewerReaction ? `${row.viewerReaction} Reacted` : "React"}
              </button>
              {!isReply ? (
                <button
                  type="button"
                  className="cx-comment-action-btn"
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
          ) : null}
        </div>

        {row.reactions.length > 0 ? (
          <div className="cx-comment-reactions" aria-label="Reactions">
            {row.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                className={`cx-comment-reaction-pill${row.viewerReaction === r.emoji ? " cx-comment-reaction-pill--mine" : ""}`}
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

        {pickerOpen && isAuthenticated ? (
          <div className="cx-comment-reaction-picker" role="listbox" aria-label="Pick a reaction">
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
              placeholder={`Reply to ${name}…`}
              value={replyDraft}
              onChange={(ev) => setReplyDraft(ev.target.value)}
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

export function PostCommentsPanel({ postId, voteMode, isAuthenticated, meLabel }: Props) {
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

  const [fetchComments, { data: commentsData, loading: commentsLoading, error: commentsQueryError }] =
    useLazyQuery<CommentsByPostQueryData>(COMMENTS_BY_POST, { fetchPolicy: "network-only" });

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
      return [...serverRows, ...stillPending];
    });
  }, [commentsData?.commentsByPost]);

  const threads = useMemo(() => buildThreads(commentsLive), [commentsLive]);
  const displayedThreads = showAllComments ? threads : threads.slice(0, 2);
  const hasMoreThreads = threads.length > 2;

  const displayedLocalComments = showAllComments ? localComments : localComments.slice(0, 2);
  const hasMoreLocalComments = localComments.length > 2;

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
    setCommentsLive((prev) => [...prev, optimistic]);
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
    setCommentsLive((prev) => [...prev, optimistic]);
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
    <section className="ig-post-comments" aria-label="Comments">
      <div className="ig-post-comments-head">
        <h3 className="ig-post-comments-title">Comments</h3>
        {voteMode === "api" && commentsLoading ? (
          <span className="ig-post-comments-status">Loading…</span>
        ) : null}
      </div>

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

      {voteMode === "api" ? (
        <ul className="ig-post-comments-list cx-comment-thread-list">
          {displayedThreads.map(({ comment, replies }) => (
            <li key={comment.id} className="cx-comment-thread">
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
        <ul className="ig-post-comments-list">
          {displayedLocalComments.map((c) => (
            <li key={c.id} className="ig-post-comment">
              <span className="ig-post-comment-author">{c.authorLabel}</span>
              <p className="ig-post-comment-body">{c.content}</p>
              <time className="ig-post-comment-time" dateTime={c.createdAt}>
                {formatRelativeTime(c.createdAt) || "just now"}
              </time>
            </li>
          ))}
        </ul>
      )}

      {(voteMode === "api" ? hasMoreThreads : hasMoreLocalComments) ? (
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setShowAllComments((v) => !v)}
        >
          {showAllComments ? "Show less" : "Show more"}
        </button>
      ) : null}

      {(voteMode === "api"
        ? threads.length === 0 && !commentsLoading
        : localComments.length === 0) ? (
        <p className="ig-post-comments-empty muted">No comments yet — say something fun.</p>
      ) : null}

      <form className="ig-post-comments-form" onSubmit={onSubmitTopComment}>
        <label className="ig-post-comments-label" htmlFor={`comment-${postId}`}>
          Add a comment
        </label>
        <textarea
          id={`comment-${postId}`}
          className="ig-post-comments-input"
          rows={2}
          maxLength={5000}
          placeholder={isAuthenticated ? "Share your take…" : "Sign in to comment…"}
          value={commentDraft}
          onChange={(ev) => setCommentDraft(ev.target.value)}
        />
        <button
          type="submit"
          className="ig-post-comments-submit"
          disabled={commentDraft.trim().length === 0}
        >
          Post
        </button>
      </form>
    </section>
  );
}
