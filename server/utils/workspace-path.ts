import { realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { createError } from 'h3'

interface WorkspacePathOptions {
  allowMissing?: boolean
  allowRoot?: boolean
}

function accessDenied(message: string): never {
  throw createError({
    statusCode: 403,
    statusMessage: message,
  })
}

function assertWithinRoot(rootPath: string, candidatePath: string, allowRoot: boolean): void {
  const rel = relative(rootPath, candidatePath)

  if ((!allowRoot && rel === '') || rel.startsWith('..') || isAbsolute(rel)) {
    accessDenied('Access denied: Path is outside of workspace.')
  }
}

async function findExistingAncestor(path: string): Promise<string> {
  let candidate = path

  while (true) {
    try {
      await realpath(candidate)
      return candidate
    }
    catch (error: unknown) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : ''

      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        throw error
      }

      const parent = dirname(candidate)
      if (parent === candidate) {
        throw error
      }
      candidate = parent
    }
  }
}

export async function resolveWorkspacePath(
  rootPath: string,
  requestedPath: string,
  options: WorkspacePathOptions = {},
): Promise<string> {
  const allowRoot = options.allowRoot ?? false
  const root = await realpath(resolve(rootPath))
  const lexicalTarget = resolve(root, requestedPath)

  assertWithinRoot(root, lexicalTarget, allowRoot)

  if (!options.allowMissing) {
    const canonicalTarget = await realpath(lexicalTarget)
    assertWithinRoot(root, canonicalTarget, allowRoot)
    return canonicalTarget
  }

  const existingAncestor = await findExistingAncestor(lexicalTarget)
  const canonicalAncestor = await realpath(existingAncestor)
  const canonicalTarget = resolve(canonicalAncestor, relative(existingAncestor, lexicalTarget))

  assertWithinRoot(root, canonicalTarget, allowRoot)
  return canonicalTarget
}
