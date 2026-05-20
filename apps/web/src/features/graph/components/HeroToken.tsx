import type { NodeResponse } from "@zet-plane/contracts";

type Props = {
	node: NodeResponse;
};

export function HeroToken({ node }: Props) {
	if (node.isProjectRoot) return <ProjectHero node={node} />;
	return <ScaffoldHero node={node} />;
}

function ProjectHero({ node }: { node: NodeResponse }) {
	return (
		<div className="zp-hero zp-hero--project">
			<div className="zp-hero__eyebrow">Project</div>
			<div className="zp-hero__title">{node.title}</div>
			{node.description && (
				<div className="zp-hero__desc">{node.description}</div>
			)}
		</div>
	);
}

function ScaffoldHero({ node }: { node: NodeResponse }) {
	const displayStatus = node.status;
	const classes = ["zp-hero", "zp-hero--scaffold", `zp-pill--${displayStatus}`];
	if (node.isCheckpoint) classes.push("zp-pill--checkpoint");

	return (
		<div className={classes.join(" ")}>
			{node.isCheckpoint && (
				<span
					className="zp-checkpoint-marker zp-checkpoint-marker--blocked"
					role="img"
					aria-label="checkpoint"
				>
					<span className="zp-checkpoint-marker__dot" />
				</span>
			)}
			<span className="zp-hero__title">{node.title}</span>
			{node.description && (
				<div className="zp-hero__desc">{node.description}</div>
			)}
		</div>
	);
}
