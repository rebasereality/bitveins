import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveWorkspacePath } from '../../../server/utils/workspace-path'

describe('workspace path resolution', () => {
  let sandbox = ''
  let workspace = ''
  let outside = ''

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'bitveins-workspace-path-'))
    workspace = join(sandbox, 'workspace')
    outside = join(sandbox, 'outside')
    await Promise.all([
      mkdir(workspace),
      mkdir(outside),
    ])
    await writeFile(join(workspace, 'inside.txt'), 'inside')
    await writeFile(join(outside, 'secret.txt'), 'outside')
  })

  afterEach(async () => {
    await rm(sandbox, { force: true, recursive: true })
  })

  it('resolves existing paths inside the canonical workspace', async () => {
    await expect(resolveWorkspacePath(workspace, 'inside.txt'))
      .resolves.toBe(await realpath(join(workspace, 'inside.txt')))
  })

  it('allows the workspace root only when explicitly requested', async () => {
    await expect(resolveWorkspacePath(workspace, '')).rejects.toMatchObject({ statusCode: 403 })
    await expect(resolveWorkspacePath(workspace, '', { allowRoot: true }))
      .resolves.toBe(await realpath(workspace))
  })

  it('rejects lexical traversal outside the workspace', async () => {
    await expect(resolveWorkspacePath(workspace, '../outside/secret.txt'))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects an in-workspace symlink resolving outside the workspace', async () => {
    await symlink(outside, join(workspace, 'external'))

    await expect(resolveWorkspacePath(workspace, 'external/secret.txt'))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('validates the nearest existing ancestor for new nested paths', async () => {
    await expect(resolveWorkspacePath(workspace, 'new/deep/file.txt', { allowMissing: true }))
      .resolves.toBe(join(await realpath(workspace), 'new/deep/file.txt'))
  })

  it('rejects new paths below a symlink escaping the workspace', async () => {
    await symlink(outside, join(workspace, 'external'))

    await expect(resolveWorkspacePath(workspace, 'external/new/file.txt', { allowMissing: true }))
      .rejects.toMatchObject({ statusCode: 403 })
  })
})
