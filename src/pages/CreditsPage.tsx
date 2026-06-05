import { Link } from "react-router-dom";
import {
  APP_NAME,
  COMPANY_NAME,
  KEJITBE_DEVELOPERS,
  KEJITBE_PRODUCERS,
  PRIMARY_CONTACT_EMAIL,
} from "../lib/teamCredits";

function TeamMemberCard({
  name,
  role,
  email,
}: {
  name: string;
  role: string;
  email: string;
}) {
  return (
    <li className="credits-member-card">
      <strong className="credits-team-name">{name}</strong>
      <span className="credits-team-role">{role}</span>
      <a className="credits-team-email" href={`mailto:${email}`}>
        {email}
      </a>
    </li>
  );
}

export function CreditsPage() {
  return (
    <div className="legal-page">
      <article className="legal-card credits-card">
        <header className="legal-header">
          <Link to="/" className="legal-home">
            ← {APP_NAME}
          </Link>
          <h1>Credits &amp; legal</h1>
          <p className="legal-meta">{COMPANY_NAME} · Privacy, terms, and support</p>
        </header>

        <div className="legal-body credits-body">
          <section className="credits-primary">
            <h2>Legal</h2>
            <div className="credits-link-grid">
              <Link to="/privacy" className="credits-link-card">
                <span className="credits-link-title">Privacy Policy</span>
                <span className="credits-link-hint">How we handle your data</span>
              </Link>
              <Link to="/terms" className="credits-link-card">
                <span className="credits-link-title">Terms of Service</span>
                <span className="credits-link-hint">Rules for using Ke Jitbe</span>
              </Link>
            </div>
          </section>

          <section className="credits-primary">
            <h2>Support</h2>
            <p className="credits-support-text">
              Questions, account help, or data requests? Email us and we will respond as soon as
              we can.
            </p>
            <a className="credits-support-email" href={`mailto:${PRIMARY_CONTACT_EMAIL}`}>
              {PRIMARY_CONTACT_EMAIL}
            </a>
          </section>

          <section className="credits-team-footer" aria-labelledby="credits-team-heading">
            <div className="credits-team-divider" aria-hidden />
            <h2 id="credits-team-heading" className="credits-team-heading">
              Credits
            </h2>
            <p className="credits-team-intro">
              {APP_NAME} is operated by {COMPANY_NAME}. Thank you to everyone who helped build
              and produce the app.
            </p>

            <h3 className="credits-team-subheading">Producers</h3>
            <ul className="credits-team-list">
              {KEJITBE_PRODUCERS.map((member) => (
                <TeamMemberCard
                  key={member.id}
                  name={member.name}
                  role="Producer"
                  email={member.email}
                />
              ))}
            </ul>

            <h3 className="credits-team-subheading">Developers</h3>
            <ul className="credits-team-list">
              {KEJITBE_DEVELOPERS.map((member) => (
                <TeamMemberCard
                  key={member.id}
                  name={member.name}
                  role="Developer"
                  email={member.email}
                />
              ))}
            </ul>
          </section>
        </div>

        <footer className="legal-footer">
          <Link to="/">Back to {APP_NAME}</Link>
          {" · "}
          <Link to="/privacy">Privacy</Link>
          {" · "}
          <Link to="/terms">Terms</Link>
        </footer>
      </article>
    </div>
  );
}
