type IconProps = { size?: number; active?: boolean };

export function IconHome({ size = 26, active }: IconProps) {
  if (active) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M22 10v9a2 2 0 0 1-2 2h-5v-7H9v7H4a2 2 0 0 1-2-2v-9l10-8 10 8z"
        />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z" />
    </svg>
  );
}

export function IconSearch({ size = 26 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

export function IconMessages({ size = 26, active }: IconProps) {
  if (active) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"
        />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function IconPlusSquare({ size = 26 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

export function IconReels({ size = 26 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <rect x="2" y="5" width="14" height="14" rx="2" />
      <path d="m22 8-4 3v6l4 3V8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconShield({ size = 26, active }: IconProps) {
  if (active) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M12 2 4 5v6.5c0 5 3.5 9.4 8 10.5 4.5-1.1 8-5.5 8-10.5V5l-8-3zm0 5.2 4.5 4.5-5.6 5.6-3.4-3.4 1.4-1.4 2 2 4.2-4.2-3.1-3.1z"
        />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3 4.5 5.7v6.3c0 4.4 3.1 8.4 7.5 9.5 4.4-1.1 7.5-5.1 7.5-9.5V5.7L12 3z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function IconUser({ size = 26, active }: IconProps) {
  if (active) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-8 2-8 4v2h16v-2c0-2-4-4-8-4z"
        />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M6 20v-1c0-3 3-5 6-5s6 2 6 5v1" />
    </svg>
  );
}

export function IconUsers({ size = 26 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="9" cy="8" r="3.4" />
      <path d="M3.5 19.5v-.8c0-2.6 2.5-4.2 5.5-4.2s5.5 1.6 5.5 4.2v.8" />
      <path d="M16 5.2a3.4 3.4 0 0 1 0 6.4" />
      <path d="M17.5 14.4c2 .5 3.5 1.8 3.5 3.9v1.2" />
    </svg>
  );
}

export function IconHeart({ size = 26, filled }: IconProps & { filled?: boolean }) {
  if (filled) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M12 21.35c-.29 0-.58-.1-.8-.3l-1.55-1.4C5.08 15.53 2 12.74 2 9.25 2 6.42 4.2 4.2 7.03 4.2c1.67 0 3.28.78 4.3 2.02A5.75 5.75 0 0 1 15.64 4.2C18.46 4.2 20.7 6.42 20.7 9.25c0 3.49-3.08 6.28-7.66 10.4l-1.56 1.4c-.22.2-.5.3-.8.3z"
        />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path d="M12 20.2 10.6 18.93C6.31 15.08 3.5 12.52 3.5 9.5a3.5 3.5 0 0 1 3.53-3.55c1.26 0 2.48.6 3.27 1.55l1.2 1.46 1.2-1.46a4.2 4.2 0 0 1 3.27-1.55A3.5 3.5 0 0 1 19.5 9.5c0 3.03-2.81 5.58-7.1 9.43L12 20.2z" />
    </svg>
  );
}

export function IconComment({ size = 26 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path d="M5 6.5h14a2.5 2.5 0 0 1 2.5 2.5v6a2.5 2.5 0 0 1-2.5 2.5H11l-4.7 3.6c-.63.48-1.55.03-1.55-.76V17.5A2.5 2.5 0 0 1 2.5 15V9A2.5 2.5 0 0 1 5 6.5z" />
      <path d="M7 11.5h10M7 14.5h6" />
    </svg>
  );
}

/** Open full post / external link style. */
export function IconOpenPost({ size = 26 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </svg>
  );
}

export function IconShare({ size = 26 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
    </svg>
  );
}

export function IconBookmark({ size = 26, filled }: IconProps & { filled?: boolean }) {
  if (filled) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M6 2h12a2 2 0 0 1 2 2v18l-8-5-8 5V4a2 2 0 0 1 2-2z"
        />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path d="M6 2h12a2 2 0 0 1 2 2v18l-8-5-8 5V4a2 2 0 0 1 2-2z" />
    </svg>
  );
}

export function IconMore({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="6" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function IconChevronUp({
  size = 22,
  active,
}: IconProps & { active?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

export function IconChevronDown({
  size = 22,
  active,
}: IconProps & { active?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconLogout({ size = 18 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}

export function IconEdit({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function IconLock({ size = 12 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/** Mark notification as read. */
export function IconMarkRead({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconArchive({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}
