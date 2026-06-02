import { useEffect, useState } from "react";

const MOBILE_SHELL_QUERY = "(max-width: 768px), (hover: none) and (pointer: coarse)";

/** True on phone browsers and touch-first viewports (matches app shell mobile rules). */
export function useMobileShell(): boolean {
  const [mobileShell, setMobileShell] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(MOBILE_SHELL_QUERY).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_SHELL_QUERY);
    const sync = () => setMobileShell(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return mobileShell;
}
