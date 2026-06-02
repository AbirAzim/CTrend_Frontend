import { useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ACTIVE_CAMPAIGNS } from '@ctrend/shared/graphql/campaigns';
import { useTheme } from '../context/ThemeContext';

type CampaignRow = {
	id: string;
	name: string;
	isDefault?: boolean | null;
};
type ActiveCampaignsData = { activeCampaigns: CampaignRow[] };

type Props = {
	selectedId?: string;
	onSelect: (id?: string) => void;
};

/** Collapsible "Filter feed" dock — All compares + each active campaign (default first). Phase 23. */
export function FeedCampaignFilter({ selectedId, onSelect }: Props) {
	const { colors, isDark } = useTheme();
	const [open, setOpen] = useState(false);
	const { data } = useQuery<ActiveCampaignsData>(ACTIVE_CAMPAIGNS, {
		fetchPolicy: 'cache-and-network',
	});

	const campaigns = useMemo(() => {
		const items = data?.activeCampaigns ?? [];
		return [...items].sort((a, b) => {
			if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
	}, [data?.activeCampaigns]);

	if (campaigns.length === 0) return null;

	const selected = campaigns.find((c) => c.id === selectedId);
	const activeValue = selected?.name ?? 'All compares';

	function pick(id?: string) {
		onSelect(id);
		setOpen(false);
	}

	const chipBg = isDark ? 'rgba(124,114,245,0.16)' : 'rgba(99,102,241,0.1)';
	const chipActiveBg = colors.accent;

	return (
		<View style={[styles.wrap, { borderBottomColor: colors.border }]}>
			<Pressable
				style={[styles.trigger, { backgroundColor: colors.section, borderColor: colors.border }]}
				onPress={() => setOpen((p) => !p)}
				accessibilityRole='button'
				accessibilityLabel='Filter feed by campaign'>
				<Text style={styles.triggerIcon}>🎯</Text>
				<View style={styles.triggerBody}>
					<Text style={[styles.triggerKicker, { color: colors.muted }]}>FILTER FEED</Text>
					<Text style={[styles.triggerValue, { color: colors.text }]} numberOfLines={1}>
						{activeValue}
					</Text>
				</View>
				<Text style={[styles.chevron, { color: colors.muted }]}>{open ? '▲' : '▼'}</Text>
			</Pressable>

			{open ? (
				<View style={styles.chips}>
					<FilterChip
						label='All compares'
						active={!selectedId}
						onPress={() => pick(undefined)}
						bg={!selectedId ? chipActiveBg : chipBg}
						activeColor={chipActiveBg}
						colors={colors}
					/>
					{campaigns.map((c) => (
						<FilterChip
							key={c.id}
							label={c.name}
							badge={c.isDefault ? 'default' : undefined}
							active={c.id === selectedId}
							onPress={() => pick(c.id)}
							bg={c.id === selectedId ? chipActiveBg : chipBg}
							activeColor={chipActiveBg}
							colors={colors}
						/>
					))}
				</View>
			) : null}
		</View>
	);
}

function FilterChip({
	label,
	badge,
	active,
	onPress,
	bg,
	activeColor,
	colors,
}: {
	label: string;
	badge?: string;
	active: boolean;
	onPress: () => void;
	bg: string;
	activeColor: string;
	colors: ReturnType<typeof useTheme>['colors'];
}) {
	return (
		<Pressable
			style={({ pressed }) => [
				styles.chip,
				{ backgroundColor: bg },
				pressed && { opacity: 0.8 },
			]}
			onPress={onPress}>
			<Text
				style={[
					styles.chipText,
					{ color: active ? '#fff' : colors.text },
					active && { fontWeight: '800' },
				]}
				numberOfLines={1}>
				{label}
			</Text>
			{badge ? (
				<Text
					style={[
						styles.chipBadge,
						{ color: active ? '#fff' : activeColor, borderColor: active ? '#fff' : activeColor },
					]}>
					{badge}
				</Text>
			) : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	wrap: {
		paddingHorizontal: 12,
		paddingTop: 10,
		paddingBottom: 8,
		borderBottomWidth: 1,
	},
	trigger: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		paddingHorizontal: 12,
		paddingVertical: 9,
		borderRadius: 12,
		borderWidth: 1,
	},
	triggerIcon: { fontSize: 15 },
	triggerBody: { flex: 1 },
	triggerKicker: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
	triggerValue: { fontSize: 13, fontWeight: '700', marginTop: 1 },
	chevron: { fontSize: 11 },
	chips: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
		marginTop: 10,
	},
	chip: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		paddingHorizontal: 12,
		paddingVertical: 7,
		borderRadius: 999,
		maxWidth: '100%',
	},
	chipText: { fontSize: 12.5, fontWeight: '600' },
	chipBadge: {
		fontSize: 8.5,
		fontWeight: '800',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
		paddingHorizontal: 5,
		paddingVertical: 1,
		borderRadius: 999,
		borderWidth: 1,
		overflow: 'hidden',
	},
});

export default FeedCampaignFilter;
