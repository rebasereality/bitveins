import { basename, join } from 'node:path'
import { readFile, readdir, readlink } from 'node:fs/promises'
import { extractCodexThreadIdFromPath, normalizeCodexThreadId } from '../model/codex-thread-id'
import type { CodexProcessInspector, CodexProcessMetadata } from '../ports/codex-process-inspector'

interface ProcFilesystem {
  readFile(path: string): Promise<Buffer>
  readdir(path: string): Promise<string[]>
  readlink(path: string): Promise<string>
}

interface LinuxCodexProcessInspectorOptions {
  filesystem?: ProcFilesystem
  procRoot?: string
}

const nodeProcFilesystem: ProcFilesystem = { readFile, readdir, readlink }

export class LinuxCodexProcessInspector implements CodexProcessInspector {
  private readonly filesystem: ProcFilesystem
  private readonly procRoot: string

  constructor(options: LinuxCodexProcessInspectorOptions = {}) {
    this.filesystem = options.filesystem ?? nodeProcFilesystem
    this.procRoot = options.procRoot ?? '/proc'
  }

  async inspect(processId: number): Promise<CodexProcessMetadata | null> {
    if (!Number.isSafeInteger(processId) || processId <= 0) return null
    const processRoot = join(this.procRoot, String(processId))
    try {
      const executable = (await this.filesystem.readlink(join(processRoot, 'exe')))
        .replace(/ \(deleted\)$/u, '')
      if (!executable.startsWith('/') || basename(executable) !== 'codex') return null
      return {
        executable,
        threadId: await this.findThreadId(processRoot),
      }
    }
    catch {
      return null
    }
  }

  private async findThreadId(processRoot: string): Promise<string | null> {
    const commandLineId = await this.findCommandLineThreadId(processRoot)
    if (commandLineId) return commandLineId

    try {
      const descriptorNames = await this.filesystem.readdir(join(processRoot, 'fd'))
      const targets = await Promise.all(descriptorNames.map(async (descriptor) => {
        try {
          return await this.filesystem.readlink(join(processRoot, 'fd', descriptor))
        }
        catch {
          return ''
        }
      }))
      for (const target of targets) {
        const threadId = extractCodexThreadIdFromPath(target)
        if (threadId) return threadId
      }
    }
    catch {
      // A short-lived or permission-isolated process may disappear during inspection.
    }
    return null
  }

  private async findCommandLineThreadId(processRoot: string): Promise<string | null> {
    try {
      const argumentsList = (await this.filesystem.readFile(join(processRoot, 'cmdline')))
        .toString('utf8')
        .split('\0')
        .filter(Boolean)
      const resumeIndex = argumentsList.indexOf('resume')
      return resumeIndex === -1 ? null : normalizeCodexThreadId(argumentsList[resumeIndex + 1])
    }
    catch {
      return null
    }
  }
}
