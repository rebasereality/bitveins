import { describe, expect, it } from 'vitest'
import { parseStoredExplorerViewMode } from '~/utils/explorer-view-mode'

describe('parseStoredExplorerViewMode', () => {
  it.each([
    ['terminal', 'terminal'],
    ['explorer', 'explorer'],
    ['ide', 'explorer'],
    [null, 'terminal'],
    ['unknown', 'terminal'],
  ] as const)('maps %s to %s', (stored, expected) => {
    expect(parseStoredExplorerViewMode(stored)).toBe(expected)
  })
})
