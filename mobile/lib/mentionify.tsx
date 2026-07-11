import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextProps, TextStyle, View, ViewProps } from 'react-native';
import { router } from 'expo-router';
import { useApolloClient } from '@apollo/client/react';
import { SEARCH_USERS } from '@ctrend/shared/graphql/search';
import { parseLinks } from './linkify';

const MENTION_RE = /@([a-zA-Z0-9_]{2,30})/g;

interface MentionifyNode {
	type: 'text' | 'link' | 'mention';
	content: string;
	href?: string;
	username?: string;
	key: string;
}

/** Parses `text` into plain/link/mention nodes — mentions are matched first,
 * then each remaining segment is run through `parseLinks` so both a URL and
 * an `@username` can appear in the same comment/caption/message. */
export function parseMentionsAndLinks(text: string): MentionifyNode[] {
	const nodes: MentionifyNode[] = [];
	let last = 0;
	let key = 0;
	for (const m of text.matchAll(MENTION_RE)) {
		const idx = m.index ?? 0;
		if (idx > last) {
			for (const n of parseLinks(text.slice(last, idx))) {
				nodes.push({ ...n, key: `mf-${key++}` });
			}
		}
		nodes.push({ type: 'mention', content: m[0], username: m[1], key: `mf-${key++}` });
		last = idx + m[0].length;
	}
	if (last < text.length) {
		for (const n of parseLinks(text.slice(last))) {
			nodes.push({ ...n, key: `mf-${key++}` });
		}
	}
	return nodes;
}

function openLink(href: string) {
	void Linking.openURL(href).catch((err) => {
		console.error('Error opening link:', err);
	});
}

type SearchUserResult = { id: string; username: string };

/** Resolves a tapped `@username` to a user id (via `SEARCH_USERS`) and
 * navigates to their profile. Shared by `MentionifyText` and chat's
 * `LinkText` (a separate, simpler nested-Text rendering pipeline). */
export function useMentionNavigate() {
	const client = useApolloClient();
	const [resolving, setResolving] = useState(false);
	return async function navigateToMention(username: string) {
		if (resolving) return;
		setResolving(true);
		try {
			const { data } = await client.query<{ searchUsers: SearchUserResult[] }>({
				query: SEARCH_USERS,
				variables: { search: username, take: 5 },
				fetchPolicy: 'cache-first',
			});
			const match = (data?.searchUsers ?? []).find(
				(u) => u.username.toLowerCase() === username.toLowerCase(),
			);
			if (match) router.push(`/profile/${match.id}` as `/${string}`);
		} finally {
			setResolving(false);
		}
	};
}

interface MentionifyTextProps extends Omit<ViewProps, 'children'> {
	text: string;
	linkStyle?: TextStyle;
	mentionStyle?: TextStyle;
	/** Passed to plain text segments and as base for links/mentions. */
	style?: TextStyle | TextStyle[];
}

/**
 * Renders text with tappable links and `@mention` spans (tap → resolve the
 * username and navigate to that user's profile). Uses Pressable per
 * link/mention (not nested Text onPress) so taps work inside FlatList/
 * ScrollView on Android.
 */
export function MentionifyText({ text, linkStyle, mentionStyle, style, ...props }: MentionifyTextProps) {
	const nodes = parseMentionsAndLinks(text);
	const navigateToMention = useMentionNavigate();
	const flat = StyleSheet.flatten(style) ?? {};
	const hasSpecial = nodes.some((n) => n.type !== 'text');

	const textStyle: TextStyle = {
		fontSize: flat.fontSize,
		lineHeight: flat.lineHeight,
		color: flat.color,
		fontWeight: flat.fontWeight,
		letterSpacing: flat.letterSpacing,
	};

	const containerStyle: ViewProps['style'] = {
		flexDirection: 'row',
		flexWrap: 'wrap',
		alignItems: 'flex-start',
		paddingHorizontal: flat.paddingHorizontal,
		paddingVertical: flat.paddingVertical,
		paddingTop: flat.paddingTop,
		paddingBottom: flat.paddingBottom,
		paddingLeft: flat.paddingLeft,
		paddingRight: flat.paddingRight,
	};

	if (!hasSpecial) {
		return (
			<Text style={style} {...(props as TextProps)}>
				{text}
			</Text>
		);
	}

	return (
		<View style={containerStyle} {...props}>
			{nodes.map((node) => {
				if (node.type === 'link') {
					return (
						<Pressable
							key={node.key}
							onPress={() => node.href && openLink(node.href)}
							hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
							accessibilityRole="link"
						>
							<Text
								style={[
									textStyle,
									{ color: '#3b82f6', fontWeight: '600', textDecorationLine: 'underline' },
									linkStyle,
								]}
							>
								{node.content}
							</Text>
						</Pressable>
					);
				}
				if (node.type === 'mention') {
					return (
						<Pressable
							key={node.key}
							onPress={() => node.username && void navigateToMention(node.username)}
							hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
							accessibilityRole="link"
						>
							<Text style={[textStyle, { color: '#3b82f6', fontWeight: '600' }, mentionStyle]}>
								{node.content}
							</Text>
						</Pressable>
					);
				}
				return (
					<Text key={node.key} style={textStyle}>
						{node.content}
					</Text>
				);
			})}
		</View>
	);
}
