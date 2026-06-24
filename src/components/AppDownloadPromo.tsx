/** Play Store URL for the Ke Jitbe Android app. */
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.ctrend.app";

/**
 * "Get the Android app" promo: QR code on the left, app logo + "Get it on
 * Google Play" badge on the right.
 * - Desktop: QR (scan) + badge (click).
 * - Phones (QR useless): the QR is hidden via CSS; the badge opens the Play Store.
 */
export function AppDownloadPromo({
  variant = "card",
}: {
  variant?: "card" | "compact";
}) {
  return (
    <div className={`app-promo app-promo--${variant}`}>
      <div className="app-promo-text">
        <div className="app-promo-head">
          <img className="app-promo-logo" src="/logo.png" alt="" />
          <span className="app-promo-title">Get the Android app</span>
        </div>
        <span className="app-promo-sub">Scan the QR, or tap to install.</span>
        <a
          className="app-promo-badge"
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img src="/google-play-badge.png" alt="Get it on Google Play" />
        </a>
      </div>

      <a
        className="app-promo-qr"
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Download Ke Jitbe on Google Play"
      >
        <img src="/playstore-qr.svg" alt="Play Store QR code for Ke Jitbe" />
      </a>
    </div>
  );
}
