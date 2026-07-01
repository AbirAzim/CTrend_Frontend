import {
	useApolloClient,
	useMutation,
	useSubscription,
} from '@apollo/client/react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import {
	ActivityIndicator,
	Alert,
	Animated,
	Dimensions,
	Easing,
	FlatList,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	TextInput,
	ToastAndroid,
	Vibration,
	View,
	type TextStyle,
} from 'react-native';
import {
	VOTE_POST,
	REMOVE_VOTE,
	SET_POST_HYPE,
	SET_POST_KEEP,
	POST_VOTE_UPDATED,
	POST_UPDATED,
	DELETE_POST,
	PIN_POST,
	UNPIN_POST,
	EXTEND_POST_VOTING,
	FEED_POSTS,
	VOTERS_BY_POST,
	HYPERS_BY_POST,
} from '@ctrend/shared/graphql/feed';
import { normalizeProfileImageUrl } from '@ctrend/shared/lib/profileImageUrl';
import { formatRelativeTime } from '@ctrend/shared/lib/formatRelativeTime';
import type { FeedPostView } from '@ctrend/shared/types/feed';
import { useAuth } from '../context/AuthContext';
import { useCoins } from '../context/CoinsContext';
import { COIN_AMOUNTS } from '@ctrend/shared/lib/coins';
import { isResolvedCampaignWinner } from '@ctrend/shared/lib/campaignWinner';
import { MatchPrediction } from './MatchPrediction';
import { useTheme } from '../context/ThemeContext';
import type { ColorPalette } from '../context/ThemeContext';
import { useSounds } from '../context/SoundContext';
import { useTabBar } from '../context/TabBarContext';
import { postWebUrl } from '../lib/postPermalink';
import * as Clipboard from 'expo-clipboard';
import { MODERATOR_PLATFORM_NAME } from '@ctrend/shared/lib/moderatorBrand';
import logoAsset from '../assets/logo.png';
import { PostCampaignBadge } from './PostCampaignBadge';
import { PostVoteWinnerBanner } from './PostVoteWinnerBanner';
import { PostCampaignWinnerBanner } from './PostCampaignWinnerBanner';
import { VoteCoachmark } from './VoteCoachmark';
import { imageContentPosition } from '../lib/imageFocal';
import {
	CONTENT_REPORT_REASONS,
	type ContentReportReasonId,
} from '@ctrend/shared/lib/contentReport';
import { submitContentReport } from '@ctrend/shared/lib/submitContentReport';
import { getApolloErrorMessage } from '../lib/apolloErrorMessage';
import { categoryChipColors, categoryChipColorsOrFallback } from '../lib/categoryColor';
import { LinkifyText } from '../lib/linkify';
import {
  isKnockoutStage,
} from '@ctrend/shared/lib/knockoutFixture';
import { knockoutRoundBadgeText } from '@ctrend/shared/lib/matchPredictionCopy';
import {
  feedCardLiveScores,
  formatKnockoutLivePrefix,
  formatKnockoutScoreChip,
  hasKnockoutScoreBreakdown,
  type MatchScoreBreakdown,
} from '@ctrend/shared/lib/matchScoreCopy';
import { ImageViewerModal } from './ImageViewerModal';

const { width: SCREEN_W } = Dimensions.get('window');

function feedImageProps() {
	return {
		transition: 0,
		cachePolicy: 'memory-disk' as const,
	};
}

// Card has marginHorizontal:12 on each side, so its inner content is narrower
// than the screen. Compare grids must size against this, not SCREEN_W.
const CARD_MARGIN_H = 12;
const CARD_CONTENT_W = SCREEN_W - CARD_MARGIN_H * 2;
const MULTI_GRID_GAP = 3;
const MULTI_GRID_GAP_DENSE = 5;

// Per-count compare grid recipes. Each entry is the number of images per row,
// top → bottom. Cells are all the same square size (sized to the widest row),
// short rows are centered, and nothing ever scrolls.
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

// Rows for n compare images. 2–10 use the hand-tuned recipes; 11+ fall back to
// rows of 4 (last row centered) so cells stay equal-sized and reasonable.
function getCompareRows(n: number): number[] {
	if (COMPARE_ROW_RECIPES[n]) return COMPARE_ROW_RECIPES[n];
	const rows: number[] = [];
	let rem = n;
	while (rem > 0) {
		const take = Math.min(4, rem);
		rows.push(take);
		rem -= take;
	}
	return rows;
}

/** Mobile feed: 5–8 option compares use 2 columns so cells stay legible. */
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

type CompareOverlayMode = 'full' | 'compact' | 'minimal' | 'slim';

function getCompareOverlayMode(
	compareCount: number,
	cellWidth: number,
): CompareOverlayMode {
	if (compareCount === 3) return 'slim';
	if (compareCount >= 9 || cellWidth < 115) return 'minimal';
	if (compareCount >= 5 || cellWidth < 160) return 'compact';
	return 'full';
}

const GREEN = '#22c55e';
const ORANGE = '#f97316';

// `#rrggbb` → `rgba(r,g,b,alpha)`, for tinting the theme accent at low opacity.
function withAlpha(hex: string, alpha: number): string {
	const h = hex.replace('#', '');
	const r = parseInt(h.slice(0, 2), 16);
	const g = parseInt(h.slice(2, 4), 16);
	const b = parseInt(h.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Per-option live-split bar colors — 10 distinct hues, matching the web
// `cx-pulse-fill--opt-0..9` palette (lighter gradient stop used as a solid bar).
// Indexed by option index % 10.
const MULTI_SPLIT_COLORS = [
	'#34d399', // 0 emerald
	'#fb923c', // 1 orange
	'#a78bfa', // 2 violet
	'#fb7185', // 3 rose
	'#fbbf24', // 4 amber
	'#22d3ee', // 5 cyan
	'#a3e635', // 6 lime
	'#14b8a6', // 7 teal
	'#38bdf8', // 8 sky
	'#e879f9', // 9 fuchsia
];

type Props = {
	post: FeedPostView;
	/** "detail" = rendered on the full-page post screen (skips live sub, hides Full-page chip). */
	variant?: 'feed' | 'detail';
	/** False when off-screen in feed — pauses live subs and animations. */
	isViewable?: boolean;
	/** Open comments sheet on mount (e.g. comment deep-link). */
	initialCommentsOpen?: boolean;
	/** Scroll to / highlight this comment when the sheet opens. */
	highlightCommentId?: string | null;
	/** Show the first-run tap-to-vote coach mark over the compare images. */
	showVoteCoachmark?: boolean;
	/** Called when the coach mark is dismissed. 'voted' retires it permanently;
	 *  'timeout' only hides it for this session (may reappear, capped by feed). */
	onCoachmarkDismiss?: (reason: 'voted' | 'timeout') => void;
};

type VoteLiveState = {
	upvoteCount: number;
	downvoteCount: number;
	viewerVote: FeedPostView['viewerVote'];
	mySelectedOptionIndex: number | null;
	optionStats: FeedPostView['optionStats'];
	isVotingOpen: boolean | null;
	votingEndsAt: string | null;
};

type PostVoteUpdatedData = {
	postVoteUpdated: {
		id: string;
		upvoteCount: number;
		downvoteCount: number;
		viewerVote?: 'UP' | 'DOWN' | null;
		mySelectedOptionIndex?: number | null;
		isVotingOpen?: boolean | null;
		votingEndsAt?: string | null;
		matchScore?: { status: string | null; home: number | null; away: number | null; winner: string | null; minute?: number | null } | null;
		optionStats?: Array<{
			index: number;
			label: string;
			count: number;
			percentage: number;
		}> | null;
	};
};

type VoteResultPayload =
	| {
			postId: string;
			totalVotes: number;
			countsPerOption: number[];
			percentages: number[];
	  }
	| null
	| undefined;

type VotePostData = { votePost?: VoteResultPayload };
type RemoveVoteData = { removeVote?: VoteResultPayload };

function compareLabel(post: FeedPostView, idx: number): string {
	const stat = post.optionStats?.find((s) => s.index === idx)?.label?.trim();
	if (stat) return stat;
	return post.postOptions?.[idx]?.label?.trim() ?? `Side ${idx + 1}`;
}

function matchTeamLabel(post: FeedPostView, idx: number): string {
	const opt = post.postOptions?.[idx]?.label?.trim();
	if (opt) return opt;
	return compareLabel(post, idx);
}

type OptionStat = NonNullable<FeedPostView['optionStats']>[number];

function viewerVoteForIntent(
	isBinary: boolean,
	intent: number,
): FeedPostView['viewerVote'] {
	if (!isBinary) {
		if (intent === 0) return 'UP';
		if (intent === 1) return 'DOWN';
		return null;
	}
	return intent === 0 ? 'UP' : 'DOWN';
}

function buildOptionStatsBase(
	post: FeedPostView,
	curStats: FeedPostView['optionStats'] | null | undefined,
	optionCount: number,
): OptionStat[] {
	const byIndex = new Map<number, OptionStat>();
	for (const s of curStats ?? post.optionStats ?? []) {
		byIndex.set(s.index, { ...s, count: Math.round(s.count) });
	}
	for (let i = 0; i < optionCount; i++) {
		if (!byIndex.has(i)) {
			byIndex.set(i, {
				index: i,
				label: compareLabel(post, i),
				count: 0,
				percentage: 0,
			});
		}
	}
	return Array.from(byIndex.values()).sort((a, b) => a.index - b.index);
}

function applyMultiVoteOptimistic(
	post: FeedPostView,
	curStats: FeedPostView['optionStats'] | null | undefined,
	curMyIdx: number | null,
	intent: number,
	optionCount: number,
): OptionStat[] {
	const stats = buildOptionStatsBase(post, curStats, optionCount);
	const updated = stats.map((s) => {
		let c = s.count;
		if (s.index === intent) c += 1;
		if (curMyIdx !== null && s.index === curMyIdx && curMyIdx !== intent) {
			c = Math.max(0, c - 1);
		}
		return { ...s, count: c };
	});
	const total = updated.reduce((sum, s) => sum + s.count, 0);
	return updated.map((s) => ({
		...s,
		percentage: total > 0 ? (s.count / total) * 100 : 0,
	}));
}

function optionStatsFromCounts(
	post: FeedPostView,
	prevStats: FeedPostView['optionStats'] | null | undefined,
	counts: number[],
	pcts: number[],
	optionCount: number,
): OptionStat[] {
	const base = buildOptionStatsBase(post, prevStats, optionCount);
	const total = counts.reduce((a, b) => a + b, 0);
	return base.map((s) => ({
		...s,
		count: counts[s.index] ?? s.count,
		percentage:
			pcts[s.index] ??
			(total > 0 ? ((counts[s.index] ?? 0) / total) * 100 : 0),
	}));
}

function PollBodyImage({ uri, radius, bg }: { uri: string; radius: number; bg: string }) {
	// Fixed-height container: layout never changes so there is no jump/shake.
	// contentFit='contain' shows the full image inside the box (letterboxed if needed).
	// Letterbox bars use the card surface so they follow the active theme.
	const availW = CARD_CONTENT_W - 28;
	const fixedH = Math.round(availW * 1.0); // square container fits portrait and landscape
	return (
		<View style={{ width: availW, height: fixedH, borderRadius: radius, overflow: 'hidden', backgroundColor: bg, alignSelf: 'center' }}>
			<Image
				source={{ uri }}
				style={{ width: '100%', height: '100%' }}
				contentFit='contain'
				cachePolicy='memory-disk'
			/>
		</View>
	);
}

function calcCountdown(endsAt: string | null | undefined): string | null {
	if (!endsAt) return null;
	const ms = new Date(endsAt).getTime() - Date.now();
	if (ms <= 0) return null;
	const totalSec = Math.floor(ms / 1000);
	const d = Math.floor(totalSec / 86400);
	const h = Math.floor((totalSec % 86400) / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	const pad = (n: number) => String(n).padStart(2, '0');
	if (d > 0) return `${d}D ${h}H ${m}M ${pad(s)}S`;
	if (h > 0) return `${h}H ${m}M ${pad(s)}S`;
	return `${m}M ${pad(s)}S`;
}

function calcWinnerCountdown(winnerAt: string | null | undefined): string | null {
	if (!winnerAt) return null;
	const ms = new Date(winnerAt).getTime() - Date.now();
	if (ms <= 0) return null;
	const totalSec = Math.floor(ms / 1000);
	const m = Math.floor(totalSec / 60);
	const s = totalSec % 60;
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${m}:${pad(s)}`;
}

function computeWinnerSummary(
	isMulti: boolean,
	up: number,
	down: number,
	stats:
		| Array<{ index: number; label: string; count: number; percentage: number }>
		| null
		| undefined,
	getLabel: (i: number) => string,
	isMatch = false,
): string {
	const verb = isMatch ? 'leads' : 'won';
	if (isMulti && stats && stats.length > 0) {
		const total = stats.reduce((s, o) => s + o.count, 0);
		if (total === 0) return 'No votes were cast';
		const maxCount = Math.max(...stats.map((s) => s.count));
		const winners = stats.filter((s) => s.count === maxCount);
		if (winners.length > 1) {
			const pct = Math.round((100 * maxCount) / total);
			return `Tie at ${pct}%`;
		}
		const w = winners[0];
		const pct = Math.round(w.percentage);
		return `${w.label?.trim() || getLabel(w.index)} ${verb} · ${pct}% (${total.toLocaleString()} votes)`;
	}
	const total = up + down;
	if (total === 0) return 'No votes were cast';
	if (up === down) return 'Tie · 50% each';
	const winner = up > down ? getLabel(0) : getLabel(1);
	const winCount = Math.max(up, down);
	const pct = Math.round((100 * winCount) / total);
	return `${winner} ${verb} · ${pct}% (${total.toLocaleString()} votes)`;
}

function makeStyles(c: ColorPalette, isDark: boolean) {
	return {
		card: {
			backgroundColor: c.card,
			marginBottom: 18,
			marginHorizontal: 12,
			borderRadius: 18,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: c.border,
			overflow: 'hidden' as const,
			// Android elevation during scroll causes extra overdraw — border only.
			...(Platform.OS === 'android'
				? { elevation: 0 }
				: {
						elevation: 2,
						shadowColor: '#000',
						shadowOffset: { width: 0, height: 3 },
						shadowOpacity: isDark ? 0.18 : 0.05,
						shadowRadius: 10,
					}),
		},
		cardLive: {
			borderColor: isDark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.24)',
			borderWidth: 1,
		},
		liveCardGlow: {
			borderRadius: 18,
			borderWidth: 1.5,
		},
		header: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			paddingHorizontal: 14,
			paddingVertical: 13,
		},
		authorRow: {
			flex: 1,
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			gap: 10,
		},
		avatarWrap: {
			width: 38,
			height: 38,
			borderRadius: 19,
			overflow: 'hidden' as const,
		},
		avatar: { width: 38, height: 38, borderRadius: 19 },
		avatarFallback: {
			backgroundColor: '#312e81',
			justifyContent: 'center' as const,
			alignItems: 'center' as const,
		},
		avatarText: { color: '#ffffff', fontSize: 15, fontWeight: '700' as const },
		authorMeta: { flex: 1 },
		authorNameRow: {
			flexDirection: 'row' as const,
			flexWrap: 'wrap' as const,
			alignItems: 'center' as const,
			gap: 6,
		},
		authorName: {
			fontSize: 14,
			fontWeight: '800' as const,
			color: c.text,
			letterSpacing: 0.1,
		},
		// Single quiet meta line under the name — replaces the old 4-badge wall
		// with plain text + "·" separators, e.g. "Platform · Sports · 18h ago".
		metaRow: {
			flexDirection: 'row' as const,
			flexWrap: 'wrap' as const,
			alignItems: 'center' as const,
			marginTop: 1,
		},
		metaText: { fontSize: 12, fontWeight: '500' as const, color: c.subtext },
		pinnedMeta: { color: c.accent, fontWeight: '700' as const },
		metaSep: { fontSize: 12, color: c.muted },
		metaGlobalBadge: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			gap: 3,
			paddingHorizontal: 8,
			paddingVertical: 1,
			borderRadius: 999,
		},
		metaGlobalText: {
			fontSize: 11,
			fontWeight: '700' as const,
			textTransform: 'uppercase' as const,
			letterSpacing: 0.5,
		},
		metaCatRow: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			gap: 4,
		},
		// The category's hashed color survives only as this small dot.
		metaDot: { width: 6, height: 6, borderRadius: 3 },
		matchScoreBadge: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			gap: 5,
			alignSelf: 'flex-start' as const,
			marginTop: 4,
			borderRadius: 999,
			borderWidth: 1,
			borderColor: c.border,
			backgroundColor: c.section,
			paddingHorizontal: 8,
			paddingVertical: 2,
		},
		matchScoreText: {
			fontSize: 10,
			fontWeight: '800' as const,
			letterSpacing: 0.3,
			color: c.subtext,
		},
		endingSoonBanner: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			gap: 8,
			paddingHorizontal: 14,
			paddingVertical: 9,
			backgroundColor: isDark ? 'rgba(245,158,11,0.16)' : 'rgba(245,158,11,0.15)',
			borderBottomWidth: 1,
			borderBottomColor: isDark ? 'rgba(245,158,11,0.32)' : 'rgba(217,160,23,0.32)',
		},
		endingSoonIcon: { fontSize: 14 },
		endingSoonText: {
			flex: 1,
			fontSize: 12.5,
			fontWeight: '700' as const,
			color: isDark ? '#fcd34d' : '#b45309',
		},
		endingSoonStrong: { fontWeight: '800' as const },
		knockoutStrip: {
			marginHorizontal: 12,
			marginBottom: 8,
			paddingHorizontal: 12,
			paddingVertical: 8,
			borderRadius: 10,
			backgroundColor: isDark ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.12)',
			borderWidth: 1,
			borderColor: isDark ? 'rgba(245,158,11,0.28)' : 'rgba(245,158,11,0.35)',
			gap: 4,
		},
		knockoutVoteHint: { fontSize: 11, color: c.subtext, lineHeight: 15 },
		moreBtn: { padding: 8 },
		moreBtnText: { fontSize: 20, color: c.subtext, letterSpacing: 2 },
		caption: {
			paddingHorizontal: 14,
			paddingTop: 2,
			paddingBottom: 14,
			fontSize: 15,
			color: c.text,
			lineHeight: 22,
			fontWeight: '400' as const,
		},
		captionAnnouncement: {
			fontSize: 15,
			lineHeight: 23,
			paddingBottom: 12,
		},
		annHeader: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			paddingHorizontal: 14,
			paddingVertical: 7,
			backgroundColor: isDark ? 'rgba(234,88,12,0.15)' : 'rgba(234,88,12,0.09)',
			borderTopWidth: 1,
			borderBottomWidth: 1,
			borderColor: isDark ? 'rgba(234,88,12,0.35)' : 'rgba(234,88,12,0.22)',
		},
		annHeaderText: {
			fontSize: 11,
			fontWeight: '800' as const,
			letterSpacing: 0.8,
			color: isDark ? '#fb923c' : '#c2410c',
		},
		compareSection: {
			paddingHorizontal: 10,
			paddingTop: 8,
			paddingBottom: 4,
		},
		compareWrap: { flexDirection: 'row' as const, gap: 6 },
		compareCell: {
			flex: 1,
			aspectRatio: 4 / 5,
			borderRadius: 14,
			overflow: 'hidden' as const,
		},
		compareCellLoser: { opacity: 0.78 },
		// Colored glow border on the cell the viewer picked (mirrors web's
		// `box-shadow: inset 0 0 0 3px <optionColor>`).
		compareCellPicked: { borderWidth: 2.5 },
		compareImg: { width: '100%' as const, height: '100%' as const },
		// Slim bottom strip for 2-option compares (~10% of cell height).
		binaryOverlay: {
			position: 'absolute' as const,
			bottom: 0,
			left: 0,
			right: 0,
			paddingTop: 5,
			paddingHorizontal: 6,
			paddingBottom: 0,
			backgroundColor: 'rgba(0,0,0,0.55)',
		},
		binaryOverlayPreview: {
			backgroundColor: 'rgba(0,0,0,0.42)',
		},
		binaryOverlayInner: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			justifyContent: 'center' as const,
			gap: 5,
			paddingBottom: 4,
		},
		binaryOverlayPct: {
			color: '#ffffff',
			fontSize: 13,
			fontWeight: '900' as const,
			fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
			letterSpacing: -0.3,
		},
		binaryOverlayLabel: {
			flexShrink: 1,
			color: '#ffffff',
			fontSize: 11,
			fontWeight: '700' as const,
			textAlign: 'center' as const,
		},
		binaryOverlayMeter: {
			height: 3,
			backgroundColor: 'rgba(255,255,255,0.22)',
			overflow: 'hidden' as const,
		},
		binaryOverlayMeterFill: {
			height: '100%' as const,
		},
		pctOverlay: {
			position: 'absolute' as const,
			bottom: 0,
			left: 0,
			right: 0,
			paddingTop: 14,
			paddingBottom: 10,
			paddingHorizontal: 8,
			alignItems: 'center' as const,
			backgroundColor: 'rgba(0,0,0,0.42)',
		},
		pctOverlayPreview: {
			paddingTop: 10,
			paddingBottom: 8,
			backgroundColor: 'rgba(0,0,0,0.36)',
		},
		// Percentage shown inside a glassy rounded pill (web `ig-compare-pct-main`).
		pctMainPill: {
			minWidth: 52,
			paddingHorizontal: 11,
			paddingVertical: 3,
			borderRadius: 999,
			backgroundColor: 'rgba(2,6,23,0.55)',
			borderWidth: 1,
			borderColor: 'rgba(255,255,255,0.22)',
			alignItems: 'center' as const,
			justifyContent: 'center' as const,
		},
		pctText: {
			color: '#ffffff',
			fontSize: 18,
			fontWeight: '900' as const,
			letterSpacing: -0.5,
		},
		pctLabel: {
			color: 'rgba(255,255,255,0.92)',
			fontSize: 11,
			marginTop: 4,
			fontWeight: '600' as const,
			textAlign: 'center' as const,
		},
		// Per-cell progress meter under the label (web `ig-compare-meter`).
		compareMeter: {
			width: '82%' as const,
			height: 6,
			borderRadius: 999,
			backgroundColor: 'rgba(255,255,255,0.24)',
			overflow: 'hidden' as const,
			marginTop: 6,
		},
		compareMeterFill: {
			height: '100%' as const,
			borderRadius: 999,
		},
		votedBadgeRow: {
			position: 'absolute' as const,
			top: 8,
			left: 8,
			alignItems: 'flex-start' as const,
		},
		// Glassy green "VOTED" pin, top-left (mirrors web `cx-voted-pin`).
		votedBadge: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			gap: 4,
			backgroundColor: 'rgba(16,185,129,0.32)',
			borderRadius: 99,
			borderWidth: 1,
			borderColor: 'rgba(110,231,183,0.55)',
			paddingHorizontal: 9,
			paddingVertical: 4,
		},
		votedBadgeText: {
			color: '#eafff5',
			fontSize: 11,
			fontWeight: '800' as const,
			letterSpacing: 0.6,
		},
		// Compact cell: thin dark strip at the very bottom edge — just the % number.
		// The image is fully visible; a green/gold border on the wrapper signals voted/winner.
		compactStrip: {
			position: 'absolute' as const,
			bottom: 0,
			left: 0,
			right: 0,
			paddingVertical: 4,
			backgroundColor: 'rgba(0,0,0,0.52)',
			alignItems: 'center' as const,
			justifyContent: 'center' as const,
		},
		compactPct: {
			color: '#ffffff',
			fontSize: 11,
			fontWeight: '800' as const,
			letterSpacing: -0.2,
		},
		// Medium-density overlay: bottom scrim with label + inline % + slim bar.
		compactOverlay: {
			position: 'absolute' as const,
			bottom: 0,
			left: 0,
			right: 0,
			paddingTop: 18,
			paddingBottom: 8,
			paddingHorizontal: 8,
			backgroundColor: 'rgba(0,0,0,0.45)',
		},
		compactLabel: {
			color: '#ffffff',
			fontSize: 12,
			fontWeight: '700' as const,
			textAlign: 'center' as const,
			marginBottom: 5,
		},
		compactMetaRow: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			gap: 6,
		},
		compactMeter: {
			flex: 1,
			height: 4,
			borderRadius: 999,
			backgroundColor: 'rgba(255,255,255,0.22)',
			overflow: 'hidden' as const,
		},
		compactMeterFill: {
			height: '100%' as const,
			borderRadius: 999,
		},
		compactPctInline: {
			color: '#ffffff',
			fontSize: 12,
			fontWeight: '800' as const,
			minWidth: 34,
			textAlign: 'right' as const,
		},
		votedRing: {
			borderWidth: 1.5,
			borderColor: 'rgba(34,197,94,0.45)',
		},
		winnerRing: {
			borderWidth: 1.5,
			borderColor: 'rgba(245,158,11,0.5)',
		},
		// Ultra-dense: image-first with only a colored edge bar; labels live below.
		minimalBar: {
			position: 'absolute' as const,
			bottom: 0,
			left: 0,
			right: 0,
			height: 4,
			flexDirection: 'row' as const,
			backgroundColor: 'rgba(255,255,255,0.18)',
		},
		minimalBarFill: {
			height: '100%' as const,
		},
		// 3-option row: image stays clear; label + % live below the tile.
		multiCellTrio: {
			flexDirection: 'column' as const,
			alignItems: 'stretch' as const,
		},
		trioImageBox: {
			overflow: 'hidden' as const,
			backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.05)',
		},
		// Poll-style subtle edge + always-visible label strip on the image.
		trioEdgeBar: {
			position: 'absolute' as const,
			bottom: 0,
			left: 0,
			right: 0,
			height: 2,
			backgroundColor: 'rgba(255,255,255,0.14)',
			overflow: 'hidden' as const,
		},
		trioEdgeBarFill: {
			height: '100%' as const,
		},
		trioLabelStrip: {
			position: 'absolute' as const,
			bottom: 0,
			left: 0,
			right: 0,
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			justifyContent: 'center' as const,
			gap: 4,
			paddingTop: 6,
			paddingBottom: 6,
			paddingHorizontal: 5,
			backgroundColor: 'rgba(0,0,0,0.62)',
		},
		trioLabelStripWithBar: {
			paddingBottom: 8,
		},
		trioLabelDot: {
			width: 6,
			height: 6,
			borderRadius: 3,
			flexShrink: 0,
		},
		trioLabelOnImage: {
			flexShrink: 1,
			color: '#ffffff',
			fontSize: 11,
			fontWeight: '700' as const,
			textAlign: 'center' as const,
			lineHeight: 14,
			textShadowColor: 'rgba(0,0,0,0.45)',
			textShadowOffset: { width: 0, height: 1 },
			textShadowRadius: 2,
		},
		trioLabelOnImageVoted: {
			color: '#bbf7d0',
		},
		trioWinnerMark: {
			position: 'absolute' as const,
			top: 6,
			left: 6,
			paddingHorizontal: 6,
			paddingVertical: 2,
			borderRadius: 999,
			backgroundColor: 'rgba(245,158,11,0.9)',
		},
		trioWinnerMarkText: {
			fontSize: 10,
			fontWeight: '800' as const,
			color: '#1c1917',
		},
		compareLegendScroll: {
			marginTop: 8,
			paddingHorizontal: 2,
		},
		compareLegendRow: {
			flexDirection: 'row' as const,
			gap: 6,
			paddingHorizontal: 2,
		},
		compareLegendChip: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			gap: 5,
			paddingHorizontal: 9,
			paddingVertical: 5,
			borderRadius: 999,
			backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
			borderWidth: 1,
			borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)',
			maxWidth: 148,
		},
		compareLegendChipVoted: {
			borderColor: 'rgba(34,197,94,0.55)',
			backgroundColor: 'rgba(34,197,94,0.12)',
		},
		compareLegendDot: {
			width: 7,
			height: 7,
			borderRadius: 4,
		},
		compareLegendText: {
			flexShrink: 1,
			fontSize: 11,
			fontWeight: '600' as const,
			color: c.text,
		},
		compareLegendPct: {
			fontSize: 11,
			fontWeight: '800' as const,
			color: c.subtext,
		},
		winnerBadgeRow: {
			position: 'absolute' as const,
			top: 12,
			left: 0,
			right: 0,
			alignItems: 'center' as const,
		},
		winnerBadge: {
			backgroundColor: '#f59e0b',
			borderRadius: 99,
			paddingHorizontal: 12,
			paddingVertical: 5,
		},
		winnerBadgeText: {
			color: '#ffffff',
			fontSize: 11,
			fontWeight: '800' as const,
		},
		voteHintRow: {
			marginHorizontal: 10,
			marginTop: 6,
			marginBottom: 2,
			paddingVertical: 8,
			paddingHorizontal: 12,
			borderRadius: 12,
			backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)',
			borderWidth: 1,
			borderColor: c.border,
			alignItems: 'center' as const,
		},
		voteHintText: { fontSize: 12, fontWeight: '600' as const, color: c.subtext, textAlign: 'center' as const },
		voteHintRecorded: { color: GREEN, fontWeight: '700' as const },
		countdownRow: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			justifyContent: 'space-between' as const,
			paddingHorizontal: 14,
			paddingBottom: 10,
		},
		countdownPill: {
			backgroundColor: c.section,
			borderRadius: 99,
			paddingHorizontal: 14,
			paddingVertical: 6,
			borderWidth: 1,
			borderColor: c.border,
		},
		countdownText: {
			fontSize: 12,
			fontWeight: '800' as const,
			color: c.text,
			letterSpacing: 0.5,
		},
		seeDetailsBtn: {
			borderWidth: 1,
			borderColor: c.border,
			borderRadius: 99,
			paddingHorizontal: 14,
			paddingVertical: 6,
		},
		seeDetailsBtnText: {
			fontSize: 11,
			fontWeight: '700' as const,
			color: c.subtext,
		},
		liveSplit: { paddingHorizontal: 10, paddingBottom: 10 },
		splitPanel: {
			marginBottom: 8,
			padding: 12,
			borderRadius: 14,
			borderWidth: 1,
			borderColor: c.border,
			backgroundColor: c.section,
			gap: 10,
		},
		splitPanelFinal: {
			borderColor: 'rgba(245,158,11,0.35)',
		},
		splitPanelHead: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			justifyContent: 'space-between' as const,
			gap: 10,
		},
		splitTitleWrap: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			gap: 8,
			flex: 1,
			minWidth: 0,
		},
		splitLiveBadge: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			gap: 5,
			paddingHorizontal: 8,
			paddingVertical: 3,
			borderRadius: 99,
			backgroundColor: isDark ? 'rgba(6,78,59,0.55)' : '#ecfdf5',
			borderWidth: 1,
			borderColor: 'rgba(16,185,129,0.35)',
		},
		splitLiveDot: {
			width: 6,
			height: 6,
			borderRadius: 3,
			backgroundColor: '#10b981',
		},
		splitLiveText: {
			fontSize: 10,
			fontWeight: '800' as const,
			color: isDark ? '#6ee7b7' : '#047857',
			letterSpacing: 0.8,
		},
		splitFinalBadge: {
			paddingHorizontal: 8,
			paddingVertical: 3,
			borderRadius: 99,
			backgroundColor: isDark ? 'rgba(120,53,15,0.45)' : '#fffbeb',
			borderWidth: 1,
			borderColor: 'rgba(245,158,11,0.45)',
		},
		splitFinalBadgeText: {
			fontSize: 10,
			fontWeight: '800' as const,
			color: isDark ? '#fcd34d' : '#92400e',
			letterSpacing: 0.8,
		},
		splitPanelTitle: {
			fontSize: 14,
			fontWeight: '800' as const,
			color: c.text,
			flexShrink: 1,
		},
		splitPanelMetric: {
			fontSize: 12,
			fontWeight: '700' as const,
			color: c.muted,
		},
		splitDuel: {
			flexDirection: 'row' as const,
			height: 7,
			borderRadius: 99,
			overflow: 'hidden' as const,
			backgroundColor: c.border,
			gap: 2,
		},
		splitDuelSeg: { minWidth: 2 },
		splitRows: { gap: 8 },
		splitRow: {
			position: 'relative' as const,
			borderWidth: 1,
			borderColor: c.border,
			borderRadius: 12,
			backgroundColor: c.card,
			overflow: 'hidden' as const,
		},
		splitRowLeader: {
			borderColor: withAlpha(c.accent, 0.45),
			shadowColor: '#000',
			shadowOffset: { width: 0, height: 2 },
			shadowOpacity: isDark ? 0.25 : 0.08,
			shadowRadius: 6,
			elevation: 2,
		},
		splitRowWinner: {
			borderColor: 'rgba(245,158,11,0.45)',
			borderLeftWidth: 3,
		},
		splitRowLoser: { opacity: 0.68 },
		splitRowFill: {
			position: 'absolute' as const,
			left: 0,
			top: 0,
			bottom: 0,
			opacity: 0.2,
		},
		splitRowInner: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			gap: 8,
			paddingHorizontal: 12,
			paddingVertical: 10,
			minHeight: 46,
		},
		splitSwatch: {
			width: 10,
			height: 10,
			borderRadius: 5,
		},
		splitRowLabel: {
			flex: 1,
			fontSize: 13.5,
			fontWeight: '700' as const,
			color: c.text,
		},
		splitRowStats: { alignItems: 'flex-end' as const, gap: 1 },
		splitRowPct: {
			fontSize: 15,
			fontWeight: '800' as const,
			color: c.text,
		},
		splitRowCount: {
			fontSize: 11,
			fontWeight: '700' as const,
			color: c.muted,
		},
		splitVotersBtn: {
			borderWidth: 1,
			borderColor: c.border,
			borderRadius: 99,
			paddingHorizontal: 9,
			paddingVertical: 5,
			backgroundColor: c.section,
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			gap: 4,
		},
		splitVotersBtnText: {
			fontSize: 11,
			fontWeight: '700' as const,
			color: c.subtext,
		},
		// ── Poll format — stacked option rows (per-option colour + voter chip) ──
		pollBodyMedia: { paddingHorizontal: 14, paddingBottom: 6, gap: 6 },
		pollBodyImage: { width: '100%' as const, height: 200, borderRadius: 10 },
		pollOptions: { paddingHorizontal: 14, paddingTop: 10, gap: 10 },
		// Neutral card row with a soft drop shadow for depth — the saturated lead
		// edge (green once results show, accent for the viewer's pick before then)
		// and the persistent accent border on the viewer's own pick are the only
		// color accents, but the row itself now has enough weight to not read flat.
		pollRow: {
			position: 'relative' as const,
			borderWidth: 1,
			borderColor: c.border,
			borderRadius: 14,
			backgroundColor: c.section,
			overflow: 'hidden' as const,
			shadowColor: '#000',
			shadowOffset: { width: 0, height: 1 },
			shadowOpacity: isDark ? 0.3 : 0.06,
			shadowRadius: 3,
			elevation: 1,
		},
		pollRowPicked: {
			borderColor: withAlpha(c.accent, 0.42),
			borderWidth: 1.5,
		},
		pollRowWinner: { borderColor: 'rgba(245,158,11,0.35)', borderWidth: 1.5 },
		pollRowLoser: { opacity: 0.55 },
		pollFill: {
			position: 'absolute' as const,
			left: 0,
			top: 0,
			bottom: 0,
			opacity: 0.2,
		},
		pollRowContent: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			gap: 10,
			paddingHorizontal: 12,
			paddingVertical: 11,
			minHeight: 50,
		},
		pollThumb: { width: 40, height: 40, borderRadius: 10 },
		pollDot: {
			width: 18,
			height: 18,
			borderRadius: 9,
			borderWidth: 2,
			borderColor: c.muted,
		},
		pollLabel: {
			flex: 1,
			fontSize: 14.5,
			fontWeight: '700' as const,
			color: c.text,
		},
		pollPct: {
			fontSize: 16,
			fontWeight: '800' as const,
			color: c.text,
			minWidth: 38,
			textAlign: 'right' as const,
		},
		pollCheck: { fontSize: 15, fontWeight: '800' as const, color: c.accent },
		pollVotersChip: {
			borderRadius: 999,
			backgroundColor: c.card,
			borderWidth: 1,
			borderColor: c.border,
			paddingHorizontal: 7,
			paddingVertical: 2,
		},
		pollVotersText: { fontSize: 11.5, fontWeight: '600' as const, color: c.subtext },
		anonRow: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			justifyContent: 'space-between' as const,
			paddingHorizontal: 14,
			paddingVertical: 6,
			gap: 10,
		},
		anonRowEnd: {
			justifyContent: 'flex-end' as const,
		},
		roundBadge: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			gap: 5,
			backgroundColor: 'rgba(245,158,11,0.14)',
			borderRadius: 999,
			paddingHorizontal: 10,
			paddingVertical: 5,
			borderWidth: 1,
			borderColor: 'rgba(245,158,11,0.35)',
			flexShrink: 1,
			maxWidth: '58%' as const,
		},
		roundBadgeIcon: { fontSize: 11 },
		roundBadgeText: {
			fontSize: 11,
			fontWeight: '800' as const,
			color: '#d97706',
			flexShrink: 1,
		},
		anonPill: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			gap: 8,
			paddingHorizontal: 14,
			paddingVertical: 7,
			borderRadius: 20,
			borderWidth: 1,
			borderColor: c.border,
			backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
			flexShrink: 0,
		},
		anonPillActive: {
			backgroundColor: isDark ? 'rgba(139,92,246,0.18)' : 'rgba(109,40,217,0.1)',
			borderColor: isDark ? 'rgba(139,92,246,0.4)' : 'rgba(109,40,217,0.35)',
		},
		anonIcon: { fontSize: 15 },
		anonLabel: {
			fontSize: 12,
			fontWeight: '600' as const,
			color: c.text,
		},
		anonLabelActive: {
			color: isDark ? '#c4b5fd' : '#6d28d9',
		},
		// ── Two-zone action rail ──
		// Flush, full-width row separated from the media/vote area by a single
		// hairline — no inset box-in-box border, tint, or margin. Reads as part
		// of the card instead of a floating panel.
		actionRail: {
			marginTop: 2,
			borderTopWidth: StyleSheet.hairlineWidth,
			borderTopColor: c.border,
		},
		actionRailIcons: {
			flexDirection: 'row' as const,
			justifyContent: 'space-evenly' as const,
			alignItems: 'center' as const,
			flexWrap: 'wrap' as const,
			paddingVertical: 6,
			paddingHorizontal: 6,
			gap: 2,
		},
		actionChipFlat: {
			alignItems: 'center' as const,
			justifyContent: 'center' as const,
			borderRadius: 999,
			padding: 10,
		},
		actionChipFlatHypeActive: {
			backgroundColor: isDark
				? 'rgba(251,113,133,0.14)'
				: 'rgba(159,23,77,0.1)',
		},
		actionChipFlatSaveActive: {
			backgroundColor: withAlpha(c.accent, isDark ? 0.16 : 0.1),
		},
		actionChipFlatCommentActive: {
			backgroundColor: withAlpha(c.accent, isDark ? 0.18 : 0.12),
		},
		// Icon + superscript badge wrapper
		chipIconWrap: {
			position: 'relative' as const,
			width: 26,
			height: 26,
			alignItems: 'center' as const,
			justifyContent: 'center' as const,
		},
		actionChipFlatIcon: { fontSize: 18, lineHeight: 21, color: c.subtext },
		actionChipFlatIconHype: { color: '#fb7185' },
		actionChipFlatIconSave: { color: c.accent },
		// Emoji ignore text color — dim inactive emoji icons so the active state reads clearly
		actionChipFlatIconDim: { opacity: 0.4 },
		// Superscript notification badge
		chipBadge: {
			position: 'absolute' as const,
			top: -5,
			right: -7,
			minWidth: 15,
			height: 15,
			borderRadius: 8,
			alignItems: 'center' as const,
			justifyContent: 'center' as const,
			paddingHorizontal: 3,
			borderWidth: 1.5,
			borderColor: c.card,
			backgroundColor: isDark ? '#4338ca' : '#4338ca',
		},
		chipBadgeRose: { backgroundColor: isDark ? '#e11d48' : '#be123c' },
		chipBadgeAmber: { backgroundColor: isDark ? '#d97706' : '#b45309' },
		chipBadgeVoters: { backgroundColor: isDark ? '#0e7490' : '#0369a1' },
		chipBadgeText: {
			fontSize: 8,
			fontWeight: '900' as const,
			color: '#ffffff',
			lineHeight: 11,
			fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
		},
		commentComposerStub: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			gap: 10,
			marginHorizontal: 12,
			marginBottom: 10,
			paddingVertical: 4,
		},
		commentStubAvatar: {
			width: 32,
			height: 32,
			borderRadius: 16,
			backgroundColor: '#312e81',
			alignItems: 'center' as const,
			justifyContent: 'center' as const,
			overflow: 'hidden' as const,
		},
		commentStubAvatarText: {
			color: '#fff',
			fontSize: 13,
			fontWeight: '700' as const,
		},
		commentStubPill: {
			flex: 1,
			borderRadius: 20,
			backgroundColor: c.section,
			borderWidth: 1,
			borderColor: c.border,
			paddingHorizontal: 14,
			paddingVertical: 10,
		},
		commentStubPlaceholder: {
			fontSize: 14,
			color: c.muted,
			fontWeight: '500' as const,
		},
		commentCountLink: {
			marginHorizontal: 12,
			marginBottom: 6,
			paddingVertical: 2,
		},
		commentCountLinkText: {
			fontSize: 13,
			fontWeight: '700' as const,
			color: c.subtext,
		},
		// Voters sheet
		votersOverlay: {
			flex: 1,
			backgroundColor: 'rgba(0,0,0,0.45)',
			justifyContent: 'flex-end' as const,
		},
		votersSheet: {
			borderTopLeftRadius: 22,
			borderTopRightRadius: 22,
			borderWidth: 1,
			borderBottomWidth: 0,
			borderColor: isDark ? 'rgba(148,163,184,0.24)' : 'rgba(67,56,202,0.14)',
			backgroundColor: c.card,
			maxHeight: Math.round(Dimensions.get('window').height * 0.82),
		},
		votersHandle: {
			width: 36,
			height: 4,
			borderRadius: 2,
			backgroundColor: c.border,
			alignSelf: 'center' as const,
			marginTop: 10,
		},
		votersHeader: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			justifyContent: 'space-between' as const,
			paddingHorizontal: 16,
			paddingVertical: 12,
			borderBottomWidth: 1,
			borderBottomColor: c.border,
		},
		votersTitle: { fontSize: 15, fontWeight: '800' as const, color: c.text },
		votersCloseBtn: { padding: 4 },
		votersCloseText: {
			fontSize: 16,
			color: c.muted,
			fontWeight: '700' as const,
		},
		votersSearch: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			gap: 8,
			paddingHorizontal: 12,
			paddingVertical: 8,
			borderBottomWidth: StyleSheet.hairlineWidth,
			borderBottomColor: c.border,
		},
		votersSearchInput: {
			flex: 1,
			fontSize: 14,
			color: c.text,
			backgroundColor: c.section,
			borderRadius: 12,
			paddingHorizontal: 12,
			paddingVertical: 7,
		},
		votersTabRow: {
			flexDirection: 'row' as const,
			gap: 6,
			paddingHorizontal: 12,
			paddingVertical: 8,
		},
		votersTab: {
			paddingHorizontal: 12,
			paddingVertical: 5,
			borderRadius: 999,
			borderWidth: 1,
			borderColor: c.border,
		},
		votersTabActive: { backgroundColor: c.accent, borderColor: c.accent },
		votersTabText: {
			fontSize: 11,
			fontWeight: '700' as const,
			color: c.subtext,
		},
		votersTabTextActive: { color: '#fff' },
		voterRow: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			paddingHorizontal: 14,
			paddingVertical: 10,
			gap: 10,
			borderBottomWidth: StyleSheet.hairlineWidth,
			borderBottomColor: c.border,
		},
		voterAvatar: {
			width: 36,
			height: 36,
			borderRadius: 18,
			backgroundColor: '#312e81',
			alignItems: 'center' as const,
			justifyContent: 'center' as const,
			overflow: 'hidden' as const,
		},
		voterAvatarText: {
			color: '#fff',
			fontSize: 14,
			fontWeight: '700' as const,
		},
		voterName: { fontSize: 13, fontWeight: '700' as const, color: c.text },
		voterTime: { fontSize: 11, color: c.muted, marginTop: 1 },
		voterOptionTag: {
			paddingHorizontal: 7,
			paddingVertical: 3,
			borderRadius: 999,
			borderWidth: 1,
		},
		voterOptionTagText: { fontSize: 10, fontWeight: '700' as const },
		voterEmpty: {
			textAlign: 'center' as const,
			paddingVertical: 24,
			color: c.muted,
			fontSize: 13,
		},
		// Zone 2 — context line
		actionRailContext: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			justifyContent: 'space-between' as const,
			gap: 10,
			paddingVertical: 9,
			paddingHorizontal: 14,
			borderTopWidth: StyleSheet.hairlineWidth,
			borderTopColor: c.border,
		},
		actionStatusText: {
			flex: 1,
			fontSize: 12,
			fontWeight: '700' as const,
			letterSpacing: 0.01,
			color: c.subtext,
		},
		actionStatusTextResult: { color: GREEN },
		seeDetailsBtn2: {
			borderRadius: 8,
			paddingVertical: 4,
			paddingHorizontal: 6,
			flexShrink: 0,
		},
		seeDetailsBtnText2: {
			fontSize: 12,
			fontWeight: '800' as const,
			color: c.accent,
		},
		iconDiscussOuter: { width: 20, height: 19 },
		iconDiscussBubble: {
			width: 18,
			height: 15,
			borderWidth: 1.5,
			borderColor: c.subtext,
			borderRadius: 8,
		},
		iconDiscussTail: {
			position: 'absolute' as const,
			bottom: 0,
			left: 4,
			width: 7,
			height: 6,
			borderRightWidth: 1.5,
			borderBottomWidth: 1.5,
			borderColor: c.subtext,
			borderBottomRightRadius: 5,
			backgroundColor: c.card,
		},
		iconShareOuter: { width: 18, height: 18 },
		iconShareBox: {
			width: 13,
			height: 13,
			borderWidth: 1.5,
			borderColor: c.subtext,
			borderRadius: 3,
		},
		iconShareDiag: {
			position: 'absolute' as const,
			top: 0,
			right: 0,
			width: 9,
			height: 1.5,
			backgroundColor: c.subtext,
			transform: [{ rotate: '-45deg' }, { translateX: 2 }, { translateY: -2 }],
		},
		iconShareVert: {
			position: 'absolute' as const,
			top: 0,
			right: 0,
			width: 1.5,
			height: 7,
			backgroundColor: c.subtext,
		},
		iconShareHoriz: {
			position: 'absolute' as const,
			top: 0,
			right: 0,
			width: 7,
			height: 1.5,
			backgroundColor: c.subtext,
		},
		iconFullOuter: { width: 18, height: 18 },
		iconFullInner: {
			width: 12,
			height: 12,
			borderWidth: 1.5,
			borderColor: c.subtext,
			borderRadius: 2,
		},
		iconFullCorner: {
			position: 'absolute' as const,
			top: 0,
			right: 0,
			width: 9,
			height: 9,
			borderTopWidth: 1.5,
			borderRightWidth: 1.5,
			borderColor: c.subtext,
			borderTopRightRadius: 3,
		},
		iconBmOuter: { width: 14, height: 18 },
		iconBmBody: {
			width: 14,
			height: 16,
			borderWidth: 1.5,
			borderColor: c.subtext,
			borderRadius: 2,
		},
		iconBmNotchWrap: {
			position: 'absolute' as const,
			bottom: 0,
			left: 0,
			right: 0,
			height: 7,
			flexDirection: 'row' as const,
		},
		iconBmNotchL: { flex: 1, borderTopRightRadius: 7, backgroundColor: c.card },
		iconBmNotchR: { flex: 1, borderTopLeftRadius: 7, backgroundColor: c.card },
		iconVotersOuter: { width: 22, height: 16 },
		iconVotersHead1: {
			position: 'absolute' as const,
			left: 0,
			width: 10,
			height: 10,
			borderRadius: 5,
			borderWidth: 1.5,
			borderColor: c.subtext,
		},
		iconVotersHead2: {
			position: 'absolute' as const,
			left: 7,
			width: 10,
			height: 10,
			borderRadius: 5,
			borderWidth: 1.5,
			borderColor: c.subtext,
			backgroundColor: c.card,
		},
		iconVotersBody1: {
			position: 'absolute' as const,
			bottom: 0,
			left: 0,
			width: 13,
			height: 7,
			borderTopLeftRadius: 6,
			borderTopRightRadius: 6,
			borderWidth: 1.5,
			borderColor: c.subtext,
		},
		iconVotersBody2: {
			position: 'absolute' as const,
			bottom: 0,
			right: 0,
			width: 13,
			height: 7,
			borderTopLeftRadius: 6,
			borderTopRightRadius: 6,
			borderWidth: 1.5,
			borderColor: c.subtext,
			backgroundColor: c.card,
		},
	};
}

function LiveDot({ light = false, color }: { light?: boolean; color?: string }) {
	const pulse = useRef(new Animated.Value(1)).current;
	useEffect(() => {
		Animated.loop(
			Animated.sequence([
				Animated.timing(pulse, { toValue: 0.25, duration: 600, useNativeDriver: true }),
				Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
			])
		).start();
	}, [pulse]);
	return (
		<Animated.View
			style={{
				width: 6,
				height: 6,
				borderRadius: 3,
				backgroundColor: color ?? (light ? '#fff' : '#22c55e'),
				opacity: pulse,
			}}
		/>
	);
}

function LiveMatchPanel({
	fixtureId,
	isLive,
	isHt,
	isDark,
	colors,
	liveStatusPill,
	effectiveMinute,
	teamA,
	teamB,
	home,
	away,
	penaltyLine,
}: {
	fixtureId: string;
	isLive: boolean;
	isHt: boolean;
	isDark: boolean;
	colors: ReturnType<typeof useTheme>['colors'];
	liveStatusPill: string;
	effectiveMinute: number | null;
	teamA: string;
	teamB: string;
	home: number;
	away: number;
	penaltyLine?: string | null;
}) {
	const dotColor = isHt ? '#f59e0b' : '#22c55e';
	const panelBg = isHt
		? isDark
			? 'rgba(245,158,11,0.08)'
			: 'rgba(254,243,199,0.35)'
		: isDark
			? 'rgba(99,102,241,0.06)'
			: 'rgba(99,102,241,0.05)';
	const panelBorder = isHt
		? isDark
			? 'rgba(245,158,11,0.24)'
			: 'rgba(245,158,11,0.28)'
		: isDark
			? 'rgba(99,102,241,0.22)'
			: 'rgba(99,102,241,0.2)';
	const titleColor = isHt
		? isDark
			? '#fbbf24'
			: '#d97706'
		: isDark
			? '#818cf8'
			: '#6366f1';
	const subColor = isDark ? 'rgba(250,250,250,0.72)' : colors.subtext;
	const footAccent = isHt ? '#f59e0b' : isDark ? '#818cf8' : '#6366f1';
	const footDivider = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

	const footPulse = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		const loop = Animated.loop(
			Animated.sequence([
				Animated.timing(footPulse, {
					toValue: 1,
					duration: 950,
					easing: Easing.inOut(Easing.ease),
					useNativeDriver: true,
				}),
				Animated.timing(footPulse, {
					toValue: 0,
					duration: 950,
					easing: Easing.inOut(Easing.ease),
					useNativeDriver: true,
				}),
			]),
		);
		loop.start();
		return () => loop.stop();
	}, [footPulse]);

	const footBgOpacity = footPulse.interpolate({
		inputRange: [0, 1],
		outputRange: [isDark ? 0.06 : 0.04, isDark ? 0.26 : 0.18],
	});
	const footContentOpacity = footPulse.interpolate({
		inputRange: [0, 1],
		outputRange: [0.78, 1],
	});
	const chevronNudge = footPulse.interpolate({
		inputRange: [0, 1],
		outputRange: [0, 5],
	});

	return (
		<Pressable
			style={({ pressed }) => [
				mdrStyles.livePanel,
				{
					backgroundColor: panelBg,
					borderColor: panelBorder,
					opacity: pressed ? 0.94 : 1,
					transform: [{ scale: pressed ? 0.99 : 1 }],
				},
			]}
			onPress={() =>
				router.push(`/world-cup/match/${fixtureId}` as `/${string}`)
			}
		>
			<View style={mdrStyles.livePanelHead}>
				<LiveDot color={dotColor} />
				<Text style={[mdrStyles.livePanelStatus, { color: colors.subtext }]}>
					{liveStatusPill}
					{isLive && effectiveMinute != null ? ` · ${effectiveMinute}'` : ''}
				</Text>
			</View>
			<View style={mdrStyles.livePanelBody}>
				<Text style={[mdrStyles.livePanelTeam, { color: colors.subtext }]} numberOfLines={2}>
					{teamA}
				</Text>
				<View style={mdrStyles.livePanelScoreCol}>
					<Text style={[mdrStyles.livePanelScore, { color: colors.text }]}>
						{home}
						<Text style={[mdrStyles.livePanelScoreDash, { color: colors.muted }]}> – </Text>
						{away}
					</Text>
					{penaltyLine ? (
						<Text style={[mdrStyles.livePanelPenLine, { color: colors.subtext }]}>
							{penaltyLine}
						</Text>
					) : null}
				</View>
				<Text style={[mdrStyles.livePanelTeam, { color: colors.subtext }]} numberOfLines={2}>
					{teamB}
				</Text>
			</View>
			<Animated.View
				style={[mdrStyles.livePanelFoot, { borderTopColor: footDivider, opacity: footContentOpacity }]}
			>
				<Animated.View
					pointerEvents="none"
					style={[
						StyleSheet.absoluteFill,
						mdrStyles.livePanelFootHighlight,
						{ backgroundColor: footAccent, opacity: footBgOpacity },
					]}
				/>
				<Text style={[mdrStyles.livePanelFootTitle, { color: titleColor }]}>
					Match center
				</Text>
				<Text style={[mdrStyles.livePanelFootSub, { color: subColor }]} numberOfLines={1}>
					Stats · lineups · events
				</Text>
				<Animated.Text
					style={[
						mdrStyles.livePanelChevron,
						{ color: titleColor, transform: [{ translateX: chevronNudge }] },
					]}
				>
					›
				</Animated.Text>
			</Animated.View>
		</Pressable>
	);
}

// Sizes its container to the image's own aspect ratio (clamped) instead of a fixed
// 16:9 box, so portrait/square images neither crop (cover) nor letterbox (contain).
const MIN_IMG_RATIO = 0.66;
const MAX_IMG_RATIO = 1.91;

function AdaptiveImage({
	uri,
	onPress,
	fallbackRatio = 16 / 9,
}: {
	uri: string;
	onPress?: () => void;
	fallbackRatio?: number;
}) {
	const [ratio, setRatio] = useState(fallbackRatio);
	const image = (
		<Image
			source={{ uri }}
			style={{ width: '100%', aspectRatio: ratio }}
			contentFit='contain'
			cachePolicy='memory-disk'
			onLoad={(e) => {
				const { width, height } = e.source;
				if (width && height) {
					setRatio(Math.min(Math.max(width / height, MIN_IMG_RATIO), MAX_IMG_RATIO));
				}
			}}
		/>
	);
	return onPress ? <Pressable onPress={onPress}>{image}</Pressable> : image;
}

const ANN_GAP = 2;
// Half-width of a thumbnail cell — same size whether in a 2-col row or centred alone.
const ANN_THUMB_W = (CARD_CONTENT_W - ANN_GAP) / 2;

function AnnGridThumb({
	uri, index, onPress, overlay, solo,
}: { uri: string; index: number; onPress: (i: number) => void; overlay?: string; solo?: boolean }) {
	return (
		<Pressable onPress={() => onPress(index)} style={solo ? { width: ANN_THUMB_W } : { flex: 1 }}>
			<View style={{ width: '100%', aspectRatio: 1 }}>
				<Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit='cover' cachePolicy='memory-disk' />
				{overlay ? (
					<View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
						<Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>{overlay}</Text>
					</View>
				) : null}
			</View>
		</Pressable>
	);
}

function AnnouncementImageGrid({ urls, onImagePress }: { urls: string[]; onImagePress: (index: number) => void }) {
	const count = urls.length;

	if (count === 1) {
		return <AdaptiveImage uri={urls[0]} onPress={() => onImagePress(0)} />;
	}
	// All multi-image layouts use equal-sized square thumbnails in rows of 2.
	// 2 → [2]
	// 3 → [2, 1 centred]
	// 4 → [2, 2]
	// 5 → [2, 2, 1 centred]
	// 6 → [2, 2, 2]
	// 7+ → [2, 2, 2] with "+N" on last visible cell
	const visibleCount = Math.min(count, 6);
	const hiddenCount = count - visibleCount;

	// Split into rows of 2; last row may have 1 item (centred).
	const rows: number[][] = [];
	for (let i = 0; i < visibleCount; i += 2) {
		rows.push(urls.slice(i, i + 2).map((_, j) => i + j));
	}

	return (
		<View style={{ gap: ANN_GAP }}>
			{rows.map((row, ri) => {
				const isSolo = row.length === 1;
				const isLastRow = ri === rows.length - 1;
				return (
					<View
						key={ri}
						style={[
							{ flexDirection: 'row', gap: ANN_GAP },
							isSolo && { justifyContent: 'center' },
						]}>
						{row.map((urlIdx, ci) => {
							const isLastCell = isLastRow && ci === row.length - 1;
							return (
								<AnnGridThumb
									key={urlIdx}
									uri={urls[urlIdx]}
									index={urlIdx}
									onPress={onImagePress}
									solo={isSolo}
									overlay={isLastCell && hiddenCount > 0 ? `+${hiddenCount}` : undefined}
								/>
							);
						})}
					</View>
				);
			})}
		</View>
	);
}

function FeedPostCardComponent({
	post,
	variant = 'feed',
	isViewable = true,
	initialCommentsOpen = false,
	highlightCommentId = null,
	showVoteCoachmark = false,
	onCoachmarkDismiss,
}: Props) {
	const isDetail = variant === 'detail';
	const { user, isAuthenticated } = useAuth();
	const { colors, isDark } = useTheme();
	const { playTick, vibrate } = useSounds();
	const { adjustSavedCount } = useTabBar();
	const st = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

	const [optimisticVote, setOptimisticVote] = useState<VoteLiveState | null>(
		null,
	);
	const [liked, setLiked] = useState(Boolean(post.viewerHasHyped));
	const [anon, setAnon] = useState(Boolean(post.myVoteAnonymous));
	const [hypeCount, setHypeCount] = useState(post.hypeCount ?? 0);
	const [saved, setSaved] = useState(Boolean(post.viewerHasSaved));
	const [saveCount, setSaveCount] = useState(post.saveCount ?? 0);
	const [countdownStr, setCountdownStr] = useState(() =>
		calcCountdown(post.votingEndsAt),
	);
	const [winnerCountdown, setWinnerCountdown] = useState(() =>
		calcWinnerCountdown(post.fixtureWinnerAt),
	);
	const voteInFlight = useRef(false);
	const voteGuardUntil = useRef(0);
	// intent >= 0 = vote that option; intent < 0 = withdraw
	const pendingVote = useRef<{ intent: number } | null>(null);

	// Guarantee voteInFlight resets if the card unmounts mid-flight (e.g. navigating
	// away during a slow network). Without this, remounting the same card instance
	// keeps the ref stuck at true and all taps are silently dropped.
	useEffect(() => {
		return () => {
			voteInFlight.current = false;
			pendingVote.current = null;
		};
	}, []);

	const [moreMenuVisible, setMoreMenuVisible] = useState(false);
	const [reportMenuVisible, setReportMenuVisible] = useState(false);
	const [reportReasonId, setReportReasonId] =
		useState<ContentReportReasonId>('spam');
	const [reportDetails, setReportDetails] = useState('');
	const [reportSubmitting, setReportSubmitting] = useState(false);
	const [extendMenuVisible, setExtendMenuVisible] = useState(false);
	const [votersVisible, setVotersVisible] = useState(false);
	const [votersInitialTab, setVotersInitialTab] = useState<number | null>(null);
	const [hypersVisible, setHypersVisible] = useState(false);
	const [imageViewerVisible, setImageViewerVisible] = useState(false);
	const [selectedImageIndex, setSelectedImageIndex] = useState(0);
	const client = useApolloClient();

	function openVoters(tab: number | null = null) {
		setVotersInitialTab(tab);
		setVotersVisible(true);
	}

	// Animation values — one per compare/poll option (min 4). Sized from the
	// post's option count so multi-option posts (5–10+) and text polls (which
	// have no images) never index past the array.
	const animSlots = Math.max(
		post.imageUrls?.length ?? 0,
		post.postOptions?.length ?? 0,
		4,
	);
	const cellScale = useRef(
		Array.from({ length: animSlots }, () => new Animated.Value(1)),
	).current;
	const cellOpacity = useRef(
		Array.from({ length: animSlots }, () => new Animated.Value(1)),
	).current;
	const flashOpacity = useRef(
		Array.from({ length: animSlots }, () => new Animated.Value(0)),
	).current;
	const badgeScale = useRef(
		Array.from({ length: animSlots }, () => new Animated.Value(0)),
	).current;
	const badgeInit = useRef(false);
	const prevViewer = useRef<FeedPostView['viewerVote'] | undefined>(undefined);
	const chipScales = useRef(
		[1, 1, 1, 1, 1, 1].map(() => new Animated.Value(1)),
	).current;

	const isOwner = !!user && !!post.authorId && user.id === post.authorId;
	const isAdmin = user?.role?.toLowerCase() === 'admin';

	const [detailsExpanded, setDetailsExpanded] = useState(false);
	// Category chip: tap to reveal a small "Category" tooltip (auto-hides).
	const [showCatTip, setShowCatTip] = useState(false);
	const catTipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	function revealCategoryTip() {
		setShowCatTip(true);
		if (catTipTimer.current) clearTimeout(catTipTimer.current);
		catTipTimer.current = setTimeout(() => setShowCatTip(false), 1800);
	}

	function openComments(focusComposer: boolean) {
		if (!isAuthenticated) {
			router.push('/auth/login');
			return;
		}
		const params = new URLSearchParams();
		if (focusComposer) params.set('focus', '1');
		if (highlightCommentId) params.set('commentId', highlightCommentId);
		const qs = params.toString();
		router.push(
			(`/comments/${post.id}${qs ? `?${qs}` : ''}` as `/${string}`),
		);
	}

	useEffect(() => {
		if (!initialCommentsOpen) return;
		const params = new URLSearchParams();
		if (highlightCommentId) params.set('commentId', highlightCommentId);
		const qs = params.toString();
		router.push(
			(`/comments/${post.id}${qs ? `?${qs}` : ''}` as `/${string}`),
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- deep-link once
	}, [initialCommentsOpen, post.id]);

	function goToPost() {
		if (!isAuthenticated) {
			router.push('/auth/login');
			return;
		}
		router.push(`/post/${post.id}` as `/${string}`);
	}

	const up = optimisticVote?.upvoteCount ?? post.upvoteCount;
	const down = optimisticVote?.downvoteCount ?? post.downvoteCount;
	// Use ternary (not ??) so optimistic null (withdraw state) isn't overridden by stale server value
	const viewer =
		optimisticVote !== null ? optimisticVote.viewerVote : post.viewerVote;
	const activeStats = optimisticVote?.optionStats ?? post.optionStats;
	const activeIsVotingOpen =
		optimisticVote?.isVotingOpen ?? post.isVotingOpen ?? null;
	const isVotingClosed = activeIsVotingOpen === false;
	const activeMyIdx =
		optimisticVote !== null
			? optimisticVote.mySelectedOptionIndex
			: (post.mySelectedOptionIndex ?? null);
	const activeVotingEndsAt =
		optimisticVote?.votingEndsAt ?? post.votingEndsAt ?? null;

	// Ending-soon urgency banner (Phase 25) — re-evaluated each render; the 1s
	// countdown interval below keeps re-rendering while voting is open.
	const endingSoonLeadMinutes = Math.max(
		1,
		Math.round(post.endingSoonLeadMinutes ?? 5),
	);
	const endingSoonRemainingMs = activeVotingEndsAt
		? new Date(activeVotingEndsAt).getTime() - Date.now()
		: null;
	const isEndingSoon =
		!isVotingClosed &&
		endingSoonRemainingMs !== null &&
		endingSoonRemainingMs > 0 &&
		endingSoonRemainingMs <= endingSoonLeadMinutes * 60_000;

	const compareUrls = post.imageUrls.length >= 2 ? post.imageUrls : null;
	const isBinary = compareUrls?.length === 2;

	const optionLabels = useMemo(() => {
		if (activeStats && activeStats.length > 0)
			return activeStats.map((s) => s.label?.trim() || `Option ${s.index + 1}`);
		if (post.postOptions && post.postOptions.length > 0)
			return post.postOptions.map(
				(o, i) => o.label?.trim() || `Option ${i + 1}`,
			);
		return isBinary ? ['Side A', 'Side B'] : [];
	}, [activeStats, post.postOptions, isBinary]);

	const binaryTotal = up + down;
	const leftPct = binaryTotal > 0 ? Math.round((100 * up) / binaryTotal) : 50;
	const rightPct =
		binaryTotal > 0 ? Math.round((100 * down) / binaryTotal) : 50;
	const binaryLeaderPct = Math.max(leftPct, rightPct);
	const binaryHasTie = binaryTotal > 0 && up === down;
	// Tie-aware binary winner predicate: on a tie (up === down) BOTH sides win,
	// so neither image gets the loser dim/scrim. Matches web FeedPostCard.
	const isBinaryWinnerSide = (side: 0 | 1): boolean => {
		if (!isVotingClosed || binaryTotal <= 0) return false;
		if (up === down) return true; // tie → both sides win
		return side === 0 ? up > down : down > up;
	};
	const hasVoted = viewer !== null || activeMyIdx !== null;
	const showCompareStats = hasVoted || isVotingClosed;

	// First-run tap-to-vote coach mark — only over a still-votable compare post
	// the viewer hasn't acted on yet. The feed decides which single card gets it.
	const coachActive =
		showVoteCoachmark && !!compareUrls && !isVotingClosed && !hasVoted;
	// Retire the coach for good the moment the user actually votes.
	useEffect(() => {
		if (showVoteCoachmark && hasVoted) onCoachmarkDismiss?.('voted');
	}, [showVoteCoachmark, hasVoted]); // eslint-disable-line react-hooks/exhaustive-deps

	// Multi-compare layout — fixed per-count rows (see getCompareRows), all cells
	// the same square size (sized to the widest row so images stay identical),
	// short rows centered, no scrolling. Width excludes the card's side margins.
	const compareCount = compareUrls?.length ?? 0;
	const compareRows = getMobileCompareRows(compareCount);
	const compareMaxCols = compareRows.length ? Math.max(...compareRows) : 1;
	const multiGridGap =
		compareCount >= 5 || compareMaxCols >= 3
			? MULTI_GRID_GAP_DENSE
			: MULTI_GRID_GAP;
	const multiCellWidth = Math.floor(
		(CARD_CONTENT_W - (compareMaxCols - 1) * multiGridGap) / compareMaxCols,
	);
	const compareOverlayMode = getCompareOverlayMode(compareCount, multiCellWidth);
	const useBorderState =
		compareOverlayMode !== 'full' || multiCellWidth < 140;
	// Precompute each row's starting option index for row-based rendering.
	let compareRowCursor = 0;
	const compareRowsWithStart = compareRows.map((size) => {
		const start = compareRowCursor;
		compareRowCursor += size;
		return { size, start };
	});
	const multiTotal = activeStats?.reduce((sum, s) => sum + s.count, 0) ?? 0;
	const multiPercents =
		activeStats?.map((s) => Math.round(s.percentage)) ?? [];
	const multiLeaderPct =
		multiPercents.length > 0 ? Math.max(...multiPercents) : null;
	const multiLeaderCount =
		multiLeaderPct == null
			? 0
			: multiPercents.filter((value) => value === multiLeaderPct).length;
	const isMultiWinnerIndex = (idx: number): boolean => {
		if (
			!isVotingClosed ||
			multiTotal <= 0 ||
			multiLeaderPct == null ||
			multiLeaderPct <= 0
		) {
			return false;
		}
		return (multiPercents[idx] ?? -1) === multiLeaderPct;
	};

	// ── Post format flags ──
	const isAnnouncement = post.format === 'announcement';
	const isPoll = !isAnnouncement && post.format === 'poll';
	const pollOptions = post.postOptions ?? [];
	const pollOptionCount = isPoll
		? Math.max(pollOptions.length, activeStats?.length ?? 0)
		: 0;
	const pollPick = isPoll ? activeMyIdx : null;
	const pollHasVoted = pollPick !== null && pollPick !== undefined;
	// Poll results (%, bar, voter count) are always visible — no vote required.
	const pollShowResults = true;
	const pollMaxCount = Math.max(0, ...(activeStats?.map((s) => s.count) ?? []));

	useEffect(() => {
		if (!isViewable || !activeVotingEndsAt || isVotingClosed) return;
		const timer = setInterval(() => {
			const r = calcCountdown(activeVotingEndsAt);
			setCountdownStr(r);
			if (!r) clearInterval(timer);
		}, 1000);
		return () => clearInterval(timer);
	}, [isViewable, activeVotingEndsAt, isVotingClosed]);

	// Winner reveal countdown (post-match)
	useEffect(() => {
		if (!isViewable || !post.fixtureWinnerAt) return;
		const timer = setInterval(() => {
			setWinnerCountdown(calcWinnerCountdown(post.fixtureWinnerAt));
		}, 1000);
		return () => clearInterval(timer);
	}, [isViewable, post.fixtureWinnerAt]);

	// Live match score is pushed via POST_VOTE_UPDATED (same payload as the vote
	// counts). FlatList doesn't reliably re-render rows on deep cache changes, so
	// — exactly like votes — we mirror the score into local state and render from
	// it. Re-sync only when the score VALUES change (or the row is recycled), not
	// on every new prop object, so a fresh subscription push isn't overwritten.
	const [liveMatchScore, setLiveMatchScore] = useState(post.matchScore ?? null);
	useEffect(() => {
		setLiveMatchScore(post.matchScore ?? null);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		post.id,
		post.matchScore?.status,
		post.matchScore?.home,
		post.matchScore?.away,
		post.matchScore?.minute,
		post.matchScore?.phase,
		post.matchScore?.penalty?.home,
		post.matchScore?.penalty?.away,
		post.matchScore?.wentToPenalties,
	]);
	const matchScore = liveMatchScore ?? post.matchScore;

	const isLiveMatch = matchScore?.status === 'IN_PLAY' || matchScore?.status === 'PAUSED';

	const liveCardPulse = useRef(new Animated.Value(0.22)).current;
	useEffect(() => {
		if (!isLiveMatch) {
			liveCardPulse.setValue(0.22);
			return;
		}
		const loop = Animated.loop(
			Animated.sequence([
				Animated.timing(liveCardPulse, {
					toValue: 0.55,
					duration: 1600,
					easing: Easing.inOut(Easing.sin),
					useNativeDriver: true,
				}),
				Animated.timing(liveCardPulse, {
					toValue: 0.18,
					duration: 1600,
					easing: Easing.inOut(Easing.sin),
					useNativeDriver: true,
				}),
			]),
		);
		loop.start();
		return () => loop.stop();
	}, [isLiveMatch, liveCardPulse]);

	const liveMinute = matchScore?.status === 'IN_PLAY' ? (matchScore?.minute ?? null) : null;

	useSubscription<PostVoteUpdatedData>(POST_VOTE_UPDATED, {
		variables: { postId: post.id },
		skip: isDetail || !isViewable,
		onData: ({ data }) => {
			const next = data.data?.postVoteUpdated;
			if (!next || next.id !== post.id) return;
			if (voteInFlight.current || Date.now() < voteGuardUntil.current) return;
			setOptimisticVote({
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
			});
			// Live match score rides on the same broadcast — mirror it so the
			// score/minute badge updates in real time (merge to keep fields the
			// subscription doesn't send, e.g. `winner`).
			if (next.matchScore) {
				const incoming = next.matchScore;
				setLiveMatchScore((prev) => {
					const base = prev ?? post.matchScore;
					const merged = base ? { ...base, ...incoming } : { ...incoming };
					return {
						...merged,
						home: merged.home ?? null,
						away: merged.away ?? null,
						status: merged.status ?? null,
						minute: merged.minute ?? null,
					};
				});
			}
		},
	});

	// Live post edits — Apollo auto-merges the returned full post into the cache,
	// so images/caption/options/end-date update in place (feed + detail). Clear
	// optimistic vote state so a vote-reset edit reflects server truth.
	useSubscription<{ postUpdated?: { id: string } }>(POST_UPDATED, {
		variables: { postId: post.id },
		skip: !isViewable,
		onData: ({ data }) => {
			const next = data.data?.postUpdated;
			if (!next || next.id !== post.id) return;
			if (voteInFlight.current || Date.now() < voteGuardUntil.current) return;
			setOptimisticVote(null);
		},
	});

	useEffect(() => {
		if (voteInFlight.current || Date.now() < voteGuardUntil.current) return;
		setOptimisticVote(null);
		setHypeCount(post.hypeCount ?? 0);
		setSaved(Boolean(post.viewerHasSaved));
		setLiked(Boolean(post.viewerHasHyped));
		setAnon(Boolean(post.myVoteAnonymous));
	}, [
		post.id,
		post.upvoteCount,
		post.downvoteCount,
		post.viewerVote,
		post.mySelectedOptionIndex,
		post.isVotingOpen,
		post.votingEndsAt,
		post.hypeCount,
		post.viewerHasSaved,
		post.viewerHasHyped,
		post.myVoteAnonymous,
	]);

	// Set initial badge scale for pre-voted cards (no animation)
	useEffect(() => {
		if (badgeInit.current) return;
		badgeInit.current = true;
		const v = post.viewerVote;
		if (v === 'UP') badgeScale[0].setValue(1);
		else if (v === 'DOWN') badgeScale[1].setValue(1);
		// Multi-option: init badge for pre-voted option
		const preIdx = post.mySelectedOptionIndex;
		if (preIdx !== null && preIdx !== undefined && v === null) {
			badgeScale[preIdx]?.setValue(1);
		}
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// Badge spring entrance + cell dim when viewer vote changes (binary only)
	useEffect(() => {
		if (!isBinary) return;
		const prev = prevViewer.current;
		prevViewer.current = viewer;
		const isNew = viewer !== prev && prev !== undefined;
		if (viewer === 'UP') {
			if (isNew) {
				badgeScale[0].setValue(0);
				Animated.spring(badgeScale[0], {
					toValue: 1,
					useNativeDriver: true,
					tension: 220,
					friction: 8,
				}).start();
			}
			Animated.timing(cellOpacity[1], {
				toValue: 0.8,
				duration: 280,
				useNativeDriver: true,
			}).start();
			Animated.timing(cellOpacity[0], {
				toValue: 1,
				duration: 150,
				useNativeDriver: true,
			}).start();
		} else if (viewer === 'DOWN') {
			if (isNew) {
				badgeScale[1].setValue(0);
				Animated.spring(badgeScale[1], {
					toValue: 1,
					useNativeDriver: true,
					tension: 220,
					friction: 8,
				}).start();
			}
			Animated.timing(cellOpacity[0], {
				toValue: 0.8,
				duration: 280,
				useNativeDriver: true,
			}).start();
			Animated.timing(cellOpacity[1], {
				toValue: 1,
				duration: 150,
				useNativeDriver: true,
			}).start();
		} else if (prev !== undefined) {
			// Withdraw: restore both cells + collapse badges
			Animated.timing(cellOpacity[0], {
				toValue: 1,
				duration: 200,
				useNativeDriver: true,
			}).start();
			Animated.timing(cellOpacity[1], {
				toValue: 1,
				duration: 200,
				useNativeDriver: true,
			}).start();
			Animated.spring(badgeScale[0], {
				toValue: 0,
				useNativeDriver: true,
				tension: 200,
				friction: 10,
			}).start();
			Animated.spring(badgeScale[1], {
				toValue: 0,
				useNativeDriver: true,
				tension: 200,
				friction: 10,
			}).start();
		}
	}, [viewer, isBinary]); // eslint-disable-line react-hooks/exhaustive-deps

	// Multi-option: badge + dim when mySelectedOptionIndex changes (null = withdraw)
	useEffect(() => {
		if (isBinary) return;
		const n = compareUrls?.length ?? 0;
		if (activeMyIdx === null) {
			// Withdraw: restore all cells, hide all badges
			for (let i = 0; i < n; i++) {
				Animated.timing(cellOpacity[i], {
					toValue: 1,
					duration: 200,
					useNativeDriver: true,
				}).start();
				Animated.spring(badgeScale[i], {
					toValue: 0,
					useNativeDriver: true,
					tension: 200,
					friction: 10,
				}).start();
			}
			return;
		}
		for (let i = 0; i < n; i++) {
			if (i === activeMyIdx) {
				badgeScale[i].setValue(0);
				Animated.spring(badgeScale[i], {
					toValue: 1,
					useNativeDriver: true,
					tension: 220,
					friction: 8,
				}).start();
				Animated.timing(cellOpacity[i], {
					toValue: 1,
					duration: 150,
					useNativeDriver: true,
				}).start();
			} else {
				badgeScale[i].setValue(0);
				Animated.timing(cellOpacity[i], {
					toValue: 0.94,
					duration: 280,
					useNativeDriver: true,
				}).start();
			}
		}
	}, [activeMyIdx, isBinary]); // eslint-disable-line react-hooks/exhaustive-deps

	const { awardCoins, spendCoins } = useCoins();
	const [voteMut] = useMutation<VotePostData>(VOTE_POST);
	const [removeVoteMut] = useMutation<RemoveVoteData>(REMOVE_VOTE);
	const [setHypeMut] = useMutation(SET_POST_HYPE);
	const [setKeepMut] = useMutation(SET_POST_KEEP);
	const [deleteMut] = useMutation(DELETE_POST);
	const [pinMut] = useMutation(PIN_POST);
	const [unpinMut] = useMutation(UNPIN_POST);
	const [pinBusy, setPinBusy] = useState(false);
	const [extendMut] = useMutation(EXTEND_POST_VOTING);

	function triggerVotePop(idx: number) {
		playTick();
		vibrate(100);
		Animated.sequence([
			Animated.timing(cellScale[idx], {
				toValue: 1.065,
				duration: 80,
				useNativeDriver: true,
				easing: Easing.out(Easing.quad),
			}),
			Animated.timing(cellScale[idx], {
				toValue: 0.975,
				duration: 80,
				useNativeDriver: true,
			}),
			Animated.timing(cellScale[idx], {
				toValue: 1.018,
				duration: 100,
				useNativeDriver: true,
			}),
			Animated.timing(cellScale[idx], {
				toValue: 1,
				duration: 100,
				useNativeDriver: true,
			}),
		]).start();
		Animated.sequence([
			Animated.timing(flashOpacity[idx], {
				toValue: 0.38,
				duration: 80,
				useNativeDriver: true,
			}),
			Animated.timing(flashOpacity[idx], {
				toValue: 0,
				duration: 420,
				useNativeDriver: true,
			}),
		]).start();
	}

	function chipPressIn(i: number) {
		Animated.spring(chipScales[i], {
			toValue: 0.92,
			useNativeDriver: true,
			speed: 60,
			bounciness: 0,
		}).start();
	}
	function chipPressOut(i: number) {
		Animated.spring(chipScales[i], {
			toValue: 1,
			useNativeDriver: true,
			tension: 180,
			friction: 12,
		}).start();
	}

	// intent >= 0 = vote that option; intent = -1 = withdraw current vote
	async function processVoteIntent(intent: number) {
		if (isVotingClosed) return;
		if (!isAuthenticated) {
			router.push('/auth/login');
			return;
		}

		// Snapshot live state (ternary so explicit null withdraw is honoured)
		const curVote =
			optimisticVote !== null ? optimisticVote.viewerVote : post.viewerVote;
		const curMyIdx =
			optimisticVote !== null
				? optimisticVote.mySelectedOptionIndex
				: (post.mySelectedOptionIndex ?? null);
		const curUp = optimisticVote?.upvoteCount ?? post.upvoteCount;
		const curDown = optimisticVote?.downvoteCount ?? post.downvoteCount;
		const curStats = optimisticVote?.optionStats ?? post.optionStats ?? null;
		// Coins are awarded once per post — only the first vote (no prior pick).
		const hadNoVote = curVote === null && curMyIdx === null;
		// Coins: unvoting reverses the vote reward (symmetric with the backend).
		if (intent < 0 && !hadNoVote) spendCoins(COIN_AMOUNTS.VOTE);

		// Apply optimistic update immediately
		if (intent >= 0) {
			triggerVotePop(intent);
			// Coins: earn for the first vote on this post (switching doesn't re-award).
			if (hadNoVote) awardCoins(COIN_AMOUNTS.VOTE);
			if (isBinary) {
				let newUp = curUp;
				let newDown = curDown;
				if (intent === 0) {
					newUp += 1;
					if (curVote === 'DOWN') newDown = Math.max(0, newDown - 1);
				} else {
					newDown += 1;
					if (curVote === 'UP') newUp = Math.max(0, newUp - 1);
				}
				const total = newUp + newDown;
				setOptimisticVote({
					upvoteCount: newUp,
					downvoteCount: newDown,
					viewerVote: intent === 0 ? 'UP' : 'DOWN',
					mySelectedOptionIndex: intent,
					optionStats:
						curStats?.map((s) => {
							const c =
								s.index === 0 ? newUp : s.index === 1 ? newDown : s.count;
							return {
								...s,
								count: c,
								percentage: total > 0 ? (c / total) * 100 : 0,
							};
						}) ?? null,
					isVotingOpen: activeIsVotingOpen,
					votingEndsAt: activeVotingEndsAt,
				});
			} else {
				const optionCount = compareUrls?.length ?? curStats?.length ?? 0;
				const nextStats = applyMultiVoteOptimistic(
					post,
					curStats,
					curMyIdx,
					intent,
					optionCount,
				);
				setOptimisticVote({
					upvoteCount: curUp,
					downvoteCount: curDown,
					viewerVote: null,
					mySelectedOptionIndex: intent,
					optionStats: nextStats,
					isVotingOpen: activeIsVotingOpen,
					votingEndsAt: activeVotingEndsAt,
				});
			}
		} else {
			// Withdraw — decrement current pick's count, clear vote
			if (isBinary) {
				let newUp = curUp;
				let newDown = curDown;
				if (curVote === 'UP') newUp = Math.max(0, newUp - 1);
				else if (curVote === 'DOWN') newDown = Math.max(0, newDown - 1);
				const total = newUp + newDown;
				setOptimisticVote({
					upvoteCount: newUp,
					downvoteCount: newDown,
					viewerVote: null,
					mySelectedOptionIndex: null,
					optionStats:
						curStats?.map((s) => {
							const c =
								s.index === 0 ? newUp : s.index === 1 ? newDown : s.count;
							return {
								...s,
								count: c,
								percentage: total > 0 ? (c / total) * 100 : 0,
							};
						}) ?? null,
					isVotingOpen: activeIsVotingOpen,
					votingEndsAt: activeVotingEndsAt,
				});
			} else {
				const optionCount = compareUrls?.length ?? curStats?.length ?? 0;
				const withdrawn = buildOptionStatsBase(post, curStats, optionCount).map(
					(s) => ({
						...s,
						count:
							s.index === curMyIdx ? Math.max(0, s.count - 1) : s.count,
					}),
				);
				const newTotal = withdrawn.reduce((sum, s) => sum + s.count, 0);
				setOptimisticVote({
					upvoteCount: curUp,
					downvoteCount: curDown,
					viewerVote: null,
					mySelectedOptionIndex: null,
					optionStats: withdrawn.map((s) => ({
						...s,
						percentage: newTotal > 0 ? (s.count / newTotal) * 100 : 0,
					})),
					isVotingOpen: activeIsVotingOpen,
					votingEndsAt: activeVotingEndsAt,
				});
			}
		}

		setDetailsExpanded(true);
		voteGuardUntil.current = Date.now() + 2000;

		if (voteInFlight.current) {
			pendingVote.current = { intent };
			return;
		}
		voteInFlight.current = true;
		let currentIntent = intent;

		// Race each mutation against a 10-second timeout so voteInFlight can never
		// get permanently stuck when the server is slow or unreachable.
		function withVoteTimeout<T>(p: Promise<T>): Promise<T> {
			return Promise.race([
				p,
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('vote_timeout')), 10_000),
				),
			]);
		}

		while (true) {
			try {
				if (currentIntent < 0) {
					const result = await withVoteTimeout(removeVoteMut({
						variables: { postId: post.id },
					}));
					const payload = result.data?.removeVote;
					if (payload?.countsPerOption?.length) {
						const counts = payload.countsPerOption.map((n) =>
							Math.max(0, Math.round(n)),
						);
						const pcts = payload.percentages ?? [];
						const optionCount = compareUrls?.length ?? counts.length;
						setOptimisticVote((prev) => ({
							upvoteCount: counts[0] ?? prev?.upvoteCount ?? 0,
							downvoteCount: counts[1] ?? prev?.downvoteCount ?? 0,
							viewerVote: null,
							mySelectedOptionIndex: null,
							optionStats: optionStatsFromCounts(
								post,
								prev?.optionStats,
								counts,
								pcts,
								optionCount,
							),
							isVotingOpen: prev?.isVotingOpen ?? null,
							votingEndsAt: prev?.votingEndsAt ?? null,
						}));
						voteGuardUntil.current = Date.now() + 500;
					}
				} else {
					const result = await withVoteTimeout(voteMut({
						variables: {
							postId: post.id,
							selectedOptionIndex: currentIntent,
							anonymous: anon,
						},
					}));
					const payload = result.data?.votePost;
					if (payload?.countsPerOption?.length) {
						const counts = payload.countsPerOption.map((n) =>
							Math.max(0, Math.round(n)),
						);
						const pcts = payload.percentages ?? [];
						const optionCount = compareUrls?.length ?? counts.length;
						setOptimisticVote((prev) => ({
							upvoteCount: counts[0] ?? prev?.upvoteCount ?? 0,
							downvoteCount: counts[1] ?? prev?.downvoteCount ?? 0,
							viewerVote: viewerVoteForIntent(isBinary, currentIntent),
							mySelectedOptionIndex: currentIntent,
							optionStats: optionStatsFromCounts(
								post,
								prev?.optionStats,
								counts,
								pcts,
								optionCount,
							),
							isVotingOpen: prev?.isVotingOpen ?? null,
							votingEndsAt: prev?.votingEndsAt ?? null,
						}));
						voteGuardUntil.current = Date.now() + 500;
					}
				}
				const pending = pendingVote.current;
				pendingVote.current = null;
				if (!pending) break;
				currentIntent = pending.intent;
			} catch {
				pendingVote.current = null;
				setOptimisticVote(null);
				break;
			}
		}
		voteInFlight.current = false;
	}

	function handleCellTap(idx: number) {
		Vibration.vibrate(8);
		// Ternary (not ??) so withdraw null state is not masked by stale server value
		const curVote =
			optimisticVote !== null ? optimisticVote.viewerVote : post.viewerVote;
		const curMyIdx =
			optimisticVote !== null
				? optimisticVote.mySelectedOptionIndex
				: (post.mySelectedOptionIndex ?? null);
		const isCurrentChoice = isBinary
			? (idx === 0 && curVote === 'UP') || (idx === 1 && curVote === 'DOWN')
			: curMyIdx === idx;
		void processVoteIntent(isCurrentChoice ? -1 : idx);
	}

	async function handleHype() {
		const next = !liked;
		setLiked(next);
		setHypeCount((n) => Math.max(0, n + (next ? 1 : -1)));
		// Coins: fire instantly (optimistic) so the reward feels immediate and the
		// tap registers without waiting for the server. If the mutation fails, the
		// debounced balance reconcile inside award/spend self-corrects.
		if (next) awardCoins(COIN_AMOUNTS.HYPE);
		else spendCoins(COIN_AMOUNTS.HYPE);
		try {
			await setHypeMut({ variables: { postId: post.id, active: next } });
		} catch {
			setLiked(!next);
			setHypeCount((n) => Math.max(0, n + (next ? -1 : 1)));
		}
	}

	async function handleAnonymousToggle(val: boolean) {
		setAnon(val);
		const curIdx =
			optimisticVote?.mySelectedOptionIndex ?? post.mySelectedOptionIndex;
		if (hasVoted && curIdx != null) {
			try {
				await voteMut({
					variables: {
						postId: post.id,
						selectedOptionIndex: curIdx,
						anonymous: val,
					},
				});
			} catch {
				setAnon(!val);
			}
		}
	}

	async function handleSave() {
		const next = !saved;
		setSaved(next);
		setSaveCount((n) => Math.max(0, n + (next ? 1 : -1)));
		adjustSavedCount(next ? 1 : -1);
		try {
			await setKeepMut({ variables: { postId: post.id, keep: next } });
		} catch {
			setSaved(!next);
			setSaveCount((n) => Math.max(0, n + (next ? -1 : 1)));
			adjustSavedCount(next ? -1 : 1);
		}
	}

	async function copyLink() {
		try {
			await Clipboard.setStringAsync(postWebUrl(post.id));
			if (Platform.OS === 'android')
				ToastAndroid.show('Link copied ✓', ToastAndroid.SHORT);
		} catch {
			/* ignore */
		}
	}

	function handleMore() {
		if (!isAuthenticated) {
			router.push('/auth/login');
			return;
		}
		if (isOwner || isAdmin) {
			setMoreMenuVisible(true);
			return;
		}
		setReportMenuVisible(true);
	}

	async function handleSubmitReport() {
		if (!user) return;
		setReportSubmitting(true);
		try {
			await submitContentReport(client, {
				targetType: 'post',
				targetId: post.id,
				reasonId: reportReasonId,
				details: reportDetails,
				reporterLabel:
					user.displayName?.trim() || user.username || user.email || 'Signed-in user',
				contextUrl: postWebUrl(post.id),
			});
			setReportMenuVisible(false);
			setReportDetails('');
			setReportReasonId('spam');
			if (Platform.OS === 'android') {
				ToastAndroid.show('Report sent to moderators ✓', ToastAndroid.SHORT);
			} else {
				Alert.alert(
					'Report submitted',
					'Thank you. Our moderation team will review this content.',
				);
			}
		} catch (err: unknown) {
			Alert.alert('Could not send report', getApolloErrorMessage(err));
		} finally {
			setReportSubmitting(false);
		}
	}

	function handleDelete() {
		setMoreMenuVisible(false);
		Alert.alert('Delete post', 'This cannot be undone.', [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Delete',
				style: 'destructive',
				onPress: async () => {
					try {
						await deleteMut({
							variables: { postId: post.id },
							refetchQueries: [{ query: FEED_POSTS }],
						});
						if (isDetail) router.back();
					} catch {
						Alert.alert('Error', 'Could not delete the post.');
					}
				},
			},
		]);
	}

	async function handleTogglePin() {
		setMoreMenuVisible(false);
		if (pinBusy) return;
		setPinBusy(true);
		try {
			const mutate = post.pinned ? unpinMut : pinMut;
			await mutate({
				variables: { postId: post.id },
				refetchQueries: [{ query: FEED_POSTS }],
			});
		} catch {
			Alert.alert('Error', 'Could not update the pin.');
		} finally {
			setPinBusy(false);
		}
	}

	async function handleExtendVoting(hours: number) {
		setExtendMenuVisible(false);
		const newDate = new Date(Date.now() + hours * 3_600_000).toISOString();
		try {
			await extendMut({
				variables: { postId: post.id, newVotingEndsAt: newDate },
			});
		} catch {
			Alert.alert('Error', 'Could not extend voting deadline.');
		}
	}

	const isPlatformPost = post.postType === 'system';
	const isUserGlobal = !isPlatformPost && Boolean(post.isUserGlobalBroadcast);
	const authorName = isPlatformPost
		? MODERATOR_PLATFORM_NAME
		: post.authorDisplayName?.trim() || post.authorUsername;
	const authorInitial = authorName.slice(0, 1).toUpperCase();
	const authorAvatarUrl = isPlatformPost
		? null
		: (post.authorProfileImageUrl ?? null);
	const timeLabel = formatRelativeTime(post.scheduledAt ?? post.createdAt);
	const campaign = post.campaign ?? null;
	const categoryName = post.category?.name?.trim();

	// Campaign match lifecycle
	const isMatchPost = Boolean(post.matchType);
	const knockoutRoundLabel = isKnockoutStage(post.fixtureStage)
		? knockoutRoundBadgeText(post.fixtureStage)
		: null;
	const showRoundBadgeInMetaRow = Boolean(
		isMatchPost && knockoutRoundLabel && !isVotingClosed && isAuthenticated,
	);
	const showCampaignWinner =
		Boolean(post.campaignWinner) &&
		isResolvedCampaignWinner(post.campaignWinner) &&
		isMatchPost;
	const campaignWinnerOptionLabel =
		post.campaignWinner?.winningOption != null
			? compareLabel(post, post.campaignWinner.winningOption)
			: null;
	// Show "match in progress" only for fixture-linked posts where voting has
	// closed (kickoff passed) but the real match result isn't in yet.
	const matchStatus = matchScore?.status ?? null;
	const isMatchFinished = matchStatus === 'FT' || matchStatus === 'AET' || matchStatus === 'PEN' || matchStatus === 'AWARDED' || matchStatus === 'FINISHED';
	const isMatchNotStarted = !isLiveMatch && !isMatchFinished; // NS, TIMED, null, etc.
	const showMatchStartsSoon = isMatchPost && isMatchNotStarted && isVotingClosed && !showCampaignWinner;
	const showMatchCalculating = isMatchPost && isMatchFinished && isVotingClosed && !showCampaignWinner;
	const catColors = categoryChipColors(post.category, isDark);
	const globalBadgeColors = categoryChipColorsOrFallback(post.category, isDark);

	const livePhaseLabel =
		matchScore?.status === 'IN_PLAY' ? formatKnockoutLivePrefix(matchScore) : null;
	const liveStatusPill =
		matchScore?.status === 'PAUSED' ? 'HT' : livePhaseLabel ?? 'LIVE';

	return (
		<View style={[st.card, isLiveMatch && st.cardLive]}>
			{isLiveMatch ? (
				<Animated.View
					pointerEvents="none"
					style={[
						StyleSheet.absoluteFill,
						st.liveCardGlow,
						{
							borderColor: isDark ? '#818cf8' : '#6366f1',
							opacity: liveCardPulse,
						},
					]}
				/>
			) : null}
			{/* Ending-soon urgency banner */}
			{isEndingSoon ? (
				<View style={st.endingSoonBanner}>
					<Text style={st.endingSoonIcon}>⏳</Text>
					<Text style={st.endingSoonText} numberOfLines={1}>
						Poll ending soon, vote now!{' '}
						<Text style={st.endingSoonStrong}>
							{countdownStr || 'Time is running out'}
						</Text>
					</Text>
				</View>
			) : null}

			{/* Header */}
			<View style={st.header}>
				<Pressable
					style={st.authorRow}
					onPress={() =>
						!isPlatformPost &&
						post.authorId &&
						router.push(`/profile/${post.authorId}` as `/${string}`)
					}
					disabled={isPlatformPost}>
					<View
						style={[
							st.avatarWrap,
							!authorAvatarUrl && !isPlatformPost && st.avatarFallback,
						]}>
						{isPlatformPost ? (
							<Image
								source={logoAsset}
								style={st.avatar}
								contentFit='cover'
								cachePolicy='memory-disk'
							/>
						) : authorAvatarUrl ? (
							<Image
								source={{ uri: authorAvatarUrl }}
								style={st.avatar}
								contentFit='cover'
								cachePolicy='memory-disk'
							/>
						) : (
							<Text style={st.avatarText}>{authorInitial}</Text>
						)}
					</View>
					<View style={st.authorMeta}>
						<View style={st.authorNameRow}>
							<Text style={st.authorName}>{authorName}</Text>
						</View>
						{(() => {
							const nodes: ReactNode[] = [];
							const pushSep = () => {
								if (nodes.length > 0) {
									nodes.push(
										<Text key={`sep-${nodes.length}`} style={st.metaSep}>
											{'  ·  '}
										</Text>,
									);
								}
							};
							if (post.pinned) {
								pushSep();
								nodes.push(
									<Text key="pin" style={[st.metaText, st.pinnedMeta]}>
										📌 Pinned
									</Text>,
								);
							}
							if (isPlatformPost) {
								pushSep();
								nodes.push(
									<Text key="plat" style={st.metaText}>
										Platform
									</Text>,
								);
							} else if (isUserGlobal) {
								pushSep();
								nodes.push(
									<View
										key="glob"
										style={[
											st.metaGlobalBadge,
											{ backgroundColor: globalBadgeColors.bg },
										]}>
										<Ionicons
											name="earth-outline"
											size={11}
											color={globalBadgeColors.text}
										/>
										<Text style={[st.metaGlobalText, { color: globalBadgeColors.text }]}>
											Global
										</Text>
									</View>,
								);
							}
							if (categoryName && catColors) {
								pushSep();
								nodes.push(
									<Pressable
										key="cat"
										onPress={revealCategoryTip}
										hitSlop={6}
										accessibilityLabel={`Category: ${categoryName}`}
										style={st.metaCatRow}>
										<View
											style={[st.metaDot, { backgroundColor: catColors.text }]}
										/>
										<Text style={st.metaText} numberOfLines={1}>
											{showCatTip ? '🏷 Category' : categoryName}
										</Text>
									</Pressable>,
								);
							}
							if (timeLabel) {
								pushSep();
								nodes.push(
									<Text key="time" style={st.metaText}>
										{timeLabel}
									</Text>,
								);
							}
							return nodes.length > 0 ? (
								<View style={st.metaRow}>{nodes}</View>
							) : null;
						})()}
						{matchScore && matchScore.status !== 'TIMED' && matchScore.status !== 'IN_PLAY' && matchScore.status !== 'PAUSED' ? (() => {
							const canOpenMatch = Boolean(post.fixtureId) && (isMatchFinished || isLiveMatch || Boolean(post.lineupAvailable));
							const scoreContent = (
								<>
									{matchScore.status === 'IN_PLAY' ? <LiveDot /> : null}
									<Text style={st.matchScoreText}>
										{(() => {
											const teamA = post.postOptions?.[0]?.label?.trim() || null;
											const teamB = post.postOptions?.[1]?.label?.trim() || null;
											const teams = teamA && teamB ? `  ${teamA} vs ${teamB}` : '';
											const sc = matchScore!;
											const knockoutLine =
												isKnockoutStage(post.fixtureStage) && hasKnockoutScoreBreakdown(sc)
													? formatKnockoutScoreChip(sc)
													: null;
											if (sc.status === 'IN_PLAY') return `${liveMinute ?? 0}'  ${sc.home ?? 0}–${sc.away ?? 0}${teams}`;
											if (sc.status === 'PAUSED') return `HT  ${sc.home ?? 0}–${sc.away ?? 0}${teams}`;
											const scoreLine = knockoutLine ?? `FT  ${sc.home ?? 0}–${sc.away ?? 0}`;
											return `${scoreLine}${teams}`;
										})()}
									</Text>
								</>
							);
							return canOpenMatch ? (
								<Pressable
									style={({ pressed }) => [st.matchScoreBadge, pressed && { opacity: 0.7 }]}
									onPress={(e) => { e.stopPropagation?.(); router.push(`/world-cup/match/${post.fixtureId}${post.lineupAvailable && !isMatchFinished && !isLiveMatch ? '?tab=lineup' : ''}` as `/${string}`); }}
									hitSlop={8}
								>
									{scoreContent}
								</Pressable>
							) : (
								<View style={st.matchScoreBadge}>{scoreContent}</View>
							);
						})() : null}
					</View>
				</Pressable>
				{isAuthenticated ? (
					<Pressable style={st.moreBtn} onPress={handleMore} hitSlop={8}>
						<Text style={st.moreBtnText}>⋯</Text>
					</Pressable>
				) : (
					<View style={st.moreBtn} />
				)}
			</View>

			{/* Campaign ribbon */}
			{campaign ? <PostCampaignBadge campaign={campaign} /> : null}

			{/* Announcement header strip */}
			{isAnnouncement && (
				<View style={st.annHeader}>
					<Text style={st.annHeaderText}>📢  ANNOUNCEMENT</Text>
				</View>
			)}

			{/* Caption */}
			{post.caption ? (
				<LinkifyText
					text={post.caption}
					style={[st.caption, ...(isAnnouncement ? [st.captionAnnouncement] : [])]}
				/>
			) : null}

			{/* Announcement image grid */}
			{isAnnouncement && post.imageUrls.length > 0 ? (
				<AnnouncementImageGrid
					urls={post.imageUrls}
					onImagePress={(index) => {
						setSelectedImageIndex(index);
						setImageViewerVisible(true);
					}}
				/>
			) : isPoll ? (
				<View>
					{post.imageUrls.length > 0 ? (
						<View style={st.pollBodyMedia}>
							{post.imageUrls.map((url, bi) => (
								<PollBodyImage key={`${post.id}-pbody-${bi}`} uri={url} radius={10} bg={colors.card} />
							))}
						</View>
					) : null}
					<View style={st.pollOptions}>
						{Array.from({ length: pollOptionCount }, (_, i) => {
							const opt = pollOptions[i];
							const stat = activeStats?.find((s) => s.index === i);
							const pct = stat ? Math.round(stat.percentage) : 0;
							const count = stat ? Math.round(stat.count) : 0;
							const label = compareLabel(post, i);
							const picked = pollPick === i;
							const thumb = opt?.imageUrl?.trim() || null;
							const isLeading =
								(stat?.count ?? 0) > 0 && stat?.count === pollMaxCount;
							const isWinner = isVotingClosed && isLeading;
							const isLoser =
								(pollHasVoted || isVotingClosed) && !isLeading && !picked;
							// Every option gets its own colored proportional fill (overlay),
							// not just the leader — a distinct hue per option from the shared
							// split palette. Pick/winner stay flagged via border + medal.
							const optColor = MULTI_SPLIT_COLORS[i % MULTI_SPLIT_COLORS.length];
							const leadColor = isLeading
								? GREEN
								: picked
									? colors.accent
									: optColor;
							return (
								<Pressable
									key={`${post.id}-poll-${i}`}
									style={[
										st.pollRow,
										isLoser && st.pollRowLoser,
										isWinner && !picked && st.pollRowWinner,
										picked && st.pollRowPicked,
									]}
									onPress={() => handleCellTap(i)}
									disabled={isVotingClosed}>
									{pollShowResults ? (
										<View
											pointerEvents='none'
											style={[
												st.pollFill,
												{ width: `${pct}%`, backgroundColor: optColor, opacity: 0.22 },
											]}
										/>
									) : null}
									<View style={st.pollRowContent}>
										{thumb ? (
											<Image
												source={{ uri: thumb }}
												style={st.pollThumb}
												contentFit='cover'
												contentPosition={imageContentPosition(
													opt?.imageFocalX,
													opt?.imageFocalY,
												)}
												cachePolicy='memory-disk'
											/>
										) : (
											<View style={st.pollDot} />
										)}
										<Text style={st.pollLabel} numberOfLines={1}>
											{isWinner ? '🥇 ' : ''}
											{label}
										</Text>
										{picked ? <Text style={st.pollCheck}>✓</Text> : null}
										{pollShowResults ? (
											<Text style={[st.pollPct, leadColor && { color: leadColor }]}>
												{pct}%
											</Text>
										) : null}
										{pollShowResults ? (
											<Pressable
												style={st.pollVotersChip}
												onPress={() => openVoters(i)}
												hitSlop={6}>
												<Text style={st.pollVotersText}>👥 {count}</Text>
											</Pressable>
										) : null}
									</View>
								</Pressable>
							);
						})}
					</View>
				</View>
			) : compareUrls && !isBinary ? (
				/* ── Multi-option grid (3+ options) ── */
				<View style={st.compareSection}>
				<View style={styles.coachAnchor}>
				<View style={[styles.multiGrid, { gap: multiGridGap }]}>
					{compareRowsWithStart.map(({ size, start }, rowIdx) => (
						<View
							key={`${post.id}-mrow-${rowIdx}`}
							style={[styles.multiRow, { gap: multiGridGap }]}>
							{Array.from({ length: size }, (_, col) => {
								const i = start + col;
								const url = compareUrls[i];
								const stat = activeStats?.find((s) => s.index === i);
								const pct = stat ? Math.round(stat.percentage) : 0;
								const label =
									stat?.label?.trim() || compareLabel(post, i);
								const isVoted = activeMyIdx === i;
								const maxCount = Math.max(
									...(activeStats?.map((s) => s.count) ?? [0]),
								);
								const isWinner =
									isVotingClosed &&
									(stat?.count ?? 0) > 0 &&
									stat?.count === maxCount;
								const isLoser = isVotingClosed && !isWinner;
								const optionColor = MULTI_SPLIT_COLORS[i % 10];
								const cellRadius =
									compareOverlayMode === 'full' ? 6 : 10;
								const cellBody = (
									<Pressable
										style={styles.absoluteFill}
										onPress={() => handleCellTap(i)}
										disabled={isVotingClosed}>
										<Image
											source={{ uri: url }}
											style={styles.multiImg}
											contentFit='cover'
											contentPosition={imageContentPosition(
												post.postOptions?.[i]?.imageFocalX,
												post.postOptions?.[i]?.imageFocalY,
											)}
											recyclingKey={`${post.id}-opt-${i}`}
											{...feedImageProps()}
										/>
										{compareOverlayMode === 'slim' ? (
											<View
												style={[
													st.binaryOverlay,
													!showCompareStats && st.binaryOverlayPreview,
												]}>
												<View style={st.binaryOverlayInner}>
													<Text style={st.binaryOverlayPct}>{pct}%</Text>
													<Text
														style={st.binaryOverlayLabel}
														numberOfLines={1}>
														{label}
													</Text>
												</View>
												{showCompareStats ? (
													<View style={st.binaryOverlayMeter}>
														<View
															style={[
																st.binaryOverlayMeterFill,
																{
																	width: `${Math.max(0, Math.min(100, pct))}%`,
																	backgroundColor: optionColor,
																},
															]}
														/>
													</View>
												) : null}
											</View>
										) : compareOverlayMode === 'minimal' ? (
												<View style={st.minimalBar}>
													<View
														style={[
															st.minimalBarFill,
															{
																flex: Math.max(pct, 0),
																backgroundColor: optionColor,
															},
														]}
													/>
													<View style={{ flex: Math.max(100 - pct, 0) }} />
												</View>
											) : compareOverlayMode === 'compact' ? (
												<View style={st.compactOverlay}>
													<Text style={st.compactLabel} numberOfLines={1}>
														{label}
													</Text>
													<View style={st.compactMetaRow}>
														<View style={st.compactMeter}>
															<View
																style={[
																	st.compactMeterFill,
																	{
																		width: `${Math.max(0, Math.min(100, pct))}%`,
																		backgroundColor: optionColor,
																	},
																]}
															/>
														</View>
														<Text style={st.compactPctInline}>{pct}%</Text>
													</View>
												</View>
											) : (
												<View style={[st.pctOverlay, !showCompareStats && st.pctOverlayPreview]}>
													<View style={st.pctMainPill}>
														<Text style={st.pctText}>{pct}%</Text>
													</View>
													<Text style={st.pctLabel} numberOfLines={1}>
														{label}
													</Text>
													{showCompareStats ? (
														<View style={st.compareMeter}>
															<View
																style={[
																	st.compareMeterFill,
																	{
																		width: `${Math.max(0, Math.min(100, pct))}%`,
																		backgroundColor: optionColor,
																	},
																]}
															/>
														</View>
													) : null}
												</View>
											)}
											{useBorderState && isVoted && !isVotingClosed ? (
												<View
													pointerEvents='none'
													style={[
														styles.absoluteFill,
														st.votedRing,
														{ borderRadius: cellRadius },
													]}
												/>
											) : null}
											{useBorderState && isWinner ? (
												<View
													pointerEvents='none'
													style={[
														styles.absoluteFill,
														st.winnerRing,
														{ borderRadius: cellRadius },
													]}
												/>
											) : null}
											<Animated.View
												pointerEvents='none'
												style={[
													styles.absoluteFill,
													{
														backgroundColor: 'rgba(255,255,255,0.8)',
														opacity: flashOpacity[i],
													},
												]}
											/>
											{compareOverlayMode === 'full' && isVoted && !isVotingClosed && (
												<Animated.View
													style={[
														st.votedBadgeRow,
														{ transform: [{ scale: badgeScale[i] }] },
													]}>
													<View style={st.votedBadge}>
														<Text style={st.votedBadgeText}>✓ VOTED</Text>
													</View>
												</Animated.View>
											)}
											{compareOverlayMode === 'slim' && isVoted && !isVotingClosed && (
												<Animated.View
													style={[
														st.votedBadgeRow,
														{ transform: [{ scale: badgeScale[i] }] },
													]}>
													<View style={st.votedBadge}>
														<Text style={st.votedBadgeText}>✓ VOTED</Text>
													</View>
												</Animated.View>
											)}
											{compareOverlayMode === 'full' && isWinner && (
												<View style={st.winnerBadgeRow}>
													<View style={st.winnerBadge}>
														<Text style={st.winnerBadgeText}>👑 WINNER</Text>
													</View>
												</View>
											)}
											{compareOverlayMode === 'slim' && isWinner && (
												<View style={st.winnerBadgeRow}>
													<View style={st.winnerBadge}>
														<Text style={st.winnerBadgeText}>👑 WINNER</Text>
													</View>
												</View>
											)}
										</Pressable>
								);
								return (
									<Animated.View
										key={`${post.id}-multi-${i}`}
										style={[
											styles.multiCell,
											{
												width: multiCellWidth,
												height: multiCellWidth,
												borderRadius: cellRadius,
											},
											!isVotingClosed
												? { opacity: cellOpacity[i] }
												: isLoser
													? { opacity: 0.78 }
													: null,
											{ transform: [{ scale: cellScale[i] }] },
										]}>
										{cellBody}
									</Animated.View>
								);
							})}
						</View>
					))}
				</View>
				{compareOverlayMode === 'minimal' ? (
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={st.compareLegendRow}
						style={st.compareLegendScroll}>
						{compareUrls.map((_, i) => {
							const stat = activeStats?.find((s) => s.index === i);
							const pct = stat ? Math.round(stat.percentage) : 0;
							const label = compareLabel(post, i);
							const isVoted = activeMyIdx === i;
							return (
								<View
									key={`${post.id}-legend-${i}`}
									style={[
										st.compareLegendChip,
										isVoted && st.compareLegendChipVoted,
									]}>
									<View
										style={[
											st.compareLegendDot,
											{ backgroundColor: MULTI_SPLIT_COLORS[i % 10] },
										]}
									/>
									<Text style={st.compareLegendText} numberOfLines={1}>
										{label}
									</Text>
									<Text style={st.compareLegendPct}>{pct}%</Text>
								</View>
							);
						})}
					</ScrollView>
				) : null}
				{coachActive ? (
					<VoteCoachmark onDone={() => onCoachmarkDismiss?.('timeout')} />
				) : null}
				</View>
				</View>
			) : compareUrls ? (
				<View style={st.compareSection}>
				<>
					<View style={styles.coachAnchor}>
					<View style={st.compareWrap}>
						{compareUrls.slice(0, 2).map((url, i) => {
							const picked =
								(i === 0 && viewer === 'UP') || (i === 1 && viewer === 'DOWN');
							const pct = i === 0 ? leftPct : rightPct;
							const label = compareLabel(post, i);
							const isWinner = isBinaryWinnerSide(i as 0 | 1);
							const optionColor = MULTI_SPLIT_COLORS[i % 10];
							return (
								<Animated.View
									key={`${post.id}-${i}`}
									style={[
										st.compareCell,
										isVotingClosed && !isWinner && st.compareCellLoser,
										{
											transform: [{ scale: cellScale[i] }],
											// Once closed, drop the animated vote-dim and let the
											// static winner/loser style decide — otherwise a tie's
											// non-chosen winner stays stuck at the 0.55 vote-dim.
											...(isVotingClosed
												? null
												: { opacity: cellOpacity[i] }),
										},
									]}>
									<Pressable
										style={styles.fill}
										onPress={() => handleCellTap(i)}
										disabled={isVotingClosed}>
										<Image
											source={{ uri: url }}
											style={st.compareImg}
											contentFit='cover'
											contentPosition={imageContentPosition(
												post.postOptions?.[i]?.imageFocalX,
												post.postOptions?.[i]?.imageFocalY,
											)}
											recyclingKey={`${post.id}-bin-${i}`}
											{...feedImageProps()}
										/>
										<View
											style={[
												st.binaryOverlay,
												!showCompareStats && st.binaryOverlayPreview,
											]}>
											<View style={st.binaryOverlayInner}>
												<Text style={st.binaryOverlayPct}>{pct}%</Text>
												<Text style={st.binaryOverlayLabel} numberOfLines={1}>
													{label}
												</Text>
											</View>
											{showCompareStats ? (
												<View style={st.binaryOverlayMeter}>
													<View
														style={[
															st.binaryOverlayMeterFill,
															{
																width: `${Math.max(0, Math.min(100, pct))}%`,
																backgroundColor: optionColor,
															},
														]}
													/>
												</View>
											) : null}
										</View>
										{/* Vote flash */}
										<Animated.View
											pointerEvents='none'
											style={[
												styles.absoluteFill,
												{
													backgroundColor: 'rgba(255,255,255,0.8)',
													opacity: flashOpacity[i],
												},
											]}
										/>
										{picked && !isVotingClosed && (
											<Animated.View
												style={[
													st.votedBadgeRow,
													{ transform: [{ scale: badgeScale[i] }] },
												]}>
												<View style={st.votedBadge}>
													<Text style={st.votedBadgeText}>✓ VOTED</Text>
												</View>
											</Animated.View>
										)}
										{isWinner && (
											<View style={st.winnerBadgeRow}>
												<View style={st.winnerBadge}>
													<Text style={st.winnerBadgeText}>👑 WINNER</Text>
												</View>
											</View>
										)}
									</Pressable>
								</Animated.View>
							);
						})}
					</View>
					{coachActive ? (
						<VoteCoachmark onDone={() => onCoachmarkDismiss?.('timeout')} />
					) : null}
					</View>

				</>
				</View>
			) : post.imageUrls[0] ? (
				<AdaptiveImage
					uri={post.imageUrls[0]}
					onPress={() => {
						setSelectedImageIndex(0);
						setImageViewerVisible(true);
					}}
				/>
			) : null}

			{/* Anonymous vote toggle — always visible while voting is open */}
			{(compareUrls || isPoll) && !isVotingClosed && isAuthenticated && (
				<View style={[st.anonRow, !showRoundBadgeInMetaRow && st.anonRowEnd]}>
					{showRoundBadgeInMetaRow ? (
						<View style={st.roundBadge}>
							<Text style={st.roundBadgeIcon}>🏆</Text>
							<Text style={st.roundBadgeText} numberOfLines={1}>
								{knockoutRoundLabel}
							</Text>
						</View>
					) : null}
					<View style={[st.anonPill, anon && st.anonPillActive]}>
						<Text style={st.anonIcon}>👻</Text>
						<Text style={[st.anonLabel, anon && st.anonLabelActive]}>
							Vote anonymously
						</Text>
						<Switch
							value={anon}
							onValueChange={(val) => void handleAnonymousToggle(val)}
							trackColor={{ false: colors.border, true: colors.accent }}
							thumbColor='#ffffff'
						/>
					</View>
				</View>
			)}

			{/* Vote hint */}
			{compareUrls && !isVotingClosed ? (
				<View style={st.voteHintRow}>
					<Text style={[st.voteHintText, hasVoted && st.voteHintRecorded]}>
						{hasVoted
							? 'Voted — tap again to change or switch'
							: 'Tap an option to cast your vote'}
					</Text>
				</View>
			) : null}

			{/* spacer removed — status now lives in action rail zone 2 */}

			{/* Vote breakdown — only shown when expanded */}
			{detailsExpanded && isBinary && compareUrls ? (
				<View style={st.liveSplit}>
					<View
						style={[
							st.splitPanel,
							isVotingClosed ? st.splitPanelFinal : null,
						]}>
						<View style={st.splitPanelHead}>
							<View style={st.splitTitleWrap}>
								{isVotingClosed ? (
									<View style={st.splitFinalBadge}>
										<Text style={st.splitFinalBadgeText}>FINAL</Text>
									</View>
								) : (
									<View style={st.splitLiveBadge}>
										<View style={st.splitLiveDot} />
										<Text style={st.splitLiveText}>LIVE</Text>
									</View>
								)}
								<Text style={st.splitPanelTitle} numberOfLines={1}>
									{isVotingClosed ? 'Results' : 'Vote breakdown'}
								</Text>
							</View>
							<Text style={st.splitPanelMetric}>
								{binaryTotal > 0 ? `${binaryTotal} votes` : 'No votes yet'}
							</Text>
						</View>
						{binaryTotal > 0 ? (
							<View style={st.splitDuel}>
								<View
									style={[
										st.splitDuelSeg,
										{ flex: leftPct, backgroundColor: GREEN },
									]}
								/>
								<View
									style={[
										st.splitDuelSeg,
										{ flex: rightPct, backgroundColor: ORANGE },
									]}
								/>
							</View>
						) : null}
						<View style={st.splitRows}>
							{([0, 1] as const).map((i) => {
								const count = i === 0 ? up : down;
								const pct = i === 0 ? leftPct : rightPct;
								const label = compareLabel(post, i);
								const barColor = i === 0 ? GREEN : ORANGE;
								const isLeader =
									!binaryHasTie &&
									binaryTotal > 0 &&
									pct === binaryLeaderPct &&
									pct > 0;
								const isFinalWinner = isBinaryWinnerSide(i);
								return (
									<View
										key={i}
										style={[
											st.splitRow,
											isLeader ? st.splitRowLeader : null,
											isFinalWinner ? st.splitRowWinner : null,
											isVotingClosed && !isFinalWinner
												? st.splitRowLoser
												: null,
										]}>
										<View
											pointerEvents='none'
											style={[
												st.splitRowFill,
												{
													width: `${pct}%`,
													backgroundColor: barColor,
													opacity: isLeader ? 0.28 : 0.2,
												},
											]}
										/>
										<View style={st.splitRowInner}>
											<View
												style={[
													st.splitSwatch,
													{ backgroundColor: barColor },
												]}
											/>
											<Text style={st.splitRowLabel} numberOfLines={1}>
												{isFinalWinner ? '🥇 ' : ''}
												{label}
											</Text>
											<View style={st.splitRowStats}>
												<Text style={st.splitRowPct}>{pct}%</Text>
												<Text style={st.splitRowCount}>{count}</Text>
											</View>
											<Pressable
												style={st.splitVotersBtn}
												onPress={() => openVoters(i)}
												hitSlop={6}>
												<Text style={st.splitVotersBtnText}>👥 Voters</Text>
											</Pressable>
										</View>
									</View>
								);
							})}
						</View>
					</View>
				</View>
			) : null}

			{/* Multi-compare breakdown — only shown when expanded */}
			{detailsExpanded && !isBinary && !isPoll && compareUrls ? (
				<View style={st.liveSplit}>
					<View
						style={[
							st.splitPanel,
							isVotingClosed ? st.splitPanelFinal : null,
						]}>
						<View style={st.splitPanelHead}>
							<View style={st.splitTitleWrap}>
								{isVotingClosed ? (
									<View style={st.splitFinalBadge}>
										<Text style={st.splitFinalBadgeText}>FINAL</Text>
									</View>
								) : (
									<View style={st.splitLiveBadge}>
										<View style={st.splitLiveDot} />
										<Text style={st.splitLiveText}>LIVE</Text>
									</View>
								)}
								<Text style={st.splitPanelTitle} numberOfLines={1}>
									{isVotingClosed ? 'Results' : 'Vote breakdown'}
								</Text>
							</View>
							<Text style={st.splitPanelMetric}>
								{multiTotal > 0 ? `${multiTotal} votes` : 'No votes yet'}
							</Text>
						</View>
						<View style={st.splitRows}>
							{(activeStats ?? []).map((stat) => {
								const pct = Math.round(stat.percentage);
								const optColor =
									MULTI_SPLIT_COLORS[stat.index % MULTI_SPLIT_COLORS.length];
								const isLeader =
									multiLeaderPct != null &&
									multiLeaderPct > 0 &&
									multiLeaderCount === 1 &&
									pct === multiLeaderPct;
								const isFinalWinner = isMultiWinnerIndex(stat.index);
								return (
									<View
										key={stat.index}
										style={[
											st.splitRow,
											isLeader ? st.splitRowLeader : null,
											isFinalWinner ? st.splitRowWinner : null,
											isVotingClosed && !isFinalWinner
												? st.splitRowLoser
												: null,
										]}>
										<View
											pointerEvents='none'
											style={[
												st.splitRowFill,
												{
													width: `${pct}%`,
													backgroundColor: optColor,
													opacity: isLeader ? 0.28 : 0.2,
												},
											]}
										/>
										<View style={st.splitRowInner}>
											<View
												style={[
													st.splitSwatch,
													{ backgroundColor: optColor },
												]}
											/>
											<Text style={st.splitRowLabel} numberOfLines={1}>
												{isFinalWinner ? '🥇 ' : ''}
												{stat.label}
											</Text>
											<View style={st.splitRowStats}>
												<Text style={st.splitRowPct}>{pct}%</Text>
												<Text style={st.splitRowCount}>{stat.count}</Text>
											</View>
											<Pressable
												style={st.splitVotersBtn}
												onPress={() => openVoters(stat.index)}
												hitSlop={6}>
												<Text style={st.splitVotersBtnText}>👥 Voters</Text>
											</Pressable>
										</View>
									</View>
								);
							})}
						</View>
					</View>
				</View>
			) : null}

			{/* ── Two-zone action rail ── */}
			{isVotingClosed && !isMatchPost && post.voteWinner?.user ? (
				<PostVoteWinnerBanner
					winner={post.voteWinner}
					optionLabel={
						post.voteWinner.selectedOptionIndex != null
							? compareLabel(post, post.voteWinner.selectedOptionIndex)
							: null
					}
				/>
			) : null}

			{showCampaignWinner && post.campaignWinner ? (
				<PostCampaignWinnerBanner
					winner={post.campaignWinner}
					campaign={campaign}
					winningOptionLabel={campaignWinnerOptionLabel}
				/>
			) : showMatchStartsSoon ? (
				<View style={matchInProgressStyles.container}>
					<Text style={matchInProgressStyles.icon}>⏰</Text>
					<Text style={matchInProgressStyles.text}>Match starts soon · voting is closed</Text>
				</View>
			) : showMatchCalculating ? (
				<View style={matchInProgressStyles.container}>
					<Text style={matchInProgressStyles.icon}>⏳</Text>
					<Text style={matchInProgressStyles.text}>
						{winnerCountdown
							? `🏆 Winner reveals in ${winnerCountdown}`
							: '🏆 Revealing winner…'}
					</Text>
				</View>
			) : null}

			{isMatchPost && post.fixtureId && (isMatchFinished || isLiveMatch || post.lineupAvailable) ? (
				<MatchDetailRow
					fixtureId={post.fixtureId}
					matchScore={matchScore ?? null}
					teams={[
						post.postOptions?.[0]?.label?.trim() ?? null,
						post.postOptions?.[1]?.label?.trim() ?? null,
					]}
					effectiveMinute={liveMinute}
					liveStatusPill={liveStatusPill}
				/>
			) : null}

			{isMatchPost ? (
				<MatchPrediction
					postId={post.id}
					fixtureId={post.fixtureId ?? null}
					homeTeam={matchTeamLabel(post, 0)}
					awayTeam={matchTeamLabel(post, 1)}
					enabled
					suppressRoundBadge={showRoundBadgeInMetaRow}
				/>
			) : null}

			{(() => {
				const commentCount = post.commentCount ?? 0;
				const votersTotal = isBinary ? binaryTotal : multiTotal;
				const hasCompare = Boolean(compareUrls);

				const statusText = (() => {
					// Compare and poll posts both have voting deadlines/winners.
					if (!hasCompare && !isPoll) return null;
					if (isVotingClosed) {
						return (
							(isMatchPost ? '📊 ' : '🏆 ') +
							computeWinnerSummary(!isBinary, up, down, activeStats, (i) =>
								compareLabel(post, i),
								isMatchPost,
							)
						);
					}
					if (countdownStr) return '⏳ ' + countdownStr;
					return 'Voting open';
				})();

				type ChipDef = {
					i: number;
					icon: string;
					accessLabel: string;
					onPress: () => void;
					onLongPress?: () => void;
					count?: number;
					isHype?: boolean;
					isSave?: boolean;
					isVoters?: boolean;
					isComment?: boolean;
					active?: boolean;
				};
				const chips: ChipDef[] = [
					{
						i: 0,
						icon: 'chatbubble-outline',
						accessLabel: 'View comments',
						onPress: () => openComments(false),
						count: commentCount,
						isComment: true,
						active: false,
					},
					{
						i: 1,
						icon: 'link-outline',
						accessLabel: 'Copy link',
						onPress: () => void copyLink(),
					},
					// "Full page" chip is hidden on the detail screen — we're already there
					...(isDetail
						? []
						: [
								{
									i: 2,
									icon: 'open-outline',
									accessLabel: 'Full page',
									onPress: goToPost,
								} as ChipDef,
							]),
					{
						i: 3,
						icon: 'heart-outline',
						accessLabel: 'Hype',
						onPress: () => void handleHype(),
						onLongPress: hypeCount > 0
							? () => { Vibration.vibrate(30); setHypersVisible(true); }
							: undefined,
						count: hypeCount,
						isHype: true,
						active: liked,
					},
					{
						i: 4,
						icon: 'bookmark-outline',
						accessLabel: 'Keep',
						onPress: () => void handleSave(),
						count: saveCount,
						isSave: true,
						active: saved,
					},
					...(!isAnnouncement
						? [
								{
									i: 5,
									icon: 'people-outline',
									accessLabel: 'Voters',
									onPress: () => openVoters(null),
									count: votersTotal,
									isVoters: true,
								} as ChipDef,
							]
						: []),
				];

				return (
					<View style={st.actionRail}>
						{/* Zone 1 — icon chips */}
						<View style={st.actionRailIcons}>
							{chips.map(
								({
									i,
									icon,
									accessLabel,
									onPress,
									onLongPress,
									count,
									isHype,
									isSave,
									isVoters,
									isComment,
									active,
								}) => (
									<Animated.View
										key={i}
										style={{ transform: [{ scale: chipScales[i] }] }}>
										<Pressable
											style={[
												st.actionChipFlat,
												isHype && active && st.actionChipFlatHypeActive,
												isSave && active && st.actionChipFlatSaveActive,
												isComment && active && st.actionChipFlatCommentActive,
											]}
											onPressIn={() => chipPressIn(i)}
											onPressOut={() => chipPressOut(i)}
											onPress={onPress}
											onLongPress={onLongPress}
											delayLongPress={300}
											accessibilityLabel={accessLabel}
											hitSlop={4}>
											<View style={st.chipIconWrap}>
												<Ionicons
													name={
														(active && (isHype || isSave)
															? icon.replace('-outline', '')
															: icon) as keyof typeof Ionicons.glyphMap
													}
													size={22}
													color={
														isHype && active
															? '#f43f5e'
															: isSave && active
																? colors.accent
																: colors.subtext
													}
												/>
												{count != null && count > 0 ? (
													<View
														style={[
															st.chipBadge,
															isHype && st.chipBadgeRose,
															isSave && st.chipBadgeAmber,
															isVoters && st.chipBadgeVoters,
														]}>
														<Text style={st.chipBadgeText}>
															{count > 99 ? '99+' : count}
														</Text>
													</View>
												) : null}
											</View>
										</Pressable>
									</Animated.View>
								),
							)}
						</View>

						{/* Zone 2 — status + see details (compare posts only; poll has no expandable panel) */}
						{!isAnnouncement && statusText ? (
							<View style={st.actionRailContext}>
								<Text
									style={[
										st.actionStatusText,
										isVotingClosed && st.actionStatusTextResult,
										isPoll && { flex: 1 },
									]}
									numberOfLines={1}>
									{statusText}
								</Text>
								{!isPoll ? (
									<Pressable
										style={st.seeDetailsBtn2}
										onPress={() => setDetailsExpanded((v) => !v)}>
										<Text style={st.seeDetailsBtnText2}>
											{detailsExpanded ? 'Hide ‹' : 'See details ›'}
										</Text>
									</Pressable>
								) : null}
							</View>
						) : null}
					</View>
				);
			})()}

			{(() => {
				const commentCount = post.commentCount ?? 0;
				const userAvatar = normalizeProfileImageUrl(user?.profileImageUrl);
				const userInitial = (user?.displayName ?? user?.username ?? '?')
					.slice(0, 1)
					.toUpperCase();
				const userLabel =
					user?.displayName?.trim() || user?.username?.trim() || 'You';
				return (
					<>
						{commentCount > 0 ? (
							<Pressable
								style={st.commentCountLink}
								onPress={() => openComments(false)}
								accessibilityLabel={`View all ${commentCount} comments`}
							>
								<Text style={st.commentCountLinkText}>
									View all {commentCount} comment{commentCount !== 1 ? 's' : ''}
								</Text>
							</Pressable>
						) : null}
						<Pressable
							style={st.commentComposerStub}
							onPress={() => openComments(true)}
							accessibilityLabel='Write a comment'
						>
							<View style={st.commentStubAvatar}>
								{userAvatar ? (
									<Image
										source={{ uri: userAvatar }}
										style={StyleSheet.absoluteFill}
										contentFit='cover'
										cachePolicy='memory-disk'
									/>
								) : (
									<Text style={st.commentStubAvatarText}>{userInitial}</Text>
								)}
							</View>
							<View style={st.commentStubPill}>
								<Text style={st.commentStubPlaceholder}>
									{isAuthenticated ? `Comment as ${userLabel}` : 'Write a comment…'}
								</Text>
							</View>
						</Pressable>
					</>
				);
			})()}

			{/* Comments open on /comments/[postId] screen (full-screen route) */}
			{votersVisible ? (
			<FeedVotersPanel
				visible={votersVisible}
				onClose={() => setVotersVisible(false)}
				postId={post.id}
				optionLabels={optionLabels}
				initialTab={votersInitialTab}
				colors={colors}
				st={st}
				client={client}
			/>
			) : null}

			{hypersVisible ? (
			<FeedHypersPanel
				visible={hypersVisible}
				onClose={() => setHypersVisible(false)}
				postId={post.id}
				colors={colors}
				st={st}
				client={client}
			/>
			) : null}

			{/* ── More menu (owner actions) ── */}
			{moreMenuVisible ? (
			<Modal
				visible={moreMenuVisible}
				transparent
				animationType='fade'
				onRequestClose={() => setMoreMenuVisible(false)}>
				<Pressable
					style={styles.menuOverlay}
					onPress={() => setMoreMenuVisible(false)}>
					<View
						style={[
							styles.menuSheet,
							{ backgroundColor: colors.card, borderColor: colors.border },
						]}>
						<View
							style={[styles.menuHandle, { backgroundColor: colors.border }]}
						/>
						{isAdmin && (
							<Pressable
								style={[styles.menuRow, { borderBottomColor: colors.border }]}
								disabled={pinBusy}
								onPress={handleTogglePin}>
								<Text style={[styles.menuRowText, { color: colors.text }]}>
									{post.pinned
										? pinBusy
											? '📌 Unpinning…'
											: '📌 Unpin post'
										: pinBusy
											? '📌 Pinning…'
											: '📌 Pin to top'}
								</Text>
							</Pressable>
						)}
						{isOwner && (
							<Pressable
								style={[styles.menuRow, { borderBottomColor: colors.border }]}
								onPress={() => {
									setMoreMenuVisible(false);
									if (isAnnouncement || isPoll) {
										router.push({ pathname: '/edit-post', params: { postId: post.id } } as never);
									} else {
										router.push({ pathname: '/tabs/create', params: { editId: post.id } });
									}
								}}>
								<Text style={[styles.menuRowText, { color: colors.text }]}>
									✏️ Edit post
								</Text>
							</Pressable>
						)}
						{isOwner && activeIsVotingOpen && (
							<Pressable
								style={[styles.menuRow, { borderBottomColor: colors.border }]}
								onPress={() => {
									setMoreMenuVisible(false);
									setExtendMenuVisible(true);
								}}>
								<Text style={[styles.menuRowText, { color: colors.text }]}>
									⏱ Extend voting
								</Text>
							</Pressable>
						)}
						{(isOwner || isAdmin) && (
							<Pressable style={styles.menuRow} onPress={handleDelete}>
								<Text style={[styles.menuRowText, { color: '#ef4444' }]}>
									🗑 Delete post
								</Text>
							</Pressable>
						)}
					</View>
				</Pressable>
			</Modal>
			) : null}

			{/* ── Report post (non-owner) ── */}
			{reportMenuVisible ? (
			<Modal
				visible={reportMenuVisible}
				transparent
				animationType='slide'
				onRequestClose={() => !reportSubmitting && setReportMenuVisible(false)}>
				<View style={styles.reportModalRoot}>
					<Pressable
						style={styles.reportModalOverlay}
						onPress={() => !reportSubmitting && setReportMenuVisible(false)}
					/>
					<View
						style={[
							styles.menuSheet,
							styles.reportSheet,
							{ backgroundColor: colors.card, borderColor: colors.border },
						]}>
						<View style={[styles.menuHandle, { backgroundColor: colors.border }]} />
						<Text style={[styles.menuTitle, { color: colors.text }]}>Report post</Text>
						<Text style={[styles.reportHint, { color: colors.subtext }]}>
							Choose a reason. CTrend moderators will review reported posts in Admin →
							Reports.
						</Text>
						<ScrollView
							style={styles.reportReasonScroll}
							showsVerticalScrollIndicator={false}
							keyboardShouldPersistTaps='handled'>
							{CONTENT_REPORT_REASONS.map((reason) => (
								<Pressable
									key={reason.id}
									style={[styles.reportReasonRow, { borderBottomColor: colors.border }]}
									onPress={() => setReportReasonId(reason.id)}
									disabled={reportSubmitting}>
									<View
										style={[
											styles.reportRadio,
											{
												borderColor:
													reportReasonId === reason.id
														? colors.accent
														: colors.border,
											},
										]}>
										{reportReasonId === reason.id ? (
											<View
												style={[
													styles.reportRadioDot,
													{ backgroundColor: colors.accent },
												]}
											/>
										) : null}
									</View>
									<Text style={[styles.menuRowText, { color: colors.text }]}>
										{reason.label}
									</Text>
								</Pressable>
							))}
						</ScrollView>
						<TextInput
							style={[
								styles.reportInput,
								{
									color: colors.text,
									borderColor: colors.border,
									backgroundColor: colors.bg,
								},
							]}
							placeholder='Additional details (optional)'
							placeholderTextColor={colors.subtext}
							value={reportDetails}
							onChangeText={setReportDetails}
							multiline
							maxLength={1000}
							editable={!reportSubmitting}
						/>
						<View style={styles.reportActionsRow}>
							<Pressable
								style={[styles.reportCancelBtn, { borderColor: colors.border }]}
								onPress={() => setReportMenuVisible(false)}
								disabled={reportSubmitting}>
								<Text style={[styles.reportCancelText, { color: colors.text }]}>
									Cancel
								</Text>
							</Pressable>
							<Pressable
								style={[
									styles.reportSubmitBtn,
									{ backgroundColor: colors.accent, opacity: reportSubmitting ? 0.7 : 1 },
								]}
								onPress={() => void handleSubmitReport()}
								disabled={reportSubmitting}>
								{reportSubmitting ? (
									<ActivityIndicator color='#fff' />
								) : (
									<Text style={styles.reportSubmitText}>Submit report</Text>
								)}
							</Pressable>
						</View>
					</View>
				</View>
			</Modal>
			) : null}

			{/* ── Extend voting menu ── */}
			{extendMenuVisible ? (
			<Modal
				visible={extendMenuVisible}
				transparent
				animationType='fade'
				onRequestClose={() => setExtendMenuVisible(false)}>
				<Pressable
					style={styles.menuOverlay}
					onPress={() => setExtendMenuVisible(false)}>
					<View
						style={[
							styles.menuSheet,
							{ backgroundColor: colors.card, borderColor: colors.border },
						]}>
						<View
							style={[styles.menuHandle, { backgroundColor: colors.border }]}
						/>
						<Text style={[styles.menuTitle, { color: colors.text }]}>
							Extend voting by
						</Text>
						{(
							[
								{ label: '+12 hours', hours: 12 },
								{ label: '+1 day', hours: 24 },
								{ label: '+3 days', hours: 72 },
								{ label: '+1 week', hours: 168 },
							] as const
						).map((opt) => (
							<Pressable
								key={opt.hours}
								style={[styles.menuRow, { borderBottomColor: colors.border }]}
								onPress={() => void handleExtendVoting(opt.hours)}>
								<Text style={[styles.menuRowText, { color: colors.accent }]}>
									{opt.label}
								</Text>
							</Pressable>
						))}
					</View>
				</Pressable>
			</Modal>
			) : null}
			{imageViewerVisible ? (
			<ImageViewerModal
				visible={imageViewerVisible}
				imageUrls={post.imageUrls}
				initialIndex={selectedImageIndex}
				onClose={() => setImageViewerVisible(false)}
			/>
			) : null}
		</View>
	);
}

// ── Voters panel (modal sheet) ────────────────────────────────────────────────

const VOTERS_PAGE = 10;
const HYPERS_PAGE = 20;
const VOTER_TAG_COLORS = ['#6366f1', '#f97316', '#22c55e', '#a855f7'];

type FeedGqlVoter = {
	voteId: string;
	selectedOptionIndex: number;
	anonymous: boolean;
	createdAt: string;
	user?: {
		id: string;
		username: string;
		displayName?: string | null;
		profileImageUrl?: string | null;
	} | null;
};

type FeedVotersPanelProps = {
	visible: boolean;
	onClose: () => void;
	postId: string;
	optionLabels: string[];
	initialTab?: number | null;
	colors: ColorPalette;
	st: ReturnType<typeof makeStyles>;
	client: ReturnType<typeof useApolloClient>;
};

function FeedVotersPanel({
	visible,
	onClose,
	postId,
	optionLabels,
	initialTab,
	colors,
	st,
	client,
}: FeedVotersPanelProps) {
	const [activeTab, setActiveTab] = useState<number | null>(initialTab ?? null);

	// Sync tab whenever the panel is opened (may open with different initialTab each time)
	useEffect(() => {
		if (visible) setActiveTab(initialTab ?? null);
	}, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
	const [search, setSearch] = useState('');
	const [debouncedSearch, setDebouncedSearch] = useState('');
	const [voters, setVoters] = useState<FeedGqlVoter[]>([]);
	const [hasMore, setHasMore] = useState(true);
	const [loadingInitial, setLoadingInitial] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const reqIdRef = useRef(0);
	const votersRef = useRef<FeedGqlVoter[]>([]);

	useEffect(() => {
		const t = setTimeout(() => setDebouncedSearch(search), 300);
		return () => clearTimeout(t);
	}, [search]);

	const fetchVoters = useCallback(
		async (append: boolean) => {
			const reqId = ++reqIdRef.current;
			if (append) setLoadingMore(true);
			else {
				setLoadingInitial(true);
				votersRef.current = [];
			}
			try {
				const base = append ? votersRef.current : [];
				const { data } = await client.query<{ votersByPost: FeedGqlVoter[] }>({
					query: VOTERS_BY_POST,
					variables: {
						postId,
						optionIndex: activeTab ?? undefined,
						search: debouncedSearch || null,
						skip: base.length,
						take: VOTERS_PAGE,
					},
					fetchPolicy: 'network-only',
				});
				if (reqIdRef.current !== reqId) return;
				const rows = data?.votersByPost ?? [];
				const next = [...base, ...rows];
				votersRef.current = next;
				setVoters(next);
				setHasMore(rows.length === VOTERS_PAGE);
			} catch {
				/* silent */
			} finally {
				if (reqIdRef.current === reqId) {
					setLoadingInitial(false);
					setLoadingMore(false);
				}
			}
		},
		[client, postId, activeTab, debouncedSearch],
	);

	useEffect(() => {
		if (!visible) return;
		void fetchVoters(false);
	}, [visible, activeTab, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

	function handleClose() {
		setVoters([]);
		setSearch('');
		setActiveTab(initialTab ?? null);
		setHasMore(true);
		reqIdRef.current++;
		onClose();
	}

	const tabs = [
		{ label: 'All', value: null },
		...optionLabels.map((l, i) => ({
			label: l || `Option ${i + 1}`,
			value: i,
		})),
	];

	return (
		<Modal
			visible={visible}
			transparent
			animationType='slide'
			onRequestClose={handleClose}>
			<Pressable style={st.votersOverlay} onPress={handleClose}>
				<View style={st.votersSheet} onStartShouldSetResponder={() => true}>
					<View style={st.votersHandle} />

					{/* Header */}
					<View style={st.votersHeader}>
						<Text style={st.votersTitle}>
							Voted by {voters.length}
							{hasMore ? '+' : ''}
						</Text>
						<Pressable
							onPress={handleClose}
							hitSlop={8}
							style={st.votersCloseBtn}>
							<Text style={st.votersCloseText}>✕</Text>
						</Pressable>
					</View>

					{/* Search */}
					<View style={st.votersSearch}>
						<TextInput
							value={search}
							onChangeText={setSearch}
							placeholder='Search voters…'
							placeholderTextColor={colors.muted}
							style={st.votersSearchInput}
							autoCapitalize='none'
						/>
						{search ? (
							<Pressable onPress={() => setSearch('')} hitSlop={8}>
								<Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
							</Pressable>
						) : null}
					</View>

					{/* Tabs */}
					{tabs.length > 1 && (
						<View
							style={{
								flexDirection: 'row',
								gap: 6,
								paddingHorizontal: 12,
								paddingVertical: 8,
							}}>
							{tabs.map((t) => (
								<Pressable
									key={String(t.value)}
									style={[
										st.votersTab,
										activeTab === t.value && st.votersTabActive,
									]}
									onPress={() => setActiveTab(t.value)}>
									<Text
										style={[
											st.votersTabText,
											activeTab === t.value && st.votersTabTextActive,
										]}>
										{t.label}
									</Text>
								</Pressable>
							))}
						</View>
					)}

					{/* Voter list */}
					<FlatList
						data={voters}
						keyExtractor={(v) => v.voteId}
						onEndReached={() => {
							if (hasMore && !loadingMore && !loadingInitial)
								void fetchVoters(true);
						}}
						onEndReachedThreshold={0.3}
						style={{ height: 340 }}
						ListEmptyComponent={
							loadingInitial ? (
								<ActivityIndicator
									style={{ margin: 24 }}
									color={colors.accent}
								/>
							) : (
								<Text style={st.voterEmpty}>
									{debouncedSearch ? 'No voters match' : 'No voters yet'}
								</Text>
							)
						}
						ListFooterComponent={
							loadingMore ? (
								<ActivityIndicator
									style={{ marginVertical: 12 }}
									color={colors.accent}
								/>
							) : !hasMore && voters.length > 0 ? (
								<Text
									style={[
										st.voterEmpty,
										{ fontSize: 11, paddingVertical: 10 },
									]}>
									That's everyone
								</Text>
							) : null
						}
						renderItem={({ item: v }) => {
							const name = v.anonymous
								? 'Anonymous'
								: v.user?.displayName?.trim() || v.user?.username || 'Unknown';
							const initial = name.slice(0, 1).toUpperCase();
							const img = !v.anonymous
								? normalizeProfileImageUrl(v.user?.profileImageUrl)
								: null;
							const tagLabel = optionLabels[v.selectedOptionIndex];
							const tagColor =
								VOTER_TAG_COLORS[
									v.selectedOptionIndex % VOTER_TAG_COLORS.length
								];
							return (
								<Pressable
									style={st.voterRow}
									onPress={() => {
										if (!v.anonymous && v.user) {
											handleClose();
											router.push(`/profile/${v.user.id}` as `/${string}`);
										}
									}}>
									<View style={st.voterAvatar}>
										{img ? (
											<Image
												source={{ uri: img }}
												style={StyleSheet.absoluteFill}
												contentFit='cover'
												cachePolicy='memory-disk'
											/>
										) : (
											<Text style={st.voterAvatarText}>
												{v.anonymous ? '?' : initial}
											</Text>
										)}
									</View>
									<View style={{ flex: 1 }}>
										<Text style={st.voterName}>{name}</Text>
										<Text style={st.voterTime}>
											{formatRelativeTime(v.createdAt)}
										</Text>
									</View>
									{activeTab === null && tagLabel ? (
										<View
											style={[
												st.voterOptionTag,
												{
													backgroundColor: tagColor + '22',
													borderColor: tagColor + '44',
												},
											]}>
											<Text
												style={[st.voterOptionTagText, { color: tagColor }]}>
												{tagLabel}
											</Text>
										</View>
									) : null}
								</Pressable>
							);
						}}
					/>
				</View>
			</Pressable>
		</Modal>
	);
}

type FeedGqlHyper = {
	id: string;
	username?: string | null;
	displayName?: string | null;
	profileImageUrl?: string | null;
};

type FeedHypersPanelProps = {
	visible: boolean;
	onClose: () => void;
	postId: string;
	colors: ColorPalette;
	st: ReturnType<typeof makeStyles>;
	client: ReturnType<typeof useApolloClient>;
};

// "Hyped by" list — Instagram-style sheet of users who hyped a post.
function FeedHypersPanel({ visible, onClose, postId, colors, st, client }: FeedHypersPanelProps) {
	const [search, setSearch] = useState('');
	const [debouncedSearch, setDebouncedSearch] = useState('');
	const [hypers, setHypers] = useState<FeedGqlHyper[]>([]);
	const [hasMore, setHasMore] = useState(true);
	const [loadingInitial, setLoadingInitial] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const reqIdRef = useRef(0);
	const hypersRef = useRef<FeedGqlHyper[]>([]);

	useEffect(() => {
		const t = setTimeout(() => setDebouncedSearch(search), 300);
		return () => clearTimeout(t);
	}, [search]);

	const fetchHypers = useCallback(
		async (append: boolean) => {
			const reqId = ++reqIdRef.current;
			if (append) setLoadingMore(true);
			else { setLoadingInitial(true); hypersRef.current = []; }
			try {
				const base = append ? hypersRef.current : [];
				const { data } = await client.query<{ hypersByPost: FeedGqlHyper[] }>({
					query: HYPERS_BY_POST,
					variables: { postId, search: debouncedSearch || null, skip: base.length, take: HYPERS_PAGE },
					fetchPolicy: 'network-only',
				});
				if (reqIdRef.current !== reqId) return;
				const rows = data?.hypersByPost ?? [];
				const next = [...base, ...rows];
				hypersRef.current = next;
				setHypers(next);
				setHasMore(rows.length === HYPERS_PAGE);
			} catch {
				/* silent */
			} finally {
				if (reqIdRef.current === reqId) { setLoadingInitial(false); setLoadingMore(false); }
			}
		},
		[client, postId, debouncedSearch],
	);

	useEffect(() => {
		if (!visible) return;
		void fetchHypers(false);
	}, [visible, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

	function handleClose() {
		setHypers([]);
		setSearch('');
		setHasMore(true);
		reqIdRef.current++;
		onClose();
	}

	return (
		<Modal visible={visible} transparent animationType='slide' onRequestClose={handleClose}>
			<Pressable style={st.votersOverlay} onPress={handleClose}>
				<View style={st.votersSheet} onStartShouldSetResponder={() => true}>
					<View style={st.votersHandle} />
					<View style={st.votersHeader}>
						<Text style={st.votersTitle}>Hyped by {hypers.length}{hasMore ? '+' : ''}</Text>
						<Pressable onPress={handleClose} hitSlop={8} style={st.votersCloseBtn}>
							<Text style={st.votersCloseText}>✕</Text>
						</Pressable>
					</View>
					<View style={st.votersSearch}>
						<TextInput
							value={search}
							onChangeText={setSearch}
							placeholder='Search…'
							placeholderTextColor={colors.muted}
							style={st.votersSearchInput}
							autoCapitalize='none'
						/>
						{search ? (
							<Pressable onPress={() => setSearch('')} hitSlop={8}>
								<Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
							</Pressable>
						) : null}
					</View>
					<FlatList
						data={hypers}
						keyExtractor={(h) => h.id}
						onEndReached={() => { if (hasMore && !loadingMore && !loadingInitial) void fetchHypers(true); }}
						onEndReachedThreshold={0.3}
						style={{ height: 340 }}
						ListEmptyComponent={
							loadingInitial
								? <ActivityIndicator style={{ margin: 24 }} color={colors.accent} />
								: <Text style={st.voterEmpty}>{debouncedSearch ? 'No matches' : 'No hypes yet'}</Text>
						}
						ListFooterComponent={
							loadingMore
								? <ActivityIndicator style={{ marginVertical: 12 }} color={colors.accent} />
								: !hasMore && hypers.length > 0
									? <Text style={[st.voterEmpty, { fontSize: 11, paddingVertical: 10 }]}>That's everyone</Text>
									: null
						}
						renderItem={({ item: h }) => {
							const name = h.displayName?.trim() || (h.username ? `@${h.username}` : 'User');
							const initial = name.replace(/^@/, '').slice(0, 1).toUpperCase();
							const img = normalizeProfileImageUrl(h.profileImageUrl);
							return (
								<Pressable
									style={st.voterRow}
									onPress={() => { handleClose(); router.push(`/profile/${h.id}` as `/${string}`); }}>
									<View style={st.voterAvatar}>
										{img ? (
											<Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit='cover' cachePolicy='memory-disk' />
										) : (
											<Text style={st.voterAvatarText}>{initial}</Text>
										)}
									</View>
									<View style={{ flex: 1 }}>
										<Text style={st.voterName}>{name}</Text>
									</View>
								</Pressable>
							);
						}}
					/>
				</View>
			</Pressable>
		</Modal>
	);
}

export const FeedPostCard = memo(FeedPostCardComponent, (prev, next) =>
	prev.post === next.post &&
	prev.isViewable === next.isViewable &&
	prev.variant === next.variant &&
	prev.showVoteCoachmark === next.showVoteCoachmark &&
	prev.onCoachmarkDismiss === next.onCoachmarkDismiss &&
	prev.initialCommentsOpen === next.initialCommentsOpen &&
	prev.highlightCommentId === next.highlightCommentId,
);

const styles = StyleSheet.create({
	fill: { flex: 1 },
	absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
	// Relative wrapper so the tap-to-vote coach mark can absolute-fill the media.
	coachAnchor: { position: 'relative' },
	// Multi-option grid (3–4 options)
	multiGrid: {
		flexDirection: 'column',
		paddingHorizontal: 0,
	},
	multiRow: {
		flexDirection: 'row',
		justifyContent: 'center',
	},
	multiCell: { overflow: 'hidden', position: 'relative' },
	multiImg: { width: '100%', height: '100%' },
	// More menu
	menuOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.5)',
		justifyContent: 'flex-end',
	},
	menuSheet: {
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		borderWidth: 1,
		paddingTop: 12,
		paddingBottom: 32,
		paddingHorizontal: 0,
	},
	menuHandle: {
		width: 36,
		height: 4,
		borderRadius: 2,
		alignSelf: 'center',
		marginBottom: 16,
	},
	menuTitle: {
		fontSize: 15,
		fontWeight: '700',
		paddingHorizontal: 20,
		marginBottom: 12,
	},
	menuRow: {
		paddingVertical: 16,
		paddingHorizontal: 20,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	menuRowText: { fontSize: 16 },
	reportModalRoot: { flex: 1, justifyContent: 'flex-end' },
	reportModalOverlay: {
		...StyleSheet.absoluteFill,
		backgroundColor: 'rgba(0,0,0,0.5)',
	},
	reportSheet: { maxHeight: '88%', paddingBottom: 24 },
	reportHint: {
		fontSize: 13,
		lineHeight: 18,
		paddingHorizontal: 20,
		marginBottom: 8,
	},
	reportReasonScroll: { maxHeight: 220 },
	reportReasonRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		paddingVertical: 12,
		paddingHorizontal: 20,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	reportRadio: {
		width: 20,
		height: 20,
		borderRadius: 10,
		borderWidth: 2,
		alignItems: 'center',
		justifyContent: 'center',
	},
	reportRadioDot: { width: 10, height: 10, borderRadius: 5 },
	reportInput: {
		marginHorizontal: 20,
		marginTop: 12,
		marginBottom: 16,
		minHeight: 72,
		borderWidth: 1,
		borderRadius: 12,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 15,
		textAlignVertical: 'top',
	},
	reportActionsRow: {
		flexDirection: 'row',
		gap: 10,
		marginHorizontal: 20,
		marginTop: 4,
	},
	reportCancelBtn: {
		flex: 1,
		borderRadius: 12,
		borderWidth: 1,
		paddingVertical: 14,
		alignItems: 'center',
	},
	reportCancelText: { fontSize: 15, fontWeight: '700' },
	reportSubmitBtn: {
		flex: 1.4,
		borderRadius: 12,
		paddingVertical: 14,
		alignItems: 'center',
	},
	reportSubmitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

const matchInProgressStyles = StyleSheet.create({
	container: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		marginHorizontal: 14,
		marginTop: 4,
		marginBottom: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: 'rgba(100,116,139,0.3)',
		backgroundColor: 'rgba(100,116,139,0.08)',
	},
	containerLive: {
		borderColor: 'rgba(249,115,22,0.35)',
		backgroundColor: 'rgba(249,115,22,0.08)',
	},
	icon: { fontSize: 18 },
	text: {
		flex: 1,
		fontSize: 12,
		fontWeight: '600',
		color: '#cbd5e1',
	},
	textLive: {
		flex: 1,
		fontSize: 14,
		fontWeight: '700',
		color: '#f97316',
	},
});

type MatchScore = MatchScoreBreakdown | null;

function MatchDetailRow({
	fixtureId,
	matchScore,
	teams,
	effectiveMinute,
	liveStatusPill,
}: {
	fixtureId: string;
	matchScore: MatchScore;
	teams: [string | null, string | null];
	effectiveMinute: number | null;
	liveStatusPill: string;
}) {
	const { colors, isDark } = useTheme();
	const isLive = matchScore?.status === 'IN_PLAY';
	const isPaused = matchScore?.status === 'PAUSED';
	const isFinished =
		matchScore?.status === 'FT' ||
		matchScore?.status === 'AET' ||
		matchScore?.status === 'PEN' ||
		matchScore?.status === 'FINISHED';

	const teamA = teams[0] ?? 'Home';
	const teamB = teams[1] ?? 'Away';
	const { home, away, penaltyLine } = feedCardLiveScores(matchScore);

	if (isLive || isPaused) {
		return (
			<LiveMatchPanel
				fixtureId={fixtureId}
				isLive={isLive}
				isHt={isPaused}
				isDark={isDark}
				colors={colors}
				liveStatusPill={liveStatusPill}
				effectiveMinute={effectiveMinute}
				teamA={teamA}
				teamB={teamB}
				home={home}
				away={away}
				penaltyLine={penaltyLine}
			/>
		);
	}

	const dotColor = isFinished ? '#64748b' : colors.muted;
	const barBg = isDark ? 'rgba(100,116,139,0.12)' : 'rgba(100,116,139,0.07)';
	const barBorder = isDark ? 'rgba(148,163,184,0.22)' : 'rgba(100,116,139,0.18)';

	return (
		<Pressable
			style={({ pressed }) => [
				mdrStyles.row,
				{
					backgroundColor: pressed ? (isDark ? 'rgba(100,116,139,0.18)' : 'rgba(100,116,139,0.1)') : barBg,
					borderColor: barBorder,
				},
			]}
			onPress={() =>
				router.push(
					`/world-cup/match/${fixtureId}${!isFinished ? '?tab=lineup' : ''}` as `/${string}`,
				)
			}
		>
			<View style={[mdrStyles.dot, { backgroundColor: dotColor }]} />
			<View style={mdrStyles.finishedScoreCol}>
				<Text style={[mdrStyles.scoreText, { color: colors.text }]} numberOfLines={1}>
					{teamA} {home}–{away} {teamB}
				</Text>
				{penaltyLine ? (
					<Text style={[mdrStyles.penLineText, { color: colors.subtext }]} numberOfLines={1}>
						{penaltyLine}
					</Text>
				) : null}
			</View>
			<Text style={[mdrStyles.cta, { color: colors.accent }]}>
				See details →
			</Text>
		</Pressable>
	);
}

const mdrStyles = StyleSheet.create({
	livePanel: {
		marginHorizontal: 12,
		marginTop: 4,
		marginBottom: 10,
		borderRadius: 14,
		borderWidth: 1,
		overflow: 'hidden',
	},
	livePanelHead: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 6,
		paddingTop: 10,
		paddingHorizontal: 14,
	},
	livePanelStatus: {
		fontSize: 11,
		fontWeight: '800',
		letterSpacing: 1,
		textTransform: 'uppercase',
	},
	livePanelBody: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: 8,
		paddingHorizontal: 16,
		paddingTop: 8,
		paddingBottom: 14,
	},
	livePanelScoreCol: {
		alignItems: 'center',
		justifyContent: 'center',
		minWidth: 88,
	},
	livePanelPenLine: {
		marginTop: 4,
		fontSize: 12,
		fontWeight: '700',
		letterSpacing: 0.2,
	},
	livePanelTeam: {
		flex: 1,
		fontSize: 12,
		fontWeight: '700',
		textAlign: 'center',
		lineHeight: 16,
	},
	livePanelScore: {
		fontSize: 32,
		fontWeight: '900',
		fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
	},
	livePanelScoreDash: {
		fontSize: 24,
		fontWeight: '300',
	},
	livePanelFoot: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingHorizontal: 14,
		paddingVertical: 11,
		borderTopWidth: StyleSheet.hairlineWidth,
		overflow: 'hidden',
		position: 'relative',
	},
	livePanelFootHighlight: {
		borderBottomLeftRadius: 14,
		borderBottomRightRadius: 14,
	},
	livePanelFootTitle: {
		fontSize: 13,
		fontWeight: '800',
		flexShrink: 0,
	},
	livePanelFootSub: {
		flex: 1,
		fontSize: 11,
		fontWeight: '500',
	},
	livePanelChevron: {
		fontSize: 20,
		fontWeight: '700',
		flexShrink: 0,
	},
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 7,
		marginHorizontal: 14,
		marginTop: 4,
		marginBottom: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderRadius: 10,
		borderWidth: 1,
	},
	dot: {
		width: 7,
		height: 7,
		borderRadius: 4,
		flexShrink: 0,
	},
	badge: {
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 5,
		flexShrink: 0,
	},
	badgeText: {
		fontSize: 10,
		fontWeight: '800',
		letterSpacing: 0.3,
	},
	scoreText: {
		fontSize: 13,
		fontWeight: '700',
		color: '#cbd5e1',
	},
	finishedScoreCol: { flex: 1, gap: 2 },
	penLineText: { fontSize: 12, fontWeight: '700' },
	cta: {
		fontSize: 12,
		fontWeight: '700',
		color: '#6366f1',
		flexShrink: 0,
	},
});
