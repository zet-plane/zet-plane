import type { NodeResponse } from "@zet-plane/contracts";
import { useTranslation } from "react-i18next";

type Props = {
	nodes: NodeResponse[];
	onSelect: (id: string) => void;
};

export function StagingPanel({ nodes, onSelect }: Props) {
	const { t } = useTranslation("graph");
	const stagingNodes = nodes.filter(
		(n) => n.role === "staging_root" || n.type === "staging",
	);

	return (
		<aside className="zp-staging" aria-label={t("staging.region")}>
			<div className="zp-staging__header">
				<span className="zp-staging__title">{t("staging.title")}</span>
				<span className="zp-staging__count">{stagingNodes.length}</span>
			</div>
			<div className="zp-staging__list">
				{stagingNodes.length === 0 ? (
					<div className="zp-staging__empty">{t("staging.empty")}</div>
				) : (
					stagingNodes.map((n) => (
						<button
							key={n.id}
							type="button"
							className={`zp-pill zp-pill--growth zp-pill--${n.status} zp-pill--staging`}
							onClick={() => onSelect(n.id)}
						>
							<span className="zp-pill__title">{n.title}</span>
						</button>
					))
				)}
			</div>
		</aside>
	);
}
