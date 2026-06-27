import { useMutation } from "@apollo/client";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { RESET_PASSWORD } from "../graphql/auth";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { PasswordField } from "../components/PasswordField";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [resetPassword, { loading }] = useMutation(RESET_PASSWORD);

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Invalid link</h1>
          <p className="muted">
            This reset link is missing or expired.{" "}
            <Link to="/forgot-password">Request a new one</Link>.
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Password updated</h1>
          <p className="auth-lead muted">
            Your password has been reset and your email is verified. You can log in now.
          </p>
          <p className="muted small" style={{ marginTop: "1.5rem", textAlign: "center" }}>
            <Link to="/login">Log in with your new password</Link>
          </p>
        </div>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (password !== confirm) {
      setFormError("Passwords do not match.");
      return;
    }
    try {
      await resetPassword({ variables: { token, newPassword: password } });
      setDone(true);
    } catch (err: unknown) {
      setFormError(getApolloErrorMessage(err) ?? "Something went wrong.");
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Reset password</h1>
        <p className="muted">Enter and confirm your new password.</p>

        <form onSubmit={onSubmit} className="auth-form">
          <label className="field">
            <span>New password</span>
            <PasswordField
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <PasswordField
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {loading && <p className="muted small">Updating password…</p>}
          {formError != null && !loading && (
            <p className="error" role="alert">
              {formError}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={loading}>
            Set new password
          </button>
        </form>
      </div>
    </div>
  );
}
