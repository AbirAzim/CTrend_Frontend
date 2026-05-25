import { useLazyQuery, useMutation } from "@apollo/client";
import { useEffect, useRef, useState } from "react";
import { ADD_FRIEND } from "../graphql/friends";
import { INVITE_USERS_BULK, INVITE_ADMIN, PREVIEW_INVITES } from "../graphql/admin";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";

type PreviewUser = {
  id: string;
  username?: string | null;
  displayName?: string | null;
  profileImageUrl?: string | null;
};

type PreviewRow = {
  email: string;
  hasPendingInvite: boolean;
  existingUser?: PreviewUser | null;
};

/** Derive a human-readable name from the email local part. */
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

/** Google S2 profile photo URL — works for many Gmail accounts. */
function gmailPicUrl(email: string): string | null {
  if (!email.toLowerCase().endsWith("@gmail.com")) return null;
  return `https://www.google.com/s2/photos/profile/${encodeURIComponent(email)}?sz=64`;
}

function Avatar({
  email,
  profileImageUrl,
  name,
}: {
  email: string;
  profileImageUrl?: string | null;
  name: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = profileImageUrl || (!failed ? gmailPicUrl(email) : null);
  const initial = (name[0] ?? email[0] ?? "?").toUpperCase();
  return (
    <span className="bim-avatar">
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

type Props = {
  inviteType: "user" | "admin";
  onClose: () => void;
};

export function BulkInviteModal({ inviteType, onClose }: Props) {
  const [inputVal, setInputVal] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [previews, setPreviews] = useState<PreviewRow[]>([]);
  const [sentIds] = useState<Set<string>>(new Set());
  const [friendedIds, setFriendedIds] = useState<Set<string>>(new Set());
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "done">("idle");
  const [sendResults, setSendResults] = useState<{ email: string; status: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const [runPreview, { loading: previewing }] = useLazyQuery(PREVIEW_INVITES, {
    fetchPolicy: "network-only",
  });
  const [inviteUsers, { loading: inviting }] = useMutation(INVITE_USERS_BULK);
  const [inviteAdmin, { loading: invitingAdmin }] = useMutation(INVITE_ADMIN);
  const [addFriend, { loading: addingFriend }] = useMutation(ADD_FRIEND);

  const busy = inviting || invitingAdmin || addingFriend;

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

    // For admin invites, call one by one (existing mutation)
    if (inviteType === "admin") {
      const results: { email: string; status: string }[] = [];
      for (const email of emails) {
        try {
          await inviteAdmin({ variables: { email } });
          results.push({ email, status: "invited" });
        } catch {
          results.push({ email, status: "error" });
        }
      }
      setSendResults(results);
      setSendStatus("done");
      return;
    }

    // For user invites, only send to emails that aren't already in the system / pending
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
      // ignore — user can retry
    }
  }

  // Emails that can actually be invited (no existing user, no pending invite)
  const invitableCount = emails.filter((email) => {
    const p = previews.find((r) => r.email === email);
    return !p?.existingUser && !p?.hasPendingInvite;
  }).length;

  return (
    <div className="admin-modal-overlay" onClick={onClose} role="dialog" aria-modal>
      <div className="admin-modal bim-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="admin-modal-title">
          {inviteType === "admin" ? "Invite Admins" : "Invite People"}
        </h2>
        <p className="muted small" style={{ marginBottom: 14 }}>
          {inviteType === "admin"
            ? "Admins will receive full dashboard access."
            : "Add one or more email addresses. Existing CTrend users won't be re-invited — you can send them a friend request instead."}
        </p>

        {sendStatus === "done" ? (
          <div className="bim-done">
            {sendResults.length === 0 ? (
              <p className="bim-done-msg">
                All selected emails are already on CTrend or have pending invitations.
              </p>
            ) : (
              <>
                <p className="bim-done-msg">Invitations sent!</p>
                <ul className="bim-result-list">
                  {sendResults.map((r) => (
                    <li key={r.email} className={`bim-result-item bim-result--${r.status}`}>
                      <span>{r.email}</span>
                      <span className="bim-result-badge">
                        {r.status === "invited" ? "✓ Sent" : r.status === "already_exists" ? "Already on CTrend" : "Failed"}
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
            <div
              className="bim-tag-input"
              onClick={() => inputRef.current?.focus()}
            >
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
              Press Enter or comma to add an email. Paste multiple at once.
            </p>

            {/* Preview list */}
            {emails.length > 0 && (
              <ul className="bim-preview-list">
                {emails.map((email) => {
                  const row = previews.find((p) => p.email === email);
                  const existing = row?.existingUser;
                  const pending = row?.hasPendingInvite;
                  const name = existing
                    ? (existing.displayName?.trim() || existing.username?.trim() || nameFromEmail(email))
                    : nameFromEmail(email);
                  const isFriended = existing && friendedIds.has(existing.id);

                  return (
                    <li key={email} className="bim-preview-row">
                      <Avatar
                        email={email}
                        profileImageUrl={existing?.profileImageUrl}
                        name={name}
                      />
                      <div className="bim-preview-meta">
                        <strong className="bim-preview-name">{name}</strong>
                        <span className="bim-preview-email muted small">{email}</span>
                        {existing && (
                          <span className="bim-badge bim-badge--exists">On CTrend</span>
                        )}
                        {!existing && pending && (
                          <span className="bim-badge bim-badge--pending">Invite pending</span>
                        )}
                        {!existing && !pending && !previewing && (
                          <span className="bim-badge bim-badge--new">Will be invited</span>
                        )}
                      </div>
                      <div className="bim-preview-action">
                        {existing ? (
                          isFriended ? (
                            <span className="bim-badge bim-badge--sent">Request sent</span>
                          ) : (
                            <button
                              type="button"
                              className="btn-ghost bim-friend-btn"
                              disabled={addingFriend || sentIds.has(existing.id)}
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

            {sendError && (
              <p className="error" role="alert">{sendError}</p>
            )}

            <div className="admin-modal-actions" style={{ marginTop: 16 }}>
              {inviteType === "user" ? (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={invitableCount === 0 || busy || previewing}
                  onClick={() => void onSend()}
                >
                  {busy ? "Sending…" : invitableCount === 0 ? "No new emails to invite" : `Send ${invitableCount} invitation${invitableCount !== 1 ? "s" : ""}`}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={emails.length === 0 || busy}
                  onClick={() => void onSend()}
                >
                  {busy ? "Sending…" : `Send ${emails.length} admin invitation${emails.length !== 1 ? "s" : ""}`}
                </button>
              )}
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
