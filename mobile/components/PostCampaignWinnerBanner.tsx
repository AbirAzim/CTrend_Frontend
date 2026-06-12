import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { normalizeProfileImageUrl } from '@ctrend/shared/lib/profileImageUrl';
import type { FeedPostCampaignWinnerView, FeedPostCampaignView } from '@ctrend/shared/types/feed';
import { useTheme } from '../context/ThemeContext';

type Props = {
	winner: FeedPostCampaignWinnerView;
	campaign: FeedPostCampaignView | null | undefined;
	winningOptionLabel?: string | null;
};

function PostCampaignWinnerBannerComponent({ winner, campaign, winningOptionLabel }: Props) {
	const { isDark } = useTheme();
	const user = winner.user;
	const hasRewards = campaign?.hasRewards;
	const noWinner = !user && winner.note;

	const bg = isDark ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.13)';
	const border = isDark ? 'rgba(52,211,153,0.45)' : 'rgba(16,185,129,0.5)';
	const green = isDark ? '#6ee7b7' : '#065f46';

	const display = user ? (user.displayName?.trim() || `@${user.username}`) : null;
	const avatarUrl = user ? normalizeProfileImageUrl(user.profileImageUrl) : null;
	const initial = display?.trim().charAt(0).toUpperCase() ?? '?';

	return (
		<Pressable
			style={({ pressed }) => [
				styles.banner,
				{ backgroundColor: bg, borderColor: border },
				pressed && { opacity: 0.85 },
			]}
			onPress={user ? () => router.push(`/profile/${user.id}` as `/${string}`) : undefined}
			accessibilityRole='button'
			accessibilityLabel={noWinner ? 'Match result' : `Campaign winner: ${display ?? 'announced'}`}>
			<Text style={styles.icon}>{noWinner ? '⚽' : '🏆'}</Text>
			{user && (
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
			)}
			<View style={styles.body}>
				<Text style={[styles.kicker, { color: green }]}>
					{noWinner ? 'MATCH RESULT' : hasRewards ? '🎉 WINNER ANNOUNCED' : '⚽ MATCH WINNER'}
				</Text>
				{noWinner ? (
					<Text style={[styles.note, { color: green }]} numberOfLines={2}>{winner.note}</Text>
				) : (
					<>
						{winningOptionLabel ? (
							<Text style={[styles.option, { color: green }]} numberOfLines={1}>
								{winningOptionLabel} won
							</Text>
						) : null}
						{display ? (
							<Text style={[styles.name, { color: green }]} numberOfLines={1}>
								{display}
							</Text>
						) : null}
						{hasRewards && winner.prize ? (
							<Text style={[styles.prize, { color: green }]}>
								Prize: ৳{winner.prize}
							</Text>
						) : null}
					</>
				)}
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
	icon: { fontSize: 22 },
	avatarWrap: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
	avatar: { width: 36, height: 36, borderRadius: 18 },
	avatarFallback: {
		backgroundColor: 'rgba(16,185,129,0.3)',
		justifyContent: 'center',
		alignItems: 'center',
	},
	avatarText: { color: '#fff', fontSize: 15, fontWeight: '800' },
	body: { flex: 1 },
	kicker: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
	option: { fontSize: 12, fontWeight: '700', marginTop: 2 },
	name: { fontSize: 14, fontWeight: '800', marginTop: 1 },
	prize: { fontSize: 11, fontWeight: '600', marginTop: 1, opacity: 0.9 },
	note: { fontSize: 12, fontWeight: '600', marginTop: 2 },
});

export const PostCampaignWinnerBanner = memo(PostCampaignWinnerBannerComponent);
export default PostCampaignWinnerBanner;
