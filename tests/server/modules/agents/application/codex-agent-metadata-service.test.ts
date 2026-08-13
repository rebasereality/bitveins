import { describe, expect, it, vi } from 'vitest'
import {
  CodexAgentMetadataService,
  normalizeCodexThreadLabel,
} from '../../../../../server/modules/agents/application/codex-agent-metadata-service'

describe('CodexAgentMetadataService', () => {
  it('prefers the user-facing name and uses a hook-provided thread id', async () => {
    const read = vi.fn(async () => ({ name: ' Review agent ', preview: 'First prompt' }))
    const service = new CodexAgentMetadataService({
      processes: {
        inspect: async () => ({ executable: '/opt/codex', threadId: 'thread_old' }),
      },
      threads: { dispose() {}, read },
    })

    await expect(service.labelFor(42, 'thread_new')).resolves.toBe('Review agent')
    expect(read).toHaveBeenCalledWith('/opt/codex', 'thread_new')
  })

  it('falls back to a normalized first-message preview', async () => {
    const service = new CodexAgentMetadataService({
      processes: {
        inspect: async () => ({ executable: '/opt/codex', threadId: 'thread_123' }),
      },
      threads: {
        dispose() {},
        read: async () => ({ name: null, preview: '  Build\n the   sidebar  ' }),
      },
    })

    await expect(service.labelFor(42)).resolves.toBe('Build the sidebar')
  })

  it('falls back to the process thread id when a pane hint is stale', async () => {
    const read = vi.fn(async (_executable: string, threadId: string) => threadId === 'thread_current'
      ? { name: null, preview: 'Current Codex session' }
      : null)
    const service = new CodexAgentMetadataService({
      processes: {
        inspect: async () => ({ executable: '/opt/codex', threadId: 'thread_current' }),
      },
      threads: { dispose() {}, read },
    })

    await expect(service.labelFor(42, 'thread_stale')).resolves.toBe('Current Codex session')
    expect(read.mock.calls).toEqual([
      ['/opt/codex', 'thread_stale'],
      ['/opt/codex', 'thread_current'],
    ])
  })

  it('fails closed when process inspection or App Server lookup fails', async () => {
    const missing = new CodexAgentMetadataService({
      processes: { inspect: async () => null },
      threads: { dispose() {}, read: async () => ({ name: 'unused', preview: '' }) },
    })
    const failed = new CodexAgentMetadataService({
      processes: {
        inspect: async () => ({ executable: '/opt/codex', threadId: 'thread_123' }),
      },
      threads: { dispose() {}, read: async () => { throw new Error('offline') } },
    })

    await expect(missing.labelFor(42)).resolves.toBeNull()
    await expect(failed.labelFor(42)).resolves.toBeNull()
    expect(normalizeCodexThreadLabel('\n\t')).toBeNull()
    expect(normalizeCodexThreadLabel(42)).toBeNull()
  })

  it('does not query App Server without a discovered thread id', async () => {
    const read = vi.fn()
    const service = new CodexAgentMetadataService({
      processes: {
        inspect: async () => ({ executable: '/opt/codex', threadId: null }),
      },
      threads: { dispose() {}, read },
    })

    await expect(service.labelFor(42)).resolves.toBeNull()
    expect(read).not.toHaveBeenCalled()
  })
})
