import type { NodeResponse } from "@zet-plane/contracts";

type NodeStatus = NodeResponse["status"];

export function nodeStatusClass(status: NodeStatus): string {
	return `zp-pill--${status}`;
}

export function edgeStatusClass(targetStatus: NodeStatus): string {
	if (targetStatus === "blocked" || targetStatus === "archived")
		return "zp-edge--blocked";
	if (targetStatus === "completed") return "zp-edge--completed";
	return "zp-edge--active";
}
