import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useProjectsList } from "@/features/projects/hooks/use-projects-list";
import { formatAppDate } from "@/i18n/format";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";

function ProjectsListPage() {
	const { data, isLoading, error } = useProjectsList();
	const { i18n, t } = useTranslation("projects");
	const { t: tCommon } = useTranslation("common");
	const language = i18n.resolvedLanguage === "zh-CN" ? "zh-CN" : "en";

	if (isLoading)
		return (
			<div className="p-8 text-sm text-muted-foreground">
				{t("list.loading")}
			</div>
		);
	if (error)
		return (
			<div className="p-8 text-sm text-destructive">
				{t("list.error", { message: error.message })}
			</div>
		);
	if (!data || data.length === 0) {
		return (
			<div className="p-8 text-sm text-muted-foreground">{t("list.empty")}</div>
		);
	}

	return (
		<div className="mx-auto max-w-3xl p-8">
			<div className="mb-6 flex items-center justify-between gap-4">
				<h1 className="text-2xl font-semibold">{t("list.title")}</h1>
				<LanguageSwitcher />
			</div>
			<ul className="divide-y divide-border rounded-lg border border-border">
				{data.map((p) => (
					<li key={p.id}>
						<Link
							to="/projects/$projectId/graph"
							params={{ projectId: p.id }}
							search={{ view: "diagnose" }}
							className="flex items-baseline justify-between px-4 py-3 hover:bg-accent"
						>
							<span className="text-base font-medium">{p.name}</span>
							<span className="text-xs text-muted-foreground">
								{tCommon("time.updatedDate", {
									date: formatAppDate(language, p.updatedAt),
								})}
							</span>
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}

export const Route = createFileRoute("/projects/")({
	component: ProjectsListPage,
});
