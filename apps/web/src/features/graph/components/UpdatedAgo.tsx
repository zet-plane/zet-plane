import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatAppRelativeTime } from "@/i18n/format";

type UpdatedAgoTranslator = {
	(key: "state.justNow"): string;
	(key: "time.updatedAt", options: { time: string }): string;
};

export function formatUpdatedAgo(
	language: "en" | "zh-CN",
	secondsAgo: number,
	t: UpdatedAgoTranslator,
): string {
	const relative = formatAppRelativeTime(language, secondsAgo);
	if (!relative) return t("state.justNow");
	return t("time.updatedAt", { time: relative });
}

type Props = {
	updatedAtMs: number;
	onRefresh: () => void;
	isFetching: boolean;
};

export function UpdatedAgo({ updatedAtMs, onRefresh, isFetching }: Props) {
	const { i18n, t } = useTranslation("common");
	const language = i18n.resolvedLanguage === "zh-CN" ? "zh-CN" : "en";
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
				? t("actions.refreshingEllipsis")
				: updatedAtMs > 0
					? formatUpdatedAgo(language, secondsAgo, t)
					: t("state.neverUpdated")}
		</button>
	);
}
