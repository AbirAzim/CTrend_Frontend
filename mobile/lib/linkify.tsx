import { Linking, Text, TextProps } from 'react-native';

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

/**
 * Parses `text` into plain strings and link URLs, returning structured data
 * for rendering with React Native Text components. Links like `youtu.be/x`
 * are detected as clickable. Trailing sentence punctuation is excluded.
 */
export function parseLinks(text: string): LinkifyNode[] {
	const nodes: LinkifyNode[] = [];
	let last = 0;
	let key = 0;
	for (const m of text.matchAll(URL_RE)) {
		const idx = m.index ?? 0;
		let raw = m[0];
		// Don't swallow trailing sentence punctuation / closing brackets.
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

interface LinkifyTextProps extends Omit<TextProps, 'children'> {
	text: string;
	linkStyle?: TextProps['style'];
}

/**
 * React Native component that renders text with clickable links.
 * Links are opened using Linking.openURL().
 */
export function LinkifyText({ text, linkStyle, style, ...props }: LinkifyTextProps) {
	const nodes = parseLinks(text);

	const handleLinkPress = async (href: string) => {
		try {
			const supported = await Linking.canOpenURL(href);
			if (supported) {
				await Linking.openURL(href);
			}
		} catch (err) {
			console.error('Error opening link:', err);
		}
	};

	return (
		<Text style={style} {...props}>
			{nodes.map((node) => {
				if (node.type === 'text') {
					return (
						<Text key={node.key}>
							{node.content}
						</Text>
					);
				}
				return (
					<Text
						key={node.key}
						style={[{ color: '#0a66c2', fontWeight: '600' }, linkStyle]}
						onPress={() => node.href && handleLinkPress(node.href)}
						suppressHighlighting={false}
					>
						{node.content}
					</Text>
				);
			})}
		</Text>
	);
}
