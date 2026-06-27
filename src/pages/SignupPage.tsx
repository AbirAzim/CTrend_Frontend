import { useMutation, useQuery } from "@apollo/client";
import { useEffect, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { GOOGLE_LOGIN, SIGNUP } from "../graphql/auth";
import { INVITATION_SIGNUP_INFO } from "../graphql/referrals";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { PasswordField } from "../components/PasswordField";
import {
  getNativeGoogleIdToken,
  isNativeGoogleAuthAvailable,
} from "../lib/nativeGoogleAuth";


function formatAuthError(message: string | undefined): string {
  if (!message) return "Something went wrong.";
  return message;
}

export function SignupPage() {
  const { isAuthenticated, setSession } = useAuth(); // setSession used by Google login path
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("token");
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
  const canUseNativeGoogle = isNativeGoogleAuthAvailable(googleClientId);

  const [email, setEmail] = useState(() => searchParams.get("email")?.trim().toLowerCase() ?? "");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [referralCode, setReferralCode] = useState(
    () => (searchParams.get("referralCode") ?? "").trim().toUpperCase(),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [inviteBanner, setInviteBanner] = useState(() => Boolean(searchParams.get("email")));

  const [signup, { loading: signupLoading }] = useMutation(SIGNUP);
  const [googleLogin, { loading: googleLoading }] = useMutation(GOOGLE_LOGIN);
  const { data: inviteInfo, loading: loadingInvite, error: inviteError } = useQuery<{
    invitationSignupInfo: { email: string; referralCode: string; role: string };
  }>(INVITATION_SIGNUP_INFO, {
    variables: { token: inviteToken! },
    skip: !inviteToken || Boolean(searchParams.get("email")),
  });

  useEffect(() => {
    const info = inviteInfo?.invitationSignupInfo;
    if (!info) return;
    if (info.role === "admin") {
      navigate(`/accept-invitation?token=${encodeURIComponent(inviteToken!)}`, { replace: true });
      return;
    }
    setEmail(info.email);
    setReferralCode(info.referralCode.toUpperCase());
    setInviteBanner(true);
  }, [inviteInfo, inviteToken, navigate]);

  useEffect(() => {
    if (inviteError) {
      setFormError("This invitation link has expired or is no longer valid.");
    }
  }, [inviteError]);

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
      navigate("/verify-email", {
        replace: true,
        state: {
          email: email.trim(),
          referralCode: referralCode.trim().toUpperCase() || undefined,
        },
      });
    } catch (err: unknown) {
      setFormError(formatAuthError(getApolloErrorMessage(err)));
    }
  }

  async function onNativeGoogleSignup() {
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
      navigate("/", { replace: true });
    } catch (err: unknown) {
      setFormError(formatAuthError(getApolloErrorMessage(err)));
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Sign up</h1>
        {inviteBanner ? (
          <div className="auth-callout">
            You&apos;ve been invited to Ke Jitbe — finish creating your account below.
          </div>
        ) : null}
        {loadingInvite ? <p className="muted small">Loading your invitation…</p> : null}
        <div className="auth-switch-row">
          <p className="muted">Already have an account?</p>
          <Link to="/login" className="btn-ghost auth-switch-btn">
            Log in
          </Link>
        </div>

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
            <PasswordField
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className="field">
            <span>Confirm password</span>
            <PasswordField
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className="field">
            <span>Referral code (optional)</span>
            <input
              type="text"
              autoComplete="off"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              placeholder="From your invite email"
              maxLength={12}
            />
          </label>
          {signupLoading && <p className="muted small">Creating account…</p>}
          {formError != null && !signupLoading && (
            <p className="error" role="alert">
              {formError}
            </p>
          )}
          <div className="auth-legal">
            <p className="auth-legal-text muted small">
              By creating an account, you agree to:
            </p>
            <div className="auth-legal-actions">
              <Link to="/terms" className="btn-ghost auth-legal-btn">
                Terms of Service
              </Link>
              <Link to="/privacy" className="btn-ghost auth-legal-btn">
                Privacy Policy
              </Link>
            </div>
          </div>
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
            {canUseNativeGoogle ? (
              <button
                type="button"
                className="btn-primary"
                onClick={onNativeGoogleSignup}
                disabled={googleLoading}
              >
                Continue with Google
              </button>
            ) : (
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
      </div>
    </div>
  );
}
