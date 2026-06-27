import type { FeedPostView } from "@ctrend/shared/types/feed";
import { Dimensions } from "react-native";

const CARD_CONTENT_W = Dimensions.get("window").width - 24;
const MULTI_GRID_GAP = 3;
const MULTI_GRID_GAP_DENSE = 5;

const COMPARE_ROW_RECIPES: Record<number, number[]> = {
  2: [2],
  3: [2, 1],
  4: [2, 2],
  5: [3, 2],
  6: [3, 3],
  7: [4, 3],
  8: [3, 3, 2],
  9: [3, 3, 3],
  10: [3, 4, 3],
};

function getCompareRows(n: number): number[] {
  if (COMPARE_ROW_RECIPES[n]) return COMPARE_ROW_RECIPES[n];
  const rows: number[] = [];
  let rem = n;
  while (rem > 0) {
    rows.push(Math.min(4, rem));
    rem -= Math.min(4, rem);
  }
  return rows;
}

function getMobileCompareRows(n: number): number[] {
  if (n >= 5 && n <= 8) {
    const rows: number[] = [];
    let rem = n;
    while (rem > 0) {
      rows.push(Math.min(2, rem));
      rem -= Math.min(2, rem);
    }
    return rows;
  }
  return getCompareRows(n);
}

/** FlashList recycling key — separate pools per layout shape. */
export function getFeedItemType(post: FeedPostView): string {
  if (post.format === "announcement") return "announcement";
  if (post.format === "poll") return "poll";
  if (post.matchType) return "match";
  const n = post.imageUrls?.length ?? 0;
  if (n >= 2) return `compare-${Math.min(n, 10)}`;
  if (n === 1) return "single";
  return "text";
}

const FEED_CHROME_H = 230;

/** Approximate row height for FlashList `estimatedItemSize` / placeholders. */
export function estimateFeedPostHeight(post: FeedPostView): number {
  let media = 80;

  if (post.format === "announcement") {
    const n = post.imageUrls?.length ?? 0;
    media = n <= 1 ? 260 : 180 + Math.ceil(n / 2) * ((CARD_CONTENT_W - 2) / 2);
  } else if (post.format === "poll") {
    const opts = Math.max(post.postOptions?.length ?? 0, 2);
    media = 60 + opts * 58;
  } else {
    const n = post.imageUrls?.length ?? 0;
    if (n >= 2) {
      const rows = getMobileCompareRows(n);
      const maxCols = Math.max(...rows);
      const gap = n >= 5 || maxCols >= 3 ? MULTI_GRID_GAP_DENSE : MULTI_GRID_GAP;
      const cellW = Math.floor((CARD_CONTENT_W - (maxCols - 1) * gap) / maxCols);
      media = rows.length * cellW + (rows.length - 1) * gap + 36;
    } else if (n === 1) {
      media = Math.round(CARD_CONTENT_W * 0.85);
    }
  }

  if (post.campaign) media += 36;
  if (post.voteWinner?.user) media += 44;
  return FEED_CHROME_H + media;
}

export function estimateFeedMediaHeight(post: FeedPostView): number {
  return Math.max(80, estimateFeedPostHeight(post) - FEED_CHROME_H);
}
