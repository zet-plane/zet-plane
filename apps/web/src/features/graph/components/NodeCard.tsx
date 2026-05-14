import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Flag } from "lucide-react";
import type { NodeResponse } from "@zet-plane/contracts";
import { nodeStatusClass, nodeTypeClass } from "./status-classes";

export type NodeCardData = {
  node: NodeResponse;
  knowledgeCount: number;
  selected: boolean;
  dimmed: boolean;
};

export type NodeCardNode = Node<NodeCardData>;

export function NodeCard({ data }: NodeProps<NodeCardNode>) {
  const { node, knowledgeCount, selected, dimmed } = data;
  const classes = ["zp-node", nodeTypeClass(node.type), nodeStatusClass(node.status)];
  if (selected) classes.push("zp-selection-ring");
  if (dimmed) classes.push("zp-edge--dim");

  return (
    <div className={classes.join(" ")} style={{ position: "relative", minWidth: 120 }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div className="zp-node__title">{node.title}</div>
      {node.isCheckpoint && (
        <span className="zp-node__glyph" aria-label="checkpoint">
          <Flag size={11} />
        </span>
      )}
      {knowledgeCount > 0 && (
        <span className="zp-node__badge" aria-label={`${knowledgeCount} knowledge entries`}>
          K{knowledgeCount}
        </span>
      )}
    </div>
  );
}
