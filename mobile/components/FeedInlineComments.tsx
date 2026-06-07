import { useMutation, useQuery } from '@apollo/client/react';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	Dimensions,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
	COMMENTS_BY_POST,
	COMMENT_POST,
	DELETE_COMMENT,
	EDIT_COMMENT,
	SET_COMMENT_LIKE,
} from '@ctrend/shared/graphql/comments';
import { formatRelativeTime } from '@ctrend/shared/lib/formatRelativeTime';
import { normalizeProfileImageUrl } from '@ctrend/shared/lib/profileImageUrl';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_MAX_H = Math.round(SCREEN_H * 0.86);
const LIST_MAX_H = Math.round(SCREEN_H * 0.5);

type GqlComment = {
	id: string;
	content: string;
	createdAt: string;
	editedAt?: string | null;
	likeCount: number;
	viewerHasLiked: boolean;
	postId: string;
	parentId?: string | null;
	replyToName?: string | null;
	replyToUserId?: string | null;
	author?: {
		id: string;
		username?: string | null;
		displayName?: string | null;
		profileImageUrl?: string | null;
	} | null;
};

type CommentsData = { commentsByPost: GqlComment[] };

/**
 * Facebook-style comments bottom sheet. Opens on demand (Discuss / Write a comment)
 * — no inline gap on the post card. Composer keyboard only when user taps the field.
 */
export function FeedInlineComments({
	postId,
	onClose,
	onCommentAdded,
	focusComposerOnOpen = false,
	highlightCommentId = null,
}: {
	postId: string;
	onClose: () => void;
	onCommentAdded?: () => void;
	focusComposerOnOpen?: boolean;
	highlightCommentId?: string | null;
}) {
	const { colors } = useTheme();
	const { isAuthenticated, user } = useAuth();
	const insets = useSafeAreaInsets();
	const st = makeStyles(colors);

	const [text, setText] = useState('');
	const [sending, setSending] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editText, setEditText] = useState('');
	const [replyTarget, setReplyTarget] = useState<{ id: string; name: string } | null>(null);
	const inputRef = useRef<TextInput>(null);
	const listRef = useRef<ScrollView>(null);
	const commentOffsets = useRef<Record<string, number>>({});

	const { data, loading, refetch } = useQuery<CommentsData>(COMMENTS_BY_POST, {
		variables: { postId },
		fetchPolicy: 'cache-and-network',
	});

	const [commentPost] = useMutation(COMMENT_POST);
	const [setLike] = useMutation(SET_COMMENT_LIKE);
	const [editComment] = useMutation(EDIT_COMMENT);
	const [deleteComment] = useMutation(DELETE_COMMENT);

	const all = data?.commentsByPost ?? [];
	const topLevel = all.filter((c) => !c.parentId);
	const ordered = [...topLevel].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	useEffect(() => {
		if (!focusComposerOnOpen) return;
		const t = setTimeout(() => inputRef.current?.focus(), 320);
		return () => clearTimeout(t);
	}, [focusComposerOnOpen]);

	useEffect(() => {
		if (!highlightCommentId || loading || ordered.length === 0) return;
		const t = setTimeout(() => {
			const y = commentOffsets.current[highlightCommentId];
			if (y != null) listRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
		}, 400);
		return () => clearTimeout(t);
	}, [highlightCommentId, loading, ordered.length]);

	async function handleSend() {
		const content = text.trim();
		if (!content || sending) return;
		if (!isAuthenticated) {
			router.push('/auth/login');
			return;
		}
		setSending(true);
		try {
			await commentPost({
				variables: {
					postId,
					input: {
						content,
						...(replyTarget ? { parentId: replyTarget.id } : {}),
					},
				},
			});
			setText('');
			setReplyTarget(null);
			await refetch();
			onCommentAdded?.();
			setTimeout(() => listRef.current?.scrollTo({ y: 0, animated: true }), 100);
		} catch {
			/* keep text for retry */
		} finally {
			setSending(false);
		}
	}

	function startReply(c: GqlComment) {
		if (!isAuthenticated) {
			router.push('/auth/login');
			return;
		}
		const name =
			c.author?.displayName?.trim() || c.author?.username?.trim() || 'User';
		setReplyTarget({ id: c.id, name });
		setEditingId(null);
		setTimeout(() => inputRef.current?.focus(), 50);
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

	function startEdit(c: GqlComment) {
		setEditingId(c.id);
		setEditText(c.content);
	}

	async function saveEdit(c: GqlComment) {
		const content = editText.trim();
		if (!content) return;
		if (content === c.content) {
			setEditingId(null);
			return;
		}
		try {
			await editComment({ variables: { commentId: c.id, content } });
			setEditingId(null);
			await refetch();
		} catch {
			/* keep edit mode */
		}
	}

	function confirmDelete(c: GqlComment) {
		const isTopLevel = !c.parentId;
		Alert.alert(
			'Delete comment?',
			isTopLevel
				? 'This comment and all its replies will be removed.'
				: 'This comment will be removed.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: () => {
						void (async () => {
							try {
								await deleteComment({ variables: { commentId: c.id } });
								await refetch();
							} catch {
								/* ignore */
							}
						})();
					},
				},
			],
		);
	}

	const canSend = !!text.trim() && !sending && isAuthenticated;
	const userAvatar = normalizeProfileImageUrl(user?.profileImageUrl);
	const userInitial = (user?.displayName ?? user?.username ?? '?').slice(0, 1).toUpperCase();

	function renderComment(c: GqlComment, isReply: boolean) {
		const name =
			c.author?.displayName?.trim() || c.author?.username?.trim() || 'User';
		const avatar = normalizeProfileImageUrl(c.author?.profileImageUrl);
		const isOwn = !!user?.id && c.author?.id === user.id;
		const isEditing = editingId === c.id;
		const isHighlighted = highlightCommentId === c.id;

		return (
			<View
				key={c.id}
				style={[st.row, isReply && st.replyRow, isHighlighted && st.rowHighlighted]}
				onLayout={(e) => {
					commentOffsets.current[c.id] = e.nativeEvent.layout.y;
				}}
			>
				<Pressable
					onPress={() => {
						if (!c.author?.id) return;
						onClose();
						router.push(`/profile/${c.author.id}` as `/${string}`);
					}}
				>
					<View style={[st.avatar, isReply && st.avatarSm]}>
						{avatar ? (
							<Image
								source={{ uri: avatar }}
								style={StyleSheet.absoluteFill}
								contentFit='cover'
								cachePolicy='memory-disk'
							/>
						) : (
							<Text style={st.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
						)}
					</View>
				</Pressable>
				<View style={st.bodyCol}>
					<View style={st.bubble}>
						<Text style={st.bubbleName}>
							{name}
							{c.replyToName ? (
								<Text style={st.replyingTo}> · ↩ {c.replyToName}</Text>
							) : null}
						</Text>
						{isEditing ? (
							<View style={st.editBox}>
								<TextInput
									style={st.editInput}
									value={editText}
									onChangeText={setEditText}
									multiline
									autoFocus
									maxLength={1000}
									placeholderTextColor={colors.muted}
								/>
								<View style={st.editActions}>
									<Pressable onPress={() => setEditingId(null)} hitSlop={6}>
										<Text style={st.editCancel}>Cancel</Text>
									</Pressable>
									<Pressable onPress={() => void saveEdit(c)} hitSlop={6}>
										<Text style={st.editSave}>Save</Text>
									</Pressable>
								</View>
							</View>
						) : (
							<Text style={st.content}>
								{c.content}
								{c.editedAt ? <Text style={st.editedTag}> (edited)</Text> : null}
							</Text>
						)}
					</View>
					{!isEditing && (
						<View style={st.metaRow}>
							<Text style={st.time}>{formatRelativeTime(c.createdAt)}</Text>
							<Pressable onPress={() => handleLike(c)} hitSlop={6}>
								<Text style={[st.metaBtn, c.viewerHasLiked && st.metaBtnLiked]}>
									Like{c.likeCount > 0 ? ` · ${c.likeCount}` : ''}
								</Text>
							</Pressable>
							<Pressable onPress={() => startReply(c)} hitSlop={6}>
								<Text style={st.metaBtn}>Reply</Text>
							</Pressable>
							{isOwn && (
								<>
									<Pressable onPress={() => startEdit(c)} hitSlop={6}>
										<Text style={st.metaBtn}>Edit</Text>
									</Pressable>
									<Pressable onPress={() => confirmDelete(c)} hitSlop={6}>
										<Text style={[st.metaBtn, st.metaBtnDelete]}>Delete</Text>
									</Pressable>
								</>
							)}
						</View>
					)}
				</View>
			</View>
		);
	}

	return (
		<Modal
			visible
			transparent
			statusBarTranslucent
			animationType='slide'
			onRequestClose={onClose}
		>
			<View style={st.backdrop}>
				<Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
				<KeyboardAvoidingView behavior='padding' keyboardVerticalOffset={0} style={st.kav}>
					<View style={[st.sheet, { maxHeight: SHEET_MAX_H, paddingBottom: 0 }]}>
						<View style={st.grabber} />
						<View style={st.header}>
							<Text style={st.headerTitle}>Comments</Text>
							{ordered.length > 0 ? (
								<Text style={st.headerCount}>{ordered.length}</Text>
							) : null}
							<View style={{ flex: 1 }} />
							<Pressable onPress={onClose} hitSlop={10} style={st.closeBtn}>
								<Text style={st.closeBtnText}>✕</Text>
							</Pressable>
						</View>

						{loading && all.length === 0 ? (
							<ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
						) : ordered.length === 0 ? (
							<View style={st.emptyWrap}>
								<Text style={st.emptyTitle}>No comments yet</Text>
								<Text style={st.empty}>Be the first to share your thoughts.</Text>
							</View>
						) : (
							<ScrollView
								ref={listRef}
								style={[st.list, { maxHeight: LIST_MAX_H }]}
								contentContainerStyle={st.listContent}
								keyboardShouldPersistTaps='handled'
								showsVerticalScrollIndicator={false}
							>
								{ordered.map((c) => {
									const replies = all
										.filter((r) => r.parentId === c.id)
										.sort(
											(a, b) =>
												new Date(a.createdAt).getTime() -
												new Date(b.createdAt).getTime(),
										);
									return (
										<View key={c.id}>
											{renderComment(c, false)}
											{replies.map((r) => renderComment(r, true))}
										</View>
									);
								})}
							</ScrollView>
						)}

						{replyTarget ? (
							<View style={st.replyBanner}>
								<Text style={st.replyBannerText} numberOfLines={1}>
									Replying to <Text style={st.replyBannerName}>{replyTarget.name}</Text>
								</Text>
								<Pressable onPress={() => setReplyTarget(null)} hitSlop={8}>
									<Text style={st.replyBannerCancel}>✕</Text>
								</Pressable>
							</View>
						) : null}

						<View style={[st.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
							<View style={st.composerAvatar}>
								{userAvatar ? (
									<Image
										source={{ uri: userAvatar }}
										style={StyleSheet.absoluteFill}
										contentFit='cover'
										cachePolicy='memory-disk'
									/>
								) : (
									<Text style={st.composerAvatarText}>{userInitial}</Text>
								)}
							</View>
							<View style={st.composerPill}>
								<TextInput
									ref={inputRef}
									style={st.input}
									placeholder={
										replyTarget
											? `Reply to ${replyTarget.name}…`
											: isAuthenticated
												? 'Write a comment…'
												: 'Log in to comment'
									}
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
								{(text.trim() || sending) && (
									<Pressable
										style={st.postBtn}
										onPress={() => void handleSend()}
										disabled={!canSend}
									>
										{sending ? (
											<ActivityIndicator size='small' color={colors.accent} />
										) : (
											<Text style={[st.postBtnText, !canSend && { opacity: 0.4 }]}>
												Post
											</Text>
										)}
									</Pressable>
								)}
							</View>
						</View>
					</View>
				</KeyboardAvoidingView>
			</View>
		</Modal>
	);
}

function makeStyles(c: ReturnType<typeof useTheme>['colors']) {
	return StyleSheet.create({
		backdrop: {
			flex: 1,
			justifyContent: 'flex-end',
			backgroundColor: 'rgba(0,0,0,0.5)',
		},
		kav: { width: '100%' },
		sheet: {
			width: '100%',
			backgroundColor: c.bg,
			borderTopLeftRadius: 16,
			borderTopRightRadius: 16,
			paddingHorizontal: 12,
			paddingTop: 8,
		},
		grabber: {
			alignSelf: 'center',
			width: 36,
			height: 4,
			borderRadius: 2,
			backgroundColor: c.border,
			marginBottom: 10,
		},
		header: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 8,
			paddingBottom: 10,
			borderBottomWidth: StyleSheet.hairlineWidth,
			borderBottomColor: c.border,
		},
		headerTitle: { fontSize: 16, fontWeight: '800', color: c.text },
		headerCount: {
			fontSize: 13,
			fontWeight: '700',
			color: c.muted,
			backgroundColor: c.section,
			paddingHorizontal: 8,
			paddingVertical: 2,
			borderRadius: 10,
			overflow: 'hidden',
		},
		closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
		closeBtnText: { fontSize: 18, fontWeight: '600', color: c.subtext },
		emptyWrap: { paddingVertical: 20, paddingHorizontal: 8, alignItems: 'center', gap: 4 },
		emptyTitle: { fontSize: 15, fontWeight: '800', color: c.text },
		empty: { fontSize: 13, color: c.muted, textAlign: 'center' },
		list: { flexGrow: 0 },
		listContent: { gap: 12, paddingVertical: 12 },
		row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
		rowHighlighted: {
			backgroundColor: c.accent + '18',
			marginHorizontal: -8,
			paddingHorizontal: 8,
			paddingVertical: 6,
			borderRadius: 8,
		},
		replyRow: { marginLeft: 40 },
		avatar: {
			width: 36,
			height: 36,
			borderRadius: 18,
			backgroundColor: '#312e81',
			alignItems: 'center',
			justifyContent: 'center',
			overflow: 'hidden',
		},
		avatarSm: { width: 28, height: 28, borderRadius: 14 },
		avatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
		bodyCol: { flex: 1, gap: 4 },
		bubble: {
			backgroundColor: c.section,
			borderRadius: 18,
			paddingHorizontal: 12,
			paddingVertical: 8,
			alignSelf: 'flex-start',
			maxWidth: '100%',
		},
		bubbleName: { fontSize: 13, fontWeight: '800', color: c.text, marginBottom: 2 },
		replyingTo: { fontSize: 12, fontWeight: '600', color: c.accent },
		content: { fontSize: 15, color: c.text, lineHeight: 20 },
		editedTag: { fontSize: 11, color: c.muted, fontStyle: 'italic' },
		metaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginLeft: 4, flexWrap: 'wrap' },
		time: { fontSize: 12, fontWeight: '600', color: c.muted },
		metaBtn: { fontSize: 12, fontWeight: '700', color: c.subtext },
		metaBtnLiked: { color: '#1877f2' },
		metaBtnDelete: { color: '#ef4444' },
		replyBanner: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
			paddingHorizontal: 10,
			paddingVertical: 6,
			backgroundColor: c.section,
			borderRadius: 8,
			marginTop: 4,
			marginBottom: 4,
		},
		replyBannerText: { fontSize: 12, color: c.subtext, flex: 1 },
		replyBannerName: { fontWeight: '800', color: c.text },
		replyBannerCancel: { fontSize: 14, color: c.subtext, fontWeight: '700', paddingLeft: 8 },
		editBox: { gap: 6, marginTop: 2 },
		editInput: {
			backgroundColor: c.inputBg,
			borderWidth: 1,
			borderColor: c.border,
			borderRadius: 10,
			paddingHorizontal: 10,
			paddingVertical: 8,
			fontSize: 14,
			color: c.text,
			minWidth: 180,
			maxHeight: 120,
		},
		editActions: { flexDirection: 'row', gap: 18, justifyContent: 'flex-end' },
		editCancel: { fontSize: 13, fontWeight: '700', color: c.subtext },
		editSave: { fontSize: 13, fontWeight: '800', color: c.accent },
		composer: {
			flexDirection: 'row',
			alignItems: 'flex-end',
			gap: 8,
			paddingTop: 10,
			borderTopWidth: StyleSheet.hairlineWidth,
			borderTopColor: c.border,
			backgroundColor: c.bg,
		},
		composerAvatar: {
			width: 34,
			height: 34,
			borderRadius: 17,
			backgroundColor: '#312e81',
			alignItems: 'center',
			justifyContent: 'center',
			overflow: 'hidden',
			marginBottom: 4,
		},
		composerAvatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
		composerPill: {
			flex: 1,
			flexDirection: 'row',
			alignItems: 'flex-end',
			backgroundColor: c.section,
			borderRadius: 22,
			borderWidth: 1,
			borderColor: c.border,
			paddingLeft: 14,
			paddingRight: 4,
			minHeight: 40,
		},
		input: {
			flex: 1,
			fontSize: 15,
			color: c.text,
			maxHeight: 100,
			paddingTop: 9,
			paddingBottom: 9,
		},
		postBtn: {
			paddingHorizontal: 10,
			paddingVertical: 10,
			alignSelf: 'flex-end',
		},
		postBtnText: { fontSize: 14, fontWeight: '800', color: c.accent },
	});
}
