import { describe, expect, it } from 'vitest'
import {
  GIT_GRAPH_LANE_GAP,
  GIT_GRAPH_PADDING,
  gitGraphWidth,
} from '../../../app/git/git-graph-metrics'

describe('Git graph metrics', () => {
  it('keeps lane spacing consistent across rows and expanded panels', () => {
    expect(GIT_GRAPH_LANE_GAP).toBe(20)
    expect(GIT_GRAPH_PADDING).toBe(10)
    expect(gitGraphWidth(0)).toBe(40)
    expect(gitGraphWidth(3)).toBe(80)
  })
})
