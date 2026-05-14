import { create } from "zustand";

interface GraphViewState {
  hoveredNodeId: string | null;
  setHoveredNodeId: (id: string | null) => void;
}

export const useGraphViewStore = create<GraphViewState>((set) => ({
  hoveredNodeId: null,
  setHoveredNodeId: (hoveredNodeId) => set({ hoveredNodeId }),
}));
