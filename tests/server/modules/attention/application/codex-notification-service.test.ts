import { describe, expect, it, vi } from 'vitest'
import { AttentionService } from '../../../../../server/modules/attention/application/attention-service'
import { CodexNotificationService } from '../../../../../server/modules/attention/application/codex-notification-service'
import type { CodexNotificationPreferenceRepository } from '../../../../../server/modules/attention/ports/codex-notification-preference-repository'
import { codexNotificationPreferenceSchema } from '../../../../../shared/contracts/attention'

class MemoryPreferences implements CodexNotificationPreferenceRepository {
  preference = codexNotificationPreferenceSchema.parse({})

  get = () => this.preference

  update = (patch: Partial<typeof this.preference>, _now: number) => {
    this.preference = { ...this.preference, ...patch }
    return this.preference
  }
}

const persistedEvent = {
  createdAt: '2026-08-04T07:00:00.000Z',
  id: 'evt_123456789012',
  source: 'codex' as const,
  title: 'Codex turn completed' as const,
  type: 'completed' as const,
}

const ignoreResolutionError = () => {}

function resolvedWindowSessions() {
  return { findSessionNameByWindowId: vi.fn().mockResolvedValue('Bitveins') }
}

describe('CodexNotificationService', () => {
  it('resolves a linked session and creates a server-owned title', async () => {
    const create = vi.fn().mockResolvedValue(persistedEvent)
    const findSessionNameByWindowId = vi.fn().mockResolvedValue('Bitveins')
    const service = new CodexNotificationService({
      attention: { createCodex: create },
      preferences: new MemoryPreferences(),
      reportResolutionError: ignoreResolutionError,
      windowSessions: { findSessionNameByWindowId },
    })

    await service.create({
      lifecycle: 'permission_required',
      paneId: '%9',
      source: 'codex',
      type: 'permission_required',
      windowId: '@8',
    })

    expect(findSessionNameByWindowId).toHaveBeenCalledWith('@8')
    expect(create).toHaveBeenCalledWith({
      paneId: '%9',
      sessionName: 'Bitveins',
      source: 'codex',
      title: 'Codex needs permission',
      type: 'permission_required',
      windowId: '@8',
    })
  })

  it('suppresses disabled or unroutable lifecycle signals', async () => {
    const preferences = new MemoryPreferences()
    const create = vi.fn()
    const service = new CodexNotificationService({
      attention: { createCodex: create },
      preferences,
      reportResolutionError: ignoreResolutionError,
      windowSessions: resolvedWindowSessions(),
    })

    await expect(service.create({
      lifecycle: 'completed_without_tools',
      source: 'codex',
      type: 'completed',
      windowId: '@8',
    })).resolves.toBeNull()
    preferences.update({ completedWithoutTools: true }, 100)
    await expect(service.create({
      lifecycle: 'completed_without_tools',
      source: 'codex',
      type: 'completed',
    })).resolves.toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('suppresses tmux resolution failures without leaking the error', async () => {
    const reportResolutionError = vi.fn()
    const create = vi.fn()
    const service = new CodexNotificationService({
      attention: { createCodex: create },
      preferences: new MemoryPreferences(),
      reportResolutionError,
      windowSessions: {
        findSessionNameByWindowId: vi.fn().mockRejectedValue(new Error('private tmux failure')),
      },
    })

    await expect(service.create({
      lifecycle: 'completed_with_tools',
      source: 'codex',
      type: 'completed',
      windowId: '@8',
    })).resolves.toBeNull()
    expect(reportResolutionError).toHaveBeenCalledOnce()
    expect(create).not.toHaveBeenCalled()
  })

  it('persists and delivers an enabled lifecycle through AttentionService', async () => {
    const persist = vi.fn(event => event)
    const publish = vi.fn()
    const notify = vi.fn().mockResolvedValue(undefined)
    const attention = new AttentionService({
      createId: () => 'evt_123456789012',
      publisher: { publish },
      push: { notify },
      repository: {
        create: persist,
        dismiss: vi.fn().mockReturnValue(null),
        dismissAll: vi.fn().mockReturnValue([]),
        list: vi.fn().mockReturnValue([]),
        markRead: vi.fn().mockReturnValue(null),
      },
    })
    const service = new CodexNotificationService({
      attention,
      preferences: new MemoryPreferences(),
      reportResolutionError: ignoreResolutionError,
      windowSessions: resolvedWindowSessions(),
    })

    await expect(service.create({
      lifecycle: 'completed_with_tools',
      paneId: '%9',
      source: 'codex',
      type: 'completed',
      windowId: '@8',
    })).resolves.toMatchObject({
      id: 'evt_123456789012',
      sessionName: 'Bitveins',
      source: 'codex',
      title: 'Codex turn completed',
      type: 'completed',
    })
    expect(persist).toHaveBeenCalledOnce()
    expect(publish).toHaveBeenCalledOnce()
    expect(notify).toHaveBeenCalledOnce()
  })
})
