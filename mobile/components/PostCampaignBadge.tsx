import { useQuery } from '@apollo/client/react';
import { router } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import {
	LayoutAnimation,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	UIManager,
	View,
} from 'react-native';
import { ACTIVE_CAMPAIGNS } from '@ctrend/shared/graphql/campaigns';
import type { FeedPostCampaignView } from '@ctrend/shared/types/feed';
import { useTheme } from '../context/ThemeContext';

// Smooth expand/collapse on Android.
if (
	Platform.OS === 'android' &&
	UIManager.setLayoutAnimationEnabledExperimental
) {
	UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
	campaign: FeedPostCampaignView;
};
type CampaignRow = { id: string; name: string; isDefault?: boolean | null };
type ActiveCampaignsData = { activeCampaigns: CampaignRow[] };

/** Compact campaign tag — collapsed to a small chip on the right by default,
 * expands to the full ribbon (name + prize + browse) on tap. */
function PostCampaignBadgeComponent({ campaign }: Props) {
	const { colors, isDark } = useTheme();
	const [listOpen, setListOpen] = useState(false);
	const [expanded, setExpanded] = useState(false);
	// Gold is reserved for the small "CAMPAIGN" kicker only.
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

	function toggle() {
		LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
		setExpanded((e) => !e);
	}

	return (
		<View style={[styles.wrap, !expanded && styles.wrapCollapsed]}>
			{!expanded ? (
				// Collapsed: small chip on the right
				<Pressable
					style={({ pressed }) => [
						styles.chip,
						{ backgroundColor: colors.section, borderColor: colors.border },
						pressed && { opacity: 0.85 },
					]}
					onPress={toggle}
					hitSlop={6}
					accessibilityRole='button'
					accessibilityLabel={`Campaign: ${campaign.name}. Tap to expand.`}>
					<Text style={styles.icon}>🎯</Text>
					<Text style={[styles.kicker, { color: gold }]}>CAMPAIGN</Text>
					<Text style={[styles.chevron, { color: colors.subtext }]}>▾</Text>
				</Pressable>
			) : (
				// Expanded: full ribbon
				<>
					<Pressable
						style={({ pressed }) => [
							styles.ribbon,
							{ backgroundColor: colors.section, borderColor: colors.border },
							pressed && { opacity: 0.85 },
						]}
						onPress={() =>
							router.push(`/campaign/${campaign.slug}` as `/${string}`)
						}
						accessibilityRole='button'
						accessibilityLabel={`Open campaign: ${campaign.name}`}>
						<Text style={styles.icon}>🎯</Text>
						<Text style={[styles.kicker, { color: gold }]}>CAMPAIGN</Text>
						<Text
							style={[styles.name, { color: colors.text }]}
							numberOfLines={1}>
							{campaign.name}
						</Text>
						{campaign.prizePerWinner > 0 ? (
							<Text
								style={[styles.prize, { color: colors.subtext }]}
								numberOfLines={1}>
								· {campaign.prizePerWinner} BDT
							</Text>
						) : null}
						<Text style={[styles.chevron, { color: colors.subtext }]}>›</Text>
						<Pressable onPress={toggle} hitSlop={8} style={styles.collapseBtn}>
							<Text style={[styles.chevron, { color: colors.subtext }]}>▴</Text>
						</Pressable>
					</Pressable>

					{others.length > 1 ? (
						<Pressable
							style={styles.otherBtn}
							onPress={() => setListOpen(true)}
							hitSlop={6}>
							<Text style={[styles.otherBtnText, { color: colors.accent }]}>
								See other campaigns
							</Text>
						</Pressable>
					) : null}
				</>
			)}

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
	wrap: { marginHorizontal: 14, marginBottom: 8 },
	wrapCollapsed: { alignItems: 'flex-end' },
	chip: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 5,
		paddingHorizontal: 9,
		paddingVertical: 4,
		borderRadius: 999,
		borderWidth: 1,
	},
	ribbon: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		paddingHorizontal: 10,
		paddingVertical: 7,
		borderRadius: 999,
		borderWidth: 1,
	},
	collapseBtn: { marginLeft: 2, paddingHorizontal: 2 },
	otherBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 2 },
	otherBtnText: { fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
	overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
	sheet: { maxHeight: '70%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 },
	handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
	sheetTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
	row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 14, borderBottomWidth: 1 },
	rowText: { flex: 1, fontSize: 14 },
	defaultPill: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, borderWidth: 1, overflow: 'hidden' },
	icon: { fontSize: 12 },
	kicker: {
		fontSize: 9,
		fontWeight: '800',
		letterSpacing: 0.8,
	},
	name: { flex: 1, fontSize: 12, fontWeight: '600' },
	prize: { fontSize: 12, fontWeight: '500' },
	chevron: { fontSize: 16, fontWeight: '700' },
});

export const PostCampaignBadge = memo(PostCampaignBadgeComponent);
export default PostCampaignBadge;
