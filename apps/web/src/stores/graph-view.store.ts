import { create } from "zustand";
import type { Node, Edge, Viewport } from "@xyflow/react";

interface GraphViewState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeIds: Set<string>;
  viewport: Viewport;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  selectNode: (id: string) => void;
  clearSelection: () => void;
  setViewport: (viewport: Viewport) => void;
}

export const useGraphViewStore = create<GraphViewState>((set) => ({
  nodes: [],
  edges: [],
  selectedNodeIds: new Set(),
  viewport: { x: 0, y: 0, zoom: 1 },

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  selectNode: (id) =>
    set((state) => ({
      selectedNodeIds: new Set([...state.selectedNodeIds, id]),
    })),

  clearSelection: () => set({ selectedNodeIds: new Set() }),

  setViewport: (viewport) => set({ viewport }),
}));
