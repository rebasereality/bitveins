import type { GitCommit } from '#shared/contracts/git'

export interface GitGraphSegment {
  color: number
  from: number
  kind: 'outgoing' | 'through'
  to: number
}

export interface GitGraphRow {
  color: number
  commit: GitCommit
  lane: number
  laneCount: number
  segments: GitGraphSegment[]
}

interface Lane {
  color: number
  hash: string
}

function nextColor(lanes: readonly Lane[], seed: number): number {
  const used = new Set(lanes.map(lane => lane.color))
  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = (seed + offset) % 8
    if (!used.has(candidate)) return candidate
  }
  return seed % 8
}

export function layoutGitGraph(commits: readonly GitCommit[]): GitGraphRow[] {
  let lanes: Lane[] = []
  let colorSeed = 0
  return commits.map((commit) => {
    let lane = lanes.findIndex(item => item.hash === commit.hash)
    if (lane === -1) {
      lanes = [{ hash: commit.hash, color: nextColor(lanes, colorSeed++) }, ...lanes]
      lane = 0
    }

    const before = lanes.map(item => ({ ...item }))
    const current = before[lane]!
    const after = before.filter((_, index) => index !== lane)
    const parents = [...new Set(commit.parents)]

    parents.forEach((parent, parentIndex) => {
      if (after.some(item => item.hash === parent)) return
      const color = parentIndex === 0 ? current.color : nextColor(after, colorSeed++)
      after.splice(Math.min(lane + parentIndex, after.length), 0, { hash: parent, color })
    })

    const segments: GitGraphSegment[] = []
    before.forEach((item, from) => {
      if (from === lane) return
      const to = after.findIndex(next => next.hash === item.hash)
      if (to !== -1) segments.push({ color: item.color, from, kind: 'through', to })
    })
    parents.forEach((parent) => {
      const to = after.findIndex(item => item.hash === parent)
      if (to !== -1) segments.push({ color: after[to]!.color, from: lane, kind: 'outgoing', to })
    })

    lanes = after
    return {
      color: current.color,
      commit,
      lane,
      laneCount: Math.max(before.length, after.length, 1),
      segments,
    }
  })
}
