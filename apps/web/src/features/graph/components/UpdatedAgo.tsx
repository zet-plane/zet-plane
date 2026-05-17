import { useEffect, useState } from "react";

export function formatUpdatedAgo(secondsAgo: number): string {
	if (secondsAgo < 5) return "just now";
	if (secondsAgo < 60) return `Updated ${Math.floor(secondsAgo)}s ago`;
	if (secondsAgo < 3600) return `Updated ${Math.floor(secondsAgo / 60)}m ago`;
	return `Updated ${Math.floor(secondsAgo / 3600)}h ago`;
}

type Props = {
	updatedAtMs: number;
	onRefresh: () => void;
	isFetching: boolean;
};

export function UpdatedAgo({ updatedAtMs, onRefresh, isFetching }: Props) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), 5000);
		return () => clearInterval(t);
	}, []);
	const secondsAgo =
		updatedAtMs > 0 ? Math.max(0, (now - updatedAtMs) / 1000) : 0;

	return (
		<button
			type="button"
			onClick={onRefresh}
			disabled={isFetching}
			className="absolute bottom-3 left-3 z-10 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm hover:bg-accent disabled:opacity-50"
		>
			{isFetching
				? "Refreshing…"
				: updatedAtMs > 0
					? formatUpdatedAgo(secondsAgo)
					: "Never updated"}
		</button>
	);
}
