import {
	Linking,
	Pressable,
	StyleSheet,
	Text,
	TextProps,
	TextStyle,
	View,
	ViewProps,
} from 'react-native';

// Common TLDs we treat as clickable when a link is written bare (no scheme and
// no `www.`), e.g. `youtu.be/abc` or `kejitbe.app`. Kept curated to avoid
// false positives on things like "Node.js" or "e.g.".
const TLD =
	'com|org|net|io|be|app|gg|co|tv|me|ly|dev|ai|xyz|info|edu|gov|news|store|shop';

// Matches: full `http(s)://…` URLs, `www.…` links, and bare `domain.tld[/path]`.
const URL_RE = new RegExp(
	`(https?:\\/\\/[^\\s<]+|www\\.[^\\s<]+|[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${TLD})(?:\\/[^\\s<]*)?)`,
	'gi',
);

interface LinkifyNode {
	type: 'text' | 'link';
	content: string;
	href?: string;
	key: string;
}

export function parseLinks(text: string): LinkifyNode[] {
	const nodes: LinkifyNode[] = [];
	let last = 0;
	let key = 0;
	for (const m of text.matchAll(URL_RE)) {
		const idx = m.index ?? 0;
		let raw = m[0];
		const trail = /[.,;:!?)\]}'"]+$/.exec(raw);
		const trailing = trail ? trail[0] : '';
		if (trailing) {
			raw = raw.slice(0, raw.length - trailing.length);
		}
		if (!raw) {
			continue;
		}
		if (idx > last) {
			nodes.push({ type: 'text', content: text.slice(last, idx), key: `t-${key++}` });
		}
		const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
		nodes.push({
			type: 'link',
			content: raw,
			href,
			key: `l-${key++}`,
		});
		if (trailing) {
			nodes.push({ type: 'text', content: trailing, key: `t-${key++}` });
		}
		last = idx + m[0].length;
	}
	if (last < text.length) {
		nodes.push({ type: 'text', content: text.slice(last), key: `t-${key++}` });
	}
	return nodes;
}

function openLink(href: string) {
	void Linking.openURL(href).catch((err) => {
		console.error('Error opening link:', err);
	});
}

interface LinkifyTextProps extends Omit<ViewProps, 'children'> {
	text: string;
	linkStyle?: TextStyle;
	/** Passed to plain text segments and as base for links. */
	style?: TextStyle | TextStyle[];
}

/**
 * Renders text with tappable links. Uses Pressable per link (not nested Text
 * onPress) so taps work inside FlatList/ScrollView on Android.
 */
export function LinkifyText({ text, linkStyle, style, ...props }: LinkifyTextProps) {
	const nodes = parseLinks(text);
	const flat = StyleSheet.flatten(style) ?? {};
	const hasLinks = nodes.some((n) => n.type === 'link');

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

	if (!hasLinks) {
		return (
			<Text style={style} {...(props as TextProps)}>
				{text}
			</Text>
		);
	}

	return (
		<View style={containerStyle} {...props}>
			{nodes.map((node) =>
				node.type === 'link' ? (
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
				) : (
					<Text key={node.key} style={textStyle}>
						{node.content}
					</Text>
				),
			)}
		</View>
	);
}
