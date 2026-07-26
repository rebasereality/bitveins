export function balancedTransferRows(count: number): number[] {
  const total = Math.max(0, Math.floor(count))
  if (total === 0) return []

  const columns = total <= 3
    ? total
    : Math.min(4, Math.ceil(Math.sqrt(total)))
  const rowCount = Math.ceil(total / columns)
  const minimumRowSize = Math.floor(total / rowCount)
  const largerRows = total % rowCount

  return Array.from(
    { length: rowCount },
    (_, index) => minimumRowSize + (index < largerRows ? 1 : 0),
  )
}
