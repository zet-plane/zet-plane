import type { NodeResponse } from "@zet-plane/contracts";
import type { AggregatedStatus } from "./types";

export function effectiveNodeStatus(
	status: NodeResponse["status"],
	aggregation: AggregatedStatus | undefined,
): NodeResponse["status"] {
	if (status === "completed" || status === "archived") return status;
	return aggregation?.worst ?? status;
}
