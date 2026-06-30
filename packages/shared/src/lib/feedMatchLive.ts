const FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "FINISHED", "AWARDED"]);
const LIVE_STATUSES = new Set(["IN_PLAY", "PAUSED"]);

/** Max post-kickoff window when fixtureStatus sync lags (matches + ET). */
export const LIVE_GRACE_AFTER_KICKOFF_MS = 150 * 60 * 1000;

export function isMatchStatusFinished(status: string | null | undefined): boolean {
  return status != null && FINISHED_STATUSES.has(status);
}

export function isMatchStatusConfirmedLive(status: string | null | undefined): boolean {
  return status != null && LIVE_STATUSES.has(status);
}

export type FeedMatchLiveInput = {
  matchType?: boolean | null;
  votingEndsAt?: string | null;
  matchScore?: { status?: string | null } | null;
};

/** True when a campaign match post should be treated as live in the feed. */
export function isFeedMatchLive(post: FeedMatchLiveInput, nowMs = Date.now()): boolean {
  if (!post.matchType) return false;
  const status = post.matchScore?.status ?? null;
  if (isMatchStatusConfirmedLive(status)) return true;
  if (isMatchStatusFinished(status)) return false;

  const kickoffMs = post.votingEndsAt ? new Date(post.votingEndsAt).getTime() : NaN;
  if (!Number.isFinite(kickoffMs) || kickoffMs > nowMs) return false;

  return nowMs - kickoffMs <= LIVE_GRACE_AFTER_KICKOFF_MS;
}

export function shouldSortFeedLiveFirst(feedFilter: string): boolean {
  return feedFilter === "all" || feedFilter === "platform";
}

export function sortFeedPostsLiveFirst<
  T extends FeedMatchLiveInput & { id: string; pinned?: boolean | null },
>(posts: T[], nowMs = Date.now()): T[] {
  const pinned: T[] = [];
  const live: T[] = [];
  const rest: T[] = [];

  for (const p of posts) {
    if (p.pinned) pinned.push(p);
    else if (isFeedMatchLive(p, nowMs)) live.push(p);
    else rest.push(p);
  }

  live.sort((a, b) => {
    const ka = a.votingEndsAt ? new Date(a.votingEndsAt).getTime() : 0;
    const kb = b.votingEndsAt ? new Date(b.votingEndsAt).getTime() : 0;
    return ka - kb;
  });

  return [...pinned, ...live, ...rest];
}

export function feedHasLiveMatch<T extends FeedMatchLiveInput>(
  posts: T[],
  nowMs = Date.now(),
): boolean {
  return posts.some((p) => isFeedMatchLive(p, nowMs));
}
