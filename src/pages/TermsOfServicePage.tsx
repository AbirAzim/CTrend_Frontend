import { Link } from "react-router-dom";

const APP_NAME = "Ke Jitbe";
const COMPANY_NAME = "CTrend";
const DEVELOPER_NAME = "Abir Azim Badhon";
const OPERATOR_COUNTRY = "Bangladesh";
const APP_DOMAIN = "kejitbe.app";
const EFFECTIVE_DATE = "June 5, 2026";
const CONTACT_EMAIL =
  import.meta.env.VITE_PRIVACY_CONTACT_EMAIL ?? `support@${APP_DOMAIN}`;

export function TermsOfServicePage() {
  return (
    <div className="legal-page">
      <article className="legal-card">
        <header className="legal-header">
          <Link to="/" className="legal-home">
            ← {APP_NAME}
          </Link>
          <h1>Terms of Service</h1>
          <p className="legal-meta">
            Effective date: {EFFECTIVE_DATE} · Last updated: {EFFECTIVE_DATE}
          </p>
        </header>

        <div className="legal-body">
          <p>
            These Terms of Service (“Terms”) govern your access to and use of{" "}
            <strong>{APP_NAME}</strong>, operated by <strong>{COMPANY_NAME}</strong> (“we”,
            “us”, “our”), including our website at {APP_DOMAIN} and our mobile applications
            (together, the “Service”). Ke Jitbe is offered to users <strong>worldwide</strong>,
            subject to these Terms, our <Link to="/privacy">Privacy Policy</Link>, and applicable
            law. By creating an account or using the Service, you agree to these Terms. If you do
            not agree, do not use the Service.
          </p>

          <h2>1. Eligibility</h2>
          <p>
            You must be at least <strong>13 years old</strong> to use Ke Jitbe (or older if your
            country or region requires a higher minimum age). By using the Service, you represent
            that you meet this age requirement and have the legal capacity to enter into these
            Terms. If you are under 18, you should use the Service only with permission from a
            parent or guardian.
          </p>
          <p>
            You are responsible for ensuring that your use of the Service is lawful in your
            country or region. We may restrict access in certain locations if required by law or
            if providing the Service there is not commercially or technically feasible.
          </p>

          <h2>2. The Service</h2>
          <p>
            Ke Jitbe is a global social comparison platform where users can post side-by-side
            image comparisons, vote on options, follow friends, send direct messages, and receive
            notifications about activity. The Service is available internationally via our website
            and mobile apps (including distribution on Google Play and similar stores). Features
            may change, be added, or removed over time. We may suspend or discontinue parts of the
            Service for maintenance, security, legal compliance, or operational reasons.
          </p>

          <h2>3. Your account</h2>
          <ul>
            <li>
              You are responsible for keeping your login credentials confidential and for all
              activity under your account.
            </li>
            <li>
              You agree to provide accurate information when registering and to keep your profile
              information up to date where possible.
            </li>
            <li>
              You may sign up with email and password or, where available, Google Sign-In. Use
              of Google Sign-In is also subject to Google’s terms and policies.
            </li>
            <li>
              You may not create accounts through automated means, impersonate another person,
              or use a username that infringes someone else’s rights or is misleading or
              offensive.
            </li>
            <li>
              Notify us promptly at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> if you believe your
              account has been compromised.
            </li>
          </ul>

          <h2>4. User content</h2>
          <p>
            “User content” means posts (including images, captions, and poll options), votes,
            comments, reactions, messages, profile information, and other material you submit
            through the Service.
          </p>
          <ul>
            <li>
              <strong>Your ownership:</strong> You retain ownership of content you create. We do
              not claim ownership of your content.
            </li>
            <li>
              <strong>License to us:</strong> By posting content, you grant {COMPANY_NAME} a
              non-exclusive, worldwide, royalty-free license to host, store, reproduce, display,
              and distribute your content solely to operate, promote, and improve the Service
              (for example, showing your post in the feed or to your friends).
            </li>
            <li>
              <strong>Visibility:</strong> Posts and public profile information are visible to
              other users according to how the Service works. Direct messages are visible to
              recipients.
            </li>
            <li>
              <strong>Responsibility:</strong> You are solely responsible for content you post
              and for ensuring you have the rights to use any images or material you upload.
            </li>
          </ul>

          <h2>5. Acceptable use</h2>
          <p>You agree not to use the Service to:</p>
          <ul>
            <li>Post spam, scams, or misleading content</li>
            <li>Harass, bully, threaten, or hate against individuals or groups</li>
            <li>Share violence, dangerous acts, or content that promotes harm</li>
            <li>Share sexual or nudity content, or any content involving minors</li>
            <li>Infringe copyright, trademark, or other intellectual property rights</li>
            <li>Impersonate another person, brand, or organisation</li>
            <li>Manipulate votes, use bots, or interfere with polls or rankings</li>
            <li>Collect other users’ data without permission or send unsolicited messages</li>
            <li>Upload malware, attempt to hack, or disrupt the Service or its users</li>
            <li>Violate any applicable law or regulation</li>
          </ul>
          <p>
            We may remove content, restrict features, or suspend or terminate accounts that
            violate these rules or that we reasonably believe harm the community or the Service.
          </p>

          <h2>6. Reporting and moderation</h2>
          <p>
            Signed-in users can report posts they believe violate these Terms using the{" "}
            <strong>Report</strong> option in the post menu. Reports are reviewed by CTrend
            moderators. We are not obligated to monitor all content but may act on reports,
            legal requests, or our own review. Moderation decisions are made at our discretion.
          </p>

          <h2>7. Voting and polls</h2>
          <p>
            Voting features are provided for entertainment and community engagement. You agree
            not to use automated tools, multiple accounts, or other methods to distort results.
            Poll deadlines and results are displayed as provided by the Service; we do not
            guarantee uninterrupted availability of live vote updates.
          </p>

          <h2>8. Fees and advertising</h2>
          <p>
            Ke Jitbe is currently offered <strong>free of charge</strong> and does{" "}
            <strong>not display third-party advertisements</strong> in the app. We may introduce
            paid features or change pricing in the future; if we do, we will provide notice as
            required by law or platform rules before charges apply to you.
          </p>

          <h2>9. Third-party services</h2>
          <p>
            The Service may integrate with third-party services such as Google Sign-In and
            Firebase Cloud Messaging (push notifications). Your use of those services is subject
            to the third party’s terms and privacy policies. We are not responsible for
            third-party services we do not control.
          </p>

          <h2>10. Termination</h2>
          <p>
            You may stop using the Service at any time. We may suspend or terminate your access
            if you breach these Terms, if required by law, or to protect users or the Service.
            Upon termination, your right to use the Service ends, but sections that by their
            nature should survive (such as disclaimers and limitations of liability) will
            continue to apply.
          </p>

          <h2>11. Account and data deletion</h2>
          <p>
            To request deletion of your account and associated personal data, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the address linked to
            your account (or explain your situation if you no longer have access). We will verify
            your request and process deletion within a reasonable period, except where we must
            retain certain information for legal, security, or backup purposes. See our{" "}
            <Link to="/privacy">Privacy Policy</Link> for more on data rights.
          </p>

          <h2>12. Disclaimers</h2>
          <p>
            The Service is provided <strong>“as is”</strong> and <strong>“as available”</strong>
            . To the fullest extent permitted by law, we disclaim all warranties, express or
            implied, including merchantability, fitness for a particular purpose, and
            non-infringement. We do not guarantee that the Service will be uninterrupted,
            error-free, or secure, or that content on the Service is accurate or complete.
          </p>

          <h2>13. Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, {COMPANY_NAME} and its operators will not
            be liable for any indirect, incidental, special, consequential, or punitive damages,
            or any loss of profits, data, or goodwill, arising from your use of the Service or
            user content posted by others. Our total liability for any claim relating to the
            Service is limited to the greater of (a) the amount you paid us in the twelve months
            before the claim (typically zero for the free Service) or (b) one hundred US dollars
            (USD $100), unless applicable law requires otherwise.
          </p>

          <h2>14. Indemnity</h2>
          <p>
            You agree to indemnify and hold harmless {COMPANY_NAME} from claims, damages, and
            expenses (including reasonable legal fees) arising from your use of the Service, your
            user content, or your violation of these Terms or any third party’s rights.
          </p>

          <h2>15. Worldwide service, local laws, and disputes</h2>
          <p>
            {COMPANY_NAME} ({DEVELOPER_NAME}, {OPERATOR_COUNTRY}) operates the Service
            worldwide. These Terms are governed by the laws of{" "}
            <strong>{OPERATOR_COUNTRY}</strong>, without regard to conflict-of-law principles,
            except where mandatory consumer or data-protection laws in your country give you
            rights that cannot be waived by contract.
          </p>
          <p>
            You agree to comply with all applicable local laws when using the Service (including
            laws on content, privacy, and online conduct). If a dispute arises, we encourage you
            to contact us first at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Subject to mandatory local
            law, courts in {OPERATOR_COUNTRY} have non-exclusive jurisdiction over disputes
            relating to these Terms or the Service.
          </p>

          <h2>16. Changes to these Terms</h2>
          <p>
            We may update these Terms from time to time. We will post the revised Terms on this
            page and update the “Last updated” date. Material changes may also be communicated
            through the Service where appropriate. Continued use after changes take effect means
            you accept the updated Terms.
          </p>

          <h2>17. Contact</h2>
          <p>
            Questions about these Terms? Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </div>

        <footer className="legal-footer">
          <Link to="/">Back to {APP_NAME}</Link>
          {" · "}
          <Link to="/privacy">Privacy Policy</Link>
          {" · "}
          <Link to="/credits">Credits &amp; team</Link>
          {" · "}
          <Link to="/login">Log in</Link>
          {" · "}
          <Link to="/signup">Sign up</Link>
        </footer>
      </article>
    </div>
  );
}
