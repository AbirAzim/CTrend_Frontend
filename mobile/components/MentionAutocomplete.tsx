import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { MentionCandidate } from '../hooks/useMentionAutocomplete';

interface MentionAutocompleteProps {
	candidates: MentionCandidate[];
	onSelect: (user: MentionCandidate) => void;
}

/** Floating dropdown of matching users shown above the composer while typing
 * an `@mention`. Purely presentational — trigger detection/candidate
 * fetching lives in `useMentionAutocomplete`. Position the parent View with
 * `position: 'relative'` so this anchors just above the input. */
export function MentionAutocomplete({ candidates, onSelect }: MentionAutocompleteProps) {
	const { colors } = useTheme();
	if (candidates.length === 0) return null;

	return (
		<View
			style={[
				st.container,
				{ backgroundColor: colors.card, borderColor: colors.border },
			]}
		>
			<ScrollView keyboardShouldPersistTaps='always' style={st.scroll}>
				{candidates.map((user) => {
					const name = user.displayName?.trim() || user.username;
					return (
						<Pressable
							key={user.id}
							style={({ pressed }) => [
								st.option,
								pressed && { backgroundColor: colors.section },
							]}
							onPress={() => onSelect(user)}
						>
							<View style={[st.avatar, { backgroundColor: colors.accent }]}>
								{user.profileImageUrl ? (
									<Image source={{ uri: user.profileImageUrl }} style={st.avatarImg} />
								) : (
									<Text style={st.avatarFallback}>{name.charAt(0).toUpperCase()}</Text>
								)}
							</View>
							<View style={st.textCol}>
								<Text style={[st.name, { color: colors.text }]} numberOfLines={1}>
									{name}
								</Text>
								<Text style={[st.username, { color: colors.subtext }]} numberOfLines={1}>
									@{user.username}
								</Text>
							</View>
						</Pressable>
					);
				})}
			</ScrollView>
		</View>
	);
}

const st = StyleSheet.create({
	container: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: '100%',
		marginBottom: 6,
		maxHeight: 220,
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: 'hidden',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 10,
		elevation: 8,
	},
	scroll: { maxHeight: 220 },
	option: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	avatar: {
		width: 32,
		height: 32,
		borderRadius: 16,
		alignItems: 'center',
		justifyContent: 'center',
		overflow: 'hidden',
	},
	avatarImg: { width: 32, height: 32, borderRadius: 16 },
	avatarFallback: { color: '#fff', fontWeight: '700', fontSize: 14 },
	textCol: { flex: 1, minWidth: 0 },
	name: { fontWeight: '600', fontSize: 14 },
	username: { fontSize: 12, marginTop: 1 },
});
