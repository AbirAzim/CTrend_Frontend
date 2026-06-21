import { useQuery } from '@apollo/client/react';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { BottomNav } from '../../../components/BottomNav';
import { useTabBar } from '../../../context/TabBarContext';
import {
	Animated,
	ActivityIndicator,
	Easing,
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
	startXI: LineupPlayer[]; substitutes: LineupPlayer[]; coach: LineupCoach | null;
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

function clientMinute(kickoff: string): number {
  const elapsed = Math.floor((Date.now() - new Date(kickoff).getTime()) / 60000);
  return Math.max(1, Math.min(elapsed, 130));
}

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
		if (e.detail.includes('Own Goal')) { if (e.team === 'home') { away++; } else { home++; } }
		else { if (e.team === 'home') { home++; } else { away++; } }
	}
	return { home, away };
}
function parseNum(v?: string | null) { return v ? parseFloat(v.replace('%', '')) || 0 : 0; }

// ─── Player event map ─────────────────────────────────────────────────────────

type PEvt = { goals: number; ownGoals: number; assists: number; card: 'yellow' | 'red' | null; subOff: boolean; subOn: boolean };

function buildPlayerEventMap(events: MatchEvent[]): Map<string, PEvt> {
	const map = new Map<string, PEvt>();
	const ensure = (p: EventPlayer): PEvt => {
		const idKey = p.id != null ? `id:${p.id}` : null;
		const nmKey = p.name ? `nm:${p.name.toLowerCase().trim()}` : null;
		const existing = (idKey && map.get(idKey)) || (nmKey && map.get(nmKey)) || null;
		const pev: PEvt = existing ?? { goals: 0, ownGoals: 0, assists: 0, card: null, subOff: false, subOn: false };
		if (idKey) map.set(idKey, pev);
		if (nmKey) map.set(nmKey, pev);
		return pev;
	};
	for (const e of events) {
		if (!e.player.name && e.player.id == null) continue;
		const pev = ensure(e.player);
		if (e.type === 'Goal' && !e.detail.toLowerCase().includes('disallow')) {
			if (e.detail.includes('Own Goal')) {
				pev.ownGoals++;
			} else {
				pev.goals++;
				if (e.assist?.name || e.assist?.id != null) ensure(e.assist).assists++;
			}
		} else if (e.type === 'Card') {
			const isRed = e.detail.toLowerCase().includes('red') || e.detail.includes('Second Yellow');
			pev.card = isRed ? 'red' : 'yellow';
		} else if (e.type === 'subst') {
			pev.subOn = true;
			if (e.assist?.name || e.assist?.id != null) {
				const apev = ensure(e.assist);
				apev.subOn = true;
				apev.subOff = true;
			}
		}
	}
	return map;
}

function pEvtKey(p: LineupPlayer): string {
	return p.id != null ? `id:${p.id}` : `nm:${p.name.toLowerCase().trim()}`;
}

// ─── Goal bar ─────────────────────────────────────────────────────────────────

function GoalBar({ events, homeTeam, awayTeam, isDark }: {
	events: MatchEvent[];
	homeTeam: { shortName: string };
	awayTeam: { shortName: string };
	isDark: boolean;
}) {
	const goals = events
		.filter(e => e.type === 'Goal' && !e.detail.toLowerCase().includes('disallow'))
		.sort((a, b) => a.time - b.time);
	if (!goals.length) return null;

	const maxTime = Math.max(90, ...goals.map(e => e.time));
	const homeGoals = goals.filter(g => g.team === 'home');
	const awayGoals = goals.filter(g => g.team === 'away');
	const textPrimary = isDark ? '#f1f5f9' : '#0f172a';
	const textSub = isDark ? '#94a3b8' : '#94a3b8';
	const borderC = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
	const trackBg = isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0';
	const bg = isDark ? '#111827' : '#fff';

	const scorerLabel = (g: MatchEvent) => {
		const suffix = g.detail.includes('Own Goal') ? ' (OG)' : g.detail.includes('Penalty') ? ' (P)' : '';
		return `⚽ ${shortName(g.player.name)} ${minuteLabel(g)}${suffix}`;
	};

	return (
		<View style={[gb.container, { backgroundColor: bg, borderBottomColor: borderC }]}>
			{homeGoals.length > 0 && (
				<View style={gb.scorersRow}>
					{homeGoals.map((g, i) => (
						<Text key={i} style={[gb.scorer, { color: textPrimary }]}>{scorerLabel(g)}</Text>
					))}
				</View>
			)}
			<View style={gb.trackWrap}>
				<Text style={[gb.teamLabel, { color: textSub }]}>{homeTeam.shortName}</Text>
				<View style={[gb.track, { backgroundColor: trackBg }]}>
					{goals.map((g, i) => (
						<View
							key={i}
							style={[
								gb.tick,
								{ left: `${(g.time / maxTime) * 100}%` as unknown as number,
								  backgroundColor: g.team === 'home' ? '#22c55e' : '#f97316',
								  borderColor: bg },
							]}
						/>
					))}
				</View>
				<Text style={[gb.teamLabel, gb.teamLabelR, { color: textSub }]}>{awayTeam.shortName}</Text>
			</View>
			{awayGoals.length > 0 && (
				<View style={[gb.scorersRow, gb.scorersRowR]}>
					{awayGoals.map((g, i) => (
						<Text key={i} style={[gb.scorer, gb.scorerR, { color: textPrimary }]}>{scorerLabel(g)}</Text>
					))}
				</View>
			)}
		</View>
	);
}

const gb = StyleSheet.create({
	container: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
	scorersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingBottom: 8 },
	scorersRowR: { justifyContent: 'flex-end', paddingBottom: 0, paddingTop: 8 },
	scorer: { fontSize: 12, fontWeight: '700' },
	scorerR: { textAlign: 'right' },
	trackWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	teamLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 28 },
	teamLabelR: { textAlign: 'right' },
	track: { flex: 1, height: 4, borderRadius: 4, position: 'relative' },
	tick: {
		position: 'absolute', top: -4, width: 12, height: 12, borderRadius: 6,
		borderWidth: 2, marginLeft: -6,
	},
});

// ─── Match header ─────────────────────────────────────────────────────────────

function MatchHeader({ fixture, isDark }: { fixture: FixtureDetails; isDark: boolean }) {
	const { status, minute, score, events, homeTeam, awayTeam, playerRatings, kickoff } = fixture;
	const live = isLive(status);
	const finished = isFinished(status);
	const hasScore = live || finished;
	const homeWon = score.winner === 'home';
	const awayWon = score.winner === 'away';
	const displayMinute = live ? (minute ?? clientMinute(kickoff)) : minute;
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
						<Text style={mh.liveText}>{`${displayMinute}'`}</Text>
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
	player, ratingMap, evMap,
}: { player: LineupPlayer; ratingMap: Map<number, string>; evMap: Map<string, PEvt>; isDark: boolean }) {
	const [imgFailed, setImgFailed] = useState(false);
	const rating = player.id != null ? ratingMap.get(player.id) : undefined;
	const rNum = rating ? parseFloat(rating) : null;
	const pev = evMap.get(pEvtKey(player));

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
				{/* Card badge — outside avatar image, bottom-right */}
				{pev?.card && (
					<View style={[pitch.cardBadge, { backgroundColor: pev.card === 'red' ? '#ef4444' : '#facc15' }]} />
				)}
				{/* Substitution swap badge — compact, top-left corner so it doesn't cover the face */}
				{(pev?.subOff || pev?.subOn) && (
					<View style={pitch.subBadge}>
						<Text style={pitch.subArrUp}>▲</Text>
						<Text style={pitch.subArrDn}>▼</Text>
					</View>
				)}
			</View>
			{/* Goals + own goals + assists */}
			{pev && (pev.goals > 0 || pev.ownGoals > 0 || pev.assists > 0) && (
				<View style={pitch.eventsRow}>
					{pev.goals > 0 && <Text style={pitch.goalText}>{'⚽'.repeat(Math.min(pev.goals, 3))}{pev.goals > 3 ? `×${pev.goals}` : ''}</Text>}
					{pev.ownGoals > 0 && <Text style={pitch.ownGoalText}>{'⚽'.repeat(Math.min(pev.ownGoals, 2))}OG</Text>}
					{pev.assists > 0 && <Text style={pitch.assistText}>{'👟'.repeat(Math.min(pev.assists, 2))}{pev.assists > 2 ? `×${pev.assists}` : ''}</Text>}
				</View>
			)}
			<Text style={pitch.playerName} numberOfLines={1}>{shortName(player.name)}</Text>
		</View>
	);
}

const pitch = StyleSheet.create({
	playerWrap: { alignItems: 'center', width: 64 },
	subBadge: { position: 'absolute', top: -7, left: -7, flexDirection: 'row', alignItems: 'center', gap: 1, backgroundColor: 'rgba(15,23,42,0.9)', borderRadius: 99, paddingHorizontal: 3, paddingVertical: 1.5, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.5, shadowRadius: 2, zIndex: 3 },
	subArrUp: { fontSize: 7, fontWeight: '900', color: '#22c55e', lineHeight: 9 },
	subArrDn: { fontSize: 7, fontWeight: '900', color: '#ef4444', lineHeight: 9 },
	avatarWrap: { position: 'relative', width: 44, height: 44, marginBottom: 12 },
	avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
	avatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
	avatarNum: { fontSize: 14, fontWeight: '800', color: '#fff' },
	numBadge: { position: 'absolute', bottom: -7, left: -3, backgroundColor: '#1e3a5f', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, minWidth: 18, alignItems: 'center' },
	numBadgeText: { fontSize: 8, fontWeight: '800', color: '#fff' },
	ratingBadge: { position: 'absolute', bottom: -7, right: -3, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
	ratingText: { fontSize: 8, fontWeight: '800', color: '#fff' },
	cardBadge: { position: 'absolute', top: 1, right: -5, width: 13, height: 18, borderRadius: 2, borderWidth: 2, borderColor: 'rgba(255,255,255,0.95)', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.4, shadowRadius: 2 },
	eventsRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 1 },
	goalText: { fontSize: 10, lineHeight: 12 },
	ownGoalText: { fontSize: 8, lineHeight: 12, fontWeight: '800', color: '#f97316' },
	assistText: { fontSize: 10, lineHeight: 12 },
	playerName: { fontSize: 9.5, fontWeight: '600', color: '#fff', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
});

function FormationRows({ players, reverse, ratingMap, evMap, isDark }: {
	players: LineupPlayer[]; reverse: boolean;
	ratingMap: Map<number, string>; evMap: Map<string, PEvt>; isDark: boolean;
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
		<View style={{ flex: 1, justifyContent: 'space-evenly' }}>
			{rows.map(([row, rps]) => {
				const sorted = [...rps].sort((a, b) => {
					const ac = parseInt((a.grid ?? '0:1').split(':')[1], 10);
					const bc = parseInt((b.grid ?? '0:1').split(':')[1], 10);
					return ac - bc;
				});
				return (
					<View key={row} style={fo.row}>
						{sorted.map(p => (
							<PitchPlayer key={p.id ?? p.name} player={p} ratingMap={ratingMap} evMap={evMap} isDark={isDark} />
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
	const { lineups, playerRatings, homeTeam, awayTeam, events } = fixture;
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
	const evMap = buildPlayerEventMap(events);

	const sortSubs = (subs: LineupPlayer[]) =>
		[...subs].sort((a, b) => {
			const aOn = evMap.get(pEvtKey(a))?.subOn ? 1 : 0;
			const bOn = evMap.get(pEvtKey(b))?.subOn ? 1 : 0;
			return bOn - aOn;
		});
	const homeSubs = sortSubs(homeL?.substitutes ?? []);
	const awaySubs = sortSubs(awayL?.substitutes ?? []);
	const maxSubs = Math.max(homeSubs.length, awaySubs.length);

	return (
		<View style={{ paddingBottom: 24 }}>
			{/* Goal bar */}
			<GoalBar events={events} homeTeam={homeTeam} awayTeam={awayTeam} isDark={isDark} />

			{/* Team badges outside the pitch */}
			<View style={[lu2.pitchHeader, { backgroundColor: surface, borderBottomColor: rowBorder }]}>
				<View style={lu2.pitchTeamBadge}>
					{homeTeam.crest ? <Image source={{ uri: homeTeam.crest }} style={lu2.pitchCrest} contentFit='contain' /> : null}
					<Text style={lu2.pitchTeamName}>{homeTeam.shortName}</Text>
					{homeL && <Text style={lu2.pitchFormation}>{homeL.formation}</Text>}
				</View>
				<View style={lu2.pitchTeamBadge}>
					{awayTeam.crest ? <Image source={{ uri: awayTeam.crest }} style={lu2.pitchCrest} contentFit='contain' /> : null}
					<Text style={lu2.pitchTeamName}>{awayTeam.shortName}</Text>
					{awayL && <Text style={lu2.pitchFormation}>{awayL.formation}</Text>}
				</View>
			</View>

			{/* Green pitch */}
			<View style={lu2.pitch}>
				<Svg style={lu2.pitchSvg} viewBox="0 0 100 160" preserveAspectRatio="none">
					<Rect width="100" height="160" fill="#2d7a3a" />
					<Rect x="4" y="6" width="92" height="148" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.35" />
					<Rect x="45" y="2" width="10" height="4.5" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.35" />
					<Rect x="45" y="153.5" width="10" height="4.5" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.35" />
						<Rect x="23" y="6" width="54" height="23" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
					<Rect x="23" y="131" width="54" height="23" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
					<Circle cx="50" cy="21.5" r="0.7" fill="rgba(255,255,255,0.5)" />
					<Circle cx="50" cy="138.5" r="0.7" fill="rgba(255,255,255,0.5)" />
					<Path d="M 39.75 29 A 13 13 0 0 0 60.25 29" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
					<Path d="M 39.75 131 A 13 13 0 0 1 60.25 131" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
					<Line x1="4" y1="80" x2="96" y2="80" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
					<Path d="M 4 8.5 A 2.5 2.5 0 0 0 6.5 6" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.25" />
					<Path d="M 93.5 6 A 2.5 2.5 0 0 0 96 8.5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.25" />
					<Path d="M 96 151.5 A 2.5 2.5 0 0 0 93.5 154" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.25" />
					<Path d="M 6.5 154 A 2.5 2.5 0 0 0 4 151.5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.25" />
				</Svg>

				{homeL && (
					<View style={lu2.pitchHalf}>
						<FormationRows players={homeL.startXI} reverse={false} ratingMap={ratingMap} evMap={evMap} isDark={isDark} />
					</View>
				)}
				{awayL && (
					<View style={lu2.pitchHalf}>
						<FormationRows players={awayL.startXI} reverse={true} ratingMap={ratingMap} evMap={evMap} isDark={isDark} />
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
						const hp = homeSubs[i];
						const ap = awaySubs[i];
						const hr = hp?.id != null ? ratingMap.get(hp.id) : undefined;
						const ar = ap?.id != null ? ratingMap.get(ap.id) : undefined;
						const hpev = hp ? evMap.get(pEvtKey(hp)) : undefined;
						const apev = ap ? evMap.get(pEvtKey(ap)) : undefined;
						return (
							<View key={i} style={[lu2.benchRow, { borderBottomColor: rowBorder }]}>
								{/* Home sub */}
								{hp ? (
									<View style={lu2.benchPlayer}>
										<View style={lu2.benchAvWrap}>
											{hp.photo
												? <Image source={{ uri: hp.photo }} style={lu2.benchAvatar} contentFit='cover' borderRadius={20} />
												: <View style={[lu2.benchAvatar, { backgroundColor: isDark ? '#1e293b' : '#e2e8f0', borderRadius: 20 }]} />
											}
											{hpev?.subOn && <View style={lu2.subOnBadge}><View style={lu2.subOnBadgeInner}><Text style={lu2.subOnTextUp}>▲</Text><Text style={lu2.subOnTextDn}>▼</Text></View></View>}
											{hpev?.card && <View style={[lu2.cardBadge, { backgroundColor: hpev.card === 'red' ? '#ef4444' : '#facc15' }]} />}
										</View>
										<View style={{ flex: 1 }}>
											<Text style={[lu2.benchName, { color: textPrimary }]} numberOfLines={1}>{hp.name}</Text>
											<View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
												<Text style={[lu2.benchPos, { color: textSub }]}>{hp.pos ?? ''}</Text>
												{hr ? <View style={[lu2.benchRating, { backgroundColor: ratingColor(parseFloat(hr)) }]}><Text style={lu2.benchRatingText}>{parseFloat(hr).toFixed(1)}</Text></View> : null}
												{hpev && hpev.goals > 0 ? <Text style={lu2.benchGoal}>{'⚽'.repeat(Math.min(hpev.goals, 2))}</Text> : null}
												{hpev && hpev.ownGoals > 0 ? <Text style={lu2.benchOwnGoal}>{'⚽'.repeat(Math.min(hpev.ownGoals, 2))}OG</Text> : null}
												{hpev && hpev.assists > 0 ? <Text style={lu2.benchAssist}>{'👟'.repeat(Math.min(hpev.assists, 2))}</Text> : null}
											</View>
										</View>
									</View>
								) : <View style={{ flex: 1 }} />}
								{/* Divider */}
								<View style={[lu2.benchDivider, { backgroundColor: rowBorder }]} />
								{/* Away sub */}
								{ap ? (
									<View style={[lu2.benchPlayer, { flexDirection: 'row-reverse' }]}>
										<View style={lu2.benchAvWrap}>
											{ap.photo
												? <Image source={{ uri: ap.photo }} style={lu2.benchAvatar} contentFit='cover' borderRadius={20} />
												: <View style={[lu2.benchAvatar, { backgroundColor: isDark ? '#1e293b' : '#e2e8f0', borderRadius: 20 }]} />
											}
											{apev?.subOn && <View style={lu2.subOnBadge}><View style={lu2.subOnBadgeInner}><Text style={lu2.subOnTextUp}>▲</Text><Text style={lu2.subOnTextDn}>▼</Text></View></View>}
											{apev?.card && <View style={[lu2.cardBadge, { backgroundColor: apev.card === 'red' ? '#ef4444' : '#facc15' }]} />}
										</View>
										<View style={{ flex: 1, alignItems: 'flex-end' }}>
											<Text style={[lu2.benchName, { color: textPrimary }]} numberOfLines={1}>{ap.name}</Text>
											<View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
												{ar ? <View style={[lu2.benchRating, { backgroundColor: ratingColor(parseFloat(ar)) }]}><Text style={lu2.benchRatingText}>{parseFloat(ar).toFixed(1)}</Text></View> : null}
												{apev && apev.goals > 0 ? <Text style={lu2.benchGoal}>{'⚽'.repeat(Math.min(apev.goals, 2))}</Text> : null}
												{apev && apev.ownGoals > 0 ? <Text style={lu2.benchOwnGoal}>{'⚽'.repeat(Math.min(apev.ownGoals, 2))}OG</Text> : null}
												{apev && apev.assists > 0 ? <Text style={lu2.benchAssist}>{'👟'.repeat(Math.min(apev.assists, 2))}</Text> : null}
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
								{[{ l: homeL }, { l: awayL }].map(({ l }, idx) => {
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
	pitchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1 },
	// Fixed aspect ratio → both halves are exactly equal height, so the SVG
	// midline aligns with the real home/away boundary and players stay in-half.
	pitch: { backgroundColor: '#2d7a3a', overflow: 'hidden', flexDirection: 'column', aspectRatio: 0.56, width: '100%' },
	pitchSvg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
	pitchHalf: { flex: 1, paddingHorizontal: 8, overflow: 'hidden' },
	pitchTeamBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
	pitchTeamBadgeBottom: {},
	pitchCrest: { width: 18, height: 18 },
	pitchTeamName: { fontSize: 11, fontWeight: '800', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
	pitchFormation: { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
	bench: { marginTop: 8 },
	benchHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
	benchHeaderTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
	benchCrest: { width: 16, height: 16 },
	benchTeamName: { fontSize: 11, fontWeight: '700' },
	benchTitle: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
	benchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, gap: 0 },
	benchPlayer: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
	benchDivider: { width: 1, height: 36, marginHorizontal: 8 },
	benchAvWrap: { position: 'relative', flexShrink: 0, marginTop: 10 },
	benchAvatar: { width: 38, height: 38, flexShrink: 0 },
	benchName: { fontSize: 12, fontWeight: '600' },
	benchPos: { fontSize: 10, fontWeight: '600' },
	benchRating: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 99 },
	benchRatingText: { fontSize: 9, fontWeight: '800', color: '#fff' },
	benchGoal: { fontSize: 11 },
	benchOwnGoal: { fontSize: 9, fontWeight: '800', color: '#f97316' },
	benchAssist: { fontSize: 11 },
	// Compact corner badge so it overlaps only the avatar corner, not the face.
	subOnBadge: { position: 'absolute', top: -6, left: -6, zIndex: 3 },
	subOnBadgeInner: { flexDirection: 'row', alignItems: 'center', gap: 1, backgroundColor: 'rgba(15,23,42,0.9)', borderRadius: 99, paddingHorizontal: 3, paddingVertical: 1.5, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.4, shadowRadius: 2, elevation: 3 },
	subOnTextUp: { fontSize: 7, fontWeight: '900', color: '#22c55e', lineHeight: 9 },
	subOnTextDn: { fontSize: 7, fontWeight: '900', color: '#ef4444', lineHeight: 9 },
	cardBadge: { position: 'absolute', top: 1, right: -5, width: 13, height: 18, borderRadius: 2, borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.4, shadowRadius: 2 },
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

// Circular reload button — spins its refresh icon while a refetch is in flight.
function ReloadButton({
	onPress,
	refreshing,
	isDark,
}: { onPress: () => void; refreshing: boolean; isDark: boolean }) {
	const spin = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		if (!refreshing) {
			spin.stopAnimation(() => spin.setValue(0));
			return;
		}
		spin.setValue(0);
		const loop = Animated.loop(
			Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }),
		);
		loop.start();
		return () => loop.stop();
	}, [refreshing, spin]);
	const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
	const color = isDark ? '#93c5fd' : '#2563eb';
	return (
		<Pressable
			onPress={onPress}
			disabled={refreshing}
			hitSlop={12}
			accessibilityRole="button"
			accessibilityLabel="Reload match details"
			style={({ pressed }) => [
				scr.reloadBtn,
				{
					backgroundColor: isDark ? 'rgba(59,130,246,0.16)' : 'rgba(37,99,235,0.10)',
					opacity: pressed ? 0.6 : 1,
				},
			]}
		>
			<Animated.View style={{ transform: [{ rotate }] }}>
				<Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
					<Path d="M23 4v6h-6" />
					<Path d="M1 20v-6h6" />
					<Path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
				</Svg>
			</Animated.View>
		</Pressable>
	);
}

export default function MatchDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const params = useLocalSearchParams<{ tab?: string }>();
	const initialTab: Tab = params.tab === 'lineup' ? 'lineup' : params.tab === 'stats' ? 'stats' : 'overview';
	const [activeTab, setActiveTab] = useState<Tab>(initialTab);
	const { isDark, colors } = useTheme();
	const { translateY } = useTabBar();
	const insets = useSafeAreaInsets();
	const lastScrollY = useRef(0);
	const tabBarVisible = useRef(true);
	// Always show footer when entering this screen
	useState(() => { translateY.setValue(0); });
	const TAB_BAR_H = 60 + insets.bottom + 6;

	function handleScroll(e: { nativeEvent: { contentOffset: { y: number } } }) {
		const y = e.nativeEvent.contentOffset.y;
		const diff = y - lastScrollY.current;
		lastScrollY.current = y;
		if (y < 60) {
			if (!tabBarVisible.current) {
				tabBarVisible.current = true;
				Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }).start();
			}
			return;
		}
		if (diff > 4 && tabBarVisible.current) {
			tabBarVisible.current = false;
			Animated.timing(translateY, { toValue: TAB_BAR_H, duration: 200, useNativeDriver: true }).start();
		} else if (diff < -4 && !tabBarVisible.current) {
			tabBarVisible.current = true;
			Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }).start();
		}
	}

	const { data, loading, error, refetch } = useQuery<{ worldCupFixture: FixtureDetails }>(
		WORLD_CUP_FIXTURE_DETAILS,
		{ variables: { id }, fetchPolicy: 'cache-and-network', errorPolicy: 'all', pollInterval: 30_000 },
	);
	const fixture = data?.worldCupFixture;
	const [refreshing, setRefreshing] = useState(false);
	const onReload = useCallback(() => {
		if (refreshing) return;
		setRefreshing(true);
		void refetch().finally(() => setRefreshing(false));
	}, [refreshing, refetch]);
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
				<ReloadButton onPress={onReload} refreshing={refreshing} isDark={isDark} />
			</View>

			{loading && !fixture ? (
				<View style={scr.loader}>
					<ActivityIndicator color={colors.accent} size='large' />
				</View>
			) : error && !fixture ? (
				<View style={scr.loader}>
					<Text style={{ color: '#ef4444', fontSize: 14, marginBottom: 16 }}>Failed to load match details.</Text>
					<Pressable
						onPress={onReload}
						style={({ pressed }) => [scr.retryBtn, { opacity: pressed ? 0.7 : 1 }]}
					>
						<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
							<Path d="M23 4v6h-6" />
							<Path d="M1 20v-6h6" />
							<Path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
						</Svg>
						<Text style={scr.retryText}>Try again</Text>
					</Pressable>
				</View>
			) : fixture ? (
				<ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={16}>
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
			<BottomNav />
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
	reloadBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
	retryBtn: {
		flexDirection: 'row', alignItems: 'center', gap: 8,
		backgroundColor: '#2563eb', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 22,
	},
	retryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
	backIcon: { fontSize: 22, fontWeight: '400' },
	navTitle: { flex: 1, fontSize: 16, fontWeight: '700', textAlign: 'center' },
	loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
	tab: { flex: 1, alignItems: 'center', paddingVertical: 13, position: 'relative' },
	tabText: { fontSize: 13, fontWeight: '700' },
	tabLine: { position: 'absolute', bottom: 0, left: '15%', right: '15%', height: 2, borderRadius: 1 },
});
