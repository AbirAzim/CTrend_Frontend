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
} from 'react-native';
import {
	VOTE_POST,
	REMOVE_VOTE,
	SET_POST_HYPE,
	SET_POST_KEEP,
	POST_VOTE_UPDATED,
	POST_UPDATED,
	DELETE_POST,
	EXTEND_POST_VOTING,
	FEED_POSTS,
	VOTERS_BY_POST,
} from '@ctrend/shared/graphql/feed';
import { normalizeProfileImageUrl } from '@ctrend/shared/lib/profileImageUrl';
import { formatRelativeTime } from '@ctrend/shared/lib/formatRelativeTime';
import type { FeedPostView } from '@ctrend/shared/types/feed';
import { useAuth } from '../context/AuthContext';
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
import { categoryChipColors } from '../lib/categoryColor';
import { LinkifyText } from '../lib/linkify';
import { ImageViewerModal } from './ImageViewerModal';

const { width: SCREEN_W } = Dimensions.get('window');
// Card has marginHorizontal:12 on each side, so its inner content is narrower
// than the screen. Compare grids must size against this, not SCREEN_W.
const CARD_MARGIN_H = 12;
const CARD_CONTENT_W = SCREEN_W - CARD_MARGIN_H * 2;
const MULTI_GRID_GAP = 2;
const IMG_W = (SCREEN_W - 2) / 2;
const IMG_H = IMG_W * 1.25;

// Per-count compare grid recipes. Each entry is the number of images per row,
// top → bottom. Cells are all the same square size (sized to the widest row),
// short rows are centered, and nothing ever scrolls.
const COMPARE_ROW_RECIPES: Record<number, number[]> = {
	2: [2],
	3: [3],
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
		matchScore?: { status: string | null; home: number | null; away: number | null; winner: string | null } | null;
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

/**
 * A poll context/body photo shown in FULL — never cropped. Keeps the image's
 * natural aspect ratio (measured on load) and only caps very tall photos at a
 * max height. We compute the exact display box from the natural ratio and
 * **center it** — so portrait photos sit in the middle instead of hugging the
 * left edge with dead space (the old width:100% + maxHeight letterboxing bug).
 */
function PollBodyImage({ uri, radius }: { uri: string; radius: number }) {
	const [ar, setAr] = useState<number | null>(null);
	const maxHeight = Math.round(Dimensions.get('window').height * 0.5);
	// pollBodyMedia adds paddingHorizontal: 14 on each side.
	const availW = CARD_CONTENT_W - 28;
	const a = ar ?? 1.4;
	let w = availW;
	let h = w / a;
	if (h > maxHeight) {
		h = maxHeight;
		w = Math.round(h * a); // portrait → narrower than full width, so we center it
	}
	return (
		<View style={{ alignItems: 'center' }}>
			<Image
				source={{ uri }}
				style={{
					width: w,
					height: h,
					borderRadius: radius,
					backgroundColor: '#000',
				}}
				contentFit='cover'
				cachePolicy='memory-disk'
				onLoad={(e) => {
					const iw = e?.source?.width;
					const ih = e?.source?.height;
					if (iw && ih) setAr(iw / ih);
				}}
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
			marginBottom: 14,
			marginHorizontal: 12,
			borderRadius: 22,
			borderWidth: 1,
			borderColor: c.border,
			overflow: 'hidden' as const,
			// Soft, diffuse depth — the card floats cleanly over the feed rather
			// than sitting in a hard-edged box.
			elevation: 3,
			shadowColor: '#000',
			shadowOffset: { width: 0, height: 6 },
			shadowOpacity: isDark ? 0.22 : 0.07,
			shadowRadius: 16,
		},
		cardLive: {
			borderColor: 'rgba(34,197,94,0.45)',
			borderWidth: 2,
		},
		liveBorderOverlay: {
			borderRadius: 22,
			borderWidth: 2,
			borderColor: 'rgba(34,197,94,0.45)',
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
			width: 42,
			height: 42,
			borderRadius: 21,
			overflow: 'hidden' as const,
		},
		avatar: { width: 42, height: 42, borderRadius: 21 },
		avatarFallback: {
			backgroundColor: '#312e81',
			justifyContent: 'center' as const,
			alignItems: 'center' as const,
		},
		avatarText: { color: '#ffffff', fontSize: 16, fontWeight: '700' as const },
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
		metaSep: { fontSize: 12, color: c.muted },
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
		moreBtn: { padding: 8 },
		moreBtnText: { fontSize: 20, color: c.subtext, letterSpacing: 2 },
		caption: {
			paddingHorizontal: 14,
			paddingTop: 2,
			paddingBottom: 12,
			fontSize: 15,
			color: c.text,
			lineHeight: 22,
			fontWeight: '600' as const,
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
		compareWrap: { flexDirection: 'row' as const, gap: 3 },
		compareCell: { flex: 1, height: IMG_H, overflow: 'hidden' as const },
		compareCellLoser: { opacity: 0.5 },
		// Colored glow border on the cell the viewer picked (mirrors web's
		// `box-shadow: inset 0 0 0 3px <optionColor>`).
		compareCellPicked: { borderWidth: 2.5 },
		compareImg: { width: '100%' as const, height: '100%' as const },
		pctOverlay: {
			position: 'absolute' as const,
			bottom: 0,
			left: 0,
			right: 0,
			paddingTop: 16,
			paddingBottom: 9,
			paddingHorizontal: 8,
			backgroundColor: 'rgba(15,23,42,0.6)',
			alignItems: 'center' as const,
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
		splitBar: { flexDirection: 'row' as const, height: 5 },
		splitBarLeft: { backgroundColor: GREEN },
		splitBarRight: { backgroundColor: ORANGE },
		voteHintRow: { paddingVertical: 10, alignItems: 'center' as const },
		voteHintText: { fontSize: 12, color: c.subtext },
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
		liveSplit: { paddingHorizontal: 14, paddingBottom: 10 },
		liveSplitHeader: {
			flexDirection: 'row' as const,
			justifyContent: 'space-between' as const,
			alignItems: 'center' as const,
			marginBottom: 8,
		},
		liveSplitTitle: {
			fontSize: 11,
			fontWeight: '800' as const,
			color: c.text,
			letterSpacing: 0.8,
		},
		liveSplitTotal: { fontSize: 11, color: c.muted },
		splitOptionRow: {
			backgroundColor: c.section,
			borderRadius: 10,
			padding: 10,
			marginBottom: 6,
			borderWidth: 1,
			borderColor: c.border,
		},
		splitOptionMeta: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			justifyContent: 'space-between' as const,
			marginBottom: 6,
		},
		splitOptionLabel: {
			fontSize: 13,
			fontWeight: '600' as const,
			color: c.text,
			flex: 1,
		},
		splitOptionRight: {
			flexDirection: 'row' as const,
			alignItems: 'center' as const,
			gap: 8,
		},
		splitOptionCount: {
			fontSize: 12,
			color: c.subtext,
			fontWeight: '600' as const,
		},
		seeVotersBtn: {
			borderWidth: 1,
			borderColor: c.border,
			borderRadius: 6,
			paddingHorizontal: 8,
			paddingVertical: 3,
		},
		seeVotersBtnText: {
			fontSize: 10,
			color: c.subtext,
			fontWeight: '700' as const,
		},
		optionBarTrack: {
			height: 4,
			flexDirection: 'row' as const,
			borderRadius: 2,
			overflow: 'hidden' as const,
			backgroundColor: c.border,
		},
		optionBarFill: { borderRadius: 2 },
		optionBarEmpty: { backgroundColor: c.border },
		// ── Poll format — stacked option rows (per-option colour + voter chip) ──
		pollBodyMedia: { paddingHorizontal: 14, paddingBottom: 6, gap: 6 },
		pollBodyImage: { width: '100%' as const, height: 200, borderRadius: 10 },
		pollOptions: { paddingHorizontal: 14, paddingTop: 4, gap: 10 },
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
		pollRowPicked: { borderColor: c.accent, borderWidth: 1.5 },
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
			paddingHorizontal: 14,
			paddingVertical: 6,
			gap: 8,
		},
		anonIcon: { fontSize: 13 },
		anonLabel: {
			flex: 1,
			fontSize: 12,
			color: c.subtext,
			fontWeight: '500' as const,
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
			fontVariant: ['tabular-nums'] as const,
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

function LiveDot() {
	const pulse = useRef(new Animated.Value(1)).current;
	useEffect(() => {
		Animated.loop(
			Animated.sequence([
				Animated.timing(pulse, { toValue: 0.2, duration: 600, useNativeDriver: true }),
				Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
			])
		).start();
	}, [pulse]);
	return (
		<Animated.View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#f97316', opacity: pulse }} />
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

function AnnouncementImageGrid({ urls, onImagePress }: { urls: string[]; onImagePress: (index: number) => void }) {
	const count = urls.length;
	const gap = 2;
	const screenWidth = Dimensions.get('window').width;
	const halfW = (screenWidth - gap) / 2;

	if (count === 1) {
		return <AdaptiveImage uri={urls[0]} onPress={() => onImagePress(0)} />;
	}
	if (count === 2) {
		return (
			<View style={{ flexDirection: 'row', gap }}>
				{urls.map((u, i) => (
					<Pressable key={i} onPress={() => onImagePress(i)} style={{ flex: 1 }}>
						<Image source={{ uri: u }} style={{ width: '100%', aspectRatio: 1 }} contentFit='contain' cachePolicy='memory-disk' />
					</Pressable>
				))}
			</View>
		);
	}
	if (count === 3) {
		return (
			<View>
				<AdaptiveImage uri={urls[0]} onPress={() => onImagePress(0)} />
				<View style={{ flexDirection: 'row', gap, marginTop: gap }}>
					{urls.slice(1).map((u, i) => (
						<Pressable key={i} onPress={() => onImagePress(i + 1)} style={{ flex: 1 }}>
							<Image source={{ uri: u }} style={{ width: '100%', aspectRatio: 1 }} contentFit='contain' cachePolicy='memory-disk' />
						</Pressable>
					))}
				</View>
			</View>
		);
	}
	if (count === 4) {
		return (
			<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
				{urls.map((u, i) => (
					<Pressable key={i} onPress={() => onImagePress(i)} style={{ width: halfW }}>
						<Image source={{ uri: u }} style={{ width: '100%', aspectRatio: 1 }} contentFit='contain' cachePolicy='memory-disk' />
					</Pressable>
				))}
			</View>
		);
	}
	// 5 or 6: first large, then 2-col grid
	const extra = count - 5;
	return (
		<View>
			<AdaptiveImage uri={urls[0]} onPress={() => onImagePress(0)} />
			<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, marginTop: gap }}>
				{urls.slice(1, 5).map((u, i) => (
					<Pressable key={i} onPress={() => onImagePress(i + 1)} style={{ width: halfW }}>
						<View style={{ width: '100%', aspectRatio: 1 }}>
							<Image source={{ uri: u }} style={{ width: '100%', height: '100%' }} contentFit='contain' cachePolicy='memory-disk' />
							{i === 3 && extra > 0 && (
								<View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
									<Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>+{extra + 1}</Text>
								</View>
							)}
						</View>
					</Pressable>
				))}
			</View>
		</View>
	);
}

function FeedPostCardComponent({
	post,
	variant = 'feed',
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
	const livePulse = useRef(new Animated.Value(1)).current;
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
	const splitLeftAnim = useRef(new Animated.Value(50)).current;
	const splitRightAnim = useRef(new Animated.Value(50)).current;
	const splitAnimMounted = useRef(false);
	const badgeInit = useRef(false);
	const prevViewer = useRef<FeedPostView['viewerVote'] | undefined>(undefined);
	const chipScales = useRef(
		[1, 1, 1, 1, 1, 1].map(() => new Animated.Value(1)),
	).current;

	const isOwner = !!user && !!post.authorId && user.id === post.authorId;

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
	// Tie-aware binary winner predicate: on a tie (up === down) BOTH sides win,
	// so neither image gets the loser dim/scrim. Matches web FeedPostCard.
	const isBinaryWinnerSide = (side: 0 | 1): boolean => {
		if (!isVotingClosed || binaryTotal <= 0) return false;
		if (up === down) return true; // tie → both sides win
		return side === 0 ? up > down : down > up;
	};
	const hasVoted = viewer !== null || activeMyIdx !== null;

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
	const compareRows = getCompareRows(compareCount);
	const compareMaxCols = compareRows.length ? Math.max(...compareRows) : 1;
	const multiCellWidth = Math.floor(
		(CARD_CONTENT_W - (compareMaxCols - 1) * MULTI_GRID_GAP) / compareMaxCols,
	);
	// Precompute each row's starting option index for row-based rendering.
	let compareRowCursor = 0;
	const compareRowsWithStart = compareRows.map((size) => {
		const start = compareRowCursor;
		compareRowCursor += size;
		return { size, start };
	});
	const multiTotal = activeStats?.reduce((sum, s) => sum + s.count, 0) ?? 0;

	// ── Post format flags ──
	const isAnnouncement = post.format === 'announcement';
	const isPoll = !isAnnouncement && post.format === 'poll';
	const pollOptions = post.postOptions ?? [];
	const pollOptionCount = isPoll
		? Math.max(pollOptions.length, activeStats?.length ?? 0)
		: 0;
	const pollPick = isPoll ? activeMyIdx : null;
	const pollHasVoted = pollPick !== null && pollPick !== undefined;
	const pollShowResults = pollHasVoted || isVotingClosed;
	const pollMaxCount = Math.max(0, ...(activeStats?.map((s) => s.count) ?? []));

	useEffect(() => {
		if (!activeVotingEndsAt || isVotingClosed) return;
		const timer = setInterval(() => {
			const r = calcCountdown(activeVotingEndsAt);
			setCountdownStr(r);
			if (!r) clearInterval(timer);
		}, 1000);
		return () => clearInterval(timer);
	}, [activeVotingEndsAt, isVotingClosed]);

	// Winner reveal countdown (post-match)
	useEffect(() => {
		if (!post.fixtureWinnerAt) return;
		const timer = setInterval(() => {
			setWinnerCountdown(calcWinnerCountdown(post.fixtureWinnerAt));
		}, 1000);
		return () => clearInterval(timer);
	}, [post.fixtureWinnerAt]);

	// Pulse animation for live matches
	const isLiveMatch = post.matchScore?.status === 'IN_PLAY' || post.matchScore?.status === 'PAUSED';
	useEffect(() => {
		if (!isLiveMatch) { livePulse.setValue(1); return; }
		const loop = Animated.loop(
			Animated.sequence([
				Animated.timing(livePulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
				Animated.timing(livePulse, { toValue: 1, duration: 800, useNativeDriver: true }),
			]),
		);
		loop.start();
		return () => loop.stop();
	}, [isLiveMatch]); // eslint-disable-line react-hooks/exhaustive-deps

	useSubscription<PostVoteUpdatedData>(POST_VOTE_UPDATED, {
		variables: { postId: post.id },
		skip: isDetail,
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
		},
	});

	// Live post edits — Apollo auto-merges the returned full post into the cache,
	// so images/caption/options/end-date update in place (feed + detail). Clear
	// optimistic vote state so a vote-reset edit reflects server truth.
	useSubscription<{ postUpdated?: { id: string } }>(POST_UPDATED, {
		variables: { postId: post.id },
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

	// Badge spring entrance + cell dim when viewer vote changes
	useEffect(() => {
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
				toValue: 0.55,
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
				toValue: 0.55,
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
	}, [viewer]); // eslint-disable-line react-hooks/exhaustive-deps

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
					toValue: 0.55,
					duration: 280,
					useNativeDriver: true,
				}).start();
			}
		}
	}, [activeMyIdx, isBinary]); // eslint-disable-line react-hooks/exhaustive-deps

	// Animated split bar
	useEffect(() => {
		if (!splitAnimMounted.current) {
			splitLeftAnim.setValue(leftPct || 50);
			splitRightAnim.setValue(rightPct || 50);
			splitAnimMounted.current = true;
			return;
		}
		Animated.parallel([
			Animated.timing(splitLeftAnim, {
				toValue: leftPct || 50,
				duration: 450,
				easing: Easing.out(Easing.quad),
				useNativeDriver: false,
			}),
			Animated.timing(splitRightAnim, {
				toValue: rightPct || 50,
				duration: 450,
				easing: Easing.out(Easing.quad),
				useNativeDriver: false,
			}),
		]).start();
	}, [leftPct, rightPct]); // eslint-disable-line react-hooks/exhaustive-deps

	const [voteMut] = useMutation<VotePostData>(VOTE_POST);
	const [removeVoteMut] = useMutation<RemoveVoteData>(REMOVE_VOTE);
	const [setHypeMut] = useMutation(SET_POST_HYPE);
	const [setKeepMut] = useMutation(SET_POST_KEEP);
	const [deleteMut] = useMutation(DELETE_POST);
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

		// Apply optimistic update immediately
		if (intent >= 0) {
			triggerVotePop(intent);
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
				const rawCounts = (curStats ?? []).map((s) => {
					let c = s.count;
					if (s.index === intent) c += 1;
					if (curMyIdx !== null && s.index === curMyIdx && curMyIdx !== intent)
						c = Math.max(0, c - 1);
					return { ...s, count: c };
				});
				const newTotal = rawCounts.reduce((sum, s) => sum + s.count, 0);
				setOptimisticVote({
					upvoteCount: curUp,
					downvoteCount: curDown,
					viewerVote: null,
					mySelectedOptionIndex: intent,
					optionStats: rawCounts.map((s) => ({
						...s,
						percentage: newTotal > 0 ? (s.count / newTotal) * 100 : 0,
					})),
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
				const rawCounts = (curStats ?? []).map((s) => ({
					...s,
					count: s.index === curMyIdx ? Math.max(0, s.count - 1) : s.count,
				}));
				const newTotal = rawCounts.reduce((sum, s) => sum + s.count, 0);
				setOptimisticVote({
					upvoteCount: curUp,
					downvoteCount: curDown,
					viewerVote: null,
					mySelectedOptionIndex: null,
					optionStats: rawCounts.map((s) => ({
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
						const total = counts.reduce((a, b) => a + b, 0);
						setOptimisticVote((prev) => ({
							upvoteCount: counts[0] ?? prev?.upvoteCount ?? 0,
							downvoteCount: counts[1] ?? prev?.downvoteCount ?? 0,
							viewerVote: null,
							mySelectedOptionIndex: null,
							optionStats:
								prev?.optionStats?.map((s, i) => ({
									...s,
									count: counts[i] ?? s.count,
									percentage:
										pcts[i] ??
										(total > 0 ? ((counts[i] ?? 0) / total) * 100 : 0),
								})) ?? null,
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
						const total = counts.reduce((a, b) => a + b, 0);
						setOptimisticVote((prev) => ({
							upvoteCount: counts[0] ?? prev?.upvoteCount ?? 0,
							downvoteCount: counts[1] ?? prev?.downvoteCount ?? 0,
							viewerVote: currentIntent === 0 ? 'UP' : 'DOWN',
							mySelectedOptionIndex: currentIntent,
							optionStats:
								prev?.optionStats?.map((s, i) => ({
									...s,
									count: counts[i] ?? s.count,
									percentage:
										pcts[i] ??
										(total > 0 ? ((counts[i] ?? 0) / total) * 100 : 0),
								})) ?? null,
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
		if (isOwner) {
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
	const showCampaignWinner = Boolean(post.campaignWinner) && isMatchPost;
	const campaignWinnerOptionLabel =
		post.campaignWinner?.winningOption != null
			? compareLabel(post, post.campaignWinner.winningOption)
			: null;
	// Show "match in progress" only for fixture-linked posts where voting has
	// closed (kickoff passed) but the real match result isn't in yet.
	const matchStatus = post.matchScore?.status ?? null;
	const isMatchFinished = matchStatus === 'FT' || matchStatus === 'AET' || matchStatus === 'PEN' || matchStatus === 'AWARDED' || matchStatus === 'FINISHED';
	const isMatchNotStarted = !isLiveMatch && !isMatchFinished; // NS, TIMED, null, etc.
	const showMatchLive = isMatchPost && isLiveMatch;
	const showMatchStartsSoon = isMatchPost && isMatchNotStarted && isVotingClosed && !showCampaignWinner;
	const showMatchCalculating = isMatchPost && isMatchFinished && isVotingClosed && !showCampaignWinner;
	const catColors = categoryChipColors(post.category, isDark);

	return (
		<View style={[st.card, isLiveMatch && st.cardLive]}>
			{isLiveMatch && (
				<Animated.View
					style={[StyleSheet.absoluteFill, st.liveBorderOverlay, { opacity: livePulse }]}
					pointerEvents="none"
				/>
			)}
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
									<Text key="glob" style={st.metaText}>
										🌍 Global
									</Text>,
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
						{post.matchScore && post.matchScore.status !== 'TIMED' ? (
							<View style={st.matchScoreBadge}>
								{post.matchScore.status === 'IN_PLAY' ? <LiveDot /> : null}
								<Text style={st.matchScoreText}>
									{(() => {
											const teamA = post.postOptions?.[0]?.label?.trim() || null;
											const teamB = post.postOptions?.[1]?.label?.trim() || null;
											const teams = teamA && teamB ? `  ${teamA} vs ${teamB}` : '';
											const sc = post.matchScore!;
											if (sc.status === 'IN_PLAY') return `${sc.minute ?? 0}'  ${sc.home ?? 0}–${sc.away ?? 0}${teams}`;
											if (sc.status === 'PAUSED') return `HT  ${sc.home ?? 0}–${sc.away ?? 0}${teams}`;
											return `FT  ${sc.home ?? 0}–${sc.away ?? 0}${teams}`;
										})()}
								</Text>
							</View>
						) : null}
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
					style={[st.caption, isAnnouncement && st.captionAnnouncement]}
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
								<PollBodyImage key={`${post.id}-pbody-${bi}`} uri={url} radius={10} />
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
							const isLoser = pollShowResults && !isLeading && !picked;
							// Every row that's either the current leader or the viewer's own
							// pick gets a proportional fill, not just a border — so a picked
							// underdog still reads as "filled in", just in accent instead of
							// green, rather than looking empty next to the leading bar.
							const leadColor = isLeading
								? GREEN
								: picked
									? colors.accent
									: null;
							return (
								<Pressable
									key={`${post.id}-poll-${i}`}
									style={[
										st.pollRow,
										isLoser && st.pollRowLoser,
										picked && st.pollRowPicked,
									]}
									onPress={() => handleCellTap(i)}
									disabled={isVotingClosed}>
									{pollShowResults && leadColor ? (
										<View
											pointerEvents='none'
											style={[
												st.pollFill,
												{ width: `${pct}%`, backgroundColor: leadColor },
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
				<View style={styles.coachAnchor}>
				<View style={styles.multiGrid}>
					{compareRowsWithStart.map(({ size, start }, rowIdx) => (
						<View
							key={`${post.id}-mrow-${rowIdx}`}
							style={styles.multiRow}>
							{Array.from({ length: size }, (_, col) => {
								const i = start + col;
								const url = compareUrls[i];
								const stat = activeStats?.find((s) => s.index === i);
								const pct = stat ? Math.round(stat.percentage) : 0;
								const label = compareLabel(post, i);
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
								return (
									<Animated.View
										key={`${post.id}-multi-${i}`}
										style={[
											styles.multiCell,
											{ width: multiCellWidth, height: multiCellWidth },
											isLoser && { opacity: 0.5 },
											isVoted &&
												!isVotingClosed && [
													st.compareCellPicked,
													{ borderColor: optionColor },
												],
											{ transform: [{ scale: cellScale[i] }] },
										]}>
										<Pressable
											style={styles.fill}
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
												cachePolicy='memory-disk'
											/>
											<View style={st.pctOverlay}>
												<View style={st.pctMainPill}>
													<Text style={st.pctText}>{pct}%</Text>
												</View>
												<Text style={st.pctLabel} numberOfLines={1}>
													{label}
												</Text>
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
											</View>
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
											{isVoted && !isVotingClosed && (
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
					))}
				</View>
				{coachActive ? (
					<VoteCoachmark onDone={() => onCoachmarkDismiss?.('timeout')} />
				) : null}
				</View>
			) : compareUrls ? (
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
										picked &&
											!isVotingClosed && [
												st.compareCellPicked,
												{ borderColor: optionColor },
											],
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
											cachePolicy='memory-disk'
										/>
										<View style={st.pctOverlay}>
											<View style={st.pctMainPill}>
												<Text style={st.pctText}>{pct}%</Text>
											</View>
											<Text style={st.pctLabel} numberOfLines={1}>
												{label}
											</Text>
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

					{/* Split bar — animated flex */}
					<View style={st.splitBar}>
						<Animated.View style={[st.splitBarLeft, { flex: splitLeftAnim }]} />
						<Animated.View
							style={[st.splitBarRight, { flex: splitRightAnim }]}
						/>
					</View>
				</>
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
				<View style={st.anonRow}>
					<Text style={st.anonIcon}>👻</Text>
					<Text style={st.anonLabel}>Vote anonymously</Text>
					<Switch
						value={anon}
						onValueChange={(val) => void handleAnonymousToggle(val)}
						trackColor={{ false: colors.border, true: colors.accent }}
						thumbColor='#ffffff'
					/>
				</View>
			)}

			{/* Vote hint */}
			{(compareUrls || isPoll) && !isVotingClosed ? (
				<View style={st.voteHintRow}>
					<Text style={[st.voteHintText, hasVoted && st.voteHintRecorded]}>
						{hasVoted
							? '✓ Voted — tap again to unvote · tap other to switch'
							: isPoll
								? '👆 Tap an option to cast your vote'
								: '👆 Tap an image to cast your vote'}
					</Text>
				</View>
			) : null}

			{/* spacer removed — status now lives in action rail zone 2 */}

			{/* Live Split — only shown when expanded */}
			{detailsExpanded && isBinary && binaryTotal > 0 ? (
				<View style={st.liveSplit}>
					<View style={st.liveSplitHeader}>
						<Text style={st.liveSplitTitle}>LIVE SPLIT</Text>
						<Text style={st.liveSplitTotal}>{binaryTotal} votes</Text>
					</View>
					{([0, 1] as const).map((i) => {
						const count = i === 0 ? up : down;
						const pct = i === 0 ? leftPct : rightPct;
						const label = compareLabel(post, i);
						const barColor = i === 0 ? GREEN : ORANGE;
						return (
							<View key={i} style={st.splitOptionRow}>
								<View style={st.splitOptionMeta}>
									<Text style={st.splitOptionLabel} numberOfLines={1}>
										{label}
									</Text>
									<View style={st.splitOptionRight}>
										<Text style={st.splitOptionCount}>
											{count} · {pct}%
										</Text>
										<Pressable
											style={st.seeVotersBtn}
											onPress={() => openVoters(i)}>
											<Text style={st.seeVotersBtnText}>SEE VOTERS</Text>
										</Pressable>
									</View>
								</View>
								<View style={st.optionBarTrack}>
									<View
										style={[
											st.optionBarFill,
											{ flex: pct, backgroundColor: barColor },
										]}
									/>
									<View style={[st.optionBarEmpty, { flex: 100 - pct }]} />
								</View>
							</View>
						);
					})}
				</View>
			) : null}

			{/* Multi-compare Live Split — only shown when expanded */}
			{detailsExpanded && !isBinary && !isPoll && multiTotal > 0 ? (
				<View style={st.liveSplit}>
					<View style={st.liveSplitHeader}>
						<Text style={st.liveSplitTitle}>LIVE SPLIT</Text>
						<Text style={st.liveSplitTotal}>{multiTotal} votes</Text>
					</View>
					{(activeStats ?? []).map((stat) => {
						const pct = Math.round(stat.percentage);
						return (
							<View key={stat.index} style={st.splitOptionRow}>
								<View style={st.splitOptionMeta}>
									<Text style={st.splitOptionLabel} numberOfLines={1}>
										{stat.label}
									</Text>
									<View style={st.splitOptionRight}>
										<Text style={st.splitOptionCount}>
											{stat.count} · {pct}%
										</Text>
										<Pressable
											style={st.seeVotersBtn}
											onPress={() => openVoters(stat.index)}>
											<Text style={st.seeVotersBtnText}>SEE VOTERS</Text>
										</Pressable>
									</View>
								</View>
								<View style={st.optionBarTrack}>
									<View
										style={[
											st.optionBarFill,
											{
													flex: pct || 1,
													backgroundColor:
														MULTI_SPLIT_COLORS[stat.index % 10],
												},
										]}
									/>
									<View style={[st.optionBarEmpty, { flex: 100 - pct || 1 }]} />
								</View>
							</View>
						);
					})}
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
			) : showMatchLive ? (
				<View style={[matchInProgressStyles.container, matchInProgressStyles.containerLive]}>
					<LiveDot />
					<Text style={matchInProgressStyles.textLive}>Match is live</Text>
				</View>
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

						{/* Zone 2 — status + see details (compare & poll posts, not announcements) */}
						{!isAnnouncement && statusText ? (
							<View style={st.actionRailContext}>
								<Text
									style={[
										st.actionStatusText,
										isVotingClosed && st.actionStatusTextResult,
									]}
									numberOfLines={1}>
									{statusText}
								</Text>
								<Pressable
									style={st.seeDetailsBtn2}
									onPress={() => setDetailsExpanded((v) => !v)}>
									<Text style={st.seeDetailsBtnText2}>
										{detailsExpanded ? 'Hide ‹' : 'See details ›'}
									</Text>
								</Pressable>
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

			{/* ── More menu (owner actions) ── */}
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
						<Pressable
							style={[styles.menuRow, { borderBottomColor: colors.border }]}
							onPress={() => {
								setMoreMenuVisible(false);
								router.push({ pathname: '/tabs/create', params: { editId: post.id } });
							}}>
							<Text style={[styles.menuRowText, { color: colors.text }]}>
								✏️ Edit post
							</Text>
						</Pressable>
						{activeIsVotingOpen && (
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
						<Pressable style={styles.menuRow} onPress={handleDelete}>
							<Text style={[styles.menuRowText, { color: '#ef4444' }]}>
								🗑 Delete post
							</Text>
						</Pressable>
					</View>
				</Pressable>
			</Modal>

			{/* ── Report post (non-owner) ── */}
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

			{/* ── Extend voting menu ── */}
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
			<ImageViewerModal
				visible={imageViewerVisible}
				imageUrls={post.imageUrls}
				initialIndex={selectedImageIndex}
				onClose={() => setImageViewerVisible(false)}
			/>
		</View>
	);
}

// ── Voters panel (modal sheet) ────────────────────────────────────────────────

const VOTERS_PAGE = 10;
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

export const FeedPostCard = memo(FeedPostCardComponent);

const styles = StyleSheet.create({
	fill: { flex: 1 },
	absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
	// Relative wrapper so the tap-to-vote coach mark can absolute-fill the media.
	coachAnchor: { position: 'relative' },
	// Multi-option grid (3–4 options)
	multiGrid: {
		flexDirection: 'column',
		gap: MULTI_GRID_GAP,
	},
	multiRow: {
		flexDirection: 'row',
		gap: MULTI_GRID_GAP,
		justifyContent: 'center',
	},
	multiCell: { overflow: 'hidden' },
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
		...StyleSheet.absoluteFillObject,
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
