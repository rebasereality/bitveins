import { describe, expect, it, vi } from 'vitest'
import { AttentionService } from '../../../../../server/modules/attention/application/attention-service'
import { HermesNotificationService } from '../../../../../server/modules/attention/application/hermes-notification-service'
import type { HermesNotificationPreferenceRepository } from '../../../../../server/modules/attention/ports/hermes-notification-preference-repository'
import { hermesNotificationPreferenceSchema } from '../../../../../shared/contracts/attention'

class MemoryPreferences implements HermesNotificationPreferenceRepository {
  preference = hermesNotificationPreferenceSchema.parse({})

  get = () => this.preference

  update = (patch: Partial<typeof this.preference>, _now: number) => {
    this.preference = { ...this.preference, ...patch }
    return this.preference
  }
}

const persistedEvent = {
  createdAt: '2026-08-04T07:00:00.000Z',
  id: 'evt_123456789012',
  source: 'hermes' as const,
  title: 'Hermes responded',
  type: 'completed' as const,
}

function resolvedWindowSessions() {
  return { findSessionNameByWindowId: vi.fn().mockResolvedValue('Bitveins') }
}

const ignoreResolutionError = () => {}

describe('HermesNotificationService', () => {
  it('resolves the linked session from the privacy-safe window id before persistence', async () => {
    const create = vi.fn().mockResolvedValue(persistedEvent)
    const findSessionNameByWindowId = vi.fn().mockResolvedValue('Bitveins')
    const service = new HermesNotificationService({
      attention: { createHermes: create },
      preferences: new MemoryPreferences(),
      reportResolutionError: ignoreResolutionError,
      windowSessions: { findSessionNameByWindowId },
    })

    await service.create({
      lifecycle: 'completed_with_tools',
      paneId: '%2710',
      source: 'hermes',
      type: 'completed',
      windowId: '@2709',
    })

    expect(findSessionNameByWindowId).toHaveBeenCalledWith('@2709')
    expect(create).toHaveBeenCalledWith({
      paneId: '%2710',
      sessionName: 'Bitveins',
      source: 'hermes',
      title: 'Hermes turn completed',
      type: 'completed',
      windowId: '@2709',
    })
  })

  it('suppresses the event when tmux context resolution fails', async () => {
    const create = vi.fn().mockResolvedValue(persistedEvent)
    const findSessionNameByWindowId = vi.fn().mockRejectedValue(new Error('tmux unavailable'))
    const reportResolutionError = vi.fn()
    const service = new HermesNotificationService({
      attention: { createHermes: create },
      preferences: new MemoryPreferences(),
      reportResolutionError,
      windowSessions: { findSessionNameByWindowId },
    })

    await expect(service.create({
      lifecycle: 'completed_with_tools',
      source: 'hermes',
      type: 'completed',
      windowId: '@2709',
    })).resolves.toBeNull()
    expect(findSessionNameByWindowId).toHaveBeenCalledWith('@2709')
    expect(reportResolutionError).toHaveBeenCalledOnce()
    expect(create).not.toHaveBeenCalled()
  })

  it('filters chat-only responses before persistence by default', async () => {
    const create = vi.fn()
    const service = new HermesNotificationService({
      attention: { createHermes: create },
      preferences: new MemoryPreferences(),
      reportResolutionError: ignoreResolutionError,
      windowSessions: resolvedWindowSessions(),
    })

    await expect(service.create({
      lifecycle: 'completed_without_tools',
      source: 'hermes',
      type: 'completed',
    })).resolves.toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('suppresses an enabled lifecycle without a routing signal', async () => {
    const preferences = new MemoryPreferences()
    preferences.update({ completedWithoutTools: true }, 100)
    const create = vi.fn().mockResolvedValue(persistedEvent)
    const service = new HermesNotificationService({
      attention: { createHermes: create },
      preferences,
      reportResolutionError: ignoreResolutionError,
      windowSessions: resolvedWindowSessions(),
    })

    await expect(service.create({
      lifecycle: 'completed_without_tools',
      source: 'hermes',
      type: 'completed',
    })).resolves.toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('keeps all previously supported lifecycle signals enabled by default', async () => {
    const create = vi.fn().mockResolvedValue(persistedEvent)
    const service = new HermesNotificationService({
      attention: { createHermes: create },
      preferences: new MemoryPreferences(),
      reportResolutionError: ignoreResolutionError,
      windowSessions: resolvedWindowSessions(),
    })

    for (const event of [
      { lifecycle: 'input_required', type: 'input_required' },
      { lifecycle: 'permission_required', type: 'permission_required' },
      { lifecycle: 'completed_with_tools', type: 'completed' },
      { lifecycle: 'failed', type: 'failed' },
    ] as const) {
      await expect(service.create({
        ...event,
        source: 'hermes',
        windowId: '@8',
      })).resolves.toEqual(persistedEvent)
    }
    expect(create).toHaveBeenCalledTimes(4)
  })

  it('persists and delivers an enabled lifecycle through the real AttentionService', async () => {
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
        list: vi.fn().mockReturnValue([]),
        markRead: vi.fn().mockReturnValue(null),
      },
    })
    const service = new HermesNotificationService({
      attention,
      preferences: new MemoryPreferences(),
      reportResolutionError: ignoreResolutionError,
      windowSessions: resolvedWindowSessions(),
    })

    await expect(service.create({
      lifecycle: 'completed_with_tools',
      source: 'hermes',
      type: 'completed',
      windowId: '@8',
      paneId: '%9',
    })).resolves.toMatchObject({
      id: 'evt_123456789012',
      sessionName: 'Bitveins',
      source: 'hermes',
      title: 'Hermes turn completed',
      type: 'completed',
    })
    expect(persist).toHaveBeenCalledOnce()
    expect(publish).toHaveBeenCalledOnce()
    expect(notify).toHaveBeenCalledOnce()
  })
})
