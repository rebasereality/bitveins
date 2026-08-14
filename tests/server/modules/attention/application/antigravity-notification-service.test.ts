import { describe, expect, it, vi } from 'vitest'
import { AntigravityNotificationService } from '../../../../../server/modules/attention/application/antigravity-notification-service'
import type { AntigravityNotificationPreferenceRepository } from '../../../../../server/modules/attention/ports/antigravity-notification-preference-repository'
import { antigravityNotificationPreferenceSchema } from '../../../../../shared/contracts/attention'

class MemoryPreferences implements AntigravityNotificationPreferenceRepository {
  preference = antigravityNotificationPreferenceSchema.parse({})

  get = () => this.preference

  update = (patch: Partial<typeof this.preference>, _now: number) => {
    this.preference = { ...this.preference, ...patch }
    return this.preference
  }
}

const persistedEvent = {
  createdAt: '2026-08-04T07:00:00.000Z',
  id: 'evt_123456789012',
  source: 'antigravity' as const,
  title: 'Antigravity responded',
  type: 'completed' as const,
}

const ignoreResolutionError = () => {}

describe('AntigravityNotificationService', () => {
  it('resolves the linked session from the privacy-safe window id before persistence', async () => {
    const create = vi.fn().mockResolvedValue(persistedEvent)
    const findSessionNameByWindowId = vi.fn().mockResolvedValue('Bitveins')
    const service = new AntigravityNotificationService({
      attention: { createAntigravity: create },
      preferences: new MemoryPreferences(),
      reportResolutionError: ignoreResolutionError,
      windowSessions: { findSessionNameByWindowId },
    })

    await service.create({
      lifecycle: 'completed_with_tools',
      paneId: '%2710',
      source: 'antigravity',
      type: 'completed',
      windowId: '@2709',
    })

    expect(findSessionNameByWindowId).toHaveBeenCalledWith('@2709')
    expect(create).toHaveBeenCalledWith({
      paneId: '%2710',
      sessionName: 'Bitveins',
      source: 'antigravity',
      title: 'Antigravity turn completed',
      type: 'completed',
      windowId: '@2709',
    })
  })

  it('maps input_required lifecycle to input_required title and type', async () => {
    const create = vi.fn().mockResolvedValue(persistedEvent)
    const findSessionNameByWindowId = vi.fn().mockResolvedValue('Bitveins')
    const service = new AntigravityNotificationService({
      attention: { createAntigravity: create },
      preferences: new MemoryPreferences(),
      reportResolutionError: ignoreResolutionError,
      windowSessions: { findSessionNameByWindowId },
    })

    await service.create({
      lifecycle: 'input_required',
      paneId: '%1',
      source: 'antigravity',
      type: 'input_required',
      windowId: '@1',
    })

    expect(create).toHaveBeenCalledWith({
      paneId: '%1',
      sessionName: 'Bitveins',
      source: 'antigravity',
      title: 'Antigravity is waiting for input',
      type: 'input_required',
      windowId: '@1',
    })
  })

  it('maps failed lifecycle to failed title and type', async () => {
    const create = vi.fn().mockResolvedValue(persistedEvent)
    const findSessionNameByWindowId = vi.fn().mockResolvedValue('Bitveins')
    const service = new AntigravityNotificationService({
      attention: { createAntigravity: create },
      preferences: new MemoryPreferences(),
      reportResolutionError: ignoreResolutionError,
      windowSessions: { findSessionNameByWindowId },
    })

    await service.create({
      lifecycle: 'failed',
      paneId: '%1',
      source: 'antigravity',
      type: 'failed',
      windowId: '@1',
    })

    expect(create).toHaveBeenCalledWith({
      paneId: '%1',
      sessionName: 'Bitveins',
      source: 'antigravity',
      title: 'Antigravity turn failed',
      type: 'failed',
      windowId: '@1',
    })
  })

  it('suppresses events when disabled by preferences', async () => {
    const create = vi.fn().mockResolvedValue(persistedEvent)
    const preferences = new MemoryPreferences()
    preferences.preference.completedWithoutTools = false

    const service = new AntigravityNotificationService({
      attention: { createAntigravity: create },
      preferences,
      reportResolutionError: ignoreResolutionError,
      windowSessions: { findSessionNameByWindowId: vi.fn().mockResolvedValue('Bitveins') },
    })

    const result = await service.create({
      lifecycle: 'completed_without_tools',
      paneId: '%1',
      source: 'antigravity',
      type: 'completed',
      windowId: '@1',
    })

    expect(result).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('updates preferences through the service', () => {
    const preferences = new MemoryPreferences()
    const service = new AntigravityNotificationService({
      attention: { createAntigravity: vi.fn() },
      preferences,
      reportResolutionError: ignoreResolutionError,
      windowSessions: { findSessionNameByWindowId: vi.fn() },
    })

    const updated = service.updatePreference({ completedWithoutTools: true }, Date.now())
    expect(updated.completedWithoutTools).toBe(true)
    expect(service.getPreference().completedWithoutTools).toBe(true)
  })
})
