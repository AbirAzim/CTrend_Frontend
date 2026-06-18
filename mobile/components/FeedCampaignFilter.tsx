import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type Props = {
	activeFilter: string;
	onFilterChange: (filter: string) => void;
	campaignOptions?: { id: string; name: string }[];
};

type SubItem = {
	key: string;
	label: string;
	icon: keyof typeof Ionicons.glyphMap;
	filter: string;
};

const SUB_ITEMS: Record<string, SubItem[]> = {
	spotlight: [
		{ key: 'curated', label: 'Curated', icon: 'sparkles-outline', filter: 'platform' },
		{ key: 'campaigns', label: 'Campaigns', icon: 'megaphone-outline', filter: 'campaign' },
	],
	social: [
		{ key: 'community', label: 'Community', icon: 'people-circle-outline', filter: 'community' },
		{ key: 'friends', label: 'Friends', icon: 'heart-outline', filter: 'friend' },
	],
};

const TABS = [
	{ key: 'all', label: 'All', icon: 'apps-outline' as keyof typeof Ionicons.glyphMap },
	{ key: 'spotlight', label: 'Spotlight', icon: 'star-outline' as keyof typeof Ionicons.glyphMap },
	{ key: 'social', label: 'Social', icon: 'people-outline' as keyof typeof Ionicons.glyphMap },
];

function getActiveTab(filter: string): string {
	if (filter === 'campaign' || filter.startsWith('campaign:') || filter === 'platform') return 'spotlight';
	if (filter === 'community' || filter === 'friend') return 'social';
	return 'all';
}

function isSubActive(item: SubItem, activeFilter: string): boolean {
	if (item.filter === 'campaign') return activeFilter === 'campaign' || activeFilter.startsWith('campaign:');
	return activeFilter === item.filter;
}

export function FeedCampaignFilter({ activeFilter, onFilterChange }: Props) {
	const { colors, isDark } = useTheme();
	const activeTab = getActiveTab(activeFilter);
	const subItems = SUB_ITEMS[activeTab] ?? null;

	// Animate sub-row in/out
	const subAnim = useRef(new Animated.Value(subItems ? 1 : 0)).current;
	const prevTab = useRef(activeTab);

	useEffect(() => {
		if (prevTab.current !== activeTab) {
			prevTab.current = activeTab;
			if (subItems) {
				subAnim.setValue(0);
				Animated.spring(subAnim, {
					toValue: 1,
					useNativeDriver: true,
					damping: 18,
					stiffness: 260,
				}).start();
			} else {
				Animated.timing(subAnim, {
					toValue: 0,
					duration: 140,
					useNativeDriver: true,
				}).start();
			}
		}
	}, [activeTab, subItems, subAnim]);

	function handleTabPress(key: string) {
		if (key === 'spotlight') onFilterChange('campaign');
		else if (key === 'social') onFilterChange('community');
		else onFilterChange('all');
	}

	return (
		<View style={[styles.container, { backgroundColor: colors.topbar, borderBottomColor: colors.border }]}>
			{/* Main tab row */}
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

			{/* Sub-row — full width, slides in below when a grouped tab is active */}
			{subItems ? (
				<Animated.View
					style={[
						styles.subRow,
						{ borderTopColor: colors.border },
						{
							opacity: subAnim,
							transform: [{ translateY: subAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
						},
					]}
				>
					{subItems.flatMap((item, index) => {
						const active = isSubActive(item, activeFilter);
						const items = [
							<Pressable
								key={item.key}
								style={({ pressed }) => [
									styles.subBtn,
									pressed && !active && { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' },
								]}
								onPress={() => onFilterChange(item.filter)}
								accessibilityRole="button"
								accessibilityState={{ selected: active }}
							>
								<Ionicons
									name={item.icon}
									size={18}
									color={active ? (isDark ? '#ffffff' : colors.text) : (isDark ? '#71717a' : colors.muted)}
								/>
								<Text
									style={[
										styles.subLabel,
										{ color: active ? (isDark ? '#ffffff' : colors.text) : (isDark ? '#71717a' : colors.muted) },
										active && styles.subLabelActive,
									]}
								>
									{item.label}
								</Text>
								{active && (
									<View style={[styles.subIndicator, { backgroundColor: colors.accent }]} />
								)}
							</Pressable>,
						];
						if (index < subItems.length - 1) {
							items.push(
								<View key={`sdiv-${item.key}`} style={[styles.tabDivider, { backgroundColor: colors.border }]} />
							);
						}
						return items;
					})}
				</Animated.View>
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
	subRow: {
		flexDirection: 'row',
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingVertical: 2,
		paddingHorizontal: 8,
		alignItems: 'center',
	},
	subBtn: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 9,
		gap: 4,
		borderRadius: 0,
		position: 'relative',
	},
	subLabel: {
		fontSize: 10,
		fontWeight: '600',
		letterSpacing: 0.1,
	},
	subLabelActive: {
		fontWeight: '800',
	},
	subIndicator: {
		position: 'absolute',
		bottom: 0,
		left: '20%',
		right: '20%',
		height: 2,
		borderRadius: 999,
	},
});

export default FeedCampaignFilter;
