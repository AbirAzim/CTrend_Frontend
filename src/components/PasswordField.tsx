import { useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

function IconEye({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <path d="M6.61 6.61A18.5 18.5 0 0 0 1 12s4 8 11 8a9.12 9.12 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

/**
 * Password input with a show/hide toggle. Spreads all standard input props
 * (value, onChange, autoComplete, required, minLength, …); the `type` is
 * controlled internally. The toggle is `tabIndex={-1}` so tabbing flows
 * straight from the field to the submit button.
 */
export function PasswordField({ className, ...props }: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className="cx-password-field">
      <input
        {...props}
        type={show ? "text" : "password"}
        className={className}
      />
      <button
        type="button"
        className="cx-password-toggle"
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
      >
        {show ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  );
}
