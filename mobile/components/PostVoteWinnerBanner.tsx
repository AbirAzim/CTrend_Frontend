import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { normalizeProfileImageUrl } from '@ctrend/shared/lib/profileImageUrl';
import type { FeedPostVoteWinnerView } from '@ctrend/shared/types/feed';
import { useTheme } from '../context/ThemeContext';

type Props = {
	winner: FeedPostVoteWinnerView;
	optionLabel?: string | null;
};

/** Trophy banner shown after voting ends when a random eligible voter was drawn (Phase 24). */
function PostVoteWinnerBannerComponent({ winner, optionLabel }: Props) {
	const { isDark } = useTheme();
	const user = winner.user;
	if (!user) return null;

	const display = user.displayName?.trim() || `@${user.username}`;
	const avatarUrl = normalizeProfileImageUrl(user.profileImageUrl);
	const initial = display.trim().charAt(0).toUpperCase() || '?';

	const bg = isDark ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.13)';
	const border = isDark ? 'rgba(245,158,11,0.45)' : 'rgba(217,160,23,0.5)';
	const gold = isDark ? '#fbbf24' : '#b45309';

	return (
		<Pressable
			style={({ pressed }) => [
				styles.banner,
				{ backgroundColor: bg, borderColor: border },
				pressed && { opacity: 0.85 },
			]}
			onPress={() => router.push(`/profile/${user.id}` as `/${string}`)}
			accessibilityRole='button'
			accessibilityLabel={`Prize draw winner: ${display}`}>
			<Text style={styles.crown}>🏆</Text>
			<View style={styles.avatarWrap}>
				{avatarUrl ? (
					<Image
						source={{ uri: avatarUrl }}
						style={styles.avatar}
						contentFit='cover'
						cachePolicy='memory-disk'
					/>
				) : (
					<View style={[styles.avatar, styles.avatarFallback]}>
						<Text style={styles.avatarText}>{initial}</Text>
					</View>
				)}
			</View>
			<View style={styles.body}>
				<Text style={[styles.kicker, { color: gold }]}>PRIZE DRAW WINNER</Text>
				<Text style={[styles.name, { color: gold }]} numberOfLines={1}>
					{display}
				</Text>
				{optionLabel ? (
					<Text style={[styles.meta, { color: gold }]} numberOfLines={1}>
						Voted for {optionLabel}
					</Text>
				) : null}
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	banner: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		marginHorizontal: 14,
		marginTop: 4,
		marginBottom: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderRadius: 14,
		borderWidth: 1,
	},
	crown: { fontSize: 22 },
	avatarWrap: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
	avatar: { width: 36, height: 36, borderRadius: 18 },
	avatarFallback: {
		backgroundColor: 'rgba(245,158,11,0.3)',
		justifyContent: 'center',
		alignItems: 'center',
	},
	avatarText: { color: '#fff', fontSize: 15, fontWeight: '800' },
	body: { flex: 1 },
	kicker: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
	name: { fontSize: 14, fontWeight: '800', marginTop: 1 },
	meta: { fontSize: 11, fontWeight: '600', marginTop: 1, opacity: 0.9 },
});

export const PostVoteWinnerBanner = memo(PostVoteWinnerBannerComponent);
export default PostVoteWinnerBanner;
