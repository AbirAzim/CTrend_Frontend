import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { SEARCH_USERS } from '@ctrend/shared/graphql/search';

export type MentionCandidate = {
	id: string;
	username: string;
	displayName?: string | null;
	profileImageUrl?: string | null;
};

export type MentionMode =
	| { kind: 'global' }
	| { kind: 'participants'; participants: MentionCandidate[] };

type MentionTrigger = { start: number; end: number; query: string };

/** Finds an active `@query` trigger ending at `cursor`, or null if the
 * cursor isn't inside one (e.g. mid-email, or after whitespace broke it). */
function detectMentionTrigger(text: string, cursor: number): MentionTrigger | null {
	if (cursor < 0 || cursor > text.length) return null;
	const upToCursor = text.slice(0, cursor);
	const at = upToCursor.lastIndexOf('@');
	if (at === -1) return null;
	const charBefore = at > 0 ? upToCursor[at - 1] : '';
	if (charBefore && !/\s/.test(charBefore)) return null;
	const query = upToCursor.slice(at + 1);
	if (/\s/.test(query) || query.length > 30) return null;
	return { start: at, end: cursor, query };
}

function useDebounced(value: string, delayMs: number): string {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(t);
	}, [value, delayMs]);
	return debounced;
}

function useGlobalMentionSearch(query: string | null): MentionCandidate[] {
	const debounced = useDebounced(query ?? '', 200);
	const { data } = useQuery<{ searchUsers: MentionCandidate[] }>(SEARCH_USERS, {
		variables: { search: debounced, take: 8 },
		skip: !debounced,
		fetchPolicy: 'cache-first',
	});
	return query ? (data?.searchUsers ?? []) : [];
}

interface UseMentionAutocompleteOptions {
	value: string;
	onChange: (next: string) => void;
	mode: MentionMode;
}

/**
 * Detects an in-progress `@mention` trigger around the caret (tracked via the
 * TextInput's onSelectionChange), fetches/filters candidates (global search
 * or a fixed participants list), and handles splicing the chosen `@username`
 * into the text. No keyboard nav (mobile keyboards have no arrow keys) —
 * selection is tap-only, via the `MentionAutocomplete` dropdown.
 */
export function useMentionAutocomplete({ value, onChange, mode }: UseMentionAutocompleteOptions) {
	const [cursor, setCursor] = useState<number | null>(null);

	const trigger = useMemo(
		() => (cursor === null ? null : detectMentionTrigger(value, cursor)),
		[value, cursor],
	);

	const globalCandidates = useGlobalMentionSearch(
		mode.kind === 'global' ? (trigger?.query ?? null) : null,
	);

	const candidates = useMemo<MentionCandidate[]>(() => {
		if (!trigger) return [];
		if (mode.kind === 'participants') {
			const q = trigger.query.toLowerCase();
			return mode.participants
				.filter(
					(p) =>
						p.username.toLowerCase().includes(q) ||
						(p.displayName ?? '').toLowerCase().includes(q),
				)
				.slice(0, 8);
		}
		return globalCandidates;
	}, [trigger, mode, globalCandidates]);

	const isOpen = trigger !== null && candidates.length > 0;

	const select = useCallback(
		(user: MentionCandidate) => {
			if (!trigger) return;
			const before = value.slice(0, trigger.start);
			const after = value.slice(trigger.end);
			onChange(`${before}@${user.username} ${after}`);
			setCursor(null);
		},
		[trigger, value, onChange],
	);

	/** Wire to the TextInput's onSelectionChange to keep the trigger detector
	 * in sync with the current caret position. */
	const onSelectionChange = useCallback(
		(e: { nativeEvent: { selection: { start: number; end: number } } }) => {
			setCursor(e.nativeEvent.selection.start);
		},
		[],
	);

	const close = useCallback(() => setCursor(null), []);

	/** Wire to the TextInput's onBlur so tapping elsewhere dismisses the
	 * dropdown. Delayed — TextInput blur fires on touch-*down* of whatever's
	 * tapped, ahead of a dropdown Pressable's onPress (touch-up), so closing
	 * immediately would unmount the dropdown mid-tap and cancel the selection. */
	const handleBlur = useCallback(() => {
		setTimeout(() => setCursor(null), 200);
	}, []);

	return { isOpen, candidates, select, onSelectionChange, close, handleBlur };
}
