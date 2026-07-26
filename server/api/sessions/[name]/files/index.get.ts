import { readdir, stat } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { useBitveinsContainer } from '../../../../composition/bitveins-container'
import { resolveWorkspacePath } from '../../../../utils/workspace-path'

const sessions = useBitveinsContainer().sessions

export default defineEventHandler(async (event) => {
  const sessionName = getRouterParam(event, 'name')
  if (!sessionName) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Session name is required.',
    })
  }

  const query = getQuery(event)
  const requestedPath = String(query.path || '')

  try {
    const rootPath = await sessions.getSessionPath(sessionName)
    const targetPath = await resolveWorkspacePath(rootPath, requestedPath, { allowRoot: true })

    const entries = await readdir(targetPath, { withFileTypes: true })
    const results = []

    for (const entry of entries) {
      // Ignore noisy or huge directories
      if (['.git', 'node_modules', '.nuxt', '.output', 'dist'].includes(entry.name)) {
        continue
      }

      const entryRelativePath = relative(rootPath, resolve(targetPath, entry.name))
      const isDirectory = entry.isDirectory()
      let size = 0

      if (!isDirectory) {
        try {
          const s = await stat(resolve(targetPath, entry.name))
          size = s.size
        }
        catch {
          // ignore stat errors on dead symlinks etc
        }
      }

      results.push({
        name: entry.name,
        path: entryRelativePath,
        isDir: isDirectory,
        size,
      })
    }

    // Sort: directories first, then files alphabetically
    results.sort((a, b) => {
      if (a.isDir !== b.isDir) {
        return a.isDir ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })

    return {
      files: results,
    }
  }
  catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'statusCode' in error) throw error
    const msg = error instanceof Error ? error.message : 'Unknown error'
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to list directory.',
      data: msg,
    })
  }
})
