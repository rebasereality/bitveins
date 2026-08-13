import type { TmuxWindow } from '#shared/contracts/terminal'

interface GitSessionContext {
  getSessionPath(name: string): Promise<string>
  listWindows(name: string): Promise<TmuxWindow[]>
}

export async function resolveGitWorkspacePath(
  sessions: GitSessionContext,
  sessionName: string,
  windowId?: string,
): Promise<string | null> {
  if (!windowId) return sessions.getSessionPath(sessionName)
  const window = (await sessions.listWindows(sessionName))
    .find(candidate => candidate.id === windowId)
  return window?.path ?? null
}
