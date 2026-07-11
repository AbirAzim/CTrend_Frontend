import { Fragment, type ReactNode, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApolloClient } from "@apollo/client";
import { linkifyText } from "./linkify";
import { SEARCH_USERS } from "../graphql/search";

const MENTION_RE = /@([a-zA-Z0-9_]{2,30})/g;

type SearchUserResult = { id: string; username: string };

/** Clickable `@username` span — resolves the username and navigates to that
 * profile. Exported so chat's `LinkifiedText` (a separate link-parsing
 * pipeline, see `parseTextLinks.ts`) can render mentions the same way. */
export function MentionSpan({ username }: { username: string }) {
  const navigate = useNavigate();
  const client = useApolloClient();
  const [resolving, setResolving] = useState(false);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (resolving) return;
      setResolving(true);
      try {
        const { data } = await client.query<{ searchUsers: SearchUserResult[] }>({
          query: SEARCH_USERS,
          variables: { search: username, take: 5 },
          fetchPolicy: "cache-first",
        });
        const match = (data?.searchUsers ?? []).find(
          (u) => u.username.toLowerCase() === username.toLowerCase(),
        );
        if (match) navigate(`/profile/${match.id}`);
      } finally {
        setResolving(false);
      }
    },
    [client, navigate, username, resolving],
  );

  return (
    <span className="cx-mention" onClick={handleClick}>
      @{username}
    </span>
  );
}

/** Wraps linkifyText's output in uniquely-keyed fragments so segments from
 * multiple calls (one per gap between mentions) can be flattened together
 * without React key collisions. */
function linkifySegment(text: string, segmentKey: string): ReactNode[] {
  return linkifyText(text).map((node, i) => (
    <Fragment key={`${segmentKey}-${i}`}>{node}</Fragment>
  ));
}

/**
 * Splits `text` into plain strings, clickable `@mention` spans (resolve the
 * username → navigate to that profile), and linkified URLs — mentions are
 * parsed first, then each remaining segment is run through `linkifyText`, so
 * both can appear in the same comment/caption/message.
 */
export function mentionifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) {
      nodes.push(...linkifySegment(text.slice(last, idx), `mf-seg-${key}`));
    }
    nodes.push(<MentionSpan key={`mf-mn-${key++}`} username={m[1]} />);
    last = idx + m[0].length;
  }
  if (last < text.length) {
    nodes.push(...linkifySegment(text.slice(last), `mf-seg-${key}`));
  }
  return nodes;
}
