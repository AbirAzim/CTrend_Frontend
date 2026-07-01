import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { WORLD_CUP_FIXTURE_DETAILS } from "../graphql/worldcup";
import { useAuth } from "../context/AuthContext";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { normalizeProfileImageUrl } from "../lib/profileImageUrl";
import { COIN_AMOUNTS, dispatchCoinEarned } from "../lib/coins";
import {
  isExtraTimeLiveStatus,
  isKnockoutStage,
  isPredictionResultPending,
  isShootoutLiveStatus,
} from "@ctrend/shared/lib/knockoutFixture";
import {
  knockoutRoundBadgeText,
  predictionPendingExtraTimeMessage,
  predictionPendingShootoutMessage,
  predictionResolvedAfterShootoutNote,
  predictionWinnersButtonLabel,
  PREDICTION_WINNERS_BUTTON_ICON,
} from "@ctrend/shared/lib/matchPredictionCopy";
import { knockoutEffectiveScore } from "@ctrend/shared/lib/matchScoreCopy";

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
    fixtureStage?: string | null;
    predictionsPendingResult?: boolean | null;
    wentToExtraTime?: boolean | null;
    wentToPenalties?: boolean | null;
    myPrediction: Prediction | null;
  };
};

function predName(u?: PredUser | null): string {
  if (!u) return "User";
  return u.displayName?.trim() || (u.username ? `@${u.username.trim()}` : "User");
}

export function MatchPrediction({
  postId,
  fixtureId,
  homeTeam,
  awayTeam,
  enabled,
  suppressRoundBadge = false,
}: {
  postId: string;
  fixtureId?: string | null;
  homeTeam: string;
  awayTeam: string;
  enabled: boolean;
  suppressRoundBadge?: boolean;
}) {
  const { isAuthenticated } = useAuth();
  const { data, refetch } = useQuery<StateData>(MATCH_PREDICTION_STATE, {
    variables: { postId },
    skip: !enabled,
    fetchPolicy: "cache-and-network",
  });
  const { data: fixtureData } = useQuery<{
    worldCupFixture?: {
      stage?: string | null;
      status?: string | null;
      rawStatus?: string | null;
      homeTeam?: { name?: string | null } | null;
      awayTeam?: { name?: string | null } | null;
      fullTime?: { home?: number | null; away?: number | null } | null;
      extraTime?: { home?: number | null; away?: number | null } | null;
      penalty?: { home?: number | null; away?: number | null } | null;
      wentToPenalties?: boolean | null;
      score?: { home?: number | null; away?: number | null } | null;
    } | null;
  }>(WORLD_CUP_FIXTURE_DETAILS, {
    variables: { id: fixtureId! },
    skip: !enabled || !fixtureId,
    fetchPolicy: "cache-first",
  });

  useSubscription(MATCH_PREDICTION_UPDATED, {
    variables: { postId },
    skip: !enabled,
    onData: () => void refetch(),
  });

  const [submit, { loading: submitting }] = useMutation(SUBMIT_MATCH_PREDICTION);
  const [remove, { loading: removing }] = useMutation(DELETE_MATCH_PREDICTION);

  const [editing, setEditing] = useState(false);
  const [home, setHome] = useState("0");
  const [away, setAway] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [showWinners, setShowWinners] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const homeLabel =
    fixtureData?.worldCupFixture?.homeTeam?.name?.trim() || homeTeam;
  const awayLabel =
    fixtureData?.worldCupFixture?.awayTeam?.name?.trim() || awayTeam;

  const state = data?.matchPredictionState;
  const mine = state?.myPrediction ?? null;
  const open = !!state?.predictionsOpen;
  const resolved = !!state?.predictionsResolved;
  const count = state?.count ?? 0;

  // Whether the inline score form is showing (new prediction or editing).
  const formOpen = open && (editing || !mine);
  const fixtureStage = state?.fixtureStage ?? fixtureData?.worldCupFixture?.stage ?? null;
  const matchStatus = fixtureData?.worldCupFixture?.status ?? null;
  const matchPhase = fixtureData?.worldCupFixture?.rawStatus ?? null;
  const roundBadge = isKnockoutStage(fixtureStage) ? knockoutRoundBadgeText(fixtureStage) : null;
  const pendingResult = isPredictionResultPending(
    resolved,
    matchStatus,
    state?.predictionsPendingResult,
    matchPhase,
    fixtureStage,
  );
  const inExtraTime = isExtraTimeLiveStatus(matchStatus, matchPhase);
  const inShootout = isShootoutLiveStatus(matchStatus, matchPhase);
  const showResolvedPenNote =
    isKnockoutStage(fixtureStage) && resolved && Boolean(state?.wentToPenalties);
  const gradingScore = fixtureData?.worldCupFixture
    ? knockoutEffectiveScore(fixtureData.worldCupFixture)
    : null;

  function startEdit() {
    setHome(mine ? String(mine.homeScore) : "0");
    setAway(mine ? String(mine.awayScore) : "0");
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
    const isFirstPrediction = !mine;
    try {
      await submit({ variables: { postId, homeScore: h, awayScore: a } });
      setEditing(false);
      void refetch();
      // Coins: earn for predicting (only the first time, not on edits).
      if (isFirstPrediction) dispatchCoinEarned(COIN_AMOUNTS.PREDICTION);
    } catch (err) {
      setError(getApolloErrorMessage(err));
    }
  }

  async function onDelete() {
    try {
      await remove({ variables: { postId } });
      setEditing(false);
      setHome("0");
      setAway("0");
      void refetch();
    } catch (err) {
      setError(getApolloErrorMessage(err));
    }
  }

  if (!enabled || !state) return null;

  const countBtn =
    count > 0 ? (
      <button
        type="button"
        className="cx-pred-count"
        onClick={() => setShowList(true)}
        aria-label={`View ${count} ${count === 1 ? "prediction" : "predictions"}`}
      >
        {count} {count === 1 ? "prediction" : "predictions"}
      </button>
    ) : null;

  const optionsMenu =
    open && !resolved && mine && !formOpen ? (
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
    ) : null;

  const statusChip = resolved && mine?.isWinner ? (
    <span className="cx-pred-chip cx-pred-chip--win">Correct</span>
  ) : resolved && mine ? (
    <span className="cx-pred-chip cx-pred-chip--miss">Missed</span>
  ) : resolved ? (
    <span className="cx-pred-chip cx-pred-chip--final">Final</span>
  ) : open ? (
    <span className="cx-pred-chip cx-pred-chip--open">Open</span>
  ) : (
    <span className="cx-pred-chip cx-pred-chip--locked">Locked</span>
  );

  return (
    <div className="cx-pred">
      {roundBadge && !suppressRoundBadge ? (
        <p className="cx-pred-round-badge">
          <span className="cx-pred-round-badge-icon" aria-hidden>🏆</span>
          {roundBadge}
        </p>
      ) : null}

      <div className="cx-pred-header">
        <div className="cx-pred-header-main">
          <span className="cx-pred-header-icon" aria-hidden>⚽</span>
          <span className="cx-pred-header-title">Score prediction</span>
          {statusChip}
        </div>
        <div className="cx-pred-header-actions">
          {countBtn}
          {optionsMenu}
        </div>
      </div>

      {pendingResult && inExtraTime ? (
        <p className="cx-pred-pending-result" role="status">{predictionPendingExtraTimeMessage()}</p>
      ) : null}
      {pendingResult && inShootout ? (
        <p className="cx-pred-pending-result" role="status">{predictionPendingShootoutMessage()}</p>
      ) : null}

      {mine && !formOpen ? (
        <div className="cx-pred-board">
          <div className="cx-pred-board-teams">
            <span className="cx-pred-board-team">{homeLabel}</span>
            <span className="cx-pred-board-vs">VS</span>
            <span className="cx-pred-board-team cx-pred-board-team--away">{awayLabel}</span>
          </div>
          <div
            className="cx-pred-score-pill"
            aria-label={`Your predicted score: ${homeLabel} ${mine.homeScore}, ${awayLabel} ${mine.awayScore}`}
          >
            <strong>{mine.homeScore}</strong>
            <span className="cx-pred-score-sep" aria-hidden>:</span>
            <strong>{mine.awayScore}</strong>
          </div>
          <span className="cx-pred-board-caption">Your prediction</span>
        </div>
      ) : null}

      {formOpen ? (
        isAuthenticated ? (
          <>
            <div className="cx-pred-board">
              <div className="cx-pred-board-teams">
                <span className="cx-pred-board-team">{homeLabel}</span>
                <span className="cx-pred-board-vs">VS</span>
                <span className="cx-pred-board-team cx-pred-board-team--away">{awayLabel}</span>
              </div>
              <div className="cx-pred-input-pill">
                <input
                  className="cx-pred-input cx-pred-input--lg"
                  inputMode="numeric"
                  value={home}
                  onChange={(e) => setHome(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                  aria-label={`${homeLabel} score`}
                />
                <span className="cx-pred-score-sep" aria-hidden>:</span>
                <input
                  className="cx-pred-input cx-pred-input--lg"
                  inputMode="numeric"
                  value={away}
                  onChange={(e) => setAway(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                  aria-label={`${awayLabel} score`}
                />
              </div>
            </div>
            <div className="cx-pred-form-actions">
              <button type="button" className="cx-pred-submit cx-pred-submit--full" onClick={() => void onSubmit()} disabled={submitting}>
                {mine ? "Save prediction" : "Submit prediction"}
              </button>
              {editing ? (
                <button type="button" className="cx-pred-cancel" onClick={() => setEditing(false)}>Cancel</button>
              ) : null}
            </div>
          </>
        ) : (
          <div className="cx-pred-hint-card">
            <p className="cx-pred-hint">Log in to predict the score.</p>
          </div>
        )
      ) : null}

      {!open && !resolved && !mine ? (
        <div className="cx-pred-hint-card">
          <p className="cx-pred-hint">Predictions are locked — match has started.</p>
        </div>
      ) : null}

      {resolved && !mine && !formOpen ? (
        <div className="cx-pred-hint-card">
          <p className="cx-pred-hint">Results are in</p>
        </div>
      ) : null}

      {resolved ? (
        <>
          {gradingScore ? (
            <p className="cx-pred-result-line">
              Result after extra time: {homeLabel} {gradingScore.home}–{gradingScore.away} {awayLabel}
            </p>
          ) : null}
          {showResolvedPenNote ? (
            <p className="cx-pred-pen-note">{predictionResolvedAfterShootoutNote()}</p>
          ) : null}
          <button
            type="button"
            className="cx-pred-winners-btn cx-pred-winners-btn--full"
            onClick={() => setShowWinners(true)}
          >
            <span className="cx-pred-winners-btn-icon" aria-hidden>{PREDICTION_WINNERS_BUTTON_ICON}</span>
            {predictionWinnersButtonLabel()}
          </button>
        </>
      ) : null}

      {error ? <p className="cx-pred-error" role="alert">{error}</p> : null}

      {showList ? (
        <PredictionListModal
          postId={postId}
          homeTeam={homeLabel}
          awayTeam={awayLabel}
          title="Predictions"
          winnersOnly={false}
          onClose={() => setShowList(false)}
        />
      ) : null}
      {showWinners ? (
        <PredictionListModal
          postId={postId}
          homeTeam={homeLabel}
          awayTeam={awayLabel}
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
  const cardRef = useRef<HTMLElement | null>(null);
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

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && cardRef.current?.contains(target)) {
        return;
      }
      onClose();
    }

    document.addEventListener("keydown", handleEscape);
    const attachId = setTimeout(() => {
      document.addEventListener("click", handleOutsideClick);
    }, 0);

    return () => {
      clearTimeout(attachId);
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("click", handleOutsideClick);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="ig-modal-overlay cx-voters-overlay cx-pred-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <section ref={cardRef} className="ig-modal-card cx-voters-card">
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
    </div>,
    document.body,
  );
}
