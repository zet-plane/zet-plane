import type { NodeResponse } from "@zet-plane/contracts";
import type { AggregatedStatus } from "../domain/types";

type NodeStatus = NodeResponse["status"];

export function nodeStatusClass(status: NodeStatus): string {
  return `zp-node--${status}`;
}

export function containerStatusClass(worst: AggregatedStatus["worst"], ownStatus?: NodeStatus): string {
  if (ownStatus === "completed") return "zp-container--completed";
  if (ownStatus === "archived") return "zp-container--archived";
  if (!worst) return "zp-container--neutral";
  return `zp-container--${worst}`;
}

export function edgeStatusClass(targetStatus: NodeStatus): string {
  if (targetStatus === "blocked" || targetStatus === "archived") return "zp-edge--blocked";
  if (targetStatus === "completed") return "zp-edge--completed";
  return "zp-edge--active";
}

export function nodeTypeClass(type: NodeResponse["type"]): string {
  if (type === "growth") return "zp-node--growth";
  return "zp-node--scaffold";
}
