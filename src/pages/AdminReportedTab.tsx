import { useMutation, useQuery } from "@apollo/client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ADMIN_CONTENT_REPORTS,
  ADMIN_REPORTED_POSTS,
  ADMIN_REPORTED_POSTS_COUNT,
} from "../graphql/contentReports";
import { DELETE_POST } from "../graphql/feed";
import { contentReportReasonLabel } from "../lib/contentReport";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { formatRelativeTime } from "../lib/formatRelativeTime";

const PAGE_SIZE = 20;

type ReportedPost = {
  id: string;
  caption?: string | null;
  imageUrls?: string[] | null;
  createdAt: string;
  reportCount: number;
  authorUsername?: string | null;
  authorDisplayName?: string | null;
  category?: { name: string } | null;
  options?: Array<{ label: string; imageUrl?: string | null }> | null;
};

type ContentReportRow = {
  id: string;
  reasonId: string;
  details?: string | null;
  reporterUsername?: string | null;
  reporterDisplayName?: string | null;
  createdAt: string;
};

export function AdminReportedTab() {
  const navigate = useNavigate();
  const [skip, setSkip] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ReportedPost | null>(null);
  const [reportsPost, setReportsPost] = useState<ReportedPost | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const listFilter = useMemo(
    () => ({
      search: searchTerm.trim() || undefined,
      minReportCount: 1,
      sortBy: "reportCount",
      sortOrder: "desc",
    }),
    [searchTerm],
  );

  useEffect(() => {
    setSkip(0);
  }, [searchTerm]);

  const { data, loading, error, refetch } = useQuery<{
    adminReportedPosts: ReportedPost[];
  }>(ADMIN_REPORTED_POSTS, {
    variables: { query: listFilter, skip, take: PAGE_SIZE },
    fetchPolicy: "network-only",
  });

  const { data: countData, refetch: refetchCount } = useQuery<{
    adminReportedPostsCount: number;
  }>(ADMIN_REPORTED_POSTS_COUNT, {
    variables: { filter: { search: listFilter.search, minReportCount: 1 } },
    fetchPolicy: "cache-and-network",
  });

  const { data: reportsData, loading: reportsLoading } = useQuery<{
    adminContentReports: ContentReportRow[];
  }>(ADMIN_CONTENT_REPORTS, {
    variables: { postId: reportsPost?.id ?? "", take: 50 },
    skip: !reportsPost,
    fetchPolicy: "network-only",
  });

  const [deletePostMut, { loading: deleting }] = useMutation(DELETE_POST);

  const posts = data?.adminReportedPosts ?? [];
  const total = countData?.adminReportedPostsCount ?? posts.length;
  const reports = reportsData?.adminContentReports ?? [];

  async function handleDelete(post: ReportedPost) {
    setDeleteError(null);
    try {
      await deletePostMut({ variables: { postId: post.id } });
      setDeleteTarget(null);
      if (posts.length === 1 && skip > 0) {
        setSkip((s) => Math.max(0, s - PAGE_SIZE));
      } else {
        void refetch();
      }
      void refetchCount();
    } catch (err: unknown) {
      setDeleteError(getApolloErrorMessage(err));
      setDeleteTarget(null);
    }
  }

  return (
    <div className="admin-tab-panel">
      <header className="admin-section-head">
        <div>
          <h2 className="admin-section-title">Reported posts</h2>
          <p className="muted small">
            Review user reports, check counts, and remove posts that violate community standards.
          </p>
        </div>
      </header>

      <div className="admin-posts-summary">
        <div className="admin-posts-summary-card">
          <span className="admin-posts-summary-label">Reported posts</span>
          <strong className="admin-posts-summary-value">{total.toLocaleString()}</strong>
        </div>
        <div className="admin-posts-summary-card">
          <span className="admin-posts-summary-label">On this page</span>
          <strong className="admin-posts-summary-value">{posts.length.toLocaleString()}</strong>
        </div>
      </div>

      <div className="admin-toolbar admin-toolbar--posts">
        <div className="admin-toolbar-search-wrap">
          <span className="admin-toolbar-search-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="search"
            className="admin-toolbar-input admin-toolbar-search"
            placeholder="Search caption or option labels…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search reported posts"
          />
        </div>
      </div>

      {error ? (
        <p className="error" role="alert">
          {getApolloErrorMessage(error)}
        </p>
      ) : null}
      {deleteError ? (
        <p className="error" role="alert">
          {deleteError}
        </p>
      ) : null}

      {loading && posts.length === 0 ? <p className="muted">Loading reported posts…</p> : null}
      {!loading && posts.length === 0 ? (
        <p className="muted">No reported posts yet.</p>
      ) : null}

      {posts.length > 0 ? (
        <div className="admin-table-wrap admin-table-wrap--posts">
          <table className="admin-table admin-table--stack admin-table--posts">
            <thead>
              <tr>
                <th>Post</th>
                <th>Author</th>
                <th>Reports</th>
                <th>Category</th>
                <th>Created</th>
                <th className="admin-table-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => {
                const caption = post.caption?.trim() || "(No caption)";
                const preview = caption.length > 48 ? `${caption.slice(0, 48)}…` : caption;
                const author =
                  post.authorDisplayName?.trim() || post.authorUsername || "—";
                return (
                  <tr key={post.id} className="admin-table-row">
                    <td data-label="Post">
                      <strong>{preview}</strong>
                      <span className="muted small admin-post-id">
                        {post.id.slice(0, 10)}…
                      </span>
                    </td>
                    <td data-label="Author">{author}</td>
                    <td data-label="Reports">
                      <span className="admin-report-count-badge">
                        🚩 {post.reportCount}
                      </span>
                    </td>
                    <td data-label="Category">{post.category?.name ?? "—"}</td>
                    <td data-label="Created">{formatRelativeTime(post.createdAt)}</td>
                    <td className="admin-table-actions" data-label="Actions">
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="btn-ghost small"
                          onClick={() => navigate(`/post/${post.id}`)}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className="btn-ghost small"
                          onClick={() => setReportsPost(post)}
                        >
                          Reports
                        </button>
                        <button
                          type="button"
                          className="btn-danger small"
                          onClick={() => setDeleteTarget(post)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {total > PAGE_SIZE ? (
        <div className="admin-pagination">
          <button
            type="button"
            className="btn-ghost"
            disabled={skip === 0}
            onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}
          >
            Previous
          </button>
          <span className="muted small">
            {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} of {total}
          </span>
          <button
            type="button"
            className="btn-ghost"
            disabled={skip + PAGE_SIZE >= total}
            onClick={() => setSkip((s) => s + PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      ) : null}

      {reportsPost
        ? createPortal(
            <div
              className="cx-modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-reports-detail-title"
              onClick={(e) => {
                if (e.target === e.currentTarget) setReportsPost(null);
              }}
            >
              <div
                className="cx-modal-card admin-reports-detail-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="admin-reports-detail-shell">
                  <div className="cx-modal-head admin-reports-detail-head">
                    <h2 id="admin-reports-detail-title" className="cx-modal-title">
                      Reports for post
                    </h2>
                    <button
                      type="button"
                      className="cx-modal-close"
                      onClick={() => setReportsPost(null)}
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="cx-modal-body admin-reports-detail-body">
                    <div className="admin-reports-detail-post">
                      <p className="admin-reports-detail-caption">
                        {reportsPost.caption?.trim() || reportsPost.id}
                      </p>
                      <span className="admin-report-count-badge">
                        🚩 {reportsPost.reportCount} report
                        {reportsPost.reportCount === 1 ? "" : "s"}
                      </span>
                    </div>

                    {reportsLoading ? <p className="muted">Loading reports…</p> : null}
                    {!reportsLoading && reports.length === 0 ? (
                      <p className="muted">No report details found.</p>
                    ) : null}

                    <ul className="admin-report-detail-list">
                      {reports.map((r) => (
                        <li key={r.id} className="admin-report-detail-item">
                          <p className="admin-report-detail-reason">
                            {contentReportReasonLabel(r.reasonId)}
                          </p>
                          <p className="admin-report-detail-reporter">
                            Reported by{" "}
                            <span>{r.reporterDisplayName || r.reporterUsername || "User"}</span>
                          </p>
                          <time className="admin-report-detail-time" dateTime={r.createdAt}>
                            {formatRelativeTime(r.createdAt)}
                          </time>
                          {r.details ? (
                            <p className="admin-report-detail-notes">{r.details}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="cx-modal-footer admin-reports-detail-footer">
                    <button type="button" className="btn-ghost" onClick={() => setReportsPost(null)}>
                      Close
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        const id = reportsPost.id;
                        setReportsPost(null);
                        navigate(`/post/${id}`);
                      }}
                    >
                      Open post
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {deleteTarget
        ? createPortal(
            <div
              className="cx-modal-overlay"
              role="dialog"
              aria-modal="true"
              onClick={(e) => {
                if (!deleting && e.target === e.currentTarget) setDeleteTarget(null);
              }}
            >
              <div
                className="cx-modal-card admin-reports-detail-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="admin-reports-detail-shell">
                  <div className="cx-modal-head admin-reports-detail-head">
                    <h2 className="cx-modal-title">Delete reported post?</h2>
                  </div>
                  <div className="cx-modal-body">
                    <p className="content-report-intro">
                      Remove this post permanently? It had{" "}
                      <strong>{deleteTarget.reportCount}</strong> report
                      {deleteTarget.reportCount === 1 ? "" : "s"}.
                    </p>
                  </div>
                  <div className="cx-modal-footer admin-reports-detail-footer">
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={deleting}
                      onClick={() => setDeleteTarget(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      disabled={deleting}
                      onClick={() => void handleDelete(deleteTarget)}
                    >
                      {deleting ? "Deleting…" : "Delete post"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
