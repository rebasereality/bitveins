import { WorkspaceDocumentError } from './workspace-document'

export interface MediaByteRange {
  end: number
  start: number
}

function invalidRange(size: number): never {
  throw new WorkspaceDocumentError(
    'invalid-range',
    `Requested byte range is not satisfiable for a ${size}-byte media file.`,
  )
}

function parseOffset(value: string, size: number): number {
  if (!/^\d+$/.test(value)) invalidRange(size)
  const offset = Number(value)
  if (!Number.isSafeInteger(offset)) invalidRange(size)
  return offset
}

export function parseMediaByteRange(
  rangeHeader: string | undefined,
  size: number,
): MediaByteRange | null {
  if (!rangeHeader) return null
  if (!rangeHeader.startsWith('bytes=') || rangeHeader.includes(',')) invalidRange(size)

  const requested = rangeHeader.slice('bytes='.length).trim()
  const separator = requested.indexOf('-')
  if (separator === -1 || size <= 0) invalidRange(size)

  const startValue = requested.slice(0, separator).trim()
  const endValue = requested.slice(separator + 1).trim()

  if (!startValue) {
    const suffixLength = parseOffset(endValue, size)
    if (suffixLength <= 0) invalidRange(size)
    return {
      start: Math.max(0, size - suffixLength),
      end: size - 1,
    }
  }

  const start = parseOffset(startValue, size)
  if (start >= size) invalidRange(size)
  const end = endValue ? Math.min(parseOffset(endValue, size), size - 1) : size - 1
  if (end < start) invalidRange(size)
  return { start, end }
}
