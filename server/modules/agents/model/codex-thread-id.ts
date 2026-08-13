const CODEX_THREAD_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/u

export function normalizeCodexThreadId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return CODEX_THREAD_ID_PATTERN.test(normalized) ? normalized : null
}

export function extractCodexThreadIdFromPath(value: string): string | null {
  const filename = value.replace(/ \(deleted\)$/u, '').split('/').at(-1) ?? ''
  const lockMatch = /^([A-Za-z0-9_-]{8,128})\.lock$/u.exec(filename)
  if (lockMatch) return normalizeCodexThreadId(lockMatch[1])

  const rolloutMatch = /-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/iu.exec(filename)
  return normalizeCodexThreadId(rolloutMatch?.[1])
}
