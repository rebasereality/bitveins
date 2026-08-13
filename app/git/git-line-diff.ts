export interface GitChangedLines {
  after: number[]
  before: number[]
}

interface Point {
  x: number
  y: number
}

function lines(value: string): string[] {
  if (!value) return []
  const result = value.split('\n')
  if (result.at(-1) === '') result.pop()
  return result
}

export function gitChangedLines(before: string, after: string): GitChangedLines {
  const left = lines(before)
  const right = lines(after)
  const max = left.length + right.length
  const trace: Array<Map<number, number>> = []
  let frontier = new Map<number, number>([[1, 0]])
  let distance = 0

  outer: for (; distance <= max; distance += 1) {
    trace.push(new Map(frontier))
    const next = new Map<number, number>()
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const down = diagonal === -distance
        || (diagonal !== distance && (frontier.get(diagonal - 1) ?? -1) < (frontier.get(diagonal + 1) ?? -1))
      let x = down ? (frontier.get(diagonal + 1) ?? 0) : (frontier.get(diagonal - 1) ?? 0) + 1
      let y = x - diagonal
      while (x < left.length && y < right.length && left[x] === right[y]) {
        x += 1
        y += 1
      }
      next.set(diagonal, x)
      if (x >= left.length && y >= right.length) {
        break outer
      }
    }
    frontier = next
  }

  const beforeChanged: number[] = []
  const afterChanged: number[] = []
  let point: Point = { x: left.length, y: right.length }
  for (let d = distance; d > 0; d -= 1) {
    const previous = trace[d] || new Map<number, number>()
    const diagonal = point.x - point.y
    const down = diagonal === -d
      || (diagonal !== d && (previous.get(diagonal - 1) ?? -1) < (previous.get(diagonal + 1) ?? -1))
    const previousDiagonal = down ? diagonal + 1 : diagonal - 1
    const previousX = previous.get(previousDiagonal) ?? 0
    const previousY = previousX - previousDiagonal

    while (point.x > previousX && point.y > previousY) {
      point = { x: point.x - 1, y: point.y - 1 }
    }
    if (down && point.y > 0) {
      afterChanged.push(point.y)
      point = { x: point.x, y: point.y - 1 }
    }
    else if (point.x > 0) {
      beforeChanged.push(point.x)
      point = { x: point.x - 1, y: point.y }
    }
  }

  return {
    after: afterChanged.reverse(),
    before: beforeChanged.reverse(),
  }
}
