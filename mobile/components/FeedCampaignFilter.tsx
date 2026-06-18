import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type Props = {
	activeFilter: string;
	onFilterChange: (filter: string) => void;
	campaignOptions?: { id: string; name: string }[];
};

const TABS = [
	{ key: 'all', label: 'All', icon: 'apps-outline' as keyof typeof Ionicons.glyphMap },
	{ key: 'community', label: 'Community', icon: 'people-outline' as keyof typeof Ionicons.glyphMap },
];

function getActiveTab(filter: string): string {
	if (filter === 'community' || filter === 'friend') return 'community';
	return 'all';
}

export function FeedCampaignFilter({ activeFilter, onFilterChange }: Props) {
	const { colors, isDark } = useTheme();
	const activeTab = getActiveTab(activeFilter);

	function handleTabPress(key: string) {
		if (key === 'community') onFilterChange('community');
		else onFilterChange('all');
	}

	return (
		<View style={[styles.container, { backgroundColor: colors.topbar, borderBottomColor: colors.border }]}>
			<View style={styles.tabRow}>
				{TABS.flatMap((tab, index) => {
					const isActive = activeTab === tab.key;
					const items = [
						<TouchableOpacity
							key={tab.key}
							style={styles.tab}
							onPress={() => handleTabPress(tab.key)}
							activeOpacity={0.7}
							accessibilityRole="tab"
							accessibilityState={{ selected: isActive }}
						>
							<Ionicons
								name={tab.icon}
								size={17}
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
		paddingHorizontal: 8,
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
		paddingHorizontal: 2,
		gap: 3,
		position: 'relative',
	},
	tabIndicator: {
		position: 'absolute',
		bottom: 0,
		left: '20%',
		right: '20%',
		height: 2,
		borderRadius: 999,
	},
	tabLabel: {
		fontSize: 10,
		fontWeight: '600',
		letterSpacing: 0.1,
	},
	tabLabelActive: {
		fontWeight: '800',
	},
});

export default FeedCampaignFilter;
