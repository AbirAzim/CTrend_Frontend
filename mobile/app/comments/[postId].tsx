import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FeedInlineComments } from '../../components/FeedInlineComments';

/**
 * Full-screen comments — same window as chat/DMs so Android keyboard + send work reliably.
 * Opened from feed/post via router.push(`/comments/${postId}`).
 */
export default function PostCommentsScreen() {
	const { postId, focus, commentId } = useLocalSearchParams<{
		postId: string;
		focus?: string;
		commentId?: string;
	}>();

	if (!postId) {
		router.back();
		return null;
	}

	return (
		<>
			<Stack.Screen options={{ headerShown: false, animation: 'slide_from_bottom' }} />
			<FeedInlineComments
				postId={postId}
				onClose={() => router.back()}
				focusComposerOnOpen={focus === '1'}
				highlightCommentId={commentId?.trim() || null}
			/>
		</>
	);
}
