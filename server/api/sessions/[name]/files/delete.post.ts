import { readdir, rmdir, stat, unlink } from 'node:fs/promises'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { deleteFileBodySchema } from '#shared/contracts/api'
import { useBitveinsContainer } from '../../../../composition/bitveins-container'
import { readRequestBody } from '../../../../utils/request-validation'
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

  const body = await readRequestBody(event, deleteFileBodySchema)

  try {
    const rootPath = await sessions.getSessionPath(sessionName)
    const targetPath = await resolveWorkspacePath(rootPath, body.path)

    const s = await stat(targetPath)

    if (s.isDirectory()) {
      const files = await readdir(targetPath)
      if (files.length > 0) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Directory is not empty. Bitveins only deletes empty directories to prevent accidental loss.',
        })
      }
      await rmdir(targetPath)
    }
    else {
      await unlink(targetPath)
    }

    return {
      ok: true,
    }
  }
  catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'statusCode' in error) throw error
    const msg = error instanceof Error ? error.message : 'Unknown error'
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete file or directory.',
      data: msg,
    })
  }
})
