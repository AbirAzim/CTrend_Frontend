import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useMutation, useQuery, useSubscription } from "@apollo/client";
import {
  DELETE_MATCH_PREDICTION,
  MATCH_PREDICTION_STATE,
  MATCH_PREDICTION_UPDATED,
  MATCH_PREDICTION_WINNERS,
  MATCH_PREDICTIONS,
  SUBMIT_MATCH_PREDICTION,
} from "../graphql/predictions";
import { useAuth } from "../context/AuthContext";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { normalizeProfileImageUrl } from "../lib/profileImageUrl";

type PredUser = {
  id: string;
  username?: string | null;
  displayName?: string | null;
  profileImageUrl?: string | null;
};
type Prediction = {
  id: string;
  homeScore: number;
  awayScore: number;
  createdAt: string;
  isWinner: boolean;
  user?: PredUser | null;
};
type StateData = {
  matchPredictionState: {
    count: number;
    predictionsOpen: boolean;
    predictionsResolved: boolean;
    myPrediction: Prediction | null;
  };
};

function predName(u?: PredUser | null): string {
  if (!u) return "User";
  return u.displayName?.trim() || (u.username ? `@${u.username.trim()}` : "User");
}

export function MatchPrediction({
  postId,
  homeTeam,
  awayTeam,
  enabled,
}: {
  postId: string;
  homeTeam: string;
  awayTeam: string;
  enabled: boolean;
}) {
  const { isAuthenticated } = useAuth();
  const { data, refetch } = useQuery<StateData>(MATCH_PREDICTION_STATE, {
    variables: { postId },
    skip: !enabled,
    fetchPolicy: "cache-and-network",
  });

  useSubscription(MATCH_PREDICTION_UPDATED, {
    variables: { postId },
    skip: !enabled,
    onData: () => void refetch(),
  });

  const [submit, { loading: submitting }] = useMutation(SUBMIT_MATCH_PREDICTION);
  const [remove, { loading: removing }] = useMutation(DELETE_MATCH_PREDICTION);

  const [editing, setEditing] = useState(false);
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [showWinners, setShowWinners] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const state = data?.matchPredictionState;
  const mine = state?.myPrediction ?? null;
  const open = !!state?.predictionsOpen;
  const resolved = !!state?.predictionsResolved;
  const count = state?.count ?? 0;

  // Whether the inline score form is showing (new prediction or editing).
  const formOpen = open && (editing || !mine);

  function startEdit() {
    setHome(mine ? String(mine.homeScore) : "");
    setAway(mine ? String(mine.awayScore) : "");
    setError(null);
    setEditing(true);
  }

  async function onSubmit() {
    const h = parseInt(home, 10);
    const a = parseInt(away, 10);
    if (Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) {
      setError("Enter a score for both teams.");
      return;
    }
    setError(null);
    try {
      await submit({ variables: { postId, homeScore: h, awayScore: a } });
      setEditing(false);
      void refetch();
    } catch (err) {
      setError(getApolloErrorMessage(err));
    }
  }

  async function onDelete() {
    try {
      await remove({ variables: { postId } });
      setEditing(false);
      void refetch();
    } catch (err) {
      setError(getApolloErrorMessage(err));
    }
  }

  if (!enabled || !state) return null;

  return (
    <div className="cx-pred">
      <div className="cx-pred-head">
        <span className="cx-pred-title">🎯 Score prediction</span>
        {count > 0 ? (
          <button type="button" className="cx-pred-count" onClick={() => setShowList(true)}>
            {count} {count === 1 ? "prediction" : "predictions"}
          </button>
        ) : null}
      </div>

      {/* Your prediction (saved) */}
      {mine && !formOpen ? (
        <div className="cx-pred-mine">
          <span className="cx-pred-score">
            {homeTeam} <strong>{mine.homeScore}</strong> – <strong>{mine.awayScore}</strong> {awayTeam}
          </span>
          {resolved ? (
            <span className={`cx-pred-tag ${mine.isWinner ? "cx-pred-tag--win" : "cx-pred-tag--miss"}`}>
              {mine.isWinner ? "✓ Correct" : "Missed"}
            </span>
          ) : open ? (
            <span className="cx-pred-menu-wrap">
              <button
                type="button"
                className="cx-pred-dots"
                aria-label="Prediction options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                ⋯
              </button>
              {menuOpen ? (
                <>
                  <span className="cx-pred-menu-backdrop" onClick={() => setMenuOpen(false)} />
                  <span className="cx-pred-menu" role="menu">
                    <button type="button" className="cx-pred-menu-item" role="menuitem" onClick={() => { setMenuOpen(false); startEdit(); }}>Edit</button>
                    <button type="button" className="cx-pred-menu-item cx-pred-menu-item--danger" role="menuitem" disabled={removing} onClick={() => { setMenuOpen(false); void onDelete(); }}>Delete</button>
                  </span>
                </>
              ) : null}
            </span>
          ) : (
            <span className="cx-pred-locked">Locked</span>
          )}
        </div>
      ) : null}

      {/* Inline predict / edit form */}
      {formOpen ? (
        isAuthenticated ? (
          <div className="cx-pred-form">
            <span className="cx-pred-team">{homeTeam}</span>
            <input
              className="cx-pred-input"
              inputMode="numeric"
              value={home}
              onChange={(e) => setHome(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
              aria-label={`${homeTeam} score`}
            />
            <span className="cx-pred-dash">–</span>
            <input
              className="cx-pred-input"
              inputMode="numeric"
              value={away}
              onChange={(e) => setAway(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
              aria-label={`${awayTeam} score`}
            />
            <span className="cx-pred-team">{awayTeam}</span>
            <button type="button" className="cx-pred-submit" onClick={() => void onSubmit()} disabled={submitting}>
              {mine ? "Save" : "Predict"}
            </button>
            {editing ? (
              <button type="button" className="cx-pred-link" onClick={() => setEditing(false)}>Cancel</button>
            ) : null}
          </div>
        ) : (
          <p className="cx-pred-hint muted small">Log in to predict the score.</p>
        )
      ) : null}

      {/* Predict CTA when open and no prediction yet handled by formOpen above.
          When match in progress (locked, no prediction) show a note. */}
      {!open && !resolved && !mine ? (
        <p className="cx-pred-hint muted small">Predictions are locked (match started).</p>
      ) : null}

      {resolved ? (
        <button type="button" className="cx-pred-winners-btn" onClick={() => setShowWinners(true)}>
          🏆 Prediction winners
        </button>
      ) : null}

      {error ? <p className="cx-pred-error" role="alert">{error}</p> : null}

      {showList ? (
        <PredictionListModal
          postId={postId}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          title="Predictions"
          winnersOnly={false}
          onClose={() => setShowList(false)}
        />
      ) : null}
      {showWinners ? (
        <PredictionListModal
          postId={postId}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          title="Prediction winners"
          winnersOnly
          onClose={() => setShowWinners(false)}
        />
      ) : null}
    </div>
  );
}

function PredictionListModal({
  postId,
  homeTeam,
  awayTeam,
  title,
  winnersOnly,
  onClose,
}: {
  postId: string;
  homeTeam: string;
  awayTeam: string;
  title: string;
  winnersOnly: boolean;
  onClose: () => void;
}) {
  const { data, loading, refetch } = useQuery<{ matchPredictions?: Prediction[]; matchPredictionWinners?: Prediction[] }>(
    winnersOnly ? MATCH_PREDICTION_WINNERS : MATCH_PREDICTIONS,
    {
      variables: winnersOnly ? { postId } : { postId, take: 200 },
      fetchPolicy: "network-only",
    },
  );
  // Live updates for the open predictions list.
  useSubscription(MATCH_PREDICTION_UPDATED, {
    variables: { postId },
    skip: winnersOnly,
    onData: () => void refetch(),
  });

  const rows = useMemo(
    () => (winnersOnly ? data?.matchPredictionWinners : data?.matchPredictions) ?? [],
    [data, winnersOnly],
  );

  return (
    <div className="ig-modal-overlay cx-voters-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <section className="ig-modal-card cx-voters-card" onClick={(e) => e.stopPropagation()}>
        <div className="ig-post-comments-head cx-voters-head">
          <div className="cx-voters-head-titles">
            <h3 className="ig-post-comments-title">{title}</h3>
            {!loading ? <span className="cx-voters-total">{rows.length}</span> : null}
          </div>
          <button type="button" className="cx-modal-close" onClick={onClose}>Close</button>
        </div>
        {loading ? (
          <div className="cx-voters-loading"><span className="cx-voters-spinner" aria-hidden /><span className="muted small">Loading…</span></div>
        ) : rows.length === 0 ? (
          <p className="cx-voters-empty muted small">{winnersOnly ? "No correct predictions." : "No predictions yet."}</p>
        ) : (
          <div className="cx-voters-scroll">
            <ul className="cx-voter-list">
              {rows.map((p) => {
                const src = normalizeProfileImageUrl(p.user?.profileImageUrl);
                const name = predName(p.user);
                return (
                  <li key={p.id} className="cx-voter-row">
                    <NavLink to={`/profile/${p.user?.id}`} className="cx-voter-rowlink" onClick={onClose}>
                      <span className="cx-voter-avatar">
                        {src ? <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span className="cx-voter-avatar-initial">{name.replace(/^@/, "").slice(0, 1).toUpperCase()}</span>}
                      </span>
                      <span className="cx-voter-meta">
                        <span className="cx-voter-name">{name}</span>
                        <span className="cx-voter-sub">
                          <span className={`cx-pred-pill${p.isWinner ? " cx-pred-pill--win" : ""}`}>
                            {homeTeam} {p.homeScore}–{p.awayScore} {awayTeam}
                          </span>
                        </span>
                      </span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
