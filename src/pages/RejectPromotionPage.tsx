import { useMutation } from "@apollo/client";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { REJECT_ADMIN_PROMOTION } from "../graphql/admin";

type Stage = "confirming" | "loading" | "done" | "error";

export function RejectPromotionPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [stage, setStage] = useState<Stage>(token ? "confirming" : "error");
  const [errorMsg, setErrorMsg] = useState("");

  const [rejectPromotion, { loading }] = useMutation(REJECT_ADMIN_PROMOTION);

  async function handleReject() {
    setStage("loading");
    try {
      await rejectPromotion({ variables: { token } });
      setStage("done");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg.includes("Invalid or expired") ? "This link has already been used or has expired." : msg);
      setStage("error");
    }
  }

  useEffect(() => {
    if (!token) {
      setErrorMsg("No token found in this link.");
      setStage("error");
    }
  }, [token]);

  return (
    <div className="rp-page">
      <div className="rp-card">
        {stage === "confirming" && (
          <>
            <div className="rp-icon rp-icon--warn">⚠</div>
            <h1 className="rp-title">Decline Admin Access?</h1>
            <p className="rp-body">
              You're about to decline the admin promotion on Ke Jitbe.<br />
              Your account will remain active as a regular user.
            </p>
            <div className="rp-actions">
              <button
                type="button"
                className="btn-danger rp-btn"
                disabled={loading}
                onClick={() => void handleReject()}
              >
                Yes, decline admin access
              </button>
              <Link to="/" className="btn-ghost rp-btn">
                Cancel — keep admin access
              </Link>
            </div>
          </>
        )}

        {stage === "loading" && (
          <>
            <div className="rp-icon rp-icon--spin">⟳</div>
            <p className="rp-body">Processing…</p>
          </>
        )}

        {stage === "done" && (
          <>
            <div className="rp-icon rp-icon--ok">✓</div>
            <h1 className="rp-title">Admin access declined</h1>
            <p className="rp-body">
              Your account has been restored to a regular user.<br />
              You can still use Ke Jitbe normally.
            </p>
            <Link to="/" className="btn-primary rp-btn" style={{ marginTop: 8 }}>
              Go to Ke Jitbe
            </Link>
          </>
        )}

        {stage === "error" && (
          <>
            <div className="rp-icon rp-icon--err">✕</div>
            <h1 className="rp-title">Link not valid</h1>
            <p className="rp-body rp-body--error">
              {errorMsg || "This link is invalid or has already been used."}
            </p>
            <Link to="/" className="btn-ghost rp-btn">
              Go to Ke Jitbe
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
