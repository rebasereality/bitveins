export function gitGraphSpline(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): string {
  if (startX === endX) return `M ${startX} ${startY} V ${endY}`

  const handle = (endY - startY) / 2
  return `M ${startX} ${startY} C ${startX} ${startY + handle}, ${endX} ${endY - handle}, ${endX} ${endY}`
}
