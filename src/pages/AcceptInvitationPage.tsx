import { useMutation } from "@apollo/client";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ACCEPT_INVITATION } from "../graphql/auth";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";

export function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { setSession } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [acceptInvitation, { loading }] = useMutation(ACCEPT_INVITATION);

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Invalid link</h1>
          <p className="error" role="alert">
            Invalid invitation link. Please ask your inviter to resend the invitation.
          </p>
        </div>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    try {
      const { data } = await acceptInvitation({
        variables: {
          token,
          password,
          displayName: displayName.trim() || undefined,
        },
      });
      const payload = data?.acceptInvitation;
      if (!payload?.accessToken || !payload.user) {
        setFormError("Invalid response from server.");
        return;
      }
      setSession(payload.accessToken, payload.user);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const msg = getApolloErrorMessage(err);
      if (msg.includes("Invalid or expired invitation")) {
        setFormError("This invitation has expired or is no longer valid.");
      } else if (msg.includes("An account with this email already exists")) {
        setFormError("An account already exists for this email. Please log in.");
      } else if (msg.includes("Password must be at least 8 characters")) {
        setFormError("Password must be at least 8 characters.");
      } else {
        setFormError(msg);
      }
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Set up your account</h1>
        <p className="muted">You've been invited to join Ke Jitbe. Create a password to get started.</p>

        <form onSubmit={(ev) => void onSubmit(ev)} className="auth-form">
          <label className="field">
            <span>Display name <span className="muted small">(optional)</span></span>
            <input
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className="field">
            <span>Confirm password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>

          {formError && (
            <p className="error" role="alert">
              {formError}
            </p>
          )}
          {loading && <p className="muted small">Setting up your account…</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            Create account
          </button>
        </form>
      </div>
    </div>
  );
}
