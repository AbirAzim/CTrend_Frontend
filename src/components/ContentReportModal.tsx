import { useApolloClient } from "@apollo/client";
import { useState } from "react";
import {
  CONTENT_REPORT_REASONS,
  type ContentReportReasonId,
} from "../lib/contentReport";
import { submitContentReport } from "../lib/submitContentReport";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";

type Props = {
  open: boolean;
  onClose: () => void;
  targetType: "post" | "comment" | "user";
  targetId: string;
  reporterLabel: string;
  contextUrl?: string;
  onSubmitted?: () => void;
};

export function ContentReportModal({
  open,
  onClose,
  targetType,
  targetId,
  reporterLabel,
  contextUrl,
  onSubmitted,
}: Props) {
  const client = useApolloClient();
  const [reasonId, setReasonId] = useState<ContentReportReasonId>("spam");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await submitContentReport(client, {
        targetType,
        targetId,
        reasonId,
        details,
        reporterLabel,
        contextUrl,
      });
      setSuccess(true);
      onSubmitted?.();
    } catch (err: unknown) {
      setError(getApolloErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (submitting) return;
    setSuccess(false);
    setError(null);
    setDetails("");
    setReasonId("spam");
    onClose();
  }

  return (
    <div
      className="cx-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="content-report-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="cx-modal-card content-report-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cx-modal-head">
          <h2 id="content-report-title" className="cx-modal-title">
            Report content
          </h2>
          <button
            type="button"
            className="cx-modal-close"
            onClick={handleClose}
            aria-label="Close"
            disabled={submitting}
          >
            ✕
          </button>
        </div>

        {success ? (
          <div className="cx-modal-body content-report-success">
            <p className="content-report-success-text">
              <strong>Thank you.</strong> Your report was sent to our moderation team. We
              typically review reports within a few business days.
            </p>
            <button type="button" className="btn-primary" onClick={handleClose}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)}>
            <div className="cx-modal-body">
              <p className="content-report-intro">
                Reports are reviewed by CTrend moderators. Abuse of reporting may lead to account
                action.
              </p>

              <fieldset className="content-report-reasons-field">
                <legend className="cx-edit-label">Reason</legend>
                <div className="content-report-reasons" role="radiogroup" aria-label="Report reason">
                  {CONTENT_REPORT_REASONS.map((r) => {
                    const selected = reasonId === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`content-report-reason${selected ? " is-selected" : ""}`}
                        onClick={() => setReasonId(r.id)}
                        disabled={submitting}
                      >
                        <span className="content-report-reason-radio" aria-hidden />
                        <span>{r.label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label className="cx-edit-label">
                Additional details (optional)
                <textarea
                  className="cx-edit-textarea content-report-textarea"
                  rows={4}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Tell us what is wrong with this content…"
                  disabled={submitting}
                  maxLength={1000}
                />
              </label>

              {error ? <p className="form-error">{error}</p> : null}
            </div>

            <div className="cx-modal-footer">
              <button type="button" className="btn-ghost" onClick={handleClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Sending…" : "Submit report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
