import { useQuery } from '@apollo/client/react';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ACTIVE_CAMPAIGNS } from '@ctrend/shared/graphql/campaigns';
import type { FeedPostCampaignView } from '@ctrend/shared/types/feed';
import { useTheme } from '../context/ThemeContext';

type Props = {
	campaign: FeedPostCampaignView;
};
type CampaignRow = { id: string; name: string; isDefault?: boolean | null };
type ActiveCampaignsData = { activeCampaigns: CampaignRow[] };

/** Gold campaign ribbon + "See other campaigns" sheet on a compare linked to a promotion (Phase 22–23). */
function PostCampaignBadgeComponent({ campaign }: Props) {
	const { colors, isDark } = useTheme();
	const [listOpen, setListOpen] = useState(false);
	const bg = isDark ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.14)';
	const border = isDark ? 'rgba(245,158,11,0.42)' : 'rgba(217,160,23,0.45)';
	const gold = isDark ? '#fbbf24' : '#b45309';

	const { data } = useQuery<ActiveCampaignsData>(ACTIVE_CAMPAIGNS, {
		fetchPolicy: 'cache-first',
	});
	const others = useMemo(() => {
		const items = data?.activeCampaigns ?? [];
		return [...items].sort((a, b) => {
			if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
	}, [data?.activeCampaigns]);

	function applyFilter(id: string) {
		setListOpen(false);
		router.navigate({ pathname: '/tabs', params: { campaign: id } });
	}

	return (
		<View style={styles.wrap}>
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

			{others.length > 1 ? (
				<Pressable
					style={styles.otherBtn}
					onPress={() => setListOpen(true)}
					hitSlop={6}>
					<Text style={[styles.otherBtnText, { color: gold }]}>
						See other campaigns
					</Text>
				</Pressable>
			) : null}

			<Modal
				visible={listOpen}
				transparent
				animationType='slide'
				onRequestClose={() => setListOpen(false)}>
				<Pressable style={styles.overlay} onPress={() => setListOpen(false)}>
					<View style={[styles.sheet, { backgroundColor: colors.card }]}>
						<View style={[styles.handle, { backgroundColor: colors.border }]} />
						<Text style={[styles.sheetTitle, { color: colors.text }]}>
							Browse campaigns
						</Text>
						<ScrollView>
							{others.map((c) => {
								const current = c.id === campaign.id;
								return (
									<Pressable
										key={c.id}
										style={[styles.row, { borderBottomColor: colors.border }, current && { backgroundColor: colors.section }]}
										onPress={() => applyFilter(c.id)}>
										<Text style={[styles.rowText, { color: current ? colors.accent : colors.text }, current && { fontWeight: '700' }]} numberOfLines={1}>
											{c.name}
										</Text>
										{c.isDefault ? (
											<Text style={[styles.defaultPill, { color: gold, borderColor: gold }]}>default</Text>
										) : null}
									</Pressable>
								);
							})}
						</ScrollView>
					</View>
				</Pressable>
			</Modal>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { marginHorizontal: 14, marginBottom: 10 },
	ribbon: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		paddingHorizontal: 10,
		paddingVertical: 8,
		borderRadius: 12,
		borderWidth: 1,
	},
	otherBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 2 },
	otherBtnText: { fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
	overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
	sheet: { maxHeight: '70%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 },
	handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
	sheetTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
	row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 14, borderBottomWidth: 1 },
	rowText: { flex: 1, fontSize: 14 },
	defaultPill: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, borderWidth: 1, overflow: 'hidden' },
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
