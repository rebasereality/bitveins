import { basename } from 'node:path'

const MAX_SESSION_NAME_LENGTH = 80

function slugify(value: string): string {
  return value
    .trim()
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function transferSessionBaseName(name: string, path: string): string {
  const pathFallback = basename(path.trim().replace(/\/+$/, ''))
  return (slugify(name) || slugify(pathFallback) || 'transfer')
    .slice(0, MAX_SESSION_NAME_LENGTH)
    .replace(/-+$/g, '')
    || 'transfer'
}

export function transferSessionCandidate(baseName: string, ordinal: number): string {
  if (ordinal <= 1) return baseName.slice(0, MAX_SESSION_NAME_LENGTH)

  const suffix = `-${ordinal}`
  const prefix = baseName
    .slice(0, MAX_SESSION_NAME_LENGTH - suffix.length)
    .replace(/-+$/g, '')

  return `${prefix || 'transfer'}${suffix}`
}
