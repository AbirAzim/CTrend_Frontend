import { useMutation } from "@apollo/client";
import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { GOOGLE_LOGIN, SIGNUP } from "../graphql/auth";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";


function formatAuthError(message: string | undefined): string {
  if (!message) return "Something went wrong.";
  return message;
}

export function SignupPage() {
  const { isAuthenticated, setSession } = useAuth(); // setSession used by Google login path
  const navigate = useNavigate();
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [signup, { loading: signupLoading }] = useMutation(SIGNUP);
  const [googleLogin, { loading: googleLoading }] = useMutation(GOOGLE_LOGIN);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (password !== confirm) {
      setFormError("Passwords do not match.");
      return;
    }
    try {
      await signup({
        variables: {
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
        },
      });
      navigate("/verify-email", { replace: true, state: { email: email.trim() } });
    } catch (err: unknown) {
      setFormError(formatAuthError(getApolloErrorMessage(err)));
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Sign up</h1>
        <p className="muted">
          Already have an account? <Link to="/login">Log in</Link>
        </p>

        <form onSubmit={onSignup} className="auth-form">
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
          <label className="field">
            <span>Display name (optional)</span>
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
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {signupLoading && <p className="muted small">Creating account…</p>}
          {formError != null && !signupLoading && (
            <p className="error" role="alert">
              {formError}
            </p>
          )}
          <button
            type="submit"
            className="btn-primary"
            disabled={signupLoading}
          >
            Create account
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        {googleClientId ? (
          <div className="google-row">
            <GoogleLogin
              text="signup_with"
              width="100%"
              onSuccess={async (cred) => {
                setFormError(null);
                if (!cred.credential) {
                  setFormError("Google did not return a credential.");
                  return;
                }
                try {
                  const { data } = await googleLogin({
                    variables: { idToken: cred.credential },
                  });
                  const payload = data?.googleLogin;
                  if (!payload?.accessToken || !payload.user) {
                    setFormError("Invalid response from server.");
                    return;
                  }
                  setSession(payload.accessToken, payload.user);
                  navigate("/", { replace: true });
                } catch (err: unknown) {
                  setFormError(formatAuthError(getApolloErrorMessage(err)));
                }
              }}
              onError={() => setFormError("Google sign-in was cancelled or failed.")}
              useOneTap={false}
            />
            {googleLoading && (
              <p className="muted small">Completing Google sign-in…</p>
            )}
          </div>
        ) : (
          <p className="muted small">
            Google sign-in is disabled until you set{" "}
            <code>VITE_GOOGLE_CLIENT_ID</code> in <code>.env</code>.
          </p>
        )}
      </div>
    </div>
  );
}
