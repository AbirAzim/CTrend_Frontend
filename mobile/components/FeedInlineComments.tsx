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
/** Facebook opens comments nearly full-screen — leave a small peek of the post behind. */
const SHEET_HEIGHT = Math.round(SCREEN_H * 0.94);

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

type FbPalette = {
	sheet: string;
	composerBar: string;
	bubble: string;
	input: string;
	border: string;
	text: string;
	subtext: string;
	meta: string;
	link: string;
	backdrop: string;
};

function fbPalette(isDark: boolean): FbPalette {
	if (isDark) {
		return {
			sheet: '#18191a',
			composerBar: '#242526',
			bubble: '#3a3b3c',
			input: '#3a3b3c',
			border: '#3e4042',
			text: '#e4e6eb',
			subtext: '#b0b3b8',
			meta: '#8a8d91',
			link: '#2d88ff',
			backdrop: 'rgba(0,0,0,0.65)',
		};
	}
	return {
		sheet: '#ffffff',
		composerBar: '#ffffff',
		bubble: '#f0f2f5',
		input: '#f0f2f5',
		border: '#ced0d4',
		text: '#050505',
		subtext: '#65676b',
		meta: '#65676b',
		link: '#1877f2',
		backdrop: 'rgba(0,0,0,0.45)',
	};
}

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
	const { isDark } = useTheme();
	const { isAuthenticated, user } = useAuth();
	const insets = useSafeAreaInsets();
	const fb = fbPalette(isDark);
	const st = makeStyles(fb);

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

	const displayName =
		user?.displayName?.trim() || user?.username?.trim() || 'You';

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
	const userInitial = displayName.slice(0, 1).toUpperCase();

	function renderComment(c: GqlComment, isReply: boolean) {
		const name =
			c.author?.displayName?.trim() || c.author?.username?.trim() || 'User';
		const avatar = normalizeProfileImageUrl(c.author?.profileImageUrl);
		const isOwn = !!user?.id && c.author?.id === user.id;
		const isEditing = editingId === c.id;
		const isHighlighted = highlightCommentId === c.id;
		const timeLabel = formatRelativeTime(c.createdAt);

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
						<Text style={st.bubbleName}>{name}</Text>
						{c.replyToName ? (
							<Text style={st.replyingTo}>Replying to {c.replyToName}</Text>
						) : null}
						{isEditing ? (
							<View style={st.editBox}>
								<TextInput
									style={st.editInput}
									value={editText}
									onChangeText={setEditText}
									multiline
									autoFocus
									maxLength={1000}
									placeholderTextColor={fb.subtext}
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
							<Text style={st.time}>{timeLabel}</Text>
							<Pressable onPress={() => handleLike(c)} hitSlop={8}>
								<Text style={[st.metaBtn, c.viewerHasLiked && st.metaBtnLiked]}>
									Like
								</Text>
							</Pressable>
							<Pressable onPress={() => startReply(c)} hitSlop={8}>
								<Text style={st.metaBtn}>Reply</Text>
							</Pressable>
							{isOwn && (
								<>
									<Pressable onPress={() => startEdit(c)} hitSlop={8}>
										<Text style={st.metaBtn}>Edit</Text>
									</Pressable>
									<Pressable onPress={() => confirmDelete(c)} hitSlop={8}>
										<Text style={[st.metaBtn, st.metaBtnDelete]}>Delete</Text>
									</Pressable>
								</>
							)}
						</View>
					)}
				</View>

				{!isEditing && c.likeCount > 0 ? (
					<View style={st.likePill}>
						<Text style={st.likePillIcon}>👍</Text>
						<Text style={st.likePillCount}>{c.likeCount}</Text>
					</View>
				) : (
					<Pressable style={st.likeBtn} onPress={() => handleLike(c)} hitSlop={8}>
						<Text style={[st.likeBtnIcon, c.viewerHasLiked && st.likeBtnIconActive]}>
							{c.viewerHasLiked ? '👍' : '👍🏻'}
						</Text>
					</Pressable>
				)}
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
				<Pressable style={st.backdropTap} onPress={onClose} />
				<KeyboardAvoidingView behavior='padding' keyboardVerticalOffset={0} style={st.kav}>
					<View style={[st.sheet, { height: SHEET_HEIGHT, paddingBottom: 0 }]}>
						<View style={st.grabber} />
						<View style={st.header}>
							<Text style={st.headerTitle}>Comments</Text>
							{ordered.length > 0 ? (
								<Text style={st.headerCount}>{ordered.length}</Text>
							) : null}
							<View style={{ flex: 1 }} />
							<Pressable onPress={onClose} hitSlop={12} style={st.closeBtn}>
								<Text style={st.closeBtnText}>✕</Text>
							</Pressable>
						</View>

						<View style={st.listWrap}>
							{loading && all.length === 0 ? (
								<View style={st.centerState}>
									<ActivityIndicator color={fb.link} />
								</View>
							) : ordered.length === 0 ? (
								<View style={st.centerState}>
									<Text style={st.emptyTitle}>No comments yet</Text>
									<Text style={st.empty}>Be the first to comment.</Text>
								</View>
							) : (
								<ScrollView
									ref={listRef}
									style={st.list}
									contentContainerStyle={st.listContent}
									keyboardShouldPersistTaps='handled'
									showsVerticalScrollIndicator
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
						</View>

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

						<View style={[st.composer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
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
												? `Comment as ${displayName}`
												: 'Log in to comment'
									}
									placeholderTextColor={fb.subtext}
									value={text}
									onChangeText={setText}
									editable={isAuthenticated && !sending}
									multiline
									maxLength={1000}
									onPressIn={() => {
										if (!isAuthenticated) router.push('/auth/login');
									}}
								/>
							</View>
							{(text.trim() || sending) && (
								<Pressable
									style={st.sendBtn}
									onPress={() => void handleSend()}
									disabled={!canSend}
								>
									{sending ? (
										<ActivityIndicator size='small' color={fb.link} />
									) : (
										<Text style={[st.sendBtnIcon, !canSend && { opacity: 0.35 }]}>➤</Text>
									)}
								</Pressable>
							)}
						</View>
					</View>
				</KeyboardAvoidingView>
			</View>
		</Modal>
	);
}

function makeStyles(fb: FbPalette) {
	return StyleSheet.create({
		backdrop: {
			flex: 1,
			justifyContent: 'flex-end',
			backgroundColor: fb.backdrop,
		},
		backdropTap: {
			flex: 1,
		},
		kav: { width: '100%' },
		sheet: {
			width: '100%',
			backgroundColor: fb.sheet,
			borderTopLeftRadius: 12,
			borderTopRightRadius: 12,
			overflow: 'hidden',
		},
		grabber: {
			alignSelf: 'center',
			width: 40,
			height: 4,
			borderRadius: 2,
			backgroundColor: fb.border,
			marginTop: 8,
			marginBottom: 4,
		},
		header: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 8,
			paddingHorizontal: 14,
			paddingVertical: 10,
			borderBottomWidth: StyleSheet.hairlineWidth,
			borderBottomColor: fb.border,
		},
		headerTitle: { fontSize: 17, fontWeight: '700', color: fb.text },
		headerCount: {
			fontSize: 13,
			fontWeight: '600',
			color: fb.subtext,
		},
		closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
		closeBtnText: { fontSize: 22, fontWeight: '400', color: fb.subtext, lineHeight: 24 },
		listWrap: {
			flex: 1,
			minHeight: 0,
		},
		list: {
			flex: 1,
		},
		listContent: {
			paddingHorizontal: 12,
			paddingVertical: 10,
			gap: 4,
		},
		centerState: {
			flex: 1,
			alignItems: 'center',
			justifyContent: 'center',
			paddingHorizontal: 24,
			gap: 6,
		},
		emptyTitle: { fontSize: 16, fontWeight: '700', color: fb.text },
		empty: { fontSize: 14, color: fb.subtext, textAlign: 'center' },
		row: {
			flexDirection: 'row',
			gap: 8,
			alignItems: 'flex-start',
			paddingVertical: 8,
		},
		rowHighlighted: {
			backgroundColor: fb.link + '18',
			marginHorizontal: -8,
			paddingHorizontal: 8,
			borderRadius: 8,
		},
		replyRow: { marginLeft: 44 },
		avatar: {
			width: 40,
			height: 40,
			borderRadius: 20,
			backgroundColor: '#3a3b3c',
			alignItems: 'center',
			justifyContent: 'center',
			overflow: 'hidden',
		},
		avatarSm: { width: 32, height: 32, borderRadius: 16 },
		avatarText: { color: '#fff', fontSize: 15, fontWeight: '700' },
		bodyCol: { flex: 1, gap: 4, paddingRight: 4 },
		bubble: {
			backgroundColor: fb.bubble,
			borderRadius: 18,
			paddingHorizontal: 12,
			paddingVertical: 8,
			alignSelf: 'flex-start',
			maxWidth: '100%',
		},
		bubbleName: { fontSize: 13, fontWeight: '700', color: fb.text, marginBottom: 1 },
		replyingTo: { fontSize: 12, fontWeight: '600', color: fb.link, marginBottom: 2 },
		content: { fontSize: 15, color: fb.text, lineHeight: 20 },
		editedTag: { fontSize: 12, color: fb.meta, fontStyle: 'italic' },
		metaRow: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 16,
			marginLeft: 12,
			marginTop: 2,
			flexWrap: 'wrap',
		},
		time: { fontSize: 12, fontWeight: '600', color: fb.meta },
		metaBtn: { fontSize: 12, fontWeight: '700', color: fb.meta },
		metaBtnLiked: { color: fb.link },
		metaBtnDelete: { color: '#f02849' },
		likeBtn: {
			width: 32,
			alignItems: 'center',
			paddingTop: 10,
		},
		likeBtnIcon: { fontSize: 16, opacity: 0.45 },
		likeBtnIconActive: { opacity: 1 },
		likePill: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 2,
			alignSelf: 'flex-start',
			marginTop: 10,
			backgroundColor: fb.sheet,
			borderRadius: 10,
			paddingHorizontal: 4,
			paddingVertical: 2,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: fb.border,
		},
		likePillIcon: { fontSize: 11 },
		likePillCount: { fontSize: 11, fontWeight: '700', color: fb.subtext },
		replyBanner: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
			paddingHorizontal: 14,
			paddingVertical: 8,
			backgroundColor: fb.composerBar,
			borderTopWidth: StyleSheet.hairlineWidth,
			borderTopColor: fb.border,
		},
		replyBannerText: { fontSize: 13, color: fb.subtext, flex: 1 },
		replyBannerName: { fontWeight: '700', color: fb.text },
		replyBannerCancel: { fontSize: 16, color: fb.subtext, fontWeight: '600', paddingLeft: 8 },
		editBox: { gap: 6, marginTop: 2 },
		editInput: {
			backgroundColor: fb.input,
			borderRadius: 10,
			paddingHorizontal: 10,
			paddingVertical: 8,
			fontSize: 14,
			color: fb.text,
			minWidth: 180,
			maxHeight: 120,
		},
		editActions: { flexDirection: 'row', gap: 18, justifyContent: 'flex-end' },
		editCancel: { fontSize: 13, fontWeight: '700', color: fb.subtext },
		editSave: { fontSize: 13, fontWeight: '800', color: fb.link },
		composer: {
			flexDirection: 'row',
			alignItems: 'flex-end',
			gap: 8,
			paddingHorizontal: 12,
			paddingTop: 8,
			borderTopWidth: StyleSheet.hairlineWidth,
			borderTopColor: fb.border,
			backgroundColor: fb.composerBar,
		},
		composerAvatar: {
			width: 36,
			height: 36,
			borderRadius: 18,
			backgroundColor: '#3a3b3c',
			alignItems: 'center',
			justifyContent: 'center',
			overflow: 'hidden',
			marginBottom: 2,
		},
		composerAvatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
		composerPill: {
			flex: 1,
			backgroundColor: fb.input,
			borderRadius: 20,
			paddingHorizontal: 14,
			minHeight: 40,
			justifyContent: 'center',
		},
		input: {
			fontSize: 15,
			color: fb.text,
			maxHeight: 100,
			paddingVertical: 9,
		},
		sendBtn: {
			width: 36,
			height: 36,
			alignItems: 'center',
			justifyContent: 'center',
			marginBottom: 2,
		},
		sendBtnIcon: {
			fontSize: 22,
			fontWeight: '700',
			color: fb.link,
		},
	});
}
