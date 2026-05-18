import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback } from 'react';

export function useCanvasNavigation() {
	const search = useSearch({
		from: '/projects/$projectId/graph',
	}) as { focus?: string };
	const navigate = useNavigate({ from: '/projects/$projectId/graph' });

	const focusedNodeId = search.focus ?? null;

	const diveInto = useCallback(
		(id: string) => {
			navigate({ search: (prev) => ({ ...prev, focus: id }) });
		},
		[navigate],
	);

	const diveUpTo = useCallback(
		(id: string | null) => {
			navigate({
				search: (prev) => {
					const { focus: _drop, ...rest } = prev;
					return id ? { ...prev, focus: id } : rest;
				},
			});
		},
		[navigate],
	);

	const diveToRoot = useCallback(() => diveUpTo(null), [diveUpTo]);

	return { focusedNodeId, diveInto, diveUpTo, diveToRoot };
}
