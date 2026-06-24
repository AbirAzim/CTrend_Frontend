import { useMutation } from "@apollo/client";
import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { GOOGLE_LOGIN, LOGIN } from "../graphql/auth";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { PasswordField } from "../components/PasswordField";
import { AppDownloadPromo } from "../components/AppDownloadPromo";
import {
  getNativeGoogleIdToken,
  isNativeGoogleAuthAvailable,
} from "../lib/nativeGoogleAuth";

function formatAuthError(message: string | undefined): string {
  if (!message) return "Something went wrong.";
  return message;
}

export function LoginPage() {
  const { isAuthenticated, setSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from ?? "/";

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
  const canUseNativeGoogle = isNativeGoogleAuthAvailable(googleClientId);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [login, { loading: loginLoading }] = useMutation(LOGIN);
  const [googleLogin, { loading: googleLoading }] = useMutation(GOOGLE_LOGIN);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function onEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const { data } = await login({
        variables: { email: email.trim(), password },
      });
      const payload = data?.login;
      if (!payload?.accessToken || !payload.user) {
        setFormError("Invalid response from server.");
        return;
      }
      setSession(payload.accessToken, payload.user);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setFormError(formatAuthError(getApolloErrorMessage(err)));
    }
  }

  async function onNativeGoogleLogin() {
    setFormError(null);
    try {
      const idToken = await getNativeGoogleIdToken(googleClientId);
      if (!idToken) {
        setFormError("Google did not return a credential.");
        return;
      }
      const { data } = await googleLogin({
        variables: { idToken },
      });
      const payload = data?.googleLogin;
      if (!payload?.accessToken || !payload.user) {
        setFormError("Invalid response from server.");
        return;
      }
      setSession(payload.accessToken, payload.user);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setFormError(formatAuthError(getApolloErrorMessage(err)));
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Log in</h1>
        <p className="muted">
          New here? <Link to="/signup">Create an account</Link>
        </p>

        <form onSubmit={onEmailLogin} className="auth-form">
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
            <span>Password</span>
            <PasswordField
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <p className="auth-forgot">
            <Link to="/forgot-password">Forgot password?</Link>
          </p>
          {loginLoading && <p className="muted small">Signing in…</p>}
          {formError != null && !loginLoading && (
            <p className="error" role="alert">
              {formError}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={loginLoading}>
            Continue
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        {googleClientId ? (
          <div className="google-row">
            {canUseNativeGoogle ? (
              <button
                type="button"
                className="btn-primary"
                onClick={onNativeGoogleLogin}
                disabled={googleLoading}
              >
                Continue with Google
              </button>
            ) : (
              <GoogleLogin
                text="signin_with"
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
                    navigate(from, { replace: true });
                  } catch (err: unknown) {
                    setFormError(formatAuthError(getApolloErrorMessage(err)));
                  }
                }}
                onError={() =>
                  setFormError("Google sign-in was cancelled or failed.")
                }
                useOneTap={false}
              />
            )}
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

        <AppDownloadPromo variant="card" />
      </div>
    </div>
  );
}
