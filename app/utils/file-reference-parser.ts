import type { TerminalFileReference } from '#shared/contracts/explorer'

export interface ParsedFileReference extends TerminalFileReference {
  endIndex: number
  startIndex: number
  text: string
}

const MAX_REFERENCES = 32
const MAX_PATH_LENGTH = 4096
const MAX_POSITION = 10_000_000
const POSITION_SUFFIX = /:(\d+)(?::(\d+))?$/
const QUOTED_CANDIDATE = /(["'])([^"'\r\n]+)\1/g
const UNQUOTED_CANDIDATE = /[^\s<>{}[\]()"']+/g
const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i
const FILE_EXTENSION = /(?:^|\/)[^/]+\.[a-z0-9][a-z0-9._-]*$/i
const SHELL_PROMPT = /^[^/@\s]+@[^/:\s]+:.*[$#]$/

function trimCandidate(value: string): { leading: number, value: string } {
  const withoutLeading = value.replace(/^[`([{]+/, '')
  const leading = value.length - withoutLeading.length
  return {
    leading,
    value: withoutLeading.replace(/[`,.;!?\])}]+$/, ''),
  }
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
}

function toReference(value: string, startIndex: number): ParsedFileReference | null {
  const trimmed = trimCandidate(value)
  let path = trimmed.value
  const position = path.match(POSITION_SUFFIX)
  const line = position ? Number(position[1]) : undefined
  const column = position?.[2] ? Number(position[2]) : undefined
  if (
    position
    && (
      !line
      || line > MAX_POSITION
      || (column !== undefined && (column < 1 || column > MAX_POSITION))
    )
  ) {
    return null
  }
  if (position) path = path.slice(0, -position[0].length)

  if (
    path.length === 0
    || path.length > MAX_PATH_LENGTH
    || URI_SCHEME.test(path)
    || SHELL_PROMPT.test(path)
    || containsControlCharacter(path)
    || path.endsWith('/')
    || (!path.includes('/') && !FILE_EXTENSION.test(path))
  ) {
    return null
  }

  const text = trimmed.value
  const actualStart = startIndex + trimmed.leading
  return {
    path,
    ...(line ? { line } : {}),
    ...(column ? { column } : {}),
    startIndex: actualStart,
    endIndex: actualStart + text.length,
    text,
  }
}

export function parseFileReferences(text: string): ParsedFileReference[] {
  const references: ParsedFileReference[] = []
  const occupied = new Set<number>()

  for (const match of text.matchAll(QUOTED_CANDIDATE)) {
    if (match.index === undefined || !match[2]) continue
    const start = match.index + 1
    const reference = toReference(match[2], start)
    if (!reference) continue
    references.push(reference)
    for (let index = match.index; index < match.index + match[0].length; index += 1) {
      occupied.add(index)
    }
  }

  for (const match of text.matchAll(UNQUOTED_CANDIDATE)) {
    if (match.index === undefined || occupied.has(match.index)) continue
    const reference = toReference(match[0], match.index)
    if (reference) references.push(reference)
  }

  return references
    .sort((left, right) => left.startIndex - right.startIndex)
    .slice(0, MAX_REFERENCES)
}

export function parseSelectedFileReferences(text: string): ParsedFileReference[] {
  const directReferences = parseFileReferences(text)
  if (!/[\r\n]/.test(text)) return directReferences

  const joinedReferences = parseFileReferences(text.replace(/[ \t]*\r?\n[ \t]*/g, ''))
  const references = [...joinedReferences, ...directReferences]
  const seen = new Set<string>()

  return references.filter((reference) => {
    const key = `${reference.path}:${reference.line ?? ''}:${reference.column ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, MAX_REFERENCES)
}
