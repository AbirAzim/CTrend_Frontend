import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type Props = {
	activeFilter: string; // "all" | "campaign" | "campaign:{id}" | "platform" | "community" | "friend"
	onFilterChange: (filter: string) => void;
	campaignOptions?: { id: string; name: string }[];
};

type TabDef = {
	key: string;
	label: string;
	icon: keyof typeof Ionicons.glyphMap;
};

const TABS: TabDef[] = [
	{ key: 'all', label: 'All', icon: 'apps-outline' },
	{ key: 'campaign', label: 'Campaign', icon: 'megaphone-outline' },
	{ key: 'platform', label: 'Platform', icon: 'globe-outline' },
	{ key: 'community', label: 'Community', icon: 'people-outline' },
	{ key: 'friend', label: 'Friends', icon: 'heart-outline' },
];

/** Full-width 5-tab feed filter bar. Always visible — not collapsible. */
export function FeedCampaignFilter({ activeFilter, onFilterChange, campaignOptions }: Props) {
	const { colors } = useTheme();

	// The active "base" tab — campaign:{id} maps to "campaign"
	const activeTab = activeFilter.startsWith('campaign:') ? 'campaign' : activeFilter;
	// Active campaign id for sub-filter
	const activeCampaignId = activeFilter.startsWith('campaign:')
		? activeFilter.slice('campaign:'.length)
		: null;

	const isCampaignMode = activeTab === 'campaign';
	const hasCampaignPills = isCampaignMode && campaignOptions && campaignOptions.length > 0;

	function handleTabPress(key: string) {
		if (key === 'campaign') {
			// Default to "campaign" (all campaigns) when tapping the Campaign tab
			onFilterChange('campaign');
		} else {
			onFilterChange(key);
		}
	}

	function handleCampaignPill(id: string | null) {
		if (id === null) {
			onFilterChange('campaign');
		} else {
			onFilterChange(`campaign:${id}`);
		}
	}

	return (
		<View style={[styles.container, { backgroundColor: colors.topbar, borderBottomColor: colors.border }]}>
			{/* Tab row */}
			<View style={styles.tabRow}>
				{TABS.map((tab) => {
					const isActive = activeTab === tab.key;
					return (
						<TouchableOpacity
							key={tab.key}
							style={[
								styles.tab,
								isActive && { backgroundColor: colors.accent + '22' },
							]}
							onPress={() => handleTabPress(tab.key)}
							activeOpacity={0.7}
							accessibilityRole="tab"
							accessibilityState={{ selected: isActive }}
						>
							<Ionicons
								name={tab.icon}
								size={18}
								color={isActive ? colors.accent : colors.muted}
							/>
							<Text
								style={[
									styles.tabLabel,
									{ color: isActive ? colors.accent : colors.muted },
									isActive && styles.tabLabelActive,
								]}
								numberOfLines={1}
							>
								{tab.label}
							</Text>
						</TouchableOpacity>
					);
				})}
			</View>

			{/* Campaign sub-filter pills */}
			{hasCampaignPills ? (
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					style={styles.pillScroll}
					contentContainerStyle={styles.pillContainer}
				>
					{/* "All campaigns" pill */}
					<TouchableOpacity
						style={[
							styles.pill,
							{ borderColor: colors.accent },
							activeCampaignId === null && { backgroundColor: colors.accent },
						]}
						onPress={() => handleCampaignPill(null)}
						activeOpacity={0.75}
					>
						<Text
							style={[
								styles.pillText,
								{ color: activeCampaignId === null ? '#fff' : colors.accent },
							]}
						>
							All campaigns
						</Text>
					</TouchableOpacity>

					{campaignOptions!.map((c) => {
						const isSelected = activeCampaignId === c.id;
						return (
							<TouchableOpacity
								key={c.id}
								style={[
									styles.pill,
									{ borderColor: colors.accent },
									isSelected && { backgroundColor: colors.accent },
								]}
								onPress={() => handleCampaignPill(c.id)}
								activeOpacity={0.75}
							>
								<Text
									style={[
										styles.pillText,
										{ color: isSelected ? '#fff' : colors.accent },
									]}
									numberOfLines={1}
								>
									{c.name}
								</Text>
							</TouchableOpacity>
						);
					})}
				</ScrollView>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	tabRow: {
		flexDirection: 'row',
	},
	tab: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 8,
		paddingHorizontal: 2,
		gap: 3,
		borderRadius: 8,
		marginHorizontal: 2,
		marginVertical: 4,
	},
	tabLabel: {
		fontSize: 10,
		fontWeight: '600',
		letterSpacing: 0.1,
	},
	tabLabelActive: {
		fontWeight: '800',
	},
	pillScroll: {
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: 'rgba(128,128,128,0.15)',
	},
	pillContainer: {
		flexDirection: 'row',
		paddingHorizontal: 12,
		paddingVertical: 7,
		gap: 8,
	},
	pill: {
		paddingHorizontal: 12,
		paddingVertical: 5,
		borderRadius: 999,
		borderWidth: 1,
	},
	pillText: {
		fontSize: 12,
		fontWeight: '600',
	},
});

export default FeedCampaignFilter;
