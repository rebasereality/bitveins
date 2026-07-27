export interface ExplorerReference {
  fragment?: string
  path: string
}

function decodedPath(value: string): string {
  try {
    return decodeURIComponent(value)
  }
  catch {
    return value
  }
}

export function resolveExplorerReference(
  documentPath: string,
  reference: string,
): ExplorerReference | null {
  const trimmed = reference.trim()
  if (
    !trimmed
    || trimmed.startsWith('#')
    || trimmed.startsWith('//')
    || /^[a-z][a-z\d+.-]*:/i.test(trimmed)
  ) {
    return null
  }

  const hashIndex = trimmed.indexOf('#')
  const withoutFragment = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex)
  const queryIndex = withoutFragment.indexOf('?')
  const rawPath = queryIndex === -1 ? withoutFragment : withoutFragment.slice(0, queryIndex)
  const base = rawPath.startsWith('/')
    ? []
    : documentPath.split('/').slice(0, -1)

  for (const segment of decodedPath(rawPath).replaceAll('\\', '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (base.length === 0) return null
      base.pop()
      continue
    }
    base.push(segment)
  }

  if (base.length === 0) return null
  return {
    path: base.join('/'),
    fragment: hashIndex === -1 ? undefined : trimmed.slice(hashIndex + 1),
  }
}

export function explorerImageUrl(sessionName: string, path: string): string {
  const query = new URLSearchParams({ path })
  return `/api/sessions/${encodeURIComponent(sessionName)}/files/image?${query.toString()}`
}
