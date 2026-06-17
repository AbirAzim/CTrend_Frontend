import { useQuery } from '@apollo/client/react';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from 'react-native';
import { WORLD_CUP_FIXTURE_DETAILS } from '@ctrend/shared/graphql/worldcup';
import { useTheme } from '../../../context/ThemeContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventPlayer = { id?: number | null; name?: string | null };
type MatchEvent = {
	time: number; timeExtra?: number | null;
	team: 'home' | 'away'; type: string; detail: string;
	player: EventPlayer; assist?: EventPlayer | null;
};
type LineupPlayer = {
	id?: number | null; name: string; number: number;
	pos?: string | null; grid?: string | null; photo?: string | null;
};
type LineupCoach = { id?: number | null; name: string; photo?: string | null };
type MatchLineup = {
	team: 'home' | 'away'; formation: string;
	startXI: LineupPlayer[]; substitutes: LineupPlayer[]; coach: LineupCoach;
};
type MatchStat = { type: string; home?: string | null; away?: string | null };
type PlayerRating = {
	playerId: number; name: string; team: 'home' | 'away';
	rating?: string | null; photo?: string | null;
};
type FixtureDetails = {
	id: string;
	homeTeam: { name: string; shortName: string; crest: string };
	awayTeam: { name: string; shortName: string; crest: string };
	kickoff: string; status: string; minute?: number | null;
	stage: string; group?: string | null;
	score: { home?: number | null; away?: number | null; winner?: string | null };
	venue?: { name: string; city: string } | null;
	campaignPostId?: string | null;
	events: MatchEvent[]; lineups: MatchLineup[];
	stats: MatchStat[]; playerRatings: PlayerRating[];
	detailsSyncedAt?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isLive(s: string) { return s === 'IN_PLAY' || s === 'PAUSED'; }
function isFinished(s: string) { return ['FINISHED','FT','AET','PEN','AWARDED'].includes(s); }

function minuteLabel(e: MatchEvent) {
	return e.timeExtra != null && e.timeExtra > 0 ? `${e.time}+${e.timeExtra}'` : `${e.time}'`;
}
function shortName(full?: string | null) {
	if (!full) return '';
	const p = full.trim().split(' ');
	return p.length === 1 ? p[0] : p[p.length - 1];
}
function goalScorers(events: MatchEvent[], team: 'home' | 'away') {
	return events
		.filter(e => e.type === 'Goal' && e.team === team && !e.detail.toLowerCase().includes('disallow'))
		.sort((a, b) => a.time - b.time)
		.map(e => {
			const min = minuteLabel(e);
			const nm = shortName(e.player.name);
			return e.detail.includes('Own Goal') ? `${nm} ${min} (OG)` : `${nm} ${min}`;
		});
}
function ratingColor(r: number) {
	if (r >= 8.5) return '#f59e0b';
	if (r >= 7.5) return '#22c55e';
	if (r >= 6.5) return '#f97316';
	return '#ef4444';
}
function motmPlayer(ratings: PlayerRating[]): PlayerRating | null {
	if (!ratings.length) return null;
	return ratings.reduce((b, c) => parseFloat(c.rating ?? '0') > parseFloat(b.rating ?? '0') ? c : b);
}
function deriveHalfScore(events: MatchEvent[]) {
	let home = 0, away = 0;
	for (const e of events) {
		if (e.type !== 'Goal' || e.detail.toLowerCase().includes('disallow') || e.time > 45) continue;
		if (e.detail.includes('Own Goal')) { e.team === 'home' ? away++ : home++; }
		else { e.team === 'home' ? home++ : away++; }
	}
	return { home, away };
}
function parseNum(v?: string | null) { return v ? parseFloat(v.replace('%', '')) || 0 : 0; }

// ─── Match header ─────────────────────────────────────────────────────────────

function MatchHeader({ fixture, isDark }: { fixture: FixtureDetails; isDark: boolean }) {
	const { status, minute, score, events, homeTeam, awayTeam, venue, playerRatings } = fixture;
	const live = isLive(status);
	const finished = isFinished(status);
	const hasScore = live || finished;
	const homeWon = score.winner === 'HOME_TEAM';
	const awayWon = score.winner === 'AWAY_TEAM';
	const homeScorers = hasScore ? goalScorers(events, 'home') : [];
	const awayScorers = hasScore ? goalScorers(events, 'away') : [];
	const star = (finished || live) ? motmPlayer(playerRatings) : null;

	const bg = isDark ? '#111827' : '#fff';
	const borderC = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
	const textPrimary = isDark ? '#f1f5f9' : '#0f172a';
	const textSub = isDark ? '#cbd5e1' : '#475569';    // readable secondary in both themes
	const textMuted = isDark ? '#94a3b8' : '#94a3b8';  // same mid-gray works for both
	const winColor = isDark ? '#60a5fa' : '#3b82f6';   // brighter blue in dark

	return (
		<View style={[mh.container, { backgroundColor: bg, borderBottomColor: borderC }]}>
			{/* Status */}
			<View style={mh.statusRow}>
				{live ? (
					<View style={mh.livePill}>
						<View style={mh.liveDot} />
						<Text style={mh.liveText}>{minute != null ? `${minute}'` : 'LIVE'}</Text>
					</View>
				) : finished ? (
					<View style={[mh.ftPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9' }]}>
						<Text style={[mh.ftText, { color: textMuted }]}>Full Time</Text>
					</View>
				) : (
					<Text style={[mh.statusText, { color: textMuted }]}>
						{new Date(fixture.kickoff).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
					</Text>
				)}
			</View>

			{/* Teams + score */}
			<View style={mh.teamsRow}>
				{/* Home */}
				<View style={mh.teamBlock}>
					{homeTeam.crest
						? <Image source={{ uri: homeTeam.crest }} style={mh.flag} contentFit='contain' />
						: <View style={[mh.flagPh, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}><Text style={{ fontSize: 9, color: textMuted }}>{homeTeam.shortName?.slice(0,3)}</Text></View>
					}
					<Text style={[mh.teamName, { color: homeWon ? winColor : textPrimary }]} numberOfLines={1}>{homeTeam.name}</Text>
					{homeScorers.length > 0 && (
						<Text style={[mh.scorers, { color: textSub }]} numberOfLines={4}>{homeScorers.join('\n')}</Text>
					)}
				</View>

				{/* Score */}
				<View style={mh.scoreBlock}>
					{hasScore ? (
						<Text style={mh.score}>
							<Text style={{ color: homeWon ? winColor : textPrimary }}>{score.home ?? 0}</Text>
							<Text style={[mh.scoreDash, { color: textMuted }]}> – </Text>
							<Text style={{ color: awayWon ? winColor : textPrimary }}>{score.away ?? 0}</Text>
						</Text>
					) : (
						<Text style={[mh.scoreVs, { color: textMuted }]}>vs</Text>
					)}
				</View>

				{/* Away */}
				<View style={mh.teamBlock}>
					{awayTeam.crest
						? <Image source={{ uri: awayTeam.crest }} style={mh.flag} contentFit='contain' />
						: <View style={[mh.flagPh, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}><Text style={{ fontSize: 9, color: textMuted }}>{awayTeam.shortName?.slice(0,3)}</Text></View>
					}
					<Text style={[mh.teamName, { color: awayWon ? winColor : textPrimary }]} numberOfLines={1}>{awayTeam.name}</Text>
					{awayScorers.length > 0 && (
						<Text style={[mh.scorers, { color: textSub }]} numberOfLines={4}>{awayScorers.join('\n')}</Text>
					)}
				</View>
			</View>

			{/* MoTM */}
			{star && star.rating && parseFloat(star.rating) >= 6.5 ? (
				<View style={[mh.motm, { borderColor: isDark ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.4)', backgroundColor: isDark ? 'rgba(245,158,11,0.08)' : 'rgba(254,243,199,0.7)' }]}>
					<View style={mh.motmLeft}>
						{star.photo
							? <Image source={{ uri: star.photo }} style={mh.motmPhoto} contentFit='cover' borderRadius={26} />
							: <View style={[mh.motmPhoto, { backgroundColor: isDark ? '#1e293b' : '#e2e8f0', borderRadius: 26 }]} />
						}
						<View style={[mh.motmRatingBadge, { backgroundColor: ratingColor(parseFloat(star.rating)) }]}>
							<Text style={mh.motmRatingText}>{parseFloat(star.rating).toFixed(1)}</Text>
						</View>
					</View>
					<View style={mh.motmInfo}>
						<Text style={mh.motmLabel}>MAN OF THE MATCH</Text>
						<Text style={[mh.motmName, { color: textPrimary }]}>{star.name}</Text>
						<Text style={[mh.motmTeam, { color: textMuted }]}>
							{star.team === 'home' ? fixture.homeTeam.name : fixture.awayTeam.name}
						</Text>
					</View>
				</View>
			) : null}

			{/* Venue */}
			{fixture.venue ? (
				<Text style={[mh.venue, { color: textMuted }]}>{fixture.venue.name}, {fixture.venue.city}</Text>
			) : null}
		</View>
	);
}

const mh = StyleSheet.create({
	container: { borderBottomWidth: 1, paddingBottom: 16 },
	statusRow: { alignItems: 'center', paddingTop: 14, paddingBottom: 10 },
	livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(239,68,68,0.12)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
	liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444' },
	liveText: { fontSize: 12, fontWeight: '800', color: '#ef4444' },
	ftPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
	ftText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
	statusText: { fontSize: 13, fontWeight: '600' },
	teamsRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12, gap: 4 },
	teamBlock: { flex: 1, alignItems: 'center', gap: 6 },
	flag: { width: 60, height: 42, marginBottom: 2 },
	flagPh: { width: 60, height: 42, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
	teamName: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
	scorers: { fontSize: 12, textAlign: 'center', lineHeight: 19 },
	scoreBlock: { width: 84, alignItems: 'center', justifyContent: 'center', paddingTop: 8 },
	score: { fontSize: 38, fontWeight: '900', letterSpacing: -1 },
	scoreDash: { fontSize: 30, fontWeight: '300' },
	scoreVs: { fontSize: 18, fontWeight: '600' },
	motm: {
		flexDirection: 'row', alignItems: 'center', gap: 12,
		marginHorizontal: 16, marginTop: 16, padding: 14,
		borderRadius: 14, borderWidth: 1,
	},
	motmLeft: { position: 'relative' },
	motmPhoto: { width: 56, height: 56 },
	motmRatingBadge: { position: 'absolute', bottom: -4, left: -4, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 99 },
	motmRatingText: { fontSize: 9, fontWeight: '800', color: '#fff' },
	motmInfo: { flex: 1, gap: 3 },
	motmLabel: { fontSize: 9.5, fontWeight: '800', color: '#f59e0b', letterSpacing: 0.8 },
	motmName: { fontSize: 16, fontWeight: '800' },
	motmTeam: { fontSize: 12 },
	venue: { fontSize: 11, textAlign: 'center', marginTop: 12, paddingHorizontal: 20 },
});

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ fixture, isDark }: { fixture: FixtureDetails; isDark: boolean }) {
	const { events, score, status } = fixture;
	const live = isLive(status);
	const finished = isFinished(status);
	const textPrimary = isDark ? '#f1f5f9' : '#0f172a';
	const textSub = isDark ? '#cbd5e1' : '#475569';
	const rowBorder = isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9';
	const divBg = isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9';
	const divBorder = isDark ? 'rgba(255,255,255,0.10)' : '#e2e8f0';
	const goalRowBg = isDark ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.03)';

	if (events.length === 0) {
		return (
			<View style={{ padding: 40, alignItems: 'center' }}>
				<Text style={{ color: textSub, fontSize: 14, textAlign: 'center' }}>
					{live ? 'Syncing live events…' : finished ? 'No event data available.' : 'Events will appear once the match starts.'}
				</Text>
			</View>
		);
	}

	const sorted = [...events].sort((a, b) => {
		const at = a.time + (a.timeExtra ?? 0) * 0.1;
		const bt = b.time + (b.timeExtra ?? 0) * 0.1;
		return bt - at;
	});
	const halfScore = finished ? deriveHalfScore(events) : null;

	type Row = { kind: 'event'; event: MatchEvent } | { kind: 'divider'; label: string };
	const rows: Row[] = [];
	if (finished || (score.home != null && score.away != null)) {
		rows.push({ kind: 'divider', label: finished ? `Full-Time  ${score.home ?? 0} – ${score.away ?? 0}` : `${score.home ?? 0} – ${score.away ?? 0}` });
	}
	let htInserted = false;
	for (const e of sorted) {
		if (!htInserted && halfScore && e.time <= 45) {
			rows.push({ kind: 'divider', label: `Half Time  ${halfScore.home} – ${halfScore.away}` });
			htInserted = true;
		}
		rows.push({ kind: 'event', event: e });
	}
	if (!htInserted && halfScore) rows.push({ kind: 'divider', label: `Half Time  ${halfScore.home} – ${halfScore.away}` });

	return (
		<View style={{ paddingBottom: 24 }}>
			<Text style={[ov.sectionTitle, { color: textSub }]}>Key Events</Text>
			{rows.map((row, i) => {
				if (row.kind === 'divider') {
					return (
						<View key={i} style={[ov.divider, { backgroundColor: divBg, borderColor: divBorder }]}>
							<Text style={[ov.dividerText, { color: textSub }]}>{row.label}</Text>
						</View>
					);
				}
				const e = row.event;
				const isHome = e.team === 'home';
				const isGoal = e.type === 'Goal';
				const isSub = e.type === 'subst';
				const name = e.player.name ?? '';
				const assistName = e.assist?.name ?? null;

				// Sub: player = coming on, assist = going off
				const subOut = isSub && assistName ? shortName(assistName) : null;

				// Icon emoji + optional text badge
				let icon = '·';
				let badge: { label: string; bg: string } | null = null;
				if (isGoal) {
					icon = '⚽';
					if (e.detail.includes('Own Goal')) badge = { label: 'OG', bg: '#f97316' };
					else if (e.detail.includes('Penalty')) badge = { label: 'P', bg: '#f59e0b' };
				} else if (isSub) {
					icon = '↕';
				} else if (e.type === 'Card') {
					icon = e.detail.toLowerCase().includes('red') || e.detail.includes('Second Yellow') ? '🟥' : '🟨';
				} else if (e.type === 'Var') {
					icon = '';
					badge = { label: 'VAR', bg: '#3b82f6' };
				}

				return (
					<View key={i} style={[ov.evRow, isGoal && { backgroundColor: goalRowBg }, { borderBottomColor: rowBorder }]}>
						{/* Home side */}
						<View style={[ov.evSide, { alignItems: 'flex-end' }]}>
							{isHome && (
								<>
									<Text style={[ov.evName, { color: textPrimary }]} numberOfLines={1}>{shortName(name)}</Text>
									{isSub && subOut && <Text style={[ov.evSubText, { color: textSub }]}>for {shortName(subOut)}</Text>}
									{isGoal && assistName && <Text style={[ov.evSubText, { color: textSub }]}>{shortName(assistName)}</Text>}
								</>
							)}
						</View>

						{/* Center */}
						<View style={ov.evCenter}>
							{isSub ? (
								<View style={ov.subIconWrap}>
									<Text style={ov.subIn}>▲</Text>
									<Text style={ov.subOut}>▼</Text>
								</View>
							) : (
								<View style={ov.evIconWrap}>
									{icon ? <Text style={ov.evIcon}>{icon}</Text> : null}
									{badge ? (
										<View style={[ov.evBadge, { backgroundColor: badge.bg }]}>
											<Text style={ov.evBadgeTxt}>{badge.label}</Text>
										</View>
									) : null}
								</View>
							)}
							<Text style={[ov.evMin, { color: textSub }]}>{minuteLabel(e)}</Text>
						</View>

						{/* Away side */}
						<View style={[ov.evSide, { alignItems: 'flex-start' }]}>
							{!isHome && (
								<>
									<Text style={[ov.evName, { color: textPrimary }]} numberOfLines={1}>{shortName(name)}</Text>
									{isSub && subOut && <Text style={[ov.evSubText, { color: textSub }]}>for {shortName(subOut)}</Text>}
									{isGoal && assistName && <Text style={[ov.evSubText, { color: textSub }]}>{shortName(assistName)}</Text>}
								</>
							)}
						</View>
					</View>
				);
			})}
		</View>
	);
}

const ov = StyleSheet.create({
	sectionTitle: { fontSize: 14, fontWeight: '800', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10 },
	divider: { paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1 },
	dividerText: { fontSize: 12.5, fontWeight: '700', textAlign: 'center', letterSpacing: 0.3 },
	evRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
	evSide: { flex: 1, paddingHorizontal: 10, gap: 3 },
	evName: { fontSize: 13, fontWeight: '700' },
	evSubText: { fontSize: 11.5 },
	evCenter: { width: 62, alignItems: 'center', gap: 3 },
	evIconWrap: { alignItems: 'center', gap: 2 },
	evIcon: { fontSize: 14 },
	evBadge: { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
	evBadgeTxt: { fontSize: 9.5, fontWeight: '800', color: '#fff' },
	evMin: { fontSize: 11, fontWeight: '700' },
	subIconWrap: { alignItems: 'center' },
	subIn: { fontSize: 11, color: '#22c55e', fontWeight: '700', lineHeight: 14 },
	subOut: { fontSize: 11, color: '#ef4444', fontWeight: '700', lineHeight: 14 },
});

// ─── Lineup tab ───────────────────────────────────────────────────────────────

function PitchPlayer({
	player, ratingMap, isDark,
}: { player: LineupPlayer; ratingMap: Map<number, string>; isDark: boolean }) {
	const [imgFailed, setImgFailed] = useState(false);
	const rating = player.id != null ? ratingMap.get(player.id) : undefined;
	const rNum = rating ? parseFloat(rating) : null;

	return (
		<View style={pitch.playerWrap}>
			<View style={pitch.avatarWrap}>
				{player.photo && !imgFailed
					? <Image source={{ uri: player.photo }} style={pitch.avatar} contentFit='cover' borderRadius={22} onError={() => setImgFailed(true)} />
					: <View style={pitch.avatarFallback}><Text style={pitch.avatarNum}>{player.number}</Text></View>
				}
				{/* Jersey number badge */}
				<View style={pitch.numBadge}>
					<Text style={pitch.numBadgeText}>{player.number}</Text>
				</View>
				{/* Rating badge */}
				{rNum != null && (
					<View style={[pitch.ratingBadge, { backgroundColor: ratingColor(rNum) }]}>
						<Text style={pitch.ratingText}>{rNum.toFixed(1)}</Text>
					</View>
				)}
			</View>
			<Text style={pitch.playerName} numberOfLines={1}>{shortName(player.name)}</Text>
		</View>
	);
}

const pitch = StyleSheet.create({
	playerWrap: { alignItems: 'center', width: 60 },
	avatarWrap: { position: 'relative', marginBottom: 12 },
	avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
	avatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
	avatarNum: { fontSize: 14, fontWeight: '800', color: '#fff' },
	numBadge: { position: 'absolute', bottom: -6, left: -2, backgroundColor: '#1e3a5f', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, minWidth: 18, alignItems: 'center' },
	numBadgeText: { fontSize: 8, fontWeight: '800', color: '#fff' },
	ratingBadge: { position: 'absolute', bottom: -6, right: -2, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
	ratingText: { fontSize: 8, fontWeight: '800', color: '#fff' },
	playerName: { fontSize: 9.5, fontWeight: '600', color: '#fff', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
});

function FormationRows({ players, reverse, ratingMap, isDark }: {
	players: LineupPlayer[]; reverse: boolean;
	ratingMap: Map<number, string>; isDark: boolean;
}) {
	const byRow = new Map<number, LineupPlayer[]>();
	for (const p of players) {
		if (!p.grid) continue;
		const row = parseInt(p.grid.split(':')[0], 10);
		if (!byRow.has(row)) byRow.set(row, []);
		byRow.get(row)!.push(p);
	}
	const noGrid = players.filter(p => !p.grid);
	if (noGrid.length && !byRow.has(0)) byRow.set(0, noGrid);

	let rows = [...byRow.entries()].sort((a, b) => a[0] - b[0]);
	if (reverse) rows = rows.reverse();

	return (
		<View style={{ gap: 4 }}>
			{rows.map(([row, rps]) => {
				const sorted = [...rps].sort((a, b) => {
					const ac = parseInt((a.grid ?? '0:1').split(':')[1], 10);
					const bc = parseInt((b.grid ?? '0:1').split(':')[1], 10);
					return ac - bc;
				});
				return (
					<View key={row} style={fo.row}>
						{sorted.map(p => (
							<PitchPlayer key={p.id ?? p.name} player={p} ratingMap={ratingMap} isDark={isDark} />
						))}
					</View>
				);
			})}
		</View>
	);
}

const fo = StyleSheet.create({
	row: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
});

function LineupTab({ fixture, isDark }: { fixture: FixtureDetails; isDark: boolean }) {
	const { lineups, playerRatings, homeTeam, awayTeam } = fixture;
	const textPrimary = isDark ? '#f1f5f9' : '#0f172a';
	const textSub = isDark ? '#cbd5e1' : '#475569';
	const surface = isDark ? '#111827' : '#fff';
	const rowBorder = isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9';

	if (lineups.length === 0) {
		return (
			<View style={{ padding: 40, alignItems: 'center' }}>
				<Text style={{ color: textSub, fontSize: 14 }}>Lineups will appear closer to kickoff.</Text>
			</View>
		);
	}

	const homeL = lineups.find(l => l.team === 'home');
	const awayL = lineups.find(l => l.team === 'away');
	const ratingMap = new Map(
		playerRatings.filter(r => r.rating != null).map(r => [r.playerId, r.rating as string])
	);

	const maxSubs = Math.max(homeL?.substitutes.length ?? 0, awayL?.substitutes.length ?? 0);

	return (
		<View style={{ paddingBottom: 24 }}>
			{/* Green pitch */}
			<View style={lu2.pitch}>
				{/* Home half */}
				{homeL && (
					<View style={lu2.pitchHalf}>
						<View style={lu2.pitchTeamBadge}>
							{homeTeam.crest
								? <Image source={{ uri: homeTeam.crest }} style={lu2.pitchCrest} contentFit='contain' />
								: null}
							<Text style={lu2.pitchTeamName}>{homeTeam.shortName}</Text>
							<Text style={lu2.pitchFormation}>{homeL.formation}</Text>
						</View>
						<FormationRows players={homeL.startXI} reverse={false} ratingMap={ratingMap} isDark={isDark} />
					</View>
				)}

				{/* Center line */}
				<View style={lu2.centerLine}>
					<View style={lu2.centerLineBar} />
					<View style={lu2.centerCircle} />
				</View>

				{/* Away half */}
				{awayL && (
					<View style={lu2.pitchHalf}>
						<FormationRows players={awayL.startXI} reverse={true} ratingMap={ratingMap} isDark={isDark} />
						<View style={[lu2.pitchTeamBadge, lu2.pitchTeamBadgeBottom]}>
							{awayTeam.crest
								? <Image source={{ uri: awayTeam.crest }} style={lu2.pitchCrest} contentFit='contain' />
								: null}
							<Text style={lu2.pitchTeamName}>{awayTeam.shortName}</Text>
							<Text style={lu2.pitchFormation}>{awayL.formation}</Text>
						</View>
					</View>
				)}
			</View>

			{/* Substitutes table */}
			{maxSubs > 0 && (
				<View style={[lu2.bench, { backgroundColor: surface }]}>
					{/* Header */}
					<View style={[lu2.benchHeader, { borderBottomColor: rowBorder }]}>
						<View style={lu2.benchHeaderTeam}>
							{homeTeam.crest ? <Image source={{ uri: homeTeam.crest }} style={lu2.benchCrest} contentFit='contain' /> : null}
							<Text style={[lu2.benchTeamName, { color: textPrimary }]}>{homeTeam.shortName}</Text>
						</View>
						<Text style={[lu2.benchTitle, { color: textSub }]}>SUBSTITUTES</Text>
						<View style={[lu2.benchHeaderTeam, { justifyContent: 'flex-end' }]}>
							<Text style={[lu2.benchTeamName, { color: textPrimary }]}>{awayTeam.shortName}</Text>
							{awayTeam.crest ? <Image source={{ uri: awayTeam.crest }} style={lu2.benchCrest} contentFit='contain' /> : null}
						</View>
					</View>

					{/* Player rows */}
					{Array.from({ length: maxSubs }).map((_, i) => {
						const hp = homeL?.substitutes[i];
						const ap = awayL?.substitutes[i];
						const hr = hp?.id != null ? ratingMap.get(hp.id) : undefined;
						const ar = ap?.id != null ? ratingMap.get(ap.id) : undefined;
						return (
							<View key={i} style={[lu2.benchRow, { borderBottomColor: rowBorder }]}>
								{/* Home sub */}
								{hp ? (
									<View style={lu2.benchPlayer}>
										{hp.photo
											? <Image source={{ uri: hp.photo }} style={lu2.benchAvatar} contentFit='cover' borderRadius={20} />
											: <View style={[lu2.benchAvatar, { backgroundColor: isDark ? '#1e293b' : '#e2e8f0', borderRadius: 20 }]} />
										}
										<View style={{ flex: 1 }}>
											<Text style={[lu2.benchName, { color: textPrimary }]} numberOfLines={1}>{hp.name}</Text>
											<View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
												<Text style={[lu2.benchPos, { color: textSub }]}>{hp.pos ?? ''}</Text>
												{hr ? <View style={[lu2.benchRating, { backgroundColor: ratingColor(parseFloat(hr)) }]}><Text style={lu2.benchRatingText}>{parseFloat(hr).toFixed(1)}</Text></View> : null}
											</View>
										</View>
									</View>
								) : <View style={{ flex: 1 }} />}
								{/* Divider */}
								<View style={[lu2.benchDivider, { backgroundColor: rowBorder }]} />
								{/* Away sub */}
								{ap ? (
									<View style={[lu2.benchPlayer, { flexDirection: 'row-reverse' }]}>
										{ap.photo
											? <Image source={{ uri: ap.photo }} style={lu2.benchAvatar} contentFit='cover' borderRadius={20} />
											: <View style={[lu2.benchAvatar, { backgroundColor: isDark ? '#1e293b' : '#e2e8f0', borderRadius: 20 }]} />
										}
										<View style={{ flex: 1, alignItems: 'flex-end' }}>
											<Text style={[lu2.benchName, { color: textPrimary }]} numberOfLines={1}>{ap.name}</Text>
											<View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
												{ar ? <View style={[lu2.benchRating, { backgroundColor: ratingColor(parseFloat(ar)) }]}><Text style={lu2.benchRatingText}>{parseFloat(ar).toFixed(1)}</Text></View> : null}
												<Text style={[lu2.benchPos, { color: textSub }]}>{ap.pos ?? ''}</Text>
											</View>
										</View>
									</View>
								) : <View style={{ flex: 1 }} />}
							</View>
						);
					})}

					{/* Management */}
					{(homeL?.coach || awayL?.coach) && (
						<>
							<View style={[lu2.mgmtHeader, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0' }]}>
								<Text style={[lu2.mgmtTitle, { color: textSub }]}>MANAGEMENT</Text>
							</View>
							<View style={lu2.benchRow}>
								{[{ l: homeL, team: homeTeam }, { l: awayL, team: awayTeam }].map(({ l, team }, idx) => {
									if (!l?.coach) return <View key={idx} style={{ flex: 1 }} />;
									return (
										<View key={idx} style={[lu2.benchPlayer, idx === 1 && { flexDirection: 'row-reverse' }]}>
											{l.coach.photo
												? <Image source={{ uri: l.coach.photo }} style={lu2.benchAvatar} contentFit='cover' borderRadius={20} />
												: <View style={[lu2.benchAvatar, { backgroundColor: isDark ? '#1e293b' : '#e2e8f0', borderRadius: 20 }]} />
											}
											<View style={idx === 1 ? { flex: 1, alignItems: 'flex-end' } : { flex: 1 }}>
												<Text style={[lu2.benchName, { color: textPrimary }]} numberOfLines={1}>{l.coach.name}</Text>
												<Text style={[lu2.benchPos, { color: textSub }]}>Head Coach</Text>
											</View>
										</View>
									);
								})}
							</View>
						</>
					)}
				</View>
			)}
		</View>
	);
}

const lu2 = StyleSheet.create({
	pitch: { backgroundColor: '#2d7a3a', paddingVertical: 8, paddingHorizontal: 8, gap: 0 },
	pitchHalf: { paddingVertical: 12, gap: 8 },
	pitchTeamBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
	pitchTeamBadgeBottom: {},
	pitchCrest: { width: 18, height: 18 },
	pitchTeamName: { fontSize: 11, fontWeight: '800', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
	pitchFormation: { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
	centerLine: { alignItems: 'center', justifyContent: 'center', height: 24 },
	centerLineBar: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
	centerCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: '#2d7a3a' },
	bench: { marginTop: 8 },
	benchHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
	benchHeaderTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
	benchCrest: { width: 16, height: 16 },
	benchTeamName: { fontSize: 11, fontWeight: '700' },
	benchTitle: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
	benchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, gap: 0 },
	benchPlayer: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
	benchDivider: { width: 1, height: 36, marginHorizontal: 8 },
	benchAvatar: { width: 38, height: 38, flexShrink: 0 },
	benchName: { fontSize: 12, fontWeight: '600' },
	benchPos: { fontSize: 10, fontWeight: '600' },
	benchRating: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 99 },
	benchRatingText: { fontSize: 9, fontWeight: '800', color: '#fff' },
	mgmtHeader: { paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, marginTop: 4 },
	mgmtTitle: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
});

// ─── Stats tab ────────────────────────────────────────────────────────────────

const STAT_LABEL: Record<string, string> = {
	'Ball Possession': 'Possession', 'expected_goals': 'Expected Goals (xG)',
	'Shots on Goal': 'Shots on Target', 'Total Shots': 'Total Shots',
	'Passes %': 'Pass Accuracy', 'Fouls': 'Fouls', 'Corner Kicks': 'Corners',
	'Offsides': 'Offsides', 'Yellow Cards': 'Yellow Cards', 'Red Cards': 'Red Cards',
	'Blocked Shots': 'Blocked Shots', 'Goalkeeper Saves': 'Goalkeeper Saves',
	'Shots insidebox': 'Shots Inside the Box', 'Shots outsidebox': 'Shots Outside the Box',
	'Total passes': 'Total Passes', 'Passes accurate': 'Accurate Passes',
};
const STAT_GROUPS = [
	{ label: 'General', keys: ['Ball Possession', 'expected_goals', 'Shots on Goal'] },
	{ label: 'Offense', keys: ['Total Shots', 'Blocked Shots', 'Shots insidebox', 'Shots outsidebox', 'Corner Kicks', 'Offsides'] },
	{ label: 'Distribution', keys: ['Total passes', 'Passes accurate', 'Passes %'] },
	{ label: 'Discipline', keys: ['Fouls', 'Yellow Cards', 'Red Cards', 'Goalkeeper Saves'] },
];

function StatsTab({ fixture, isDark }: { fixture: FixtureDetails; isDark: boolean }) {
	const { stats, homeTeam, awayTeam } = fixture;
	const textPrimary = isDark ? '#f1f5f9' : '#0f172a';
	const textSub = isDark ? '#cbd5e1' : '#475569';
	const cardBg = isDark ? '#1e293b' : '#f8fafc';
	const rowBorder = isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9';

	if (stats.length === 0) {
		return (
			<View style={{ padding: 40, alignItems: 'center' }}>
				<Text style={{ color: textSub, fontSize: 14 }}>Statistics available during and after the match.</Text>
			</View>
		);
	}

	const rendered = new Set<string>();

	return (
		<View style={{ paddingBottom: 24 }}>
			{/* Team header */}
			<View style={[sg.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0' }]}>
				<View style={sg.headerTeam}>
					{homeTeam.crest ? <Image source={{ uri: homeTeam.crest }} style={sg.headerCrest} contentFit='contain' /> : null}
					<Text style={[sg.headerName, { color: textPrimary }]}>{homeTeam.shortName}</Text>
				</View>
				<Text style={[sg.headerVs, { color: textSub }]}>vs</Text>
				<View style={[sg.headerTeam, { justifyContent: 'flex-end' }]}>
					<Text style={[sg.headerName, { color: textPrimary }]}>{awayTeam.shortName}</Text>
					{awayTeam.crest ? <Image source={{ uri: awayTeam.crest }} style={sg.headerCrest} contentFit='contain' /> : null}
				</View>
			</View>

			{STAT_GROUPS.map(group => {
				const rows = group.keys
					.map(k => stats.find(s => s.type === k))
					.filter((s): s is MatchStat => {
						if (!s) return false;
						if (rendered.has(s.type)) return false;
						rendered.add(s.type);
						return true;
					});
				if (rows.length === 0) return null;
				return (
					<View key={group.label} style={{ paddingHorizontal: 12, marginTop: 16 }}>
						<Text style={[sg.groupTitle, { color: textPrimary }]}>{group.label}</Text>
						<View style={[sg.card, { backgroundColor: cardBg }]}>
							{rows.map((s, i) => {
								const label = STAT_LABEL[s.type] ?? s.type;
								const hv = s.home ?? '0';
								const av = s.away ?? '0';
								const hWins = parseNum(s.home) > parseNum(s.away);
								const aWins = parseNum(s.away) > parseNum(s.home);
								return (
									<View key={s.type} style={[sg.row, i > 0 && { borderTopWidth: 1, borderTopColor: rowBorder }]}>
										{hWins
											? <View style={sg.pill}><Text style={sg.pillText}>{hv}</Text></View>
											: <Text style={[sg.val, { color: textSub }]}>{hv}</Text>
										}
										<Text style={[sg.label, { color: textSub }]} numberOfLines={1}>{label}</Text>
										{aWins
											? <View style={[sg.pill, sg.pillR]}><Text style={sg.pillText}>{av}</Text></View>
											: <Text style={[sg.val, sg.valR, { color: textSub }]}>{av}</Text>
										}
									</View>
								);
							})}
						</View>
					</View>
				);
			})}

			{/* Remaining */}
			{(() => {
				const rest = stats.filter(s => !rendered.has(s.type));
				if (!rest.length) return null;
				return (
					<View style={{ paddingHorizontal: 12, marginTop: 16 }}>
						<Text style={[sg.groupTitle, { color: textPrimary }]}>Other</Text>
						<View style={[sg.card, { backgroundColor: cardBg }]}>
							{rest.map((s, i) => {
								const label = STAT_LABEL[s.type] ?? s.type;
								const hv = s.home ?? '0';
								const av = s.away ?? '0';
								const hWins = parseNum(s.home) > parseNum(s.away);
								const aWins = parseNum(s.away) > parseNum(s.home);
								return (
									<View key={s.type} style={[sg.row, i > 0 && { borderTopWidth: 1, borderTopColor: rowBorder }]}>
										{hWins ? <View style={sg.pill}><Text style={sg.pillText}>{hv}</Text></View> : <Text style={[sg.val, { color: textSub }]}>{hv}</Text>}
										<Text style={[sg.label, { color: textSub }]} numberOfLines={1}>{label}</Text>
										{aWins ? <View style={[sg.pill, sg.pillR]}><Text style={sg.pillText}>{av}</Text></View> : <Text style={[sg.val, sg.valR, { color: textSub }]}>{av}</Text>}
									</View>
								);
							})}
						</View>
					</View>
				);
			})()}
		</View>
	);
}

const sg = StyleSheet.create({
	header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
	headerTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
	headerCrest: { width: 22, height: 22 },
	headerName: { fontSize: 13, fontWeight: '700' },
	headerVs: { fontSize: 11, fontWeight: '600' },
	groupTitle: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
	card: { borderRadius: 10, overflow: 'hidden' },
	row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
	val: { width: 56, fontSize: 14, fontWeight: '700' },
	valR: { textAlign: 'right' },
	pill: { width: 56, backgroundColor: '#22c55e', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center' },
	pillR: { alignSelf: 'flex-end' },
	pillText: { fontSize: 13, fontWeight: '800', color: '#fff' },
	label: { flex: 1, fontSize: 12.5, textAlign: 'center' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

type Tab = 'overview' | 'lineup' | 'stats';
const TABS: { id: Tab; label: string }[] = [
	{ id: 'overview', label: 'Overview' },
	{ id: 'lineup', label: 'Line-up' },
	{ id: 'stats', label: 'Stats' },
];

export default function MatchDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const params = useLocalSearchParams<{ tab?: string }>();
	const initialTab: Tab = params.tab === 'lineup' ? 'lineup' : params.tab === 'stats' ? 'stats' : 'overview';
	const [activeTab, setActiveTab] = useState<Tab>(initialTab);
	const { isDark, colors } = useTheme();

	const { data, loading, error } = useQuery<{ worldCupFixture: FixtureDetails }>(
		WORLD_CUP_FIXTURE_DETAILS,
		{ variables: { id }, fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
	);
	const fixture = data?.worldCupFixture;
	const bg = isDark ? '#0f172a' : '#f8fafc';
	const surface = isDark ? '#111827' : '#fff';
	const borderC = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
	const tabActive = isDark ? '#f1f5f9' : '#0f172a';
	const tabInactive = isDark ? '#475569' : '#94a3b8';

	return (
		<View style={{ flex: 1, backgroundColor: bg }}>
			{/* Top nav */}
			<View style={[scr.topBar, { backgroundColor: surface, borderBottomColor: borderC }]}>
				<Pressable onPress={() => router.back()} hitSlop={12} style={scr.backBtn}>
					<Text style={[scr.backIcon, { color: isDark ? '#94a3b8' : '#64748b' }]}>←</Text>
				</Pressable>
				<Text style={[scr.navTitle, { color: isDark ? '#f1f5f9' : '#0f172a' }]} numberOfLines={1}>Match Details</Text>
				<View style={{ width: 36 }} />
			</View>

			{loading && !fixture ? (
				<View style={scr.loader}>
					<ActivityIndicator color={colors.accent} size='large' />
				</View>
			) : error && !fixture ? (
				<View style={scr.loader}>
					<Text style={{ color: '#ef4444', fontSize: 14 }}>Failed to load match details.</Text>
				</View>
			) : fixture ? (
				<ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
					<MatchHeader fixture={fixture} isDark={isDark} />

					{/* Tab bar */}
					<View style={[scr.tabBar, { backgroundColor: surface, borderBottomColor: borderC }]}>
						{TABS.map(tab => (
							<Pressable
								key={tab.id}
								style={scr.tab}
								onPress={() => setActiveTab(tab.id)}
							>
								<Text style={[scr.tabText, { color: activeTab === tab.id ? tabActive : tabInactive }]}>
									{tab.label}
								</Text>
								{activeTab === tab.id && (
									<View style={[scr.tabLine, { backgroundColor: '#3b82f6' }]} />
								)}
							</Pressable>
						))}
					</View>

					{/* Content */}
					<View style={{ backgroundColor: surface }}>
						{activeTab === 'overview' && <OverviewTab fixture={fixture} isDark={isDark} />}
						{activeTab === 'lineup' && <LineupTab fixture={fixture} isDark={isDark} />}
						{activeTab === 'stats' && <StatsTab fixture={fixture} isDark={isDark} />}
					</View>
				</ScrollView>
			) : null}
		</View>
	);
}

const scr = StyleSheet.create({
	topBar: {
		flexDirection: 'row', alignItems: 'center',
		paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16,
		borderBottomWidth: 1,
	},
	backBtn: { width: 36 },
	backIcon: { fontSize: 22, fontWeight: '400' },
	navTitle: { flex: 1, fontSize: 16, fontWeight: '700', textAlign: 'center' },
	loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
	tab: { flex: 1, alignItems: 'center', paddingVertical: 13, position: 'relative' },
	tabText: { fontSize: 13, fontWeight: '700' },
	tabLine: { position: 'absolute', bottom: 0, left: '15%', right: '15%', height: 2, borderRadius: 1 },
});
