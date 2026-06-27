import { useMutation } from "@apollo/client";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { RESEND_VERIFICATION_EMAIL, VERIFY_EMAIL } from "../graphql/auth";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export function VerifyEmailPage() {
  const { isAuthenticated, setSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const email =
    (location.state as { email?: string; referralCode?: string } | null)?.email?.trim().toLowerCase() ??
    searchParams.get("email")?.trim().toLowerCase() ??
    "";
  const referralCode =
    (location.state as { email?: string; referralCode?: string } | null)?.referralCode ?? "";

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [formError, setFormError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendSent, setResendSent] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [verifyEmail, { loading: verifying }] = useMutation(VERIFY_EMAIL);
  const [resendVerification, { loading: resending }] = useMutation(RESEND_VERIFICATION_EMAIL);

  useEffect(() => {
    inputRefs.current[0]?.focus();
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  if (isAuthenticated) return <Navigate to="/" replace />;
  if (!email) return <Navigate to="/signup" replace />;

  const code = digits.join("");

  function focusAt(index: number) {
    inputRefs.current[Math.max(0, Math.min(CODE_LENGTH - 1, index))]?.focus();
  }

  function handleChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < CODE_LENGTH - 1) focusAt(index + 1);
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index]) {
        const next = [...digits];
        next[index] = "";
        setDigits(next);
      } else {
        focusAt(index - 1);
      }
    } else if (e.key === "ArrowLeft") {
      focusAt(index - 1);
    } else if (e.key === "ArrowRight") {
      focusAt(index + 1);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    const next = Array(CODE_LENGTH).fill("");
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    focusAt(Math.min(pasted.length, CODE_LENGTH - 1));
  }

  function startCooldown() {
    setResendCooldown(RESEND_COOLDOWN);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const { data } = await verifyEmail({
        variables: {
          email,
          code,
          referralCode: referralCode.trim() || undefined,
        },
      });
      const payload = data?.verifyEmail;
      if (!payload?.accessToken || !payload.user) {
        setFormError("Invalid response from server.");
        return;
      }
      setSession(payload.accessToken, payload.user);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      setFormError(getApolloErrorMessage(err) ?? "Verification failed.");
    }
  }

  async function onResend() {
    setFormError(null);
    setResendSent(false);
    try {
      await resendVerification({ variables: { email } });
      setResendSent(true);
      startCooldown();
    } catch (err: unknown) {
      setFormError(getApolloErrorMessage(err) ?? "Could not resend code.");
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Verify your email</h1>
        <p className="muted">
          We sent a 6-digit code to <strong>{email}</strong>. Enter it below to
          activate your account.
          {referralCode ? (
            <>
              {" "}
              Your referral code <strong>{referralCode}</strong> will be applied after verification.
            </>
          ) : null}
        </p>

        <form onSubmit={onVerify} className="auth-form">
          <div className="otp-field">
            <span className="otp-label">Verification code</span>
            <div className="otp-boxes">
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  className="otp-box"
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={handlePaste}
                  onFocus={(e) => e.target.select()}
                  aria-label={`Digit ${i + 1}`}
                />
              ))}
            </div>
          </div>

          {verifying && <p className="muted small">Verifying…</p>}
          {formError != null && !verifying && (
            <p className="error" role="alert">
              {formError}
            </p>
          )}
          {resendSent && (
            <p className="muted small" role="status">
              A new code was sent to {email}.
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={verifying || code.length < CODE_LENGTH}>
            Verify email
          </button>
        </form>

        <div className="auth-resend-row">
          <span className="muted small">Didn&apos;t get the email?</span>
          <button
            type="button"
            className="btn-ghost"
            onClick={onResend}
            disabled={resending || resendCooldown > 0}
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
          </button>
        </div>

        <p className="muted small" style={{ marginTop: "1rem", textAlign: "center" }}>
          Wrong email? <Link to="/signup">Go back to sign up</Link>
        </p>
      </div>
    </div>
  );
}
