import { Link } from "react-router-dom";

const APP_NAME = "Ke Jitbe";
const COMPANY_NAME = "CTrend";
const DEVELOPER_NAME = "Abir Azim Badhon";
const OPERATOR_COUNTRY = "Bangladesh";
const APP_DOMAIN = "kejitbe.app";
const EFFECTIVE_DATE = "June 5, 2026";
const CONTACT_EMAIL =
  import.meta.env.VITE_PRIVACY_CONTACT_EMAIL ?? `support@${APP_DOMAIN}`;

export function ChildSafetyPage() {
  return (
    <div className="legal-page">
      <article className="legal-card">
        <header className="legal-header">
          <Link to="/" className="legal-home">
            ← {APP_NAME}
          </Link>
          <h1>Child Safety Standards</h1>
          <p className="legal-meta">
            Effective date: {EFFECTIVE_DATE} · Last updated: {EFFECTIVE_DATE}
          </p>
        </header>

        <div className="legal-body">
          <p>
            <strong>{APP_NAME}</strong>, operated by <strong>{COMPANY_NAME}</strong> (
            {DEVELOPER_NAME}, based in {OPERATOR_COUNTRY}), has a{" "}
            <strong>zero-tolerance policy</strong> toward child sexual abuse and exploitation
            (CSAE) and child sexual abuse material (CSAM). These standards explain how we
            prohibit, prevent, detect, and respond to CSAE on the Service, and how anyone can
            report it to us. They apply to all users worldwide and form part of our{" "}
            <Link to="/terms">Terms of Service</Link> and{" "}
            <Link to="/privacy">Privacy Policy</Link>.
          </p>

          <h2>1. Our commitment</h2>
          <p>
            We are committed to keeping children safe and to preventing our platform from being
            used to create, store, share, solicit, or promote CSAE/CSAM. Content or conduct that
            sexualizes, exploits, endangers, or abuses minors is strictly forbidden and will be
            removed. Offending accounts are terminated, and we report apparent CSAM to the
            appropriate authorities.
          </p>

          <h2>2. Minimum age</h2>
          <p>
            {APP_NAME} is intended for users aged <strong>13 and older</strong>. We do not allow
            children under 13 to create accounts, and we do not knowingly collect personal
            information from them. If we learn that an under-13 user has registered, we remove the
            account and associated data.
          </p>

          <h2>3. Prohibited content and conduct</h2>
          <p>The following are strictly prohibited on {APP_NAME}:</p>
          <ul>
            <li>Child sexual abuse material (CSAM) in any form, real or computer-generated</li>
            <li>Sexualization of minors, including suggestive depictions or captions</li>
            <li>
              Grooming, solicitation, sextortion, or attempts to arrange sexual contact with a
              minor
            </li>
            <li>Trafficking, endangerment, or other exploitation of children</li>
            <li>Sharing, linking to, or promoting any of the above</li>
          </ul>

          <h2>4. How we prevent and detect abuse</h2>
          <ul>
            <li>
              <strong>Clear rules:</strong> our Terms of Service prohibit CSAE/CSAM and abusive
              behavior toward minors.
            </li>
            <li>
              <strong>In-app reporting:</strong> any signed-in user can report a post or content
              they believe violates these standards via the <strong>Report</strong> option in the
              post menu.
            </li>
            <li>
              <strong>Human review &amp; removal:</strong> {COMPANY_NAME} moderators review
              reports and can remove violating content and suspend or permanently ban accounts.
            </li>
            <li>
              <strong>Account enforcement:</strong> we take action on accounts that violate these
              standards, including immediate termination for CSAE.
            </li>
          </ul>

          <h2>5. How to report child safety concerns</h2>
          <p>
            <strong>In the app:</strong> open the post menu (the “⋯” icon) and tap{" "}
            <strong>Report</strong>. Reports are sent to our moderation team for review.
          </p>
          <p>
            <strong>By email:</strong> to report CSAE/CSAM or any child safety concern directly to
            our designated point of contact, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Please include links or
            usernames where possible so we can act quickly. Our point of contact is able to speak
            to our CSAM prevention practices and compliance.
          </p>

          <h2>6. How we respond</h2>
          <ul>
            <li>We review reports of child safety violations as a priority.</li>
            <li>We remove violating content and terminate accounts responsible for CSAE/CSAM.</li>
            <li>
              We report apparent CSAM and related offenses to the relevant regional and national
              authorities and child-protection organizations as required by applicable law.
            </li>
            <li>
              We preserve relevant information where legally required to support investigations.
            </li>
          </ul>

          <h2>7. Compliance with child safety laws</h2>
          <p>
            {COMPANY_NAME} complies with all applicable child safety laws in the markets where{" "}
            {APP_NAME} is available, including obligations to report child sexual abuse material to
            regional and national authorities. We also align our practices with Google Play’s child
            safety standards policy and applicable industry standards against CSAE.
          </p>

          <h2>8. Designated point of contact</h2>
          <p>
            Child safety point of contact:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. This contact is responsible for
            questions about our CSAM prevention practices and compliance, and for receiving child
            safety reports.
          </p>

          <h2>9. Changes to these standards</h2>
          <p>
            We may update these Child Safety Standards from time to time. We will post the revised
            version on this page and update the “Last updated” date above.
          </p>
        </div>

        <footer className="legal-footer">
          <Link to="/">Back to {APP_NAME}</Link>
          {" · "}
          <Link to="/privacy">Privacy Policy</Link>
          {" · "}
          <Link to="/terms">Terms of Service</Link>
          {" · "}
          <Link to="/credits">Credits &amp; team</Link>
        </footer>
      </article>
    </div>
  );
}
