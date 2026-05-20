import type { NodeResponse } from "@zet-plane/contracts";

type NodeStatus = NodeResponse["status"];

type EdgeState = {
	selected: boolean;
	dimmed: boolean;
	blocked: boolean;
};

export function nodeStatusClass(status: NodeStatus): string {
	return `zp-pill--${status}`;
}

export function edgeStateClass({ selected, dimmed, blocked }: EdgeState): string {
	if (selected) return "zp-edge--selected";
	if (blocked) return "zp-edge--blocked";
	if (dimmed) return "zp-edge--dim";
	return "zp-edge--neutral";
}
