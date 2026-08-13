export const GIT_GRAPH_LANE_GAP = 20
export const GIT_GRAPH_PADDING = 10
export const GIT_GRAPH_ROW_HEIGHT = 34

export function gitGraphWidth(laneCount: number): number {
  return GIT_GRAPH_PADDING * 2 + Math.max(1, laneCount) * GIT_GRAPH_LANE_GAP
}
