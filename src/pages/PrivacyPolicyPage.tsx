import { Link } from "react-router-dom";

const APP_NAME = "Ke Jitbe";
const OPERATOR_NAME = "CTrend";
const OPERATOR_COUNTRY = "Bangladesh";
const APP_DOMAIN = "kejitbe.app";
const EFFECTIVE_DATE = "June 5, 2026";
const CONTACT_EMAIL =
  import.meta.env.VITE_PRIVACY_CONTACT_EMAIL ?? `support@${APP_DOMAIN}`;

export function PrivacyPolicyPage() {
  return (
    <div className="legal-page">
      <article className="legal-card">
        <header className="legal-header">
          <Link to="/" className="legal-home">
            ← {APP_NAME}
          </Link>
          <h1>Privacy Policy</h1>
          <p className="legal-meta">
            Effective date: {EFFECTIVE_DATE} · Last updated: {EFFECTIVE_DATE}
          </p>
        </header>

        <div className="legal-body">
          <p>
            This Privacy Policy describes how <strong>{APP_NAME}</strong>, operated by{" "}
            <strong>{OPERATOR_NAME}</strong> (“we”, “us”, “our”), collects, uses, and shares
            information when you use our website and mobile applications (together, the
            “Service”). Ke Jitbe is available to users <strong>worldwide</strong>. By creating
            an account or using the Service, you agree to this policy and our{" "}
            <Link to="/terms">Terms of Service</Link>.
          </p>

          <h2>1. Who we are</h2>
          <p>
            <strong>{OPERATOR_NAME}</strong>, based in <strong>{OPERATOR_COUNTRY}</strong>,
            operates <strong>{APP_NAME}</strong> ({APP_DOMAIN}) — a global social comparison
            platform where users post side-by-side image comparisons, vote on options, follow
            friends, send messages, and receive notifications. This policy applies to all users of
            the Service, regardless of where you live.
          </p>

          <h2>2. Information we collect</h2>

          <h3>2.1 Information you provide</h3>
          <ul>
            <li>
              <strong>Account data:</strong> email address, password (stored hashed on our
              servers — we never store plain-text passwords), username, display name, and
              optional profile photo.
            </li>
            <li>
              <strong>User content:</strong> posts (images, captions, poll options), votes,
              comments, reactions, messages you send to other users, and friend connections.
            </li>
            <li>
              <strong>Communications:</strong> if you contact us for support, we receive the
              content of your message and your contact details.
            </li>
          </ul>

          <h3>2.2 Information collected automatically</h3>
          <ul>
            <li>
              <strong>Device and push tokens:</strong> if you enable notifications on our
              mobile app, we store a push notification token and platform identifier (e.g.
              Android) so we can deliver alerts about votes, comments, messages, and other
              activity.
            </li>
            <li>
              <strong>Usage and logs:</strong> our servers may log IP address, request
              timestamps, and error diagnostics to keep the Service secure and reliable.
            </li>
            <li>
              <strong>Local storage (web):</strong> when you use the website, we store your
              session token and basic profile data in your browser’s local storage so you
              remain signed in.
            </li>
          </ul>

          <h3>2.3 Information from third parties</h3>
          <ul>
            <li>
              <strong>Google Sign-In:</strong> if you choose “Continue with Google”, we
              receive your Google account email, name, and profile picture URL from Google,
              subject to Google’s privacy policy.
            </li>
          </ul>

          <h2>3. How we use your information</h2>
          <p>We use the information above to:</p>
          <ul>
            <li>Create and manage your account and authenticate you</li>
            <li>Display your profile, posts, votes, and messages to you and other users</li>
            <li>Deliver in-app and push notifications you expect (e.g. new votes, comments, messages)</li>
            <li>Operate friend requests, admin features, campaigns, and moderation tools</li>
            <li>Improve, secure, and troubleshoot the Service</li>
            <li>Comply with legal obligations and enforce our terms</li>
          </ul>

          <h2>4. How we share information</h2>
          <p>We do not sell your personal information. We may share data:</p>
          <ul>
            <li>
              <strong>With other users:</strong> content you post publicly (feed posts,
              profile name, avatar) is visible to other users according to the Service’s
              design. Direct messages are shared with the recipient(s).
            </li>
            <li>
              <strong>With service providers</strong> that help us run the Service, including:
              <ul>
                <li>Cloud hosting for our API and media storage</li>
                <li>Google (Sign-In authentication)</li>
                <li>Firebase Cloud Messaging (push notifications on Android)</li>
              </ul>
              These providers process data only to perform services on our behalf.
            </li>
            <li>
              <strong>For legal reasons:</strong> if required by law, court order, or to
              protect the rights, safety, and security of users or the public.
            </li>
          </ul>

          <h2>5. Data retention</h2>
          <p>
            We keep your account and content for as long as your account is active. You may
            request account and data deletion at any time by emailing{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We will remove or
            anonymise personal data within a reasonable period, except where we must retain
            certain records for legal, security, or backup purposes.
          </p>

          <h2>6. Your choices and rights</h2>
          <ul>
            <li>
              <strong>Profile:</strong> you can update your display name, username, and
              profile photo in the app settings.
            </li>
            <li>
              <strong>Notifications:</strong> you can control notification permissions in
              your device settings (mobile) and mute certain activity in the app where
              supported.
            </li>
            <li>
              <strong>Report content:</strong> signed-in users can report posts they believe
              violate our rules via the post menu. Reports are reviewed by CTrend moderators.
            </li>
            <li>
              <strong>Access, correction, deletion:</strong> email us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> to request access to,
              correction of, or deletion of your personal data. Users in the European Economic
              Area, United Kingdom, and other regions with privacy laws may have additional
              rights (such as data portability or objection to certain processing). We will
              respond within a reasonable time and in line with applicable law.
            </li>
          </ul>

          <h2>7. Security</h2>
          <p>
            We use industry-standard measures such as HTTPS for data in transit and
            access-controlled servers. No method of transmission or storage is 100% secure;
            please use a strong, unique password and keep your login credentials private.
          </p>

          <h2>8. Children</h2>
          <p>
            Ke Jitbe is intended for users aged <strong>13 and older</strong>. We do not
            knowingly collect personal information from children under 13. If you believe a
            child under 13 has provided us data, contact us and we will delete it.
          </p>

          <h2>9. Community standards and moderation</h2>
          <p>
            Ke Jitbe allows user-generated content (posts, comments, messages). We review
            reports submitted in the app and may remove content or restrict accounts that
            violate our community standards, including spam, harassment, hate, violence,
            sexual content involving minors, or copyright infringement. To report a post, tap
            <strong> Report</strong> in the post menu while signed in.
          </p>

          <h2>10. International users and data transfers</h2>
          <p>
            {OPERATOR_NAME} is based in {OPERATOR_COUNTRY}, but Ke Jitbe is used by people
            around the world. Our servers and service providers (for example cloud hosting in
            the United States or other regions) may process your information outside your home
            country. Those locations may have different data protection laws than where you live.
          </p>
          <p>
            Where required, we rely on appropriate safeguards for international transfers (such as
            standard contractual clauses or equivalent mechanisms). If you have questions about
            how your data is handled in your region, contact{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>

          <h2>11. Changes to this policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will post the revised
            policy on this page and update the “Last updated” date. Continued use of the
            Service after changes means you accept the updated policy.
          </p>

          <h2>12. Contact us</h2>
          <p>
            Questions about this Privacy Policy or your data? Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </div>

        <footer className="legal-footer">
          <Link to="/">Back to {APP_NAME}</Link>
          {" · "}
          <Link to="/terms">Terms of Service</Link>
          {" · "}
          <Link to="/login">Log in</Link>
          {" · "}
          <Link to="/signup">Sign up</Link>
        </footer>
      </article>
    </div>
  );
}
