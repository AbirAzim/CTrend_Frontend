import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FeedPostCampaignView } from '@ctrend/shared/types/feed';
import { useTheme } from '../context/ThemeContext';

type Props = {
	campaign: FeedPostCampaignView;
};

/** Gold campaign ribbon shown under the header of a compare linked to a promotion (Phase 22). */
function PostCampaignBadgeComponent({ campaign }: Props) {
	const { isDark } = useTheme();
	const bg = isDark ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.14)';
	const border = isDark ? 'rgba(245,158,11,0.42)' : 'rgba(217,160,23,0.45)';
	const gold = isDark ? '#fbbf24' : '#b45309';

	return (
		<Pressable
			style={({ pressed }) => [
				styles.ribbon,
				{ backgroundColor: bg, borderColor: border },
				pressed && { opacity: 0.85 },
			]}
			onPress={() =>
				router.push(`/campaign/${campaign.slug}` as `/${string}`)
			}
			accessibilityRole='button'
			accessibilityLabel={`Campaign: ${campaign.name}`}>
			{campaign.bannerImageUrl ? (
				<Image
					source={{ uri: campaign.bannerImageUrl }}
					style={styles.thumb}
					contentFit='cover'
					cachePolicy='memory-disk'
				/>
			) : (
				<View style={[styles.thumb, styles.thumbFallback]}>
					<Text style={styles.thumbEmoji}>🎯</Text>
				</View>
			)}
			<View style={styles.body}>
				<Text style={[styles.kicker, { color: gold }]}>CAMPAIGN</Text>
				<Text style={[styles.name, { color: gold }]} numberOfLines={1}>
					{campaign.name}
				</Text>
				{campaign.prizePerWinner > 0 ? (
					<Text style={[styles.prize, { color: gold }]} numberOfLines={1}>
						🎁 {campaign.prizePerWinner} BDT prize draw
					</Text>
				) : null}
			</View>
			<Text style={[styles.chevron, { color: gold }]}>›</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	ribbon: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		marginHorizontal: 14,
		marginBottom: 10,
		paddingHorizontal: 10,
		paddingVertical: 8,
		borderRadius: 12,
		borderWidth: 1,
	},
	thumb: { width: 34, height: 34, borderRadius: 8 },
	thumbFallback: {
		backgroundColor: 'rgba(245,158,11,0.22)',
		justifyContent: 'center',
		alignItems: 'center',
	},
	thumbEmoji: { fontSize: 16 },
	body: { flex: 1 },
	kicker: {
		fontSize: 9,
		fontWeight: '800',
		letterSpacing: 0.8,
	},
	name: { fontSize: 13, fontWeight: '800', marginTop: 1 },
	prize: { fontSize: 11, fontWeight: '600', marginTop: 1 },
	chevron: { fontSize: 22, fontWeight: '700' },
});

export const PostCampaignBadge = memo(PostCampaignBadgeComponent);
export default PostCampaignBadge;
