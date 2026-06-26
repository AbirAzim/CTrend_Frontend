import { useLazyQuery, useMutation, useQuery } from "@apollo/client";
import { useEffect, useRef, useState } from "react";
import { ADD_FRIEND } from "../graphql/friends";
import {
  INVITE_USERS_BULK,
  INVITE_ADMIN,
  LIST_USERS,
  PREVIEW_INVITES,
  PROMOTE_TO_ADMIN,
  PLATFORM_SETTINGS,
} from "../graphql/admin";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { COIN_AMOUNTS } from "../lib/coins";
import {
  INVITE_MODAL_SUBTITLE,
  INVITE_MODAL_SUBTITLE_NO_POINTS,
  INVITE_MODAL_TIPS,
  INVITE_MODAL_TIPS_NO_POINTS,
  inviteModalDescription,
  inviteModalDescriptionNoPoints,
} from "@ctrend/shared/lib/referralInvite";

type PreviewUser = {
  id: string;
  email: string;
  username?: string | null;
  displayName?: string | null;
  profileImageUrl?: string | null;
  role?: string | null;
};

type PreviewRow = {
  email: string;
  hasPendingInvite: boolean;
  existingUser?: PreviewUser | null;
};

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .replace(/[._\-+]/g, " ")
    .replace(/\d+/g, "")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ") || local;
}

function gmailPicUrl(email: string): string | null {
  if (!email.toLowerCase().endsWith("@gmail.com")) return null;
  return `https://www.google.com/s2/photos/profile/${encodeURIComponent(email)}?sz=64`;
}

function Avatar({
  email,
  profileImageUrl,
  name,
  size = 36,
}: {
  email: string;
  profileImageUrl?: string | null;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = profileImageUrl || (!failed ? gmailPicUrl(email) : null);
  const initial = (name[0] ?? email[0] ?? "?").toUpperCase();
  return (
    <span className="bim-avatar" style={{ width: size, height: size, fontSize: size * 0.3 }}>
      {src && !failed ? (
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        initial
      )}
    </span>
  );
}

function EmailTag({ email, onRemove }: { email: string; onRemove: () => void }) {
  return (
    <span className="bim-tag">
      {email}
      <button type="button" className="bim-tag-x" onClick={onRemove} aria-label={`Remove ${email}`}>
        ×
      </button>
    </span>
  );
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function splitEmails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(isValidEmail);
}

function userName(u: PreviewUser): string {
  return u.displayName?.trim() || u.username?.trim() || nameFromEmail(u.email);
}

type Props = {
  inviteType: "user" | "admin";
  onClose: () => void;
};

export function BulkInviteModal({ inviteType, onClose }: Props) {
  const [inputVal, setInputVal] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [previews, setPreviews] = useState<PreviewRow[]>([]);
  const [friendedIds, setFriendedIds] = useState<Set<string>>(new Set());
  const [promotedIds, setPromotedIds] = useState<Set<string>>(new Set());
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "done">("idle");
  const [sendResults, setSendResults] = useState<{ email: string; status: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const [runPreview, { loading: previewing }] = useLazyQuery(PREVIEW_INVITES, {
    fetchPolicy: "network-only",
  });
  const [inviteUsers, { loading: inviting }] = useMutation(INVITE_USERS_BULK);
  const [inviteAdminMut, { loading: invitingAdmin }] = useMutation(INVITE_ADMIN);
  const [promoteToAdminMut, { loading: promoting }] = useMutation(PROMOTE_TO_ADMIN);
  const [addFriend, { loading: addingFriend }] = useMutation(ADD_FRIEND);

  const { data: settingsData } = useQuery(PLATFORM_SETTINGS, { fetchPolicy: "cache-first" });
  const pointsEnabled = Boolean(settingsData?.platformSettings?.referralSystemEnabled);

  const busy = inviting || invitingAdmin || promoting || addingFriend;

  // Suggestions for admin invite: fetch existing non-admin users
  const { data: usersData } = useQuery(LIST_USERS, {
    variables: { skip: 0, take: 50 },
    skip: inviteType !== "admin",
    fetchPolicy: "cache-and-network",
  });
  const allUsers = (usersData?.listUsers ?? []) as PreviewUser[];
  const allUsersMap = new Map(allUsers.map((u) => [u.email.toLowerCase(), u]));
  const query = inputVal.trim().toLowerCase();

  function matchScore(u: PreviewUser): number {
    if (!query) return 0;
    const name = (u.displayName ?? u.username ?? "").toLowerCase();
    const email = u.email.toLowerCase();
    if (name.startsWith(query) || email.startsWith(query)) return 0;
    return 1;
  }

  const adminSuggestions = allUsers
    .filter((u) => {
      if (u.role === "admin" || emails.includes(u.email.toLowerCase())) return false;
      if (!query) return true;
      return (
        u.email.toLowerCase().includes(query) ||
        (u.displayName ?? "").toLowerCase().includes(query) ||
        (u.username ?? "").toLowerCase().includes(query)
      );
    })
    .sort((a, b) => matchScore(a) - matchScore(b));

  useEffect(() => {
    if (!emails.length) {
      setPreviews([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await runPreview({ variables: { emails } });
      if (!cancelled) {
        setPreviews((data?.previewInvites ?? []) as PreviewRow[]);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [emails]); // eslint-disable-line react-hooks/exhaustive-deps

  function addEmail(raw: string) {
    const found = splitEmails(raw);
    if (!found.length) return;
    setEmails((prev) => {
      const s = new Set(prev);
      found.forEach((e) => s.add(e));
      return [...s];
    });
    setInputVal("");
  }

  function removeEmail(email: string) {
    setEmails((prev) => prev.filter((e) => e !== email));
    setPreviews((prev) => prev.filter((p) => p.email !== email));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === ";") {
      e.preventDefault();
      addEmail(inputVal);
    } else if (e.key === "Backspace" && !inputVal && emails.length) {
      removeEmail(emails[emails.length - 1]!);
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (splitEmails(text).length > 1 || text.includes(",") || text.includes("\n")) {
      e.preventDefault();
      addEmail(text);
    }
  }

  async function onSend() {
    setSendError(null);
    setSendStatus("sending");
    const results: { email: string; status: string }[] = [];

    if (inviteType === "admin") {
      for (const email of emails) {
        const row = previews.find((p) => p.email === email);
        if (row?.existingUser) {
          // Existing user → promote
          try {
            await promoteToAdminMut({ variables: { email } });
            results.push({ email, status: "promoted" });
          } catch {
            results.push({ email, status: "error" });
          }
        } else {
          // New email → send invite
          try {
            await inviteAdminMut({ variables: { email } });
            results.push({ email, status: "invited" });
          } catch {
            results.push({ email, status: "error" });
          }
        }
      }
      setSendResults(results);
      setSendStatus("done");
      return;
    }

    // User invites: skip existing / pending
    const toInvite = emails.filter((email) => {
      const p = previews.find((r) => r.email === email);
      return !p?.existingUser && !p?.hasPendingInvite;
    });

    if (!toInvite.length) {
      setSendStatus("done");
      setSendResults([]);
      return;
    }

    try {
      const { data } = await inviteUsers({ variables: { emails: toInvite } });
      setSendResults(data?.inviteUsers ?? []);
      setSendStatus("done");
    } catch (err: unknown) {
      setSendError(getApolloErrorMessage(err));
      setSendStatus("idle");
    }
  }

  async function onAddFriend(userId: string) {
    try {
      await addFriend({ variables: { userId } });
      setFriendedIds((prev) => new Set([...prev, userId]));
    } catch {
      // silent — user can retry
    }
  }

  async function onPromoteNow(email: string, userId: string) {
    try {
      await promoteToAdminMut({ variables: { email } });
      setPromotedIds((prev) => new Set([...prev, userId]));
    } catch {
      // silent
    }
  }

  const invitableCount =
    inviteType === "admin"
      ? emails.length
      : emails.filter((email) => {
          const p = previews.find((r) => r.email === email);
          return !p?.existingUser && !p?.hasPendingInvite;
        }).length;

  const sendLabel = (() => {
    if (busy) return "Sending…";
    if (inviteType === "admin") {
      if (!emails.length) return "No emails added";
      return `Send to ${emails.length} ${emails.length === 1 ? "person" : "people"}`;
    }
    if (invitableCount === 0) return "No new emails to invite";
    return `Send ${invitableCount} invitation${invitableCount !== 1 ? "s" : ""}`;
  })();

  return (
    <div className="admin-modal-overlay" onClick={onClose} role="dialog" aria-modal>
      <div className="admin-modal bim-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="admin-modal-title">
          {inviteType === "admin" ? "Invite Admins" : "Invite a friend"}
        </h2>
        {inviteType === "user" ? (
          <>
            <p className="bim-invite-sub muted small">
              {pointsEnabled ? INVITE_MODAL_SUBTITLE : INVITE_MODAL_SUBTITLE_NO_POINTS}
            </p>
            <div className="bim-invite-info">
              <p className="bim-invite-info-text">
                {pointsEnabled ? inviteModalDescription() : inviteModalDescriptionNoPoints()}
              </p>
              <ul className="bim-invite-tips">
                {(pointsEnabled ? INVITE_MODAL_TIPS : INVITE_MODAL_TIPS_NO_POINTS).map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
              {pointsEnabled ? (
                <div className="bim-invite-rewards" aria-hidden>
                  <span className="bim-invite-reward-pill bim-invite-reward-pill--you">
                    You +{COIN_AMOUNTS.INVITE} pts
                  </span>
                  <span className="bim-invite-reward-pill bim-invite-reward-pill--friend">
                    Friend +{COIN_AMOUNTS.REFERRAL_INVITEE} pts
                  </span>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <p className="muted small" style={{ marginBottom: 14 }}>
            Existing Ke Jitbe users will be promoted to admin. New emails will receive an invitation.
          </p>
        )}

        {inviteType === "user" ? (
          <p className="muted small bim-invite-hint">
            Add emails below. Existing Ke Jitbe users won&apos;t be re-invited — send a friend request instead.
          </p>
        ) : null}

        {sendStatus === "done" ? (
          <div className="bim-done">
            {sendResults.length === 0 ? (
              <p className="bim-done-msg">All done — nothing new to send.</p>
            ) : (
              <>
                <p className="bim-done-msg">Done!</p>
                <ul className="bim-result-list">
                  {sendResults.map((r) => (
                    <li key={r.email} className={`bim-result-item bim-result--${r.status}`}>
                      <span>{r.email}</span>
                      <span className="bim-result-badge">
                        {r.status === "invited"
                          ? "✓ Invite sent"
                          : r.status === "promoted"
                            ? "✓ Promoted"
                            : r.status === "already_exists"
                              ? "Already on Ke Jitbe"
                              : "Failed"}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <button type="button" className="btn-ghost" onClick={onClose} style={{ marginTop: 14 }}>
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Tag input */}
            <div className="bim-tag-input" onClick={() => inputRef.current?.focus()}>
              {emails.map((email) => (
                <EmailTag key={email} email={email} onRemove={() => removeEmail(email)} />
              ))}
              <input
                ref={inputRef}
                type="text"
                className="bim-input"
                placeholder={emails.length ? "" : "Type or paste emails…"}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                onBlur={() => { if (inputVal.trim()) addEmail(inputVal); }}
                autoComplete="off"
                autoCapitalize="none"
              />
            </div>
            <p className="muted small" style={{ marginTop: 4 }}>
              Press Enter or comma to add. Paste multiple at once.
            </p>

            {/* Preview of added emails */}
            {emails.length > 0 && (
              <ul className="bim-preview-list">
                {emails.map((email) => {
                  const row = previews.find((p) => p.email === email);
                  const existing = row?.existingUser;
                  const pending = row?.hasPendingInvite;
                  const knownUser = allUsersMap.get(email.toLowerCase());
                  const profileImageUrl = existing?.profileImageUrl ?? knownUser?.profileImageUrl ?? null;
                  const name = existing ? userName(existing) : knownUser ? userName(knownUser) : nameFromEmail(email);
                  const isPromoted = existing && promotedIds.has(existing.id);
                  const isFriended = existing && friendedIds.has(existing.id);

                  return (
                    <li key={email} className="bim-preview-row">
                      <Avatar email={email} profileImageUrl={profileImageUrl} name={name} />
                      <div className="bim-preview-meta">
                        <strong className="bim-preview-name">{name}</strong>
                        <span className="bim-preview-email muted small">{email}</span>
                        {existing && <span className="bim-badge bim-badge--exists">On Ke Jitbe</span>}
                        {!existing && pending && <span className="bim-badge bim-badge--pending">Invite pending</span>}
                        {!existing && !pending && !previewing && <span className="bim-badge bim-badge--new">Will be invited</span>}
                      </div>
                      <div className="bim-preview-action">
                        {existing ? (
                          inviteType === "admin" ? (
                            isPromoted ? (
                              <span className="bim-badge bim-badge--sent">Promoted</span>
                            ) : (
                              <button
                                type="button"
                                className="btn-ghost bim-friend-btn"
                                disabled={promoting}
                                onClick={() => void onPromoteNow(email, existing.id)}
                              >
                                Promote now
                              </button>
                            )
                          ) : isFriended ? (
                            <span className="bim-badge bim-badge--sent">Request sent</span>
                          ) : (
                            <button
                              type="button"
                              className="btn-ghost bim-friend-btn"
                              disabled={addingFriend}
                              onClick={() => void onAddFriend(existing.id)}
                            >
                              + Friend
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            className="bim-remove-btn"
                            onClick={() => removeEmail(email)}
                            aria-label="Remove"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Existing user suggestions for admin invite */}
            {inviteType === "admin" && adminSuggestions.length > 0 && (
              <div className="bim-suggestions">
                <p className="bim-suggestions-label">
                  {query ? `Matching users` : "Existing users"}
                </p>
                <ul className="bim-suggestions-list">
                  {adminSuggestions.slice(0, 8).map((u) => {
                    const name = userName(u);
                    const highlighted = (text: string) => {
                      if (!query) return <>{text}</>;
                      const idx = text.toLowerCase().indexOf(query);
                      if (idx === -1) return <>{text}</>;
                      return (
                        <>
                          {text.slice(0, idx)}
                          <mark style={{ background: "#fde68a", color: "#92400e", borderRadius: 2, padding: "0 1px" }}>
                            {text.slice(idx, idx + query.length)}
                          </mark>
                          {text.slice(idx + query.length)}
                        </>
                      );
                    };
                    return (
                      <li key={u.id} className="bim-suggestion-row">
                        <Avatar email={u.email} profileImageUrl={u.profileImageUrl} name={name} size={30} />
                        <div className="bim-suggestion-meta">
                          <strong>{highlighted(name)}</strong>
                          <span className="muted small">{highlighted(u.email)}</span>
                        </div>
                        <button
                          type="button"
                          className="btn-ghost bim-friend-btn"
                          onClick={() => addEmail(u.email)}
                        >
                          + Add
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {sendError && <p className="error" role="alert">{sendError}</p>}

            <div className="admin-modal-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn-primary"
                disabled={emails.length === 0 || invitableCount === 0 || busy || previewing}
                onClick={() => void onSend()}
              >
                {sendLabel}
              </button>
              <button type="button" className="btn-ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
