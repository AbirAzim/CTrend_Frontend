import { useMutation } from "@apollo/client";
import { useState } from "react";
import { Link } from "react-router-dom";
import { REQUEST_PASSWORD_RESET } from "../graphql/auth";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [requestReset, { loading }] = useMutation(REQUEST_PASSWORD_RESET);
  const trimmedEmail = email.trim().toLowerCase();
  const verifyHref = trimmedEmail
    ? `/verify-email?email=${encodeURIComponent(trimmedEmail)}`
    : "/verify-email";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await requestReset({ variables: { email: trimmedEmail } });
      setSubmitted(true);
    } catch (err: unknown) {
      setFormError(getApolloErrorMessage(err) ?? "Something went wrong.");
    }
  }

  if (submitted) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Check your email</h1>
          <p className="auth-lead muted">
            If <strong>{trimmedEmail}</strong> is registered for email sign-in,
            you&apos;ll receive a reset link shortly.
          </p>
          <div className="auth-callout">
            Open the link to set a new password. If you never verified your account,
            completing the reset also confirms your email.
          </div>
          <p className="auth-footer-link">
            <Link to="/login">← Back to log in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Forgot password?</h1>
        <p className="auth-lead muted">
          Enter your account email and we&apos;ll send a secure link to choose a new password.
        </p>
        <div className="auth-callout">
          <strong>Email sign-in only.</strong> If you use Google, go back and tap{" "}
          <strong>Continue with Google</strong> instead.
        </div>

        <form onSubmit={onSubmit} className="auth-form">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          {loading && <p className="muted small">Sending reset link…</p>}
          {formError != null && !loading && (
            <p className="error" role="alert">
              {formError}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={loading}>
            Send reset link
          </button>
        </form>

        <p className="auth-footer-link">
          <Link to="/login" className="btn-ghost auth-switch-btn">← Back to log in</Link>
        </p>
        <div className="auth-switch-row">
          <p className="muted small">Have a code already?</p>
          <Link to={verifyHref} className="btn-ghost auth-switch-btn">
            Verify email
          </Link>
        </div>
      </div>
    </div>
  );
}
