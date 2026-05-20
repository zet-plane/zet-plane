import { useNavigate } from "@tanstack/react-router";
import { useProjectsList } from "@/features/projects/hooks/use-projects-list";

type Props = { activeProjectId: string };

export function ProjectSwitcher({ activeProjectId }: Props) {
	const { data } = useProjectsList();
	const navigate = useNavigate();

	return (
		<select
			value={activeProjectId}
			onChange={(e) =>
				navigate({
					to: "/projects/$projectId/graph",
					params: { projectId: e.target.value },
					search: { view: "diagnose" },
				})
			}
			className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
		>
			{(data ?? []).map((p) => (
				<option key={p.id} value={p.id}>
					{p.name}
				</option>
			))}
		</select>
	);
}
