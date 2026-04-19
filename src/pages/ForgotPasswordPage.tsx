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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await requestReset({ variables: { email: email.trim() } });
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
          <p className="muted">
            If <strong>{email}</strong> is registered, you&apos;ll receive a
            password reset link shortly.
          </p>
          <p className="muted small" style={{ marginTop: "1.5rem", textAlign: "center" }}>
            <Link to="/login">Back to log in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Forgot password?</h1>
        <p className="muted">
          Enter your email and we&apos;ll send you a reset link.
        </p>

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
          {loading && <p className="muted small">Sending…</p>}
          {formError != null && !loading && (
            <p className="error" role="alert">
              {formError}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={loading}>
            Send reset link
          </button>
        </form>

        <p className="muted small" style={{ marginTop: "1rem", textAlign: "center" }}>
          <Link to="/login">Back to log in</Link>
        </p>
      </div>
    </div>
  );
}
