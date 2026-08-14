import type {
  AntigravityLifecycleEvent,
  AntigravityNotificationPreference,
  AntigravityNotificationPreferenceUpdate,
  AttentionEvent,
  CreateAntigravityAttentionEvent,
} from '#shared/contracts/attention'
import {
  antigravityLifecycleEventSchema,
  isAntigravityLifecycleEnabled,
} from '#shared/contracts/attention'
import type { AntigravityNotificationPreferenceRepository } from '../ports/antigravity-notification-preference-repository'

interface AttentionEventCreator {
  createAntigravity(input: CreateAntigravityAttentionEvent): Promise<AttentionEvent>
}

interface WindowSessionResolver {
  findSessionNameByWindowId(windowId: string): Promise<string | null>
}

function createAntigravityAttentionEvent(
  event: AntigravityLifecycleEvent,
  sessionName: string,
): CreateAntigravityAttentionEvent {
  const context = {
    paneId: event.paneId,
    sessionName,
    source: event.source,
    windowId: event.windowId,
  }
  switch (event.lifecycle) {
    case 'input_required':
      return { ...context, title: 'Antigravity is waiting for input', type: 'input_required' }
    case 'permission_required':
      return { ...context, title: 'Antigravity needs permission', type: 'permission_required' }
    case 'completed_with_tools':
    case 'completed_without_tools':
      return { ...context, title: 'Antigravity turn completed', type: 'completed' }
    case 'failed':
      return { ...context, title: 'Antigravity turn failed', type: 'failed' }
  }
}

export class AntigravityNotificationService {
  constructor(private readonly dependencies: {
    attention: AttentionEventCreator
    preferences: AntigravityNotificationPreferenceRepository
    reportResolutionError: (error: unknown) => void
    windowSessions: WindowSessionResolver
  }) {}

  async create(input: AntigravityLifecycleEvent): Promise<AttentionEvent | null> {
    const validated = antigravityLifecycleEventSchema.parse(input)
    if (!isAntigravityLifecycleEnabled(this.dependencies.preferences.get(), validated.lifecycle)) {
      return null
    }
    if (!validated.windowId) return null

    let sessionName: string | null
    try {
      sessionName = await this.dependencies.windowSessions
        .findSessionNameByWindowId(validated.windowId)
    }
    catch (error) {
      this.dependencies.reportResolutionError(error)
      return null
    }
    if (!sessionName) return null

    return this.dependencies.attention.createAntigravity(
      createAntigravityAttentionEvent(validated, sessionName),
    )
  }

  getPreference(): AntigravityNotificationPreference {
    return this.dependencies.preferences.get()
  }

  updatePreference(
    patch: AntigravityNotificationPreferenceUpdate,
    now: number,
  ): AntigravityNotificationPreference {
    return this.dependencies.preferences.update(patch, now)
  }
}
