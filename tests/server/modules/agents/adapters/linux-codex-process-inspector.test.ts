import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { LinuxCodexProcessInspector } from '../../../../../server/modules/agents/adapters/linux-codex-process-inspector'

const THREAD_ID = '019ff7b9-2d85-78d2-9cea-eaff30ed6cef'

function inspector(files: {
  cmdline?: string
  descriptors?: Record<string, string>
  executable?: string
}) {
  const descriptors = files.descriptors ?? {}
  return new LinuxCodexProcessInspector({
    procRoot: '/test-proc',
    filesystem: {
      async readFile(path) {
        if (!path.endsWith('/cmdline')) throw new Error('missing')
        return Buffer.from(files.cmdline ?? '')
      },
      async readdir() {
        return Object.keys(descriptors)
      },
      async readlink(path) {
        if (path.endsWith('/exe')) return files.executable ?? '/opt/codex'
        const descriptor = path.split('/').at(-1)!
        if (!(descriptor in descriptors)) throw new Error('gone')
        return descriptors[descriptor]!
      },
    },
  })
}

describe('LinuxCodexProcessInspector', () => {
  it('reads a resumed thread id directly from argv', async () => {
    await expect(inspector({
      cmdline: `codex\0--profile\0lead\0resume\0${THREAD_ID}\0`,
    }).inspect(42)).resolves.toEqual({ executable: '/opt/codex', threadId: THREAD_ID })
  })

  it('falls back to the rollout descriptor for fresh sessions', async () => {
    await expect(inspector({
      cmdline: 'codex\0--profile\0lead\0',
      descriptors: {
        43: `/home/test/.codex/sessions/rollout-now-${THREAD_ID}.jsonl`,
        44: '/unreadable',
      },
    }).inspect(42)).resolves.toEqual({ executable: '/opt/codex', threadId: THREAD_ID })
  })

  it('rejects invalid pids and non-Codex executables', async () => {
    await expect(inspector({}).inspect(0)).resolves.toBeNull()
    await expect(inspector({ executable: 'relative/codex' }).inspect(42)).resolves.toBeNull()
    await expect(inspector({ executable: '/usr/bin/bash' }).inspect(42)).resolves.toBeNull()
    await expect(inspector({ executable: '/opt/codex (deleted)' }).inspect(42)).resolves.toEqual({
      executable: '/opt/codex',
      threadId: null,
    })
  })

  it('handles missing process, filesystem errors, and unreadable cmdline or fd', async () => {
    const brokenInspector = new LinuxCodexProcessInspector({
      filesystem: {
        async readFile() { throw new Error('cmdline err') },
        async readdir() { throw new Error('readdir err') },
        async readlink() { throw new Error('exe err') },
      },
    })
    await expect(brokenInspector.inspect(42)).resolves.toBeNull()
  })
})
