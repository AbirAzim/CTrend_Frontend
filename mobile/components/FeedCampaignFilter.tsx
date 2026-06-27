import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type Props = {
	activeFilter: string;
	onFilterChange: (filter: string) => void;
	campaignOptions?: { id: string; name: string }[];
};

const MAIN_FILTERS = ['all', 'platform', 'community', 'friend'] as const;
type MainFeedFilter = (typeof MAIN_FILTERS)[number];

const TABS: { key: MainFeedFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
	{ key: 'all', label: 'All', icon: 'apps-outline' },
	{ key: 'platform', label: 'Platform', icon: 'layers-outline' },
	{ key: 'community', label: 'Community', icon: 'people-outline' },
	{ key: 'friend', label: 'Friend', icon: 'person-outline' },
];

function getActiveTab(filter: string): MainFeedFilter {
	return MAIN_FILTERS.includes(filter as MainFeedFilter) ? (filter as MainFeedFilter) : 'all';
}

export function FeedCampaignFilter({ activeFilter, onFilterChange }: Props) {
	const { colors, isDark } = useTheme();
	const activeTab = getActiveTab(activeFilter);

	return (
		<View style={[styles.container, { backgroundColor: colors.topbar, borderBottomColor: colors.border }]}>
			<View style={styles.tabRow}>
				{TABS.flatMap((tab, index) => {
					const isActive = activeTab === tab.key;
					const items = [
						<TouchableOpacity
							key={tab.key}
							style={styles.tab}
							onPress={() => onFilterChange(tab.key)}
							activeOpacity={0.7}
							accessibilityRole="tab"
							accessibilityState={{ selected: isActive }}
						>
							<Ionicons
								name={tab.icon}
								size={16}
								color={isActive ? (isDark ? '#ffffff' : colors.text) : (isDark ? '#71717a' : colors.muted)}
							/>
							<Text
								style={[
									styles.tabLabel,
									{ color: isActive ? (isDark ? '#ffffff' : colors.text) : (isDark ? '#71717a' : colors.muted) },
									isActive && styles.tabLabelActive,
								]}
								numberOfLines={1}
							>
								{tab.label}
							</Text>
							{isActive && (
								<View style={[styles.tabIndicator, { backgroundColor: colors.accent }]} />
							)}
						</TouchableOpacity>,
					];
					if (index < TABS.length - 1) {
						items.push(
							<View key={`div-${tab.key}`} style={[styles.tabDivider, { backgroundColor: colors.border }]} />
						);
					}
					return items;
				})}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	tabRow: {
		flexDirection: 'row',
		paddingVertical: 4,
		paddingHorizontal: 4,
		alignItems: 'center',
	},
	tabDivider: {
		width: StyleSheet.hairlineWidth,
		alignSelf: 'stretch',
		marginVertical: 8,
	},
	tab: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 8,
		paddingHorizontal: 1,
		gap: 3,
		position: 'relative',
	},
	tabIndicator: {
		position: 'absolute',
		bottom: 0,
		left: '16%',
		right: '16%',
		height: 2,
		borderRadius: 999,
	},
	tabLabel: {
		fontSize: 9,
		fontWeight: '600',
		letterSpacing: 0,
	},
	tabLabelActive: {
		fontWeight: '800',
	},
});

export default FeedCampaignFilter;
