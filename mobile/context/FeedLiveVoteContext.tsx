import { useSubscription } from "@apollo/client/react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { POST_VOTE_UPDATED } from "@ctrend/shared/graphql/feed";

export type LiveVotePatch = {
  postId: string;
  upvoteCount: number;
  downvoteCount: number;
  viewerVote: "UP" | "DOWN" | null;
  mySelectedOptionIndex: number | null;
  optionStats: Array<{
    index: number;
    label: string;
    count: number;
    percentage: number;
  }> | null;
  isVotingOpen: boolean | null;
  votingEndsAt: string | null;
  matchScore?: {
    status: string | null;
    home: number | null;
    away: number | null;
    winner: string | null;
    minute?: number | null;
  } | null;
};

type Ctx = {
  getPatch: (postId: string) => LiveVotePatch | undefined;
  version: number;
};

const FeedLiveVoteContext = createContext<Ctx>({
  getPatch: () => undefined,
  version: 0,
});

function PostVoteSubscriber({
  postId,
  onPatch,
}: {
  postId: string;
  onPatch: (patch: LiveVotePatch) => void;
}) {
  useSubscription<{
    postVoteUpdated: Omit<LiveVotePatch, "postId"> & { id: string };
  }>(POST_VOTE_UPDATED, {
    variables: { postId },
    onData: ({ data }) => {
      const next = data.data?.postVoteUpdated;
      if (!next || next.id !== postId) return;
      onPatch({
        postId,
        upvoteCount: next.upvoteCount,
        downvoteCount: next.downvoteCount,
        viewerVote: next.viewerVote ?? null,
        mySelectedOptionIndex: next.mySelectedOptionIndex ?? null,
        optionStats:
          next.optionStats?.map((s) => ({
            ...s,
            count: Math.round(s.count),
          })) ?? null,
        isVotingOpen: next.isVotingOpen ?? null,
        votingEndsAt: next.votingEndsAt ?? null,
        matchScore: next.matchScore ?? null,
      });
    },
  });
  return null;
}

/** One subscription per visible feed row — cards read patches instead of each wiring WS. */
export function FeedLiveVoteProvider({
  visiblePostIds,
  children,
}: {
  visiblePostIds: string[];
  children: ReactNode;
}) {
  const [patches, setPatches] = useState<Map<string, LiveVotePatch>>(new Map());
  const [version, setVersion] = useState(0);

  const onPatch = useCallback((patch: LiveVotePatch) => {
    setPatches((prev) => {
      const next = new Map(prev);
      next.set(patch.postId, patch);
      return next;
    });
    setVersion((v) => v + 1);
  }, []);

  const getPatch = useCallback(
    (postId: string) => patches.get(postId),
    [patches],
  );

  const value = useMemo(() => ({ getPatch, version }), [getPatch, version]);
  const ids = useMemo(
    () => visiblePostIds.slice(0, 10),
    [visiblePostIds],
  );

  return (
    <FeedLiveVoteContext.Provider value={value}>
      {ids.map((id) => (
        <PostVoteSubscriber key={id} postId={id} onPatch={onPatch} />
      ))}
      {children}
    </FeedLiveVoteContext.Provider>
  );
}

export function useFeedLiveVote() {
  return useContext(FeedLiveVoteContext);
}
