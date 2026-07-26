import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { createFileBodySchema } from '#shared/contracts/api'
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

  const body = await readRequestBody(event, createFileBodySchema)

  try {
    const rootPath = await sessions.getSessionPath(sessionName)
    const targetPath = await resolveWorkspacePath(rootPath, body.path, { allowMissing: true })

    if (body.isDir) {
      await mkdir(targetPath, { recursive: true })
    }
    else {
      await mkdir(dirname(targetPath), { recursive: true })
      await writeFile(targetPath, '', 'utf8')
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
      statusMessage: 'Failed to create file or directory.',
      data: msg,
    })
  }
})
