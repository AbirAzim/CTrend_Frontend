import { useMutation, useQuery } from '@apollo/client/react';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';
import {
	COMMENTS_BY_POST,
	COMMENT_POST,
	SET_COMMENT_LIKE,
} from '@ctrend/shared/graphql/comments';
import { formatRelativeTime } from '@ctrend/shared/lib/formatRelativeTime';
import { normalizeProfileImageUrl } from '@ctrend/shared/lib/profileImageUrl';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

type GqlComment = {
	id: string;
	content: string;
	createdAt: string;
	likeCount: number;
	viewerHasLiked: boolean;
	postId: string;
	parentId?: string | null;
	author?: {
		id: string;
		username?: string | null;
		displayName?: string | null;
		profileImageUrl?: string | null;
	} | null;
};

type CommentsData = { commentsByPost: GqlComment[] };

// How many top-level comments to show inline before linking to the full thread.
const INLINE_LIMIT = 8;

export function FeedInlineComments({
	postId,
	onClose,
	onCommentAdded,
}: {
	postId: string;
	onClose: () => void;
	onCommentAdded?: () => void;
}) {
	const { colors } = useTheme();
	const { isAuthenticated } = useAuth();
	const st = makeStyles(colors);

	const [text, setText] = useState('');
	const [sending, setSending] = useState(false);

	const { data, loading, refetch } = useQuery<CommentsData>(COMMENTS_BY_POST, {
		variables: { postId },
		fetchPolicy: 'cache-and-network',
	});

	const [commentPost] = useMutation(COMMENT_POST);
	const [setLike] = useMutation(SET_COMMENT_LIKE);

	const all = data?.commentsByPost ?? [];
	const topLevel = all.filter((c) => !c.parentId);
	const replyCount = (parentId: string) =>
		all.filter((c) => c.parentId === parentId).length;

	// Newest → oldest (matches the full post page), capped to INLINE_LIMIT.
	const ordered = [...topLevel].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);
	const shown = ordered.slice(0, INLINE_LIMIT);
	const hiddenCount = ordered.length - shown.length;

	const openFullThread = useCallback(() => {
		router.push(`/post/${postId}` as `/${string}`);
	}, [postId]);

	async function handleSend() {
		const content = text.trim();
		if (!content || sending) return;
		if (!isAuthenticated) {
			router.push('/auth/login');
			return;
		}
		setSending(true);
		try {
			await commentPost({ variables: { postId, input: { content } } });
			setText('');
			await refetch();
			onCommentAdded?.();
		} catch {
			/* keep the text so the user can retry */
		} finally {
			setSending(false);
		}
	}

	function handleLike(c: GqlComment) {
		if (!isAuthenticated) {
			router.push('/auth/login');
			return;
		}
		void setLike({
			variables: { commentId: c.id, liked: !c.viewerHasLiked },
		}).catch(() => {});
	}

	return (
		<View style={st.wrap}>
			{/* Header with Hide toggle */}
			<View style={st.header}>
				<Text style={st.headerTitle}>
					Comments{ordered.length ? ` · ${ordered.length}` : ''}
				</Text>
				<Pressable onPress={onClose} hitSlop={8} style={st.hideBtn}>
					<Text style={st.hideBtnText}>Hide ✕</Text>
				</Pressable>
			</View>

			{loading && all.length === 0 ? (
				<ActivityIndicator color={colors.accent} style={{ marginVertical: 14 }} />
			) : ordered.length === 0 ? (
				<Text style={st.empty}>No comments yet — be the first.</Text>
			) : (
				<View style={st.list}>
					{hiddenCount > 0 && (
						<Pressable onPress={openFullThread} hitSlop={6}>
							<Text style={st.viewMore}>
								View all {ordered.length} comments
							</Text>
						</Pressable>
					)}
					{shown.map((c) => {
						const name =
							c.author?.displayName?.trim() ||
							c.author?.username?.trim() ||
							'User';
						const avatar = normalizeProfileImageUrl(c.author?.profileImageUrl);
						const replies = replyCount(c.id);
						return (
							<View key={c.id} style={st.row}>
								<Pressable
									onPress={() =>
										c.author?.id &&
										router.push(`/profile/${c.author.id}` as `/${string}`)
									}>
									<View style={st.avatar}>
										{avatar ? (
											<Image
												source={{ uri: avatar }}
												style={StyleSheet.absoluteFill}
												contentFit='cover'
												cachePolicy='memory-disk'
											/>
										) : (
											<Text style={st.avatarText}>
												{name.slice(0, 1).toUpperCase()}
											</Text>
										)}
									</View>
								</Pressable>
								<View style={st.bubbleCol}>
									<View style={st.bubble}>
										<Text style={st.author}>{name}</Text>
										<Text style={st.content}>{c.content}</Text>
									</View>
									<View style={st.metaRow}>
										<Text style={st.time}>{formatRelativeTime(c.createdAt)}</Text>
										<Pressable onPress={() => handleLike(c)} hitSlop={6}>
											<Text style={[st.metaBtn, c.viewerHasLiked && st.metaBtnLiked]}>
												{c.viewerHasLiked ? '♥' : '♡'}
												{c.likeCount > 0 ? ` ${c.likeCount}` : ''}
											</Text>
										</Pressable>
										{replies > 0 ? (
											<Pressable onPress={openFullThread} hitSlop={6}>
												<Text style={st.metaBtn}>
													💬 {replies} {replies === 1 ? 'reply' : 'replies'}
												</Text>
											</Pressable>
										) : (
											<Pressable onPress={openFullThread} hitSlop={6}>
												<Text style={st.metaBtn}>Reply</Text>
											</Pressable>
										)}
									</View>
								</View>
							</View>
						);
					})}
				</View>
			)}

			{/* Composer */}
			<View style={st.composer}>
				<TextInput
					style={st.input}
					placeholder={isAuthenticated ? 'Add a comment…' : 'Log in to comment'}
					placeholderTextColor={colors.muted}
					value={text}
					onChangeText={setText}
					editable={isAuthenticated && !sending}
					multiline
					maxLength={1000}
					onPressIn={() => {
						if (!isAuthenticated) router.push('/auth/login');
					}}
				/>
				<Pressable
					style={[
						st.sendBtn,
						{ backgroundColor: text.trim() && !sending ? colors.accent : colors.section },
					]}
					onPress={() => void handleSend()}
					disabled={!text.trim() || sending}>
					{sending ? (
						<ActivityIndicator size='small' color='#fff' />
					) : (
						<Text
							style={[
								st.sendBtnText,
								{ color: text.trim() ? '#fff' : colors.muted },
							]}>
							↑
						</Text>
					)}
				</Pressable>
			</View>
		</View>
	);
}

function makeStyles(c: ReturnType<typeof useTheme>['colors']) {
	return StyleSheet.create({
		wrap: {
			borderTopWidth: StyleSheet.hairlineWidth,
			borderTopColor: c.border,
			paddingHorizontal: 14,
			paddingTop: 10,
			paddingBottom: 12,
			gap: 8,
		},
		header: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
		},
		headerTitle: { fontSize: 13, fontWeight: '800', color: c.text },
		hideBtn: {
			borderRadius: 999,
			borderWidth: 1,
			borderColor: c.border,
			paddingHorizontal: 10,
			paddingVertical: 4,
		},
		hideBtnText: { fontSize: 12, fontWeight: '700', color: c.accent },
		empty: { fontSize: 13, color: c.muted, paddingVertical: 10 },
		viewMore: { fontSize: 12, fontWeight: '700', color: c.accent, paddingVertical: 4 },
		list: { gap: 12 },
		row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
		avatar: {
			width: 30,
			height: 30,
			borderRadius: 15,
			backgroundColor: '#312e81',
			alignItems: 'center',
			justifyContent: 'center',
			overflow: 'hidden',
		},
		avatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
		bubbleCol: { flex: 1, gap: 3 },
		bubble: {
			backgroundColor: c.section,
			borderRadius: 14,
			paddingHorizontal: 12,
			paddingVertical: 8,
			alignSelf: 'flex-start',
		},
		author: { fontSize: 12, fontWeight: '700', color: c.text, marginBottom: 1 },
		content: { fontSize: 14, color: c.text, lineHeight: 19 },
		metaRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginLeft: 4 },
		time: { fontSize: 11, color: c.muted },
		metaBtn: { fontSize: 12, fontWeight: '600', color: c.subtext },
		metaBtnLiked: { color: '#f87171' },
		composer: {
			flexDirection: 'row',
			alignItems: 'flex-end',
			gap: 8,
			marginTop: 2,
		},
		input: {
			flex: 1,
			backgroundColor: c.inputBg,
			borderWidth: 1,
			borderColor: c.border,
			borderRadius: 18,
			paddingHorizontal: 14,
			paddingVertical: 8,
			fontSize: 14,
			color: c.text,
			maxHeight: 100,
		},
		sendBtn: {
			width: 34,
			height: 34,
			borderRadius: 17,
			alignItems: 'center',
			justifyContent: 'center',
		},
		sendBtnText: { fontSize: 17, fontWeight: '800' },
	});
}
