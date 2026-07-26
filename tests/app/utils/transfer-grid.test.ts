import { describe, expect, it } from 'vitest'
import { balancedTransferRows } from '../../../app/utils/transfer-grid'

describe('balancedTransferRows', () => {
  it.each([
    [0, []],
    [1, [1]],
    [2, [2]],
    [3, [3]],
    [4, [2, 2]],
    [5, [3, 2]],
    [6, [3, 3]],
    [7, [3, 2, 2]],
    [8, [3, 3, 2]],
    [9, [3, 3, 3]],
    [10, [4, 3, 3]],
    [11, [4, 4, 3]],
    [12, [4, 4, 4]],
    [13, [4, 3, 3, 3]],
    [14, [4, 4, 3, 3]],
    [15, [4, 4, 4, 3]],
    [16, [4, 4, 4, 4]],
  ])('balances %i destinations', (count, rows) => {
    expect(balancedTransferRows(count as number)).toEqual(rows)
  })

  it('keeps at most four columns beyond sixteen destinations', () => {
    const rows = balancedTransferRows(21)

    expect(Math.max(...rows)).toBe(4)
    expect(rows.reduce((total, row) => total + row, 0)).toBe(21)
  })
})
