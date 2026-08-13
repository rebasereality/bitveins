import { describe, expect, it, vi } from 'vitest'
import { resolveGitWorkspacePath } from '../../../../../server/modules/git/application/resolve-git-workspace-path'

describe('resolveGitWorkspacePath', () => {
  it('uses the selected tmux window path when one is provided', async () => {
    const sessions = {
      getSessionPath: vi.fn(async () => '/session-root'),
      listWindows: vi.fn(async () => [{
        active: true,
        id: '@7',
        index: 0,
        name: 'shell',
        path: '/workspace/repository',
      }]),
    }

    await expect(resolveGitWorkspacePath(sessions, 'demo', '@7'))
      .resolves.toBe('/workspace/repository')
    expect(sessions.getSessionPath).not.toHaveBeenCalled()
  })

  it('keeps the session root fallback for clients without a window id', async () => {
    const sessions = {
      getSessionPath: vi.fn(async () => '/session-root'),
      listWindows: vi.fn(async () => []),
    }

    await expect(resolveGitWorkspacePath(sessions, 'demo'))
      .resolves.toBe('/session-root')
  })

  it('returns null when the selected window no longer exists', async () => {
    const sessions = {
      getSessionPath: vi.fn(async () => '/session-root'),
      listWindows: vi.fn(async () => []),
    }

    await expect(resolveGitWorkspacePath(sessions, 'demo', '@missing'))
      .resolves.toBeNull()
  })
})
