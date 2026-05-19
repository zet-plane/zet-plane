import { useTranslation } from "react-i18next";

type EmptyProps = {
	rootOnly?: boolean;
	focusTitle?: string;
	onReturnToParent?: () => void;
};

export function EmptyState({
	rootOnly,
	focusTitle,
	onReturnToParent,
}: EmptyProps) {
	const { t } = useTranslation("graph");

	return (
		<div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
			<div>
				{focusTitle
					? t("canvas.focusEmpty", { title: focusTitle })
					: rootOnly
						? t("canvas.rootEmpty")
						: t("canvas.empty")}
			</div>
			{onReturnToParent && (
				<button
					type="button"
					onClick={onReturnToParent}
					className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent"
				>
					{t("canvas.returnToParent")}
				</button>
			)}
		</div>
	);
}

export function LoadingState({ message }: { message: string }) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
			<div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
			<div>{message}</div>
		</div>
	);
}

export function ErrorState({
	error,
	onRetry,
}: {
	error: Error;
	onRetry?: () => void;
}) {
	const { t } = useTranslation("graph");
	const { t: tCommon } = useTranslation("common");

	return (
		<div className="flex h-full items-center justify-center p-6">
			<div className="max-w-md rounded-lg border border-destructive bg-background p-4 text-center text-sm">
				<div className="mb-2 font-medium text-destructive">
					{t("canvas.errorTitle")}
				</div>
				<div className="mb-3 text-muted-foreground">{error.message}</div>
				{onRetry && (
					<button
						type="button"
						onClick={onRetry}
						className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent"
					>
						{tCommon("actions.retry")}
					</button>
				)}
			</div>
		</div>
	);
}
